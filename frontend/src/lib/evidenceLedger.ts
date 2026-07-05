import type { EvidenceRecord } from '@/api/types'

export type EvidenceVerdictFilter = 'all' | EvidenceRecord['verdict']

export const EVIDENCE_VERDICT_FILTERS: { id: EvidenceVerdictFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'supported', label: '支持' },
  { id: 'contradicted', label: '反驳' },
  { id: 'mixed', label: '混合' },
  { id: 'uncertain', label: '不确定' },
]

export function filterEvidenceByVerdict(
  records: EvidenceRecord[],
  verdict: EvidenceVerdictFilter
): EvidenceRecord[] {
  if (verdict === 'all') return records
  return records.filter((record) => record.verdict === verdict)
}
