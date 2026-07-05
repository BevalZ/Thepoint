import { describe, expect, it } from 'vitest'
import type { DigestCitation, DigestResult, StoredPoint } from '@/api/types'
import {
  citationMarkdown,
  digestMarkdownWithCitations,
  digestSourceExcerpt,
} from './digestArtifacts'

function citation(overrides: Partial<DigestCitation> = {}): DigestCitation {
  return {
    kind: 'evidence',
    label: 'E1',
    id: 'evidence-1',
    title: 'Claim under review',
    excerpt: 'The claim is supported by a cited source.',
    sourceId: 'source-1',
    chunkIndex: 3,
    url: 'https://example.com/evidence',
    ...overrides,
  }
}

function point(overrides: Partial<StoredPoint> = {}): StoredPoint {
  return {
    id: 'point-1',
    content: 'A durable point for synthesis.',
    tagType: '事实陈述',
    parentId: null,
    sourceDocName: 'Source Alpha',
    sourceExcerpt: 'Original source excerpt.',
    createdAt: '2026-07-05T00:00:00Z',
    archived: false,
    starred: true,
    ...overrides,
  }
}

describe('digest artifact helpers', () => {
  it('renders source, point, and evidence citation metadata', () => {
    const markdown = citationMarkdown([
      citation({ kind: 'source', label: 'S1', id: 'source-1', title: 'Source Alpha', url: 'https://example.com/source' }),
      citation({ kind: 'point', label: 'P1', id: 'point-1', title: '事实陈述', url: null }),
      citation(),
    ])

    expect(markdown).toContain('### [S1] Source')
    expect(markdown).toContain('### [P1] Point')
    expect(markdown).toContain('### [E1] Evidence')
    expect(markdown).toContain('Source: source-1')
    expect(markdown).toContain('Chunk: 3')
    expect(markdown).toContain('URL: https://example.com/evidence')
  })

  it('preserves the citation appendix for copy/download/archive content', () => {
    const result: DigestResult = {
      content: '# 综合结论\n\n关键判断 [E1]',
      citations: [citation()],
    }

    const markdown = digestMarkdownWithCitations(result)

    expect(markdown).toContain('# 综合结论')
    expect(markdown).toContain('---')
    expect(markdown).toContain('## 引用清单')
    expect(markdown).toContain('### [E1] Evidence')
  })

  it('builds saved source excerpts with stars and structured citations', () => {
    const excerpt = digestSourceExcerpt(
      [point(), point({ id: 'point-2', sourceDocName: 'Source Alpha', content: 'Second point.' })],
      [citation(), citation({ kind: 'source', label: 'S1', id: 'source-1', title: 'Source Alpha' })]
    )

    expect(excerpt).toContain('本研报由 2 个采集 star 和 1 条 Evidence 生成。')
    expect(excerpt).toContain('## 来源 1: Source Alpha')
    expect(excerpt).toContain('### Star [1]')
    expect(excerpt).toContain('## 引用清单')
    expect(excerpt).toContain('### [S1] Source')
  })

  it('records a citation-only report when no starred points are present', () => {
    const excerpt = digestSourceExcerpt([], [citation()])

    expect(excerpt).toContain('本研报由 1 条结构化引用生成。')
    expect(excerpt).toContain('### [E1] Evidence')
  })
})
