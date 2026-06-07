import type { ExploreSourceMetadata } from '@/api/types'

export interface SourceMetadataRecord {
  key: string
  sourceName: string | null
  metadata: ExploreSourceMetadata
  savedAt: string
}

const LS_SOURCE_METADATA = 'explore-source-metadata-v1'

function normalizeSourceKey(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim().toLowerCase() ?? ''
}

function recordKey(sourceName: string | null, metadata: ExploreSourceMetadata): string {
  return [
    normalizeSourceKey(sourceName),
    normalizeSourceKey(metadata.name),
    normalizeSourceKey(metadata.path),
    normalizeSourceKey(metadata.url),
  ].filter(Boolean).join('|')
}

function loadRecords(): SourceMetadataRecord[] {
  try {
    const raw = localStorage.getItem(LS_SOURCE_METADATA)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is SourceMetadataRecord => {
      const value = item as Partial<SourceMetadataRecord>
      return typeof value.key === 'string'
        && typeof value.savedAt === 'string'
        && value.metadata !== null
        && typeof value.metadata === 'object'
    })
  } catch {
    return []
  }
}

function persistRecords(records: SourceMetadataRecord[]) {
  try {
    localStorage.setItem(LS_SOURCE_METADATA, JSON.stringify(records))
  } catch {
    // Metadata is a convenience cache; storage quota should not block analysis.
  }
}

export function saveSourceMetadataRecord(
  sourceName: string | null,
  metadata: ExploreSourceMetadata | null | undefined
) {
  if (!metadata) return
  const key = recordKey(sourceName, metadata)
  if (!key) return

  const record: SourceMetadataRecord = {
    key,
    sourceName,
    metadata,
    savedAt: new Date().toISOString(),
  }
  const records = loadRecords().filter((item) => item.key !== key)
  persistRecords([record, ...records].slice(0, 200))
}

export function findSourceMetadataRecord(sourceName: string): SourceMetadataRecord | null {
  const target = normalizeSourceKey(sourceName)
  if (!target) return null

  return loadRecords().find((record) => {
    const metadata = record.metadata
    return normalizeSourceKey(record.sourceName) === target
      || normalizeSourceKey(metadata.name) === target
      || normalizeSourceKey(metadata.path) === target
      || normalizeSourceKey(metadata.url) === target
  }) ?? null
}
