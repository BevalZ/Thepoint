import type {
  AnalyticsData,
  AppConfig,
  AddReviewItemInput,
  AutomationSuggestionInput,
  AutomationSuggestionReport,
  AssetKind,
  BacklinkSuggestion,
  BacklinkSuggestionInput,
  BlockReferenceInput,
  BlockReferenceManifest,
  BoardSnapshotExport,
  BoardSnapshotInput,
  BuildReportStarterInput,
  CapabilityScorecard,
  CitationQualityDashboard,
  CitationLocatorInput,
  CitationLocatorResult,
  ChunkCard,
  ContentPlan,
  CommentatorProfile,
  CommandPaletteInput,
  CommandPaletteManifest,
  ConfigProfile,
  DeepenAction,
  DigestResult,
  DuplicateAssetInput,
  DuplicateAssetReport,
  EvidenceRecord,
  ExportSyncAuditReport,
  ExtractedPoint,
  FactCheckResult,
  FileMetadata,
  FrameworkRecommendation,
  GalleryFileDiagnostic,
  GalleryImageMode,
  GalleryItem,
  GalleryKnowledgeContext,
  GalleryPromptPreview,
  GallerySourcePoint,
  GenerateSuggestionResult,
  GroundedAnswerResult,
  HybridSearchHit,
  EmbeddingProviderConfig,
  SemanticIndexStatus,
  DatabaseSafetyStatus,
  GraphNeighborhoodInput,
  GraphNeighborhoodPreview,
  ImportDiagnosticsInput,
  ImportDiagnosticsLedger,
  IndexedFile,
  InvestigationQaEvalInput,
  InvestigationQaEvalReport,
  InvestigationInput,
  MirrorExportResult,
  OpenDataMirrorManifest,
  OpenDataMirrorPlan,
  OpenDataMirrorPruneResult,
  OpenDataMirrorConfig,
  MentalModel,
  PointSourceLinkInput,
  QuickCaptureItem,
  QuickCaptureResolution,
  QuickCaptureStatus,
  ReprocessQueue,
  ReprocessQueueInput,
  RelatedClassification,
  RelatedCandidateInput,
  ResolveQuickCaptureInput,
  PreviewRetrievalProfileInput,
  ReportCitationAudit,
  ReportAuditRecord,
  ReportInvocationAudit,
  ReportRecord,
  ReportStarterDraft,
  ReportStarterTemplate,
  RetrievalContext,
  RetrievalContextInput,
  RetrievalProfile,
  RetrievalProfilePreview,
  ReviewQueuePlan,
  ReviewQueuePlanInput,
  ReviewRating,
  SaveAssetSearchInput,
  SavedAssetSearch,
  SavedAssetSearchPreview,
  SaveQuickCaptureInput,
  SaveRetrievalProfileInput,
  SaveReportInput,
  SaveJournalEntryInput,
  SearchRankingExplanation,
  SearchRankingExplanationInput,
  SearchAssetsInput,
  SourceAssetsRecord,
  SourceDocumentRecord,
  StoredPoint,
  Suggestion,
  SuggestionMeta,
  TranslationInput,
  TranslationResult,
} from './types'
import { invokeCommand } from './invoke'

export const getConfig = () => invokeCommand('get_config')

export const getSemanticIndexStatus = (
  provider: EmbeddingProviderConfig | null = null
): Promise<SemanticIndexStatus> => invokeCommand('get_semantic_index_status', { provider })

export const rebuildSemanticIndex = (
  provider: EmbeddingProviderConfig,
  sourceId: string | null = null
): Promise<SemanticIndexStatus> => invokeCommand('rebuild_semantic_index', { input: { provider, sourceId } })

export const cancelSemanticIndexRebuild = () => invokeCommand('cancel_semantic_index_rebuild')

export const hybridSemanticSearch = (
  query: string,
  provider: EmbeddingProviderConfig,
  sourceId: string | null = null,
  limit = 12
): Promise<HybridSearchHit[]> => invokeCommand('hybrid_semantic_search', { input: { query, sourceId, limit, provider } })

export const generateGroundedAnswer = (
  query: string,
  hits: HybridSearchHit[]
): Promise<GroundedAnswerResult> => invokeCommand('generate_grounded_answer', { input: { query, hits } })

export const saveGroundedAnswerReport = (query: string, answer: GroundedAnswerResult) =>
  invokeCommand('save_grounded_answer_report', { input: { query, answer } })

