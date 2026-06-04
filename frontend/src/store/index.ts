import { create } from 'zustand'
import type { AppConfig, ExtractedPoint, StoredPoint } from '@/api/types'
import {
  getConfig,
  setConfig,
  parseDocument,
  extractText,
  savePoints,
  listPoints,
} from '@/api'

interface ConfigStore {
  config: AppConfig | null
  loaded: boolean
  fetchConfig: () => Promise<void>
  saveConfig: (config: AppConfig) => Promise<void>
}

export const useConfigStore = create<ConfigStore>((set) => ({
  config: null,
  loaded: false,
  fetchConfig: async () => {
    const config = await getConfig()
    set({ config, loaded: true })
  },
  saveConfig: async (config) => {
    await setConfig(config)
    set({ config })
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
  fetch: () => Promise<void>
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  points: [],
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true, error: null })
    try {
      const points = await listPoints()
      set({ points, loading: false })
    } catch (e) {
      set({ loading: false, error: errorMessage(e) })
    }
  },
}))

function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return '发生未知错误'
}
