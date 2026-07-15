import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, BookMarked, Search, X, LayoutList, Table2, Columns3, FolderOpen, Archive, FileText, LocateFixed, BookmarkPlus, Check, Sparkles, ShieldCheck, RefreshCw, ScrollText, Trash2, Images, Link2, Clock, Ban, Plus } from 'lucide-react'
import { useConfigStore, useDeepenStore, useEvidenceDigestStore, useLibraryStore, useStarStore, useSynthesisStore } from '@/store'
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
import { REPORT_KIND_FILTERS, filterReportsByKind } from '@/lib/reportArtifacts'
import type { ReportKindFilter } from '@/lib/reportArtifacts'
import type { SourceHighlightRequest } from '@/lib/sourceHighlight'
import type { AppConfig, AssetKind, AssetRelationRecord, DigestResult, EvidenceRecord, GalleryItem, InvestigationInput, JournalEntry, ReportRecord, ReviewItem, ReviewQueuePlan, ReviewQueuePlanItem, ReviewRating, ReviewTargetKind, SearchAssetResult, SourceSummaryRecord, WorkspaceSearchResult } from '@/api/types'
import { addReviewItem, buildReviewQueuePlan, completeReviewItem, deleteReport, dismissReviewItem, discoverRelatedAssets, generateInvestigation, generateSynthesis, getReport, listAllReviewItems, listGallery, listRecentEvidence, listRecentJournalEntries, listRecentReports, listRecentSources, rebuildAssetRelations, searchAssets, searchEvidence, searchGallery, searchJournalEntries, searchReports, searchWorkspace, snoozeReviewItem, invalidateJournalEntry } from '@/api'

const LS_VIEW = 'lib-view-mode'
const LS_LIBRARY_MODE = 'lib-content-mode'
type ViewMode = 'grouped' | 'list' | 'table' | 'kanban'
type LibraryMode = 'sources' | 'points' | 'evidence' | 'reports' | 'investigations' | 'journal' | 'review' | 'gallery' | 'related'

const VIEW_OPTS: { id: ViewMode; icon: React.ReactNode; labelZh: string; labelEn: string }[] = [
  { id: 'grouped', icon: <FolderOpen size={14} />, labelZh: '折叠栏', labelEn: 'Grouped' },
  { id: 'list',    icon: <LayoutList size={14} />, labelZh: '列表', labelEn: 'List' },
  { id: 'table',   icon: <Table2 size={14} />,    labelZh: '表格', labelEn: 'Table' },
  { id: 'kanban',  icon: <Columns3 size={14} />,  labelZh: '看板', labelEn: 'Kanban' },
]

const LIBRARY_MODE_OPTS: { id: LibraryMode; icon: React.ReactNode; labelZh: string; labelEn: string }[] = [
  { id: 'sources', icon: <FileText size={14} />, labelZh: '来源', labelEn: 'Sources' },
  { id: 'points', icon: <BookMarked size={14} />, labelZh: '观点', labelEn: 'Points' },
  { id: 'evidence', icon: <ShieldCheck size={14} />, labelZh: '证据', labelEn: 'Evidence' },
  { id: 'reports', icon: <ScrollText size={14} />, labelZh: '报告', labelEn: 'Reports' },
  { id: 'investigations', icon: <Sparkles size={14} />, labelZh: '调查', labelEn: 'Investigations' },
  { id: 'journal', icon: <FileText size={14} />, labelZh: '日志', labelEn: 'Journal' },
  { id: 'review', icon: <RefreshCw size={14} />, labelZh: '复习', labelEn: 'Review' },
  { id: 'gallery', icon: <Images size={14} />, labelZh: '画廊', labelEn: 'Gallery' },
  { id: 'related', icon: <LocateFixed size={14} />, labelZh: '相关', labelEn: 'Related' },
]

const REVIEW_RATINGS: { id: ReviewRating; labelZh: string; labelEn: string }[] = [
  { id: 'again', labelZh: '再来', labelEn: 'Again' },
  { id: 'hard', labelZh: '困难', labelEn: 'Hard' },
  { id: 'good', labelZh: '良好', labelEn: 'Good' },
  { id: 'easy', labelZh: '简单', labelEn: 'Easy' },
]

const RELATED_KIND_OPTIONS: AssetKind[] = ['source', 'point', 'evidence', 'report', 'journal', 'gallery', 'review']

const REVIEW_TARGET_OPTIONS: ReviewTargetKind[] = ['source', 'point', 'evidence', 'report', 'journal']

const INVESTIGATION_MODES: InvestigationInput['mode'][] = ['quick', 'standard', 'deep']

type UiLanguage = AppConfig['uiLanguage']

function isZh(language: UiLanguage): boolean {
  return language !== 'en-US'
}

function copy(language: UiLanguage, zh: string, en: string): string {
  return isZh(language) ? zh : en
}

function optionLabel(option: { labelZh: string; labelEn: string }, language: UiLanguage): string {
  return isZh(language) ? option.labelZh : option.labelEn
}

function assetKindLabel(kind: AssetKind | SearchAssetResult['kind'] | ReviewTargetKind, language: UiLanguage): string {
  const zh: Record<string, string> = {
    source: '来源',
    point: '观点',
    evidence: '证据',
    report: '报告',
    journal: '日志',
    gallery: '画廊',
    review: '复习',
    indexed_file: '索引文件',
  }
  const en: Record<string, string> = {
    source: 'Source',
    point: 'Point',
    evidence: 'Evidence',
    report: 'Report',
    journal: 'Journal',
    gallery: 'Gallery',
    review: 'Review',
    indexed_file: 'Indexed File',
  }
  return (isZh(language) ? zh[kind] : en[kind]) ?? kind
}

function assetKindPluralLabel(kind: SearchAssetResult['kind'] | 'indexed-file', language: UiLanguage): string {
  const normalized = kind === 'indexed-file' ? 'indexed_file' : kind
  if (isZh(language)) return assetKindLabel(normalized, language)
  if (normalized === 'source') return 'Sources'
  if (normalized === 'point') return 'Points'
  if (normalized === 'report') return 'Reports'
  if (normalized === 'indexed_file') return 'Indexed Files'
  return assetKindLabel(normalized, language)
}

function reportKindDisplay(kind: ReportRecord['kind'] | ReportKindFilter, language: UiLanguage): string {
  if (kind === 'all') return copy(language, '全部', 'All')
  if (kind === 'digest') return copy(language, '知识研报', 'Digest')
  if (kind === 'synthesis') return copy(language, '多来源综合', 'Synthesis')
  return copy(language, '调查报告', 'Investigation')
}

function evidenceVerdictDisplay(verdict: EvidenceVerdictFilter, language: UiLanguage): string {
  const zh: Record<EvidenceVerdictFilter, string> = {
    all: '全部',
    supported: '支持',
    contradicted: '反驳',
    mixed: '混合',
    uncertain: '不确定',
  }
  const en: Record<EvidenceVerdictFilter, string> = {
    all: 'All',
    supported: 'Supported',
    contradicted: 'Contradicted',
    mixed: 'Mixed',
    uncertain: 'Uncertain',
  }
  return isZh(language) ? zh[verdict] : en[verdict]
}

function reviewRatingLabel(rating: { labelZh: string; labelEn: string }, language: UiLanguage): string {
  return optionLabel(rating, language)
}

function reviewStatusLabel(status: string, language: UiLanguage): string {
  const zh: Record<string, string> = {
    active: '进行中',
    completed: '已完成',
    dismissed: '已移除',
  }
  return isZh(language) ? zh[status] ?? status : status
}

function investigationModeLabel(mode: InvestigationInput['mode'], language: UiLanguage): string {
  const zh: Record<InvestigationInput['mode'], string> = {
    quick: '快速',
    standard: '标准',
    deep: '深入',
  }
  return isZh(language) ? zh[mode] : mode
}

function reviewPriorityLabel(priority: ReviewItem['priority'], language: UiLanguage): string {
  const zh: Record<ReviewItem['priority'], string> = {
    low: '低',
    normal: '普通',
    high: '高',
  }
  return isZh(language) ? zh[priority] ?? priority : priority
}

function reviewPlanModeLabel(mode: ReviewQueuePlan['mode'], language: UiLanguage): string {
  if (mode === 'due') return copy(language, '到期', 'due')
  if (mode === 'catchup') return copy(language, '补进度', 'catchup')
  return mode
}

function reviewPlanReasonLabel(reason: string, language: UiLanguage): string {
  const zh: Record<string, string> = {
    due: '已到期',
    overdue: '已逾期',
    priority: '高优先级',
    catchup: '补进度',
    scheduled: '已排期',
  }
  return isZh(language) ? zh[reason] ?? reason : reason
}

function relationLabel(relation: AssetRelationRecord['relation'], language: UiLanguage): string {
  const zh: Record<AssetRelationRecord['relation'], string> = {
    co_cited: '共同引用',
    same_source: '同一来源',
    supports: '支持',
    contradicts: '反驳',
    same_topic: '同一主题',
    derived_from: '派生自',
    review_related: '复习相关',
  }
  return isZh(language) ? zh[relation] ?? relation : relation
}

