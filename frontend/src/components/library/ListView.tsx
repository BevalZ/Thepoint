import type { StoredPoint } from '@/api/types'
import { PointTree } from '@/components/PointTree'

interface Props {
  points: StoredPoint[]
  onArchive: (id: string) => void
  onOpenSource?: (point: StoredPoint) => void
  onOpenEvidenceSource?: (sourceId: string, chunkIndex: number | null) => void
}

export function ListView({ points, onArchive, onOpenSource, onOpenEvidenceSource }: Props) {
  const roots = points.filter(p => !p.parentId)
  return (
    <div className="pb-6">
      <PointTree points={[...roots, ...points.filter(p => p.parentId)]} onArchive={onArchive} onOpenSource={onOpenSource} onOpenEvidenceSource={onOpenEvidenceSource} />
    </div>
  )
}
