import type { EvidenceRecord, GalleryItem, SourceAssetsRecord, SourceSummaryRecord, StoredPoint } from '@/api/types'
import { reportKindLabel } from './reportArtifacts'

export function sourceDisplayTitle(source: SourceSummaryRecord): string {
  return source.title?.trim() || source.canonicalUri || source.id
}

export function markdownFileName(prefix: string, title: string, fallbackId: string): string {
  const normalized = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)

  return `${prefix}-${normalized || fallbackId.slice(0, 8)}.md`
}

export function evidenceMarkdown(record: EvidenceRecord): string {
  return [
    `# Evidence: ${record.claim}`,
    '',
    `- Verdict: ${record.verdict}`,
    `- Checked At: ${record.checkedAt}`,
    `- Evidence ID: ${record.id}`,
    `- Point ID: ${record.pointId ?? 'none'}`,
    `- Source ID: ${record.sourceId ?? 'none'}`,
    `- Chunk: ${record.chunkIndex ?? 'none'}`,
    '',
    '## Answer',
    '',
    record.answer.trim(),
    ...(record.reasoning ? ['', '## Reasoning', '', record.reasoning.trim()] : []),
    ...(record.context ? ['', '## Context', '', record.context.trim()] : []),
    '',
    '## Sources',
    '',
    ...(
      record.sources.length > 0
        ? record.sources.flatMap((source, index) => [
            `### Source ${index + 1}: ${source.title?.trim() || source.url}`,
            `- URL: ${source.url}`,
            `- Stance: ${source.stance}`,
            ...(source.snippet ? [`- Snippet: ${source.snippet}`] : []),
            '',
          ])
        : ['No external evidence sources recorded.', '']
    ),
  ].join('\n').trim()
}

export function sourceAssetsMarkdown(assets: SourceAssetsRecord): string {
  const sourceTitle = sourceDisplayTitle(assets.source)
  return [
    `# Source Assets: ${sourceTitle}`,
    '',
    '## Source',
    '',
    `- Source ID: ${assets.source.id}`,
    `- Kind: ${assets.source.kind}`,
    `- URI: ${assets.source.canonicalUri}`,
    `- Updated At: ${assets.source.updatedAt}`,
    `- Chunks: ${assets.source.chunkCount}`,
    `- Points: ${assets.source.pointCount}`,
    `- Stars: ${assets.source.starCount}`,
    '',
    pointsSection(assets.points),
    evidenceSection(assets.evidence),
    reportsSection(assets.reports),
    gallerySection(assets.gallery),
  ].filter(Boolean).join('\n\n').trim()
}

function pointsSection(points: StoredPoint[]): string {
  if (points.length === 0) return '## Points\n\nNo linked Points recorded.'
  return [
    '## Points',
    '',
    ...points.flatMap((point, index) => [
      `### Point ${index + 1}`,
      `- ID: ${point.id}`,
      `- Type: ${point.tagType ?? 'uncategorized'}`,
      `- Starred: ${point.starred ? 'yes' : 'no'}`,
      '',
      point.content.trim(),
      '',
    ]),
  ].join('\n').trim()
}

function evidenceSection(records: EvidenceRecord[]): string {
  if (records.length === 0) return '## Evidence\n\nNo linked Evidence recorded.'
  return [
    '## Evidence',
    '',
    ...records.flatMap((record, index) => [
      `### Evidence ${index + 1}: ${record.claim}`,
      `- ID: ${record.id}`,
      `- Verdict: ${record.verdict}`,
      `- Chunk: ${record.chunkIndex ?? 'none'}`,
      '',
      record.answer.trim(),
      '',
      ...record.sources.flatMap((source, sourceIndex) => [
        `- Source ${sourceIndex + 1}: ${source.title?.trim() || source.url}`,
        `  - URL: ${source.url}`,
        `  - Stance: ${source.stance}`,
      ]),
      '',
    ]),
  ].join('\n').trim()
}

function reportsSection(reports: SourceAssetsRecord['reports']): string {
  if (reports.length === 0) return '## Reports\n\nNo linked Reports recorded.'
  return [
    '## Reports',
    '',
    ...reports.flatMap((report, index) => [
      `### Report ${index + 1}: ${report.title}`,
      `- ID: ${report.id}`,
      `- Kind: ${reportKindLabel(report.kind)}`,
      `- Created At: ${report.createdAt}`,
      '',
      report.summary.trim(),
      '',
    ]),
  ].join('\n').trim()
}

function gallerySection(items: GalleryItem[]): string {
  if (items.length === 0) return '## Gallery\n\nNo linked Gallery images recorded.'
  return [
    '## Gallery',
    '',
    ...items.flatMap((item, index) => [
      `### Image ${index + 1}: ${item.id}`,
      `- Status: ${item.downloadStatus}`,
      `- Generated At: ${item.generatedAt}`,
      `- File: ${item.filePath}`,
      `- Thumbnail: ${item.thumbnailPath}`,
      `- Point IDs: ${item.pointIds.length > 0 ? item.pointIds.join(', ') : 'none'}`,
      '',
      item.prompt.trim(),
      '',
    ]),
  ].join('\n').trim()
}
