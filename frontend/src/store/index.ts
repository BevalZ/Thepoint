import { create } from 'zustand'
import { listen } from '@tauri-apps/api/event'
import type {
  AppConfig,
  ChunkCard,
  ConfigProfile,
  DeepenAction,
  ExtractedPoint,
  FrameworkRecommendation,
  MentalModel,
  StoredPoint,
} from '@/api/types'
import {
  getConfig,
  setConfig,
  parseDocument,
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
  starPoint,
  unstarPoint,
  getStarredCount,
  // TODO(gallery): re-enable when AI gallery feature is ready
  // generateImage,
  listGallery,
  deleteGalleryItem,
  retryDownload,
} from '@/api'
import type { GalleryItem } from '@/api/types'

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
  reset: () => void
}

async function autoAnalyze(set: (s: Partial<ExploreStore>) => void, content: string) {
  if (!content.trim()) return
  set({ analyzing: true, error: null, chunkCards: [] })
  try {
    const unlistenCard = await listen<ChunkCard>('chunk_card', (e) => {
      useExploreStore.setState((s) => ({ chunkCards: [...s.chunkCards, e.payload] }))
    })
    const unlistenDone = await listen('chunk_cards_done', () => {
      set({ analyzing: false })
      unlistenCard()
      unlistenDone()
    })
    await analyzeTextStreaming(content)
  } catch (e) {
    set({ analyzing: false, error: errorMessage(e) })
  }
}

export const useExploreStore = create<ExploreStore>((set) => ({
  text: '',
  sourceName: null,
  richHtml: null,
  sourceUrl: null,
  chunkCards: [],
  analyzing: false,
  parsing: false,
  error: null,
  savedChunkIds: {},
  setText: (text) => set({ text, richHtml: null, sourceUrl: null }),
  setRichContent: (html, text, url) => {
    set({ richHtml: html, text, sourceUrl: url, chunkCards: [], error: null })
    autoAnalyze(set, text)
  },
  parseFile: async (filePath) => {
    set({ parsing: true, error: null, chunkCards: [], richHtml: null, sourceUrl: null })
    try {
      const text = await parseDocument(filePath)
      const sourceName = filePath.split(/[\\/]/).pop() ?? filePath
      set({ text, sourceName, parsing: false })
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
      set({ richHtml: page.html, text: content, sourceName: page.title ?? url, sourceUrl: url, parsing: false })
      await autoAnalyze(set, content)
    } catch (e) {
      set({ parsing: false, error: errorMessage(e) })
    }
  },
  reset: () => set({ text: '', sourceName: null, richHtml: null, sourceUrl: null, chunkCards: [], analyzing: false, parsing: false, error: null, savedChunkIds: {} }),
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
  findSimilarFor: (point: StoredPoint) => Promise<void>
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
  findSimilarFor: async (point) => {
    if (get().deepening[point.id]) return
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
    } catch (e) {
      set((s) => ({
        deepening: { ...s.deepening, [point.id]: false },
        error: errorMessage(e),
      }))
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
    if (get().modelsLoaded) return
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

interface GalleryStore {
  items: GalleryItem[]
  generating: boolean
  error: string | null
  fetch: () => Promise<void>
  generate: () => Promise<GalleryItem>
  remove: (id: string) => Promise<void>
  retry: (id: string) => Promise<void>
}

export const useGalleryStore = create<GalleryStore>((set) => ({
  items: [],
  generating: false,
  error: null,
  fetch: async () => {
    const items = await listGallery()
    set({ items })
  },
  generate: async () => {
    // TODO(gallery): re-enable when AI gallery feature is ready
    // set({ generating: true, error: null })
    // try {
    //   const item = await generateImage()
    //   set((s) => ({ items: [item, ...s.items], generating: false }))
    //   return item
    // } catch (e) {
    //   set({ generating: false, error: errorMessage(e) })
    //   throw e
    // }
    throw new Error('gallery feature disabled')
  },
  remove: async (id) => {
    await deleteGalleryItem(id)
    set((s) => ({ items: s.items.filter(i => i.id !== id) }))
  },
  retry: async (id) => {
    const item = await retryDownload(id)
    set((s) => ({ items: s.items.map(i => i.id === id ? item : i) }))
  },
}))

// ── Star store ───────────────────────────────────────────────────────────────

interface StarStore {
  count: number
  init: () => Promise<void>
  star: (pointId: string) => Promise<void>
  unstar: (pointId: string) => Promise<void>
}

export const useStarStore = create<StarStore>((set) => ({
  count: 0,
  init: async () => {
    const count = await getStarredCount()
    set({ count })
  },
  star: async (pointId) => {
    const count = await starPoint(pointId)
    set({ count })
  },
  unstar: async (pointId) => {
    const count = await unstarPoint(pointId)
    set({ count })
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
