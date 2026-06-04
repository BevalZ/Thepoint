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
  tagType: string | null
  parentId: string | null
  sourceDocName: string | null
  createdAt: string
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
