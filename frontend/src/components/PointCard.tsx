import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Pencil, Trash2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExtractedPoint } from '@/api/types'

interface PointCardProps {
  point: ExtractedPoint
  index: number
  className?: string
  sourceDocName?: string | null
  createdAt?: string | null
  onEdit?: (patch: Partial<ExtractedPoint>) => void
  onRemove?: () => void
}

const TAG_STYLES: Record<string, string> = {
  事实陈述: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  作者观点: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  待验证疑问: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
}

const TAG_FALLBACK = 'border-border-strong bg-bg-hover text-fg-muted'
const TAG_OPTIONS = ['事实陈述', '作者观点', '待验证疑问'] as const

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function PointCard({
  point,
  index,
  className,
  sourceDocName,
  createdAt,
  onEdit,
  onRemove,
}: PointCardProps) {
  const [editing, setEditing] = useState(false)
  const [draftContent, setDraftContent] = useState(point.content)
  const [draftTag, setDraftTag] = useState(point.tagType)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const tagClass = TAG_STYLES[editing ? draftTag : point.tagType] ?? TAG_FALLBACK
  const hasMeta = Boolean(sourceDocName) || Boolean(createdAt)

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current
      el.style.height = 'auto'
      el.style.height = el.scrollHeight + 'px'
      el.focus()
    }
  }, [editing])

  const startEdit = () => {
    setDraftContent(point.content)
    setDraftTag(point.tagType)
    setEditing(true)
  }

  const confirm = () => {
    onEdit?.({ content: draftContent, tagType: draftTag })
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setEditing(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className={cn(
        'group relative rounded-lg border border-border bg-bg-elevated p-4',
        className
      )}
    >
      {!editing && (onEdit || onRemove) && (
        <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onEdit && (
            <button
              onClick={startEdit}
              className="rounded p-1 text-fg-muted hover:bg-bg-hover hover:text-fg"
            >
              <Pencil size={14} />
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="rounded p-1 text-fg-muted hover:bg-bg-hover hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}

      {editing ? (
        <select
          value={draftTag}
          onChange={(e) => setDraftTag(e.target.value)}
          className="rounded-full border px-2 py-0.5 text-xs font-medium bg-bg-elevated outline-none cursor-pointer"
        >
          {TAG_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      ) : (
        <span className={cn('inline-block rounded-full border px-2 py-0.5 text-xs font-medium', tagClass)}>
          {point.tagType}
        </span>
      )}

      {editing ? (
        <textarea
          ref={textareaRef}
          value={draftContent}
          onChange={(e) => {
            setDraftContent(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
          }}
          onKeyDown={handleKeyDown}
          rows={3}
          className="mt-2.5 w-full resize-none rounded border border-border bg-bg-elevated px-2 py-1.5 text-sm leading-relaxed text-fg outline-none focus:border-accent overflow-hidden"
        />
      ) : (
        <p className="mt-2.5 text-sm leading-relaxed text-fg">{point.content}</p>
      )}

      {editing ? (
        <div className="mt-2 flex justify-end">
          <button
            onClick={confirm}
            className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            <Check size={13} />
            确认
          </button>
        </div>
      ) : hasMeta ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-faint">
          {sourceDocName && <span className="truncate">{sourceDocName}</span>}
          {createdAt && <span>{formatDate(createdAt)}</span>}
        </div>
      ) : null}
    </motion.div>
  )
}
