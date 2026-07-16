import { describe, expect, it } from 'vitest'
import {
  normalizeTranslationProvider,
  pendingTranslationCandidates,
  translationBlocksSignature,
  translationCacheKey,
  translationProgress,
  translationSettingsSignature,
  type TranslationBlockState,
} from './exploreTranslation'
import type { AppConfig } from '@/api/types'

const baseConfig: AppConfig = {
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  openaiBaseUrl: '',
  imageBaseUrl: '',
  imageApiKey: '',
  imageModel: '',
  imageProviderKey: 'openai-compatible',
  imageCustomEndpoint: '',
  imageSize: '1024x1024',
  imageKnowledgeStylePrompt: '',
  providerKey: 'openai-compat',
  customEndpoint: '',
  customProviderName: '',
  extraHeaders: '{}',
  searchEnabled: false,
  searchApiKey: '',
  searchModel: '',
  searchBaseUrl: '',
  searchProviderKey: 'openai-compat',
  searchCustomEndpoint: '',
  translationProvider: 'deeplx',
  translationApiKey: '',
  translationModel: '',
  translationBaseUrl: 'http://127.0.0.1:1188/',
  translationSourceLanguage: 'AUTO',
  translationTargetLanguage: 'ZH',
  factCheckLanguage: '中文',
  uiLanguage: 'zh-CN',
  annotationUnderlineColor: '#00A4EF',
  annotationWavyColor: '#F25022',
  annotationHighlightColor: '#FFB900',
  commentatorName: '鲁迅',
  commentatorStyle: '',
  commentatorEmoji: '🧐',
  commentatorProfiles: [],
  customMentalModels: [],
}

describe('exploreTranslation', () => {
  it('builds a stable signature from provider-facing settings', () => {
    expect(translationSettingsSignature(baseConfig)).toBe('deeplx|http://127.0.0.1:1188||AUTO|ZH')
    expect(translationSettingsSignature({
      ...baseConfig,
      translationProvider: 'ai',
      translationModel: 'gpt-4.1-mini',
      translationBaseUrl: 'https://api.example.com///',
      translationSourceLanguage: 'JA',
      translationTargetLanguage: 'EN',
    })).toBe('ai|https://api.example.com|gpt-4.1-mini|JA|EN')
    expect(normalizeTranslationProvider('invalid')).toBe('deeplx')
  })

  it('changes the source signature when pasted content changes', () => {
    const first = translationBlocksSignature([{ index: 0, text: 'first article' }])
    const same = translationBlocksSignature([{ index: 0, text: 'first article' }])
    const second = translationBlocksSignature([{ index: 0, text: 'second article' }])

    expect(first).toBe(same)
    expect(second).not.toBe(first)
  })

  it('uses every cache identity dimension', () => {
    const signature = translationSettingsSignature(baseConfig)
    const baseline = translationCacheKey('source-1', 0, 'hello', signature)

    expect(translationCacheKey('source-2', 0, 'hello', signature)).not.toBe(baseline)
    expect(translationCacheKey('source-1', 1, 'hello', signature)).not.toBe(baseline)
    expect(translationCacheKey('source-1', 0, 'world', signature)).not.toBe(baseline)
    expect(translationCacheKey('source-1', 0, 'hello', `${signature}|changed`)).not.toBe(baseline)
  })

  it('skips completed unchanged blocks and queues changed blocks', () => {
    const signature = translationSettingsSignature(baseConfig)
    const cacheKey = translationCacheKey('source-1', 0, 'hello', signature)
    const states: Record<number, TranslationBlockState> = {
      0: { status: 'done', text: '你好', cacheKey },
      1: { status: 'done', text: '旧译文', cacheKey: 'old-key' },
    }

    expect(pendingTranslationCandidates([
      { index: 0, text: 'hello' },
      { index: 1, text: 'world' },
    ], states, 'source-1', signature)).toEqual([
      expect.objectContaining({ index: 1, text: 'world' }),
    ])
  })

  it('retries failed blocks only when requested', () => {
    const signature = translationSettingsSignature(baseConfig)
    const cacheKey = translationCacheKey('source-1', 0, 'hello', signature)
    const states: Record<number, TranslationBlockState> = {
      0: { status: 'error', error: 'timeout', cacheKey },
    }

    expect(pendingTranslationCandidates([{ index: 0, text: 'hello' }], states, 'source-1', signature)).toHaveLength(0)
    expect(pendingTranslationCandidates([{ index: 0, text: 'hello' }], states, 'source-1', signature, true)).toEqual([
      expect.objectContaining({ index: 0 }),
    ])
  })

  it('summarizes progress from block states', () => {
    expect(translationProgress({
      0: { status: 'done', text: 'a', cacheKey: 'a' },
      1: { status: 'loading', cacheKey: 'b' },
      2: { status: 'error', error: 'x', cacheKey: 'c' },
      3: { status: 'queued', cacheKey: 'd' },
    }, 5)).toEqual({
      total: 5,
      done: 1,
      loading: 2,
      error: 1,
      pending: 1,
    })
  })
})
