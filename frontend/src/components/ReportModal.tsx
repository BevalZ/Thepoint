import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, Download, ExternalLink, LocateFixed, X } from 'lucide-react'
import { loadReportCitationAudit, loadReportInvocationAudit } from '@/api'
import { Markdown } from '@/components/Markdown'
import type { CitationLocatorStatus, ReportCitationAudit, ReportInvocationAudit, ReportRecord } from '@/api/types'
import { citationKindLabel } from '@/lib/digestArtifacts'
import { digestResultFromReport, reportKindLabel, reportMarkdownWithCitations } from '@/lib/reportArtifacts'

const LOCATOR_STATUS_LABELS: Record<string, string> = {
  located: '已定位',
  multiple_matches: '多处匹配',
  not_found: '未命中',
  stale: '来源变更',
  target_missing: '目标缺失',
  not_applicable: '无摘录',
}

const LOCATOR_STATUS_CLASSES: Record<string, string> = {
  located: 'border-green-500/30 bg-green-500/10 text-green-300',
  multiple_matches: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  not_found: 'border-red-500/30 bg-red-500/10 text-red-300',
  stale: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
  target_missing: 'border-red-500/30 bg-red-500/10 text-red-300',
  not_applicable: 'border-border bg-bg-hover text-fg-faint',
}

const CONTEXT_ROLE_LABELS: Record<string, string> = {
  source: 'Source',
  point: 'Point',
  evidence: 'Evidence',
  prior_report: '历史 Report',
  journal_recall: 'Journal recall',
  related_clue: 'Related clue',
}

function locatorStatusLabel(status: CitationLocatorStatus): string {
  return LOCATOR_STATUS_LABELS[status] ?? status
}

function locatorStatusClass(status: CitationLocatorStatus): string {
  return LOCATOR_STATUS_CLASSES[status] ?? 'border-border bg-bg-hover text-fg-faint'
}

function contextRoleLabel(role: string): string {
  return CONTEXT_ROLE_LABELS[role] ?? role
}

function parseWarnings(warningsJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(warningsJson)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    return []
  }
}

