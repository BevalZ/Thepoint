import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, Database, Loader2, RefreshCw, Save, Search, ShieldAlert, Square } from 'lucide-react'
import {
  cancelSemanticIndexRebuild,
  generateGroundedAnswer,
  getSemanticIndexStatus,
  hybridSemanticSearch,
  listRecentSources,
  rebuildSemanticIndex,
  saveGroundedAnswerReport,
} from '@/api'
import type { EmbeddingProviderConfig, GroundedAnswerResult, HybridSearchHit, SemanticIndexStatus, SourceSummaryRecord } from '@/api/types'
import { cn } from '@/lib/utils'
import { loadEmbeddingProvider } from '@/lib/semanticSettings'

interface ResearchProps {
  onOpenSource?: (sourceId: string, focusChunkIndex?: number | null) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function Research({ onOpenSource }: ResearchProps) {
  const [query, setQuery] = useState('')
  const [provider] = useState<EmbeddingProviderConfig>(() => loadEmbeddingProvider())
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [sources, setSources] = useState<SourceSummaryRecord[]>([])
  const [status, setStatus] = useState<SemanticIndexStatus | null>(null)
  const [hits, setHits] = useState<HybridSearchHit[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [answer, setAnswer] = useState<GroundedAnswerResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedHits = useMemo(() => hits.filter((hit) => selected.has(hit.id)), [hits, selected])

  const refreshStatus = async () => {
    try { setStatus(await getSemanticIndexStatus(provider)) } catch (cause) { setError(errorMessage(cause)) }
  }

  useEffect(() => {
    void Promise.all([listRecentSources().then(setSources), refreshStatus()])
  }, [provider])

  const rebuild = async () => {
    setIndexing(true); setError(null)
    try { setStatus(await rebuildSemanticIndex(provider, sourceId)) } catch (cause) { setError(errorMessage(cause)) } finally { setIndexing(false) }
  }

  const search = async () => {
    if (!query.trim()) return
    setSearching(true); setError(null); setAnswer(null); setSaved(false)
    try {
      const results = await hybridSemanticSearch(query, provider, sourceId, 16)
      setHits(results); setSelected(new Set(results.slice(0, 6).map((hit) => hit.id)))
    } catch (cause) { setError(errorMessage(cause)); setHits([]); setSelected(new Set()) } finally { setSearching(false) }
  }

  const ask = async () => {
    setAnswering(true); setError(null); setSaved(false)
    try { setAnswer(await generateGroundedAnswer(query, selectedHits)) } catch (cause) { setError(errorMessage(cause)) } finally { setAnswering(false) }
  }

  const save = async () => {
    if (!answer || answer.refused) return
    setSaving(true); setError(null)
    try { await saveGroundedAnswerReport(query, answer); setSaved(true) } catch (cause) { setError(errorMessage(cause)) } finally { setSaving(false) }
  }

  return (
    <main className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div><h1 className="text-xl font-semibold">研究问答</h1><p className="mt-1 text-sm text-fg-muted">混合检索 Source chunks，只基于你确认的上下文回答。</p></div>
          <button type="button" onClick={() => void refreshStatus()} className="rounded-lg border border-border p-2 text-fg-muted hover:bg-bg-hover" title="刷新索引状态"><RefreshCw size={15} /></button>
        </header>

        <section className="rounded-xl border border-border bg-bg-elevated p-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Database size={15} className="text-accent" />
            <span>{status?.modelKey ?? 'fastembed:multilingual-e5-small'}</span>
            <span className="text-fg-muted">状态：{status?.phase ?? '加载中'}</span>
            <span className="text-fg-muted">就绪 {status?.ready ?? 0} · 待处理 {status?.pending ?? 0} · 过期 {status?.stale ?? 0} · 失败 {status?.failed ?? 0}</span>
            <div className="ml-auto flex gap-2">
              {indexing && <button type="button" onClick={() => void cancelSemanticIndexRebuild()} className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs"><Square size={11} />取消</button>}
              <button type="button" disabled={indexing} onClick={() => void rebuild()} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{indexing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}{status?.modelCached ? '更新索引' : '下载模型并建索引'}</button>
            </div>
          </div>
          {status?.lastError && <p className="mt-2 text-xs text-red-400">{status.lastError}</p>}
        </section>

        <section className="rounded-xl border border-border bg-bg-elevated p-4">
          <div className="flex gap-3">
            <select value={sourceId ?? ''} onChange={(event) => setSourceId(event.target.value || null)} className="max-w-64 rounded-lg border border-border bg-bg px-3 py-2 text-sm">
              <option value="">全部 Source</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.title || source.canonicalUri}</option>)}
            </select>
            <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void search() }} placeholder="输入研究问题……" className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
            <button type="button" disabled={searching || !query.trim()} onClick={() => void search()} className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}检索</button>
          </div>
        </section>

        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        {hits.length > 0 && <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="font-medium">检索上下文</h2><button type="button" disabled={answering || selectedHits.length === 0} onClick={() => void ask()} className="flex items-center gap-1.5 rounded-lg border border-accent/50 bg-accent/10 px-3 py-2 text-sm text-accent disabled:opacity-50">{answering ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}基于所选证据回答（{selectedHits.length}）</button></div>
          <div className="grid gap-3 md:grid-cols-2">{hits.map((hit) => {
            const active = selected.has(hit.id)
            return <article key={hit.id} className={cn('rounded-xl border p-4 transition-colors', active ? 'border-accent/50 bg-accent/5' : 'border-border bg-bg-elevated')}>
              <div className="flex gap-3"><input type="checkbox" checked={active} onChange={() => setSelected((current) => { const next = new Set(current); active ? next.delete(hit.id) : next.add(hit.id); return next })} className="mt-1" />
                <div className="min-w-0"><button type="button" onClick={() => onOpenSource?.(hit.sourceId, hit.chunkIndex)} className="text-left text-sm font-medium hover:text-accent">{hit.sourceTitle} · Chunk {hit.chunkIndex + 1}</button><p className="mt-1 text-xs text-fg-muted">{hit.reason} · RRF {hit.score.toFixed(4)}</p><p className="mt-2 line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-fg-muted">{hit.text}</p></div>
              </div>
            </article>
          })}</div>
        </section>}

        {answer && <section className={cn('rounded-xl border p-5', answer.refused ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-bg-elevated')}>
          <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-medium">{answer.refused && <ShieldAlert size={16} className="text-amber-400" />}回答</h2>{!answer.refused && <button type="button" onClick={() => void save()} disabled={saving || saved} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-60">{saved ? <Check size={13} /> : <Save size={13} />}{saved ? '已保存为 Investigation' : saving ? '保存中…' : '保存报告'}</button>}</div>
          <div className="mt-4 whitespace-pre-wrap text-sm leading-7">{answer.content}</div>
          {answer.warnings.map((warning) => <p key={warning} className="mt-2 text-xs text-amber-400">{warning}</p>)}
          {answer.citations.length > 0 && <div className="mt-5 border-t border-border pt-4"><h3 className="text-xs font-medium text-fg-muted">引用</h3><div className="mt-2 space-y-2">{answer.citations.map((citation) => <button key={citation.label} type="button" onClick={() => citation.sourceId && onOpenSource?.(citation.sourceId, citation.chunkIndex)} className="block w-full rounded-lg bg-bg px-3 py-2 text-left text-xs hover:bg-bg-hover"><span className="font-medium text-accent">[{citation.label}]</span> {citation.title}<span className="ml-2 text-fg-muted">{citation.excerpt}</span></button>)}</div></div>}
        </section>}
      </div>
    </main>
  )
}
