import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import type { ChunkCard, ContentPlan, ExploreHistoryItem, ExploreSourceMetadata, SourceSummaryRecord, SourceWorkspaceRecord } from '@/api/types'
import { analyzeTextStreaming, fetchUrl, getFileMetadata, getSourceWorkspaceSummary, openSourceWorkspace, parseDocument, planContent, upsertSourceDocument } from '@/api'
import { saveSourceMetadataRecord } from '@/lib/sourceMetadataRegistry'
import { reanalysisTextForCurrent } from '@/lib/exploreReanalysis'
import { compactExploreHistory, upsertExploreHistorySnapshot } from '@/lib/exploreHistory'

interface ExploreStore {
  sourceId: string | null
  sourceSummary: SourceSummaryRecord | null
  focusChunkIndex: number | null
  sourceOpenVersion: number
  text: string
  sourceName: string | null
  richHtml: string | null
  sourceUrl: string | null
  sourceMetadata: ExploreSourceMetadata | null
  chunkCards: ChunkCard[]
  contentPlan: ContentPlan | null
  analyzing: boolean
  parsing: boolean
  error: string | null
  savedChunkIds: Record<number, string>
  setText: (text: string) => void
  setRichContent: (html: string, text: string, url: string | null) => void
  parseFile: (filePath: string) => Promise<void>
  fetchUrlContent: (url: string) => Promise<void>
  openSourceById: (sourceId: string, focusChunkIndex?: number | null) => Promise<boolean>
  clearFocusChunk: () => void
  reanalyzeCurrent: () => Promise<void>
  reset: () => void
}

const LS_EXPLORE_HISTORY = 'explore-analysis-history-v1'
const MAX_ACTIVE_EXPLORE_HISTORY = 48

function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return '发生未知错误'
}

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

function coerceSourceKind(kind: string): ExploreSourceMetadata['kind'] {
  if (kind === 'file' || kind === 'webpage' || kind === 'paste') return kind
  return 'paste'
}

function metadataFromWorkspace(workspace: SourceWorkspaceRecord): ExploreSourceMetadata {
  const source = workspace.source
  const textLength = workspace.chunks.reduce((total, chunk) => total + characterCount(chunk.text), 0)
  const fallback: ExploreSourceMetadata = {
    kind: coerceSourceKind(source.kind),
    name: source.title ?? source.canonicalUri,
    path: source.kind === 'file' ? source.canonicalUri : null,
    url: source.kind === 'webpage' ? source.canonicalUri : null,
    sizeBytes: null,
    createdAt: source.createdAt,
    modifiedAt: source.updatedAt,
    characterCount: textLength,
    author: null,
    publishedAt: null,
    readingTime: null,
  }

  try {
    const parsed = JSON.parse(source.metadataJson) as Partial<ExploreSourceMetadata>
    return {
      ...fallback,
      ...parsed,
      kind: coerceSourceKind(parsed.kind ?? source.kind),
      characterCount: typeof parsed.characterCount === 'number' ? parsed.characterCount : fallback.characterCount,
    }
  } catch {
    return fallback
  }
}

function chunkToCard(chunk: SourceWorkspaceRecord['chunks'][number]): ChunkCard {
  const summary = chunk.text.length > 180 ? `${chunk.text.slice(0, 180)}...` : chunk.text
  return {
    index: chunk.chunkIndex,
    text: chunk.text,
    summary,
    hotTake: '',
    labels: [],
  }
}

function contentPlanFromWorkspace(workspace: SourceWorkspaceRecord): ContentPlan {
  const chunks = workspace.chunks.map((chunk, index) => ({
    id: chunk.id,
    index: chunk.chunkIndex,
    unitStart: index,
    unitEnd: index,
    headingPath: chunk.headingPath?.split(' > ').map(part => part.trim()).filter(Boolean) ?? [],
    text: chunk.text,
    estimatedTokens: 0,
    splitReason: 'natural_paragraph' as const,
  }))
  return {
    units: chunks.map((chunk, index) => ({
      index,
      kind: 'paragraph' as const,
      text: chunk.text,
      headingPath: chunk.headingPath,
      headingLevel: null,
      mediaUrl: null,
      caption: null,
    })),
    chunks,
  }
}

interface AutoAnalyzeOptions {
  html?: string | null
  sourceScope?: string | null
  contentPlan?: ContentPlan | null
}