function relationSourceKindLabel(kind: string, language: UiLanguage): string {
  const zh: Record<string, string> = {
    auto: '自动',
    manual: '手动',
  }
  return isZh(language) ? zh[kind] ?? kind : kind
}

interface LibraryProps {
  onOpenPointSource?: (pointId: string) => void
  onOpenSource?: (sourceId: string, focusChunkIndex?: number | null, highlight?: SourceHighlightRequest | null) => void
  onOpenGallery?: () => void
}

export default function Library({ onOpenPointSource, onOpenSource, onOpenGallery }: LibraryProps) {
  const points = useLibraryStore((state) => state.points)
  const archivedPoints = useLibraryStore((state) => state.archivedPoints)
  const loading = useLibraryStore((state) => state.loading)
  const error = useLibraryStore((state) => state.error)
  const fetch = useLibraryStore((state) => state.fetch)
  const fetchArchived = useLibraryStore((state) => state.fetchArchived)
  const archivePoint = useLibraryStore((state) => state.archivePoint)
  const unarchivePoint = useLibraryStore((state) => state.unarchivePoint)
  const language = useConfigStore((state) => state.config?.uiLanguage ?? 'zh-CN')
  const fetchMentalModels = useDeepenStore((state) => state.fetchMentalModels)
  const hasEvidenceForDigest = useEvidenceDigestStore((state) => state.has)
  const toggleEvidenceForDigest = useEvidenceDigestStore((state) => state.toggle)
  const starredCount = useStarStore((state) => state.count)
  const initStars = useStarStore((state) => state.init)
  const synthesisSources = useSynthesisStore((state) => state.sources)
  const hasSynthesisSource = useSynthesisStore((state) => state.hasSource)
  const toggleSynthesisSource = useSynthesisStore((state) => state.toggleSource)
  const removeSynthesisSource = useSynthesisStore((state) => state.removeSource)
  const clearSynthesisSources = useSynthesisStore((state) => state.clearSources)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<WorkspaceSearchResult[] | null>(null)
  const [assetSearchResults, setAssetSearchResults] = useState<SearchAssetResult[] | null>(null)
  const [evidenceResults, setEvidenceResults] = useState<EvidenceRecord[] | null>(null)
  const [reportResults, setReportResults] = useState<ReportRecord[] | null>(null)
  const [galleryResults, setGalleryResults] = useState<GalleryItem[] | null>(null)
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
  const [recentSources, setRecentSources] = useState<SourceSummaryRecord[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [sourcesError, setSourcesError] = useState<string | null>(null)
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])
  const [journalResults, setJournalResults] = useState<JournalEntry[] | null>(null)
  const [journalLoading, setJournalLoading] = useState(false)
  const [journalError, setJournalError] = useState<string | null>(null)
  const [invalidatingJournalId, setInvalidatingJournalId] = useState<string | null>(null)
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [reviewPlan, setReviewPlan] = useState<ReviewQueuePlan | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewMutatingId, setReviewMutatingId] = useState<string | null>(null)
  const [reviewDraftKind, setReviewDraftKind] = useState<ReviewTargetKind>('source')
  const [reviewDraftId, setReviewDraftId] = useState('')
  const [reviewDraftTitle, setReviewDraftTitle] = useState('')
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([])
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [galleryError, setGalleryError] = useState<string | null>(null)
  const [investigationQuery, setInvestigationQuery] = useState('')
  const [investigationMode, setInvestigationMode] = useState<InvestigationInput['mode']>('standard')
  const [investigationIncludeSearch, setInvestigationIncludeSearch] = useState(true)
  const [investigationIncludeJournal, setInvestigationIncludeJournal] = useState(true)
  const [investigationSourceIds, setInvestigationSourceIds] = useState('')
  const [investigationPointIds, setInvestigationPointIds] = useState('')
  const [investigationEvidenceIds, setInvestigationEvidenceIds] = useState('')
  const [investigationReportIds, setInvestigationReportIds] = useState('')
  const [investigationGenerating, setInvestigationGenerating] = useState(false)
  const [investigationError, setInvestigationError] = useState<string | null>(null)
  const [investigationResult, setInvestigationResult] = useState<DigestResult | null>(null)
  const [relatedKind, setRelatedKind] = useState<AssetKind>('source')
  const [relatedId, setRelatedId] = useState('')
  const [relatedRecords, setRelatedRecords] = useState<AssetRelationRecord[]>([])
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [relatedError, setRelatedError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { fetch(); fetchMentalModels(); void initStars() }, [fetch, fetchMentalModels, initStars])

  const loadRecentEvidence = useCallback(async () => {
    setEvidenceLoading(true)
    setEvidenceError(null)
    try {
      setRecentEvidence(await listRecentEvidence())
    } catch (error) {
      setRecentEvidence([])
      setEvidenceError(error instanceof Error ? error.message : copy(language, '加载证据失败，请稍后重试。', 'Failed to load evidence. Please try again.'))
    } finally {
      setEvidenceLoading(false)
    }
  }, [language])

  const loadRecentReports = useCallback(async () => {
    setReportsLoading(true)
    setReportsError(null)
    try {
      setRecentReports(await listRecentReports())
    } catch (error) {
      setRecentReports([])
      setReportsError(error instanceof Error ? error.message : copy(language, '加载报告失败，请稍后重试。', 'Failed to load reports. Please try again.'))
    } finally {
      setReportsLoading(false)
    }
  }, [language])

  const loadRecentSources = useCallback(async () => {
    setSourcesLoading(true)
    setSourcesError(null)
    try {
      setRecentSources(await listRecentSources())
    } catch (error) {
      setRecentSources([])
      setSourcesError(error instanceof Error ? error.message : copy(language, '加载来源失败，请稍后重试。', 'Failed to load sources. Please try again.'))
    } finally {
      setSourcesLoading(false)
    }
  }, [language])

  const loadJournalEntries = useCallback(async () => {
    setJournalLoading(true)
    setJournalError(null)
    try {
      setJournalEntries(await listRecentJournalEntries())
    } catch (error) {
      setJournalEntries([])
      setJournalError(error instanceof Error ? error.message : copy(language, '加载日志失败，请稍后重试。', 'Failed to load journal entries. Please try again.'))
    } finally {
      setJournalLoading(false)
    }
  }, [language])

  const loadReviewItems = useCallback(async () => {
    setReviewLoading(true)
    setReviewError(null)
    try {
      const [items, plan] = await Promise.all([
        listAllReviewItems(),
        buildReviewQueuePlan({ mode: 'due', limit: 12 }),
      ])
      setReviewItems(items)
      setReviewPlan(plan)
    } catch (error) {
      setReviewItems([])
      setReviewPlan(null)
      setReviewError(error instanceof Error ? error.message : copy(language, '加载复习队列失败，请稍后重试。', 'Failed to load the review queue. Please try again.'))
    } finally {
      setReviewLoading(false)
    }
  }, [language])

  const loadGalleryItems = useCallback(async () => {
    setGalleryLoading(true)
    setGalleryError(null)
    try {
      setGalleryItems(await listGallery())
    } catch (error) {
      setGalleryItems([])
      setGalleryError(error instanceof Error ? error.message : copy(language, '加载画廊失败，请稍后重试。', 'Failed to load gallery items. Please try again.'))
    } finally {
      setGalleryLoading(false)
    }
  }, [language])

  useEffect(() => {
    if (showArchived) fetchArchived()
  }, [showArchived, fetchArchived])

  useEffect(() => {
    if (libraryMode === 'evidence') void loadRecentEvidence()
    if (libraryMode === 'reports' || libraryMode === 'investigations') void loadRecentReports()
    if (libraryMode === 'sources') void loadRecentSources()
    if (libraryMode === 'journal') void loadJournalEntries()
    if (libraryMode === 'review') void loadReviewItems()
    if (libraryMode === 'gallery') void loadGalleryItems()
  }, [libraryMode, loadGalleryItems, loadJournalEntries, loadRecentEvidence, loadRecentReports, loadRecentSources, loadReviewItems])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!query.trim()) {
      setSearchResults(null)
      setAssetSearchResults(null)
      setEvidenceResults(null)
      setReportResults(null)
      setGalleryResults(null)
      setJournalResults(null)
      setSearching(false)
      return
    }
    setSearchResults(null)
    setAssetSearchResults(null)
    setEvidenceResults(null)
    setReportResults(null)
    setGalleryResults(null)
    setJournalResults(null)
    setReportsError(null)
    setJournalError(null)
    setSearching(true)
    let alive = true
    timerRef.current = setTimeout(() => {
      if (libraryMode === 'review' || libraryMode === 'related') {
        setSearching(false)
        return
      }

      if (libraryMode === 'reports' || libraryMode === 'investigations') {
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
            setGalleryResults(null)
          })
          .catch(() => {
            if (!alive) return
            setSearchResults(null)
            setEvidenceResults([])
          })
          .finally(() => { if (alive) setSearching(false) })
        return
      }

      if (libraryMode === 'journal') {
        searchJournalEntries(query)
          .then((entries) => {
            if (!alive) return
            setJournalResults(entries)
          })
          .catch(() => {
            if (!alive) return
            setJournalResults([])
          })
          .finally(() => { if (alive) setSearching(false) })
        return
      }

      if (libraryMode === 'sources') {
        searchWorkspace(query)
          .then((workspace) => {
            if (!alive) return
            setSearchResults(workspace.filter((result) => result.kind === 'source'))
          })
          .catch(() => {
            if (!alive) return
            setSearchResults([])
          })
          .finally(() => { if (alive) setSearching(false) })
        return
      }

      if (libraryMode === 'gallery') {
        searchGallery(query)
          .then((gallery) => {
            if (!alive) return
            setGalleryResults(gallery)
          })
          .catch(() => {
            if (!alive) return
            setGalleryResults([])
          })
          .finally(() => { if (alive) setSearching(false) })
        return
      }

      searchAssets({ query, limit: 60 })
        .then((results) => {
          if (!alive) return
          setAssetSearchResults(results)
        })
        .catch(() => {
          if (!alive) return
          setAssetSearchResults([])
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
    const confirmed = window.confirm(copy(
      language,
      `删除报告「${report.title}」？此操作不会删除来源、观点或证据。`,
      `Delete report "${report.title}"? This will not delete sources, points, or evidence.`
    ))
    if (!confirmed) return

    setDeletingReportId(report.id)
    setReportsError(null)
    try {
      await deleteReport(report.id)
      setRecentReports((records) => records.filter((item) => item.id !== report.id))
      setReportResults((records) => records?.filter((item) => item.id !== report.id) ?? null)
      setSelectedReport((current) => current?.id === report.id ? null : current)
    } catch (error) {
      setReportsError(error instanceof Error ? error.message : copy(language, '删除报告失败，请稍后重试。', 'Failed to delete report. Please try again.'))
    } finally {
      setDeletingReportId(null)
    }
  }

  const handleRefreshMode = async () => {
    if (libraryMode === 'sources') {
      await loadRecentSources()
    } else if (libraryMode === 'reports' || libraryMode === 'investigations') {
      await loadRecentReports()
    } else if (libraryMode === 'evidence') {
      await loadRecentEvidence()
    } else if (libraryMode === 'journal') {
      await loadJournalEntries()
    } else if (libraryMode === 'review') {
      await loadReviewItems()
    } else if (libraryMode === 'gallery') {
      await loadGalleryItems()
    }
  }

  const handleGenerateInvestigation = async () => {
    const trimmedQuery = investigationQuery.trim()
    if (!trimmedQuery || investigationGenerating) return

    setInvestigationGenerating(true)
    setInvestigationError(null)
    try {
      const input: InvestigationInput = {
        query: trimmedQuery,
        mode: investigationMode,
        scope: {
          sourceIds: splitIds(investigationSourceIds),
          pointIds: splitIds(investigationPointIds),
          evidenceIds: splitIds(investigationEvidenceIds),
          reportIds: splitIds(investigationReportIds),
          includeLibrarySearch: investigationIncludeSearch,
          includeJournal: investigationIncludeJournal,
        },
      }
      setInvestigationResult(await generateInvestigation(input))
    } catch (error) {
      setInvestigationError(errorMessage(error, copy(language, '生成调查失败，请稍后重试。', 'Failed to generate the investigation. Please try again.')))
    } finally {
      setInvestigationGenerating(false)
    }
  }

  const handleUseJournalForInvestigation = (entry: JournalEntry) => {
    setLibraryMode('investigations')
    localStorage.setItem(LS_LIBRARY_MODE, 'investigations')
    setInvestigationQuery(entry.query)
    setInvestigationSourceIds(parseStringArray(entry.sourceIdsJson).join('\n'))
    setInvestigationPointIds(parseStringArray(entry.pointIdsJson).join('\n'))
    setInvestigationEvidenceIds(parseStringArray(entry.evidenceIdsJson).join('\n'))
    setInvestigationReportIds(parseStringArray(entry.reportIdsJson).join('\n'))
    setInvestigationIncludeJournal(true)
  }

  const handleInvalidateJournalEntry = async (entry: JournalEntry) => {
    if (invalidatingJournalId) return
    const reason = window.prompt('失效原因', '后续材料更新或结论已不可靠')
    if (reason === null) return

    setInvalidatingJournalId(entry.id)
    setJournalError(null)
    try {
      await invalidateJournalEntry(entry.id, reason)
      const invalidatedAt = new Date().toISOString()
      const updateEntry = (item: JournalEntry): JournalEntry =>
        item.id === entry.id
          ? { ...item, invalidatedAt, invalidatedReason: reason }
          : item
      setJournalEntries((records) => records.map(updateEntry))
      setJournalResults((records) => records?.map(updateEntry) ?? null)
    } catch (error) {
      setJournalError(errorMessage(error, copy(language, '标记日志失效失败，请稍后重试。', 'Failed to invalidate the journal entry. Please try again.')))
    } finally {
      setInvalidatingJournalId(null)
    }
  }

  const handleAddReviewItem = async () => {
    const targetId = reviewDraftId.trim()
    const title = reviewDraftTitle.trim()
    if (!targetId || !title || reviewMutatingId) {
      if (!targetId || !title) setReviewError(copy(language, '复习项需要目标 ID 和标题。', 'Review items require a target ID and title.'))
      return
    }

    setReviewMutatingId('__new__')
    setReviewError(null)
    try {
      await addReviewItem({
        targetKind: reviewDraftKind,
        targetId,
        title,
        priority: 'normal',
      })
      setReviewDraftId('')
      setReviewDraftTitle('')
      await loadReviewItems()
    } catch (error) {
      setReviewError(errorMessage(error, copy(language, '加入复习队列失败，请稍后重试。', 'Failed to add to the review queue. Please try again.')))
    } finally {
      setReviewMutatingId(null)
    }
  }

  const handleAddAssetToReview = async (targetKind: ReviewTargetKind, targetId: string, title: string) => {
    if (reviewMutatingId) return
    setReviewMutatingId(`${targetKind}:${targetId}`)
    setReviewError(null)
    try {
      await addReviewItem({
        targetKind,
        targetId,
        title,
        priority: 'normal',
      })
      await loadReviewItems()
    } catch (error) {
      setReviewError(errorMessage(error, copy(language, '加入复习队列失败，请稍后重试。', 'Failed to add to the review queue. Please try again.')))
    } finally {
      setReviewMutatingId(null)
    }
  }

  const handleCompleteReviewItem = async (item: ReviewItem, rating: ReviewRating) => {
    if (reviewMutatingId) return
    setReviewMutatingId(item.id)
    setReviewError(null)
    try {
      await completeReviewItem(item.id, rating)
      await loadReviewItems()
    } catch (error) {
      setReviewError(errorMessage(error, copy(language, '完成复习失败，请稍后重试。', 'Failed to complete the review. Please try again.')))
    } finally {
      setReviewMutatingId(null)
    }
  }

  const handleSnoozeReviewItem = async (item: ReviewItem) => {
    if (reviewMutatingId) return
    setReviewMutatingId(item.id)
    setReviewError(null)
    try {
      await snoozeReviewItem(item.id, 3)
      await loadReviewItems()
    } catch (error) {
      setReviewError(errorMessage(error, copy(language, '推迟复习失败，请稍后重试。', 'Failed to snooze the review. Please try again.')))
    } finally {
      setReviewMutatingId(null)
    }
  }

  const handleDismissReviewItem = async (item: ReviewItem) => {
    if (reviewMutatingId) return
    setReviewMutatingId(item.id)
    setReviewError(null)
    try {
      await dismissReviewItem(item.id)
      await loadReviewItems()
    } catch (error) {
      setReviewError(errorMessage(error, copy(language, '移除复习项失败，请稍后重试。', 'Failed to dismiss the review item. Please try again.')))
    } finally {
      setReviewMutatingId(null)
    }
  }

  const handleOpenReviewTarget = (item: ReviewItem) => {
    if (item.targetKind === 'source') {
      onOpenSource?.(item.targetId, null)
      return
    }
    if (item.targetKind === 'point') {
      onOpenPointSource?.(item.targetId)
    }
  }

  const handleRebuildRelations = async () => {
    if (relatedLoading) return
    setRelatedLoading(true)
    setRelatedError(null)
    try {
      const count = await rebuildAssetRelations()
      setRelatedError(copy(language, `已重建 ${count} 条关系。`, `Rebuilt ${count} relations.`))
      if (relatedId.trim()) {
        setRelatedRecords(await discoverRelatedAssets(relatedKind, relatedId.trim()))
      }
    } catch (error) {
      setRelatedError(errorMessage(error, copy(language, '重建关系失败，请稍后重试。', 'Failed to rebuild relations. Please try again.')))
    } finally {
      setRelatedLoading(false)
    }
  }

  const handleOpenReportById = async (reportId: string) => {
    const localReport = recentReports.find((item) => item.id === reportId) ?? reportResults?.find((item) => item.id === reportId)
    if (localReport) {
      setSelectedReport(localReport)
      return
    }

    setReportsError(null)
    try {
      const report = await getReport(reportId)
      if (report) setSelectedReport(report)
    } catch (error) {
      setReportsError(errorMessage(error, copy(language, '打开关联报告失败，请稍后重试。', 'Failed to open the linked report. Please try again.')))
    }
  }

  const handleDiscoverRelatedAssets = async () => {
    const id = relatedId.trim()
    if (!id || relatedLoading) {
      if (!id) setRelatedError(copy(language, '相关查询需要资产 ID。', 'Related lookup requires an asset ID.'))
      return
    }
    setRelatedLoading(true)
    setRelatedError(null)
    try {
      setRelatedRecords(await discoverRelatedAssets(relatedKind, id))
    } catch (error) {
      setRelatedRecords([])
      setRelatedError(errorMessage(error, copy(language, '查询相关资产失败，请稍后重试。', 'Failed to query related assets. Please try again.')))
    } finally {
      setRelatedLoading(false)
    }
  }

  const activePoints = showArchived ? archivedPoints : points
  const sourceResults = searchResults?.filter((result) => result.kind === 'source') ?? []
  const pointResults = searchResults?.filter((result) => result.kind === 'point') ?? []
  const searchActive = query.trim().length > 0
  const assetResults = libraryMode === 'points' && searchActive ? (assetSearchResults ?? []) : []
  const groupedAssetResults = {
    source: assetResults.filter((result) => result.kind === 'source'),
    point: assetResults.filter((result) => result.kind === 'point'),
    evidence: assetResults.filter((result) => result.kind === 'evidence'),
    report: assetResults.filter((result) => result.kind === 'report'),
    journal: assetResults.filter((result) => result.kind === 'journal'),
    gallery: assetResults.filter((result) => result.kind === 'gallery'),
    indexedFile: assetResults.filter((result) => result.kind === 'indexed_file'),
  }
  const assetResultSections = [
    { key: 'source' as const, kind: 'source' as const, results: groupedAssetResults.source },
    { key: 'point' as const, kind: 'point' as const, results: groupedAssetResults.point },
    { key: 'evidence' as const, kind: 'evidence' as const, results: groupedAssetResults.evidence },
    { key: 'report' as const, kind: 'report' as const, results: groupedAssetResults.report },
    { key: 'journal' as const, kind: 'journal' as const, results: groupedAssetResults.journal },
    { key: 'gallery' as const, kind: 'gallery' as const, results: groupedAssetResults.gallery },
    { key: 'indexed-file' as const, kind: 'indexed-file' as const, results: groupedAssetResults.indexedFile },
  ].filter((section) => section.results.length > 0)
  const totalSearchResults = assetResults.length
  const ledgerEvidenceRecords = searchActive ? (evidenceResults ?? []) : recentEvidence
  const filteredLedgerEvidence = filterEvidenceByVerdict(ledgerEvidenceRecords, evidenceVerdictFilter)
  const reportRecords = searchActive ? (reportResults ?? []) : recentReports
  const visibleReports = filterReportsByKind(reportRecords, reportKindFilter)
  const investigationReports = reportRecords.filter((report) => report.kind === 'investigation')
  const journalRecords = searchActive ? (journalResults ?? []) : journalEntries
  const galleryRecords = searchActive ? (galleryResults ?? []) : galleryItems
  const showSynthesisPanel = libraryMode === 'points' && (synthesisSources.length > 0 || starredCount > 0)
  const canGenerateSynthesis = synthesisSources.length > 0 || (includeStarred && starredCount > 0)
  const refreshLoading =
    (libraryMode === 'sources' && sourcesLoading) ||
    ((libraryMode === 'reports' || libraryMode === 'investigations') && reportsLoading) ||
    (libraryMode === 'evidence' && evidenceLoading) ||
    (libraryMode === 'journal' && journalLoading) ||
    (libraryMode === 'review' && reviewLoading) ||
    (libraryMode === 'gallery' && galleryLoading)
  const libraryDescription =
    libraryMode === 'sources'
      ? copy(language, '已导入或索引的材料入口，可进入来源工作区或加入综合输入。', 'Imported or indexed materials. Open them in Source Workspace or add them to synthesis input.')
      : libraryMode === 'reports'
        ? copy(language, '已保存的研报和多来源综合，保留结构化引用。', 'Saved digests and synthesis reports with structured citations.')
        : libraryMode === 'investigations'
          ? copy(language, '围绕问题生成带引用调查报告，并保存为调查报告。', 'Generate cited investigation reports around a question and save them as investigation reports.')
          : libraryMode === 'journal'
            ? copy(language, '调查记忆作为未来召回线索，失效后不再默认参与调查。', 'Investigation memories are future recall signals; invalidated entries are excluded by default.')
            : libraryMode === 'review'
              ? copy(language, '把关键资产加入复习队列，按“再来 / 困难 / 良好 / 简单”推进。', 'Add key assets to the review queue and progress them with again / hard / good / easy.')
              : libraryMode === 'gallery'
                ? copy(language, '已生成图片资产及其关联观点。', 'Generated image assets and their linked points.')
                : libraryMode === 'related'
                  ? copy(language, '按共同引用、来源、日志、画廊和复习信号发现相关资产。', 'Discover related assets from co-citation, source, journal, gallery, and review signals.')
                  : libraryMode === 'evidence'
                    ? copy(language, '已保存的事实审查证据，按时间、搜索和结论复查。', 'Saved fact-check evidence reviewed by time, search, and verdict.')
                    : copy(language, '已保存的全部观点，按来源文档分组。', 'All saved points grouped by source document.')

  const handleOpenSearchResult = (result: WorkspaceSearchResult) => {
    if (result.kind === 'source') {
      onOpenSource?.(result.id, null)
      return
    }
    if (result.sourceId) {
      onOpenSource?.(result.sourceId, result.chunkIndex)
    }
  }

  const handleOpenAssetSearchResult = async (result: SearchAssetResult) => {
    if (result.kind === 'source') {
      onOpenSource?.(result.id, null)
      return
    }
    if (result.kind === 'point') {
      if (result.sourceId) {
        onOpenSource?.(result.sourceId, result.chunkIndex)
      } else {
        onOpenPointSource?.(result.id)
      }
      return
    }
    if (result.kind === 'report') {
      const report = await getReport(result.id)
      if (report) setSelectedReport(report)
      return
    }
    if (result.kind === 'gallery') {
      onOpenGallery?.()
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
      setSynthesisError(error instanceof Error ? error.message : copy(language, '生成综合报告失败，请稍后重试。', 'Failed to generate the synthesis report. Please try again.'))
    } finally {
      setSynthesisGenerating(false)
    }
  }

  const renderAssetIcon = (kind: SearchAssetResult['kind']) => {
    switch (kind) {
      case 'source':
      case 'journal':
      case 'indexed_file':
        return <FileText size={15} className="mt-0.5 shrink-0 text-accent" />
      case 'point':
        return <LocateFixed size={15} className="mt-0.5 shrink-0 text-accent" />
      case 'evidence':
        return <ShieldCheck size={15} className="mt-0.5 shrink-0 text-accent" />
      case 'report':
        return <ScrollText size={15} className="mt-0.5 shrink-0 text-accent" />
      case 'gallery':
        return <Images size={15} className="mt-0.5 shrink-0 text-accent" />
      default:
        return <Search size={15} className="mt-0.5 shrink-0 text-accent" />
    }
  }

  const renderAssetSearchResult = (result: SearchAssetResult) => {
    const canOpen =
      result.kind === 'source' ||
      result.kind === 'point' ||
      result.kind === 'report' ||
      result.kind === 'gallery' ||
      Boolean(result.sourceId)

    return (
      <article
        key={`${result.kind}-${result.id}`}
        className="flex w-full items-start gap-3 rounded-lg border border-border bg-bg-elevated px-4 py-3 text-left transition-colors hover:bg-bg-hover"
      >
        <button
          type="button"
          onClick={() => void handleOpenAssetSearchResult(result)}
          disabled={!canOpen}
          className="flex min-w-0 flex-1 items-start gap-3 text-left disabled:cursor-default"
        >
          {renderAssetIcon(result.kind)}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium text-fg">{result.title}</span>
              <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] text-fg-faint">
                {assetKindLabel(result.kind, language)}
              </span>
            </span>
            <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">
              {result.preview || result.snippet}
            </span>
            <span className="mt-2 block text-[11px] text-fg-faint">{result.reason}</span>
          </span>
        </button>
        {result.kind === 'source' && (
          <button
            type="button"
            onClick={() => toggleSynthesisSource({ id: result.id, title: result.title })}
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors',
              hasSynthesisSource(result.id)
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-border text-fg-muted hover:bg-bg-hover hover:text-accent'
            )}
            title={hasSynthesisSource(result.id) ? copy(language, '从综合输入移除', 'Remove from synthesis input') : copy(language, '加入综合输入', 'Add to synthesis input')}
          >
            {hasSynthesisSource(result.id) ? <Check size={11} /> : <BookmarkPlus size={11} />}
            {hasSynthesisSource(result.id) ? copy(language, '已加入', 'Added') : copy(language, '加入综合', 'Add')}
          </button>
        )}
      </article>
    )
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
        title={selected ? copy(language, '从研报输入移除', 'Remove from digest input') : copy(language, '加入研报输入', 'Add to digest input')}
      >
        {selected ? <Check size={11} /> : <BookmarkPlus size={11} />}
        {selected ? copy(language, '已加入', 'Added') : copy(language, '加入研报', 'Add')}
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
              {reportKindDisplay(report.kind, language)}
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
        title={copy(language, '删除报告', 'Delete report')}
      >
        {deletingReportId === report.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>
    </article>
  )

  const renderSourceItem = (source: SourceSummaryRecord) => (
    <article
      key={source.id}
      className="flex w-full items-start gap-3 rounded-lg border border-border bg-bg-elevated px-4 py-3 text-left transition-colors hover:bg-bg-hover"
    >
      <button
        type="button"
        onClick={() => onOpenSource?.(source.id, null)}
        className="flex min-w-0 flex-1 items-start gap-3 text-left"
      >
        <FileText size={15} className="mt-0.5 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{source.title ?? source.canonicalUri}</span>
          <span className="mt-1 block truncate text-xs text-fg-faint">{source.canonicalUri}</span>
          <span className="mt-2 block text-[11px] text-fg-faint">
            {copy(
              language,
              `${source.chunkCount} 块 · ${source.pointCount} 个观点 · ${source.starCount} 颗星`,
              `${source.chunkCount} chunks · ${source.pointCount} Points · ${source.starCount} Stars`
            )}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => toggleSynthesisSource({ id: source.id, title: source.title ?? source.canonicalUri })}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors',
          hasSynthesisSource(source.id)
            ? 'border-accent/40 bg-accent/10 text-accent'
            : 'border-border text-fg-muted hover:bg-bg-hover hover:text-accent'
        )}
        title={hasSynthesisSource(source.id) ? copy(language, '从综合输入移除', 'Remove from synthesis input') : copy(language, '加入综合输入', 'Add to synthesis input')}
      >
        {hasSynthesisSource(source.id) ? <Check size={11} /> : <BookmarkPlus size={11} />}
        {hasSynthesisSource(source.id) ? copy(language, '已加入', 'Added') : copy(language, '加入综合', 'Add')}
      </button>
      <button
        type="button"
        onClick={() => void handleAddAssetToReview('source', source.id, source.title ?? source.canonicalUri)}
        disabled={reviewMutatingId !== null}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent disabled:opacity-50"
        title={copy(language, '加入复习', 'Add to review')}
      >
        <Clock size={11} />
        {copy(language, '复习', 'Review')}
      </button>
    </article>
  )

  const renderGalleryItem = (item: GalleryItem) => (
    <article
      key={`gallery-${item.id}`}
      className="flex w-full items-start gap-3 rounded-lg border border-border bg-bg-elevated px-4 py-3 text-left transition-colors hover:bg-bg-hover"
    >
      <Images size={15} className="mt-0.5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-fg">{item.prompt}</span>
          <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] text-fg-faint">
            {item.downloadStatus}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">
          {item.sourcePoints.length > 0
            ? item.sourcePoints.map((point) => point.content).join(' · ')
            : item.filePath}
        </p>
        <p className="mt-2 text-[11px] text-fg-faint">
          {copy(language, `${item.pointIds.length} 个关联观点`, `${item.pointIds.length} linked Point`)} · {item.generatedAt.slice(0, 10)}
        </p>
      </div>
      {onOpenGallery && (
        <button
          type="button"
          onClick={onOpenGallery}
          className="shrink-0 rounded-md border border-border px-2 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent"
          title={copy(language, '打开画廊', 'Open gallery')}
        >
          {copy(language, '打开', 'Open')}
        </button>
      )}
    </article>
  )

  const renderJournalEntry = (entry: JournalEntry) => {
    const sourceIds = parseStringArray(entry.sourceIdsJson)
    const pointIds = parseStringArray(entry.pointIdsJson)
    const evidenceIds = parseStringArray(entry.evidenceIdsJson)
    const reportIds = parseStringArray(entry.reportIdsJson)
    return (
      <article
        key={entry.id}
        className={cn(
          'rounded-lg border border-border bg-bg-elevated px-4 py-3',
          entry.invalidatedAt && 'opacity-70'
        )}
      >
        <div className="flex items-start gap-3">
          <FileText size={15} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-sm font-medium text-fg">{entry.query}</h3>
              {entry.invalidatedAt && (
                <span className="shrink-0 rounded-md border border-red-500/30 px-2 py-0.5 text-[11px] text-red-300">
                  {copy(language, '已失效', 'Invalidated')}
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-fg-muted">{entry.note}</p>
            <p className="mt-2 text-[11px] text-fg-faint">
              {formatReportDate(entry.createdAt)} · {copy(language, '来源', 'S')} {sourceIds.length} · {copy(language, '观点', 'P')} {pointIds.length} · {copy(language, '证据', 'E')} {evidenceIds.length} · {copy(language, '报告', 'R')} {reportIds.length}
            </p>
            {entry.invalidatedReason && (
              <p className="mt-2 text-[11px] text-red-300/90">{entry.invalidatedReason}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {entry.createdReportId && (
              <button
                type="button"
                onClick={() => void handleOpenReportById(entry.createdReportId!)}
                className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent"
                title={copy(language, '打开关联报告', 'Open linked report')}
              >
                <ScrollText size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={() => handleUseJournalForInvestigation(entry)}
              className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent"
              title={copy(language, '用此日志发起调查', 'Start an investigation from this journal entry')}
            >
              <Sparkles size={12} />
            </button>
            {!entry.invalidatedAt && (
              <button
                type="button"
                onClick={() => void handleInvalidateJournalEntry(entry)}
                disabled={invalidatingJournalId !== null}
                className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                title={copy(language, '标记失效', 'Mark invalid')}
              >
                {invalidatingJournalId === entry.id ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
              </button>
            )}
          </div>
        </div>
      </article>
    )
  }

  const renderReviewStat = (label: string, value: number, detail?: string) => (
    <div key={label} className="rounded-lg border border-border bg-bg px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-fg-faint">{label}</p>
      <p className="mt-1 text-lg font-semibold text-fg">{value}</p>
      {detail && <p className="mt-0.5 text-[11px] text-fg-faint">{detail}</p>}
    </div>
  )

  const renderReviewItem = (item: ReviewItem, planItem?: ReviewQueuePlanItem) => {
    const due = new Date(item.dueAt)
    const dueText = Number.isNaN(due.getTime()) ? item.dueAt : due.toLocaleDateString(isZh(language) ? 'zh-CN' : 'en-US')
    return (
      <article key={item.id} className="rounded-lg border border-border bg-bg-elevated px-4 py-3">
        <div className="flex items-start gap-3">
          <Clock size={15} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-sm font-medium text-fg">{item.title}</h3>
              {planItem && (
                <span className="shrink-0 rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] text-accent">
                  #{planItem.position}
                </span>
              )}
              <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] text-fg-faint">
                {assetKindLabel(item.targetKind, language)}
              </span>
              <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] text-fg-faint">
                {reviewPriorityLabel(item.priority, language)}
              </span>
              {item.status !== 'active' && (
                <span className="shrink-0 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300">
                  {reviewStatusLabel(item.status, language)}
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-fg-faint">{item.targetId}</p>
            {item.note && <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{item.note}</p>}
            {planItem && (
              <p className="mt-2 rounded-md border border-accent/20 bg-accent/5 px-2 py-1 text-[11px] text-accent">
                {copy(language, '排序', 'rank')} {planItem.priorityRank} · {reviewPlanReasonLabel(planItem.reason, language)}
              </p>
            )}
            <p className="mt-2 text-[11px] text-fg-faint">
              {copy(language, '到期', 'due')} {dueText} · {copy(language, '已复习', 'reviewed')} {item.reviewCount} · {copy(language, '间隔', 'interval')} {item.intervalDays ?? 0}{copy(language, '天', 'd')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleOpenReviewTarget(item)}
            disabled={item.targetKind !== 'source' && item.targetKind !== 'point'}
            className="shrink-0 rounded-md border border-border px-2 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent disabled:cursor-default disabled:opacity-40"
            title={copy(language, '打开资产', 'Open asset')}
          >
            <LocateFixed size={12} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {REVIEW_RATINGS.map((rating) => (
            <button
              key={rating.id}
              type="button"
              onClick={() => void handleCompleteReviewItem(item, rating.id)}
              disabled={reviewMutatingId !== null}
              className="rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-50"
            >
              {reviewRatingLabel(rating, language)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void handleSnoozeReviewItem(item)}
            disabled={reviewMutatingId !== null}
            className="rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:opacity-50"
          >
            {copy(language, '推迟', 'Snooze')}
          </button>
          <button
            type="button"
            onClick={() => void handleDismissReviewItem(item)}
            disabled={reviewMutatingId !== null}
            className="rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
          >
            {copy(language, '移除', 'Dismiss')}
          </button>
        </div>
      </article>
    )
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col px-8 py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{copy(language, '知识库', 'Library')}</h1>
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
              {optionLabel(option, language)}
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
              libraryMode === 'reports' || libraryMode === 'investigations'
                ? copy(language, '搜索报告标题、摘要、正文或引用…', 'Search report title, summary, body, or citations…')
                : libraryMode === 'evidence'
                  ? copy(language, '搜索主张、答案或证据来源…', 'Search claim, answer, or evidence sources…')
                  : libraryMode === 'journal'
                    ? copy(language, '搜索调查问题、笔记或关联资产…', 'Search investigation questions, notes, or linked assets…')
                    : libraryMode === 'gallery'
                      ? copy(language, '搜索图片提示词、路径或关联观点…', 'Search image prompt, path, or linked points…')
                      : libraryMode === 'sources'
                        ? copy(language, '搜索来源标题、URI 或摘要…', 'Search source title, URI, or summary…')
                        : libraryMode === 'review' || libraryMode === 'related'
                          ? copy(language, '当前视图使用下方输入控件…', 'Use the controls below for this view…')
                          : copy(language, '搜索观点、来源或证据…', 'Search points, sources, or evidence…')
            }
            value={query}
            onChange={e => setQuery(e.target.value)}
            disabled={libraryMode === 'review' || libraryMode === 'related'}
          />
          {query && <button onClick={() => setQuery('')} className="shrink-0 text-fg-muted hover:text-fg"><X size={14} /></button>}
        </div>

        {libraryMode === 'points' ? (
          <>
            {/* Archive toggle */}
            <button onClick={() => setShowArchived(s => !s)}
              className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors',
                showArchived ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-bg-elevated text-fg-muted hover:text-fg')}>
              <Archive size={14} />{showArchived ? copy(language, '已归档', 'Archived') : copy(language, '归档', 'Archive')}
            </button>

            {/* View switcher — hidden in archived mode */}
            {!showArchived && (
              <div className="flex rounded-lg border border-border bg-bg-elevated overflow-hidden">
                {VIEW_OPTS.map(v => (
                  <button key={v.id} onClick={() => handleSetView(v.id)} title={optionLabel(v, language)}
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
            onClick={() => void handleRefreshMode()}
            disabled={refreshLoading || libraryMode === 'related'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
            title={copy(language, '刷新当前视图', 'Refresh current view')}
          >
            <RefreshCw size={14} className={cn(refreshLoading && 'animate-spin')} />
            {copy(language, '刷新', 'Refresh')}
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
                <span>{copy(language, '多来源综合', 'Multi-source synthesis')}</span>
              </div>
              <p className="mt-1 text-xs text-fg-faint">
                {copy(
                  language,
                  `已选 ${synthesisSources.length} 个来源，当前星标 ${starredCount} 个`,
                  `${synthesisSources.length} sources selected, ${starredCount} current stars`
                )}
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
              {copy(language, '包含星标', 'Include stars')}
            </label>
            <button
              type="button"
              onClick={clearSynthesisSources}
              disabled={synthesisSources.length === 0 || synthesisGenerating}
              className="rounded-lg border border-border px-3 py-2 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:opacity-50"
            >
              {copy(language, '清空来源', 'Clear sources')}
            </button>
            <button
              type="button"
              onClick={() => void handleGenerateSynthesis()}
              disabled={!canGenerateSynthesis || synthesisGenerating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {synthesisGenerating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {copy(language, '生成综合', 'Generate synthesis')}
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
                    title={copy(language, '移除来源', 'Remove source')}
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
        {libraryMode === 'sources' ? (
          <div className="space-y-4 pb-6">
            <div className="flex items-center justify-between text-xs text-fg-faint">
              <span>{searchActive ? copy(language, '来源搜索结果', 'Source search results') : copy(language, '最近来源', 'Recent sources')}</span>
              <span>{searchActive ? sourceResults.length : recentSources.length}</span>
            </div>
            {sourcesError && !searchActive ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span className="break-words">{sourcesError}</span>
              </div>
            ) : searchActive && searchResults === null ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
                <Loader2 size={16} className="animate-spin" />{copy(language, '搜索来源…', 'Searching sources…')}
              </div>
            ) : !searchActive && sourcesLoading ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
                <Loader2 size={16} className="animate-spin" />{copy(language, '加载来源…', 'Loading sources…')}
              </div>
            ) : searchActive ? (
              sourceResults.length > 0 ? (
                <div className="space-y-2">
                  {sourceResults.map((result) => (
                    <article
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
                      >
                        {hasSynthesisSource(result.id) ? <Check size={11} /> : <BookmarkPlus size={11} />}
                        {hasSynthesisSource(result.id) ? copy(language, '已加入', 'Added') : copy(language, '加入综合', 'Add')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAddAssetToReview('source', result.id, result.title)}
                        disabled={reviewMutatingId !== null}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent disabled:opacity-50"
                      >
                        <Clock size={11} />
                        {copy(language, '复习', 'Review')}
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-40 items-center justify-center text-sm text-fg-faint">{copy(language, '没有符合当前搜索的来源。', 'No sources match the current search.')}</div>
              )
            ) : recentSources.length > 0 ? (
              <div className="space-y-2">
                {recentSources.map(renderSourceItem)}
              </div>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-fg-faint">
                <FileText size={24} className="opacity-50" />
                <p>{copy(language, '还没有来源。导入或索引材料后会出现在这里。', 'No sources yet. Imported or indexed materials will appear here.')}</p>
              </div>
            )}
          </div>
        ) : libraryMode === 'investigations' ? (
          <div className="space-y-5 pb-6">
            <section className="rounded-lg border border-border bg-bg-elevated px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium text-fg">
                <Sparkles size={14} className="text-accent" />
                <span>{copy(language, '调查', 'Investigation')}</span>
              </div>
              <textarea
                value={investigationQuery}
                onChange={(event) => setInvestigationQuery(event.target.value)}
                className="mt-3 min-h-20 w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-faint"
                placeholder={copy(language, '输入调查问题…', 'Enter an investigation question…')}
              />
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <textarea value={investigationSourceIds} onChange={(event) => setInvestigationSourceIds(event.target.value)} className="min-h-16 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-fg outline-none placeholder:text-fg-faint" placeholder={copy(language, '来源 ID', 'Source IDs')} />
                <textarea value={investigationPointIds} onChange={(event) => setInvestigationPointIds(event.target.value)} className="min-h-16 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-fg outline-none placeholder:text-fg-faint" placeholder={copy(language, '观点 ID', 'Point IDs')} />
                <textarea value={investigationEvidenceIds} onChange={(event) => setInvestigationEvidenceIds(event.target.value)} className="min-h-16 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-fg outline-none placeholder:text-fg-faint" placeholder={copy(language, '证据 ID', 'Evidence IDs')} />
                <textarea value={investigationReportIds} onChange={(event) => setInvestigationReportIds(event.target.value)} className="min-h-16 rounded-lg border border-border bg-bg px-3 py-2 text-xs text-fg outline-none placeholder:text-fg-faint" placeholder={copy(language, '报告 ID', 'Report IDs')} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <select
                  value={investigationMode}
                  onChange={(event) => setInvestigationMode(event.target.value as InvestigationInput['mode'])}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-xs text-fg outline-none"
                >
                  {INVESTIGATION_MODES.map((mode) => <option key={mode} value={mode}>{investigationModeLabel(mode, language)}</option>)}
                </select>
                <label className="flex items-center gap-2 text-xs text-fg-muted">
                  <input type="checkbox" checked={investigationIncludeSearch} onChange={(event) => setInvestigationIncludeSearch(event.target.checked)} className="h-3.5 w-3.5 accent-[var(--color-accent)]" />
                  {copy(language, '全库检索', 'Search whole library')}
                </label>
                <label className="flex items-center gap-2 text-xs text-fg-muted">
                  <input type="checkbox" checked={investigationIncludeJournal} onChange={(event) => setInvestigationIncludeJournal(event.target.checked)} className="h-3.5 w-3.5 accent-[var(--color-accent)]" />
                  {copy(language, '日志召回', 'Journal recall')}
                </label>
                <button
                  type="button"
                  onClick={() => void handleGenerateInvestigation()}
                  disabled={!investigationQuery.trim() || investigationGenerating}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  {investigationGenerating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {copy(language, '生成', 'Generate')}
                </button>
              </div>
              {investigationError && (
                <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-300">{investigationError}</p>
              )}
            </section>
            <section className="space-y-3">
              <div className="flex items-center justify-between text-xs text-fg-faint">
                <span>{searchActive ? copy(language, '调查搜索结果', 'Investigation search results') : copy(language, '最近调查', 'Recent investigations')}</span>
                <span>{investigationReports.length}</span>
              </div>
              {(searchActive && reportResults === null) || (!searchActive && reportsLoading) ? (
                <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
                  <Loader2 size={16} className="animate-spin" />{copy(language, '加载调查…', 'Loading investigations…')}
                </div>
              ) : investigationReports.length > 0 ? (
                <div className="space-y-2">{investigationReports.map(renderReportItem)}</div>
              ) : (
                <div className="flex min-h-32 items-center justify-center text-sm text-fg-faint">{copy(language, '还没有保存调查报告。', 'No investigation reports saved yet.')}</div>
              )}
            </section>
          </div>
        ) : libraryMode === 'journal' ? (
          <div className="space-y-4 pb-6">
            <div className="flex items-center justify-between text-xs text-fg-faint">
              <span>{searchActive ? copy(language, '日志搜索结果', 'Journal search results') : copy(language, '最近日志', 'Recent journal entries')}</span>
              <span>{journalRecords.length}</span>
            </div>
            {(journalError || reportsError) && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span className="break-words">{journalError ?? reportsError}</span>
              </div>
            )}
            {(searchActive && journalResults === null) || (!searchActive && journalLoading) ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
                <Loader2 size={16} className="animate-spin" />{copy(language, '加载日志…', 'Loading journal entries…')}
              </div>
            ) : journalRecords.length > 0 ? (
              <div className="space-y-2">{journalRecords.map(renderJournalEntry)}</div>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-fg-faint">
                <FileText size={24} className="opacity-50" />
                <p>{copy(language, '还没有日志。保存调查后会自动沉淀调查记忆。', 'No journal entries yet. Saved investigations will create investigation memories automatically.')}</p>
              </div>
            )}
          </div>
        ) : libraryMode === 'review' ? (
          <div className="space-y-4 pb-6">
            <section className="rounded-lg border border-border bg-bg-elevated px-4 py-3">
              <div className="grid gap-2 md:grid-cols-[150px_1fr_1fr_auto]">
                <select value={reviewDraftKind} onChange={(event) => setReviewDraftKind(event.target.value as ReviewTargetKind)} className="rounded-lg border border-border bg-bg px-3 py-2 text-xs text-fg outline-none">
                  {REVIEW_TARGET_OPTIONS.map((kind) => <option key={kind} value={kind}>{assetKindLabel(kind, language)}</option>)}
                </select>
                <input value={reviewDraftId} onChange={(event) => setReviewDraftId(event.target.value)} className="rounded-lg border border-border bg-bg px-3 py-2 text-xs text-fg outline-none placeholder:text-fg-faint" placeholder={copy(language, '目标 ID', 'Target ID')} />
                <input value={reviewDraftTitle} onChange={(event) => setReviewDraftTitle(event.target.value)} className="rounded-lg border border-border bg-bg px-3 py-2 text-xs text-fg outline-none placeholder:text-fg-faint" placeholder={copy(language, '标题', 'Title')} />
                <button type="button" onClick={() => void handleAddReviewItem()} disabled={reviewMutatingId !== null} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
                  <Plus size={13} />
                  {copy(language, '加入', 'Add')}
                </button>
              </div>
            </section>
            {reviewError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span className="break-words">{reviewError}</span>
              </div>
            )}
            {reviewLoading ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
                <Loader2 size={16} className="animate-spin" />{copy(language, '加载复习队列…', 'Loading review queue…')}
              </div>
            ) : (
              <>
                <section className="rounded-lg border border-border bg-bg-elevated px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-fg-faint">{copy(language, '队列规划器', 'queue planner')}</p>
                      <h2 className="mt-1 text-sm font-semibold text-fg">{copy(language, '本轮复习计划', 'Current review plan')}</h2>
                      <p className="mt-1 text-xs text-fg-faint">
                        {reviewPlan ? copy(language, `生成于 ${formatReportDate(reviewPlan.now)}`, `Generated ${formatReportDate(reviewPlan.now)}`) : copy(language, '规划器暂无可用结果', 'Planner has no available result')}
                      </p>
                    </div>
                    {reviewPlan && (
                      <span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-xs text-accent">
                        {reviewPlanModeLabel(reviewPlan.mode, language)} · {copy(language, '上限', 'limit')} {reviewPlan.limit}
                      </span>
                    )}
                  </div>
                  {reviewPlan ? (
                    <>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {renderReviewStat(copy(language, '已计划', 'planned'), reviewPlan.items.length, copy(language, `${reviewPlan.candidateCount} 个候选`, `${reviewPlan.candidateCount} candidates`))}
                        {renderReviewStat(copy(language, '到期', 'due'), reviewPlan.dueCount, copy(language, `${reviewPlan.overdueCount} 个逾期`, `${reviewPlan.overdueCount} overdue`))}
                        {renderReviewStat(copy(language, '未来', 'future'), reviewPlan.futureCount, copy(language, '稍后激活', 'active later'))}
                        {renderReviewStat(copy(language, '溢出', 'overflow'), reviewPlan.overflowCount, copy(language, `${reviewPlan.dismissedCount} 个已移除`, `${reviewPlan.dismissedCount} dismissed`))}
                      </div>
                      <div className="mt-4">
                        <div className="mb-2 flex items-center justify-between text-xs text-fg-faint">
                          <span>计划项</span>
                          <span>{reviewPlan.items.length}</span>
                        </div>
                        {reviewPlan.items.length > 0 ? (
                          <div className="space-y-2">
                            {reviewPlan.items.map((planItem) => renderReviewItem(planItem.item, planItem))}
                          </div>
                        ) : (
                          <div className="flex min-h-28 flex-col items-center justify-center gap-2 text-center text-sm text-fg-faint">
                            <Clock size={22} className="opacity-50" />
                            <p>{copy(language, '当前没有到期复习项；未来项会计入统计但不进入本轮计划。', 'There are no due review items; future items count in stats but are excluded from this plan.')}</p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="mt-3 rounded-lg border border-border bg-bg px-3 py-3 text-sm text-fg-faint">
                      {copy(language, '规划器未返回结果。请刷新复习队列或检查后端命令状态。', 'Planner returned no result. Refresh Review or check backend command status.')}
                    </div>
                  )}
                </section>
                <section className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-fg-faint">
                    <span>{copy(language, '全部复习队列', 'Full review queue')}</span>
                    <span>{reviewItems.length}</span>
                  </div>
                  {reviewItems.length > 0 ? (
                    <div className="space-y-2">{reviewItems.map((item) => renderReviewItem(item))}</div>
                  ) : (
                    <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-fg-faint">
                      <Clock size={24} className="opacity-50" />
                      <p>{copy(language, '还没有复习项。可从来源或手动输入资产 ID 加入。', 'No review items yet. Add one from a source or by entering an asset ID manually.')}</p>
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        ) : libraryMode === 'gallery' ? (
          <div className="space-y-4 pb-6">
            <div className="flex items-center justify-between text-xs text-fg-faint">
              <span>{searchActive ? copy(language, '画廊搜索结果', 'Gallery search results') : copy(language, '最近画廊', 'Recent gallery items')}</span>
              <span>{galleryRecords.length}</span>
            </div>
            {galleryError && !searchActive ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span className="break-words">{galleryError}</span>
              </div>
            ) : (searchActive && galleryResults === null) || (!searchActive && galleryLoading) ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
                <Loader2 size={16} className="animate-spin" />{copy(language, '加载画廊…', 'Loading gallery…')}
              </div>
            ) : galleryRecords.length > 0 ? (
              <div className="space-y-2">{galleryRecords.map(renderGalleryItem)}</div>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-fg-faint">
                <Images size={24} className="opacity-50" />
                <p>{copy(language, '还没有画廊资产。', 'No gallery assets yet.')}</p>
              </div>
            )}
          </div>
        ) : libraryMode === 'related' ? (
          <div className="space-y-4 pb-6">
            <section className="rounded-lg border border-border bg-bg-elevated px-4 py-3">
              <div className="grid gap-2 md:grid-cols-[150px_1fr_auto_auto]">
                <select value={relatedKind} onChange={(event) => setRelatedKind(event.target.value as AssetKind)} className="rounded-lg border border-border bg-bg px-3 py-2 text-xs text-fg outline-none">
                  {RELATED_KIND_OPTIONS.map((kind) => <option key={kind} value={kind}>{assetKindLabel(kind, language)}</option>)}
                </select>
                <input value={relatedId} onChange={(event) => setRelatedId(event.target.value)} className="rounded-lg border border-border bg-bg px-3 py-2 text-xs text-fg outline-none placeholder:text-fg-faint" placeholder={copy(language, '资产 ID', 'Asset ID')} />
                <button type="button" onClick={() => void handleDiscoverRelatedAssets()} disabled={relatedLoading} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
                  {relatedLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                  {copy(language, '发现', 'Discover')}
                </button>
                <button type="button" onClick={() => void handleRebuildRelations()} disabled={relatedLoading} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:opacity-50">
                  <RefreshCw size={13} className={cn(relatedLoading && 'animate-spin')} />
                  {copy(language, '重建', 'Rebuild')}
                </button>
              </div>
            </section>
            {relatedError && (
              <div className={cn('flex items-start gap-2 rounded-lg border px-4 py-3 text-sm', relatedError.startsWith('已重建') || relatedError.startsWith('Rebuilt') ? 'border-border bg-bg-elevated text-fg-muted' : 'border-red-500/30 bg-red-500/10 text-red-300')}>
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span className="break-words">{relatedError}</span>
              </div>
            )}
            {relatedRecords.length > 0 ? (
              <div className="space-y-2">
                {relatedRecords.map((record) => (
                  <article key={record.id} className="rounded-lg border border-border bg-bg-elevated px-4 py-3">
                    <div className="flex items-start gap-3">
                      <Link2 size={15} className="mt-0.5 shrink-0 text-accent" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-medium text-fg">{assetKindLabel(record.toKind, language)}: {record.toId}</span>
                          <span className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] text-fg-faint">{relationLabel(record.relation, language)}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">{record.reason}</p>
                        <p className="mt-2 text-[11px] text-fg-faint">{relationSourceKindLabel(record.sourceKind, language)} · {copy(language, '分数', 'score')} {record.score.toFixed(2)}</p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-fg-faint">
                <Link2 size={24} className="opacity-50" />
                <p>{copy(language, '输入资产 ID 后发现相关资产。', 'Enter an asset ID to discover related assets.')}</p>
              </div>
            )}
          </div>
        ) : libraryMode === 'reports' ? (
          <div className="space-y-4 pb-6">
            <div className="flex items-center justify-between text-xs text-fg-faint">
              <span>{searchActive ? copy(language, '报告搜索结果', 'Report search results') : copy(language, '最近报告', 'Recent reports')}</span>
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
                    {reportKindDisplay(filter.id, language)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-fg-faint">
                {searchActive
                  ? copy(language, `匹配 ${visibleReports.length} / ${reportRecords.length}`, `Matched ${visibleReports.length} / ${reportRecords.length}`)
                  : copy(language, `显示 ${visibleReports.length} / ${recentReports.length}`, `Showing ${visibleReports.length} / ${recentReports.length}`)}
              </p>
            </div>

            {reportsError ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span className="break-words">{reportsError}</span>
              </div>
            ) : (searchActive && reportResults === null) || (!searchActive && reportsLoading) ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
                <Loader2 size={16} className="animate-spin" />{copy(language, '加载报告…', 'Loading reports…')}
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
                      ? copy(language, '没有符合当前搜索和类型筛选的报告。', 'No reports match the current search and type filter.')
                      : copy(language, '没有符合当前搜索的报告。', 'No reports match the current search.')
                    : recentReports.length > 0
                      ? copy(language, '没有符合当前类型筛选的报告。', 'No reports match the current type filter.')
                      : copy(language, '还没有保存报告。生成研报或多来源综合后，点击“保存报告”沉淀到这里。', 'No reports saved yet. Generate a digest or synthesis, then save it here.')}
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
                    {evidenceVerdictDisplay(filter.id, language)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-fg-faint">
                {searchActive
                  ? copy(language, `匹配 ${filteredLedgerEvidence.length} / ${evidenceResults?.length ?? 0}`, `Matched ${filteredLedgerEvidence.length} / ${evidenceResults?.length ?? 0}`)
                  : copy(language, `显示 ${filteredLedgerEvidence.length} / ${recentEvidence.length}`, `Showing ${filteredLedgerEvidence.length} / ${recentEvidence.length}`)}
              </p>
            </div>

            {evidenceError && !searchActive ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span className="break-words">{evidenceError}</span>
              </div>
            ) : (searchActive && evidenceResults === null) || (!searchActive && evidenceLoading) ? (
              <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
                <Loader2 size={16} className="animate-spin" />{copy(language, '加载证据…', 'Loading evidence…')}
              </div>
            ) : filteredLedgerEvidence.length > 0 ? (
              <EvidenceList
                records={filteredLedgerEvidence}
                title={searchActive ? copy(language, '证据搜索结果', 'Evidence search results') : copy(language, '最近证据', 'Recent evidence')}
                language={language}
                onOpenSource={(sourceId, chunkIndex) => onOpenSource?.(sourceId, chunkIndex)}
                renderAction={renderEvidenceDigestAction}
              />
            ) : (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-fg-faint">
                <ShieldCheck size={24} className="opacity-50" />
                <p>
                  {searchActive
                    ? copy(language, '没有符合当前搜索和结论的证据。', 'No evidence matches the current search and verdict.')
                    : recentEvidence.length > 0
                      ? copy(language, '没有符合当前结论的证据。', 'No evidence matches the current verdict.')
                      : copy(language, '还没有保存证据。完成事实审查后，使用“保存为证据”沉淀到这里。', 'No evidence saved yet. Complete a fact check, then use “Save as evidence” to keep it here.')}
                </p>
              </div>
            )}
          </div>
        ) : searchActive ? (
          searching && assetSearchResults === null ? (
            <div className="flex h-full min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
              <Loader2 size={16} className="animate-spin" />{copy(language, '搜索中…', 'Searching…')}
            </div>
          ) : totalSearchResults > 0 ? (
            <div className="space-y-5 pb-6">
              <p className="text-xs text-fg-faint">{copy(language, `共 ${totalSearchResults} 条结果`, `${totalSearchResults} results`)}</p>
              {assetResultSections.map((section) => (
                <section key={section.key}>
                  <div className="mb-2 flex items-center justify-between text-xs text-fg-faint">
                    <span>{assetKindPluralLabel(section.kind, language)}</span>
                    <span>{section.results.length}</span>
                  </div>
                  <div className="space-y-2">{section.results.map(renderAssetSearchResult)}</div>
                </section>
              ))}
            </div>
          ) : (
            <div className="flex h-full min-h-32 items-center justify-center text-sm text-fg-faint">{copy(language, '无匹配结果', 'No matching results')}</div>
          )
        ) : loading ? (
          <div className="flex h-full min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
            <Loader2 size={16} className="animate-spin" />{copy(language, '加载中…', 'Loading…')}
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
                    language={language}
                    className="shrink-0 text-fg-faint transition-colors hover:text-accent mt-0.5"
                  />
                  <button onClick={() => handleUnarchive(p.id)}
                    className="shrink-0 text-xs text-fg-muted hover:text-accent transition-colors mt-0.5">{copy(language, '恢复', 'Restore')}</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full min-h-32 items-center justify-center text-sm text-fg-faint">{copy(language, '没有已归档的观点', 'No archived points')}</div>
          )
        ) : activePoints.length > 0 ? (
          /* Normal views */
          viewMode === 'grouped' ? <GroupedView points={activePoints} language={language} onArchive={handleArchive} onOpenSource={onOpenPointSource ? (point) => onOpenPointSource(point.id) : undefined} onOpenEvidenceSource={onOpenSource} /> :
          viewMode === 'list'    ? <ListView    points={activePoints} language={language} onArchive={handleArchive} onOpenSource={onOpenPointSource ? (point) => onOpenPointSource(point.id) : undefined} onOpenEvidenceSource={onOpenSource} /> :
          viewMode === 'table'   ? <TableView   points={activePoints} language={language} onArchive={handleArchive} onOpenSource={onOpenPointSource ? (point) => onOpenPointSource(point.id) : undefined} /> :
                                   <KanbanView  points={activePoints} language={language} onArchive={handleArchive} onOpenSource={onOpenPointSource ? (point) => onOpenPointSource(point.id) : undefined} onOpenEvidenceSource={onOpenSource} />
        ) : (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-sm text-fg-faint">
            <BookMarked size={24} className="opacity-50" />{copy(language, '还没有保存任何观点。去「探索」页提取并保存吧。', 'No points saved yet. Extract and save them from Explore.')}
          </div>
        )}
      </div>
      {synthesisResult && (
        <DigestModal
          result={synthesisResult}
          title={copy(language, '多来源综合', 'Multi-source synthesis')}
          sourceName={copy(language, '多来源综合', 'Multi-source synthesis')}
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

function splitIds(value: string): string[] {
  const seen = new Set<string>()
  return value
    .split(/[\s,，]+/)
    .map((id) => id.trim())
    .filter(Boolean)
    .filter((id) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
