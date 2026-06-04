import { invoke } from '@tauri-apps/api/core'
import type { AppConfig } from './types'

export const getConfig = () => invoke<AppConfig>('get_config')

export const setConfig = (config: AppConfig) =>
  invoke<void>('set_config', { config })
