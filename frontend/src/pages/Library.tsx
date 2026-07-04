import { useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, BookMarked, Search, X, LayoutList, Table2, Columns3, FolderOpen, Archive, FileText, LocateFixed } from 'lucide-react'
import { useDeepenStore, useLibraryStore } from '@/store'
import { PointTree } from '@/components/PointTree'
import { GroupedView } from '@/components/library/GroupedView'
import { ListView } from '@/components/library/ListView'
import { TableView } from '@/components/library/TableView'
import { KanbanView } from '@/components/library/KanbanView'
import { SourceExcerptButton } from '@/components/SourceExcerptButton'
import { cn } from '@/lib/utils'
import type { StoredPoint, WorkspaceSearchResult } from '@/api/types'
import { searchWorkspace } from '@/api'

const LS_VIEW = 'lib-view-mode'
type ViewMode = 'grouped' | 'list' | 'table' | 'kanban'

const VIEW_OPTS: { id: ViewMode; icon: React.ReactNode; label: string }[] = [
  { id: 'grouped', icon: <FolderOpen size={14} />, label: '折叠栏' },
  { id: 'list',    icon: <LayoutList size={14} />, label: '列表' },
  { id: 'table',   icon: <Table2 size={14} />,    label: '表格' },
  { id: 'kanban',  icon: <Columns3 size={14} />,  label: '看板' },
]

interface LibraryProps {
  onOpenPointSource?: (pointId: string) => void
  onOpenSource?: (sourceId: string, focusChunkIndex?: number | null) => void
}