export const checkDatabaseIntegrity = (): Promise<DatabaseSafetyStatus> => invokeCommand('check_database_integrity')
export const backupDatabase = (): Promise<DatabaseSafetyStatus> => invokeCommand('backup_database')
export const restoreDatabaseBackup = (backupPath: string): Promise<DatabaseSafetyStatus> =>
  invokeCommand('restore_database_backup', { backupPath })
export const storeSemanticApiKey = (apiKey: string) => invokeCommand('store_semantic_api_key', { apiKey })
export const semanticApiKeyStatus = () => invokeCommand('semantic_api_key_status')

export const setConfig = (config: AppConfig) =>
  invokeCommand('set_config', { config })

export const translateText = (input: TranslationInput): Promise<TranslationResult> =>
  invokeCommand('translate_text', { input })

export const parseDocument = (filePath: string) =>
  invokeCommand('parse_document', { filePath })

export const getFileMetadata = (filePath: string) =>
  invokeCommand('get_file_metadata', { filePath })

export const upsertSourceDocument = (
  kind: string,
  canonicalUri: string,
  title: string | null,
  metadata: unknown
): Promise<SourceDocumentRecord> => invokeCommand('upsert_source_document', {
  input: {
    kind,
    canonicalUri,
    title,
    metadata,
  },
})

export const extractText = (text: string) =>
  invokeCommand('extract_text', { text })

export const extractTextStreaming = (text: string) =>
  invokeCommand('extract_text_streaming', { text })

export const savePoints = (
  points: ExtractedPoint[],
  sourceDocName?: string | null,
  sourceExcerpt?: string | null,
  sourceLink?: PointSourceLinkInput | null
) => invokeCommand('save_points', {
  points,
  sourceDocName: sourceDocName ?? null,
  sourceExcerpt: sourceExcerpt ?? null,
  sourceLink: sourceLink ?? null,
})

export const saveManualPoint = (parentId: string, content: string) =>
  invokeCommand('save_manual_point', { parentId, content })

export const saveFactCheckPoint = (parentId: string, content: string) =>
  invokeCommand('save_fact_check_point', { parentId, content })

export const saveEvidence = (
  result: FactCheckResult,
  context?: { pointId?: string | null; sourceId?: string | null; chunkIndex?: number | null }
): Promise<EvidenceRecord> =>
  invokeCommand('save_evidence', {
    input: {
      result,
      pointId: context?.pointId ?? null,
      sourceId: context?.sourceId ?? null,
      chunkIndex: context?.chunkIndex ?? null,
    },
  })

export const listEvidenceForPoint = (pointId: string): Promise<EvidenceRecord[]> =>
  invokeCommand('list_evidence_for_point', { pointId })

export const listEvidenceForSource = (sourceId: string): Promise<EvidenceRecord[]> =>
  invokeCommand('list_evidence_for_source', { sourceId })

export const getSourceAssets = (sourceId: string): Promise<SourceAssetsRecord | null> =>
  invokeCommand('get_source_assets', { sourceId })

export const listRecentEvidence = (): Promise<EvidenceRecord[]> =>
  invokeCommand('list_recent_evidence')

export const getEvidence = (evidenceId: string): Promise<EvidenceRecord | null> =>
  invokeCommand('get_evidence', { evidenceId })

export const searchEvidence = (query: string): Promise<EvidenceRecord[]> =>
  invokeCommand('search_evidence', { query })

export const searchAssets = (input: SearchAssetsInput) =>
  invokeCommand('search_assets', { input })

export const explainSearchRanking = (
  input: SearchRankingExplanationInput
): Promise<SearchRankingExplanation> => invokeCommand('explain_search_ranking', { input })

export const buildBlockReferenceManifest = (
  input: BlockReferenceInput
): Promise<BlockReferenceManifest> => invokeCommand('build_block_reference_manifest', { input })

export const buildBoardSnapshotExport = (
  input: BoardSnapshotInput
): Promise<BoardSnapshotExport> => invokeCommand('build_board_snapshot_export', { input })

export const buildRetrievalContext = (input: RetrievalContextInput): Promise<RetrievalContext> =>
  invokeCommand('build_retrieval_context', { input })

export const suggestBacklinks = (
  input: BacklinkSuggestionInput,
): Promise<BacklinkSuggestion[]> => invokeCommand('suggest_backlinks', { input })

export const saveAssetSearch = (input: SaveAssetSearchInput): Promise<SavedAssetSearch> =>
  invokeCommand('save_asset_search', { input })

export const listSavedAssetSearches = (): Promise<SavedAssetSearch[]> =>
  invokeCommand('list_saved_asset_searches')

export const previewSavedAssetSearch = (
  id: string,
  limit?: number | null
): Promise<SavedAssetSearchPreview | null> =>
  invokeCommand('preview_saved_asset_search', { id, limit: limit ?? null })

