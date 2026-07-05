import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, Download, ExternalLink, LocateFixed, X } from 'lucide-react'
import { Markdown } from '@/components/Markdown'
import type { ReportRecord } from '@/api/types'
import { citationKindLabel } from '@/lib/digestArtifacts'
import { digestResultFromReport, reportKindLabel, reportMarkdownWithCitations } from '@/lib/reportArtifacts'

interface ReportModalProps {
  report: ReportRecord
  onClose: () => void
  onOpenSource?: (sourceId: string, focusChunkIndex?: number | null) => void
}

export function ReportModal({ report, onClose, onOpenSource }: ReportModalProps) {
  const [copied, setCopied] = useState(false)
  const result = digestResultFromReport(report)

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
          {result.citations.length > 0 && (
            <section className="mt-5 border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between text-xs text-fg-faint">
                <span>引用</span>
                <span>{result.citations.length}</span>
              </div>
              <div className="space-y-2">
                {result.citations.map((citation) => {
                  const canOpenSource = Boolean(citation.sourceId && onOpenSource)
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
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">{citation.excerpt}</p>
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
