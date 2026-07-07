import { describe, expect, it } from 'vitest'
import { splitSourceHighlight } from './sourceHighlight'

describe('source highlight helpers', () => {
  it('uses locator character offsets when they match the quote', () => {
    const segments = splitSourceHighlight('前文证据片段后文', {
      sourceId: 'source-1',
      quote: '证据片段',
      start: 2,
      end: 6,
    })

    expect(segments).toEqual([
      { kind: 'text', text: '前文' },
      { kind: 'match', text: '证据片段' },
      { kind: 'text', text: '后文' },
    ])
  })

  it('prefers offset when repeated quote text has multiple matches', () => {
    const segments = splitSourceHighlight('alpha quote beta quote gamma', {
      sourceId: 'source-1',
      quote: 'quote',
      start: 17,
      end: 22,
    })

    expect(segments?.map((segment) => segment.kind === 'match' ? `[${segment.text}]` : segment.text).join('')).toBe('alpha quote beta [quote] gamma')
  })

  it('falls back to exact quote search when offsets are missing', () => {
    const segments = splitSourceHighlight('source text with a cited claim', {
      sourceId: 'source-1',
      quote: 'cited claim',
    })

    expect(segments).toEqual([
      { kind: 'text', text: 'source text with a ' },
      { kind: 'match', text: 'cited claim' },
    ])
  })

  it('returns null when the requested highlight cannot be found', () => {
    expect(splitSourceHighlight('plain source text', {
      sourceId: 'source-1',
      quote: 'missing quote',
      start: 50,
      end: 63,
    })).toBeNull()
  })
})
