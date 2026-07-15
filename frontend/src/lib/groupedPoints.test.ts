import { describe, expect, it } from 'vitest'
import { groupStoredPointsBySource, NO_SOURCE_GROUP } from './groupedPoints'
import type { StoredPoint } from '@/api/types'

function point(id: string, parentId: string | null, sourceDocName: string | null): StoredPoint {
  return {
    id,
    parentId,
    sourceDocName,
    content: id,
    tagType: '作者观点',
    sourceExcerpt: null,
    createdAt: '',
    archived: false,
    starred: false,
  }
}

describe('groupStoredPointsBySource', () => {
  it('groups roots and descendants in one stable source group', () => {
    const root = point('root', null, 'Source A')
    const child = point('child', 'root', null)
    const grandchild = point('grandchild', 'child', null)

    expect(groupStoredPointsBySource([root, child, grandchild])).toEqual([{
      source: 'Source A',
      roots: [root],
      points: [root, child, grandchild],
    }])
  })

  it('keeps unsourced roots separate and ignores orphan descendants', () => {
    const root = point('root', null, null)
    const orphan = point('orphan', 'missing', null)

    expect(groupStoredPointsBySource([root, orphan])).toEqual([{
      source: NO_SOURCE_GROUP,
      roots: [root],
      points: [root],
    }])
  })
})
