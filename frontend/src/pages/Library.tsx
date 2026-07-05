import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, BookMarked, Search, X, LayoutList, Table2, Columns3, FolderOpen, Archive, FileText, LocateFixed, BookmarkPlus, Check, Sparkles, ShieldCheck, RefreshCw, ScrollText, Trash2 } from 'lucide-react'
import { useDeepenStore, useEvidenceDigestStore, useLibraryStore, useStarStore, useSynthesisStore } from '@/store'
import { PointTree } from '@/components/PointTree'
import { EvidenceList } from '@/components/EvidenceList'
import { DigestModal } from '@/components/DigestModal'
import { ReportModal } from '@/components/ReportModal'
import { GroupedView } from '@/components/library/GroupedView'
import { ListView } from '@/components/library/ListView'
import { TableView } from '@/components/library/TableView'
import { KanbanView } from '@/components/library/KanbanView'
import { SourceExcerptButton } from '@/components/SourceExcerptButton'
import { cn } from '@/lib/utils'
import { EVIDENCE_VERDICT_FILTERS, filterEvidenceByVerdict } from '@/lib/evidenceLedger'
import type { EvidenceVerdictFilter } from '@/lib/evidenceLedger'
import { REPORT_KIND_FILTERS, filterReportsByKind, reportKindLabel } from '@/lib/reportArtifacts'
import type { ReportKindFilter } from '@/lib/reportArtifacts'
import type { DigestResult, EvidenceRecord, ReportRecord, WorkspaceSearchResult } from '@/api/types'
import { deleteReport, generateSynthesis, listRecentEvidence, listRecentReports, searchEvidence, searchReports, searchWorkspace } from '@/api'

const LS_VIEW = 'lib-view-mode'
const LS_LIBRARY_MODE = 'lib-content-mode'
type ViewMode = 'grouped' | 'list' | 'table' | 'kanban'
type LibraryMode = 'points' | 'evidence' | 'reports'

const VIEW_OPTS: { id: ViewMode; icon: React.ReactNode; label: string }[] = [
  { id: 'grouped', icon: <FolderOpen size={14} />, label: '折叠栏' },
  { id: 'list',    icon: <LayoutList size={14} />, label: '列表' },
  { id: 'table',   icon: <Table2 size={14} />,    label: '表格' },
  { id: 'kanban',  icon: <Columns3 size={14} />,  label: '看板' },
]

const LIBRARY_MODE_OPTS: { id: LibraryMode; icon: React.ReactNode; label: string }[] = [
  { id: 'points', icon: <BookMarked size={14} />, label: '观点' },
  { id: 'evidence', icon: <ShieldCheck size={14} />, label: 'Evidence' },
  { id: 'reports', icon: <ScrollText size={14} />, label: 'Reports' },
]

interface LibraryProps {
  onOpenPointSource?: (pointId: string) => void
  onOpenSource?: (sourceId: string, focusChunkIndex?: number | null) => void
}

