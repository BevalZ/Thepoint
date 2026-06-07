import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Check, Copy, Download, Trash2, X } from 'lucide-react'
import { generateSuggestion, saveSuggestion, listSuggestionsByDate, getSuggestion, listMarkedDates, deleteSuggestion } from '@/api'
import type { Suggestion, SuggestionMeta } from '@/api/types'
import { cn } from '@/lib/utils'
import { Markdown } from '@/components/Markdown'
import { useFlyToHeatmapCell } from '@/hooks/useFlyToHeatmapCell'

// ── ExploreSuggestions (inline card, now with lifecycle) ────────────────────

interface ESProps {
  onMarkedDatesChange: (dates: Set<string>) => void
  onCellClick: (date: string) => void
}

export function ExploreSuggestions({ onMarkedDatesChange, onCellClick: _onCellClick }: ESProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // null = idle, { bodyMd, summary } = unread
  const [unread, setUnread] = useState<{ bodyMd: string; summary: string } | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [read, setRead] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const fly = useFlyToHeatmapCell()

  // Generate (discards any current unread)
  const generate = async () => {
    setLoading(true); setError(null); setRead(false)
    try {
      const res = await generateSuggestion()
      setUnread(res)
    } catch (e: unknown) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // Archive (silent: no animation)
  const archiveSilent = useCallback(async () => {
    if (!unread || !unread.bodyMd) return
    try {
      await saveSuggestion(unread.bodyMd, unread.summary)
      const dates = await listMarkedDates()
      onMarkedDatesChange(new Set(dates))
    } catch { /* non-fatal */ }
    setUnread(null)
  }, [unread, onMarkedDatesChange])

  // Mark as read + save + fly animation → heatmap cell
  const handleRead = async () => {
    if (!unread || archiving) return
    setArchiving(true)
    try {
      await saveSuggestion(unread.bodyMd, unread.summary)
      const dates = await listMarkedDates()
      onMarkedDatesChange(new Set(dates))
      setUnread(null)
      setRead(true)

      // Fly animation to today's cell
      const today = new Date().toISOString().slice(0, 10)
      if (cardRef.current) fly(cardRef.current, today)
    } catch {
      // non-fatal
    } finally {
      setArchiving(false)
    }
  }

  // Silent archive on unmount
  useEffect(() => {
    return () => {
      if (unread) archiveSilent()
    }
  }, [unread, archiveSilent])

  return (
    <div ref={cardRef} className="rounded-lg border border-border bg-bg-elevated p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-fg">探索建议</p>
          <p className="text-xs text-fg-muted mt-0.5">基于你的使用习惯，由 AI 生成认知提升建议</p>
        </div>
        <div className="flex items-center gap-2">
          {unread && !loading && (
            <>
              <button
                onClick={handleRead}
                disabled={archiving}
                className="flex items-center gap-1.5 rounded-lg border border-accent/60 bg-accent/10 px-3 py-1.5 text-sm text-accent hover:bg-accent/20 disabled:opacity-50 transition-colors"
              >
                {archiving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                已阅
              </button>
              <button
                onClick={generate}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-fg-muted hover:bg-bg-hover transition-colors"
              >
                重新生成
              </button>
            </>
          )}
          {!unread && (
            <button
              onClick={generate}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-fg-muted hover:bg-bg-hover disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 size={13} className="animate-spin" />}
              {loading ? '生成中…' : '生成建议'}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {(unread || read) && (
        <div className="max-h-[60vh] overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          <Markdown>{unread?.bodyMd ?? ''}</Markdown>
        </div>
      )}
    </div>
  )
}

// ── SuggestionDayList (popover with entries for a given date) ───────────────

interface DayListProps {
  date: string
  onPick: (id: string) => void
  onClose: () => void
  onDeleted?: () => void
}

export function SuggestionDayList({ date, onPick, onClose, onDeleted }: DayListProps) {
  const [items, setItems] = useState<SuggestionMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    listSuggestionsByDate(date)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [date])

  const handleDelete = async (id: string) => {
    if (deletingId) return
    setDeletingId(id)
    try {
      await deleteSuggestion(id)
      setItems(current => current.filter(item => item.id !== id))
      onDeleted?.()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium text-fg">{date} · 探索建议存档</span>
          <button onClick={onClose} className="rounded-md p-1 text-fg-muted hover:bg-bg-hover transition-colors">
            <X size={14} />
          </button>
        </div>
        <div className="max-h-[min(56vh,24rem)] overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={16} className="animate-spin text-fg-faint" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-xs text-fg-faint">暂无建议存档</div>
          ) : (
            items.map(item => (
              <div key={item.id} className="group flex items-start gap-2 border-b border-border px-4 py-3 last:border-b-0 hover:bg-bg-hover transition-colors">
                <button
                  onClick={() => onPick(item.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-xs leading-relaxed text-fg line-clamp-2">{item.summary}</p>
                  <p className="mt-1 text-[10px] text-fg-faint">{formatISOTime(item.createdAt)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(item.id)}
                  disabled={deletingId === item.id}
                  className="mt-0.5 rounded-md p-1.5 text-fg-faint opacity-70 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
                  title="删除报告"
                >
                  {deletingId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── SuggestionViewModal (full doc viewer, DigestModal-style skeleton) ───────

interface ViewProps {
  id: string
  onClose: () => void
  onDeleted?: () => void
}

export function SuggestionViewModal({ id, onClose, onDeleted }: ViewProps) {
  const [doc, setDoc] = useState<Suggestion | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    getSuggestion(id)
      .then(s => setDoc(s ?? null))
      .catch(() => setDoc(null))
      .finally(() => setLoading(false))
  }, [id])

  const handleCopy = async () => {
    if (!doc) return
    await navigator.clipboard.writeText(doc.bodyMd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const handleDownload = () => {
    if (!doc) return
    const blob = new Blob([doc.bodyMd], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `suggestion-${doc.date}-${doc.id.slice(0, 8)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDelete = async () => {
    if (!doc || deleting) return
    setDeleting(true)
    try {
      await deleteSuggestion(doc.id)
      onDeleted?.()
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-md"
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
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div>
            <span className="text-sm font-semibold text-fg">探索建议存档</span>
            {doc && <span className="ml-2 text-xs text-fg-faint">{doc.date}</span>}
          </div>
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
            <button onClick={handleDelete} disabled={!doc || deleting}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300/80 hover:bg-red-500/10 hover:text-red-200 disabled:opacity-50 transition-colors">
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              删除
            </button>
            <button onClick={onClose}
              className="rounded-md p-1.5 text-fg-muted hover:bg-bg-hover transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-fg-faint" />
            </div>
          ) : doc ? (
            <Markdown>{doc.bodyMd}</Markdown>
          ) : (
            <div className="py-12 text-center text-sm text-fg-faint">无法加载建议</div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

function formatISOTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}
