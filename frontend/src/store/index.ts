import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import type {
  AppConfig,
  ChunkCard,
  ConfigProfile,
  DeepenAction,
  ExtractedPoint,
  ExploreHistoryItem,
  ExploreSourceMetadata,
  FrameworkRecommendation,
  GalleryImageMode,
  GalleryKnowledgeContext,
  GalleryPromptPreview,
  MentalModel,
  StoredPoint,
} from '@/api/types'
import {
  getConfig,
  setConfig,
  parseDocument,
  getFileMetadata,
  analyzeTextStreaming,
  listPoints,
  deletePoint,
  archivePoint,
  unarchivePoint,
  listArchivedPoints,
  listMentalModels,
  recommendFrameworks,
  deepenPoint,
  findSimilar,
  getProfiles,
  setProfiles,
  fetchUrl,
  saveManualPoint,
  starPoint,
  unstarPoint,
  listStarredPoints,
  prepareGalleryImagePrompt,
  generateImageFromPrompt,
  listGallery,
  deleteGalleryItem,
  retryDownload,
  saveFactCheckPoint,
} from '@/api'
import type { GalleryItem } from '@/api/types'
import { saveSourceMetadataRecord } from '@/lib/sourceMetadataRegistry'

interface ConfigStore {
  config: AppConfig | null
  loaded: boolean
  profiles: ConfigProfile[]
  fetchConfig: () => Promise<void>
  saveConfig: (config: AppConfig) => Promise<void>
  loadProfiles: () => Promise<void>
  saveProfiles: (profiles: ConfigProfile[]) => Promise<void>
}

export const useConfigStore = create<ConfigStore>((set) => ({
  config: null,
  loaded: false,
  profiles: [],
  fetchConfig: async () => {
    const config = await getConfig()
    set({ config, loaded: true })
  },
  saveConfig: async (config) => {
    await setConfig(config)
    set({ config })
  },
  loadProfiles: async () => {
    const profiles = await getProfiles()
    set({ profiles })
  },
  saveProfiles: async (profiles) => {
    await setProfiles(profiles)
    set({ profiles })
  },
}))

interface ExploreStore {
  text: string
  sourceName: string | null
  richHtml: string | null
  sourceUrl: string | null
  sourceMetadata: ExploreSourceMetadata | null
  chunkCards: ChunkCard[]
  analyzing: boolean
  parsing: boolean
  error: string | null
  /** index → saved point id (set when user stars a chunk) */
  savedChunkIds: Record<number, string>
  setText: (text: string) => void
  setRichContent: (html: string, text: string, url: string | null) => void
  parseFile: (filePath: string) => Promise<void>
  fetchUrlContent: (url: string) => Promise<void>
  reanalyzeCurrent: () => Promise<void>
  reset: () => void
}

const LS_EXPLORE_HISTORY = 'explore-analysis-history-v1'
const MAX_ACTIVE_EXPLORE_HISTORY = 48

function loadExploreHistoryItems(): ExploreHistoryItem[] {
  try {
    const raw = localStorage.getItem(LS_EXPLORE_HISTORY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isExploreHistoryItem)
  } catch {
    return []
  }
}

function isExploreHistoryItem(item: unknown): item is ExploreHistoryItem {
  if (!item || typeof item !== 'object') return false
  const value = item as Partial<ExploreHistoryItem>
  return typeof value.id === 'string'
    && typeof value.text === 'string'
    && Array.isArray(value.chunkCards)
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string'
    && typeof value.archived === 'boolean'
}

function persistExploreHistoryItems(items: ExploreHistoryItem[]) {
  try {
    localStorage.setItem(LS_EXPLORE_HISTORY, JSON.stringify(items))
  } catch {
    // Keep the UI responsive even when storage quota is full.
  }
}

function compactExploreHistory(items: ExploreHistoryItem[]): ExploreHistoryItem[] {
  const archived = items.filter((item) => item.archived)
  const active = items
    .filter((item) => !item.archived)
    .slice(0, MAX_ACTIVE_EXPLORE_HISTORY)
  return [...active, ...archived]
}