async function autoAnalyze(
  set: (s: Partial<ExploreStore>) => void,
  content: string,
  sourceId: string | null,
  options: AutoAnalyzeOptions = {}
) {
  if (!content.trim()) return
  set({ analyzing: true, error: null, chunkCards: [] })
  let unlistenCard: (() => void) | null = null
  let unlistenDone: (() => void) | null = null
  let finished = false

  const settle = (failure?: unknown) => {
    if (finished) return false
    finished = true
    unlistenCard?.()
    unlistenDone?.()
    if (failure === undefined) {
      set({ analyzing: false })
      window.queueMicrotask(() => useExploreHistoryStore.getState().saveCurrent())
    } else {
      set({ analyzing: false, error: errorMessage(failure) })
    }
    return true
  }

  try {
    const planned = options.contentPlan?.chunks.length
      ? options.contentPlan
      : await planContent(content, options.html, options.sourceScope ?? sourceId)
    set({ contentPlan: planned.chunks.length > 0 ? planned : null })
    unlistenCard = await listen<ChunkCard>('chunk_card', (e) => {
      useExploreStore.setState((s) => {
        const next = [
          ...s.chunkCards.filter((card) => card.index !== e.payload.index),
          e.payload,
        ].sort((a, b) => a.index - b.index)
        return { chunkCards: next }
      })
    })
    unlistenDone = await listen('chunk_cards_done', () => settle())
    await analyzeTextStreaming(content, sourceId, planned)
    settle()
  } catch (e) {
    settle(e)
  }
}

