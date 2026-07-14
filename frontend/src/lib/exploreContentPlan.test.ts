import { describe, expect, it } from 'vitest'
import type { ContentPlan } from '@/api/types'
import { sourceBlocksFromContentPlan } from './exploreContentPlan'

describe('sourceBlocksFromContentPlan', () => {
  it('preserves canonical chunk indexes around images', () => {
    const plan: ContentPlan = {
      units: [
        { index: 0, kind: 'paragraph', text: 'Before', headingPath: [], headingLevel: null, mediaUrl: null, caption: null },
        { index: 1, kind: 'image', text: 'Chart', headingPath: [], headingLevel: null, mediaUrl: 'https://example.com/chart.png', caption: 'Results' },
        { index: 2, kind: 'paragraph', text: 'After', headingPath: [], headingLevel: null, mediaUrl: null, caption: null },
      ],
      chunks: [
        { id: 'chunk-before', index: 0, unitStart: 0, unitEnd: 0, headingPath: [], text: 'Before', estimatedTokens: 1, splitReason: 'natural_paragraph' },
        { id: 'chunk-after', index: 1, unitStart: 2, unitEnd: 2, headingPath: [], text: 'After', estimatedTokens: 1, splitReason: 'image_boundary' },
      ],
    }

    expect(sourceBlocksFromContentPlan(plan)).toEqual([
      { type: 'text', text: 'Before', chunkId: 'chunk-before', chunkIndex: 0 },
      { type: 'image', src: 'https://example.com/chart.png', alt: 'Chart', caption: 'Results' },
      { type: 'text', text: 'After', chunkId: 'chunk-after', chunkIndex: 1 },
    ])
  })

  it('returns no blocks for a missing compatibility plan', () => {
    expect(sourceBlocksFromContentPlan(null)).toEqual([])
  })
})
