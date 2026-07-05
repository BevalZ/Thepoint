import { beforeEach, describe, expect, it } from 'vitest'
import type { EvidenceRecord } from '@/api/types'
import { useEvidenceDigestStore } from './evidenceDigestStore'
import { useSynthesisStore } from './synthesisStore'

function evidence(id: string): EvidenceRecord {
  return {
    id,
    claim: `Claim ${id}`,
    verdict: 'supported',
    answer: `Answer ${id}`,
    reasoning: null,
    context: null,
    pointId: null,
    sourceId: 'source-1',
    chunkIndex: 2,
    checkedAt: '2026-07-05T00:00:00Z',
    createdAt: '2026-07-05T00:00:00Z',
    sources: [],
  }
}

describe('Evidence Digest input store', () => {
  beforeEach(() => {
    useEvidenceDigestStore.getState().clear()
  })

  it('deduplicates added Evidence records and keeps newest first', () => {
    const store = useEvidenceDigestStore.getState()

    store.add(evidence('evidence-1'))
    store.add(evidence('evidence-2'))
    store.add(evidence('evidence-1'))

    expect(useEvidenceDigestStore.getState().records.map(record => record.id)).toEqual([
      'evidence-2',
      'evidence-1',
    ])
  })

  it('toggles and clears Evidence selections', () => {
    const store = useEvidenceDigestStore.getState()

    store.toggle(evidence('evidence-1'))
    expect(useEvidenceDigestStore.getState().has('evidence-1')).toBe(true)

    useEvidenceDigestStore.getState().toggle(evidence('evidence-1'))
    expect(useEvidenceDigestStore.getState().has('evidence-1')).toBe(false)

    useEvidenceDigestStore.getState().add(evidence('evidence-2'))
    useEvidenceDigestStore.getState().clear()
    expect(useEvidenceDigestStore.getState().records).toEqual([])
  })
})

describe('Synthesis Source input store', () => {
  beforeEach(() => {
    useSynthesisStore.getState().clearSources()
  })

  it('deduplicates selected Sources and keeps newest first', () => {
    const store = useSynthesisStore.getState()

    store.addSource({ id: 'source-1', title: 'Source One' })
    store.addSource({ id: 'source-2', title: 'Source Two' })
    store.addSource({ id: 'source-1', title: 'Source One Updated' })

    expect(useSynthesisStore.getState().sources).toEqual([
      { id: 'source-2', title: 'Source Two' },
      { id: 'source-1', title: 'Source One' },
    ])
  })

  it('toggles, removes, and clears Source selections', () => {
    const store = useSynthesisStore.getState()

    store.toggleSource({ id: 'source-1', title: 'Source One' })
    expect(useSynthesisStore.getState().hasSource('source-1')).toBe(true)

    useSynthesisStore.getState().toggleSource({ id: 'source-1', title: 'Source One' })
    expect(useSynthesisStore.getState().hasSource('source-1')).toBe(false)

    useSynthesisStore.getState().addSource({ id: 'source-2', title: 'Source Two' })
    useSynthesisStore.getState().removeSource('source-2')
    expect(useSynthesisStore.getState().sources).toEqual([])

    useSynthesisStore.getState().addSource({ id: 'source-3', title: 'Source Three' })
    useSynthesisStore.getState().clearSources()
    expect(useSynthesisStore.getState().sources).toEqual([])
  })
})