function newHistoryId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function firstImageFromHtml(html: string | null): string | null {
  if (!html || typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.querySelector('img[src]')?.getAttribute('src') ?? null
}

function characterCount(text: string): number {
  return Array.from(text).length
}

function pasteMetadata(text: string): ExploreSourceMetadata {
  return {
    kind: 'paste',
    name: '粘贴文本',
    path: null,
    url: null,
    sizeBytes: null,
    createdAt: null,
    modifiedAt: null,
    characterCount: characterCount(text),
    author: null,
    publishedAt: null,
    readingTime: null,
  }
}

function webpageMetadata(
  name: string | null,
  url: string | null,
  text: string,
  extra?: Pick<ExploreSourceMetadata, 'author' | 'publishedAt' | 'readingTime'>
): ExploreSourceMetadata {
  return {
    kind: url ? 'webpage' : 'paste',
    name,
    path: null,
    url,
    sizeBytes: null,
    createdAt: null,
    modifiedAt: null,
    characterCount: characterCount(text),
    author: extra?.author ?? null,
    publishedAt: extra?.publishedAt ?? null,
    readingTime: extra?.readingTime ?? null,
  }
}

async function autoAnalyze(set: (s: Partial<ExploreStore>) => void, content: string) {
  if (!content.trim()) return
  set({ analyzing: true, error: null, chunkCards: [] })
  try {
    const unlistenCard = await listen<ChunkCard>('chunk_card', (e) => {
      useExploreStore.setState((s) => {
        const next = [
          ...s.chunkCards.filter((card) => card.index !== e.payload.index),
          e.payload,
        ].sort((a, b) => a.index - b.index)
        return { chunkCards: next }
      })
    })
    const unlistenDone = await listen('chunk_cards_done', () => {
      set({ analyzing: false })
      window.queueMicrotask(() => useExploreHistoryStore.getState().saveCurrent())
      unlistenCard()
      unlistenDone()
    })
    await analyzeTextStreaming(content)
  } catch (e) {
    set({ analyzing: false, error: errorMessage(e) })
  }
}

export const useExploreStore = create<ExploreStore>((set, get) => ({
  text: '',
  sourceName: null,
  richHtml: null,
  sourceUrl: null,
  sourceMetadata: null,
  chunkCards: [],
  analyzing: false,
  parsing: false,
  error: null,
  savedChunkIds: {},
  setText: (text) => {
    const metadata = pasteMetadata(text)
    set({
      text,
      sourceName: '粘贴文本',
      richHtml: null,
      sourceUrl: null,
      sourceMetadata: metadata,
      chunkCards: [],
      error: null,
    })
    saveSourceMetadataRecord('粘贴文本', metadata)
    autoAnalyze(set, text)
  },
  setRichContent: (html, text, url) => {
    const sourceName = url ?? '粘贴网页内容'
    const metadata = webpageMetadata(sourceName, url, text)
    set({
      richHtml: html,
      text,
      sourceName,
      sourceUrl: url,
      sourceMetadata: metadata,
      chunkCards: [],
      error: null,
    })
    saveSourceMetadataRecord(sourceName, metadata)
    autoAnalyze(set, text)
  },
  parseFile: async (filePath) => {
    set({ parsing: true, error: null, chunkCards: [], richHtml: null, sourceUrl: null, sourceMetadata: null })
    try {
      const text = await parseDocument(filePath)
      const metadata = await getFileMetadata(filePath)
      const sourceMetadata: ExploreSourceMetadata = {
        kind: 'file',
        name: metadata.fileName,
        path: metadata.filePath,
        url: null,
        sizeBytes: metadata.sizeBytes,
        createdAt: metadata.createdAt,
        modifiedAt: metadata.modifiedAt,
        characterCount: characterCount(text),
        author: null,
        publishedAt: null,
        readingTime: null,
      }
      set({
        text,
        sourceName: metadata.fileName,
        sourceMetadata,
        parsing: false,
      })
      saveSourceMetadataRecord(metadata.fileName, sourceMetadata)
      await autoAnalyze(set, text)
    } catch (e) {
      set({ parsing: false, error: errorMessage(e) })
    }
  },
  fetchUrlContent: async (url) => {
    set({ parsing: true, error: null, chunkCards: [] })
    try {
      const page = await fetchUrl(url)
      const content = page.text
      const sourceUrl = page.url ?? url
      const sourceName = page.title ?? sourceUrl
      const metadata = webpageMetadata(sourceName, sourceUrl, content, {
        author: page.author,
        publishedAt: page.publishedAt,
        readingTime: page.readingTime,
      })
      set({
        richHtml: page.html,
        text: content,
        sourceName,
        sourceUrl,
        sourceMetadata: metadata,
        parsing: false,
      })
      saveSourceMetadataRecord(sourceName, metadata)
      await autoAnalyze(set, content)
    } catch (e) {
      set({ parsing: false, error: errorMessage(e) })
    }
  },
  reanalyzeCurrent: async () => {
    const current = get()
    if (!current.text.trim() || current.analyzing || current.parsing) return
    await autoAnalyze(set, current.text)
  },
  reset: () => set({ text: '', sourceName: null, richHtml: null, sourceUrl: null, sourceMetadata: null, chunkCards: [], analyzing: false, parsing: false, error: null, savedChunkIds: {} }),
}))

interface ExploreHistoryStore {
  items: ExploreHistoryItem[]
  activeVersion: number
  saveCurrent: () => void
  remove: (id: string) => void
  archive: (id: string) => void
  unarchive: (id: string) => void
  activate: (id: string) => ExploreHistoryItem | null
}

export const useExploreHistoryStore = create<ExploreHistoryStore>((set, get) => ({
  items: loadExploreHistoryItems(),
  activeVersion: 0,
  saveCurrent: () => {
    const current = useExploreStore.getState()
    if (!current.text.trim() || current.chunkCards.length === 0) return
    const now = new Date().toISOString()
    const item: ExploreHistoryItem = {
      id: newHistoryId(),
      sourceName: current.sourceName,
      sourceUrl: current.sourceUrl,
      sourceMetadata: current.sourceMetadata,
      text: current.text,
      richHtml: current.richHtml,
      chunkCards: [...current.chunkCards].sort((a, b) => a.index - b.index),
      previewImage: firstImageFromHtml(current.richHtml),
      createdAt: now,
      updatedAt: now,
      archived: false,
    }
    saveSourceMetadataRecord(current.sourceName, current.sourceMetadata)
    const next = compactExploreHistory([item, ...get().items])
    persistExploreHistoryItems(next)
    set({ items: next })
  },
  remove: (id) => {
    const next = get().items.filter((item) => item.id !== id)
    persistExploreHistoryItems(next)
    set({ items: next })
  },
  archive: (id) => {
    const next = get().items.map((item) =>
      item.id === id ? { ...item, archived: true, updatedAt: new Date().toISOString() } : item
    )
    persistExploreHistoryItems(next)
    set({ items: next })
  },
  unarchive: (id) => {
    const next = compactExploreHistory(get().items.map((item) =>
      item.id === id ? { ...item, archived: false, updatedAt: new Date().toISOString() } : item
    ))
    persistExploreHistoryItems(next)
    set({ items: next })
  },
  activate: (id) => {
    const item = get().items.find((entry) => entry.id === id) ?? null
    if (!item) return null
    useExploreStore.setState({
      text: item.text,
      sourceName: item.sourceName,
      richHtml: item.richHtml,
      sourceUrl: item.sourceUrl,
      sourceMetadata: item.sourceMetadata ?? null,
      chunkCards: item.chunkCards,
      analyzing: false,
      parsing: false,
      error: null,
      savedChunkIds: {},
    })
    set((state) => ({ activeVersion: state.activeVersion + 1 }))
    return item
  },
}))


interface LibraryStore {
  points: StoredPoint[]
  archivedPoints: StoredPoint[]
  loading: boolean
  error: string | null
  deepening: Record<string, boolean>
  expanded: Record<string, boolean>
  similar: Record<string, StoredPoint[]>
  fetch: () => Promise<void>
  fetchArchived: () => Promise<void>
  archivePoint: (id: string) => Promise<void>
  unarchivePoint: (id: string) => Promise<void>
  toggleExpanded: (pointId: string) => void
  deepen: (point: StoredPoint, action: DeepenAction, frameworkKey?: string) => Promise<void>
  addManualThought: (point: StoredPoint, content: string) => Promise<void>
  addFactCheck: (point: StoredPoint, content: string) => Promise<void>
  findSimilarFor: (point: StoredPoint) => Promise<StoredPoint[]>
  deletePoint: (id: string) => Promise<void>
  archiveMany: (ids: string[]) => Promise<void>
  deleteMany: (rootIds: string[]) => Promise<void>
}

/** Collect a set of point ids plus all their descendant ids from a flat list. */
function collectSubtreeIds(points: StoredPoint[], rootIds: string[]): Set<string> {
  const ids = new Set<string>()
  const collect = (targetId: string) => {
    ids.add(targetId)
    for (const p of points) if (p.parentId === targetId) collect(p.id)
  }
  rootIds.forEach(collect)
  return ids
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  points: [],
  archivedPoints: [],
  loading: false,
  error: null,
  deepening: {},
  expanded: {},
  similar: {},
  fetch: async () => {
    set({ loading: true, error: null })
    try {
      const points = await listPoints()
      set({ points, loading: false })
    } catch (e) {
      set({ loading: false, error: errorMessage(e) })
    }
  },
  fetchArchived: async () => {
    try {
      const archivedPoints = await listArchivedPoints()
      set({ archivedPoints })
    } catch (e) {
      set({ error: errorMessage(e) })
    }
  },
  archivePoint: async (id) => {
    await archivePoint(id)
    set((s) => ({ points: s.points.filter(p => p.id !== id) }))
  },
  unarchivePoint: async (id) => {
    await unarchivePoint(id)
    set((s) => ({ archivedPoints: s.archivedPoints.filter(p => p.id !== id) }))
  },
  toggleExpanded: (pointId) =>
    set((s) => ({
      expanded: { ...s.expanded, [pointId]: !s.expanded[pointId] },
    })),
  deepen: async (point, action, frameworkKey) => {
    if (get().deepening[point.id]) return
    set((s) => ({
      deepening: { ...s.deepening, [point.id]: true },
      error: null,
    }))
    try {
      const children = await deepenPoint(
        point.id,
        point.content,
        action,
        frameworkKey ?? null
      )
      set((s) => ({
        points: [...s.points, ...children],
        expanded: { ...s.expanded, [point.id]: true },
        deepening: { ...s.deepening, [point.id]: false },
      }))
    } catch (e) {
      set((s) => ({
        deepening: { ...s.deepening, [point.id]: false },
        error: errorMessage(e),
      }))
    }
  },
  addManualThought: async (point, content) => {
    const trimmed = content.trim()
    if (!trimmed || get().deepening[point.id]) return
    set((s) => ({
      deepening: { ...s.deepening, [point.id]: true },
      error: null,
    }))
    try {
      const children = await saveManualPoint(point.id, trimmed)
      set((s) => ({
        points: [...s.points, ...children],
        expanded: { ...s.expanded, [point.id]: true },
        deepening: { ...s.deepening, [point.id]: false },
      }))
    } catch (e) {
      set((s) => ({
        deepening: { ...s.deepening, [point.id]: false },
        error: errorMessage(e),
      }))
      throw e
    }
  },
  addFactCheck: async (point, content) => {
    const trimmed = content.trim()
    if (!trimmed || get().deepening[point.id]) return
    set((s) => ({
      deepening: { ...s.deepening, [point.id]: true },
      error: null,
    }))
    try {
      const children = await saveFactCheckPoint(point.id, trimmed)
      set((s) => ({
        points: [...s.points, ...children],
        expanded: { ...s.expanded, [point.id]: true },
        deepening: { ...s.deepening, [point.id]: false },
      }))
    } catch (e) {
      set((s) => ({
        deepening: { ...s.deepening, [point.id]: false },
        error: errorMessage(e),
      }))
      throw e
    }
  },
  findSimilarFor: async (point) => {
    if (get().deepening[point.id]) return get().similar[point.id] ?? []
    set((s) => ({
      deepening: { ...s.deepening, [point.id]: true },
      error: null,
    }))
    try {
      const matches = await findSimilar(point.id, point.content)
      set((s) => ({
        similar: { ...s.similar, [point.id]: matches },
        deepening: { ...s.deepening, [point.id]: false },
      }))
      return matches
    } catch (e) {
      set((s) => ({
        deepening: { ...s.deepening, [point.id]: false },
        error: errorMessage(e),
      }))
      return []
    }
  },
  deletePoint: async (id) => {
    await deletePoint(id)
    const toRemove = collectSubtreeIds(get().points, [id])
    set((s) => ({ points: s.points.filter(p => !toRemove.has(p.id)) }))
    await useStarStore.getState().init()
  },
  archiveMany: async (ids) => {
    // Sequential to avoid SQLite write-lock contention; reuses single-point command.
    for (const id of ids) await archivePoint(id)
    const idSet = new Set(ids)
    set((s) => ({ points: s.points.filter(p => !idSet.has(p.id)) }))
  },
  deleteMany: async (rootIds) => {
    // delete_point cascades to descendants in DB; sequential to avoid write locks.
    for (const id of rootIds) await deletePoint(id)
    const toRemove = collectSubtreeIds(get().points, rootIds)
    set((s) => ({ points: s.points.filter(p => !toRemove.has(p.id)) }))
    await useStarStore.getState().init()
  },
}))

