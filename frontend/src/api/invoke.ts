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
    case 'list_recent_evidence':
    case 'list_recent_reports':
    case 'list_recent_journal_entries':
    case 'search_journal_entries':
    case 'discover_related_assets':
    case 'list_due_review_items':
    case 'list_all_review_items':
    case 'list_indexed_folders':
    case 'list_indexed_files_for_folder':
    case 'search_points':
    case 'search_workspace':
    case 'search_evidence':
    case 'search_reports':
    case 'search_gallery':
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
    case 'get_source_assets':
    case 'get_evidence':
    case 'get_report':
    case 'load_indexed_file_preview':
    case 'load_report_citation_audit':
    case 'load_report_invocation_audit':
    case 'load_report_audit':
    case 'load_open_data_mirror_manifest':
      return null as TauriCommandResult<T>
    case 'get_open_data_mirror_config':
      return {
        enabled: false,
        rootPath: null,
        exportSources: true,
        exportEvidence: true,
        exportReports: true,
        exportJournal: true,
        exportGalleryIndex: true,
      } as TauriCommandResult<T>
    case 'build_open_data_mirror_plan':
      return {
        rootPath: '',
        generatedAt: new Date(0).toISOString(),
        counts: {
          sources: 0,
          evidence: 0,
          reports: 0,
          investigations: 0,
          journal: 0,
          gallery: 0,
        },
        toWrite: [],
        unchanged: [],
        stale: [],
        toPrune: [],
        errors: [],
      } as TauriCommandResult<T>
    case 'export_open_data_mirror':
      return {
        rootPath: '',
        filesWritten: 0,
        sources: 0,
        evidence: 0,
        reports: 0,
        investigations: 0,
        journal: 0,
        gallery: 0,
        plan: {
          rootPath: '',
          generatedAt: new Date(0).toISOString(),
          counts: {
            sources: 0,
            evidence: 0,
            reports: 0,
            investigations: 0,
            journal: 0,
            gallery: 0,
          },
          toWrite: [],
          unchanged: [],
          stale: [],
          toPrune: [],
          errors: [],
        },
        manifest: {
          version: 2,
          generatedAt: new Date(0).toISOString(),
          assets: [],
          errors: [],
          pruned: [],
          stale: [],
          counts: {
            sources: 0,
            evidence: 0,
            reports: 0,
            investigations: 0,
            journal: 0,
            gallery: 0,
          },
        },
      } as TauriCommandResult<T>
    case 'prune_open_data_mirror':
      return {
        rootPath: '',
        filesDeleted: 0,
        pruned: [],
        errors: [],
        manifest: null,
      } as TauriCommandResult<T>
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