function compactId(id: string): string {
  if (id.length <= 14) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

interface ReportModalProps {
  report: ReportRecord
  onClose: () => void
  onOpenSource?: (sourceId: string, focusChunkIndex?: number | null) => void
}

export function ReportModal({ report, onClose, onOpenSource }: ReportModalProps) {
  const [copied, setCopied] = useState(false)
  const [citationAudit, setCitationAudit] = useState<ReportCitationAudit | null>(null)
  const [citationAuditLoading, setCitationAuditLoading] = useState(false)
  const [citationAuditError, setCitationAuditError] = useState<string | null>(null)
  const [invocationAudit, setInvocationAudit] = useState<ReportInvocationAudit | null>(null)
  const [invocationAuditLoading, setInvocationAuditLoading] = useState(false)
  const [invocationAuditError, setInvocationAuditError] = useState<string | null>(null)
  const result = digestResultFromReport(report)

  useEffect(() => {
    let alive = true
    setCitationAudit(null)
    setCitationAuditError(null)
    setCitationAuditLoading(true)
    setInvocationAudit(null)
    setInvocationAuditError(null)
    setInvocationAuditLoading(true)

    Promise.allSettled([
      loadReportCitationAudit(report.id),
      loadReportInvocationAudit(report.id),
    ])
      .then(([nextCitationAudit, nextInvocationAudit]) => {
        if (!alive) return
        if (nextCitationAudit.status === 'fulfilled') {
          setCitationAudit(nextCitationAudit.value)
        } else {
          setCitationAuditError(nextCitationAudit.reason instanceof Error ? nextCitationAudit.reason.message : String(nextCitationAudit.reason))
        }
        if (nextInvocationAudit.status === 'fulfilled') {
          setInvocationAudit(nextInvocationAudit.value)
        } else {
          setInvocationAuditError(nextInvocationAudit.reason instanceof Error ? nextInvocationAudit.reason.message : String(nextInvocationAudit.reason))
        }
      })
      .finally(() => {
        if (!alive) return
        setCitationAuditLoading(false)
        setInvocationAuditLoading(false)
      })

    return () => {
      alive = false
    }
  }, [report.id])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(reportMarkdownWithCitations(report))
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const handleDownload = () => {
    const blob = new Blob([reportMarkdownWithCitations(report)], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `report-${report.kind}-${report.createdAt.slice(0, 10)}-${report.id.slice(0, 8)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const invocationWarnings = invocationAudit ? parseWarnings(invocationAudit.invocation.warningsJson) : []

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 8 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="relative flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-bg-elevated shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-fg">{report.title}</span>
              <span className="rounded-md border border-border px-2 py-0.5 text-[11px] text-fg-faint">
                {reportKindLabel(report.kind)}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-fg-faint">{report.summary}</p>
          </div>
          <div className="ml-4 flex shrink-0 items-center gap-2">
            <button onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg">
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? '已复制' : '复制'}
            </button>
            <button onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg">
              <Download size={12} />下载 MD
            </button>
            <button onClick={onClose}
              className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-bg-hover">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          <Markdown>{result.content}</Markdown>
          {(invocationAudit || invocationAuditLoading || invocationAuditError) && (
            <section className="mt-5 border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs text-fg-faint">
                <span>生成上下文</span>
                {invocationAuditLoading && <span>审计中...</span>}
                {invocationAuditError && <span className="text-red-300">审计失败</span>}
              </div>
              {invocationAudit && (
                <div className="rounded-xl border border-border bg-bg px-3 py-3">
                  <div className="grid gap-2 text-xs text-fg-muted sm:grid-cols-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-fg-faint">Model</div>
                      <div className="mt-1 truncate text-fg">{invocationAudit.invocation.modelName ?? '未记录'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-fg-faint">Prompt</div>
                      <div className="mt-1 truncate text-fg">{invocationAudit.invocation.promptVersion}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-fg-faint">Context</div>
                      <div className="mt-1 text-fg">
                        {invocationAudit.includedCount}/{invocationAudit.total} included
                        {invocationAudit.truncatedCount > 0 ? ` · ${invocationAudit.truncatedCount} truncated` : ''}
                      </div>
                    </div>
                  </div>
                  {invocationAudit.invocation.inputQuery && (
                    <p className="mt-3 line-clamp-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs text-fg-muted">
                      问题：{invocationAudit.invocation.inputQuery}
                    </p>
                  )}
                  {invocationWarnings.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {invocationWarnings.map((warning) => (
                        <span key={warning} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300">
                          {warning}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                    {invocationAudit.contextItems.map((item) => (
                      <article key={item.id} className="rounded-lg border border-border bg-bg-elevated px-3 py-2">
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 rounded-md border border-border bg-bg-hover px-2 py-0.5 text-[10px] text-fg-muted">
                            {item.label ?? contextRoleLabel(item.role)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] text-fg">{contextRoleLabel(item.role)}</span>
                              <span className="font-mono text-[10px] text-fg-faint">
                                {item.targetKind}:{compactId(item.targetId)}
                              </span>
                              {item.truncated && (
                                <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-1.5 py-0.5 text-[10px] text-orange-300">
                                  truncated
                                </span>
                              )}
                              {!item.included && (
                                <span className="rounded-full border border-border bg-bg-hover px-1.5 py-0.5 text-[10px] text-fg-faint">
                                  excluded
                                </span>
                              )}
                            </div>
                            {item.reason && (
                              <p className="mt-1 line-clamp-1 text-[11px] text-fg-muted">{item.reason}</p>
                            )}
                            <p className="mt-1 font-mono text-[10px] text-fg-faint">
                              chars={item.charCount ?? 'unknown'} · hash={item.sourceTextHash ?? 'none'}
                            </p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
          {result.citations.length > 0 && (
            <section className="mt-5 border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs text-fg-faint">
                <span>引用</span>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {citationAuditLoading && <span>审计中...</span>}
                  {citationAuditError && <span className="text-red-300">审计失败</span>}
                  {citationAudit && (
                    <>
                      <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-green-300">
                        定位 {citationAudit.locatedCount}/{citationAudit.total}
                      </span>
                      {(citationAudit.multipleMatchesCount + citationAudit.staleCount + citationAudit.notFoundCount + citationAudit.targetMissingCount) > 0 && (
                        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-amber-300">
                          待复查 {citationAudit.multipleMatchesCount + citationAudit.staleCount + citationAudit.notFoundCount + citationAudit.targetMissingCount}
                        </span>
                      )}
                    </>
                  )}
                  {!citationAudit && !citationAuditLoading && !citationAuditError && <span>{result.citations.length}</span>}
                </div>
              </div>
              <div className="space-y-2">
                {result.citations.map((citation, index) => {
                  const canOpenSource = Boolean(citation.sourceId && onOpenSource)
                  const auditItem = citationAudit?.citations.find((item) => item.citationIndex === index)
                  return (
                    <article key={`${citation.kind}-${citation.id}-${citation.label}`} className="rounded-lg border border-border bg-bg px-3 py-2">
                      <div className="flex items-start gap-3">
                        <span className="rounded-md border border-border bg-bg-hover px-2 py-1 text-[11px] font-medium text-fg-muted">
                          {citation.label}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-fg-faint">{citationKindLabel(citation.kind)}</span>
                            <span className="truncate text-xs font-medium text-fg">{citation.title}</span>
                            {auditItem && (
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${locatorStatusClass(auditItem.locator.status)}`}>
                                {locatorStatusLabel(auditItem.locator.status)}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">{citation.excerpt}</p>
                          {auditItem?.locator.locations[0]?.snippet && (
                            <p className="mt-1 line-clamp-1 text-[11px] text-fg-faint">
                              命中片段：{auditItem.locator.locations[0].snippet}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {citation.url && (
                            <a
                              href={citation.url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-border px-2 py-1 text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent"
                              title="打开证据链接"
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                          {canOpenSource && (
                            <button
                              type="button"
                              onClick={() => onOpenSource?.(citation.sourceId!, citation.chunkIndex)}
                              className="rounded-md border border-border px-2 py-1 text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent"
                              title="回到来源块"
                            >
                              <LocateFixed size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
