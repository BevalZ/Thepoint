import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Copy, Download, BookmarkPlus, Check, Loader2 } from 'lucide-react'
import { savePoints } from '@/api'
import { Markdown } from '@/components/Markdown'
import type { StoredPoint } from '@/api/types'

export const DIGEST_SOURCE_NAME = '知识研报'

interface Props {
  content: string
  starredPoints: StoredPoint[]
  onClose: () => void
}

function digestSourceExcerpt(points: StoredPoint[]): string {
  if (points.length === 0) return '本研报未记录采集来源。'

  const groups = new Map<string, StoredPoint[]>()
  for (const point of points) {
    const source = point.sourceDocName?.trim() || '未命名来源'
    groups.set(source, [...(groups.get(source) ?? []), point])
  }

  const lines = [
    `本研报由 ${points.length} 个采集 star 生成。`,
    '',
    ...Array.from(groups.entries()).flatMap(([source, sourcePoints], groupIndex) => [
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
    ]),
  ]

  return lines.join('\n').trim()
}

export function DigestModal({ content, starredPoints, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const [archived, setArchived] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
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
      await savePoints([{ content, tagType: '研报摘要' }], DIGEST_SOURCE_NAME, digestSourceExcerpt(starredPoints))
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
        className="relative w-full max-w-2xl rounded-2xl border border-border bg-bg-elevated shadow-2xl flex flex-col max-h-[80vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <span className="text-sm font-semibold text-fg">知识研报</span>
          <div className="flex items-center gap-2">
            <button onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors">
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? '已复制' : '复制'}
            </button>
            <button onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors">
              <Download size={12} />下载 MD
            </button>
            <button onClick={handleArchive} disabled={archived || archiving}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors disabled:opacity-50">
              {archiving ? <Loader2 size={12} className="animate-spin" /> : <BookmarkPlus size={12} />}
              {archived ? '已存档' : '存入知识库'}
            </button>
            <button onClick={onClose}
              className="rounded-md p-1.5 text-fg-muted hover:bg-bg-hover transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          <Markdown>{content}</Markdown>
        </div>
      </motion.div>
    </motion.div>
  )
}
