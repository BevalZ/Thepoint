import { invoke } from '@tauri-apps/api/core'
import type { AppConfig, ExtractedPoint, StoredPoint } from './types'

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
