import type { StoredPoint } from '@/api/types'
import { Archive, LocateFixed } from 'lucide-react'
import { SourceExcerptButton } from '@/components/SourceExcerptButton'

interface Props {
  points: StoredPoint[]
  onArchive: (id: string) => void
  onOpenSource?: (point: StoredPoint) => void
}

export function TableView({ points, onArchive, onOpenSource }: Props) {
  const roots = points.filter(p => !p.parentId)
  return (
    <div className="pb-6 overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border text-fg-muted text-left">
            <th className="py-2 pr-4 font-medium w-1/2">内容</th>
            <th className="py-2 pr-4 font-medium">来源</th>
            <th className="py-2 pr-4 font-medium">标签</th>
            <th className="py-2 pr-4 font-medium">时间</th>
            <th className="py-2 font-medium w-8" />
          </tr>
        </thead>
        <tbody>
          {roots.map(p => (
            <tr key={p.id} className="border-b border-border/50 hover:bg-bg-elevated transition-colors">
              <td className="py-2 pr-4 text-fg leading-relaxed">{p.content}</td>
              <td className="py-2 pr-4 text-fg-muted truncate max-w-[140px]">{p.sourceDocName ?? '—'}</td>
              <td className="py-2 pr-4 text-fg-faint text-xs">{p.tagType ?? '—'}</td>
              <td className="py-2 pr-4 text-fg-faint text-xs whitespace-nowrap">{p.createdAt.slice(0, 10)}</td>
              <td className="py-2">
                <div className="flex items-center gap-1">
                <SourceExcerptButton
                  point={p}
                  className="p-1 rounded text-fg-faint hover:text-accent transition-colors"
                />
                {onOpenSource && (
                  <button
                    onClick={() => onOpenSource(p)}
                    className="p-1 rounded text-fg-faint hover:text-accent transition-colors"
                    title="定位来源"
                  >
                    <LocateFixed size={13} />
                  </button>
                )}
                <button onClick={() => onArchive(p.id)} className="p-1 rounded text-fg-faint hover:text-fg-muted transition-colors" title="归档">
                  <Archive size={13} />
                </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