interface DeepenStore {
  mentalModels: MentalModel[]
  modelsLoaded: boolean
  recommendations: Record<string, FrameworkRecommendation[]>
  recommending: Record<string, boolean>
  fetchMentalModels: () => Promise<void>
  fetchRecommendations: (point: StoredPoint) => Promise<void>
}

export const useDeepenStore = create<DeepenStore>((set, get) => ({
  mentalModels: [],
  modelsLoaded: false,
  recommendations: {},
  recommending: {},
  fetchMentalModels: async () => {
    try {
      const mentalModels = await listMentalModels()
      set({ mentalModels, modelsLoaded: true })
    } catch {
      // non-fatal: the "其他" panel just stays empty
    }
  },
  fetchRecommendations: async (point) => {
    if (get().recommending[point.id]) return
    set((s) => ({
      recommending: { ...s.recommending, [point.id]: true },
    }))
    try {
      const recs = await recommendFrameworks(point.content)
      set((s) => ({
        recommendations: { ...s.recommendations, [point.id]: recs },
        recommending: { ...s.recommending, [point.id]: false },
      }))
    } catch {
      set((s) => ({
        recommending: { ...s.recommending, [point.id]: false },
      }))
    }
  },
}))

function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return '发生未知错误'
}

// ── Gallery store ────────────────────────────────────────────────────────────

