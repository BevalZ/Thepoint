import { invoke } from '@tauri-apps/api/core'
import type {
  AnalyticsData,
  AppConfig,
  ChunkCard,
  CommentatorProfile,
  ConfigProfile,
  DeepenAction,
  ExtractedPoint,
  FactCheckResult,
  FileMetadata,
  FrameworkRecommendation,
  GalleryItem,
  GalleryPromptPreview,
  GallerySourcePoint,
  GenerateSuggestionResult,
  MentalModel,
  RelatedCandidateInput,
  RelatedClassification,
  StoredPoint,
  Suggestion,
  SuggestionMeta,
} from './types'

export const getConfig = () => invoke<AppConfig>('get_config')

export const setConfig = (config: AppConfig) =>
  invoke<void>('set_config', { config })

export const parseDocument = (filePath: string) =>
  invoke<string>('parse_document', { filePath })

export const getFileMetadata = (filePath: string) =>
  invoke<FileMetadata>('get_file_metadata', { filePath })

export const extractText = (text: string) =>
  invoke<ExtractedPoint[]>('extract_text', { text })

export const extractTextStreaming = (text: string) =>
  invoke<void>('extract_text_streaming', { text })

export const savePoints = (
  points: ExtractedPoint[],
  sourceDocName?: string | null,
  sourceExcerpt?: string | null
) => invoke<string[]>('save_points', {
  points,
  sourceDocName: sourceDocName ?? null,
  sourceExcerpt: sourceExcerpt ?? null,
})

export const saveManualPoint = (parentId: string, content: string) =>
  invoke<StoredPoint[]>('save_manual_point', { parentId, content })

export const listPoints = () => invoke<StoredPoint[]>('list_points')

export const archivePoint = (pointId: string) => invoke<void>('archive_point', { pointId })
export const unarchivePoint = (pointId: string) => invoke<void>('unarchive_point', { pointId })
export const listArchivedPoints = () => invoke<StoredPoint[]>('list_archived_points')

export const deletePoint = (pointId: string) => invoke<void>('delete_point', { pointId })

export const listMentalModels = () =>
  invoke<MentalModel[]>('list_mental_models')

export const recommendFrameworks = (pointContent: string) =>
  invoke<FrameworkRecommendation[]>('recommend_frameworks', { pointContent })

export const deepenPoint = (
  parentId: string | null,
  parentContent: string,
  actionType: DeepenAction,
  frameworkKey?: string | null
) =>
  invoke<StoredPoint[]>('deepen_point', {
    parentId,
    parentContent,
    actionType,
    frameworkKey: frameworkKey ?? null,
  })

export const polishManualThought = (parentContent: string, thought: string) =>
  invoke<string>('polish_manual_thought', { parentContent, thought })

export const findSimilar = (pointId: string, content: string) =>
  invoke<StoredPoint[]>('find_similar', { pointId, content })

export const classifyRelated = (pointContent: string, candidates: RelatedCandidateInput[]) =>
  invoke<RelatedClassification[]>('classify_related', { pointContent, candidates })

export const searchPoints = (query: string) =>
  invoke<StoredPoint[]>('search_points', { query })

export const fetchModels = (apiKey: string, baseUrl: string) =>
  invoke<string[]>('fetch_models', { apiKey, baseUrl })

export const getAnalytics = () => invoke<AnalyticsData>('get_analytics')

export const getExploreSuggestions = () => invoke<string>('get_explore_suggestions')

export const generateSuggestion = () => invoke<GenerateSuggestionResult>('generate_suggestion')

export const saveSuggestion = (bodyMd: string, summary: string) =>
  invoke<string>('save_suggestion', { bodyMd, summary })

export const listSuggestionsByDate = (date: string) =>
  invoke<SuggestionMeta[]>('list_suggestions_by_date', { date })

export const getSuggestion = (id: string) =>
  invoke<Suggestion | null>('get_suggestion', { id })

export const deleteSuggestion = (id: string) =>
  invoke<void>('delete_suggestion', { id })

export const listMarkedDates = () => invoke<string[]>('list_marked_dates')

export const getProfiles = () => invoke<ConfigProfile[]>('get_profiles')

export const setProfiles = (profiles: ConfigProfile[]) =>
  invoke<void>('set_profiles', { profiles })

export const fetchUrl = (url: string) =>
  invoke<{
    html: string
    text: string
    title: string | null
    url: string
    author: string | null
    publishedAt: string | null
    readingTime: string | null
  }>('fetch_url', { url })

export const describeImage = (imageUrl: string) =>
  invoke<string>('describe_image', { imageUrl })

export const importCommentatorFromSkill = (url: string) =>
  invoke<CommentatorProfile>('import_commentator_from_skill', { url })

export const factCheckClaim = (claim: string, context: string) =>
  invoke<FactCheckResult>('fact_check_claim', { claim, context })

export const generateDigest = () => invoke<string>('generate_digest')

export const generateImage = () => invoke<GalleryItem>('generate_image')
export const prepareGalleryImagePrompt = () => invoke<GalleryPromptPreview>('prepare_gallery_image_prompt')
export const generateImageFromPrompt = (
  prompt: string,
  pointIds: string[],
  sourcePoints: GallerySourcePoint[]
) => invoke<GalleryItem>('generate_image_from_prompt', { prompt, pointIds, sourcePoints })
export const listGallery = () => invoke<GalleryItem[]>('list_gallery')
export const deleteGalleryItem = (id: string) => invoke<void>('delete_gallery_item', { id })
export const retryDownload = (id: string) => invoke<GalleryItem>('retry_download', { id })
export const starPoint = (pointId: string) => invoke<number>('star_point', { pointId })
export const unstarPoint = (pointId: string) => invoke<number>('unstar_point', { pointId })
export const getStarredCount = () => invoke<number>('get_starred_count')
export const listStarredPoints = () => invoke<StoredPoint[]>('list_starred_points')

export const analyzeTextStreaming = (text: string) =>
  invoke<void>('analyze_text_streaming', { text })

export const analyzeTextBlock = (text: string, index: number) =>
  invoke<ChunkCard>('analyze_text_block', { text, index })
