import { describe, expect, it } from 'vitest'
import type { EvidenceRecord, GalleryItem, ReportRecord, SourceAssetsRecord, SourceSummaryRecord, StoredPoint } from '@/api/types'
import { evidenceMarkdown, markdownFileName, sourceAssetsMarkdown, sourceDisplayTitle } from './workbenchArtifacts'

function source(overrides: Partial<SourceSummaryRecord> = {}): SourceSummaryRecord {
  return {
    id: 'source-1',
    kind: 'webpage',
    title: 'Source Title',
    canonicalUri: 'https://example.com/source',
    metadataJson: '{}',
    createdAt: '2026-07-05T00:00:00Z',
    updatedAt: '2026-07-05T00:01:00Z',
    chunkCount: 2,
    pointCount: 1,
    starCount: 1,
    ...overrides,
  }
}

function point(overrides: Partial<StoredPoint> = {}): StoredPoint {
  return {
    id: 'point-1',
    content: 'A linked point.',
    tagType: '作者观点',
    parentId: null,
    sourceDocName: 'Source Title',
    sourceExcerpt: 'Original excerpt.',
    createdAt: '2026-07-05T00:02:00Z',
    archived: false,
    starred: true,
    ...overrides,
  }
}

function evidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: 'evidence-1',
    claim: 'The claim',
    verdict: 'supported',
    answer: 'The answer.',
    reasoning: 'The reasoning.',
    context: 'The context.',
    pointId: 'point-1',
    sourceId: 'source-1',
    chunkIndex: 0,
    checkedAt: '2026-07-05T00:03:00Z',
    createdAt: '2026-07-05T00:03:00Z',
    sources: [{
      id: 'evidence-source-1',
      evidenceId: 'evidence-1',
      title: 'External Source',
      url: 'https://example.com/evidence',
      snippet: 'snippet',
      stance: 'support',
      createdAt: '2026-07-05T00:03:00Z',
    }],
    ...overrides,
  }
}

function report(overrides: Partial<ReportRecord> = {}): ReportRecord {
  return {
    id: 'report-1',
    title: 'Report Title',
    kind: 'synthesis',
    sourceName: '多来源综合',
    bodyMd: '# Report Title',
    summary: 'Report summary.',
    citationsJson: '[]',
    createdAt: '2026-07-05T00:04:00Z',
    ...overrides,
  }
}

function gallery(overrides: Partial<GalleryItem> = {}): GalleryItem {
  return {
    id: 'gallery-1',
    filePath: 'D:/gallery/item.webp',
    thumbnailPath: 'D:/gallery/item-thumb.webp',
    prompt: 'A knowledge image prompt.',
    generatedAt: '2026-07-05T00:05:00Z',
    downloadStatus: 'ok',
    pointIds: ['point-1'],
    sourcePoints: [{ id: 'point-1', content: 'A linked point.', sourceDocName: 'Source Title' }],
    ...overrides,
  }
}

describe('workbench artifact helpers', () => {
  it('derives source titles and safe markdown filenames', () => {
    expect(sourceDisplayTitle(source())).toBe('Source Title')
    expect(sourceDisplayTitle(source({ title: null, canonicalUri: 'file:///D:/docs/a.md' }))).toBe('file:///D:/docs/a.md')
    expect(markdownFileName('source', 'Bad:/ Name * With Spaces', 'source-123456')).toBe('source-Bad-Name-With-Spaces.md')
  })

  it('exports evidence markdown with answer, context, and external sources', () => {
    const markdown = evidenceMarkdown(evidence())

    expect(markdown).toContain('# Evidence: The claim')
    expect(markdown).toContain('- Verdict: supported')
    expect(markdown).toContain('## Answer')
    expect(markdown).toContain('The reasoning.')
    expect(markdown).toContain('https://example.com/evidence')
  })

  it('exports source asset bundles with every durable asset group', () => {
    const assets: SourceAssetsRecord = {
      source: source(),
      points: [point()],
      evidence: [evidence()],
      reports: [report()],
      gallery: [gallery()],
    }

    const markdown = sourceAssetsMarkdown(assets)

    expect(markdown).toContain('# Source Assets: Source Title')
    expect(markdown).toContain('## Points')
    expect(markdown).toContain('A linked point.')
    expect(markdown).toContain('## Evidence')
    expect(markdown).toContain('The claim')
    expect(markdown).toContain('## Reports')
    expect(markdown).toContain('Report summary.')
    expect(markdown).toContain('## Gallery')
    expect(markdown).toContain('A knowledge image prompt.')
  })
})
