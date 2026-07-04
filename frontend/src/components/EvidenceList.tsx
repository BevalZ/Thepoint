import { ExternalLink, LocateFixed } from 'lucide-react'
import { useEffect, useState } from 'react'
import { listEvidenceForPoint } from '@/api'
import type { EvidenceRecord } from '@/api/types'
import { cn } from '@/lib/utils'

const VERDICT_LABELS: Record<EvidenceRecord['verdict'], string> = {
  supported: '支持',
  contradicted: '反驳',
  mixed: '混合',
  uncertain: '不确定',
}

const VERDICT_CLASSES: Record<EvidenceRecord['verdict'], string> = {
  supported: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  contradicted: 'border-red-500/30 bg-red-500/10 text-red-300',
  mixed: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  uncertain: 'border-border bg-bg-hover text-fg-muted',
}

function formatEvidenceDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface EvidenceListProps {
  records: EvidenceRecord[]
  title?: string
  className?: string
  onOpenSource?: (sourceId: string, chunkIndex: number | null) => void
}

export function EvidenceList({ records, title = 'Evidence', className, onOpenSource }: EvidenceListProps) {
  if (records.length === 0) return null

  return (
    <section className={cn('border-t border-border pt-3', className)}>
      <div className="mb-2 flex items-center justify-between text-xs text-fg-faint">
        <span>{title}</span>
        <span>{records.length}</span>
      </div>
      <div className="space-y-3">
        {records.map((record) => {
          const canOpenSource = Boolean(record.sourceId)
          return (
            <article key={record.id} className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', VERDICT_CLASSES[record.verdict])}>
                      {VERDICT_LABELS[record.verdict]}
                    </span>
                    <span className="text-[11px] text-fg-faint">{formatEvidenceDate(record.checkedAt)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-fg">{record.claim}</p>
                </div>
                {canOpenSource ? (
                  <button
                    type="button"
                    onClick={() => onOpenSource?.(record.sourceId!, record.chunkIndex)}
                    className="mt-0.5 shrink-0 rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent"
                    title="回到来源块"
                  >
                    <LocateFixed size={12} className="inline" />
                  </button>
                ) : (
                  <span className="mt-1 shrink-0 text-[11px] text-fg-faint">无来源定位</span>
                )}
              </div>
              <p className="line-clamp-3 text-xs leading-relaxed text-fg-muted">{record.answer}</p>
              {record.sources.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {record.sources.slice(0, 4).map((source, index) => (
                    <a
                      key={source.id}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent"
                      title={[source.title, source.url, source.snippet].filter(Boolean).join('\n')}
                    >
                      <ExternalLink size={11} />
                      {source.title?.trim() || `来源 ${index + 1}`}
                    </a>
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function PointEvidence({
  pointId,
  title = '证据',
  className,
  onOpenSource,
}: {
  pointId: string
  title?: string
  className?: string
  onOpenSource?: (sourceId: string, chunkIndex: number | null) => void
}) {
  const [records, setRecords] = useState<EvidenceRecord[]>([])

  useEffect(() => {
    let alive = true
    listEvidenceForPoint(pointId)
      .then((next) => { if (alive) setRecords(next) })
      .catch(() => { if (alive) setRecords([]) })
    return () => { alive = false }
  }, [pointId])

  return <EvidenceList records={records} title={title} className={className} onOpenSource={onOpenSource} />
}
