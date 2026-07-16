interface InitialExplorePresentationInput {
  hasContent: boolean
  busy: boolean
}

interface ExplorePresentationState {
  stageCompletedCount: number
  revealedCount: number
  skipInitialReveal: boolean
}

interface NextStageCountInput {
  active: boolean
  busy: boolean
  current: number
  target: number
}

interface NextRevealCountInput {
  active: boolean
  showProcessing: boolean
  target: number
  current: number
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

export function nextStagePresentationCount({
  active,
  busy,
  current,
  target,
}: NextStageCountInput): number | null {
  if (target === 0) return 0
  if (!active) return null
  if (current >= target) return null
  return Math.min(current + 1, target)
}

export function nextRevealPresentationCount({
  active,
  showProcessing,
  target,
  current,
  skipInitialReveal,
}: NextRevealCountInput): number {
  if (showProcessing || target === 0) return 0
  if (skipInitialReveal || !active) return Number.MAX_SAFE_INTEGER
  return Math.min(current + 1, target)
}
