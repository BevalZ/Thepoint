import type { AppConfig, CommandPaletteItem } from '@/api/types'

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

const RISK_LABELS: Record<string, { zh: string; en: string }> = {
  creates_or_updates_local_records: { zh: '写入本地记录', en: 'Writes local records' },
  draft_only: { zh: '仅生成草稿', en: 'Draft only' },
  writes_export_files: { zh: '写入导出文件', en: 'Writes export files' },
  model_call: { zh: '调用模型', en: 'Model call' },
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

export function commandPresentation(
  item: CommandPaletteItem,
  language: AppConfig['uiLanguage'] = 'zh-CN'
): CommandPresentation {
  const readOnly = item.risk === 'read_only'
  const requiresInput = item.requiredInput.length > 0
  const zh = language !== 'en-US'

  if (!readOnly) {
    const riskLabel = RISK_LABELS[item.risk]
    return {
      label: riskLabel ? (zh ? riskLabel.zh : riskLabel.en) : (zh ? '受限命令' : 'Restricted command'),
      detail: zh
        ? '命令目录仅提供说明和导航，不会执行此操作。'
        : 'The command catalog is descriptive and will not execute this operation.',
      tone: 'restricted',
      readOnly,
      requiresInput,
    }
  }

  if (requiresInput) {
    return {
      label: zh ? '只读 · 需要输入' : 'Read-only · Input required',
      detail: zh
        ? `需要 ${item.requiredInput.join('、')}；请在对应工作流中提供上下文。`
        : `Requires ${item.requiredInput.join(', ')}; provide this context in the owning workflow.`,
      tone: 'attention',
      readOnly,
      requiresInput,
    }
  }

  return {
    label: item.executionKind === 'diagnostic'
      ? (zh ? '只读诊断' : 'Read-only diagnostic')
      : (zh ? '只读' : 'Read-only'),
    detail: zh
      ? '可通过已有类型化 API 边界读取，不会修改本地数据。'
      : 'Available through the typed API boundary without modifying local data.',
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
