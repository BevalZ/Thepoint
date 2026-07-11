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
    case 'search_assets':
    case 'suggest_backlinks':
    case 'list_saved_asset_searches':
    case 'list_retrieval_profiles':
    case 'list_quick_captures':
    case 'list_report_starter_templates':
    case 'search_reports':
    case 'search_gallery':
    case 'hybrid_semantic_search':
    case 'list_suggestions_by_date':
      return [] as TauriCommandResult<T>
    case 'get_starred_count':
      return 0 as TauriCommandResult<T>
    case 'semantic_api_key_status':
    case 'cancel_semantic_index_rebuild':
      return false as TauriCommandResult<T>
    case 'get_semantic_index_status':
      return {
        modelKey: 'fastembed:multilingual-e5-small',
        phase: 'unavailable',
        total: 0,
        ready: 0,
        pending: 0,
        stale: 0,
        failed: 0,
        processed: 0,
        cancellable: false,
        modelCached: false,
        lastError: '桌面运行时不可用',
        updatedAt: null,
      } as TauriCommandResult<T>
    case 'generate_grounded_answer':
      return {
        content: '浏览器预览无法调用本地检索与聊天模型。',
        citations: [],
        invocationId: null,
        refused: true,
        warnings: ['桌面运行时不可用。'],
      } as TauriCommandResult<T>
    case 'check_database_integrity':
      return {
        databasePath: '',
        integrity: 'unavailable',
        latestBackupPath: null,
        checkedAt: new Date(0).toISOString(),
      } as TauriCommandResult<T>
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
    case 'preview_saved_asset_search':
    case 'preview_retrieval_profile':
    case 'load_open_data_mirror_manifest':
      return null as TauriCommandResult<T>
    case 'build_retrieval_context':
      return {
        query: '',
        itemCount: 0,
        totalChars: 0,
        items: [],
        warnings: ['Tauri runtime unavailable'],
      } as TauriCommandResult<T>
    case 'explain_search_ranking':
      return {
        query: '',
        queryTerms: [],
        ranker: 'search_assets_coarse_score_v1',
        diagnosticModel: 'marginalia_score_components_diagnostic_v1',
        resultCount: 0,
        analyzedCount: 0,
        maxScore: null,
        minScore: null,
        items: [],
        warnings: ['Tauri runtime unavailable'],
        generatedAt: new Date(0).toISOString(),
      } as TauriCommandResult<T>
    case 'build_block_reference_manifest':
      return {
        rootKind: 'source',
        rootId: '',
        rootTitle: null,
        query: null,
        blockCount: 0,
        cards: [],
        warnings: ['Tauri runtime unavailable'],
        generatedAt: new Date(0).toISOString(),
        sourceInspiration: 'SiYuan block-level references refined into Thepoint Round 16',
      } as TauriCommandResult<T>
    case 'build_board_snapshot_export':
      return {
        rootKind: 'source',
        rootId: '',
        title: '',
        nodeCount: 0,
        edgeCount: 0,
        nodes: [],
        edges: [],
        markdown: '',
        warnings: ['Tauri runtime unavailable'],
        generatedAt: new Date(0).toISOString(),
        sourceInspiration:
          'AFFiNE canvas snapshots and AppFlowy board views refined into Thepoint Round 17',
      } as TauriCommandResult<T>
    case 'load_citation_quality_dashboard':
      return {
        generatedAt: new Date(0).toISOString(),
        reportCount: 0,
        auditedReportCount: 0,
        totalClaims: 0,
        citedClaims: 0,
        inferredClaims: 0,
        unsupportedClaims: 0,
        totalCitations: 0,
        locatedCitations: 0,
        warningCitations: 0,
        missingCitations: 0,
        staleCitations: 0,
        ambiguousCitations: 0,
        notFoundCitations: 0,
        targetMissingCitations: 0,
        notApplicableCitations: 0,
        coverageRatio: 0,
        qualityScore: 0,
        reports: [],
        problemCitations: [],
        warnings: ['Tauri runtime unavailable'],
      } as TauriCommandResult<T>
    case 'run_investigation_qa_eval':
      return {
        generatedAt: new Date(0).toISOString(),
        caseCount: 0,
        passCount: 0,
        warningCount: 0,
        failCount: 0,
        averageScore: 0,
        cases: [],
        warnings: ['Tauri runtime unavailable'],
        sourceInspiration:
          'Kotaemon multi-document QA evaluation fixtures refined into Thepoint Round 19',
      } as TauriCommandResult<T>
    case 'list_command_palette_items':
      return {
        generatedAt: new Date(0).toISOString(),
        itemCount: 0,
        categories: [],
        items: [],
        warnings: ['Tauri runtime unavailable'],
      } as TauriCommandResult<T>
    case 'build_capability_scorecard':
      return {
        generatedAt: new Date(0).toISOString(),
        itemCount: 0,
        completedCount: 0,
        readOnlyCount: 0,
        writeCount: 0,
        draftCount: 0,
        modelCallCount: 0,
        averageImpactScore: 0,
        averageRiskScore: 0,
        items: [],
        recommendations: [],
        sourceInspiration:
          'Cross-project capability refinement scorecard for Thepoint Round 20',
      } as TauriCommandResult<T>
    case 'load_automation_suggestions':
      return {
        generatedAt: new Date(0).toISOString(),
        itemCount: 0,
        criticalCount: 0,
        highCount: 0,
        normalCount: 0,
        lowCount: 0,
        items: [],
        warnings: ['Tauri runtime unavailable'],
      } as TauriCommandResult<T>
    case 'load_import_diagnostics_ledger':
      return {
        generatedAt: new Date(0).toISOString(),
        itemCount: 0,
        folderCount: 0,
        okCount: 0,
        warningCount: 0,
        criticalCount: 0,
        folders: [],
        items: [],
        warnings: ['Tauri runtime unavailable'],
      } as TauriCommandResult<T>
    case 'load_reprocess_queue':
      return {
        generatedAt: new Date(0).toISOString(),
        itemCount: 0,
        criticalCount: 0,
        warningCount: 0,
        items: [],
        warnings: ['Tauri runtime unavailable'],
      } as TauriCommandResult<T>
    case 'detect_duplicate_assets':
      return {
        generatedAt: new Date(0).toISOString(),
        groupCount: 0,
        candidateCount: 0,
        groups: [],
        warnings: ['Tauri runtime unavailable'],
      } as TauriCommandResult<T>
    case 'build_graph_neighborhood_preview':
      return {
        generatedAt: new Date(0).toISOString(),
        rootKind: 'source',
        rootId: '',
        depth: 0,
        nodeCount: 0,
        edgeCount: 0,
        nodes: [],
        edges: [],
        warnings: ['Tauri runtime unavailable'],
      } as TauriCommandResult<T>
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
    case 'build_export_sync_audit':
      return {
        generatedAt: new Date(0).toISOString(),
        status: 'needs_config',
        rootPath: null,
        manifestVersion: null,
        currentAssetCount: 0,
        manifestAssetCount: 0,
        inSyncCount: 0,
        pendingWriteCount: 0,
        pendingOverwriteCount: 0,
        pendingPruneCount: 0,
        errorCount: 0,
        items: [],
        warnings: ['Tauri runtime unavailable'],
        sourceInspiration:
          'AppFlowy local-first workspace consistency checks refined into Thepoint Round 18',
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
    case 'build_review_queue_plan':
      return {
        now: new Date(0).toISOString(),
        mode: 'due',
        limit: 12,
        candidateCount: 0,
        dueCount: 0,
        overdueCount: 0,
        futureCount: 0,
        dismissedCount: 0,
        overflowCount: 0,
        items: [],
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
