import type {
  AnalyticsData,
  AppConfig,
  AddReviewItemInput,
  AutomationSuggestionInput,
  AutomationSuggestionReport,
  AssetKind,
  AssetRelationRecord,
  BacklinkSuggestion,
  BacklinkSuggestionInput,
  BlockReferenceInput,
  BlockReferenceManifest,
  BoardSnapshotExport,
  BoardSnapshotInput,
  BuildReportStarterInput,
  CapabilityScorecard,
  ChunkCard,
  CitationQualityDashboard,
  CitationLocatorInput,
  CitationLocatorResult,
  CommentatorProfile,
  CommandPaletteInput,
  CommandPaletteManifest,
  ConfigProfile,
  DigestResult,
  DuplicateAssetInput,
  DuplicateAssetReport,
  EvidenceRecord,
  ExportSyncAuditReport,
  FactCheckResult,
  FileMetadata,
  FrameworkRecommendation,
  GalleryFileDiagnostic,
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
  IndexedFolder,
  IndexedFolderScanResult,
  InvestigationQaEvalInput,
  InvestigationQaEvalReport,
  InvestigationInput,
  JournalEntry,
  MentalModel,
  MirrorExportResult,
  OpenDataMirrorManifest,
  OpenDataMirrorPlan,
  OpenDataMirrorPruneResult,
  OpenDataMirrorConfig,
  PointSourceLinkInput,
  PointSourceContext,
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
  ReviewItem,
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
  SearchAssetResult,
  SearchAssetsInput,
  SearchRankingExplanation,
  SearchRankingExplanationInput,
  SourceDocumentRecord,
  SourceAssetsRecord,
  SourceSummaryRecord,
  SourceWorkspaceRecord,
  StoredPoint,
  Suggestion,
  SuggestionMeta,
  WorkspaceSearchResult,
} from './types'

