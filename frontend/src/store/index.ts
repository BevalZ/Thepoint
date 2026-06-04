import { create } from 'zustand'
import type { AppConfig } from '@/api/types'
import { getConfig, setConfig } from '@/api'

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
