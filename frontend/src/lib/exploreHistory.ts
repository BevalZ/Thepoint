import type { ExploreHistoryItem } from '@/api/types'

interface UpsertExploreHistoryInput {
  items: ExploreHistoryItem[]
  item: ExploreHistoryItem
  maxActive: number
}

export function upsertExploreHistorySnapshot({
  items,
  item,
  maxActive,
}: UpsertExploreHistoryInput): ExploreHistoryItem[] {
  const existingIndex = item.sourceId
    ? items.findIndex((entry) => entry.sourceId === item.sourceId)
    : -1
  const existing = existingIndex >= 0 ? items[existingIndex] : null
  const nextItem = existing
    ? {
        ...item,
        id: existing.id,
        createdAt: existing.createdAt,
        archived: existing.archived,
      }
    : item
  const withoutExisting = existingIndex >= 0
    ? items.filter((_, index) => index !== existingIndex)
    : items
  return compactExploreHistory([nextItem, ...withoutExisting], maxActive)
}

export function compactExploreHistory(items: ExploreHistoryItem[], maxActive: number): ExploreHistoryItem[] {
  const archived = items.filter((item) => item.archived)
  const active = items
    .filter((item) => !item.archived)
    .slice(0, maxActive)
  return [...active, ...archived]
}