export const deleteSavedAssetSearch = (id: string): Promise<void> =>
  invokeCommand('delete_saved_asset_search', { id })

export const saveRetrievalProfile = (
  input: SaveRetrievalProfileInput
): Promise<RetrievalProfile> => invokeCommand('save_retrieval_profile', { input })

export const listRetrievalProfiles = (): Promise<RetrievalProfile[]> =>
  invokeCommand('list_retrieval_profiles')

export const previewRetrievalProfile = (
  input: PreviewRetrievalProfileInput
): Promise<RetrievalProfilePreview | null> =>
  invokeCommand('preview_retrieval_profile', { input })

export const deleteRetrievalProfile = (id: string): Promise<void> =>
  invokeCommand('delete_retrieval_profile', { id })

export const saveQuickCapture = (input: SaveQuickCaptureInput): Promise<QuickCaptureItem> =>
  invokeCommand('save_quick_capture', { input })

export const listQuickCaptures = (
  status?: QuickCaptureStatus | null,
  limit?: number | null
): Promise<QuickCaptureItem[]> =>
  invokeCommand('list_quick_captures', { status: status ?? null, limit: limit ?? null })

export const resolveQuickCapture = (
  input: ResolveQuickCaptureInput
): Promise<QuickCaptureResolution | null> =>
  invokeCommand('resolve_quick_capture', { input })

export const dismissQuickCapture = (id: string): Promise<QuickCaptureItem | null> =>
  invokeCommand('dismiss_quick_capture', { id })

export const listReportStarterTemplates = (
  category?: string | null,
  query?: string | null
): Promise<ReportStarterTemplate[]> =>
  invokeCommand('list_report_starter_templates', {
    category: category ?? null,
    query: query ?? null,
  })

export const listCommandPaletteItems = (
  input: CommandPaletteInput = {}
): Promise<CommandPaletteManifest> => invokeCommand('list_command_palette_items', { input })

export const buildCapabilityScorecard = (): Promise<CapabilityScorecard> =>
  invokeCommand('build_capability_scorecard')

export const loadAutomationSuggestions = (
  input: AutomationSuggestionInput = {}
): Promise<AutomationSuggestionReport> => invokeCommand('load_automation_suggestions', { input })

export const loadImportDiagnosticsLedger = (
  input: ImportDiagnosticsInput = {}
): Promise<ImportDiagnosticsLedger> =>
  invokeCommand('load_import_diagnostics_ledger', { input })

export const buildReportStarter = (
  input: BuildReportStarterInput
): Promise<ReportStarterDraft> => invokeCommand('build_report_starter', { input })

export const loadReprocessQueue = (
  input: ReprocessQueueInput = {}
): Promise<ReprocessQueue> => invokeCommand('load_reprocess_queue', { input })

export const detectDuplicateAssets = (
  input: DuplicateAssetInput = {}
): Promise<DuplicateAssetReport> => invokeCommand('detect_duplicate_assets', { input })

export const buildGraphNeighborhoodPreview = (
  input: GraphNeighborhoodInput
): Promise<GraphNeighborhoodPreview> =>
  invokeCommand('build_graph_neighborhood_preview', { input })

export const saveReport = (input: SaveReportInput): Promise<ReportRecord> =>
  invokeCommand('save_report', { input })

export const listRecentReports = (): Promise<ReportRecord[]> =>
  invokeCommand('list_recent_reports')

export const getReport = (reportId: string): Promise<ReportRecord | null> =>
  invokeCommand('get_report', { reportId })

export const searchReports = (query: string): Promise<ReportRecord[]> =>
  invokeCommand('search_reports', { query })

export const locateCitationQuote = (input: CitationLocatorInput): Promise<CitationLocatorResult> =>
  invokeCommand('locate_citation_quote', { input })

export const loadReportCitationAudit = (reportId: string): Promise<ReportCitationAudit | null> =>
  invokeCommand('load_report_citation_audit', { reportId })

export const loadReportInvocationAudit = (reportId: string): Promise<ReportInvocationAudit | null> =>
  invokeCommand('load_report_invocation_audit', { reportId })

export const loadReportAudit = (reportId: string): Promise<ReportAuditRecord | null> =>
  invokeCommand('load_report_audit', { reportId })

export const loadCitationQualityDashboard = (
  limit?: number | null
): Promise<CitationQualityDashboard> =>
  invokeCommand('load_citation_quality_dashboard', { limit: limit ?? null })

