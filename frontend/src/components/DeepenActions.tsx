import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Lightbulb,
  Swords,
  HelpCircle,
  Link2,
  Brain,
  Loader2,
  MessageSquarePlus,
  Save,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import type { StoredPoint } from '@/api/types'
import { useDeepenStore, useLibraryStore } from '@/store'
import { cn } from '@/lib/utils'
import { polishManualThought } from '@/api'

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
  const { deepen, addManualThought, findSimilarFor, deepening } = useLibraryStore()
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

  const busy = deepening[point.id] ?? false
  const recs = recommendations[point.id] ?? []
  const loadingRecs = recommending[point.id] ?? false

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
        <ActionButton
          label="查找相似"
          icon={Link2}
          disabled={busy}
          onClick={() => findSimilarFor(point)}
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
