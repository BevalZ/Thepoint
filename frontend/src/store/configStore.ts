import { create } from 'zustand'
import type { AppConfig, ConfigProfile } from '@/api/types'
import { getConfig, getProfiles, setConfig, setProfiles } from '@/api'

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
