import { invoke } from '@tauri-apps/api/core'
import type {
  AnalyticsData,
  AppConfig,
  DeepenAction,
  ExtractedPoint,
  FrameworkRecommendation,
  MentalModel,
  StoredPoint,
} from './types'

export const getConfig = () => invoke<AppConfig>('get_config')

export const setConfig = (config: AppConfig) =>
  invoke<void>('set_config', { config })

export const parseDocument = (filePath: string) =>
  invoke<string>('parse_document', { filePath })

export const extractText = (text: string) =>
  invoke<ExtractedPoint[]>('extract_text', { text })

export const savePoints = (
  points: ExtractedPoint[],
  sourceDocName?: string | null
) => invoke<number>('save_points', { points, sourceDocName: sourceDocName ?? null })

export const listPoints = () => invoke<StoredPoint[]>('list_points')

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

export const findSimilar = (pointId: string, content: string) =>
  invoke<StoredPoint[]>('find_similar', { pointId, content })

export const getAnalytics = () => invoke<AnalyticsData>('get_analytics')
