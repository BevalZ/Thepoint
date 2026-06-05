import type { StoredPoint } from '@/api/types'
import { PointTree } from '@/components/PointTree'

interface Props { points: StoredPoint[]; onArchive: (id: string) => void }

export function ListView({ points, onArchive }: Props) {
  const roots = points.filter(p => !p.parentId)
  return (
    <div className="pb-6">
      <PointTree points={[...roots, ...points.filter(p => p.parentId)]} onArchive={onArchive} />
    </div>
  )
}
