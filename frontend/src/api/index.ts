import type {
  AnalyticsData,
  AppConfig,
  ChunkCard,
  CommentatorProfile,
  ConfigProfile,
  DeepenAction,
  EvidenceRecord,
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
  MentalModel,
  PointSourceLinkInput,
  RelatedClassification,
  RelatedCandidateInput,
  SourceDocumentRecord,
  StoredPoint,
  Suggestion,
  SuggestionMeta,
} from './types'
import { invokeCommand } from './invoke'

export const getConfig = () => invokeCommand('get_config')

export const setConfig = (config: AppConfig) =>
  invokeCommand('set_config', { config })

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

export const describeImage = (imageUrl: string) =>
  invokeCommand('describe_image', { imageUrl })

export const importCommentatorFromSkill = (url: string) =>
  invokeCommand('import_commentator_from_skill', { url })

export const factCheckClaim = (claim: string, context: string) =>
  invokeCommand('fact_check_claim', { claim, context })

export const generateDigest = () => invokeCommand('generate_digest')

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
export const deleteGalleryItem = (id: string) => invokeCommand('delete_gallery_item', { id })
export const retryDownload = (id: string) => invokeCommand('retry_download', { id })
export const diagnoseGalleryFile = (filePath: string) =>
  invokeCommand('diagnose_gallery_file', { filePath })
export const starPoint = (pointId: string) => invokeCommand('star_point', { pointId })
export const unstarPoint = (pointId: string) => invokeCommand('unstar_point', { pointId })
export const getStarredCount = () => invokeCommand('get_starred_count')
export const listStarredPoints = () => invokeCommand('list_starred_points')

export const analyzeTextStreaming = (text: string, sourceId?: string | null) =>
  invokeCommand('analyze_text_streaming', { text, sourceId: sourceId ?? null })

export const analyzeTextBlock = (text: string, index: number) =>
  invokeCommand('analyze_text_block', { text, index })
