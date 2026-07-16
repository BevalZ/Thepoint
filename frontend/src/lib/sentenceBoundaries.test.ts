import { describe, expect, it } from 'vitest'
import { isSentenceBreakAt, splitSentenceLikeParts } from './sentenceBoundaries'

describe('sentenceBoundaries', () => {
  it('does not split inside English abbreviations', () => {
    const text = 'Mutation prompts (i.e. instructions to an LLM) are improved. GEPA uses trial and error, e.g. reflection traces from trajectories.'
    const parts = splitSentenceLikeParts(text, 400)

    expect(parts).toEqual([
      'Mutation prompts (i.e. instructions to an LLM) are improved.',
      'GEPA uses trial and error, e.g. reflection traces from trajectories.',
    ])
    expect(parts.some((part) => part.startsWith('e. instructions'))).toBe(false)
  })

  it('protects citations and decimals while preserving real sentence breaks', () => {
    const text = 'Fernando et al. 2023 reported a 3.5 improvement. The next sentence starts here.'
    const chars = Array.from(text)

    expect(isSentenceBreakAt(chars, text.indexOf('al.') + 2)).toBe(false)
    expect(isSentenceBreakAt(chars, text.indexOf('3.5') + 1)).toBe(false)
    expect(splitSentenceLikeParts(text, 400)).toEqual([
      'Fernando et al. 2023 reported a 3.5 improvement.',
      'The next sentence starts here.',
    ])
  })

  it('protects versions, URLs, domains, and compact initials', () => {
    const text = 'J. R. Smith documented v1.2.3 at https://example.com/docs. The release remains available.'

    expect(splitSentenceLikeParts(text, 400)).toEqual([
      'J. R. Smith documented v1.2.3 at https://example.com/docs.',
      'The release remains available.',
    ])
  })

  it('preserves CJK sentence boundaries and clamps an invalid hard limit', () => {
    expect(splitSentenceLikeParts('第一句。第二句！第三句？', 400)).toEqual([
      '第一句。',
      '第二句！',
      '第三句？',
    ])
    expect(splitSentenceLikeParts('AB', 0)).toEqual(['A', 'B'])
  })
})
