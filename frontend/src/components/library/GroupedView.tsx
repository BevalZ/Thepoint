import { cn } from '@/lib/utils'
import type { StoredPoint } from '@/api/types'
import { PointTree } from '@/components/PointTree'
import { useLibraryStore } from '@/store'
import { findSourceMetadataRecord } from '@/lib/sourceMetadataRegistry'
import { Archive, Calendar, ChevronRight, Clipboard, Database, ExternalLink, FileText, Globe, Hash, Inbox, Info, Link, Trash2 } from 'lucide-react'
import { useState } from 'react'

const NO_DOC = '（无来源）'
const DIGEST_SOURCE_NAME = '知识研报'
const DIGEST_TAG_TYPE = '研报摘要'

function sourceKey(point: StoredPoint) {
  if (point.sourceDocName?.trim()) return point.sourceDocName
  if (point.tagType === DIGEST_TAG_TYPE) return DIGEST_SOURCE_NAME
  return NO_DOC
}

function groupBySource(points: StoredPoint[]) {
  const map = new Map<string, StoredPoint[]>()
  for (const p of points) {
    if (p.parentId) continue
    const key = sourceKey(p)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  return map
}

interface Props {
  points: StoredPoint[]
  onArchive: (id: string) => void
  onOpenSource?: (point: StoredPoint) => void
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '未知'
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

function formatDateTime(value: string | null): string {
  if (value === null) return '未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function kindLabel(kind: 'file' | 'webpage' | 'paste'): string {
  if (kind === 'file') return '本地文件'
  if (kind === 'webpage') return '网页'
  return '粘贴内容'
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

function MetadataPanel({ source }: { source: string }) {
  const record = findSourceMetadataRecord(source)
  if (!record) {
    return (
      <div className="border-t border-border bg-bg px-4 py-3 text-xs text-fg-faint">
        暂无保存的元信息
      </div>
    )
  }

  const metadata = record.metadata
  const KindIcon = kindIcon(metadata.kind)
  const rows: MetadataLine[] = [
    { icon: KindIcon, label: '类型', value: kindLabel(metadata.kind) },
  ]
  if (metadata.name) rows.push({ icon: FileText, label: '名称', value: metadata.name })
  if (metadata.author) rows.push({ icon: Info, label: '作者', value: metadata.author })
  if (metadata.publishedAt) rows.push({ icon: Calendar, label: '发布', value: metadata.publishedAt })
  if (metadata.readingTime) rows.push({ icon: Info, label: '阅读', value: metadata.readingTime })
  rows.push({ icon: Hash, label: '字符', value: `${formatCount(metadata.characterCount)} 字` })
  if (metadata.kind === 'file') {
    rows.push(
      { icon: Database, label: '大小', value: formatBytes(metadata.sizeBytes) },
      { icon: Calendar, label: '创建', value: formatDateTime(metadata.createdAt) },
      { icon: Calendar, label: '修改', value: formatDateTime(metadata.modifiedAt) },
    )
    if (metadata.path) rows.push({ icon: Link, label: '路径', value: metadata.path })
  }
  if (metadata.url) rows.push({ icon: ExternalLink, label: '地址', value: metadata.url, href: metadata.url })

  return (
    <div className="border-t border-border bg-bg px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-fg">
        <Info size={13} className="text-accent" />
        元信息
        <span className="ml-auto text-[10px] font-normal text-fg-faint">本地保存</span>
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

export function GroupedView({ points, onArchive, onOpenSource }: Props) {
  const { archiveMany, deleteMany } = useLibraryStore()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [metadataOpen, setMetadataOpen] = useState<Record<string, boolean>>({})
  const groups = groupBySource(points)

  return (
    <div className="space-y-3 pb-6">
      {[...groups.entries()].map(([source, rootPoints]) => {
        const rootIds = new Set(rootPoints.map(p => p.id))
        const groupPoints = points.filter(p => {
          if (rootIds.has(p.id)) return true
          let cur: StoredPoint | undefined = p
          while (cur?.parentId) {
            const parent = points.find(x => x.id === cur!.parentId)
            if (!parent) break
            if (rootIds.has(parent.id)) return true
            cur = parent
          }
          return false
        })
        const isOpen = !collapsed[source]
        return (
          <div key={source} className="rounded-xl border border-border overflow-hidden">
            <div className="group flex w-full items-center gap-3 px-4 py-3 bg-bg-elevated hover:bg-bg-hover transition-colors">
              <button onClick={() => setCollapsed(s => ({ ...s, [source]: !s[source] }))}
                className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <ChevronRight size={15} className={cn('shrink-0 text-fg-muted transition-transform', isOpen && 'rotate-90')} />
                {source === NO_DOC ? <Inbox size={15} className="shrink-0 text-fg-faint" /> : <FileText size={15} className="shrink-0 text-accent" />}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{source}</span>
              </button>
              <span className="shrink-0 text-xs text-fg-faint">{rootPoints.length} 条</span>
              <button
                onClick={(event) => {
                  event.stopPropagation()
                  setMetadataOpen(s => ({ ...s, [source]: !s[source] }))
                }}
                title="查看元信息"
                aria-label="查看元信息"
                className={cn(
                  'shrink-0 text-fg-faint transition-colors hover:text-accent',
                  metadataOpen[source] ? 'text-accent' : 'opacity-0 group-hover:opacity-100'
                )}
              >
                <Info size={14} />
              </button>
              <button
                onClick={() => archiveMany(groupPoints.map(p => p.id))}
                title="归档整个文档的观点"
                aria-label="归档整个文档的观点"
                className="shrink-0 text-fg-faint opacity-0 transition-opacity hover:text-fg-muted group-hover:opacity-100"
              >
                <Archive size={14} />
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`确认删除「${source}」下的全部 ${groupPoints.length} 个观点（含深挖子节点）？此操作不可恢复。`))
                    deleteMany(rootPoints.map(p => p.id))
                }}
                title="删除整个文档的观点"
                aria-label="删除整个文档的观点"
                className="shrink-0 text-fg-faint opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {metadataOpen[source] && <MetadataPanel source={source} />}
            {isOpen && (
              <div className="px-4 py-4 bg-bg">
                <PointTree points={groupPoints} onArchive={onArchive} onOpenSource={onOpenSource} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
