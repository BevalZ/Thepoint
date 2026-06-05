import { cn } from '@/lib/utils'
import type { StoredPoint } from '@/api/types'
import { PointTree } from '@/components/PointTree'
import { FileText, Inbox, ChevronRight } from 'lucide-react'
import { useState } from 'react'

const NO_DOC = '（无来源）'

function groupBySource(points: StoredPoint[]) {
  const map = new Map<string, StoredPoint[]>()
  for (const p of points) {
    if (p.parentId) continue
    const key = p.sourceDocName ?? NO_DOC
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  return map
}

interface Props { points: StoredPoint[]; onArchive: (id: string) => void }

export function GroupedView({ points, onArchive }: Props) {
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
            <button onClick={() => setCollapsed(s => ({ ...s, [source]: !s[source] }))}
              className="flex w-full items-center gap-3 px-4 py-3 bg-bg-elevated hover:bg-bg-hover transition-colors text-left">
              <ChevronRight size={15} className={cn('shrink-0 text-fg-muted transition-transform', isOpen && 'rotate-90')} />
              {source === NO_DOC ? <Inbox size={15} className="shrink-0 text-fg-faint" /> : <FileText size={15} className="shrink-0 text-accent" />}
              <span className="flex-1 truncate text-sm font-medium text-fg">{source}</span>
              <span className="text-xs text-fg-faint shrink-0">{rootPoints.length} 条</span>
            </button>
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
