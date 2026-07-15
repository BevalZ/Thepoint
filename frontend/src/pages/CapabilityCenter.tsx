import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  CircleGauge,
  Command,
  FileWarning,
  FolderSearch,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react'
import {
  buildCapabilityScorecard,
  buildExportSyncAudit,
  listCommandPaletteItems,
  loadCitationQualityDashboard,
  loadImportDiagnosticsLedger,
  loadReprocessQueue,
  runInvestigationQaEval,
} from '@/api'
import type {
  CapabilityScorecard,
  CitationQualityDashboard,
  CommandPaletteManifest,
  ExportSyncAuditReport,
  ImportDiagnosticsLedger,
  InvestigationQaEvalReport,
  ReprocessQueue,
} from '@/api/types'
import {
  commandPresentation,
  filterCommandPaletteItems,
  type CapabilityCenterTarget,
  type CapabilityCenterView,
  type CapabilityDiagnosticId,
} from '@/lib/capabilityCenter'
import { cn } from '@/lib/utils'
import { localizeCapabilityScorecard } from '@/lib/capabilityScorecardCopy'
import { useConfigStore } from '@/store'
import type { AppConfig } from '@/api/types'

interface CapabilityCenterProps {
  target: CapabilityCenterTarget
}

interface LoadState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

type UiLanguage = AppConfig['uiLanguage']

function uiCopy(language: UiLanguage, chinese: string, english: string): string {
  return language === 'en-US' ? english : chinese
}

const idleState = <T,>(): LoadState<T> => ({ data: null, loading: false, error: null })

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function refreshState<T>(
  loader: () => Promise<T>,
  setState: Dispatch<SetStateAction<LoadState<T>>>
): Promise<void> {
  setState((state) => ({ ...state, loading: true, error: null }))
  try {
    const data = await loader()
    setState({ data, loading: false, error: null })
  } catch (error) {
    setState((state) => ({ ...state, loading: false, error: errorMessage(error) }))
  }
}

const VIEWS: { id: CapabilityCenterView; zh: string; en: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', zh: '能力总览', en: 'Overview', icon: LayoutDashboard },
  { id: 'diagnostics', zh: '诊断中心', en: 'Diagnostics', icon: Stethoscope },
  { id: 'commands', zh: '命令目录', en: 'Command catalog', icon: Command },
]

const DIAGNOSTICS: { id: CapabilityDiagnosticId; zh: string; en: string; icon: typeof Stethoscope }[] = [
  { id: 'citation-quality', zh: '引用质量', en: 'Citation quality', icon: BookOpenCheck },
  { id: 'reprocess-queue', zh: '重处理队列', en: 'Reprocess queue', icon: FileWarning },
  { id: 'import-diagnostics', zh: '导入诊断', en: 'Import diagnostics', icon: FolderSearch },
  { id: 'investigation-qa', zh: '调查 QA', en: 'Investigation QA', icon: CircleGauge },
  { id: 'mirror-sync', zh: '镜像同步', en: 'Mirror sync', icon: RefreshCw },
]

function StateMessage({ loading, error, empty, onRetry, language }: {
  loading: boolean
  error: string | null
  empty: boolean
  onRetry: () => void
  language: UiLanguage
}) {
  if (loading) {
    return <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-fg-muted"><Loader2 size={16} className="animate-spin" />{uiCopy(language, '正在读取…', 'Loading…')}</div>
  }
  if (error) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertTriangle size={18} className="text-amber-400" />
        <p className="max-w-xl text-sm text-fg-muted">{error}</p>
        <button type="button" onClick={onRetry} className="rounded-md border border-border px-3 py-1.5 text-xs text-fg hover:bg-bg-hover">{uiCopy(language, '重试', 'Retry')}</button>
      </div>
    )
  }
  if (empty) {
    return <div className="flex min-h-48 items-center justify-center text-sm text-fg-faint">{uiCopy(language, '暂无数据', 'No data')}</div>
  }
  return null
}

