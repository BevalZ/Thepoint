import type { StoredPoint } from '@/api/types'
import { Archive } from 'lucide-react'

const COLUMNS = ['事实陈述', '作者观点', '待验证疑问', '其他']

interface Props { points: StoredPoint[]; onArchive: (id: string) => void }

export function KanbanView({ points, onArchive }: Props) {
  const roots = points.filter(p => !p.parentId)
  const byTag = (tag: string) =>
    roots.filter(p => tag === '其他' ? !p.tagType || !COLUMNS.slice(0, 3).includes(p.tagType) : p.tagType === tag)

  return (
    <div className="flex gap-3 pb-6 overflow-x-auto">
      {COLUMNS.map(col => {
        const items = byTag(col)
        return (
          <div key={col} className="flex-1 min-w-[180px]">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-medium text-fg-muted">{col}</span>
              <span className="text-xs text-fg-faint">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map(p => (
                <div key={p.id} className="rounded-lg border border-border bg-bg-elevated p-3 text-sm text-fg leading-relaxed group">
                  <p className="line-clamp-4">{p.content}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-fg-faint truncate">{p.sourceDocName ?? '—'}</span>
                    <button onClick={() => onArchive(p.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-fg-faint hover:text-fg-muted transition-all"
                      title="归档">
                      <Archive size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
