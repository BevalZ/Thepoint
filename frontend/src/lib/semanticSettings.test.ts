import { describe, expect, it } from 'vitest'
import { LOCAL_EMBEDDING_PROVIDER, parseEmbeddingProvider } from './semanticSettings'

describe('semantic settings', () => {
  it('rejects malformed persisted values', () => {
    expect(parseEmbeddingProvider('{bad')).toEqual(LOCAL_EMBEDDING_PROVIDER)
    expect(parseEmbeddingProvider('{"kind":"other"}')).toEqual(LOCAL_EMBEDDING_PROVIDER)
  })

  it('never restores API keys from localStorage', () => {
    expect(parseEmbeddingProvider(JSON.stringify({ kind: 'remote', baseUrl: 'https://example.test', model: 'embed', apiKey: 'secret' }))).toEqual({
      kind: 'remote', baseUrl: 'https://example.test', model: 'embed', apiKey: null,
    })
  })
})
