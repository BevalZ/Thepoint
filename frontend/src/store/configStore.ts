import { create } from 'zustand'
import type { AppConfig, ConfigProfile } from '@/api/types'
import { getConfig, getProfiles, setConfig, setProfiles } from '@/api'

interface ConfigStore {
  config: AppConfig | null
  loaded: boolean
  profilesLoaded: boolean
  profiles: ConfigProfile[]
  fetchConfig: () => Promise<void>
  saveConfig: (config: AppConfig) => Promise<void>
  loadProfiles: () => Promise<void>
  saveProfiles: (profiles: ConfigProfile[]) => Promise<void>
}

let configRequest: Promise<void> | null = null
let profilesRequest: Promise<void> | null = null

export const useConfigStore = create<ConfigStore>((set) => ({
  config: null,
  loaded: false,
  profilesLoaded: false,
  profiles: [],
  fetchConfig: async () => {
    if (configRequest) return configRequest
    configRequest = getConfig()
      .then((config) => {
        set({ config, loaded: true })
      })
      .finally(() => {
        configRequest = null
      })
    return configRequest
  },
  saveConfig: async (config) => {
    await setConfig(config)
    set({ config })
  },
  loadProfiles: async () => {
    if (profilesRequest) return profilesRequest
    profilesRequest = getProfiles()
      .then((profiles) => {
        set({ profiles, profilesLoaded: true })
      })
      .finally(() => {
        profilesRequest = null
      })
    return profilesRequest
  },
  saveProfiles: async (profiles) => {
    await setProfiles(profiles)
    set({ profiles, profilesLoaded: true })
  },
}))