let galleryJobSeq = 0

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

export interface GalleryLogEntry {
  id: string
  time: string
  level: 'info' | 'warn' | 'error'
  message: string
  detail?: string
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

// ── Star store ───────────────────────────────────────────────────────────────

interface StarStore {
  count: number
  points: StoredPoint[]
  init: () => Promise<void>
  star: (pointId: string) => Promise<void>
  unstar: (pointId: string) => Promise<void>
  clear: () => Promise<void>
}

export const useStarStore = create<StarStore>((set, get) => ({
  count: 0,
  points: [],
  init: async () => {
    const points = await listStarredPoints()
    set({ count: points.length, points })
  },
  star: async (pointId) => {
    const count = await starPoint(pointId)
    const points = await listStarredPoints()
    set({ count, points })
  },
  unstar: async (pointId) => {
    const count = await unstarPoint(pointId)
    const points = await listStarredPoints()
    set({ count, points })
  },
  clear: async () => {
    const points = [...get().points]
    for (const point of points) {
      await unstarPoint(point.id)
    }
    set({ count: 0, points: [] })
  },
}))

// ── Theme store ──────────────────────────────────────────────────────────────

export type ThemeMode = 'dark' | 'light' | 'system'

const ACCENT_PRESETS = ['#6366f1','#ec4899','#f97316','#22c55e','#06b6d4','#a855f7']

const LS_THEME      = 'app-theme-mode'
const LS_ACCENT     = 'app-accent-color'
const LS_UI_FONT    = 'app-ui-font'
const LS_FONT_SIZE  = 'app-font-size'
const LS_CODE_FONT  = 'app-code-font'

export type FontSize = 'sm' | 'md' | 'lg'

export const UI_FONTS = [
  { key: 'noto',   label: 'Noto Serif SC', value: "'Noto Serif SC', system-ui, sans-serif" },
  { key: 'monaco', label: 'Monaco',        value: "'Monaco', system-ui, sans-serif" },
  { key: 'system', label: '系统默认',      value: "system-ui, -apple-system, sans-serif" },
] as const
export type UiFontKey = typeof UI_FONTS[number]['key']

export const CODE_FONTS = [
  { key: 'monaco',  label: 'Monaco',          value: "'Monaco', ui-monospace, monospace" },
  { key: 'jetbrains', label: 'JetBrains Mono', value: "'JetBrains Mono', ui-monospace, monospace" },
  { key: 'fira',    label: 'Fira Code',        value: "'Fira Code', ui-monospace, monospace" },
  { key: 'system',  label: '系统默认',         value: "ui-monospace, monospace" },
] as const
export type CodeFontKey = typeof CODE_FONTS[number]['key']

const FONT_SIZE_MAP: Record<FontSize, string> = { sm: '13px', md: '15px', lg: '17px' }

interface ThemeStore {
  mode: ThemeMode
  accent: string
  accentPresets: string[]
  uiFont: UiFontKey
  codeFont: CodeFontKey
  fontSize: FontSize
  setMode:      (mode: ThemeMode)    => void
  setAccent:    (color: string)      => void
  setUiFont:    (key: UiFontKey)     => void
  setCodeFont:  (key: CodeFontKey)   => void
  setFontSize:  (size: FontSize)     => void
}

function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function applyTheme(mode: ThemeMode, accent: string, uiFont: UiFontKey, codeFont: CodeFontKey, fontSize: FontSize) {
  const root = document.documentElement
  if (resolveMode(mode) === 'light') root.classList.add('light')
  else root.classList.remove('light')
  root.style.setProperty('--color-accent', accent)
  root.style.setProperty('--font-ui', UI_FONTS.find(f => f.key === uiFont)!.value)
  root.style.setProperty('--font-code', CODE_FONTS.find(f => f.key === codeFont)!.value)
  root.style.setProperty('--font-size-base', FONT_SIZE_MAP[fontSize])
}

export const useThemeStore = create<ThemeStore>((set) => {
  const mode     = (localStorage.getItem(LS_THEME)     ?? 'dark')   as ThemeMode
  const accent   =  localStorage.getItem(LS_ACCENT)    ?? '#6366f1'
  const uiFont   = (localStorage.getItem(LS_UI_FONT)   ?? 'noto')   as UiFontKey
  const codeFont = (localStorage.getItem(LS_CODE_FONT) ?? 'monaco') as CodeFontKey
  const fontSize = (localStorage.getItem(LS_FONT_SIZE) ?? 'md')     as FontSize
  applyTheme(mode, accent, uiFont, codeFont, fontSize)

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    const s = useThemeStore.getState()
    if (s.mode === 'system') applyTheme('system', s.accent, s.uiFont, s.codeFont, s.fontSize)
  })

