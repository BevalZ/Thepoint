export interface AppConfig {
  openaiApiKey: string
  openaiModel: string
  openaiBaseUrl: string
  imageBaseUrl: string
  imageApiKey: string
  imageModel: string
  imageProviderKey: string
  imageCustomEndpoint: string
  imageSize: string
  imageKnowledgeStylePrompt: string
  providerKey: string
  customEndpoint: string
  customProviderName: string
  extraHeaders: string
  searchEnabled: boolean
  searchApiKey: string
  searchModel: string
  searchBaseUrl: string
  searchProviderKey: string
  searchCustomEndpoint: string
  factCheckLanguage: string
  annotationUnderlineColor: string
  annotationWavyColor: string
  annotationHighlightColor: string
  commentatorName: string
  commentatorStyle: string
  commentatorEmoji: string
  commentatorProfiles: CommentatorProfile[]
  customMentalModels: MentalModel[]
}

export interface CommentatorProfile {
  id: string
  name: string
  emoji: string
  domain: string
  style: string
  bio?: string | null
  sourceKind: 'builtin' | 'github' | 'manual' | string
  sourceName?: string | null
  sourceUrl?: string | null
}

export interface ConfigProfile {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  imageBaseUrl?: string
  imageApiKey?: string
  imageModel?: string
  imageProviderKey?: string
  imageCustomEndpoint?: string
  imageSize?: string
  imageKnowledgeStylePrompt?: string
  searchEnabled?: boolean
  searchBaseUrl?: string
  searchApiKey?: string
  searchModel?: string
  searchProviderKey?: string
  searchCustomEndpoint?: string
}

export interface ExtractedPoint {
  content: string
  tagType: string
  anchor?: string
}

export interface PointSourceLinkInput {
  sourceId: string
  chunkIndex: number
  anchorText?: string | null
}

export interface StoredPoint {
  id: string
  content: string
  tagType: string | null
  parentId: string | null
  sourceDocName: string | null
  sourceExcerpt: string | null
  createdAt: string
  archived: boolean
  starred: boolean
}

export interface MentalModel {
  key: string
  name: string
  description: string
  promptLens?: string
}

export interface FrameworkRecommendation {
  key: string
  name: string
  reason: string
}

export type DeepenAction = 'explain' | 'counter' | 'followup' | 'framework'

export interface Label {
  category: string
  sub: string
}

export interface ChunkCard {
  index: number
  text: string
  summary: string
  hotTake: string
  commentatorName?: string | null
  commentatorEmoji?: string | null
  labels: Label[]
}

export interface FactCheckSource {
  title: string
  url: string
  snippet: string
}

export interface FactCheckResult {
  claim: string
  answer: string
  context: string
  extra: string[]
  sources: FactCheckSource[]
}

export type RelatedRelation = 'same_view' | 'opposite_view' | 'similar_case' | 'evidence' | 'duplicate'

export interface RelatedCandidateInput {
  id: string
  content: string
  tagType?: string | null
  sourceDocName?: string | null
}

export interface RelatedClassification {
  id: string
  relation: RelatedRelation
  reason: string
  confidence: number
}

export interface GalleryItem {
  id: string
  filePath: string
  thumbnailPath: string
  prompt: string
  generatedAt: string
  downloadStatus: string
  pointIds: string[]
  sourcePoints: GallerySourcePoint[]
}

export interface GallerySourcePoint {
  id: string
  content: string
  sourceDocName?: string | null
}

export type GalleryImageMode = 'artwork' | 'knowledge'

export interface GalleryKnowledgeChunk {
  index: number
  text: string
  summary: string
  hotTake: string
  labels: string[]
}

export interface GalleryKnowledgeStar {
  id: string
  content: string
  tagType?: string | null
  sourceExcerpt?: string | null
}

export interface GalleryKnowledgeContext {
  sourceName: string
  sourceUrl?: string | null
  originalText: string
  chunkCards: GalleryKnowledgeChunk[]
  starredPoints: GalleryKnowledgeStar[]
}

export interface GalleryPromptPreview {
  prompt: string
  pointIds: string[]
  sourcePoints: GallerySourcePoint[]
  mode: GalleryImageMode
}

export interface GalleryFileDiagnostic {
  filePath: string
  exists: boolean
  sizeBytes?: number | null
  imageWidth?: number | null
  imageHeight?: number | null
  error?: string | null
}

export interface FileMetadata {
  filePath: string
  fileName: string
  sizeBytes: number
  createdAt: string | null
  modifiedAt: string | null
}

export interface SourceDocumentRecord {
  id: string
  kind: string
  title: string | null
  canonicalUri: string
  metadataJson: string
  createdAt: string
  updatedAt: string
}

export interface SourceChunkRecord {
  id: string
  sourceId: string
  chunkIndex: number
  headingPath: string | null
  text: string
  createdAt: string
}

export interface SourceSummaryRecord extends SourceDocumentRecord {
  chunkCount: number
  pointCount: number
  starCount: number
}

export interface SourceWorkspaceRecord {
  source: SourceSummaryRecord
  chunks: SourceChunkRecord[]
}

export interface PointSourceContext {
  pointId: string
  source: SourceSummaryRecord
  chunkIndex: number
  anchorText: string | null
  chunks: SourceChunkRecord[]
}

export type WorkspaceSearchResult =
  | {
      kind: 'source'
      id: string
      title: string
      snippet: string
      sourceId: null
      chunkIndex: null
    }
  | {
      kind: 'point'
      id: string
      title: string
      snippet: string
      sourceId: string | null
      chunkIndex: number | null
    }

export type ExploreSourceKind = 'file' | 'webpage' | 'paste'

export interface ExploreSourceMetadata {
  kind: ExploreSourceKind
  name: string | null
  path: string | null
  url: string | null
  sizeBytes: number | null
  createdAt: string | null
  modifiedAt: string | null
  characterCount: number
  author?: string | null
  publishedAt?: string | null
  readingTime?: string | null
}

export interface ExploreHistoryItem {
  id: string
  sourceId?: string | null
  sourceName: string | null
  sourceUrl: string | null
  sourceMetadata?: ExploreSourceMetadata | null
  text: string
  richHtml: string | null
  chunkCards: ChunkCard[]
  previewImage: string | null
  createdAt: string
  updatedAt: string
  archived: boolean
}

export interface DailyActions {
  date: string
  count: number
}

export interface AnalyticsData {
  totalPoints: number
  totalActions: number
  explainCount: number
  counterCount: number
  followupCount: number
  similarCount: number
  frameworkCount: number
  totalChildPoints: number
  dailyActions: DailyActions[]
}

export interface GenerateSuggestionResult {
  bodyMd: string
  summary: string
}

export interface SuggestionMeta {
  id: string
  summary: string
  createdAt: string
}

export interface Suggestion {
  id: string
  date: string
  bodyMd: string
  summary: string
  createdAt: string
}
