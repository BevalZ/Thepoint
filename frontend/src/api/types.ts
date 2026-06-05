export interface AppConfig {
  openaiApiKey: string
  openaiModel: string
  openaiBaseUrl: string
  imageBaseUrl: string
  imageApiKey: string
  imageModel: string
  imageProviderKey: string
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
  commentatorName: string
  commentatorStyle: string
  commentatorEmoji: string
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
}

export interface ExtractedPoint {
  content: string
  tagType: string
  anchor?: string
}

export interface StoredPoint {
  id: string
  content: string
  tagType: string | null
  parentId: string | null
  sourceDocName: string | null
  createdAt: string
  archived: boolean
  starred: boolean
}

export interface MentalModel {
  key: string
  name: string
  description: string
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
  text: string
  summary: string
  hotTake: string
  labels: Label[]
}

export interface GalleryItem {
  id: string
  filePath: string
  thumbnailPath: string
  prompt: string
  generatedAt: string
  downloadStatus: string
  pointIds: string[]
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
