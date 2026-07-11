import type { EmbeddingProviderConfig } from '@/api/types'

const KEY = 'semantic-provider-v1'
export const LOCAL_EMBEDDING_PROVIDER: EmbeddingProviderConfig = { kind: 'local', baseUrl: null, apiKey: null, model: null }

export function parseEmbeddingProvider(raw: string | null): EmbeddingProviderConfig {
  try {
    const value = JSON.parse(raw ?? 'null') as Partial<EmbeddingProviderConfig> | null
    if (!value || (value.kind !== 'local' && value.kind !== 'remote')) return LOCAL_EMBEDDING_PROVIDER
    return {
      kind: value.kind,
      baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl : null,
      apiKey: null,
      model: typeof value.model === 'string' ? value.model : null,
    }
  } catch { return LOCAL_EMBEDDING_PROVIDER }
}

export function loadEmbeddingProvider(): EmbeddingProviderConfig {
  return parseEmbeddingProvider(localStorage.getItem(KEY))
}

export function saveEmbeddingProvider(provider: EmbeddingProviderConfig): void {
  localStorage.setItem(KEY, JSON.stringify({ ...provider, apiKey: null }))
}
