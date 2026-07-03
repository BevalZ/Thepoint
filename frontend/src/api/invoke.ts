import { invoke } from '@tauri-apps/api/core'
import type { TauriCommandArgs, TauriCommandName, TauriCommandResult } from './commandMap'

const BROWSER_PREVIEW_ERROR = 'Tauri runtime unavailable in browser preview'

function hasTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function browserPreviewFallback<T extends TauriCommandName>(
  command: T
): TauriCommandResult<T> | undefined {
  switch (command) {
    case 'get_config':
      return {
        openaiApiKey: '',
        openaiModel: '',
        openaiBaseUrl: '',
        imageBaseUrl: '',
        imageApiKey: '',
        imageModel: '',
        imageProviderKey: 'openai-compatible',
        imageCustomEndpoint: '',
        imageSize: '1024x1024',
        imageKnowledgeStylePrompt: '',
        providerKey: 'openai-compat',
        customEndpoint: '',
        customProviderName: '',
        extraHeaders: '{}',
        searchEnabled: false,
        searchApiKey: '',
        searchModel: '',
        searchBaseUrl: '',
        searchProviderKey: 'openai-compat',
        searchCustomEndpoint: '',
        factCheckLanguage: '中文',
        annotationUnderlineColor: '#00A4EF',
        annotationWavyColor: '#F25022',
        annotationHighlightColor: '#FFB900',
        commentatorName: '鲁迅',
        commentatorStyle: '',
        commentatorEmoji: '🧐',
        commentatorProfiles: [],
        customMentalModels: [],
      } as TauriCommandResult<T>
    case 'get_profiles':
    case 'list_starred_points':
    case 'list_points':
    case 'list_archived_points':
    case 'list_mental_models':
    case 'list_gallery':
    case 'list_marked_dates':
    case 'list_recent_sources':
    case 'search_points':
    case 'search_workspace':
    case 'list_suggestions_by_date':
      return [] as TauriCommandResult<T>
    case 'get_starred_count':
      return 0 as TauriCommandResult<T>
    case 'get_analytics':
      return {
        totalPoints: 0,
        totalActions: 0,
        explainCount: 0,
        counterCount: 0,
        followupCount: 0,
        similarCount: 0,
        frameworkCount: 0,
        totalChildPoints: 0,
        dailyActions: [],
      } as TauriCommandResult<T>
    case 'get_suggestion':
    case 'get_point_source_context':
    case 'open_source_workspace':
    case 'get_source_workspace_summary':
      return null as TauriCommandResult<T>
    default:
      return undefined
  }
}

export function invokeCommand<T extends TauriCommandName>(
  command: T,
  ...args: TauriCommandArgs<T> extends undefined ? [] | [undefined] : [TauriCommandArgs<T>]
): Promise<TauriCommandResult<T>> {
  if (!hasTauriRuntime()) {
    const fallback = browserPreviewFallback(command)
    if (fallback !== undefined) {
      return Promise.resolve(fallback)
    }
    return Promise.reject(new Error(`${BROWSER_PREVIEW_ERROR}: ${command}`))
  }

  const payload = args[0]
  return payload === undefined
    ? invoke<TauriCommandResult<T>>(command)
    : invoke<TauriCommandResult<T>>(command, payload)
}
