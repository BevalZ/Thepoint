import type { StoredPoint } from '@/api/types'

export const NO_SOURCE_GROUP = '（无来源）'
const DIGEST_SOURCE_NAME = '知识研报'
const DIGEST_TAG_TYPE = '研报摘要'

export interface StoredPointGroup {
  source: string
  roots: StoredPoint[]
  points: StoredPoint[]
}

function sourceKey(point: StoredPoint): string {
  if (point.sourceDocName?.trim()) return point.sourceDocName
  if (point.tagType === DIGEST_TAG_TYPE) return DIGEST_SOURCE_NAME
  return NO_SOURCE_GROUP
}

export function groupStoredPointsBySource(points: StoredPoint[]): StoredPointGroup[] {
  const byId = new Map(points.map((point) => [point.id, point]))
  const rootById = new Map<string, StoredPoint | null>()

  const findRoot = (point: StoredPoint): StoredPoint | null => {
    if (rootById.has(point.id)) return rootById.get(point.id) ?? null
    const path: StoredPoint[] = []
    const seen = new Set<string>()
    let current: StoredPoint | undefined = point
    while (current?.parentId) {
      if (seen.has(current.id)) {
        current = undefined
        break
      }
      seen.add(current.id)
      path.push(current)
      const cached = rootById.get(current.parentId)
      if (cached !== undefined) {
        current = cached ?? undefined
        break
      }
      current = byId.get(current.parentId)
    }
    const root = current && !current.parentId ? current : null
    rootById.set(point.id, root)
    path.forEach((item) => rootById.set(item.id, root))
    return root
  }

  const groups = new Map<string, StoredPointGroup>()
  for (const point of points) {
    if (point.parentId) continue
    const source = sourceKey(point)
    const group = groups.get(source) ?? { source, roots: [], points: [] }
    group.roots.push(point)
    groups.set(source, group)
    rootById.set(point.id, point)
  }

  for (const point of points) {
    const root = findRoot(point)
    if (!root) continue
    groups.get(sourceKey(root))?.points.push(point)
  }

  return Array.from(groups.values())
}
