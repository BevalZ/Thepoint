import { motion } from 'framer-motion'
import { ChevronRight, CornerDownRight } from 'lucide-react'
import type { StoredPoint } from '@/api/types'
import { useLibraryStore } from '@/store'
import { cn } from '@/lib/utils'
import { DeepenActions } from './DeepenActions'

const TAG_STYLES: Record<string, string> = {
  事实陈述: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  作者观点: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  待验证疑问: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
}

const TAG_FALLBACK = 'border-border-strong bg-bg-hover text-fg-muted'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

interface TreeNode {
  point: StoredPoint
  children: TreeNode[]
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
  return roots
}

interface PointTreeProps {
  points: StoredPoint[]
  className?: string
}

export function PointTree({ points, className }: PointTreeProps) {
  const roots = buildTree(points)
  return (
    <div className={cn('space-y-3', className)}>
      {roots.map((node, i) => (
        <TreeRow key={node.point.id} node={node} depth={0} index={i} />
      ))}
    </div>
  )
}

interface TreeRowProps {
  node: TreeNode
  depth: number
  index: number
}

function TreeRow({ node, depth, index }: TreeRowProps) {
  const { point, children } = node
  const { expanded, toggleExpanded, similar } = useLibraryStore()
  const hasChildren = children.length > 0
  const isOpen = expanded[point.id] ?? false
  const tagClass = (point.tagType && TAG_STYLES[point.tagType]) || TAG_FALLBACK
  const matches = similar[point.id] ?? []

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, delay: Math.min(index * 0.02, 0.2) }}
        className="rounded-lg border border-border bg-bg-elevated p-4"
      >
        <div className="flex items-start gap-2">
          {hasChildren ? (
            <button
              onClick={() => toggleExpanded(point.id)}
              className="mt-0.5 shrink-0 text-fg-faint transition-colors hover:text-fg"
              aria-label={isOpen ? '收起' : '展开'}
            >
              <ChevronRight
                size={16}
                className={cn('transition-transform', isOpen && 'rotate-90')}
              />
            </button>
          ) : (
            depth > 0 && (
              <CornerDownRight
                size={14}
                className="mt-1 shrink-0 text-fg-faint opacity-60"
              />
            )
          )}
          <div className="min-w-0 flex-1">
            {point.tagType && (
              <span
                className={cn(
                  'inline-block rounded-full border px-2 py-0.5 text-xs font-medium',
                  tagClass
                )}
              >
                {point.tagType}
              </span>
            )}
            <p className="mt-2 text-sm leading-relaxed text-fg">
              {point.content}
            </p>
            {(point.sourceDocName || point.createdAt) && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-faint">
                {point.sourceDocName && (
                  <span className="truncate">{point.sourceDocName}</span>
                )}
                {point.createdAt && <span>{formatDate(point.createdAt)}</span>}
              </div>
            )}

            <DeepenActions point={point} />

            {matches.length > 0 && (
              <div className="mt-3 rounded-md border border-border bg-bg p-3">
                <p className="mb-2 text-xs text-fg-muted">
                  相似观点（{matches.length}）
                </p>
                <div className="space-y-1.5">
                  {matches.map((match) => (
                    <p
                      key={match.id}
                      className="rounded border border-border bg-bg-elevated px-2.5 py-1.5 text-xs leading-relaxed text-fg-muted"
                    >
                      {match.content}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {hasChildren && isOpen && (
        <div className="mt-3 space-y-3 border-l border-border pl-4 sm:pl-5">
          {children.map((child, i) => (
            <TreeRow
              key={child.point.id}
              node={child}
              depth={depth + 1}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  )
}
