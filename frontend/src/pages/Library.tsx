import { useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, BookMarked, Search, X, LayoutList, Table2, Columns3, FolderOpen, Archive } from 'lucide-react'
import { useDeepenStore, useLibraryStore } from '@/store'
import { PointTree } from '@/components/PointTree'
import { GroupedView } from '@/components/library/GroupedView'
import { ListView } from '@/components/library/ListView'
import { TableView } from '@/components/library/TableView'
import { KanbanView } from '@/components/library/KanbanView'
import { SourceExcerptButton } from '@/components/SourceExcerptButton'
import { cn } from '@/lib/utils'
import type { StoredPoint } from '@/api/types'
import { searchPoints } from '@/api'

const LS_VIEW = 'lib-view-mode'
type ViewMode = 'grouped' | 'list' | 'table' | 'kanban'

const VIEW_OPTS: { id: ViewMode; icon: React.ReactNode; label: string }[] = [
  { id: 'grouped', icon: <FolderOpen size={14} />, label: '折叠栏' },
  { id: 'list',    icon: <LayoutList size={14} />, label: '列表' },
  { id: 'table',   icon: <Table2 size={14} />,    label: '表格' },
  { id: 'kanban',  icon: <Columns3 size={14} />,  label: '看板' },
]

export default function Library() {
  const { points, archivedPoints, loading, error, fetch, fetchArchived, archivePoint, unarchivePoint } = useLibraryStore()
  const { fetchMentalModels } = useDeepenStore()
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<StoredPoint[] | null>(null)
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
      searchPoints(query).then(setSearchResults).catch(() => setSearchResults([]))
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
  const visibleSearchResults = searchResults ? withTreeContext(searchResults, points) : null

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
        {visibleSearchResults !== null ? (
          visibleSearchResults.length > 0 ? (
            <div className="pb-6">
              <p className="mb-3 text-xs text-fg-faint">共 {searchResults?.length ?? 0} 条结果</p>
              <PointTree points={visibleSearchResults} onArchive={handleArchive} />
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
          viewMode === 'grouped' ? <GroupedView points={activePoints} onArchive={handleArchive} /> :
          viewMode === 'list'    ? <ListView    points={activePoints} onArchive={handleArchive} /> :
          viewMode === 'table'   ? <TableView   points={activePoints} onArchive={handleArchive} /> :
                                   <KanbanView  points={activePoints} onArchive={handleArchive} />
        ) : (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-sm text-fg-faint">
            <BookMarked size={24} className="opacity-50" />还没有保存任何观点。去「探索」页提取并保存吧。
          </div>
        )}
      </div>
    </div>
  )
}

function withTreeContext(results: StoredPoint[], allPoints: StoredPoint[]): StoredPoint[] {
  const byId = new Map(allPoints.map(point => [point.id, point]))
  const childrenByParent = new Map<string, StoredPoint[]>()
  allPoints.forEach(point => {
    if (!point.parentId) return
    const children = childrenByParent.get(point.parentId) ?? []
    children.push(point)
    childrenByParent.set(point.parentId, children)
  })
  const selected = new Map<string, StoredPoint>()
  const addWithParents = (point: StoredPoint) => {
    selected.set(point.id, point)
    let parentId = point.parentId
    while (parentId) {
      const parent = byId.get(parentId)
      if (!parent) break
      selected.set(parent.id, parent)
      parentId = parent.parentId
    }
  }
  const addChildren = (pointId: string) => {
    const children = childrenByParent.get(pointId) ?? []
    children.forEach(child => {
      selected.set(child.id, child)
      addChildren(child.id)
    })
  }
  results.forEach(point => {
    const fullPoint = byId.get(point.id) ?? point
    addWithParents(fullPoint)
    addChildren(fullPoint.id)
  })
  return Array.from(selected.values())
}
