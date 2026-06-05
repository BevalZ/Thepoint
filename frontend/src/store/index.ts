import { create } from 'zustand'
import type {
  AppConfig,
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
  extractText,
  savePoints,
  listPoints,
  listMentalModels,
  recommendFrameworks,
  deepenPoint,
  findSimilar,
  getProfiles,
  setProfiles,
} from '@/api'

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
  points: ExtractedPoint[]
  parsing: boolean
  extracting: boolean
  saving: boolean
  savedCount: number | null
  error: string | null
  setText: (text: string) => void
  parseFile: (filePath: string) => Promise<void>
  extract: () => Promise<void>
  save: () => Promise<void>
}

export const useExploreStore = create<ExploreStore>((set, get) => ({
  text: '',
  sourceName: null,
  points: [],
  parsing: false,
  extracting: false,
  saving: false,
  savedCount: null,
  error: null,
  setText: (text) => set({ text }),
  parseFile: async (filePath) => {
    set({ parsing: true, error: null, savedCount: null })
    try {
      const text = await parseDocument(filePath)
      const sourceName = filePath.split(/[\\/]/).pop() ?? filePath
      set({ text, sourceName, points: [], parsing: false })
    } catch (e) {
      set({ parsing: false, error: errorMessage(e) })
    }
  },
  extract: async () => {
    const text = get().text.trim()
    if (!text) return
    set({ extracting: true, error: null, savedCount: null })
    try {
      const points = await extractText(text)
      set({ points, extracting: false })
    } catch (e) {
      set({ extracting: false, error: errorMessage(e) })
    }
  },
  save: async () => {
    const { points, sourceName } = get()
    if (points.length === 0) return
    set({ saving: true, error: null, savedCount: null })
    try {
      const count = await savePoints(points, sourceName)
      set({ saving: false, savedCount: count })
    } catch (e) {
      set({ saving: false, error: errorMessage(e) })
    }
  },
}))

interface LibraryStore {
  points: StoredPoint[]
  loading: boolean
  error: string | null
  deepening: Record<string, boolean>
  expanded: Record<string, boolean>
  similar: Record<string, StoredPoint[]>
  fetch: () => Promise<void>
  toggleExpanded: (pointId: string) => void
  deepen: (
    point: StoredPoint,
    action: DeepenAction,
    frameworkKey?: string
  ) => Promise<void>
  findSimilarFor: (point: StoredPoint) => Promise<void>
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  points: [],
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