export default function Library({ onOpenPointSource, onOpenSource }: LibraryProps) {
  const { points, archivedPoints, loading, error, fetch, fetchArchived, archivePoint, unarchivePoint } = useLibraryStore()
  const { fetchMentalModels } = useDeepenStore()
  const { has: hasEvidenceForDigest, toggle: toggleEvidenceForDigest } = useEvidenceDigestStore()
  const { count: starredCount, init: initStars } = useStarStore()
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
  const [reportResults, setReportResults] = useState<ReportRecord[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [libraryMode, setLibraryMode] = useState<LibraryMode>(() => (localStorage.getItem(LS_LIBRARY_MODE) as LibraryMode) ?? 'points')
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem(LS_VIEW) as ViewMode) ?? 'grouped')
  const [showArchived, setShowArchived] = useState(false)
  const [recentEvidence, setRecentEvidence] = useState<EvidenceRecord[]>([])
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)
  const [evidenceVerdictFilter, setEvidenceVerdictFilter] = useState<EvidenceVerdictFilter>('all')
  const [recentReports, setRecentReports] = useState<ReportRecord[]>([])
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsError, setReportsError] = useState<string | null>(null)
  const [reportKindFilter, setReportKindFilter] = useState<ReportKindFilter>('all')
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<ReportRecord | null>(null)
  const [includeStarred, setIncludeStarred] = useState(false)
  const [synthesisGenerating, setSynthesisGenerating] = useState(false)
  const [synthesisError, setSynthesisError] = useState<string | null>(null)
  const [synthesisResult, setSynthesisResult] = useState<DigestResult | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { fetch(); fetchMentalModels(); void initStars() }, [fetch, fetchMentalModels, initStars])

  const loadRecentEvidence = useCallback(async () => {
    setEvidenceLoading(true)
    setEvidenceError(null)
    try {
      setRecentEvidence(await listRecentEvidence())
    } catch (error) {
      setRecentEvidence([])
      setEvidenceError(error instanceof Error ? error.message : '加载 Evidence 失败，请稍后重试。')
    } finally {
      setEvidenceLoading(false)
    }
  }, [])

  const loadRecentReports = useCallback(async () => {
    setReportsLoading(true)
    setReportsError(null)
    try {
      setRecentReports(await listRecentReports())
    } catch (error) {
      setRecentReports([])
      setReportsError(error instanceof Error ? error.message : '加载 Reports 失败，请稍后重试。')
    } finally {
      setReportsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (showArchived) fetchArchived()
  }, [showArchived, fetchArchived])

  useEffect(() => {
    if (libraryMode === 'evidence') void loadRecentEvidence()
    if (libraryMode === 'reports') void loadRecentReports()
  }, [libraryMode, loadRecentEvidence, loadRecentReports])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!query.trim()) {
      setSearchResults(null)
      setEvidenceResults(null)
      setReportResults(null)
      setSearching(false)
      return
    }
    setSearchResults(null)
    setEvidenceResults(null)
    setReportResults(null)
    setReportsError(null)
    setSearching(true)
    let alive = true
    timerRef.current = setTimeout(() => {
      if (libraryMode === 'reports') {
        searchReports(query)
          .then((reports) => {
            if (!alive) return
            setReportResults(reports)
          })
          .catch(() => {
            if (!alive) return
            setReportResults([])
          })
          .finally(() => { if (alive) setSearching(false) })
        return
      }

      if (libraryMode === 'evidence') {
        searchEvidence(query)
          .then((evidence) => {
            if (!alive) return
            setSearchResults(null)
            setEvidenceResults(evidence)
            setReportResults(null)
          })
          .catch(() => {
            if (!alive) return
            setSearchResults(null)
            setEvidenceResults([])
          })
          .finally(() => { if (alive) setSearching(false) })
        return
      }

      Promise.all([searchWorkspace(query), searchEvidence(query), searchReports(query)])
        .then(([workspace, evidence, reports]) => {
          if (!alive) return
          setSearchResults(workspace)
          setEvidenceResults(evidence)
          setReportResults(reports)
        })
        .catch(() => {
          if (!alive) return
          setSearchResults([])
          setEvidenceResults([])
          setReportResults([])
        })
        .finally(() => { if (alive) setSearching(false) })
    }, 300)
    return () => {
      alive = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query, libraryMode])

  const handleSetView = (v: ViewMode) => {
    setViewMode(v)
    localStorage.setItem(LS_VIEW, v)
  }

  const handleSetLibraryMode = (mode: LibraryMode) => {
    setLibraryMode(mode)
    localStorage.setItem(LS_LIBRARY_MODE, mode)
  }

  const handleArchive = async (id: string) => { await archivePoint(id) }
  const handleUnarchive = async (id: string) => { await unarchivePoint(id); fetchArchived() }

  const handleDeleteReport = async (report: ReportRecord) => {
    if (deletingReportId) return
    const confirmed = window.confirm(`删除 Report「${report.title}」？此操作不会删除来源、观点或 Evidence。`)
    if (!confirmed) return

    setDeletingReportId(report.id)
    setReportsError(null)
    try {
      await deleteReport(report.id)
      setRecentReports((records) => records.filter((item) => item.id !== report.id))
      setReportResults((records) => records?.filter((item) => item.id !== report.id) ?? null)
      setSelectedReport((current) => current?.id === report.id ? null : current)
    } catch (error) {
      setReportsError(error instanceof Error ? error.message : '删除 Report 失败，请稍后重试。')
    } finally {
      setDeletingReportId(null)
    }
  }

  const activePoints = showArchived ? archivedPoints : points
  const sourceResults = searchResults?.filter((result) => result.kind === 'source') ?? []
  const pointResults = searchResults?.filter((result) => result.kind === 'point') ?? []
  const searchActive = query.trim().length > 0
  const unifiedReportResults = libraryMode === 'points' && searchActive ? (reportResults ?? []) : []
  const totalSearchResults = (searchResults?.length ?? 0) + (evidenceResults?.length ?? 0) + unifiedReportResults.length
  const ledgerEvidenceRecords = searchActive ? (evidenceResults ?? []) : recentEvidence
  const filteredLedgerEvidence = filterEvidenceByVerdict(ledgerEvidenceRecords, evidenceVerdictFilter)
  const reportRecords = searchActive ? (reportResults ?? []) : recentReports
  const visibleReports = filterReportsByKind(reportRecords, reportKindFilter)
  const showSynthesisPanel = libraryMode === 'points' && (synthesisSources.length > 0 || starredCount > 0)
  const canGenerateSynthesis = synthesisSources.length > 0 || (includeStarred && starredCount > 0)
  const libraryDescription =
    libraryMode === 'reports'
      ? '已保存的研报和多来源综合，保留结构化引用。'
      : libraryMode === 'evidence'
        ? '已保存的事实审查证据，按时间、搜索和 verdict 复查。'
        : '已保存的全部观点，按来源文档分组。'

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

  const renderEvidenceDigestAction = (record: EvidenceRecord) => {
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
  }

  const renderReportItem = (report: ReportRecord) => (
    <article
      key={report.id}
      className="flex w-full items-start gap-3 rounded-lg border border-border bg-bg-elevated px-4 py-3 text-left transition-colors hover:bg-bg-hover"
    >
      <button
        type="button"
        onClick={() => setSelectedReport(report)}
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
      >
        <ScrollText size={15} className="mt-0.5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-fg">{report.title}</span>
            <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] text-fg-faint">
              {reportKindLabel(report.kind)}
            </span>
          </span>
          <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">{report.summary}</span>
          <span className="mt-2 block text-[11px] text-fg-faint">{formatReportDate(report.createdAt)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => void handleDeleteReport(report)}
        disabled={deletingReportId !== null}
        className="mt-0.5 shrink-0 rounded-md border border-border px-2 py-1.5 text-fg-muted transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
        title="删除 Report"
      >
        {deletingReportId === report.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>
    </article>
  )

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col px-8 py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">知识库</h1>
          <p className="mt-1 text-sm text-fg-muted">{libraryDescription}</p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-border bg-bg-elevated">
          {LIBRARY_MODE_OPTS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => handleSetLibraryMode(option.id)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 text-xs transition-colors',
                libraryMode === option.id ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:text-fg'
              )}
            >
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {/* Toolbar */}
      <div className="mt-4 flex items-center gap-2">
        {/* Search */}
        <div className="flex-1 flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm">
          <Search size={15} className="shrink-0 text-fg-muted" />
          <input className="flex-1 bg-transparent text-fg outline-none placeholder:text-fg-faint"
            placeholder={
              libraryMode === 'reports'
                ? '搜索报告标题、摘要、正文或引用…'
                : libraryMode === 'evidence'
                  ? '搜索 claim、答案或证据来源…'
                  : '搜索观点、来源或证据…'
            }
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && <button onClick={() => setQuery('')} className="shrink-0 text-fg-muted hover:text-fg"><X size={14} /></button>}
        </div>

        {libraryMode === 'points' ? (
          <>
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
          </>
        ) : (
          <button
            type="button"
            onClick={() => void (libraryMode === 'reports' ? loadRecentReports() : loadRecentEvidence())}
            disabled={libraryMode === 'reports' ? reportsLoading : evidenceLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
            title={libraryMode === 'reports' ? '刷新 Reports' : '刷新 Evidence'}
          >
            <RefreshCw size={14} className={cn((libraryMode === 'reports' ? reportsLoading : evidenceLoading) && 'animate-spin')} />
            刷新
          </button>
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
        {libraryMode === 'reports' ? (
          <div className="space-y-4 pb-6">
            <div className="flex items-center justify-between text-xs text-fg-faint">
              <span>{searchActive ? 'Reports 搜索结果' : '最近 Reports'}</span>
              <span>{visibleReports.length} / {reportRecords.length}</span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex overflow-hidden rounded-lg border border-border bg-bg-elevated">
                {REPORT_KIND_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setReportKindFilter(filter.id)}
                    className={cn(
                      'px-3 py-2 text-xs transition-colors',
                      reportKindFilter === filter.id ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:text-fg'
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-fg-faint">
                {searchActive
                  ? `匹配 ${visibleReports.length} / ${reportRecords.length}`
                  : `显示 ${visibleReports.length} / ${recentReports.length}`}
              </p>
            </div>

            {reportsError ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span className="break-words">{reportsError}</span>
              </div>
            ) : (searchActive && reportResults === null) || (!searchActive && reportsLoading) ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
                <Loader2 size={16} className="animate-spin" />加载 Reports…
              </div>
            ) : visibleReports.length > 0 ? (
              <div className="space-y-2">
                {visibleReports.map(renderReportItem)}
              </div>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-fg-faint">
                <ScrollText size={24} className="opacity-50" />
                <p>
                  {searchActive
                    ? reportRecords.length > 0
                      ? '没有符合当前搜索和类型筛选的 Report。'
                      : '没有符合当前搜索的 Report。'
                    : recentReports.length > 0
                      ? '没有符合当前类型筛选的 Report。'
                      : '还没有保存 Report。生成研报或多来源综合后，点击“保存报告”沉淀到这里。'}
                </p>
              </div>
            )}
          </div>
        ) : libraryMode === 'evidence' ? (
          <div className="space-y-4 pb-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex overflow-hidden rounded-lg border border-border bg-bg-elevated">
                {EVIDENCE_VERDICT_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setEvidenceVerdictFilter(filter.id)}
                    className={cn(
                      'px-3 py-2 text-xs transition-colors',
                      evidenceVerdictFilter === filter.id ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:text-fg'
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-fg-faint">
                {searchActive
                  ? `匹配 ${filteredLedgerEvidence.length} / ${evidenceResults?.length ?? 0}`
                  : `显示 ${filteredLedgerEvidence.length} / ${recentEvidence.length}`}
              </p>
            </div>

            {evidenceError && !searchActive ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span className="break-words">{evidenceError}</span>
              </div>
            ) : (searchActive && evidenceResults === null) || (!searchActive && evidenceLoading) ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
                <Loader2 size={16} className="animate-spin" />加载 Evidence…
              </div>
            ) : filteredLedgerEvidence.length > 0 ? (
              <EvidenceList
                records={filteredLedgerEvidence}
                title={searchActive ? 'Evidence 搜索结果' : '最近 Evidence'}
                onOpenSource={(sourceId, chunkIndex) => onOpenSource?.(sourceId, chunkIndex)}
                renderAction={renderEvidenceDigestAction}
              />
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-fg-faint">
                <ShieldCheck size={24} className="opacity-50" />
                <p>
                  {searchActive
                    ? '没有符合当前搜索和 verdict 的 Evidence。'
                    : recentEvidence.length > 0
                      ? '没有符合当前 verdict 的 Evidence。'
                      : '还没有保存 Evidence。完成事实审查后，使用“保存为证据”沉淀到这里。'}
                </p>
              </div>
            )}
          </div>
        ) : searchActive ? (
          searching && searchResults === null && evidenceResults === null && reportResults === null ? (
            <div className="flex h-full min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
              <Loader2 size={16} className="animate-spin" />搜索中…
            </div>
          ) : totalSearchResults > 0 ? (
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
                  renderAction={renderEvidenceDigestAction}
                />
              )}
              {unifiedReportResults.length > 0 && (
                <section>
                  <div className="mb-2 flex items-center justify-between text-xs text-fg-faint">
                    <span>Reports</span>
                    <span>{unifiedReportResults.length}</span>
                  </div>
                  <div className="space-y-2">
                    {unifiedReportResults.map(renderReportItem)}
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
      {synthesisResult && (
        <DigestModal
          result={synthesisResult}
          title="多来源综合"
          sourceName="多来源综合"
          reportKind="synthesis"
          onOpenSource={onOpenSource}
          onClose={() => setSynthesisResult(null)}
        />
      )}
      {selectedReport && (
        <ReportModal
          report={selectedReport}
          onOpenSource={onOpenSource}
          onClose={() => setSelectedReport(null)}
        />
      )}
    </div>
  )
}

function formatReportDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
