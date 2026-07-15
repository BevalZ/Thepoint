import { describe, expect, it } from 'vitest'
import { localizeCapabilityScorecard } from './capabilityScorecardCopy'
import type { CapabilityScorecard } from '@/api/types'

const fixture: CapabilityScorecard = {
  generatedAt: '', itemCount: 1, completedCount: 1, readOnlyCount: 1, writeCount: 0,
  draftCount: 0, modelCallCount: 0, averageImpactScore: 0.8, averageRiskScore: 0.1,
  items: [{ round: 1, sourceInspiration: 'Zotero', capability: 'Search Evaluation Harness', boundary: 'read_only', status: 'completed', impactScore: 0.8, riskScore: 0.1, readiness: 'ready', commandNames: [], verification: '', nextStep: 'Extend with MRR/NDCG before ranking changes.' }],
  recommendations: ['Promote diagnostics'], sourceInspiration: 'Round 20',
}

describe('localizeCapabilityScorecard', () => {
  it('translates fixed scorecard copy in Chinese mode', () => {
    const result = localizeCapabilityScorecard(fixture, 'zh-CN')
    expect(result.items[0].capability).toBe('搜索评估基准')
    expect(result.recommendations[0]).toContain('只读诊断')
  })

  it('preserves backend copy in English mode', () => {
    expect(localizeCapabilityScorecard(fixture, 'en-US')).toBe(fixture)
  })
})