export interface TauriCommandMap {
  get_config: {
    args: undefined
    result: AppConfig
  }
  set_config: {
    args: { config: AppConfig }
    result: void
  }
  parse_document: {
    args: { filePath: string }
    result: string
  }
  get_file_metadata: {
    args: { filePath: string }
    result: FileMetadata
  }
  upsert_source_document: {
    args: {
      input: {
        kind: string
        canonicalUri: string
        title: string | null
        metadata: unknown
      }
    }
    result: SourceDocumentRecord
  }
  extract_text: {
    args: { text: string }
    result: { content: string; tagType: string; anchor?: string }[]
  }
  extract_text_streaming: {
    args: { text: string }
    result: void
  }
  save_points: {
    args: {
      points: { content: string; tagType: string; anchor?: string }[]
      sourceDocName: string | null
      sourceExcerpt: string | null
      sourceLink: PointSourceLinkInput | null
    }
    result: string[]
  }
  save_manual_point: {
    args: { parentId: string; content: string }
    result: StoredPoint[]
  }
  save_fact_check_point: {
    args: { parentId: string; content: string }
    result: StoredPoint[]
  }
  save_evidence: {
    args: {
      input: {
        result: FactCheckResult
        pointId: string | null
        sourceId: string | null
        chunkIndex: number | null
      }
    }
    result: EvidenceRecord
  }
  list_evidence_for_point: {
    args: { pointId: string }
    result: EvidenceRecord[]
  }
  list_evidence_for_source: {
    args: { sourceId: string }
    result: EvidenceRecord[]
  }
  get_source_assets: {
    args: { sourceId: string }
    result: SourceAssetsRecord | null
  }
  list_recent_evidence: {
    args: undefined
    result: EvidenceRecord[]
  }
  get_evidence: {
    args: { evidenceId: string }
    result: EvidenceRecord | null
  }
  search_evidence: {
    args: { query: string }
    result: EvidenceRecord[]
  }
  search_assets: {
    args: { input: SearchAssetsInput }
    result: SearchAssetResult[]
  }
  explain_search_ranking: {
    args: { input: SearchRankingExplanationInput }
    result: SearchRankingExplanation
  }
  build_block_reference_manifest: {
    args: { input: BlockReferenceInput }
    result: BlockReferenceManifest
  }
  build_board_snapshot_export: {
    args: { input: BoardSnapshotInput }
    result: BoardSnapshotExport
  }
  build_retrieval_context: {
    args: { input: RetrievalContextInput }
    result: RetrievalContext
  }
  suggest_backlinks: {
    args: { input: BacklinkSuggestionInput }
    result: BacklinkSuggestion[]
  }
  save_asset_search: {
    args: { input: SaveAssetSearchInput }
    result: SavedAssetSearch
  }
  list_saved_asset_searches: {
    args: undefined
    result: SavedAssetSearch[]
  }
  preview_saved_asset_search: {
    args: { id: string; limit?: number | null }
    result: SavedAssetSearchPreview | null
  }
  delete_saved_asset_search: {
    args: { id: string }
    result: void
  }
  save_retrieval_profile: {
    args: { input: SaveRetrievalProfileInput }
    result: RetrievalProfile
  }
  list_retrieval_profiles: {
    args: undefined
    result: RetrievalProfile[]
  }
  preview_retrieval_profile: {
    args: { input: PreviewRetrievalProfileInput }
    result: RetrievalProfilePreview | null
  }
  delete_retrieval_profile: {
    args: { id: string }
    result: void
  }
  save_quick_capture: {
    args: { input: SaveQuickCaptureInput }
    result: QuickCaptureItem
  }
  list_quick_captures: {
    args: { status?: QuickCaptureStatus | null; limit?: number | null }
    result: QuickCaptureItem[]
  }
  resolve_quick_capture: {
    args: { input: ResolveQuickCaptureInput }
    result: QuickCaptureResolution | null
  }
  dismiss_quick_capture: {
    args: { id: string }
    result: QuickCaptureItem | null
  }
  list_report_starter_templates: {
    args: { category?: string | null; query?: string | null }
    result: ReportStarterTemplate[]
  }
  list_command_palette_items: {
    args: { input: CommandPaletteInput }
    result: CommandPaletteManifest
  }
  build_capability_scorecard: {
    args: undefined
    result: CapabilityScorecard
  }
  load_automation_suggestions: {
    args: { input: AutomationSuggestionInput }
    result: AutomationSuggestionReport
  }
  load_import_diagnostics_ledger: {
    args: { input: ImportDiagnosticsInput }
    result: ImportDiagnosticsLedger
  }
  build_report_starter: {
    args: { input: BuildReportStarterInput }
    result: ReportStarterDraft
  }
  load_reprocess_queue: {
    args: { input: ReprocessQueueInput }
    result: ReprocessQueue
  }
  detect_duplicate_assets: {
    args: { input: DuplicateAssetInput }
    result: DuplicateAssetReport
  }
  build_graph_neighborhood_preview: {
    args: { input: GraphNeighborhoodInput }
    result: GraphNeighborhoodPreview
  }
  save_report: {
    args: { input: SaveReportInput }
    result: ReportRecord
  }
  list_recent_reports: {
    args: undefined
    result: ReportRecord[]
  }
  get_report: {
    args: { reportId: string }
    result: ReportRecord | null
  }
  search_reports: {
    args: { query: string }
    result: ReportRecord[]
  }
  locate_citation_quote: {
    args: { input: CitationLocatorInput }
    result: CitationLocatorResult
  }
  load_report_citation_audit: {
    args: { reportId: string }
    result: ReportCitationAudit | null
  }
  load_report_invocation_audit: {
    args: { reportId: string }
    result: ReportInvocationAudit | null
  }
  load_report_audit: {
    args: { reportId: string }
    result: ReportAuditRecord | null
  }
  load_citation_quality_dashboard: {
    args: { limit?: number | null }
    result: CitationQualityDashboard
  }
  run_investigation_qa_eval: {
    args: { input: InvestigationQaEvalInput }
    result: InvestigationQaEvalReport
  }
  delete_report: {
    args: { reportId: string }
    result: void
  }
  save_journal_entry: {
    args: { input: SaveJournalEntryInput }
    result: JournalEntry
  }
  list_recent_journal_entries: {
    args: undefined
    result: JournalEntry[]
  }
  search_journal_entries: {
    args: { query: string }
    result: JournalEntry[]
  }
  invalidate_journal_entry: {
    args: { id: string; reason: string }
    result: void
  }
  discover_related_assets: {
    args: { kind: AssetKind; id: string }
    result: AssetRelationRecord[]
  }
  rebuild_asset_relations: {
    args: undefined
    result: number
  }
  add_review_item: {
    args: { input: AddReviewItemInput }
    result: ReviewItem
  }
  list_due_review_items: {
    args: undefined
    result: ReviewItem[]
  }
  list_all_review_items: {
    args: undefined
    result: ReviewItem[]
  }
  build_review_queue_plan: {
    args: { input: ReviewQueuePlanInput }
    result: ReviewQueuePlan
  }
  complete_review_item: {
    args: { id: string; rating: ReviewRating }
    result: ReviewItem
  }
  snooze_review_item: {
    args: { id: string; days: number }
    result: ReviewItem
  }
  dismiss_review_item: {
    args: { id: string }
    result: void
  }
  get_open_data_mirror_config: {
    args: undefined
    result: OpenDataMirrorConfig
  }
  set_open_data_mirror_config: {
    args: { config: OpenDataMirrorConfig }
    result: void
  }
  build_open_data_mirror_plan: {
    args: undefined
    result: OpenDataMirrorPlan
  }
  build_export_sync_audit: {
    args: undefined
    result: ExportSyncAuditReport
  }
  export_open_data_mirror: {
    args: undefined
    result: MirrorExportResult
  }
  load_open_data_mirror_manifest: {
    args: undefined
    result: OpenDataMirrorManifest | null
  }
  prune_open_data_mirror: {
    args: undefined
    result: OpenDataMirrorPruneResult
  }
  add_indexed_folder: {
    args: { path: string }
    result: IndexedFolder
  }
  list_indexed_folders: {
    args: undefined
    result: IndexedFolder[]
  }
  scan_indexed_folder: {
    args: { folderId: string }
    result: IndexedFolderScanResult
  }
  list_indexed_files_for_folder: {
    args: { folderId: string }
    result: IndexedFile[]
  }
  load_indexed_file_preview: {
    args: { fileId: string }
    result: IndexedFile | null
  }
  remove_indexed_folder: {
    args: { folderId: string }
    result: void
  }
  list_points: {
    args: undefined
    result: StoredPoint[]
  }
  archive_point: {
    args: { pointId: string }
    result: void
  }
  unarchive_point: {
    args: { pointId: string }
    result: void
  }
  list_archived_points: {
    args: undefined
    result: StoredPoint[]
  }
  delete_point: {
    args: { pointId: string }
    result: void
  }
  list_mental_models: {
    args: undefined
    result: MentalModel[]
  }
  recommend_frameworks: {
    args: { pointContent: string }
    result: FrameworkRecommendation[]
  }
  deepen_point: {
    args: {
      parentId: string | null
      parentContent: string
      actionType: 'explain' | 'counter' | 'followup' | 'framework'
      frameworkKey: string | null
    }
    result: StoredPoint[]
  }
  polish_manual_thought: {
    args: { parentContent: string; thought: string }
    result: string
  }
  find_similar: {
    args: { pointId: string; content: string }
    result: StoredPoint[]
  }
  classify_related: {
    args: { pointContent: string; candidates: RelatedCandidateInput[] }
    result: RelatedClassification[]
  }
  search_points: {
    args: { query: string }
    result: StoredPoint[]
  }
  search_workspace: {
    args: { query: string }
    result: WorkspaceSearchResult[]
  }
  get_point_source_context: {
    args: { pointId: string }
    result: PointSourceContext | null
  }
  open_source_workspace: {
    args: { sourceId: string }
    result: SourceWorkspaceRecord | null
  }
  list_recent_sources: {
    args: undefined
    result: SourceSummaryRecord[]
  }
  get_source_workspace_summary: {
    args: { sourceId: string }
    result: SourceSummaryRecord | null
  }
  fetch_models: {
    args: { apiKey: string; baseUrl: string }
    result: string[]
  }
  get_analytics: {
    args: undefined
    result: AnalyticsData
  }
  get_explore_suggestions: {
    args: undefined
    result: string
  }
  generate_suggestion: {
    args: undefined
    result: GenerateSuggestionResult
  }
  save_suggestion: {
    args: { bodyMd: string; summary: string }
    result: string
  }
  list_suggestions_by_date: {
    args: { date: string }
    result: SuggestionMeta[]
  }
  get_suggestion: {
    args: { id: string }
    result: Suggestion | null
  }
  delete_suggestion: {
    args: { id: string }
    result: void
  }
  list_marked_dates: {
    args: undefined
    result: string[]
  }
  get_profiles: {
    args: undefined
    result: ConfigProfile[]
  }
  set_profiles: {
    args: { profiles: ConfigProfile[] }
    result: void
  }
  fetch_url: {
    args: { url: string }
    result: {
      html: string
      text: string
      title: string | null
      url: string
      author: string | null
      publishedAt: string | null
      readingTime: string | null
    }
  }
  describe_image: {
    args: { imageUrl: string }
    result: string
  }
  import_commentator_from_skill: {
    args: { url: string }
    result: CommentatorProfile
  }
  fact_check_claim: {
    args: { claim: string; context: string }
    result: FactCheckResult
  }
  generate_digest: {
    args: { input: { evidenceIds: string[] } }
    result: DigestResult
  }
  generate_synthesis: {
    args: { input: { sourceIds: string[]; includeStarred: boolean } }
    result: DigestResult
  }
  generate_investigation: {
    args: { input: InvestigationInput }
    result: DigestResult
  }
  generate_image: {
    args: undefined
    result: GalleryItem
  }
  prepare_gallery_image_prompt: {
    args: {
      mode: 'artwork' | 'knowledge' | null
      knowledgeContexts: GalleryKnowledgeContext[] | null
    }
    result: GalleryPromptPreview
  }
  generate_image_from_prompt: {
    args: {
      prompt: string
      pointIds: string[]
      sourcePoints: GallerySourcePoint[]
    }
    result: GalleryItem
  }
  list_gallery: {
    args: undefined
    result: GalleryItem[]
  }
  search_gallery: {
    args: { query: string }
    result: GalleryItem[]
  }
  delete_gallery_item: {
    args: { id: string }
    result: void
  }
  retry_download: {
    args: { id: string }
    result: GalleryItem
  }
  diagnose_gallery_file: {
    args: { filePath: string }
    result: GalleryFileDiagnostic
  }
  star_point: {
    args: { pointId: string }
    result: number
  }
  unstar_point: {
    args: { pointId: string }
    result: number
  }
  get_starred_count: {
    args: undefined
    result: number
  }
  list_starred_points: {
    args: undefined
    result: StoredPoint[]
  }
  analyze_text_streaming: {
    args: { text: string; sourceId: string | null }
    result: void
  }
  analyze_text_block: {
    args: { text: string; index: number }
    result: ChunkCard
  }
  get_semantic_index_status: {
    args: { provider: EmbeddingProviderConfig | null }
    result: SemanticIndexStatus
  }
  rebuild_semantic_index: {
    args: { input: { provider: EmbeddingProviderConfig; sourceId: string | null } }
    result: SemanticIndexStatus
  }
  cancel_semantic_index_rebuild: {
    args: undefined
    result: boolean
  }
  hybrid_semantic_search: {
    args: { input: { query: string; sourceId: string | null; limit: number | null; provider: EmbeddingProviderConfig } }
    result: HybridSearchHit[]
  }
  generate_grounded_answer: {
    args: { input: { query: string; hits: HybridSearchHit[] } }
    result: GroundedAnswerResult
  }
  save_grounded_answer_report: {
    args: { input: { query: string; answer: GroundedAnswerResult } }
    result: ReportRecord
  }
  check_database_integrity: {
    args: undefined
    result: DatabaseSafetyStatus
  }
  backup_database: {
    args: undefined
    result: DatabaseSafetyStatus
  }
  restore_database_backup: {
    args: { backupPath: string }
    result: DatabaseSafetyStatus
  }
  store_semantic_api_key: {
    args: { apiKey: string }
    result: void
  }
  semantic_api_key_status: {
    args: undefined
    result: boolean
  }
}

export type TauriCommandName = keyof TauriCommandMap
export type TauriCommandArgs<T extends TauriCommandName> = TauriCommandMap[T]['args']
export type TauriCommandResult<T extends TauriCommandName> = TauriCommandMap[T]['result']
