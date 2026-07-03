import type {
  AnalyticsData,
  AppConfig,
  ChunkCard,
  CommentatorProfile,
  ConfigProfile,
  FactCheckResult,
  FileMetadata,
  FrameworkRecommendation,
  GalleryFileDiagnostic,
  GalleryItem,
  GalleryKnowledgeContext,
  GalleryPromptPreview,
  GallerySourcePoint,
  GenerateSuggestionResult,
  MentalModel,
  PointSourceLinkInput,
  PointSourceContext,
  RelatedClassification,
  RelatedCandidateInput,
  SourceDocumentRecord,
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
    args: undefined
    result: string
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
