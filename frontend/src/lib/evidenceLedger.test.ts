import { describe, expect, it } from 'vitest'
import type { EvidenceRecord } from '@/api/types'
import { filterEvidenceByVerdict } from './evidenceLedger'

function evidence(id: string, verdict: EvidenceRecord['verdict']): EvidenceRecord {
  return {
    id,
    claim: `Claim ${id}`,
    verdict,
    answer: `Answer ${id}`,
    reasoning: null,
    context: null,
    pointId: null,
    sourceId: null,
    chunkIndex: null,
    checkedAt: '2026-07-05T00:00:00Z',
    createdAt: '2026-07-05T00:00:00Z',
    sources: [],
  }
}

describe('Evidence ledger filters', () => {
  const records = [
    evidence('evidence-1', 'supported'),
    evidence('evidence-2', 'mixed'),
    evidence('evidence-3', 'supported'),
    evidence('evidence-4', 'uncertain'),
  ]

  it('returns all records for the all filter', () => {
    expect(filterEvidenceByVerdict(records, 'all')).toBe(records)
  })

  it('filters by verdict while preserving order', () => {
    expect(filterEvidenceByVerdict(records, 'supported').map((record) => record.id)).toEqual([
      'evidence-1',
      'evidence-3',
    ])
  })

  it('returns an empty list when no record matches the verdict', () => {
    expect(filterEvidenceByVerdict(records, 'contradicted')).toEqual([])
  })
})
