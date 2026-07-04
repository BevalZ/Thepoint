import { useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, BookMarked, Search, X, LayoutList, Table2, Columns3, FolderOpen, Archive, FileText, LocateFixed, BookmarkPlus, Check, Sparkles } from 'lucide-react'
import { useDeepenStore, useEvidenceDigestStore, useLibraryStore, useStarStore, useSynthesisStore } from '@/store'
import { PointTree } from '@/components/PointTree'
import { EvidenceList } from '@/components/EvidenceList'
import { DigestModal } from '@/components/DigestModal'
import { GroupedView } from '@/components/library/GroupedView'
import { ListView } from '@/components/library/ListView'
import { TableView } from '@/components/library/TableView'
import { KanbanView } from '@/components/library/KanbanView'
import { SourceExcerptButton } from '@/components/SourceExcerptButton'
import { cn } from '@/lib/utils'
import type { DigestResult, EvidenceRecord, StoredPoint, WorkspaceSearchResult } from '@/api/types'
import { generateSynthesis, searchEvidence, searchWorkspace } from '@/api'

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
  const { has: hasEvidenceForDigest, toggle: toggleEvidenceForDigest } = useEvidenceDigestStore()
  const { count: starredCount, points: starredPoints, init: initStars } = useStarStore()
  const {
    sources: synthesisSources,
    hasSource: hasSynthesisSource,
    toggleSource: toggleSynthesisSource,
    removeSource: removeSynthesisSource,
    clearSources: clearSynthesisSources,
  } = useSynthesisStore()
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<WorkspaceSearchResult[] | null>(null)
  const [evidenceResults, setEvidenceResults] = useState<EvidenceRecord[] | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem(LS_VIEW) as ViewMode) ?? 'grouped')
  const [showArchived, setShowArchived] = useState(false)
  const [includeStarred, setIncludeStarred] = useState(false)
  const [synthesisGenerating, setSynthesisGenerating] = useState(false)
  const [synthesisError, setSynthesisError] = useState<string | null>(null)
  const [synthesisResult, setSynthesisResult] = useState<DigestResult | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { fetch(); fetchMentalModels(); void initStars() }, [fetch, fetchMentalModels, initStars])

  useEffect(() => {
    if (showArchived) fetchArchived()
  }, [showArchived, fetchArchived])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!query.trim()) { setSearchResults(null); setEvidenceResults(null); return }
    timerRef.current = setTimeout(() => {
      Promise.all([searchWorkspace(query), searchEvidence(query)])
        .then(([workspace, evidence]) => {
          setSearchResults(workspace)
          setEvidenceResults(evidence)
        })
        .catch(() => {
          setSearchResults([])
          setEvidenceResults([])
        })
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
  const totalSearchResults = (searchResults?.length ?? 0) + (evidenceResults?.length ?? 0)
  const searchActive = searchResults !== null || evidenceResults !== null
  const showSynthesisPanel = synthesisSources.length > 0 || starredCount > 0
  const canGenerateSynthesis = synthesisSources.length > 0 || (includeStarred && starredCount > 0)

  const handleOpenSearchResult = (result: WorkspaceSearchResult) => {
    if (result.kind === 'source') {
      onOpenSource?.(result.id, null)
      return
    }
    if (result.sourceId) {
      onOpenSource?.(result.sourceId, result.chunkIndex)
    }
  }

  const handleGenerateSynthesis = async () => {
    if (!canGenerateSynthesis || synthesisGenerating) return
    setSynthesisGenerating(true)
    setSynthesisError(null)
    try {
      const result = await generateSynthesis(
        synthesisSources.map((source) => source.id),
        includeStarred
      )
      setSynthesisResult(result)
    } catch (error) {
      setSynthesisError(error instanceof Error ? error.message : '生成综合报告失败，请稍后重试。')
    } finally {
      setSynthesisGenerating(false)
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
            placeholder="搜索观点、来源或证据…" value={query} onChange={e => setQuery(e.target.value)} />
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

      {showSynthesisPanel && (
        <section className="mt-4 rounded-lg border border-border bg-bg-elevated px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-fg">
                <Sparkles size={14} className="text-accent" />
                <span>多来源综合</span>
              </div>
              <p className="mt-1 text-xs text-fg-faint">
                已选 {synthesisSources.length} 个 Source，当前 Star {starredCount} 个
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              <input
                type="checkbox"
                checked={includeStarred}
                onChange={(event) => setIncludeStarred(event.target.checked)}
                disabled={starredCount === 0 || synthesisGenerating}
                className="h-3.5 w-3.5 accent-[var(--color-accent)]"
              />
              包含 Star
            </label>
            <button
              type="button"
              onClick={clearSynthesisSources}
              disabled={synthesisSources.length === 0 || synthesisGenerating}
              className="rounded-lg border border-border px-3 py-2 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:opacity-50"
            >
              清空 Source
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateSynthesis()}
              disabled={!canGenerateSynthesis || synthesisGenerating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {synthesisGenerating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              生成综合
            </button>
          </div>
          {synthesisSources.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {synthesisSources.map((source) => (
                <span key={source.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-bg px-2 py-1 text-[11px] text-fg-muted">
                  <span className="truncate">{source.title}</span>
                  <button
                    type="button"
                    onClick={() => removeSynthesisSource(source.id)}
                    disabled={synthesisGenerating}
                    className="shrink-0 rounded p-0.5 hover:bg-bg-hover hover:text-fg disabled:opacity-50"
                    title="移除 Source"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {synthesisError && (
            <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {synthesisError}
            </p>
          )}
        </section>
      )}

      <div className="mt-6 flex-1">
        {/* Search results */}
        {searchActive ? (
          totalSearchResults > 0 ? (
            <div className="space-y-5 pb-6">
              <p className="text-xs text-fg-faint">共 {totalSearchResults} 条结果</p>
              {sourceResults.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center justify-between text-xs text-fg-faint">
                    <span>来源</span>
                    <span>{sourceResults.length}</span>
                  </div>
                  <div className="space-y-2">
                    {sourceResults.map((result) => (
                      <div
                        key={`source-${result.id}`}
                        className="flex w-full items-start gap-3 rounded-lg border border-border bg-bg-elevated px-4 py-3 text-left transition-colors hover:bg-bg-hover"
                      >
                        <button
                          type="button"
                          onClick={() => handleOpenSearchResult(result)}
                          className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        >
                          <FileText size={15} className="mt-0.5 shrink-0 text-accent" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-fg">{result.title}</span>
                            <span className="mt-1 block truncate text-xs text-fg-faint">{result.snippet}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleSynthesisSource({ id: result.id, title: result.title })}
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors',
                            hasSynthesisSource(result.id)
                              ? 'border-accent/40 bg-accent/10 text-accent'
                              : 'border-border text-fg-muted hover:bg-bg-hover hover:text-accent'
                          )}
                          title={hasSynthesisSource(result.id) ? '从综合输入移除' : '加入综合输入'}
                        >
                          {hasSynthesisSource(result.id) ? <Check size={11} /> : <BookmarkPlus size={11} />}
                          {hasSynthesisSource(result.id) ? '已加入' : '加入综合'}
                        </button>
                      </div>
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
              {evidenceResults !== null && evidenceResults.length > 0 && (
                <EvidenceList
                  records={evidenceResults}
                  title="Evidence"
                  onOpenSource={(sourceId, chunkIndex) => onOpenSource?.(sourceId, chunkIndex)}
                  renderAction={(record) => {
                    const selected = hasEvidenceForDigest(record.id)
                    return (
                      <button
                        type="button"
                        onClick={() => toggleEvidenceForDigest(record)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors',
                          selected
                            ? 'border-accent/40 bg-accent/10 text-accent'
                            : 'border-border text-fg-muted hover:bg-bg-hover hover:text-accent'
                        )}
                        title={selected ? '从研报输入移除' : '加入研报输入'}
                      >
                        {selected ? <Check size={11} /> : <BookmarkPlus size={11} />}
                        {selected ? '已加入' : '加入研报'}
                      </button>
                    )
                  }}
                />
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
      {synthesisResult && (
        <DigestModal
          result={synthesisResult}
          starredPoints={includeStarred ? starredPoints : []}
          title="多来源综合"
          sourceName="多来源综合"
          onOpenSource={onOpenSource}
          onClose={() => setSynthesisResult(null)}
        />
      )}
    </div>
  )
}
