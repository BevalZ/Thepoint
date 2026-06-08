import type { StoredPoint } from '@/api/types'

export interface TreeNode {
  point: StoredPoint
  children: TreeNode[]
}

function createdTime(point: StoredPoint): number {
  const time = new Date(point.createdAt).getTime()
  return Number.isNaN(time) ? 0 : time
}

/** Build a forest from a flat list of points keyed by parentId. */
export function buildTree(points: StoredPoint[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  for (const point of points) {
    byId.set(point.id, { point, children: [] })
  }

  const roots: TreeNode[] = []
  for (const node of byId.values()) {
    const parentId = node.point.parentId
    const parent = parentId ? byId.get(parentId) : undefined
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const sortNode = (node: TreeNode) => {
    node.children.sort((left, right) => createdTime(right.point) - createdTime(left.point))
    node.children.forEach(sortNode)
  }
  roots.sort((left, right) => createdTime(right.point) - createdTime(left.point))
  roots.forEach(sortNode)
  return roots
}
