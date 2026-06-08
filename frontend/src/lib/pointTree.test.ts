import { describe, expect, it } from 'vitest'
import type { StoredPoint } from '@/api/types'
import { buildTree } from './pointTree'

function point(id: string, parentId: string | null, createdAt: string): StoredPoint {
  return {
    id,
    content: id,
    tagType: id === 'fact-check' ? '事实审查' : '事实陈述',
    parentId,
    sourceDocName: 'source',
    sourceExcerpt: null,
    createdAt,
    archived: false,
    starred: false,
  }
}

describe('buildTree', () => {
  it('keeps persisted child points under their parent and sorts newest children first', () => {
    const roots = buildTree([
      point('old-child', 'root', '2026-06-08T01:00:00Z'),
      point('root', null, '2026-06-08T00:00:00Z'),
      point('fact-check', 'root', '2026-06-08T02:00:00Z'),
    ])

    expect(roots).toHaveLength(1)
    expect(roots[0].point.id).toBe('root')
    expect(roots[0].children.map(child => child.point.id)).toEqual([
      'fact-check',
      'old-child',
    ])
  })
})
