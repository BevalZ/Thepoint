import { describe, expect, it } from 'vitest'
import type { DigestCitation, DigestResult, ReportRecord } from '@/api/types'
import {
  digestResultFromReport,
  parseReportCitations,
  reportMarkdownWithCitations,
  reportSaveInput,
  reportSummaryFromMarkdown,
  reportTitleFromMarkdown,
} from './reportArtifacts'

function citation(overrides: Partial<DigestCitation> = {}): DigestCitation {
  return {
    kind: 'source',
    label: 'S1',
    id: 'source-1',
    title: 'Source One',
    excerpt: 'source excerpt',
    sourceId: 'source-1',
    chunkIndex: 2,
    url: 'https://example.com/source',
    ...overrides,
  }
}

function report(overrides: Partial<ReportRecord> = {}): ReportRecord {
  return {
    id: 'report-1',
    title: 'Saved Report',
    kind: 'digest',
    sourceName: '知识研报',
    bodyMd: '# Saved Report\n\nImportant finding.',
    summary: 'Important finding.',
    citationsJson: JSON.stringify([citation()]),
    createdAt: '2026-07-05T00:00:00Z',
    ...overrides,
  }
}

describe('report artifact helpers', () => {
  it('derives stable report title and summary from markdown', () => {
    expect(reportTitleFromMarkdown('# Market Brief\n\nBody', 'Fallback')).toBe('Market Brief')
    expect(reportTitleFromMarkdown('No heading body', 'Fallback')).toBe('Fallback')
    expect(reportSummaryFromMarkdown('## Summary\n\n**Important** finding')).toBe('Summary')
  })

  it('builds save input from a digest result without flattening citations into body', () => {
    const result: DigestResult = {
      content: '# Strategy Digest\n\nThe body references [S1].',
      citations: [citation()],
    }

    const input = reportSaveInput(result, 'synthesis', '多来源综合', '多来源综合')

    expect(input.title).toBe('Strategy Digest')
    expect(input.kind).toBe('synthesis')
    expect(input.bodyMd).toBe(result.content)
    expect(input.bodyMd).not.toContain('## 引用清单')
    expect(JSON.parse(input.citationsJson)).toHaveLength(1)
  })

  it('reconstructs digest results and markdown appendices from saved reports', () => {
    const saved = report()
    const result = digestResultFromReport(saved)
    const markdown = reportMarkdownWithCitations(saved)

    expect(result.content).toBe(saved.bodyMd)
    expect(result.citations[0].label).toBe('S1')
    expect(markdown).toContain('## 引用清单')
    expect(markdown).toContain('URL: https://example.com/source')
  })

  it('ignores invalid or malformed citation JSON', () => {
    expect(parseReportCitations('{bad-json')).toEqual([])
    expect(parseReportCitations('{}')).toEqual([])
    expect(parseReportCitations(JSON.stringify([{ label: 'S1' }]))).toEqual([])
  })
})
