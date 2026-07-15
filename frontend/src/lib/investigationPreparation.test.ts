import { describe, expect, it } from 'vitest'
import {
  investigationMissingLabel,
  investigationReadinessForAssets,
} from './investigationPreparation'

describe('investigationReadinessForAssets', () => {
  it('identifies both missing context categories for a new source', () => {
    expect(investigationReadinessForAssets({ points: [], evidence: [], reports: [] })).toEqual({
      ready: false,
      pointCount: 0,
      evidenceCount: 0,
      reportCount: 0,
      missing: ['points', 'evidence'],
    })
  })

  it('accepts three source points plus evidence or an existing report', () => {
    const points = [{}, {}, {}]

    expect(investigationReadinessForAssets({ points, evidence: [{}], reports: [] })?.ready).toBe(true)
    expect(investigationReadinessForAssets({ points, evidence: [], reports: [{}] })?.ready).toBe(true)
  })

  it('returns null while source assets have not loaded', () => {
    expect(investigationReadinessForAssets(null)).toBeNull()
  })
})

describe('investigationMissingLabel', () => {
  it('keeps readiness guidance in the selected UI language', () => {
    expect(investigationMissingLabel('points', 'zh-CN')).toBe('至少 3 个来源观点')
    expect(investigationMissingLabel('evidence', 'en-US')).toBe('at least 1 evidence item or prior report')
  })
})
