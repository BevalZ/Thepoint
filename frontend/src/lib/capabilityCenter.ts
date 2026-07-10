import type { CommandPaletteItem } from '@/api/types'

export type CapabilityCenterView = 'overview' | 'diagnostics' | 'commands'

export type CapabilityDiagnosticId =
  | 'citation-quality'
  | 'reprocess-queue'
  | 'import-diagnostics'
  | 'investigation-qa'
  | 'mirror-sync'

export interface CapabilityCenterTarget {
  view: CapabilityCenterView
  diagnosticId?: CapabilityDiagnosticId
  commandId?: string
}

export type CommandPresentationTone = 'safe' | 'attention' | 'restricted'

export interface CommandPresentation {
  label: string
  detail: string
  tone: CommandPresentationTone
  readOnly: boolean
  requiresInput: boolean
}

const DIAGNOSTIC_TARGETS: Record<string, CapabilityDiagnosticId> = {
  load_citation_quality_dashboard: 'citation-quality',
  load_reprocess_queue: 'reprocess-queue',
  load_import_diagnostics_ledger: 'import-diagnostics',
  run_investigation_qa_eval: 'investigation-qa',
  build_export_sync_audit: 'mirror-sync',
}

const RISK_LABELS: Record<string, string> = {
  creates_or_updates_local_records: '写入本地记录',
  draft_only: '仅生成草稿',
  writes_export_files: '写入导出文件',
  model_call: '调用模型',
}

export function capabilityTargetForCommand(
  item: Pick<CommandPaletteItem, 'id' | 'commandName'>
): CapabilityCenterTarget {
  if (item.commandName === 'build_capability_scorecard') {
    return { view: 'overview' }
  }

  const diagnosticId = DIAGNOSTIC_TARGETS[item.commandName]
  if (diagnosticId) {
    return { view: 'diagnostics', diagnosticId }
  }

  return { view: 'commands', commandId: item.id }
}

export function commandPresentation(item: CommandPaletteItem): CommandPresentation {
  const readOnly = item.risk === 'read_only'
  const requiresInput = item.requiredInput.length > 0

  if (!readOnly) {
    return {
      label: RISK_LABELS[item.risk] ?? '受限命令',
      detail: '命令目录仅提供说明和导航，不会执行此操作。',
      tone: 'restricted',
      readOnly,
      requiresInput,
    }
  }

  if (requiresInput) {
    return {
      label: '只读 · 需要输入',
      detail: `需要 ${item.requiredInput.join('、')}；请在对应工作流中提供上下文。`,
      tone: 'attention',
      readOnly,
      requiresInput,
    }
  }

  return {
    label: item.executionKind === 'diagnostic' ? '只读诊断' : '只读',
    detail: '可通过已有类型化 API 边界读取，不会修改本地数据。',
    tone: 'safe',
    readOnly,
    requiresInput,
  }
}

export function filterCommandPaletteItems(
  items: CommandPaletteItem[],
  query: string
): CommandPaletteItem[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return items

  return items.filter((item) => [
    item.title,
    item.description,
    item.category,
    item.commandName,
    item.wrapperName,
    ...item.keywords,
  ].some((value) => value.toLocaleLowerCase().includes(normalized)))
}
