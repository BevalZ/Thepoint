import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { ExtractedPoint } from '@/api/types'

interface PointCardProps {
  point: ExtractedPoint
  index: number
  className?: string
  sourceDocName?: string | null
  createdAt?: string | null
}

const TAG_STYLES: Record<string, string> = {
  事实陈述: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  作者观点: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  待验证疑问: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
}

const TAG_FALLBACK = 'border-border-strong bg-bg-hover text-fg-muted'

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
}: PointCardProps) {
  const tagClass = TAG_STYLES[point.tagType] ?? TAG_FALLBACK
  const hasMeta = Boolean(sourceDocName) || Boolean(createdAt)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className={cn(
        'rounded-lg border border-border bg-bg-elevated p-4',
        className
      )}
    >
      <span
        className={cn(
          'inline-block rounded-full border px-2 py-0.5 text-xs font-medium',
          tagClass
        )}
      >
        {point.tagType}
      </span>
      <p className="mt-2.5 text-sm leading-relaxed text-fg">{point.content}</p>
      {hasMeta && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-faint">
          {sourceDocName && <span className="truncate">{sourceDocName}</span>}
          {createdAt && <span>{formatDate(createdAt)}</span>}
        </div>
      )}
    </motion.div>
  )
}
