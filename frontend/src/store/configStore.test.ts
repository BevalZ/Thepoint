import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig, ConfigProfile } from '@/api/types'

const api = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getProfiles: vi.fn(),
  setConfig: vi.fn(),
  setProfiles: vi.fn(),
}))

vi.mock('@/api', () => api)

import { useConfigStore } from './configStore'

const config = {
  openaiApiKey: '',
  openaiModel: 'model',
  openaiBaseUrl: '',
  imageBaseUrl: '',
  imageApiKey: '',
  imageModel: '',
  imageProviderKey: '',
  imageCustomEndpoint: '',
  imageSize: '',
  imageKnowledgeStylePrompt: '',
  providerKey: '',
  customEndpoint: '',
  customProviderName: '',
  extraHeaders: '',
  searchEnabled: false,
  searchApiKey: '',
  searchModel: '',
  searchBaseUrl: '',
  searchProviderKey: '',
  searchCustomEndpoint: '',
  translationProvider: 'deeplx',
  translationApiKey: '',
  translationModel: '',
  translationBaseUrl: '',
  translationSourceLanguage: 'AUTO',
  translationTargetLanguage: 'ZH',
  factCheckLanguage: '',
  uiLanguage: 'zh-CN',
  annotationUnderlineColor: '',
  annotationWavyColor: '',
  annotationHighlightColor: '',
  commentatorName: '',
  commentatorStyle: '',
  commentatorEmoji: '',
  commentatorProfiles: [],
  customMentalModels: [],
} satisfies AppConfig

const profiles: ConfigProfile[] = [{
  id: 'profile-1',
  name: 'Default',
  baseUrl: '',
  apiKey: '',
  model: 'model',
}]

describe('useConfigStore single-flight loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useConfigStore.setState({
      config: null,
      loaded: false,
      profilesLoaded: false,
      profiles: [],
    })
  })

  it('coalesces concurrent config loads', async () => {
    api.getConfig.mockResolvedValue(config)

    await Promise.all([
      useConfigStore.getState().fetchConfig(),
      useConfigStore.getState().fetchConfig(),
    ])

    expect(api.getConfig).toHaveBeenCalledOnce()
    expect(useConfigStore.getState().loaded).toBe(true)
    expect(useConfigStore.getState().config).toEqual(config)
  })

  it('allows config load retry after a failed request', async () => {
    api.getConfig
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(config)

    await expect(useConfigStore.getState().fetchConfig()).rejects.toThrow('temporary')
    await useConfigStore.getState().fetchConfig()

    expect(api.getConfig).toHaveBeenCalledTimes(2)
    expect(useConfigStore.getState().loaded).toBe(true)
  })

  it('coalesces profile loads and records readiness', async () => {
    api.getProfiles.mockResolvedValue(profiles)

    await Promise.all([
      useConfigStore.getState().loadProfiles(),
      useConfigStore.getState().loadProfiles(),
    ])

    expect(api.getProfiles).toHaveBeenCalledOnce()
    expect(useConfigStore.getState().profilesLoaded).toBe(true)
    expect(useConfigStore.getState().profiles).toEqual(profiles)
  })
})
