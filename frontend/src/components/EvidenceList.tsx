import { ExternalLink, LocateFixed } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { listEvidenceForPoint } from '@/api'
import type { AppConfig, EvidenceRecord } from '@/api/types'
import { cn } from '@/lib/utils'
import { useNearViewport } from '@/hooks/useNearViewport'

type UiLanguage = AppConfig['uiLanguage']

const VERDICT_LABELS: Record<UiLanguage, Record<EvidenceRecord['verdict'], string>> = {
  'zh-CN': {
    supported: '支持',
    contradicted: '反驳',
    mixed: '混合',
    uncertain: '不确定',
  },
  'en-US': {
    supported: 'Supported',
    contradicted: 'Contradicted',
    mixed: 'Mixed',
    uncertain: 'Uncertain',
  },
}

const VERDICT_CLASSES: Record<EvidenceRecord['verdict'], string> = {
  supported: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  contradicted: 'border-red-500/30 bg-red-500/10 text-red-300',
  mixed: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  uncertain: 'border-border bg-bg-hover text-fg-muted',
}

function isZh(language: UiLanguage): boolean {
  return language !== 'en-US'
}

function copy(language: UiLanguage, zh: string, en: string): string {
  return isZh(language) ? zh : en
}

function formatEvidenceDate(value: string, language: UiLanguage): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(isZh(language) ? 'zh-CN' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface EvidenceListProps {
  records: EvidenceRecord[]
  title?: string
  language?: UiLanguage
  className?: string
  onOpenSource?: (sourceId: string, chunkIndex: number | null) => void
  renderAction?: (record: EvidenceRecord) => ReactNode
}

export function EvidenceList({ records, title, language = 'zh-CN', className, onOpenSource, renderAction }: EvidenceListProps) {
  if (records.length === 0) return null
  const resolvedTitle = title ?? copy(language, '证据', 'Evidence')

  return (
    <section className={cn('border-t border-border pt-3', className)}>
      <div className="mb-2 flex items-center justify-between text-xs text-fg-faint">
        <span>{resolvedTitle}</span>
        <span>{records.length}</span>
      </div>
      <div className="space-y-3">
        {records.map((record) => {
          const openSource = onOpenSource
          const canOpenSource = Boolean(record.sourceId && openSource)
          return (
            <article key={record.id} className="perf-content-auto space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', VERDICT_CLASSES[record.verdict])}>
                      {VERDICT_LABELS[language][record.verdict]}
                    </span>
                    <span className="text-[11px] text-fg-faint">{formatEvidenceDate(record.checkedAt, language)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-fg">{record.claim}</p>
                </div>
                <div className="mt-0.5 flex shrink-0 items-center gap-1">
                  {renderAction?.(record)}
                  {canOpenSource ? (
                    <button
                      type="button"
                      onClick={() => openSource?.(record.sourceId!, record.chunkIndex)}
                      className="rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent"
                      title={copy(language, '回到来源块', 'Open source chunk')}
                    >
                      <LocateFixed size={12} className="inline" />
                    </button>
                  ) : (
                    <span className="mt-0.5 text-[11px] text-fg-faint">{copy(language, '无来源定位', 'No source location')}</span>
                  )}
                </div>
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
                      {source.title?.trim() || copy(language, `来源 ${index + 1}`, `Source ${index + 1}`)}
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
  language = 'zh-CN',
  className,
  onOpenSource,
}: {
  pointId: string
  title?: string
  language?: UiLanguage
  className?: string
  onOpenSource?: (sourceId: string, chunkIndex: number | null) => void
}) {
  const [records, setRecords] = useState<EvidenceRecord[]>([])
  const { ref, nearViewport } = useNearViewport<HTMLDivElement>()

  useEffect(() => {
    if (!nearViewport) return
    let alive = true
    listEvidenceForPoint(pointId)
      .then((next) => { if (alive) setRecords(next) })
      .catch(() => { if (alive) setRecords([]) })
    return () => { alive = false }
  }, [nearViewport, pointId])

  return (
    <div ref={ref}>
      {nearViewport && (
        <EvidenceList records={records} title={title} language={language} className={className} onOpenSource={onOpenSource} />
      )}
    </div>
  )
}
