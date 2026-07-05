import type { DigestCitation, DigestResult, StoredPoint } from '@/api/types'

export const DIGEST_SOURCE_NAME = '知识研报'

export function citationKindLabel(kind: DigestCitation['kind']): string {
  if (kind === 'source') return 'Source'
  return kind === 'evidence' ? 'Evidence' : 'Point'
}

export function citationMarkdown(citations: DigestCitation[]): string {
  if (citations.length === 0) return ''
  return [
    '## 引用清单',
    '',
    ...citations.map((citation) => [
      `### [${citation.label}] ${citationKindLabel(citation.kind)}`,
      `ID: ${citation.id}`,
      `标题: ${citation.title}`,
      `摘录: ${citation.excerpt}`,
      ...(citation.sourceId ? [`Source: ${citation.sourceId}`, `Chunk: ${citation.chunkIndex ?? 'none'}`] : ['Source: none']),
      ...(citation.url ? [`URL: ${citation.url}`] : []),
      '',
    ].join('\n')),
  ].join('\n').trim()
}

export function digestMarkdownWithCitations(result: DigestResult): string {
  const appendix = citationMarkdown(result.citations)
  return appendix ? `${result.content.trim()}\n\n---\n\n${appendix}` : result.content
}

export function digestSourceExcerpt(points: StoredPoint[], citations: DigestCitation[]): string {
  const lines: string[] = []

  if (points.length > 0) {
    const groups = new Map<string, StoredPoint[]>()
    for (const point of points) {
      const source = point.sourceDocName?.trim() || '未命名来源'
      groups.set(source, [...(groups.get(source) ?? []), point])
    }

    lines.push(`本研报由 ${points.length} 个采集 star 和 ${citations.filter(citation => citation.kind === 'evidence').length} 条 Evidence 生成。`, '')
    lines.push(...Array.from(groups.entries()).flatMap(([source, sourcePoints], groupIndex) => [
      `## 来源 ${groupIndex + 1}: ${source}`,
      `采集 star: ${sourcePoints.length} 个`,
      '',
      ...sourcePoints.flatMap((point, pointIndex) => {
        const excerpt = point.sourceExcerpt?.trim()
        return [
          `### Star [${pointIndex + 1}]`,
          `类型: ${point.tagType ?? '未分类'}`,
          `内容: ${point.content}`,
          ...(excerpt ? ['', '原文块:', excerpt] : []),
          '',
        ]
      }),
    ]))
  } else {
    lines.push(`本研报由 ${citations.length} 条结构化引用生成。`, '')
  }

  const citationBlock = citationMarkdown(citations)
  if (citationBlock) lines.push('', citationBlock)

  return lines.join('\n').trim()
}
