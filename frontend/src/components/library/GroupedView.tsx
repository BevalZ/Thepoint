import { cn } from '@/lib/utils'
import type { AppConfig, StoredPoint } from '@/api/types'
import { PointTree } from '@/components/PointTree'
import { useLibraryStore } from '@/store'
import { findSourceMetadataRecord } from '@/lib/sourceMetadataRegistry'
import { groupStoredPointsBySource, NO_SOURCE_GROUP } from '@/lib/groupedPoints'
import { Archive, Calendar, ChevronRight, Clipboard, Database, ExternalLink, FileText, Globe, Hash, Inbox, Info, Link, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

type UiLanguage = AppConfig['uiLanguage']

function isZh(language: UiLanguage): boolean {
  return language !== 'en-US'
}

function copy(language: UiLanguage, zh: string, en: string): string {
  return isZh(language) ? zh : en
}

interface Props {
  points: StoredPoint[]
  onArchive: (id: string) => void
  onOpenSource?: (point: StoredPoint) => void
  onOpenEvidenceSource?: (sourceId: string, chunkIndex: number | null) => void
  language?: UiLanguage
}

function formatBytes(bytes: number | null, language: UiLanguage): string {
  if (bytes === null) return copy(language, '未知', 'Unknown')
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unitIndex]}`
}

function formatDateTime(value: string | null, language: UiLanguage): string {
  if (value === null) return copy(language, '未知', 'Unknown')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return copy(language, '未知', 'Unknown')
  return date.toLocaleString(isZh(language) ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCount(value: number, language: UiLanguage): string {
  return new Intl.NumberFormat(isZh(language) ? 'zh-CN' : 'en-US').format(value)
}

function kindLabel(kind: 'file' | 'webpage' | 'paste', language: UiLanguage): string {
  if (kind === 'file') return copy(language, '本地文件', 'Local file')
  if (kind === 'webpage') return copy(language, '网页', 'Webpage')
  return copy(language, '粘贴内容', 'Pasted content')
}

function kindIcon(kind: 'file' | 'webpage' | 'paste') {
  if (kind === 'file') return FileText
  if (kind === 'webpage') return Globe
  return Clipboard
}

interface MetadataLine {
  icon: typeof Info
  label: string
  value: string
  href?: string
}

function MetadataPanel({ source, language }: { source: string; language: UiLanguage }) {
  const record = findSourceMetadataRecord(source)
  if (!record) {
    return (
      <div className="border-t border-border bg-bg px-4 py-3 text-xs text-fg-faint">
        {copy(language, '暂无保存的元信息', 'No saved metadata')}
      </div>
    )
  }

  const metadata = record.metadata
  const KindIcon = kindIcon(metadata.kind)
  const rows: MetadataLine[] = [
    { icon: KindIcon, label: copy(language, '类型', 'Type'), value: kindLabel(metadata.kind, language) },
  ]
  if (metadata.name) rows.push({ icon: FileText, label: copy(language, '名称', 'Name'), value: metadata.name })
  if (metadata.author) rows.push({ icon: Info, label: copy(language, '作者', 'Author'), value: metadata.author })
  if (metadata.publishedAt) rows.push({ icon: Calendar, label: copy(language, '发布', 'Published'), value: metadata.publishedAt })
  if (metadata.readingTime) rows.push({ icon: Info, label: copy(language, '阅读', 'Reading'), value: metadata.readingTime })
  rows.push({ icon: Hash, label: copy(language, '字符', 'Chars'), value: copy(language, `${formatCount(metadata.characterCount, language)} 字`, `${formatCount(metadata.characterCount, language)} chars`) })
  if (metadata.kind === 'file') {
    rows.push(
      { icon: Database, label: copy(language, '大小', 'Size'), value: formatBytes(metadata.sizeBytes, language) },
      { icon: Calendar, label: copy(language, '创建', 'Created'), value: formatDateTime(metadata.createdAt, language) },
      { icon: Calendar, label: copy(language, '修改', 'Modified'), value: formatDateTime(metadata.modifiedAt, language) },
    )
    if (metadata.path) rows.push({ icon: Link, label: copy(language, '路径', 'Path'), value: metadata.path })
  }
  if (metadata.url) rows.push({ icon: ExternalLink, label: copy(language, '地址', 'URL'), value: metadata.url, href: metadata.url })

  return (
    <div className="border-t border-border bg-bg px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-fg">
        <Info size={13} className="text-accent" />
        {copy(language, '元信息', 'Metadata')}
        <span className="ml-auto text-[10px] font-normal text-fg-faint">{copy(language, '本地保存', 'Saved locally')}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map(({ icon: Icon, label, value, href }) => (
          <div key={`${label}-${value}`} className="grid min-w-0 grid-cols-[1rem,3rem,minmax(0,1fr)] items-start gap-2 text-xs">
            <Icon size={12} className="mt-0.5 text-accent" />
            <span className="text-fg-faint">{label}</span>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="break-all text-fg-muted underline decoration-accent/30 underline-offset-4 hover:text-accent"
              >
                {value}
              </a>
            ) : (
              <span className="break-words text-fg-muted">{value}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function GroupedView({ points, onArchive, onOpenSource, onOpenEvidenceSource, language = 'zh-CN' }: Props) {
  const archiveMany = useLibraryStore((state) => state.archiveMany)
  const deleteMany = useLibraryStore((state) => state.deleteMany)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [metadataOpen, setMetadataOpen] = useState<Record<string, boolean>>({})
  const groups = useMemo(() => groupStoredPointsBySource(points), [points])

  return (
    <div className="space-y-3 pb-6">
      {groups.map(({ source, roots: rootPoints, points: groupPoints }) => {
        const isOpen = !collapsed[source]
        return (
          <div key={source} className="perf-content-auto rounded-xl border border-border overflow-hidden">
            <div className="group flex w-full items-center gap-3 px-4 py-3 bg-bg-elevated hover:bg-bg-hover transition-colors">
              <button onClick={() => setCollapsed(s => ({ ...s, [source]: !s[source] }))}
                className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <ChevronRight size={15} className={cn('shrink-0 text-fg-muted transition-transform', isOpen && 'rotate-90')} />
                {source === NO_SOURCE_GROUP ? <Inbox size={15} className="shrink-0 text-fg-faint" /> : <FileText size={15} className="shrink-0 text-accent" />}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{source}</span>
              </button>
              <span className="shrink-0 text-xs text-fg-faint">{copy(language, `${rootPoints.length} 条`, `${rootPoints.length} items`)}</span>
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  setMetadataOpen(s => ({ ...s, [source]: !s[source] }))
                }}
                title={copy(language, '查看元信息', 'View metadata')}
                aria-label={copy(language, '查看元信息', 'View metadata')}
                className={cn(
                  'shrink-0 text-fg-faint transition-colors hover:text-accent',
                  metadataOpen[source] ? 'text-accent' : 'opacity-0 group-hover:opacity-100'
                )}
              >
                <Info size={14} />
              </button>
              <button
                onClick={() => archiveMany(groupPoints.map(p => p.id))}
                title={copy(language, '归档整个文档的观点', 'Archive all points in this document')}
                aria-label={copy(language, '归档整个文档的观点', 'Archive all points in this document')}
                className="shrink-0 text-fg-faint opacity-0 transition-opacity hover:text-fg-muted group-hover:opacity-100"
              >
                <Archive size={14} />
              </button>
              <button
                onClick={() => {
                  if (window.confirm(copy(
                    language,
                    `确认删除「${source}」下的全部 ${groupPoints.length} 个观点（含深挖子节点）？此操作不可恢复。`,
                    `Delete all ${groupPoints.length} points under "${source}" including deepened child nodes? This cannot be undone.`
                  )))
                    deleteMany(rootPoints.map(p => p.id))
                }}
                title={copy(language, '删除整个文档的观点', 'Delete all points in this document')}
                aria-label={copy(language, '删除整个文档的观点', 'Delete all points in this document')}
                className="shrink-0 text-fg-faint opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {metadataOpen[source] && <MetadataPanel source={source} language={language} />}
            {isOpen && (
              <div className="px-4 py-4 bg-bg">
                <PointTree points={groupPoints} onArchive={onArchive} onOpenSource={onOpenSource} onOpenEvidenceSource={onOpenEvidenceSource} language={language} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
