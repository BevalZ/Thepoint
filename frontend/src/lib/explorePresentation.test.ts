import { describe, expect, it } from 'vitest'
import { initialExplorePresentation } from './explorePresentation'

describe('initialExplorePresentation', () => {
  it('shows existing non-busy content immediately after Explore remounts', () => {
    expect(initialExplorePresentation({ hasContent: true, busy: false })).toEqual({
      stageCompletedCount: Number.MAX_SAFE_INTEGER,
      revealedCount: Number.MAX_SAFE_INTEGER,
      skipInitialReveal: true,
    })
  })

  it('keeps empty and actively processing sessions at the initial stage', () => {
    expect(initialExplorePresentation({ hasContent: false, busy: false })).toEqual({
      stageCompletedCount: 0,
      revealedCount: 0,
      skipInitialReveal: false,
    })
    expect(initialExplorePresentation({ hasContent: true, busy: true })).toEqual({
      stageCompletedCount: 0,
      revealedCount: 0,
      skipInitialReveal: false,
    })
  })
})
