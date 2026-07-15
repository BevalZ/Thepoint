import type { AppConfig } from '@/api/types'

export const INVESTIGATION_MIN_POINTS = 3
export const INVESTIGATION_MIN_EVIDENCE_OR_REPORTS = 1
export const INVESTIGATION_TARGET_POINTS = 5
export const INVESTIGATION_TARGET_EVIDENCE = 2
export const INVESTIGATION_MAX_AUTO_ANALYSIS_BLOCKS = 8

export type InvestigationReadinessMissing = 'points' | 'evidence'

export interface InvestigationReadiness {
  ready: boolean
  pointCount: number
  evidenceCount: number
  reportCount: number
  missing: InvestigationReadinessMissing[]
}

interface InvestigationAssetCounts {
  points: readonly unknown[]
  evidence: readonly unknown[]
  reports: readonly unknown[]
}

export function investigationReadinessForAssets(
  assets: InvestigationAssetCounts | null
): InvestigationReadiness | null {
  if (!assets) return null

  const pointCount = assets.points.length
  const evidenceCount = assets.evidence.length
  const reportCount = assets.reports.length
  const missing: InvestigationReadinessMissing[] = []
  if (pointCount < INVESTIGATION_MIN_POINTS) missing.push('points')
  if (evidenceCount + reportCount < INVESTIGATION_MIN_EVIDENCE_OR_REPORTS) missing.push('evidence')

  return {
    ready: missing.length === 0,
    pointCount,
    evidenceCount,
    reportCount,
    missing,
  }
}

export function investigationMissingLabel(
  kind: InvestigationReadinessMissing,
  language: AppConfig['uiLanguage']
): string {
  const zh = language !== 'en-US'
  if (kind === 'points') {
    return zh
      ? `至少 ${INVESTIGATION_MIN_POINTS} 个来源观点`
      : `at least ${INVESTIGATION_MIN_POINTS} source-linked points`
  }
  return zh
    ? `至少 ${INVESTIGATION_MIN_EVIDENCE_OR_REPORTS} 条证据或既有报告`
    : `at least ${INVESTIGATION_MIN_EVIDENCE_OR_REPORTS} evidence item or prior report`
}