export default function Library({ onOpenPointSource, onOpenSource }: LibraryProps) {
  const { points, archivedPoints, loading, error, fetch, fetchArchived, archivePoint, unarchivePoint } = useLibraryStore()
  const { fetchMentalModels } = useDeepenStore()
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<WorkspaceSearchResult[] | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem(LS_VIEW) as ViewMode) ?? 'grouped')
  const [showArchived, setShowArchived] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { fetch(); fetchMentalModels() }, [fetch, fetchMentalModels])

  useEffect(() => {
    if (showArchived) fetchArchived()
  }, [showArchived, fetchArchived])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!query.trim()) { setSearchResults(null); return }
    timerRef.current = setTimeout(() => {
      searchWorkspace(query).then(setSearchResults).catch(() => setSearchResults([]))
    }, 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  const handleSetView = (v: ViewMode) => {
    setViewMode(v)
    localStorage.setItem(LS_VIEW, v)
  }

  const handleArchive = async (id: string) => { await archivePoint(id) }
  const handleUnarchive = async (id: string) => { await unarchivePoint(id); fetchArchived() }

  const activePoints = showArchived ? archivedPoints : points
  const sourceResults = searchResults?.filter((result) => result.kind === 'source') ?? []
  const pointResults = searchResults?.filter((result) => result.kind === 'point') ?? []

  const handleOpenSearchResult = (result: WorkspaceSearchResult) => {
    if (result.kind === 'source') {
      onOpenSource?.(result.id, null)
      return
    }
    if (result.sourceId) {
      onOpenSource?.(result.sourceId, result.chunkIndex)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col px-8 py-10">
      <header>
        <h1 className="text-lg font-semibold">知识库</h1>
        <p className="mt-1 text-sm text-fg-muted">已保存的全部观点，按来源文档分组。</p>
      </header>

      {/* Toolbar */}
      <div className="mt-4 flex items-center gap-2">
        {/* Search */}
        <div className="flex-1 flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm">
          <Search size={15} className="shrink-0 text-fg-muted" />
          <input className="flex-1 bg-transparent text-fg outline-none placeholder:text-fg-faint"
            placeholder="搜索观点…" value={query} onChange={e => setQuery(e.target.value)} />
          {query && <button onClick={() => setQuery('')} className="shrink-0 text-fg-muted hover:text-fg"><X size={14} /></button>}
        </div>

        {/* Archive toggle */}
        <button onClick={() => setShowArchived(s => !s)}
          className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors',
            showArchived ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-bg-elevated text-fg-muted hover:text-fg')}>
          <Archive size={14} />{showArchived ? '已归档' : '归档'}
        </button>

        {/* View switcher — hidden in archived mode */}
        {!showArchived && (
          <div className="flex rounded-lg border border-border bg-bg-elevated overflow-hidden">
            {VIEW_OPTS.map(v => (
              <button key={v.id} onClick={() => handleSetView(v.id)} title={v.label}
                className={cn('px-2.5 py-2 transition-colors', viewMode === v.id ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:text-fg')}>
                {v.icon}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /><span className="break-words">{error}</span>
        </div>
      )}

      <div className="mt-6 flex-1">
        {/* Search results */}
        {searchResults !== null ? (
          searchResults.length > 0 ? (
            <div className="space-y-5 pb-6">
              <p className="text-xs text-fg-faint">共 {searchResults.length} 条结果</p>
              {sourceResults.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center justify-between text-xs text-fg-faint">
                    <span>来源</span>
                    <span>{sourceResults.length}</span>
                  </div>
                  <div className="space-y-2">
                    {sourceResults.map((result) => (
                      <button
                        key={`source-${result.id}`}
                        type="button"
                        onClick={() => handleOpenSearchResult(result)}
                        className="flex w-full items-start gap-3 rounded-lg border border-border bg-bg-elevated px-4 py-3 text-left transition-colors hover:bg-bg-hover"
                      >
                        <FileText size={15} className="mt-0.5 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-fg">{result.title}</span>
                          <span className="mt-1 block truncate text-xs text-fg-faint">{result.snippet}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {pointResults.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center justify-between text-xs text-fg-faint">
                    <span>Point</span>
                    <span>{pointResults.length}</span>
                  </div>
                  <div className="space-y-2">
                    {pointResults.map((result) => (
                      <button
                        key={`point-${result.id}`}
                        type="button"
                        onClick={() => handleOpenSearchResult(result)}
                        disabled={!result.sourceId}
                        className="flex w-full items-start gap-3 rounded-lg border border-border bg-bg-elevated px-4 py-3 text-left transition-colors hover:bg-bg-hover disabled:cursor-default disabled:opacity-70"
                      >
                        <LocateFixed size={15} className="mt-0.5 shrink-0 text-accent" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-fg">{result.title}</span>
                          <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">{result.snippet}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="flex h-full min-h-32 items-center justify-center text-sm text-fg-faint">无匹配结果</div>
          )
        ) : loading ? (
          <div className="flex h-full min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
            <Loader2 size={16} className="animate-spin" />加载中…
          </div>
        ) : showArchived ? (
          /* Archived view */
          archivedPoints.length > 0 ? (
            <div className="space-y-2 pb-6">
              {archivedPoints.map(p => (
                <div key={p.id} className="flex items-start gap-3 rounded-lg border border-border bg-bg-elevated px-4 py-3 text-sm text-fg">
                  <p className="flex-1 leading-relaxed">{p.content}</p>
                  <SourceExcerptButton
                    point={p}
                    className="shrink-0 text-fg-faint transition-colors hover:text-accent mt-0.5"
                  />
                  <button onClick={() => handleUnarchive(p.id)}
                    className="shrink-0 text-xs text-fg-muted hover:text-accent transition-colors mt-0.5">恢复</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full min-h-32 items-center justify-center text-sm text-fg-faint">没有已归档的观点</div>
          )
        ) : activePoints.length > 0 ? (
          /* Normal views */
          viewMode === 'grouped' ? <GroupedView points={activePoints} onArchive={handleArchive} onOpenSource={onOpenPointSource ? (point) => onOpenPointSource(point.id) : undefined} onOpenEvidenceSource={onOpenSource} /> :
          viewMode === 'list'    ? <ListView    points={activePoints} onArchive={handleArchive} onOpenSource={onOpenPointSource ? (point) => onOpenPointSource(point.id) : undefined} onOpenEvidenceSource={onOpenSource} /> :
          viewMode === 'table'   ? <TableView   points={activePoints} onArchive={handleArchive} onOpenSource={onOpenPointSource ? (point) => onOpenPointSource(point.id) : undefined} /> :
                                   <KanbanView  points={activePoints} onArchive={handleArchive} onOpenSource={onOpenPointSource ? (point) => onOpenPointSource(point.id) : undefined} onOpenEvidenceSource={onOpenSource} />
        ) : (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-sm text-fg-faint">
            <BookMarked size={24} className="opacity-50" />还没有保存任何观点。去「探索」页提取并保存吧。
          </div>
        )}
      </div>
    </div>
  )
}
