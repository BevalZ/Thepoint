import type {
  AnalyticsData,
  AppConfig,
  AddReviewItemInput,
  AssetKind,
  AssetRelationRecord,
  ChunkCard,
  CitationLocatorInput,
  CitationLocatorResult,
  CommentatorProfile,
  ConfigProfile,
  DigestResult,
  EvidenceRecord,
  FactCheckResult,
  FileMetadata,
  FrameworkRecommendation,
  GalleryFileDiagnostic,
  GalleryItem,
  GalleryKnowledgeContext,
  GalleryPromptPreview,
  GallerySourcePoint,
  GenerateSuggestionResult,
  IndexedFile,
  IndexedFolder,
  IndexedFolderScanResult,
  InvestigationInput,
  JournalEntry,
  MentalModel,
  MirrorExportResult,
  OpenDataMirrorConfig,
  PointSourceLinkInput,
  PointSourceContext,
  RelatedClassification,
  RelatedCandidateInput,
  ReportCitationAudit,
  ReportInvocationAudit,
  ReportRecord,
  ReviewItem,
  ReviewRating,
  SaveReportInput,
  SaveJournalEntryInput,
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
  export_open_data_mirror: {
    args: undefined
    result: MirrorExportResult
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
}

export type TauriCommandName = keyof TauriCommandMap
export type TauriCommandArgs<T extends TauriCommandName> = TauriCommandMap[T]['args']
export type TauriCommandResult<T extends TauriCommandName> = TauriCommandMap[T]['result']
