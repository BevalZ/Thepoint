import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Copy, Download, BookmarkPlus, Check, Loader2, LocateFixed, ExternalLink } from 'lucide-react'
import { savePoints } from '@/api'
import { Markdown } from '@/components/Markdown'
import type { DigestCitation, DigestResult, StoredPoint } from '@/api/types'

export const DIGEST_SOURCE_NAME = '知识研报'

interface Props {
  result: DigestResult
  starredPoints: StoredPoint[]
  onClose: () => void
  onOpenSource?: (sourceId: string, focusChunkIndex?: number | null) => void
}

function citationKindLabel(kind: DigestCitation['kind']): string {
  return kind === 'evidence' ? 'Evidence' : 'Point'
}

function citationMarkdown(citations: DigestCitation[]): string {
  if (citations.length === 0) return ''
  return [
    '## 引用清单',
    '',
    ...citations.map((citation) => [
      `### [${citation.label}] ${citationKindLabel(citation.kind)}`,
      `ID: ${citation.id}`,
      `标题: ${citation.title}`,
      `摘录: ${citation.excerpt}`,
      ...(citation.sourceId ? [`Source: ${citation.sourceId}`, `Chunk: ${citation.chunkIndex ?? 'none'}`] : ['Source: none']),
      ...(citation.url ? [`URL: ${citation.url}`] : []),
      '',
    ].join('\n')),
  ].join('\n').trim()
}

function digestMarkdownWithCitations(result: DigestResult): string {
  const appendix = citationMarkdown(result.citations)
  return appendix ? `${result.content.trim()}\n\n---\n\n${appendix}` : result.content
}

function digestSourceExcerpt(points: StoredPoint[], citations: DigestCitation[]): string {
  const lines: string[] = []

  if (points.length > 0) {
    const groups = new Map<string, StoredPoint[]>()
    for (const point of points) {
      const source = point.sourceDocName?.trim() || '未命名来源'
      groups.set(source, [...(groups.get(source) ?? []), point])
    }

    lines.push(`本研报由 ${points.length} 个采集 star 和 ${citations.filter(citation => citation.kind === 'evidence').length} 条 Evidence 生成。`, '')
    lines.push(...Array.from(groups.entries()).flatMap(([source, sourcePoints], groupIndex) => [
      `## 来源 ${groupIndex + 1}: ${source}`,
      `采集 star: ${sourcePoints.length} 个`,
      '',
      ...sourcePoints.flatMap((point, pointIndex) => {
        const excerpt = point.sourceExcerpt?.trim()
        return [
          `### Star [${pointIndex + 1}]`,
          `类型: ${point.tagType ?? '未分类'}`,
          `内容: ${point.content}`,
          ...(excerpt ? ['', '原文块:', excerpt] : []),
          '',
        ]
      }),
    ]))
  } else {
    lines.push(`本研报由 ${citations.length} 条结构化引用生成。`, '')
  }

  const citationBlock = citationMarkdown(citations)
  if (citationBlock) lines.push('', citationBlock)

  return lines.join('\n').trim()
}

export function DigestModal({ result, starredPoints, onClose, onOpenSource }: Props) {
  const [copied, setCopied] = useState(false)
  const [archived, setArchived] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(digestMarkdownWithCitations(result))
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const handleDownload = () => {
    const blob = new Blob([digestMarkdownWithCitations(result)], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `digest-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleArchive = async () => {
    if (archived || archiving) return
    setArchiving(true)
    try {
      await savePoints(
        [{ content: digestMarkdownWithCitations(result), tagType: '研报摘要' }],
        DIGEST_SOURCE_NAME,
        digestSourceExcerpt(starredPoints, result.citations)
      )
      setArchived(true)
    } finally {
      setArchiving(false)
    }
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
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <span className="text-sm font-semibold text-fg">知识研报</span>
          <div className="flex items-center gap-2">
            <button onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg">
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? '已复制' : '复制'}
            </button>
            <button onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg">
              <Download size={12} />下载 MD
            </button>
            <button onClick={handleArchive} disabled={archived || archiving}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:opacity-50">
              {archiving ? <Loader2 size={12} className="animate-spin" /> : <BookmarkPlus size={12} />}
              {archived ? '已存档' : '存入知识库'}
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
                  const openSource = onOpenSource
                  const canOpenSource = Boolean(citation.sourceId && openSource)
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
                              onClick={() => openSource?.(citation.sourceId!, citation.chunkIndex)}
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
