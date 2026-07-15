import { motion } from 'framer-motion'
import { Archive, ChevronRight, CornerDownRight, LocateFixed, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { AppConfig, StoredPoint } from '@/api/types'
import { useLibraryStore } from '@/store'
import { cn } from '@/lib/utils'
import { DeepenActions } from './DeepenActions'
import { PointEvidence } from './EvidenceList'
import { SourceExcerptButton } from './SourceExcerptButton'
import { Markdown } from './Markdown'
import { buildTree, type TreeNode } from '@/lib/pointTree'

const TAG_STYLES: Record<string, string> = {
  事实陈述: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  事实审查: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  作者观点: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  待验证疑问: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
}

const TAG_FALLBACK = 'border-border-strong bg-bg-hover text-fg-muted'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function normalizePointMarkdown(content: string): string {
  return content
    .replace(/\s+(#{2,6})\s+/g, '\n\n$1 ')
    .replace(/\s+---\s+/g, '\n\n---\n\n')
    .replace(/\s+(\d+\.\s+)/g, '\n$1')
    .trim()
}

interface DigestReference {
  index: number
  title: string
  body: string
}

type UiLanguage = AppConfig['uiLanguage']

function isZh(language: UiLanguage): boolean {
  return language !== 'en-US'
}

function copy(language: UiLanguage, zh: string, en: string): string {
  return isZh(language) ? zh : en
}

function digestReferences(sourceExcerpt: string | null, language: UiLanguage): DigestReference[] {
  const excerpt = sourceExcerpt?.trim()
  if (!excerpt) return []

  const sections = excerpt.split(/\n(?=### Star (?:\[\d+\]|\d+))/g)
  return sections.flatMap((section) => {
    const match = /^### Star (?:\[(\d+)\]|(\d+))(?:\n|$)/.exec(section.trim())
    if (!match) return []
    const index = Number(match[1] ?? match[2])
    if (!Number.isFinite(index)) return []
    return [{
      index,
      title: copy(language, `星标 [${index}]`, `Star [${index}]`),
      body: section.replace(/^### Star (?:\[\d+\]|\d+)\s*/, '').trim(),
    }]
  })
}

function linkDigestReferences(content: string, refs: DigestReference[]): string {
  if (refs.length === 0) return content
  const available = new Set(refs.map(ref => ref.index))
  return content.replace(/\[(\d+)\]/g, (full, rawIndex: string) => {
    const index = Number(rawIndex)
    if (!available.has(index)) return full
    return `[[${index}]](#digest-ref-${index})`
  })
}

function shouldRenderMarkdown(point: StoredPoint): boolean {
  if (point.tagType === '研报摘要') return true
  if (point.tagType === '事实审查') return true
  return /(^|\s)(#{1,6}\s|\*\*|>\s|[-*]\s|\d+\.\s)/.test(point.content)
}

function shouldCollapsePoint(point: StoredPoint): boolean {
  if (point.tagType === '研报摘要') return true
  if (point.tagType === '事实审查') return true
  return point.content.length > 360 || point.content.split(/\r?\n/).length > 5
}

function PointContent({ point, language }: { point: StoredPoint; language: UiLanguage }) {
  const [expanded, setExpanded] = useState(false)
  const [openRef, setOpenRef] = useState<DigestReference | null>(null)
  const renderMarkdown = shouldRenderMarkdown(point)
  const collapsible = shouldCollapsePoint(point)
  const refs = point.tagType === '研报摘要' ? digestReferences(point.sourceExcerpt, language) : []
  const content = renderMarkdown
    ? linkDigestReferences(normalizePointMarkdown(point.content), refs)
    : point.content

  return (
    <div className="mt-2">
      <div className={cn(
        'relative overflow-hidden',
        collapsible && !expanded && 'max-h-[8.2rem]'
      )}>
        {renderMarkdown ? (
          <Markdown
            className="text-sm leading-relaxed [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:text-fg [&_h2]:text-sm [&_h3]:text-sm [&_p]:my-1"
            onLinkClick={(href) => {
              const match = /^#digest-ref-(\d+)$/.exec(href)
              if (!match) return false
              const ref = refs.find(item => item.index === Number(match[1]))
              if (!ref) return true
              setOpenRef(ref)
              return true
            }}
          >
            {content}
          </Markdown>
        ) : (
          <p className="text-sm leading-relaxed text-fg">
            {content}
          </p>
        )}
        {collapsible && !expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-bg-elevated to-transparent" />
        )}
      </div>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="mt-2 rounded-md border border-border px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
        >
          {expanded ? copy(language, '收起', 'Collapse') : copy(language, '展开全文', 'Expand')}
        </button>
      )}
      {openRef && (
        <div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] bg-black/30 backdrop-blur-sm"
            onClick={() => setOpenRef(null)}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed left-1/2 top-1/2 z-[96] flex max-h-[72vh] w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium text-fg">{openRef.title}</p>
                <p className="mt-0.5 text-xs text-fg-faint">{copy(language, '研报引用来源', 'Report citation source')}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpenRef(null)}
                className="rounded-md p-1 text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
                aria-label={copy(language, '关闭', 'Close')}
              >
                <X size={15} />
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
                {openRef.body}
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

interface PointTreeProps {
  points: StoredPoint[]
  onArchive?: (id: string) => void
  onOpenSource?: (point: StoredPoint) => void
  onOpenEvidenceSource?: (sourceId: string, chunkIndex: number | null) => void
  language?: UiLanguage
  className?: string
}

export function PointTree({ points, onArchive, onOpenSource, onOpenEvidenceSource, language = 'zh-CN', className }: PointTreeProps) {
  const roots = buildTree(points)
  return (
    <div className={cn('space-y-3', className)}>
      {roots.map((node) => (
        <TreeRow key={node.point.id} node={node} depth={0} onArchive={onArchive} onOpenSource={onOpenSource} onOpenEvidenceSource={onOpenEvidenceSource} language={language} />
      ))}
    </div>
  )
}

interface TreeRowProps {
  node: TreeNode
  depth: number
  onArchive?: (id: string) => void
  onOpenSource?: (point: StoredPoint) => void
  onOpenEvidenceSource?: (sourceId: string, chunkIndex: number | null) => void
  language: UiLanguage
}

function TreeRow({ node, depth, onArchive, onOpenSource, onOpenEvidenceSource, language }: TreeRowProps) {
  const { point, children } = node
  const isOpen = useLibraryStore((state) => state.expanded[point.id] ?? false)
  const toggleExpanded = useLibraryStore((state) => state.toggleExpanded)
  const deletePoint = useLibraryStore((state) => state.deletePoint)
  const hasChildren = children.length > 0
  const tagClass = (point.tagType && TAG_STYLES[point.tagType]) || TAG_FALLBACK

  const handleDelete = () => {
    if (window.confirm('确认删除该节点及其所有子节点？')) {
      deletePoint(point.id)
    }
  }

  return (
    <div>
      <div
        data-point-id={point.id}
        className="perf-content-auto group relative rounded-lg border border-border bg-bg-elevated p-4"
      >
        <div className="flex items-start gap-2">
          <SourceExcerptButton
            point={point}
            language={language}
            className="absolute right-20 top-3 text-fg-faint opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
          />
          {onOpenSource && (
            <button
              onClick={() => onOpenSource(point)}
              className="absolute right-14 top-3 text-fg-faint opacity-0 transition-opacity hover:text-accent group-hover:opacity-100"
              aria-label={copy(language, '定位来源', 'Locate source')}
              title={copy(language, '定位来源', 'Locate source')}
            >
              <LocateFixed size={14} />
            </button>
          )}
          <button
            onClick={handleDelete}
            className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity text-fg-faint hover:text-red-400"
            aria-label={copy(language, '删除', 'Delete')}
          >
            <Trash2 size={14} />
          </button>
          {onArchive && !point.parentId && (
            <button
              onClick={() => onArchive(point.id)}
              className="absolute right-9 top-3 opacity-0 group-hover:opacity-100 transition-opacity text-fg-faint hover:text-fg-muted"
              aria-label={copy(language, '归档', 'Archive')}
            >
              <Archive size={14} />
            </button>
          )}
          {hasChildren ? (
            <button
              onClick={() => toggleExpanded(point.id)}
              className="mt-0.5 shrink-0 text-fg-faint transition-colors hover:text-fg"
              aria-label={isOpen ? copy(language, '收起', 'Collapse') : copy(language, '展开', 'Expand')}
            >
              <ChevronRight
                size={16}
                className={cn('transition-transform', isOpen && 'rotate-90')}
              />
            </button>
          ) : (
            depth > 0 && (
              <CornerDownRight
                size={14}
                className="mt-1 shrink-0 text-fg-faint opacity-60"
              />
            )
          )}
          <div className="min-w-0 flex-1">
            {point.tagType && (
              <span
                className={cn(
                  'inline-block rounded-full border px-2 py-0.5 text-xs font-medium',
                  tagClass
                )}
              >
                {point.tagType}
              </span>
            )}
            <PointContent point={point} language={language} />
            <PointEvidence pointId={point.id} language={language} onOpenSource={onOpenEvidenceSource} />
            {(point.sourceDocName || point.createdAt) && (
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-faint">
                {point.sourceDocName && (
                  <span className="truncate">{point.sourceDocName}</span>
                )}
                {point.createdAt && <span>{formatDate(point.createdAt)}</span>}
              </div>
            )}

            <DeepenActions point={point} />
          </div>
        </div>
      </div>

      {hasChildren && isOpen && (
        <div className="mt-3 space-y-3 border-l border-border pl-4 sm:pl-5">
          {children.map((child) => (
            <TreeRow
              key={child.point.id}
              node={child}
              depth={depth + 1}
              onArchive={onArchive}
              onOpenSource={onOpenSource}
              onOpenEvidenceSource={onOpenEvidenceSource}
              language={language}
            />
          ))}
        </div>
      )}
    </div>
  )
}
