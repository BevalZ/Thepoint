interface InitialExplorePresentationInput {
  hasContent: boolean
  busy: boolean
}

interface ExplorePresentationState {
  stageCompletedCount: number
  revealedCount: number
  skipInitialReveal: boolean
}

export function initialExplorePresentation({
  hasContent,
  busy,
}: InitialExplorePresentationInput): ExplorePresentationState {
  const completed = hasContent && !busy ? Number.MAX_SAFE_INTEGER : 0
  return {
    stageCompletedCount: completed,
    revealedCount: completed,
    skipInitialReveal: completed > 0,
  }
}
