import { invoke } from '@tauri-apps/api/core'
import type { AppConfig, ExtractedPoint } from './types'

export const getConfig = () => invoke<AppConfig>('get_config')

export const setConfig = (config: AppConfig) =>
  invoke<void>('set_config', { config })

export const parseDocument = (filePath: string) =>
  invoke<string>('parse_document', { filePath })

export const extractText = (text: string) =>
  invoke<ExtractedPoint[]>('extract_text', { text })