function Metric({ label, value, detail, tone = 'default' }: {
  label: string
  value: string | number
  detail: string
  tone?: 'default' | 'good' | 'warn'
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-4 py-3">
      <div className={cn('text-2xl font-semibold tabular-nums', tone === 'good' && 'text-emerald-400', tone === 'warn' && 'text-amber-400', tone === 'default' && 'text-fg')}>{value}</div>
      <div className="mt-1 text-xs font-medium text-fg-muted">{label}</div>
      <div className="mt-2 text-[11px] text-fg-faint">{detail}</div>
    </div>
  )
}

function Badge({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  return (
    <span className={cn(
      'inline-flex rounded border px-1.5 py-0.5 text-[10px]',
      tone === 'default' && 'border-border text-fg-faint',
      tone === 'good' && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
      tone === 'warn' && 'border-amber-500/25 bg-amber-500/10 text-amber-400',
      tone === 'bad' && 'border-rose-500/25 bg-rose-500/10 text-rose-400'
    )}>{children}</span>
  )
}

function Overview({ state, onRefresh, language }: { state: LoadState<CapabilityScorecard>; onRefresh: () => void; language: UiLanguage }) {
  const scorecard = state.data ? localizeCapabilityScorecard(state.data, language) : null
  const zh = language !== 'en-US'
  if (!scorecard) return <StateMessage loading={state.loading} error={state.error} empty={!state.loading && !state.error} onRetry={onRefresh} language={language} />

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={zh ? '已完成能力' : 'Completed capabilities'} value={`${scorecard.completedCount}/${scorecard.itemCount}`} detail={zh ? '20 轮炼化状态' : '20 refinement rounds'} tone="good" />
        <Metric label={zh ? '只读边界' : 'Read-only boundary'} value={scorecard.readOnlyCount} detail={zh ? `${scorecard.writeCount} 项涉及写入` : `${scorecard.writeCount} write-capable items`} />
        <Metric label={zh ? '平均影响' : 'Average impact'} value={`${Math.round(scorecard.averageImpactScore * 100)}%`} detail={zh ? '静态能力收益评分' : 'Static capability benefit score'} tone="good" />
        <Metric label={zh ? '平均风险' : 'Average risk'} value={`${Math.round(scorecard.averageRiskScore * 100)}%`} detail={zh ? `${scorecard.modelCallCount} 项涉及模型` : `${scorecard.modelCallCount} model-call items`} tone="warn" />
      </div>

      {scorecard.recommendations.length > 0 && (
        <section className="border-y border-border py-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-fg"><ShieldCheck size={15} className="text-emerald-400" />{zh ? '下一阶段' : 'Next phase'}</div>
          <div className="grid gap-2 lg:grid-cols-2">
            {scorecard.recommendations.map((recommendation) => (
              <div key={recommendation} className="flex gap-2 text-xs leading-relaxed text-fg-muted"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />{recommendation}</div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-fg">{zh ? '炼化轮次' : 'Refinement rounds'}</h2>
          <span className="text-xs text-fg-faint">{scorecard.sourceInspiration}</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-bg-elevated">
          <div className="grid grid-cols-[48px_minmax(180px,1.1fr)_minmax(150px,.8fr)_100px_86px] gap-3 border-b border-border bg-bg px-3 py-2 text-[10px] uppercase text-fg-faint">
            <span>{zh ? '轮次' : 'Round'}</span><span>{zh ? '能力' : 'Capability'}</span><span>{zh ? '来源' : 'Source'}</span><span>{zh ? '边界' : 'Boundary'}</span><span>{zh ? '影响 / 风险' : 'Impact / Risk'}</span>
          </div>
          {scorecard.items.map((item) => (
            <article key={item.round} className="grid grid-cols-[48px_minmax(180px,1.1fr)_minmax(150px,.8fr)_100px_86px] gap-3 border-b border-border px-3 py-3 text-xs last:border-b-0">
              <span className="font-mono text-fg-faint">{String(item.round).padStart(2, '0')}</span>
              <div className="min-w-0"><p className="font-medium text-fg">{item.capability}</p><p className="mt-1 line-clamp-1 text-[11px] text-fg-faint">{item.nextStep}</p></div>
              <span className="truncate text-fg-muted">{item.sourceInspiration}</span>
              <span><Badge tone={item.boundary === 'read_only' ? 'good' : item.boundary === 'model_call' ? 'bad' : 'warn'}>{zh ? ({ read_only: '只读', write: '写入', draft_only: '仅草稿', model_call: '模型调用' }[item.boundary] ?? item.boundary) : item.boundary}</Badge></span>
              <span className="font-mono text-fg-muted">{Math.round(item.impactScore * 100)} / {Math.round(item.riskScore * 100)}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function CitationDiagnostic({ state, onRefresh, language }: { state: LoadState<CitationQualityDashboard>; onRefresh: () => void; language: UiLanguage }) {
  const data = state.data
  if (!data) return <StateMessage loading={state.loading} error={state.error} empty={!state.loading && !state.error} onRetry={onRefresh} language={language} />
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={uiCopy(language, '质量得分', 'Quality score')} value={`${Math.round(data.qualityScore * 100)}%`} detail={uiCopy(language, `${data.auditedReportCount}/${data.reportCount} 份已审计`, `${data.auditedReportCount}/${data.reportCount} reports audited`)} tone={data.qualityScore >= .8 ? 'good' : 'warn'} />
        <Metric label={uiCopy(language, '声明覆盖', 'Claim coverage')} value={`${Math.round(data.coverageRatio * 100)}%`} detail={uiCopy(language, `${data.unsupportedClaims} 条无支撑`, `${data.unsupportedClaims} unsupported claims`)} />
        <Metric label={uiCopy(language, '引用警告', 'Citation warnings')} value={data.warningCitations} detail={uiCopy(language, `${data.staleCitations} 条已过期`, `${data.staleCitations} stale`)} tone={data.warningCitations ? 'warn' : 'good'} />
        <Metric label={uiCopy(language, '缺失引用', 'Missing citations')} value={data.missingCitations} detail={uiCopy(language, `${data.targetMissingCitations} 个目标缺失`, `${data.targetMissingCitations} targets missing`)} tone={data.missingCitations ? 'warn' : 'good'} />
      </div>
      <div className="divide-y divide-border border-y border-border">
        {data.reports.length === 0 && <div className="py-10 text-center text-sm text-fg-faint">{uiCopy(language, '暂无报告审计记录', 'No report audit records')}</div>}
        {data.reports.map((report) => (
          <div key={report.reportId} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_110px_110px] sm:items-center">
            <div className="min-w-0"><p className="truncate text-sm text-fg">{report.title}</p><p className="mt-1 text-[11px] text-fg-faint">{uiCopy(language, `${report.totalClaims} 声明 · ${report.totalCitations} 引用`, `${report.totalClaims} claims · ${report.totalCitations} citations`)}</p></div>
            <span className="text-xs tabular-nums text-fg-muted">{uiCopy(language, `覆盖 ${Math.round(report.coverageRatio * 100)}%`, `${Math.round(report.coverageRatio * 100)}% covered`)}</span>
            <span><Badge tone={report.severity === 'ok' ? 'good' : report.severity === 'critical' ? 'bad' : 'warn'}>{report.severity}</Badge></span>
          </div>
        ))}
      </div>
      {data.problemCitations.length > 0 && <p className="text-xs text-fg-faint">{uiCopy(language, `另有 ${data.problemCitations.length} 条引用定位问题待检查。`, `${data.problemCitations.length} citation-location issues need review.`)}</p>}
    </div>
  )
}

function ReprocessDiagnostic({ state, onRefresh, language }: { state: LoadState<ReprocessQueue>; onRefresh: () => void; language: UiLanguage }) {
  const data = state.data
  if (!data) return <StateMessage loading={state.loading} error={state.error} empty={!state.loading && !state.error} onRetry={onRefresh} language={language} />
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3"><Metric label={uiCopy(language, '待处理', 'Pending')} value={data.itemCount} detail={uiCopy(language, '低质量资产', 'Low-quality assets')} /><Metric label={uiCopy(language, '严重', 'Critical')} value={data.criticalCount} detail={uiCopy(language, '优先检查', 'Review first')} tone={data.criticalCount ? 'warn' : 'good'} /><Metric label={uiCopy(language, '警告', 'Warnings')} value={data.warningCount} detail={uiCopy(language, '建议复核', 'Review suggested')} /></div>
      <div className="divide-y divide-border border-y border-border">
        {data.items.length === 0 && <div className="py-10 text-center text-sm text-fg-faint">{uiCopy(language, '当前没有低质量资产', 'No low-quality assets')}</div>}
        {data.items.map((item) => (
          <div key={`${item.targetKind}:${item.targetId}`} className="grid gap-2 py-3 lg:grid-cols-[120px_minmax(0,1fr)_minmax(180px,.7fr)]">
            <div><Badge tone={item.severity === 'critical' ? 'bad' : 'warn'}>{item.targetKind} · {item.severity}</Badge></div>
            <div><p className="text-sm text-fg">{item.title}</p><p className="mt-1 text-xs leading-relaxed text-fg-muted">{item.reason}</p></div>
            <p className="text-xs leading-relaxed text-fg-faint">{item.suggestedAction}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ImportDiagnostic({ state, onRefresh, language }: { state: LoadState<ImportDiagnosticsLedger>; onRefresh: () => void; language: UiLanguage }) {
  const data = state.data
  if (!data) return <StateMessage loading={state.loading} error={state.error} empty={!state.loading && !state.error} onRetry={onRefresh} language={language} />
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4"><Metric label={uiCopy(language, '索引目录', 'Indexed folders')} value={data.folderCount} detail={uiCopy(language, '已扫描范围', 'Scanned scope')} /><Metric label={uiCopy(language, '诊断项', 'Diagnostics')} value={data.itemCount} detail={uiCopy(language, `${data.okCount} 项正常`, `${data.okCount} healthy`)} /><Metric label={uiCopy(language, '警告', 'Warnings')} value={data.warningCount} detail={uiCopy(language, '可恢复问题', 'Recoverable issues')} tone={data.warningCount ? 'warn' : 'good'} /><Metric label={uiCopy(language, '严重', 'Critical')} value={data.criticalCount} detail={uiCopy(language, '读取或索引失败', 'Read or index failures')} tone={data.criticalCount ? 'warn' : 'good'} /></div>
      <div className="divide-y divide-border border-y border-border">
        {data.items.length === 0 && <div className="py-10 text-center text-sm text-fg-faint">{uiCopy(language, '没有导入异常', 'No import issues')}</div>}
        {data.items.map((item) => (
          <div key={item.id} className="grid gap-2 py-3 lg:grid-cols-[120px_minmax(0,1fr)_minmax(180px,.7fr)]">
            <div><Badge tone={item.severity === 'critical' ? 'bad' : item.severity === 'warning' ? 'warn' : 'good'}>{item.severity} · {item.issueKind}</Badge></div>
            <div className="min-w-0"><p className="truncate text-sm text-fg">{item.fileName}</p><p className="mt-1 truncate text-[11px] text-fg-faint">{item.folderName} · {item.path}</p></div>
            <p className="text-xs leading-relaxed text-fg-muted">{item.recoveryAction}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function QaDiagnostic({ state, onRefresh, language }: { state: LoadState<InvestigationQaEvalReport>; onRefresh: () => void; language: UiLanguage }) {
  const data = state.data
  if (!data) return <StateMessage loading={state.loading} error={state.error} empty={!state.loading && !state.error} onRetry={onRefresh} language={language} />
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4"><Metric label={uiCopy(language, '评估案例', 'Evaluation cases')} value={data.caseCount} detail={data.sourceInspiration} /><Metric label={uiCopy(language, '通过', 'Passed')} value={data.passCount} detail={uiCopy(language, '满足多文档基线', 'Meets multi-document baseline')} tone="good" /><Metric label={uiCopy(language, '警告 / 失败', 'Warnings / failures')} value={`${data.warningCount} / ${data.failCount}`} detail={uiCopy(language, '需要补充上下文', 'More context required')} tone={data.failCount ? 'warn' : 'default'} /><Metric label={uiCopy(language, '平均得分', 'Average score')} value={`${Math.round(data.averageScore * 100)}%`} detail={uiCopy(language, '确定性规则评估', 'Deterministic rule evaluation')} /></div>
      <div className="divide-y divide-border border-y border-border">
        {data.cases.length === 0 && <div className="py-10 text-center text-sm text-fg-faint">{uiCopy(language, '暂无 Investigation 可评估', 'No Investigations available to evaluate')}</div>}
        {data.cases.map((item) => (
          <article key={item.caseId} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-fg">{item.title}</p><Badge tone={item.status === 'pass' ? 'good' : item.status === 'fail' ? 'bad' : 'warn'}>{item.status} · {Math.round(item.score * 100)}%</Badge></div>
            <div className="mt-2 flex flex-wrap gap-2">{item.checks.map((check) => <Badge key={check.name} tone={check.status === 'pass' ? 'good' : check.status === 'fail' ? 'bad' : 'warn'}>{check.name}</Badge>)}</div>
          </article>
        ))}
      </div>
    </div>
  )
}

function MirrorDiagnostic({ state, onRefresh, language }: { state: LoadState<ExportSyncAuditReport>; onRefresh: () => void; language: UiLanguage }) {
  const data = state.data
  if (!data) return <StateMessage loading={state.loading} error={state.error} empty={!state.loading && !state.error} onRetry={onRefresh} language={language} />
  const pending = data.pendingWriteCount + data.pendingOverwriteCount + data.pendingPruneCount
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4"><Metric label={uiCopy(language, '同步状态', 'Sync status')} value={data.status} detail={data.rootPath ?? uiCopy(language, '未配置路径', 'Path not configured')} tone={data.status === 'in_sync' ? 'good' : 'warn'} /><Metric label={uiCopy(language, '当前资产', 'Current assets')} value={data.currentAssetCount} detail={uiCopy(language, `${data.manifestAssetCount} 项在 manifest`, `${data.manifestAssetCount} in manifest`)} /><Metric label={uiCopy(language, '待同步', 'Pending sync')} value={pending} detail={uiCopy(language, `${data.pendingWriteCount} 新增 · ${data.pendingOverwriteCount} 覆盖`, `${data.pendingWriteCount} new · ${data.pendingOverwriteCount} overwrite`)} tone={pending ? 'warn' : 'good'} /><Metric label={uiCopy(language, '错误', 'Errors')} value={data.errorCount} detail={uiCopy(language, `${data.pendingPruneCount} 项待清理`, `${data.pendingPruneCount} pending prune`)} tone={data.errorCount ? 'warn' : 'good'} /></div>
      <div className="divide-y divide-border border-y border-border">
        {data.items.length === 0 && <div className="py-10 text-center text-sm text-fg-faint">{data.warnings[0] ?? uiCopy(language, '镜像当前无差异', 'Mirror is in sync')}</div>}
        {data.items.map((item, index) => (
          <div key={`${item.kind}:${item.id}:${index}`} className="grid gap-2 py-3 lg:grid-cols-[130px_minmax(0,1fr)_120px]">
            <span><Badge tone={item.status === 'in_sync' ? 'good' : item.status === 'error' ? 'bad' : 'warn'}>{item.status}</Badge></span>
            <div className="min-w-0"><p className="truncate text-sm text-fg">{item.title ?? item.path ?? uiCopy(language, '未知资产', 'Unknown asset')}</p><p className="mt-1 text-xs text-fg-muted">{item.message}</p></div>
            <span className="font-mono text-[11px] text-fg-faint">{item.action}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CapabilityCenter({ target }: CapabilityCenterProps) {
  const language = useConfigStore((state) => state.config?.uiLanguage ?? 'zh-CN')
  const [view, setView] = useState<CapabilityCenterView>(target.view)
  const [diagnostic, setDiagnostic] = useState<CapabilityDiagnosticId>(target.diagnosticId ?? 'citation-quality')
  const [scorecard, setScorecard] = useState<LoadState<CapabilityScorecard>>(idleState)
  const [manifest, setManifest] = useState<LoadState<CommandPaletteManifest>>(idleState)
  const [citation, setCitation] = useState<LoadState<CitationQualityDashboard>>(idleState)
  const [reprocess, setReprocess] = useState<LoadState<ReprocessQueue>>(idleState)
  const [imports, setImports] = useState<LoadState<ImportDiagnosticsLedger>>(idleState)
  const [qa, setQa] = useState<LoadState<InvestigationQaEvalReport>>(idleState)
  const [mirror, setMirror] = useState<LoadState<ExportSyncAuditReport>>(idleState)
  const [commandQuery, setCommandQuery] = useState('')
  const [commandCategory, setCommandCategory] = useState<string | null>(null)
  const focusedCommandRef = useRef<HTMLDivElement>(null)

  const refreshScorecard = () => void refreshState(buildCapabilityScorecard, setScorecard)
  const refreshManifest = () => void refreshState(() => listCommandPaletteItems(), setManifest)
  const refreshCitation = () => void refreshState(() => loadCitationQualityDashboard(50), setCitation)
  const refreshReprocess = () => void refreshState(() => loadReprocessQueue({ limit: 100 }), setReprocess)
  const refreshImports = () => void refreshState(() => loadImportDiagnosticsLedger({ includeOk: false, limit: 100 }), setImports)
  const refreshQa = () => void refreshState(() => runInvestigationQaEval({ limit: 50 }), setQa)
  const refreshMirror = () => void refreshState(buildExportSyncAudit, setMirror)

  useEffect(() => {
    let alive = true
    const initial = async <T,>(loader: () => Promise<T>, setState: Dispatch<SetStateAction<LoadState<T>>>) => {
      setState({ data: null, loading: true, error: null })
      try {
        const data = await loader()
        if (alive) setState({ data, loading: false, error: null })
      } catch (error) {
        if (alive) setState({ data: null, loading: false, error: errorMessage(error) })
      }
    }
    void Promise.all([
      initial(buildCapabilityScorecard, setScorecard),
      initial(() => listCommandPaletteItems(), setManifest),
      initial(() => loadCitationQualityDashboard(50), setCitation),
      initial(() => loadReprocessQueue({ limit: 100 }), setReprocess),
      initial(() => loadImportDiagnosticsLedger({ includeOk: false, limit: 100 }), setImports),
      initial(() => runInvestigationQaEval({ limit: 50 }), setQa),
      initial(buildExportSyncAudit, setMirror),
    ])
    return () => { alive = false }
  }, [])

  useEffect(() => {
    setView(target.view)
    if (target.diagnosticId) setDiagnostic(target.diagnosticId)
    if (target.commandId) {
      setCommandQuery('')
      setCommandCategory(null)
    }
  }, [target])

  useEffect(() => {
    if (
      view === 'commands'
      && target.commandId
      && manifest.data
      && !commandQuery
      && commandCategory === null
    ) {
      requestAnimationFrame(() => focusedCommandRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
    }
  }, [commandCategory, commandQuery, manifest.data, target.commandId, view])

  const commands = useMemo(() => {
    const filtered = filterCommandPaletteItems(manifest.data?.items ?? [], commandQuery)
    return commandCategory ? filtered.filter((item) => item.category === commandCategory) : filtered
  }, [commandCategory, commandQuery, manifest.data])

  const refreshActive = () => {
    if (view === 'overview') return refreshScorecard()
    if (view === 'commands') return refreshManifest()
    if (diagnostic === 'citation-quality') return refreshCitation()
    if (diagnostic === 'reprocess-queue') return refreshReprocess()
    if (diagnostic === 'import-diagnostics') return refreshImports()
    if (diagnostic === 'investigation-qa') return refreshQa()
    refreshMirror()
  }

  const activeLoading = view === 'overview' ? scorecard.loading : view === 'commands' ? manifest.loading : diagnostic === 'citation-quality' ? citation.loading : diagnostic === 'reprocess-queue' ? reprocess.loading : diagnostic === 'import-diagnostics' ? imports.loading : diagnostic === 'investigation-qa' ? qa.loading : mirror.loading

  return (
    <div className="min-h-full p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div><h1 className="text-lg font-semibold text-fg">{uiCopy(language, '能力中心', 'Capability Center')}</h1><p className="mt-1 text-xs text-fg-muted">{uiCopy(language, '炼化能力、质量诊断与类型化命令目录', 'Refined capabilities, quality diagnostics, and typed command catalog')}</p></div>
        <button type="button" onClick={refreshActive} disabled={activeLoading} className="flex h-8 items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg disabled:opacity-50"><RefreshCw size={13} className={cn(activeLoading && 'animate-spin')} />{uiCopy(language, '刷新当前', 'Refresh current')}</button>
      </header>

      <div className="mt-4 flex flex-wrap gap-1 border-b border-border">
        {VIEWS.map(({ id, zh, en, icon: Icon }) => <button key={id} type="button" onClick={() => setView(id)} className={cn('flex h-9 items-center gap-2 border-b-2 px-3 text-xs transition-colors', view === id ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg')}><Icon size={14} />{uiCopy(language, zh, en)}</button>)}
      </div>

      <div className="mt-5">
        {view === 'overview' && <Overview state={scorecard} onRefresh={refreshScorecard} language={language} />}

        {view === 'diagnostics' && (
          <div>
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-border bg-bg-elevated p-1 md:grid-cols-5">
              {DIAGNOSTICS.map(({ id, zh, en, icon: Icon }) => <button key={id} type="button" onClick={() => setDiagnostic(id)} className={cn('flex min-h-9 items-center justify-center gap-2 rounded-md px-2 text-xs transition-colors', diagnostic === id ? 'bg-bg-hover text-fg' : 'text-fg-muted hover:text-fg')}><Icon size={13} />{uiCopy(language, zh, en)}</button>)}
            </div>
            {diagnostic === 'citation-quality' && <CitationDiagnostic state={citation} onRefresh={refreshCitation} language={language} />}
            {diagnostic === 'reprocess-queue' && <ReprocessDiagnostic state={reprocess} onRefresh={refreshReprocess} language={language} />}
            {diagnostic === 'import-diagnostics' && <ImportDiagnostic state={imports} onRefresh={refreshImports} language={language} />}
            {diagnostic === 'investigation-qa' && <QaDiagnostic state={qa} onRefresh={refreshQa} language={language} />}
            {diagnostic === 'mirror-sync' && <MirrorDiagnostic state={mirror} onRefresh={refreshMirror} language={language} />}
          </div>
        )}

        {view === 'commands' && (
          <div className="grid min-h-[520px] gap-4 xl:grid-cols-[minmax(260px,.72fr)_minmax(420px,1.28fr)]">
            <aside className="min-w-0 border-r border-border pr-4">
              <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-bg-elevated px-3"><Search size={14} className="text-fg-faint" /><input value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder={uiCopy(language, '搜索命令', 'Search commands')} className="min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-fg-faint" /></div>
              <div className="mt-3 flex flex-wrap gap-1"><button type="button" onClick={() => setCommandCategory(null)} className={cn('rounded-md px-2 py-1 text-[11px]', commandCategory === null ? 'bg-bg-hover text-fg' : 'text-fg-faint hover:text-fg')}>{uiCopy(language, '全部', 'All')}</button>{manifest.data?.categories.map((category) => <button key={category} type="button" onClick={() => setCommandCategory(category)} className={cn('rounded-md px-2 py-1 text-[11px]', commandCategory === category ? 'bg-bg-hover text-fg' : 'text-fg-faint hover:text-fg')}>{category}</button>)}</div>
              <p className="mt-3 text-[11px] text-fg-faint">{uiCopy(language, `${commands.length} 条命令`, `${commands.length} commands`)}</p>
            </aside>
            <section className="min-w-0">
              {!manifest.data && <StateMessage loading={manifest.loading} error={manifest.error} empty={!manifest.loading && !manifest.error} onRetry={refreshManifest} language={language} />}
              <div className="divide-y divide-border border-y border-border">
                {manifest.data && commands.length === 0 && <div className="py-12 text-center text-sm text-fg-faint">{uiCopy(language, '没有匹配的命令', 'No matching commands')}</div>}
                {commands.map((item) => {
                  const presentation = commandPresentation(item, language)
                  const focused = item.id === target.commandId
                  return (
                    <div key={item.id} ref={focused ? focusedCommandRef : undefined} className={cn('py-3 transition-colors', focused && 'bg-accent/5 px-3')}>
                      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-sm font-medium text-fg">{item.title}</p><p className="mt-1 text-xs leading-relaxed text-fg-muted">{item.description}</p></div><Badge tone={presentation.tone === 'safe' ? 'good' : presentation.tone === 'attention' ? 'warn' : 'bad'}>{presentation.label}</Badge></div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-fg-faint"><span>{item.wrapperName}()</span><span>·</span><span>{item.category}</span>{item.requiredInput.length > 0 && <><span>·</span><span>{uiCopy(language, '输入', 'Input')}: {item.requiredInput.join(', ')}</span></>}</div>
                      <p className="mt-2 text-[11px] text-fg-faint">{presentation.detail}</p>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