export const runInvestigationQaEval = (
  input: InvestigationQaEvalInput = {}
): Promise<InvestigationQaEvalReport> => invokeCommand('run_investigation_qa_eval', { input })

export const deleteReport = (reportId: string): Promise<void> =>
  invokeCommand('delete_report', { reportId })

export const saveJournalEntry = (input: SaveJournalEntryInput) =>
  invokeCommand('save_journal_entry', { input })

export const listRecentJournalEntries = () =>
  invokeCommand('list_recent_journal_entries')

export const searchJournalEntries = (query: string) =>
  invokeCommand('search_journal_entries', { query })

export const invalidateJournalEntry = (id: string, reason: string) =>
  invokeCommand('invalidate_journal_entry', { id, reason })

export const discoverRelatedAssets = (kind: AssetKind, id: string) =>
  invokeCommand('discover_related_assets', { kind, id })

export const rebuildAssetRelations = () =>
  invokeCommand('rebuild_asset_relations')

export const addReviewItem = (input: AddReviewItemInput) =>
  invokeCommand('add_review_item', { input })

export const listDueReviewItems = () =>
  invokeCommand('list_due_review_items')

export const listAllReviewItems = () =>
  invokeCommand('list_all_review_items')

export const buildReviewQueuePlan = (
  input: ReviewQueuePlanInput = {}
): Promise<ReviewQueuePlan> =>
  invokeCommand('build_review_queue_plan', { input })

export const completeReviewItem = (id: string, rating: ReviewRating) =>
  invokeCommand('complete_review_item', { id, rating })

export const snoozeReviewItem = (id: string, days: number) =>
  invokeCommand('snooze_review_item', { id, days })

export const dismissReviewItem = (id: string) =>
  invokeCommand('dismiss_review_item', { id })

export const getOpenDataMirrorConfig = () =>
  invokeCommand('get_open_data_mirror_config')

export const setOpenDataMirrorConfig = (config: OpenDataMirrorConfig) =>
  invokeCommand('set_open_data_mirror_config', { config })

export const buildOpenDataMirrorPlan = (): Promise<OpenDataMirrorPlan> =>
  invokeCommand('build_open_data_mirror_plan')

export const buildExportSyncAudit = (): Promise<ExportSyncAuditReport> =>
  invokeCommand('build_export_sync_audit')

export const exportOpenDataMirror = (): Promise<MirrorExportResult> =>
  invokeCommand('export_open_data_mirror')

export const loadOpenDataMirrorManifest = (): Promise<OpenDataMirrorManifest | null> =>
  invokeCommand('load_open_data_mirror_manifest')

export const pruneOpenDataMirror = (): Promise<OpenDataMirrorPruneResult> =>
  invokeCommand('prune_open_data_mirror')

export const addIndexedFolder = (path: string) =>
  invokeCommand('add_indexed_folder', { path })

export const listIndexedFolders = () =>
  invokeCommand('list_indexed_folders')

export const scanIndexedFolder = (folderId: string) =>
  invokeCommand('scan_indexed_folder', { folderId })

export const listIndexedFilesForFolder = (folderId: string): Promise<IndexedFile[]> =>
  invokeCommand('list_indexed_files_for_folder', { folderId })

export const loadIndexedFilePreview = (fileId: string): Promise<IndexedFile | null> =>
  invokeCommand('load_indexed_file_preview', { fileId })

export const removeIndexedFolder = (folderId: string) =>
  invokeCommand('remove_indexed_folder', { folderId })

export const listPoints = () => invokeCommand('list_points')

export const archivePoint = (pointId: string) => invokeCommand('archive_point', { pointId })
export const unarchivePoint = (pointId: string) => invokeCommand('unarchive_point', { pointId })
export const listArchivedPoints = () => invokeCommand('list_archived_points')

export const deletePoint = (pointId: string) => invokeCommand('delete_point', { pointId })

export const listMentalModels = () =>
  invokeCommand('list_mental_models')

export const recommendFrameworks = (pointContent: string) =>
  invokeCommand('recommend_frameworks', { pointContent })

export const deepenPoint = (
  parentId: string | null,
  parentContent: string,
  actionType: DeepenAction,
  frameworkKey?: string | null
) =>
  invokeCommand('deepen_point', {
    parentId,
    parentContent,
    actionType,
    frameworkKey: frameworkKey ?? null,
  })

export const polishManualThought = (parentContent: string, thought: string) =>
  invokeCommand('polish_manual_thought', { parentContent, thought })

export const findSimilar = (pointId: string, content: string) =>
  invokeCommand('find_similar', { pointId, content })

