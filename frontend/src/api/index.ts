import { invoke } from '@tauri-apps/api/core'
import type {
  AnalyticsData,
  AppConfig,
  ConfigProfile,
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

export const findSimilar = (pointId: string, content: string) =>
  invoke<StoredPoint[]>('find_similar', { pointId, content })

export const searchPoints = (query: string) =>
  invoke<StoredPoint[]>('search_points', { query })

export const fetchModels = (apiKey: string, baseUrl: string) =>
  invoke<string[]>('fetch_models', { apiKey, baseUrl })

export const getAnalytics = () => invoke<AnalyticsData>('get_analytics')

export const getExploreSuggestions = () => invoke<string>('get_explore_suggestions')

export const getProfiles = () => invoke<ConfigProfile[]>('get_profiles')

export const setProfiles = (profiles: ConfigProfile[]) =>
  invoke<void>('set_profiles', { profiles })
