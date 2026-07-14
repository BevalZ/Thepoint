import type { ContentPlan } from '@/api/types'

export type ExploreSourceBlock =
  | { type: 'text'; text: string; chunkId?: string; chunkIndex?: number }
  | { type: 'image'; src: string; alt: string; caption: string | null }

export function sourceBlocksFromContentPlan(plan: ContentPlan | null): ExploreSourceBlock[] {
  if (!plan || plan.chunks.length === 0) return []
  const chunks = [...plan.chunks].sort((left, right) => left.index - right.index)
  const images = plan.units
    .filter((unit) => unit.kind === 'image' && unit.mediaUrl)
    .sort((left, right) => left.index - right.index)
  const blocks: ExploreSourceBlock[] = []
  let chunkCursor = 0

  for (const image of images) {
    while (chunkCursor < chunks.length && chunks[chunkCursor].unitEnd < image.index) {
      const chunk = chunks[chunkCursor]
      blocks.push({ type: 'text', text: chunk.text, chunkId: chunk.id, chunkIndex: chunk.index })
      chunkCursor += 1
    }
    blocks.push({
      type: 'image',
      src: image.mediaUrl!,
      alt: image.text,
      caption: image.caption,
    })
  }

  while (chunkCursor < chunks.length) {
    const chunk = chunks[chunkCursor]
    blocks.push({ type: 'text', text: chunk.text, chunkId: chunk.id, chunkIndex: chunk.index })
    chunkCursor += 1
  }
  return blocks
}
