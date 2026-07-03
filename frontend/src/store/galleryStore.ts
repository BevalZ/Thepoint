import { create } from 'zustand'
import type {
  GalleryImageMode,
  GalleryItem,
  GalleryKnowledgeContext,
  GalleryPromptPreview,
} from '@/api/types'
import {
  deleteGalleryItem,
  generateImageFromPrompt,
  listGallery,
  prepareGalleryImagePrompt,
  retryDownload,
} from '@/api'

let galleryJobSeq = 0

function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return '发生未知错误'
}

export interface GalleryLogEntry {
  id: string
  time: string
  level: 'info' | 'warn' | 'error'
  message: string
  detail?: string
}

interface GalleryStore {
  items: GalleryItem[]
  promptPreview: GalleryPromptPreview | null
  logs: GalleryLogEntry[]
  preparingPrompt: boolean
  generating: boolean
  error: string | null
  fetch: () => Promise<void>
  preparePrompt: (mode?: GalleryImageMode, knowledgeContexts?: GalleryKnowledgeContext[]) => Promise<GalleryPromptPreview>
  generateFromPrompt: (prompt: string) => Promise<GalleryItem>
  generate: () => Promise<GalleryItem>
  log: (entry: Omit<GalleryLogEntry, 'id' | 'time'>) => void
  clearLogs: () => void
  cancel: () => void
  remove: (id: string) => Promise<void>
  retry: (id: string) => Promise<void>
}

function compactGalleryItem(item: GalleryItem) {
  return [
    `id=${item.id}`,
    `status=${item.downloadStatus}`,
    `file=${item.filePath || 'empty'}`,
    `thumb=${item.thumbnailPath || 'empty'}`,
    `stars=${item.sourcePoints.length}`,
  ].join(' | ')
}

function galleryLogLine(message: string, detail?: string) {
  return detail ? `${message}：${detail}` : message
}

export const useGalleryStore = create<GalleryStore>((set, get) => ({
  items: [],
  promptPreview: null,
  logs: [],
  preparingPrompt: false,
  generating: false,
  error: null,
  log: (entry) => {
    const line: GalleryLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: new Date().toLocaleTimeString(),
      ...entry,
    }
    console[entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : 'log'](`[Gallery] ${galleryLogLine(entry.message, entry.detail)}`)
    set((state) => ({ logs: [line, ...state.logs].slice(0, 80) }))
  },
  clearLogs: () => set({ logs: [] }),
  fetch: async () => {
    get().log({ level: 'info', message: '读取画廊列表' })
    const items = await listGallery()
    get().log({ level: 'info', message: '画廊列表读取完成', detail: `${items.length} 张` })
    set({ items })
  },
  preparePrompt: async (mode = 'artwork', knowledgeContexts) => {
    if (get().preparingPrompt) {
      throw new Error('已有图片 Prompt 正在生成')
    }
    if (get().generating) {
      throw new Error('已有图片正在生成')
    }
    const jobId = ++galleryJobSeq
    set({ preparingPrompt: true, error: null })
    get().log({ level: 'info', message: '开始生成图片 Prompt', detail: `job=${jobId}，mode=${mode}` })
    try {
      const preview = await prepareGalleryImagePrompt(mode, knowledgeContexts)
      if (jobId !== galleryJobSeq) throw new Error('已取消')
      get().log({ level: 'info', message: '图片 Prompt 生成完成', detail: `${preview.mode}，${preview.pointIds.length} 个 star，${preview.prompt.length} 字` })
      set({ promptPreview: preview, preparingPrompt: false })
      return preview
    } catch (e) {
      if (jobId === galleryJobSeq) {
        const message = errorMessage(e)
        get().log({ level: 'error', message: '图片 Prompt 生成失败', detail: message })
        set({ preparingPrompt: false, error: message })
      }
      throw e
    }
  },
  generateFromPrompt: async (prompt) => {
    const preview = get().promptPreview
    if (!preview) throw new Error('请先生成图片 Prompt')
    if (get().generating) throw new Error('已有图片正在生成')
    const jobId = ++galleryJobSeq
    set({ generating: true, error: null })
    get().log({ level: 'info', message: '开始调用图片模型', detail: `job=${jobId}，prompt=${prompt.length} 字` })
    try {
      const item = await generateImageFromPrompt(prompt, preview.pointIds, preview.sourcePoints)
      if (jobId !== galleryJobSeq) throw new Error('已取消')
      get().log({ level: 'info', message: '图片模型返回并保存完成', detail: compactGalleryItem(item) })
      set((s) => ({ items: [item, ...s.items], generating: false }))
      return item
    } catch (e) {
      if (jobId === galleryJobSeq) {
        const message = errorMessage(e)
        get().log({ level: 'error', message: '图片生成失败', detail: message })
        set({ generating: false, error: message })
      }
      throw e
    }
  },
  generate: async () => {
    const preview = await get().preparePrompt()
    return get().generateFromPrompt(preview.prompt)
  },
  cancel: () => {
    galleryJobSeq += 1
    get().log({ level: 'warn', message: '取消当前生图任务', detail: `nextJob=${galleryJobSeq}` })
    set({ preparingPrompt: false, generating: false, promptPreview: null })
  },
  remove: async (id) => {
    get().log({ level: 'warn', message: '删除画廊图片', detail: id })
    await deleteGalleryItem(id)
    set((s) => ({ items: s.items.filter(i => i.id !== id) }))
  },
  retry: async (id) => {
    get().log({ level: 'info', message: '重新下载/生成图片文件', detail: id })
    const item = await retryDownload(id)
    get().log({ level: 'info', message: '重新下载/生成完成', detail: compactGalleryItem(item) })
    set((s) => ({ items: s.items.map(i => i.id === id ? item : i) }))
  },
}))
