import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Lightbulb,
  Swords,
  HelpCircle,
  Link2,
  Brain,
  ArrowRight,
  FileText,
  Loader2,
  MapPin,
  MessageSquarePlus,
  Save,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import type { FactCheckResult, StoredPoint } from '@/api/types'
import { useDeepenStore, useLibraryStore } from '@/store'
import { cn } from '@/lib/utils'
import { factCheckClaim, polishManualThought } from '@/api'

interface DeepenActionsProps {
  point: StoredPoint
  className?: string
}

const BASIC_ACTIONS = [
  { action: 'explain', label: '延伸解释', icon: Lightbulb },
  { action: 'counter', label: '反方观点', icon: Swords },
  { action: 'followup', label: '生成追问', icon: HelpCircle },
] as const

export function DeepenActions({ point, className }: DeepenActionsProps) {
  const { deepen, addManualThought, addFactCheck, findSimilarFor, deepening, similar } = useLibraryStore()
  const {
    mentalModels,
    recommendations,
    recommending,
    fetchMentalModels,
    fetchRecommendations,
  } = useDeepenStore()

  const [panelOpen, setPanelOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [query, setQuery] = useState('')
  const [thoughtOpen, setThoughtOpen] = useState(false)
  const [thoughtDraft, setThoughtDraft] = useState('')
  const [polishing, setPolishing] = useState(false)
  const [thoughtError, setThoughtError] = useState<string | null>(null)
  const [similarOpen, setSimilarOpen] = useState(false)
  const [similarSearched, setSimilarSearched] = useState(false)
  const [factOpen, setFactOpen] = useState(false)
  const [factChecking, setFactChecking] = useState(false)
  const [factResult, setFactResult] = useState<FactCheckResult | null>(null)
  const [factError, setFactError] = useState<string | null>(null)
  const [factSaved, setFactSaved] = useState(false)

  const busy = deepening[point.id] ?? false
  const recs = recommendations[point.id] ?? []
  const loadingRecs = recommending[point.id] ?? false
  const matches = similar[point.id] ?? []
  const sourceExcerpt = point.sourceExcerpt ? point.sourceExcerpt.trim() : ''
  const factCheckContext = sourceExcerpt
    ? `【提取出的事实陈述】\n${point.content}\n\n【解析块原文】\n${sourceExcerpt}`
    : `【提取出的事实陈述】\n${point.content}`
  const relatedItems = useMemo(
    () => matches.map(match => describeRelatedPoint(point, match)),
    [matches, point]
  )

  const openFramework = async () => {
    const next = !panelOpen
    setPanelOpen(next)
    setShowAll(false)
    if (next && recs.length === 0) {
      await fetchRecommendations(point)
    }
  }

  const openAll = async () => {
    setShowAll(true)
    await fetchMentalModels()
  }

  const pickFramework = async (key: string) => {
    setPanelOpen(false)
    setShowAll(false)
    setQuery('')
    await deepen(point, 'framework', key)
  }

  const openSimilar = async () => {
    const next = !similarOpen
    setSimilarOpen(next)
    if (next && !similarSearched) {
      setSimilarSearched(true)
      await findSimilarFor(point)
    }
  }

  const runFactCheck = async () => {
    if (factChecking) return
    setFactChecking(true)
    setFactError(null)
    try {
      const result = await factCheckClaim(point.content, factCheckContext)
      setFactResult(result)
      await addFactCheck(point, formatFactCheckContent(result, sourceExcerpt))
      setFactSaved(true)
    } catch (error: unknown) {
      setFactError(error instanceof Error ? error.message : '事实审查失败')
    } finally {
      setFactChecking(false)
    }
  }

  const openFactCheck = async () => {
    const next = !factOpen
    setFactOpen(next)
    if (next && !factResult) await runFactCheck()
  }

  const jumpToPoint = (id: string) => {
    const target = document.querySelector<HTMLElement>(`[data-point-id="${id}"]`)
    if (!target) return
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    target.animate(
      [
        { boxShadow: '0 0 0 0 rgba(148, 163, 184, 0)', transform: 'scale(1)' },
        { boxShadow: '0 0 0 2px rgba(148, 163, 184, 0.55)', transform: 'scale(1.01)' },
        { boxShadow: '0 0 0 0 rgba(148, 163, 184, 0)', transform: 'scale(1)' },
      ],
      { duration: 900, easing: 'ease-out' }
    )
  }

  const discardThought = () => {
    setThoughtOpen(false)
    setThoughtDraft('')
    setThoughtError(null)
  }

  const saveThought = async () => {
    const trimmed = thoughtDraft.trim()
    if (!trimmed) {
      setThoughtError('请输入你的想法')
      return
    }
    try {
      await addManualThought(point, trimmed)
      discardThought()
    } catch (error: unknown) {
      setThoughtError(error instanceof Error ? error.message : '保存失败')
    }
  }

  const polishThought = async () => {
    const trimmed = thoughtDraft.trim()
    if (!trimmed || polishing) {
      setThoughtError('请输入需要润色的内容')
      return
    }
    setPolishing(true)
    setThoughtError(null)
    try {
      const polished = await polishManualThought(point.content, trimmed)
      setThoughtDraft(polished)
    } catch (error: unknown) {
      setThoughtError(error instanceof Error ? error.message : '润色失败')
    } finally {
      setPolishing(false)
    }
  }

  const filtered = query.trim()
    ? mentalModels.filter(
        (m) =>
          m.name.toLowerCase().includes(query.toLowerCase()) ||
          m.description.toLowerCase().includes(query.toLowerCase())
      )
    : mentalModels

  return (
    <div className={cn('mt-3', className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {BASIC_ACTIONS.map(({ action, label, icon: Icon }) => (
          <ActionButton
            key={action}
            label={label}
            icon={Icon}
            disabled={busy}
            onClick={() => deepen(point, action)}
          />
        ))}
        {point.tagType === '事实陈述' && (
          <ActionButton
            label="事实审查"
            icon={Search}
            disabled={factChecking}
            active={factOpen}
            onClick={openFactCheck}
          />
        )}
        <ActionButton
          label="查找相似"
          icon={Link2}
          disabled={busy}
          active={similarOpen}
          onClick={openSimilar}
        />
        <ActionButton
          label="框架解读"
          icon={Brain}
          disabled={busy}
          active={panelOpen}
          onClick={openFramework}
        />
        <ActionButton
          label="我的想法"
          icon={MessageSquarePlus}
          disabled={busy}
          active={thoughtOpen}
          onClick={() => {
            setThoughtOpen(value => !value)
            setThoughtError(null)
          }}
        />
        {busy && <Loader2 size={14} className="ml-1 animate-spin text-fg-faint" />}
      </div>

      <AnimatePresence>
        {factOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2.5 rounded-lg border border-accent/25 bg-bg p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-accent">事实审查</p>
                  {factSaved && <p className="mt-0.5 text-[11px] text-emerald-300">已保存为子块</p>}
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-fg-faint">{point.content}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFactResult(null)
                    setFactSaved(false)
                    void runFactCheck()
                  }}
                  disabled={factChecking}
                  className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:opacity-50"
                >
                  重新审查
                </button>
              </div>
              {sourceExcerpt && (
                <div className="mb-2 rounded-md border border-border bg-bg-elevated px-3 py-2">
                  <p className="mb-1 text-[11px] font-medium text-fg-muted">解析块原文</p>
                  <p className="max-h-28 overflow-y-auto whitespace-pre-wrap pr-1 text-xs leading-relaxed text-fg-muted [&::-webkit-scrollbar]:hidden">
                    {sourceExcerpt}
                  </p>
                </div>
              )}
              {factChecking && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs text-fg-muted">
                  <Loader2 size={13} className="animate-spin text-accent" />
                  调用搜索模型核查中…
                </div>
              )}
              {factError && !factChecking && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-300">
                  {factError}
                </div>
              )}
              {factResult && !factChecking && (
                <div className="space-y-2">
                  <div className="rounded-md border border-border bg-bg-elevated px-3 py-2">
                    <p className="text-sm leading-relaxed text-fg">{factResult.answer}</p>
                  </div>
                  {factResult.extra.length > 0 && (
                    <div className="space-y-1">
                      {factResult.extra.slice(0, 4).map((item, index) => (
                        <p key={index} className="text-xs leading-relaxed text-fg-muted">· {item}</p>
                      ))}
                    </div>
                  )}
                  {factResult.sources.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-fg-faint">来源</span>
                      <div className="flex flex-wrap gap-1.5">
                        {factResult.sources.map((source, index) => (
                          <a
                            key={`${source.url}-${index}`}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            title={`${source.title}\n${source.url}\n${source.snippet}`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-accent/35 bg-accent/10 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
                          >
                            {index + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {thoughtOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2.5 rounded-lg border border-border bg-bg-elevated p-3 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                  我的想法
                </span>
              </div>
              <textarea
                value={thoughtDraft}
                onChange={(event) => {
                  setThoughtDraft(event.target.value)
                  setThoughtError(null)
                }}
                rows={4}
                placeholder="写下你对这个点的想法…"
                className="w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-sm leading-relaxed text-fg outline-none placeholder:text-fg-faint focus:border-accent"
              />
              {thoughtError && <p className="mt-2 text-xs text-red-400">{thoughtError}</p>}
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={discardThought}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
                >
                  <X size={13} />
                  舍弃
                </button>
                <button
                  type="button"
                  onClick={() => void polishThought()}
                  disabled={polishing || busy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:opacity-50"
                >
                  {polishing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  润色
                </button>
                <button
                  type="button"
                  onClick={() => void saveThought()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                >
                  <Save size={13} />
                  保存
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {similarOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2.5 rounded-lg border border-border bg-bg p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-fg">本地关联</p>
                  <p className="mt-0.5 text-[11px] text-fg-faint">从知识库中用关键词重叠快速定位，不调用 LLM。</p>
                </div>
                <button
                  type="button"
                  onClick={() => void findSimilarFor(point)}
                  disabled={busy}
                  className="rounded-md border border-border px-2 py-1 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:opacity-50"
                >
                  重新查找
                </button>
              </div>
              {busy ? (
                <div className="flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs text-fg-faint">
                  <Loader2 size={13} className="animate-spin" />
                  正在查找本地关联…
                </div>
              ) : relatedItems.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-3 text-xs leading-relaxed text-fg-faint">
                  暂时没有找到足够接近的知识块。这个功能适合在知识库内容较多时做“旧观点回收”和“跨文章串联”。
                </div>
              ) : (
                <div className="space-y-2">
                  {relatedItems.map(item => (
                    <button
                      key={item.point.id}
                      type="button"
                      onClick={() => jumpToPoint(item.point.id)}
                      className="block w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-left transition-colors hover:border-fg-muted hover:bg-bg-hover"
                    >
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', item.badgeClass)}>
                          {item.label}
                        </span>
                        {item.point.sourceDocName && (
                          <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-fg-faint">
                            <FileText size={11} />
                            <span className="truncate">{item.point.sourceDocName}</span>
                          </span>
                        )}
                        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-fg-faint">
                          <MapPin size={11} />
                          定位
                          <ArrowRight size={10} />
                        </span>
                      </div>
                      <p className="line-clamp-2 text-xs leading-relaxed text-fg-muted">{item.point.content}</p>
                      <p className="mt-1 text-[11px] text-fg-faint">{item.reason}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2.5 rounded-md border border-border bg-bg p-3">
              {loadingRecs ? (
                <div className="flex items-center gap-2 text-xs text-fg-faint">
                  <Loader2 size={14} className="animate-spin" />
                  正在为这个观点推荐思维框架…
                </div>
              ) : (
                <>
                  {!showAll && (
                    <>
                      <p className="mb-2 text-xs text-fg-muted">推荐框架</p>
                      <div className="space-y-1.5">
                        {recs.map((rec) => (
                          <button
                            key={rec.key}
                            onClick={() => pickFramework(rec.key)}
                            className="block w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-left transition-colors hover:bg-bg-hover"
                          >
                            <span className="text-sm font-medium text-fg">
                              {rec.name}
                            </span>
                            <span className="mt-0.5 block text-xs text-fg-muted">
                              {rec.reason}
                            </span>
                          </button>
                        ))}
                        {recs.length === 0 && (
                          <p className="text-xs text-fg-faint">
                            暂无推荐，可点「其他」浏览全部框架。
                          </p>
                        )}
                      </div>
                      <button
                        onClick={openAll}
                        className="mt-2 text-xs text-accent hover:underline"
                      >
                        其他（浏览全部思维框架）
                      </button>
                    </>
                  )}

                  {showAll && (
                    <>
                      <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-2.5 py-1.5">
                        <Search size={14} className="shrink-0 text-fg-faint" />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="搜索思维框架…"
                          className="w-full bg-transparent text-sm outline-none placeholder:text-fg-faint"
                        />
                      </div>
                      <div className="max-h-60 space-y-1 overflow-y-auto">
                        {filtered.map((mdl) => (
                          <button
                            key={mdl.key}
                            onClick={() => pickFramework(mdl.key)}
                            className="block w-full rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-bg-hover"
                          >
                            <span className="text-sm text-fg">{mdl.name}</span>
                            <span className="mt-0.5 block text-xs text-fg-muted">
                              {mdl.description}
                            </span>
                          </button>
                        ))}
                        {filtered.length === 0 && (
                          <p className="px-2.5 py-1.5 text-xs text-fg-faint">
                            没有匹配的框架。
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function tokenizeForRelated(content: string) {
  return content
    .split(/[\s,.;:!?，。、；：！？“”‘’（）《》【】…—·]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2)
    .slice(0, 24)
}

function overlapScore(a: string, b: string) {
  const left = new Set(tokenizeForRelated(a))
  const right = new Set(tokenizeForRelated(b))
  if (left.size === 0 || right.size === 0) return 0
  let hits = 0
  left.forEach(token => {
    if (right.has(token)) hits += 1
  })
  return hits / Math.min(left.size, right.size)
}

function describeRelatedPoint(current: StoredPoint, point: StoredPoint) {
  const score = overlapScore(current.content, point.content)
  if (score > 0.72) {
    return {
      point,
      label: '近似重复',
      reason: '表达高度重合，适合合并或避免重复采集。',
      badgeClass: 'border-amber-400/35 bg-amber-400/10 text-amber-300',
    }
  }
  if (current.sourceDocName && current.sourceDocName === point.sourceDocName) {
    return {
      point,
      label: '同源补充',
      reason: '来自同一文件或网页，适合补成同一条论证链。',
      badgeClass: 'border-sky-400/35 bg-sky-400/10 text-sky-300',
    }
  }
  if (current.tagType && point.tagType && current.tagType === point.tagType) {
    return {
      point,
      label: '同类观点',
      reason: '标签类型一致，适合横向比较观点、事实或案例。',
      badgeClass: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300',
    }
  }
  return {
    point,
    label: '相似线索',
    reason: '关键词有交叉，可作为跨文章检索入口。',
    badgeClass: 'border-border bg-bg text-fg-muted',
  }
}

function formatFactCheckContent(result: FactCheckResult, sourceExcerpt: string) {
  const lines = [
    '### 事实审查',
    '',
    result.answer.trim(),
    '',
    ...result.extra.slice(0, 4).map(item => `- ${item.trim()}`).filter(line => line !== '- '),
  ]
  if (result.sources.length > 0) {
    lines.push('', '来源')
    result.sources.slice(0, 4).forEach((source, index) => {
      const title = source.title.trim() || `来源 ${index + 1}`
      const snippet = source.snippet.trim()
      lines.push(`${index + 1}. [${title}](${source.url})${snippet ? ` - ${snippet}` : ''}`)
    })
  }
  if (sourceExcerpt) {
    lines.push('', '解析块原文', sourceExcerpt)
  }
  return lines.join('\n').trim()
}

interface ActionButtonProps {
  label: string
  icon: typeof Lightbulb
  disabled?: boolean
  active?: boolean
  onClick: () => void
}

function ActionButton({
  label,
  icon: Icon,
  disabled,
  active,
  onClick,
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
        disabled
          ? 'cursor-not-allowed border-border opacity-50'
          : active
            ? 'border-accent/40 bg-accent/10 text-accent'
            : 'border-border bg-bg-elevated text-fg-muted hover:bg-bg-hover hover:text-fg'
      )}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}