export const useExploreStore = create<ExploreStore>((set, get) => ({
  sourceId: null,
  sourceSummary: null,
  focusChunkIndex: null,
  sourceOpenVersion: 0,
  text: '',
  sourceName: null,
  richHtml: null,
  sourceUrl: null,
  sourceMetadata: null,
  chunkCards: [],
  contentPlan: null,
  analyzing: false,
  parsing: false,
  error: null,
  savedChunkIds: {},
  setText: (text) => {
    const metadata = pasteMetadata(text)
    set({
      text,
      sourceId: null,
      sourceSummary: null,
      focusChunkIndex: null,
      sourceName: '粘贴文本',
      richHtml: null,
      sourceUrl: null,
      sourceMetadata: metadata,
      chunkCards: [],
      contentPlan: null,
      error: null,
    })
    saveSourceMetadataRecord('粘贴文本', metadata)
    void autoAnalyze(set, text, null)
  },
  setRichContent: (html, text, url) => {
    const sourceName = url ?? '粘贴网页内容'
    const metadata = webpageMetadata(sourceName, url, text)
    set({
      richHtml: html,
      text,
      sourceId: null,
      sourceSummary: null,
      focusChunkIndex: null,
      sourceName,
      sourceUrl: url,
      sourceMetadata: metadata,
      chunkCards: [],
      contentPlan: null,
      error: null,
    })
    saveSourceMetadataRecord(sourceName, metadata)
    void autoAnalyze(set, text, null, { html, sourceScope: url })
  },
  parseFile: async (filePath) => {
    set({ parsing: true, error: null, chunkCards: [], contentPlan: null, richHtml: null, sourceUrl: null, sourceMetadata: null, sourceId: null, sourceSummary: null, focusChunkIndex: null })
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
      const source = await upsertSourceDocument('file', metadata.filePath, metadata.fileName, sourceMetadata)
      set({
        sourceId: source.id,
        text,
        sourceName: metadata.fileName,
        sourceMetadata,
        parsing: false,
      })
      saveSourceMetadataRecord(metadata.fileName, sourceMetadata)
      await autoAnalyze(set, text, source.id, { sourceScope: source.id })
      const summary = await getSourceWorkspaceSummary(source.id)
      set({ sourceSummary: summary })
    } catch (e) {
      set({ parsing: false, error: errorMessage(e) })
    }
  },
  fetchUrlContent: async (url) => {
    set({ parsing: true, error: null, chunkCards: [], contentPlan: null, sourceId: null, sourceSummary: null, focusChunkIndex: null })
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
      const source = await upsertSourceDocument('webpage', sourceUrl, sourceName, metadata)
      set({
        sourceId: source.id,
        richHtml: page.html,
        text: content,
        sourceName,
        sourceUrl,
        sourceMetadata: metadata,
        contentPlan: page.contentPlan,
        parsing: false,
      })
      saveSourceMetadataRecord(sourceName, metadata)
      await autoAnalyze(set, content, source.id, {
        contentPlan: page.contentPlan,
        html: page.html,
        sourceScope: sourceUrl,
      })
      const summary = await getSourceWorkspaceSummary(source.id)
      set({ sourceSummary: summary })
    } catch (e) {
      set({ parsing: false, error: errorMessage(e) })
    }
  },
  openSourceById: async (sourceId, focusChunkIndex = null) => {
    set({ parsing: true, analyzing: false, error: null, chunkCards: [], contentPlan: null, focusChunkIndex: null })
    try {
      const workspace = await openSourceWorkspace(sourceId)
      if (!workspace) {
        set({ parsing: false, error: '未找到来源记录' })
        return false
      }
      const metadata = metadataFromWorkspace(workspace)
      const sourceName = workspace.source.title ?? metadata.name ?? workspace.source.canonicalUri
      const sourceUrl = workspace.source.kind === 'webpage' ? workspace.source.canonicalUri : metadata.url
      set((state) => ({
        sourceId: workspace.source.id,
        sourceSummary: workspace.source,
        focusChunkIndex,
        sourceOpenVersion: state.sourceOpenVersion + 1,
        text: '',
        richHtml: null,
        sourceName,
        sourceUrl,
        sourceMetadata: metadata,
        chunkCards: workspace.chunks.map(chunkToCard),
        contentPlan: contentPlanFromWorkspace(workspace),
        analyzing: false,
        parsing: false,
        error: null,
        savedChunkIds: {},
      }))
      saveSourceMetadataRecord(sourceName, metadata)
      return true
    } catch (e) {
      set({ parsing: false, error: errorMessage(e) })
      return false
    }
  },
  clearFocusChunk: () => set({ focusChunkIndex: null }),
  reanalyzeCurrent: async () => {
    const current = get()
    if (current.analyzing || current.parsing) return

    const historyItem = current.sourceId
      ? useExploreHistoryStore.getState().items.find((item) => item.sourceId === current.sourceId) ?? null
      : null
    const content = reanalysisTextForCurrent({
      currentText: current.text,
      historyText: historyItem?.text,
      chunkTexts: current.chunkCards.map((card) => card.text),
    })
    if (!content) return

    if (!current.text.trim()) {
      set({
        text: content,
        richHtml: current.richHtml ?? historyItem?.richHtml ?? null,
        error: null,
      })
    }

    await autoAnalyze(set, content, current.sourceId, {
      contentPlan: current.contentPlan,
      html: current.richHtml,
      sourceScope: current.sourceId ?? current.sourceUrl,
    })
    if (current.sourceId) {
      const summary = await getSourceWorkspaceSummary(current.sourceId)
      set({ sourceSummary: summary })
    }
  },
  reset: () => set({ sourceId: null, sourceSummary: null, focusChunkIndex: null, text: '', sourceName: null, richHtml: null, sourceUrl: null, sourceMetadata: null, chunkCards: [], contentPlan: null, analyzing: false, parsing: false, error: null, savedChunkIds: {} }),
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
      sourceId: current.sourceId,
      sourceName: current.sourceName,
      sourceUrl: current.sourceUrl,
      sourceMetadata: current.sourceMetadata,
      text: current.text,
      richHtml: current.richHtml,
      chunkCards: [...current.chunkCards].sort((a, b) => a.index - b.index),
      contentPlan: current.contentPlan,
      previewImage: firstImageFromHtml(current.richHtml),
      createdAt: now,
      updatedAt: now,
      archived: false,
    }
    saveSourceMetadataRecord(current.sourceName, current.sourceMetadata)
    const next = upsertExploreHistorySnapshot({
      items: get().items,
      item,
      maxActive: MAX_ACTIVE_EXPLORE_HISTORY,
    })
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
    ), MAX_ACTIVE_EXPLORE_HISTORY)
    persistExploreHistoryItems(next)
    set({ items: next })
  },
  activate: (id) => {
    const item = get().items.find((entry) => entry.id === id) ?? null
    if (!item) return null
    useExploreStore.setState({
      sourceId: item.sourceId ?? null,
      sourceSummary: null,
      focusChunkIndex: null,
      text: item.text,
      sourceName: item.sourceName,
      richHtml: item.richHtml,
      sourceUrl: item.sourceUrl,
      sourceMetadata: item.sourceMetadata ?? null,
      chunkCards: item.chunkCards,
      contentPlan: item.contentPlan ?? null,
      analyzing: false,
      parsing: false,
      error: null,
      savedChunkIds: {},
    })
    set((state) => ({ activeVersion: state.activeVersion + 1 }))
    return item
  },
}))
