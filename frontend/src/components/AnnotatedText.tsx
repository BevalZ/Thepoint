import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Save, Check, X } from 'lucide-react'
import type { ExtractedPoint } from '@/api/types'
import { cn } from '@/lib/utils'

const TAG_COLORS: Record<string, { wave: string; badge: string }> = {
  事实陈述:  { wave: 'decoration-sky-400',    badge: 'bg-sky-400' },
  作者观点:  { wave: 'decoration-violet-400', badge: 'bg-violet-400' },
  待验证疑问:{ wave: 'decoration-amber-400',  badge: 'bg-amber-400' },
}
const FALLBACK_COLOR = { wave: 'decoration-fg-faint', badge: 'bg-fg-faint' }

interface PointWithIndex extends ExtractedPoint { idx: number }

interface SegmentMatch {
  before: string
  match: string
  after: string
  point: PointWithIndex
}

/** Try to find anchor in text (case-insensitive, first 60 chars of anchor). */
function findAnchor(text: string, anchor: string): number {
  const probe = anchor.slice(0, 60)
  const idx = text.indexOf(probe)
  if (idx !== -1) return idx
  // fallback: try first 30 chars
  return text.indexOf(anchor.slice(0, 30))
}

interface AnnotatedTextProps {
  text: string
  points: PointWithIndex[]
  onSavePoint: (idx: number) => Promise<void>
  savedIndices: Set<number>
}

export function AnnotatedText({ text, points, onSavePoint, savedIndices }: AnnotatedTextProps) {
  const paragraphs = text.split(/\n+/).filter(p => p.trim())

  return (
    <div className="space-y-3 text-sm leading-loose text-fg">
      {paragraphs.map((para, pi) => (
        <Paragraph
          key={pi}
          text={para}
          points={points.filter(p => p.anchor && para.includes(p.anchor.slice(0, 30)))}
          onSavePoint={onSavePoint}
          savedIndices={savedIndices}
        />
      ))}
    </div>
  )
}

function Paragraph({
  text,
  points,
  onSavePoint,
  savedIndices,
}: {
  text: string
  points: PointWithIndex[]
  onSavePoint: (idx: number) => Promise<void>
  savedIndices: Set<number>
}) {
  if (points.length === 0) {
    return <p>{text}</p>
  }

  // Build a list of [start, end, point] for all matches, sorted
  type Span = { start: number; end: number; point: PointWithIndex }
  const spans: Span[] = []
  for (const point of points) {
    const anchor = point.anchor!
    const pos = findAnchor(text, anchor)
    if (pos === -1) continue
    const len = Math.min(anchor.length, text.length - pos)
    spans.push({ start: pos, end: pos + len, point })
  }
  spans.sort((a, b) => a.start - b.start)

  // Build segments: plain text interleaved with highlighted spans
  const segments: React.ReactNode[] = []
  let cursor = 0
  for (const span of spans) {
    if (span.start > cursor) {
      segments.push(text.slice(cursor, span.start))
    }
    segments.push(
      <HighlightedSpan
        key={span.point.idx}
        text={text.slice(span.start, span.end)}
        point={span.point}
        onSavePoint={onSavePoint}
        savedIndices={savedIndices}
      />
    )
    cursor = span.end
  }
  if (cursor < text.length) segments.push(text.slice(cursor))

  return <p>{segments}</p>
}

function HighlightedSpan({
  text,
  point,
  onSavePoint,
  savedIndices,
}: {
  text: string
  point: PointWithIndex
  onSavePoint: (idx: number) => Promise<void>
  savedIndices: Set<number>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const colors = TAG_COLORS[point.tagType] ?? FALLBACK_COLOR

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <span ref={ref} className="relative inline">
      {/* Highlighted text with wave underline */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'underline decoration-wavy decoration-2 cursor-pointer transition-opacity hover:opacity-80',
          colors.wave
        )}
      >
        {text}
        {/* Badge dot */}
        <span
          className={cn(
            'relative -top-1.5 ml-0.5 inline-flex h-2 w-2 rounded-full',
            colors.badge
          )}
        />
      </button>

      {/* Popover */}
      <AnimatePresence>
        {open && (
          <PointPopover
            point={point}
            saved={savedIndices.has(point.idx)}
            onSave={() => onSavePoint(point.idx)}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </span>
  )
}

function PointPopover({
  point,
  saved,
  onSave,
  onClose,
}: {
  point: PointWithIndex
  saved: boolean
  onSave: () => Promise<void>
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false)
  const colors = TAG_COLORS[point.tagType] ?? FALLBACK_COLOR

  const handleSave = async () => {
    setSaving(true)
    await onSave()
    setSaving(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.97 }}
      transition={{ duration: 0.12 }}
      className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-border bg-bg shadow-lg"
      onClick={e => e.stopPropagation()}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <span className={cn(
            'inline-block rounded-full border px-2 py-0.5 text-xs font-medium',
            'border-current opacity-70'
          )}>
            {point.tagType}
          </span>
          <button onClick={onClose} className="p-0.5 text-fg-faint hover:text-fg rounded">
            <X size={13} />
          </button>
        </div>
        <p className="text-sm text-fg leading-relaxed">{point.content}</p>
        <div className="flex justify-end pt-1">
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              saved
                ? 'bg-emerald-600/20 text-emerald-400 cursor-default'
                : 'bg-accent text-white hover:bg-accent-hover disabled:opacity-60'
            )}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> :
              saved ? <Check size={12} /> : <Save size={12} />}
            {saved ? '已保存' : '保存到知识库'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
