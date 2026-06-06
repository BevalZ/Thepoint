import { cn } from '@/lib/utils'
import type { StoredPoint } from '@/api/types'
import { PointTree } from '@/components/PointTree'
import { useLibraryStore } from '@/store'
import { Archive, ChevronRight, FileText, Inbox, Trash2 } from 'lucide-react'
import { useState } from 'react'

const NO_DOC = '（无来源）'
const DIGEST_SOURCE_NAME = '知识研报'
const DIGEST_TAG_TYPE = '研报摘要'

function sourceKey(point: StoredPoint) {
  if (point.sourceDocName?.trim()) return point.sourceDocName
  if (point.tagType === DIGEST_TAG_TYPE) return DIGEST_SOURCE_NAME
  return NO_DOC
}

function groupBySource(points: StoredPoint[]) {
  const map = new Map<string, StoredPoint[]>()
  for (const p of points) {
    if (p.parentId) continue
    const key = sourceKey(p)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  return map
}

interface Props { points: StoredPoint[]; onArchive: (id: string) => void }

export function GroupedView({ points, onArchive }: Props) {
  const { archiveMany, deleteMany } = useLibraryStore()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const groups = groupBySource(points)

  return (
    <div className="space-y-3 pb-6">
      {[...groups.entries()].map(([source, rootPoints]) => {
        const rootIds = new Set(rootPoints.map(p => p.id))
        const groupPoints = points.filter(p => {
          if (rootIds.has(p.id)) return true
          let cur: StoredPoint | undefined = p
          while (cur?.parentId) {
            const parent = points.find(x => x.id === cur!.parentId)
            if (!parent) break
            if (rootIds.has(parent.id)) return true
            cur = parent
          }
          return false
        })
        const isOpen = !collapsed[source]
        return (
          <div key={source} className="rounded-xl border border-border overflow-hidden">
            <div className="group flex w-full items-center gap-3 px-4 py-3 bg-bg-elevated hover:bg-bg-hover transition-colors">
              <button onClick={() => setCollapsed(s => ({ ...s, [source]: !s[source] }))}
                className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <ChevronRight size={15} className={cn('shrink-0 text-fg-muted transition-transform', isOpen && 'rotate-90')} />
                {source === NO_DOC ? <Inbox size={15} className="shrink-0 text-fg-faint" /> : <FileText size={15} className="shrink-0 text-accent" />}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{source}</span>
              </button>
              <span className="shrink-0 text-xs text-fg-faint">{rootPoints.length} 条</span>
              <button
                onClick={() => archiveMany(groupPoints.map(p => p.id))}
                title="归档整个文档的观点"
                aria-label="归档整个文档的观点"
                className="shrink-0 text-fg-faint opacity-0 transition-opacity hover:text-fg-muted group-hover:opacity-100"
              >
                <Archive size={14} />
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`确认删除「${source}」下的全部 ${groupPoints.length} 个观点（含深挖子节点）？此操作不可恢复。`))
                    deleteMany(rootPoints.map(p => p.id))
                }}
                title="删除整个文档的观点"
                aria-label="删除整个文档的观点"
                className="shrink-0 text-fg-faint opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {isOpen && (
              <div className="px-4 py-4 bg-bg">
                <PointTree points={groupPoints} onArchive={onArchive} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
