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
