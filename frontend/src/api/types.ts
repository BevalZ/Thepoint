export interface AppConfig {
  openaiApiKey: string
  openaiModel: string
}

export interface ExtractedPoint {
  content: string
  tagType: string
}

export interface StoredPoint {
  id: string
  content: string
  tagType: string
  sourceDocName: string | null
  createdAt: string
}
