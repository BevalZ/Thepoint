import { describe, expect, it } from 'vitest'
import {
  initialExplorePresentation,
  nextRevealPresentationCount,
  nextStagePresentationCount,
} from './explorePresentation'

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

  it('pauses presentation-only stage work while Explore is inactive', () => {
    expect(nextStagePresentationCount({
      active: false,
      busy: true,
      current: 2,
      target: 8,
    })).toBeNull()
    expect(nextStagePresentationCount({
      active: true,
      busy: true,
      current: 2,
      target: 8,
    })).toBe(3)
  })

  it('reveals one result per tick and catches up immediately when hidden or restored', () => {
    expect(nextRevealPresentationCount({
      active: true,
      showProcessing: false,
      target: 5,
      current: 2,
      skipInitialReveal: false,
    })).toBe(3)
    expect(nextRevealPresentationCount({
      active: false,
      showProcessing: false,
      target: 5,
      current: 2,
      skipInitialReveal: false,
    })).toBe(Number.MAX_SAFE_INTEGER)
    expect(nextRevealPresentationCount({
      active: true,
      showProcessing: false,
      target: 5,
      current: 0,
      skipInitialReveal: true,
    })).toBe(Number.MAX_SAFE_INTEGER)
    expect(nextRevealPresentationCount({
      active: true,
      showProcessing: true,
      target: 5,
      current: 4,
      skipInitialReveal: false,
    })).toBe(0)
  })
})
