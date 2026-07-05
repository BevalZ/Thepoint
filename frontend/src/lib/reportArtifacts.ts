import type { DigestCitation, DigestResult, ReportKind, ReportRecord, SaveReportInput } from '@/api/types'
import { digestMarkdownWithCitations } from './digestArtifacts'

export type ReportKindFilter = 'all' | ReportKind

export function reportKindLabel(kind: ReportKind): string {
  return kind === 'synthesis' ? '多来源综合' : '知识研报'
}

export const REPORT_KIND_FILTERS: { id: ReportKindFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'digest', label: reportKindLabel('digest') },
  { id: 'synthesis', label: reportKindLabel('synthesis') },
]

export function filterReportsByKind(records: ReportRecord[], kind: ReportKindFilter): ReportRecord[] {
  if (kind === 'all') return records
  return records.filter((record) => record.kind === kind)
}

export function reportSummaryFromMarkdown(content: string, maxLength = 120): string {
  const normalized = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^#{1,6}\s+/, '').replace(/[*_`>~-]/g, '').trim())
    .find(Boolean) ?? '无摘要'

  return truncateText(normalized, maxLength)
}

export function reportTitleFromMarkdown(content: string, fallback: string): string {
  const heading = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+\S/.test(line))

  if (!heading) return fallback
  return truncateText(heading.replace(/^#{1,3}\s+/, '').trim(), 60)
}

export function reportSaveInput(
  result: DigestResult,
  kind: ReportKind,
  title: string,
  sourceName?: string | null
): SaveReportInput {
  return {
    title: reportTitleFromMarkdown(result.content, title),
    kind,
    sourceName: sourceName ?? null,
    bodyMd: result.content.trim(),
    summary: reportSummaryFromMarkdown(result.content),
    citationsJson: JSON.stringify(result.citations),
  }
}

export function digestResultFromReport(record: ReportRecord): DigestResult {
  return {
    content: record.bodyMd,
    citations: parseReportCitations(record.citationsJson),
  }
}

export function reportMarkdownWithCitations(record: ReportRecord): string {
  return digestMarkdownWithCitations(digestResultFromReport(record))
}

export function parseReportCitations(citationsJson: string): DigestCitation[] {
  try {
    const parsed: unknown = JSON.parse(citationsJson)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isDigestCitation)
  } catch {
    return []
  }
}

function isDigestCitation(value: unknown): value is DigestCitation {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (candidate.kind === 'source' || candidate.kind === 'point' || candidate.kind === 'evidence')
    && typeof candidate.label === 'string'
    && typeof candidate.id === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.excerpt === 'string'
    && (typeof candidate.sourceId === 'string' || candidate.sourceId === null)
    && (typeof candidate.chunkIndex === 'number' || candidate.chunkIndex === null)
    && (typeof candidate.url === 'string' || candidate.url === null)
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}