  return {
    mode, accent, uiFont, codeFont, fontSize,
    accentPresets: ACCENT_PRESETS,
    setMode: (mode) => {
      localStorage.setItem(LS_THEME, mode); set({ mode })
      const s = useThemeStore.getState()
      applyTheme(mode, s.accent, s.uiFont, s.codeFont, s.fontSize)
    },
    setAccent: (accent) => {
      localStorage.setItem(LS_ACCENT, accent); set({ accent })
      const s = useThemeStore.getState()
      applyTheme(s.mode, accent, s.uiFont, s.codeFont, s.fontSize)
    },
    setUiFont: (uiFont) => {
      localStorage.setItem(LS_UI_FONT, uiFont); set({ uiFont })
      const s = useThemeStore.getState()
      applyTheme(s.mode, s.accent, uiFont, s.codeFont, s.fontSize)
    },
    setCodeFont: (codeFont) => {
      localStorage.setItem(LS_CODE_FONT, codeFont); set({ codeFont })
      const s = useThemeStore.getState()
      applyTheme(s.mode, s.accent, s.uiFont, codeFont, s.fontSize)
    },
    setFontSize: (fontSize) => {
      localStorage.setItem(LS_FONT_SIZE, fontSize); set({ fontSize })
      const s = useThemeStore.getState()
      applyTheme(s.mode, s.accent, s.uiFont, s.codeFont, fontSize)
    },
  }
})