export const classifyRelated = (pointContent: string, candidates: RelatedCandidateInput[]) =>
  invokeCommand('classify_related', { pointContent, candidates })

export const searchPoints = (query: string) =>
  invokeCommand('search_points', { query })

export const searchWorkspace = (query: string) =>
  invokeCommand('search_workspace', { query })

export const getPointSourceContext = (pointId: string) =>
  invokeCommand('get_point_source_context', { pointId })

export const openSourceWorkspace = (sourceId: string) =>
  invokeCommand('open_source_workspace', { sourceId })

export const listRecentSources = () =>
  invokeCommand('list_recent_sources')

export const getSourceWorkspaceSummary = (sourceId: string) =>
  invokeCommand('get_source_workspace_summary', { sourceId })

export const fetchModels = (apiKey: string, baseUrl: string) =>
  invokeCommand('fetch_models', { apiKey, baseUrl })

export const getAnalytics = () => invokeCommand('get_analytics')

export const getExploreSuggestions = () => invokeCommand('get_explore_suggestions')

export const generateSuggestion = () => invokeCommand('generate_suggestion')

export const saveSuggestion = (bodyMd: string, summary: string) =>
  invokeCommand('save_suggestion', { bodyMd, summary })

export const listSuggestionsByDate = (date: string) =>
  invokeCommand('list_suggestions_by_date', { date })

export const getSuggestion = (id: string) =>
  invokeCommand('get_suggestion', { id })

export const deleteSuggestion = (id: string) =>
  invokeCommand('delete_suggestion', { id })

export const listMarkedDates = () => invokeCommand('list_marked_dates')

export const getProfiles = () => invokeCommand('get_profiles')

export const setProfiles = (profiles: ConfigProfile[]) =>
  invokeCommand('set_profiles', { profiles })

export const fetchUrl = (url: string) =>
  invokeCommand('fetch_url', { url })

export const planContent = (
  text: string,
  html?: string | null,
  sourceScope?: string | null
) => invokeCommand('plan_content', {
  text,
  html: html ?? null,
  sourceScope: sourceScope ?? null,
})

export const describeImage = (imageUrl: string) =>
  invokeCommand('describe_image', { imageUrl })

export const importCommentatorFromSkill = (url: string) =>
  invokeCommand('import_commentator_from_skill', { url })

export const factCheckClaim = (claim: string, context: string) =>
  invokeCommand('fact_check_claim', { claim, context })

export const generateDigest = (evidenceIds: string[] = []): Promise<DigestResult> =>
  invokeCommand('generate_digest', { input: { evidenceIds } })

export const generateSynthesis = (
  sourceIds: string[],
  includeStarred: boolean
): Promise<DigestResult> =>
  invokeCommand('generate_synthesis', { input: { sourceIds, includeStarred } })

export const generateInvestigation = (input: InvestigationInput): Promise<DigestResult> =>
  invokeCommand('generate_investigation', { input })

export const generateImage = () => invokeCommand('generate_image')
export const prepareGalleryImagePrompt = (
  mode?: GalleryImageMode,
  knowledgeContexts?: GalleryKnowledgeContext[]
) => invokeCommand('prepare_gallery_image_prompt', {
  mode: mode ?? null,
  knowledgeContexts: knowledgeContexts ?? null,
})
export const generateImageFromPrompt = (
  prompt: string,
  pointIds: string[],
  sourcePoints: GallerySourcePoint[]
) => invokeCommand('generate_image_from_prompt', { prompt, pointIds, sourcePoints })
export const listGallery = () => invokeCommand('list_gallery')
export const searchGallery = (query: string) => invokeCommand('search_gallery', { query })
export const deleteGalleryItem = (id: string) => invokeCommand('delete_gallery_item', { id })
export const retryDownload = (id: string) => invokeCommand('retry_download', { id })
export const diagnoseGalleryFile = (filePath: string) =>
  invokeCommand('diagnose_gallery_file', { filePath })
export const starPoint = (pointId: string) => invokeCommand('star_point', { pointId })
export const unstarPoint = (pointId: string) => invokeCommand('unstar_point', { pointId })
export const getStarredCount = () => invokeCommand('get_starred_count')
export const listStarredPoints = () => invokeCommand('list_starred_points')

export const analyzeTextStreaming = (
  text: string,
  sourceId?: string | null,
  contentPlan?: ContentPlan | null
) => invokeCommand('analyze_text_streaming', {
  text,
  sourceId: sourceId ?? null,
  contentPlan: contentPlan ?? null,
})

export const analyzeTextBlock = (text: string, index: number) =>
  invokeCommand('analyze_text_block', { text, index })
