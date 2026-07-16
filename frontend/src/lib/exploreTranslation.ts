import type { AppConfig, TranslationSourceLanguage, TranslationTargetLanguage } from '@/api/types'

export type TranslationDisplayMode = 'original' | 'bilingual' | 'translated'
export type TranslationBlockStatus = 'queued' | 'loading' | 'done' | 'error'

export interface TranslationBlockState {
  status: TranslationBlockStatus
  text?: string
  error?: string
  cacheKey: string
}

export interface TranslationProgress {
  total: number
  done: number
  loading: number
  error: number
  pending: number
}

export interface TranslationCandidate {
  index: number
  text: string
  cacheKey: string
}

export function translationBlocksSignature(blocks: Array<{ index: number; text: string }>): string {
  return stableTextHash(blocks.map((block) => `${block.index}\u001f${block.text}`).join('\u001e'))
}

export function translationSettingsSignature(config: AppConfig | null): string {
  if (!config) return 'none'
  return [
    normalizeTranslationProvider(config.translationProvider),
    normalizeEndpoint(config.translationBaseUrl),
    config.translationProvider === 'ai' ? config.translationModel.trim() : '',
    normalizeTranslationSource(config.translationSourceLanguage),
    config.translationTargetLanguage,
  ].join('|')
}

export function normalizeTranslationProvider(value: string | null | undefined): AppConfig['translationProvider'] {
  return value?.trim().toLowerCase() === 'ai' ? 'ai' : 'deeplx'
}

export function translationCacheKey(
  sourceKey: string,
  blockIndex: number,
  text: string,
  signature: string,
): string {
  return [
    sourceKey || 'unsaved-source',
    String(blockIndex),
    signature,
    stableTextHash(text),
  ].join('|')
}

export function translationProgress(
  states: Record<number, TranslationBlockState>,
  total: number,
): TranslationProgress {
  const values = Object.values(states)
  const done = values.filter((item) => item.status === 'done').length
  const loading = values.filter((item) => item.status === 'loading' || item.status === 'queued').length
  const error = values.filter((item) => item.status === 'error').length
  return {
    total,
    done,
    loading,
    error,
    pending: Math.max(0, total - done - loading - error),
  }
}

export function pendingTranslationCandidates(
  blocks: Array<{ index: number; text: string }>,
  states: Record<number, TranslationBlockState>,
  sourceKey: string,
  signature: string,
  retryFailed = false,
): TranslationCandidate[] {
  return blocks
    .map((block) => ({
      ...block,
      cacheKey: translationCacheKey(sourceKey, block.index, block.text, signature),
    }))
    .filter((block) => {
      if (!block.text.trim()) return false
      const state = states[block.index]
      if (!state) return true
      if (state.cacheKey !== block.cacheKey) return true
      if (state.status === 'done' || state.status === 'loading' || state.status === 'queued') return false
      return retryFailed && state.status === 'error'
    })
}

export function normalizeTranslationTarget(value: string | null | undefined): TranslationTargetLanguage {
  switch ((value ?? '').toUpperCase()) {
    case 'EN':
    case 'JA':
    case 'KO':
    case 'DE':
    case 'FR':
    case 'ES':
      return value!.toUpperCase() as TranslationTargetLanguage
    case 'ZH':
    case 'ZH-CN':
    default:
      return 'ZH'
  }
}

export function normalizeTranslationSource(value: string | null | undefined): TranslationSourceLanguage {
  switch ((value ?? '').toUpperCase()) {
    case 'EN':
    case 'JA':
    case 'KO':
    case 'DE':
    case 'FR':
    case 'ES':
      return value!.toUpperCase() as TranslationSourceLanguage
    case 'ZH':
    case 'ZH-CN':
      return 'ZH'
    case 'AUTO':
    default:
      return 'AUTO'
  }
}

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function stableTextHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}
