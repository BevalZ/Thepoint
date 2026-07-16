import { describe, expect, it } from 'vitest'
import type { ExploreHistoryItem } from '@/api/types'
import { upsertExploreHistorySnapshot } from './exploreHistory'

function item(id: string, sourceId: string | null, updatedAt = id): ExploreHistoryItem {
  return {
    id,
    sourceId,
    sourceName: id,
    sourceUrl: null,
    sourceMetadata: null,
    text: `text-${id}`,
    richHtml: null,
    chunkCards: [{ index: 0, text: `chunk-${id}`, summary: id, hotTake: '', labels: [] }],
    contentPlan: null,
    previewImage: null,
    createdAt: `created-${id}`,
    updatedAt,
    archived: false,
  }
}

describe('upsertExploreHistorySnapshot', () => {
  it('updates an existing persisted source snapshot without changing stable identity', () => {
    const existing = item('history-1', 'source-1', 'old')
    const other = item('history-2', 'source-2')
    const replacement = {
      ...item('new-id', 'source-1', 'new'),
      text: 'fresh text',
    }

    const next = upsertExploreHistorySnapshot({
      items: [other, existing],
      item: replacement,
      maxActive: 48,
    })

    expect(next).toHaveLength(2)
    expect(next[0]).toMatchObject({
      id: 'history-1',
      sourceId: 'source-1',
      createdAt: 'created-history-1',
      updatedAt: 'new',
      text: 'fresh text',
    })
    expect(next[1].id).toBe('history-2')
  })

  it('keeps pasted snapshots append-only because they do not have a persisted source id', () => {
    const next = upsertExploreHistorySnapshot({
      items: [item('paste-1', null)],
      item: item('paste-2', null),
      maxActive: 48,
    })

    expect(next.map((entry) => entry.id)).toEqual(['paste-2', 'paste-1'])
  })

  it('preserves archived state while moving updated source snapshots to the front', () => {
    const archived = { ...item('archived', 'source-1'), archived: true }
    const next = upsertExploreHistorySnapshot({
      items: [item('active', 'source-2'), archived],
      item: item('replacement', 'source-1'),
      maxActive: 48,
    })

    expect(next.map((entry) => entry.id)).toEqual(['active', 'archived'])
    expect(next[1].archived).toBe(true)
  })
})
