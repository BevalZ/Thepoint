import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Image, Loader2, Sparkles, Star, Trash2, X } from 'lucide-react'
import { useExploreHistoryStore, useExploreStore, useGalleryStore, useStarStore } from '@/store'
import { generateDigest } from '@/api'
import { DigestModal } from './DigestModal'
import type {
  ChunkCard,
  ExploreHistoryItem,
  GalleryImageMode,
  GalleryKnowledgeContext,
  StoredPoint,
} from '@/api/types'

const SIZE = 56
const R = 22
const CIRC = 2 * Math.PI * R
const SOURCE_COLORS = ['#38bdf8', '#a78bfa', '#f59e0b', '#34d399', '#f472b6', '#60a5fa', '#facc15', '#22d3ee']
const ORBITING_STARS = [
  { size: 8, distance: 35, duration: 5.6, delay: 0, opacity: 0.95 },
  { size: 6, distance: 32, duration: 7.2, delay: -1.9, opacity: 0.72 },
  { size: 5, distance: 38, duration: 9.4, delay: -4.1, opacity: 0.58 },
]

function ringParams(count: number) {
  if (count <= 0) return { progress: 0, strokeW: 3, fillOpacity: 0 }
  if (count <= 10) return { progress: count / 10, strokeW: 3, fillOpacity: 0 }
  if (count <= 50) {
    const t = (count - 10) / 40
    return { progress: 1, strokeW: 3 + t * 5, fillOpacity: t * 0.4 }
  }
  return { progress: 1, strokeW: 8, fillOpacity: 0.4 }
}

interface SourceGroup {
  name: string
  color: string
  points: StoredPoint[]
  historyItem: ExploreHistoryItem | null
  isCurrent: boolean
}

function sourceName(point: StoredPoint): string {
  return point.sourceDocName?.trim() || '未命名来源'
}

function comparableSourceName(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim().toLowerCase() ?? ''
}

function groupPoints(
  points: StoredPoint[],
  historyItems: ExploreHistoryItem[],
  currentSourceName: string | null
): SourceGroup[] {
  const groups = new Map<string, StoredPoint[]>()
  for (const point of points) {
    const name = sourceName(point)
    groups.set(name, [...(groups.get(name) ?? []), point])
  }

  return Array.from(groups.entries())
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([name, groupPoints], index) => ({
      name,
      points: groupPoints,
      color: SOURCE_COLORS[index % SOURCE_COLORS.length],
      historyItem: historyItems.find((item) => comparableSourceName(item.sourceName) === comparableSourceName(name)) ?? null,
      isCurrent: comparableSourceName(currentSourceName) === comparableSourceName(name),
    }))
}

function preview(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > 58 ? `${normalized.slice(0, 58)}…` : normalized
}

function pointIdKey(ids: string[]): string {
  return [...ids].sort().join('|')
}

function chunkLabels(card: ChunkCard): string[] {
  return card.labels.map(label => `${label.category}/${label.sub}`)
}

function knowledgeStar(point: StoredPoint) {
  return {
    id: point.id,
    content: point.content,
    tagType: point.tagType,
    sourceExcerpt: point.sourceExcerpt,
  }
}

function contextFromHistoryItem(item: ExploreHistoryItem, starredPoints: StoredPoint[]): GalleryKnowledgeContext {
  return {
    sourceName: item.sourceName || '未命名来源',
    sourceUrl: item.sourceUrl,
    originalText: item.text,
    chunkCards: item.chunkCards.map(card => ({
      index: card.index,
      text: card.text,
      summary: card.summary,
      hotTake: card.hotTake,
      labels: chunkLabels(card),
    })),
    starredPoints: starredPoints.map(knowledgeStar),
  }
}

function buildKnowledgeContexts(
  groups: SourceGroup[],
  active: {
    sourceName: string | null
    sourceUrl: string | null
    text: string
    chunkCards: ChunkCard[]
  }
): GalleryKnowledgeContext[] {
  return groups.map((group) => {
    const useActive = group.isCurrent && active.text.trim() && active.chunkCards.length > 0
    if (useActive) {
      return {
        sourceName: active.sourceName || group.name,
        sourceUrl: active.sourceUrl,
        originalText: active.text,
        chunkCards: active.chunkCards.map(card => ({
          index: card.index,
          text: card.text,
          summary: card.summary,
          hotTake: card.hotTake,
          labels: chunkLabels(card),
        })),
        starredPoints: group.points.map(knowledgeStar),
      }
    }
    if (group.historyItem) {
      return contextFromHistoryItem(group.historyItem, group.points)
    }
    return {
      sourceName: group.name,
      sourceUrl: null,
      originalText: group.points.map(point => point.sourceExcerpt || point.content).join('\n\n'),
      chunkCards: [],
      starredPoints: group.points.map(knowledgeStar),
    }
  }).filter(context => context.originalText.trim() || context.starredPoints.length > 0)
}

interface StarRingProps {
  onNavigateGallery?: () => void
}

export function StarRing({ onNavigateGallery }: StarRingProps) {
  const { count, points, init, clear } = useStarStore()
  const {
    preparePrompt,
    generateFromPrompt,
    cancel: cancelImageGeneration,
    preparingPrompt,
    generating: imageGenerating,
    error: imageError,
    promptPreview,
  } = useGalleryStore()
  const {
    sourceName: currentSourceName,
    sourceUrl: currentSourceUrl,
    text: currentText,
    chunkCards: currentChunkCards,
  } = useExploreStore()
  const history = useExploreHistoryStore()
  const [generating, setGenerating] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [digest, setDigest] = useState<string | null>(null)
  const [digestPoints, setDigestPoints] = useState<StoredPoint[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [imagePromptOpen, setImagePromptOpen] = useState(false)
  const [imagePromptDraft, setImagePromptDraft] = useState('')
  const [imageMode, setImageMode] = useState<GalleryImageMode>('artwork')
  const clickTimerRef = useRef<number | null>(null)
  const ringRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { init() }, [init])

  useEffect(() => () => {
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current)
  }, [])

  useEffect(() => {
    if (!panelOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (ringRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setPanelOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [panelOpen])

  const groups = useMemo(
    () => groupPoints(points, history.items, currentSourceName),
    [currentSourceName, history.items, points]
  )
  const currentStarKey = useMemo(
    () => pointIdKey(points.map(point => point.id)),
    [points]
  )
  const knowledgeContexts = useMemo(
    () => buildKnowledgeContexts(groups, {
      sourceName: currentSourceName,
      sourceUrl: currentSourceUrl,
      text: currentText,
      chunkCards: currentChunkCards,
    }),
    [currentChunkCards, currentSourceName, currentSourceUrl, currentText, groups]
  )
  const { progress, strokeW, fillOpacity } = ringParams(count)
  const canGenerate = count > 0
  const canGenerateImage = count >= 10
  const coloredLength = CIRC * progress

  useEffect(() => {
    if (promptPreview) setImagePromptDraft(promptPreview.prompt)
  }, [promptPreview])

  const handleClick = () => {
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current)
    clickTimerRef.current = window.setTimeout(() => {
      setPanelOpen((open) => !open)
      clickTimerRef.current = null
    }, 180)
  }

  const handleGenerateDigest = async () => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    if (!canGenerate || generating) return
    setGenerating(true)
    setPanelOpen(false)
    const pointsForDigest = points
    try {
      const result = await generateDigest()
      setDigestPoints(pointsForDigest)
      setDigest(result)
      await init()
    } catch {
      // silent — user can retry
    } finally {
      setGenerating(false)
    }
  }

  const handleClear = async () => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    if (!canGenerate || generating || clearing) return
    setClearing(true)
    try {
      await clear()
      setPanelOpen(false)
    } catch {
      // silent — user can retry
    } finally {
      setClearing(false)
    }
  }

  const handleGenerateImage = async () => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    if (!canGenerateImage || generating || clearing || imageGenerating || preparingPrompt) return
    try {
      const canReusePreview = promptPreview?.mode === imageMode
        && pointIdKey(promptPreview.pointIds) === currentStarKey
      const preview = canReusePreview
        ? promptPreview
        : await preparePrompt(imageMode, imageMode === 'knowledge' ? knowledgeContexts : undefined)
      setImagePromptDraft(preview.prompt)
      setImagePromptOpen(true)
    } catch {
      // The store exposes a compact error message inside the panel.
    }
  }

  const handleConfirmImage = async () => {
    if (!imagePromptDraft.trim() || imageGenerating) return
    try {
      await generateFromPrompt(imagePromptDraft)
      setImagePromptOpen(false)
      setPanelOpen(false)
      onNavigateGallery?.()
    } catch {
      // The store exposes a compact error message inside the prompt dialog.
    }
  }

  const handleCancelImage = () => {
    cancelImageGeneration()
    setImagePromptOpen(false)
    setImagePromptDraft('')
  }

  const handleDoubleClick = () => {
    void handleGenerateDigest()
  }

  const handleSourceClick = (group: SourceGroup) => {
    if (group.isCurrent || group.historyItem === null) return
    history.activate(group.historyItem.id)
    setPanelOpen(false)
  }

  return (
    <>
      <AnimatePresence>
        {count > 0 && (
          <>
            <motion.button
              ref={ringRef}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleClick}
              onDoubleClick={handleDoubleClick}
              className="fixed bottom-6 right-6 z-50 flex items-center justify-center overflow-visible"
              style={{ width: SIZE, height: SIZE, cursor: canGenerate ? 'pointer' : 'default' }}
              title="单击查看来源，双击圆环生成研报"
            >
              <motion.span
                aria-hidden
                className="absolute inset-[-12px] rounded-full bg-amber-300/10 blur-xl"
                animate={{ opacity: [0.28, 0.72, 0.36], scale: [0.82, 1.18, 0.9] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.span
                aria-hidden
                className="absolute inset-[-5px] rounded-full border border-amber-200/25"
                animate={{ opacity: [0.22, 0.82, 0.18], scale: [0.86, 1.12, 0.92] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              {ORBITING_STARS.map((star, index) => (
                <motion.span
                  key={index}
                  aria-hidden
                  className="absolute left-1/2 top-1/2 text-amber-200"
                  style={{ width: 0, height: 0 }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: star.duration, delay: star.delay, repeat: Infinity, ease: 'linear' }}
                >
                  <motion.span
                    className="block"
                    style={{ transform: `translate(${star.distance}px, -50%)` }}
                    animate={{ opacity: [star.opacity * 0.55, star.opacity, star.opacity * 0.62], scale: [0.74, 1.18, 0.86] }}
                    transition={{ duration: 1.25 + index * 0.22, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Star size={star.size} fill="currentColor" className="drop-shadow-[0_0_8px_rgba(255,236,160,0.95)]" />
                  </motion.span>
                </motion.span>
              ))}
              <svg width={SIZE} height={SIZE} className="absolute inset-0 overflow-visible">
                <defs>
                  <filter id="star-ring-glow" x="-70%" y="-70%" width="240%" height="240%">
                    <feGaussianBlur stdDeviation="2.4" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <motion.circle
                  cx={SIZE/2}
                  cy={SIZE/2}
                  r={R + 5}
                  fill="none"
                  stroke="rgba(255,255,255,0.28)"
                  strokeWidth={1}
                  strokeDasharray="2 8"
                  animate={{ rotate: 360, opacity: [0.28, 0.72, 0.36] }}
                  transition={{ rotate: { duration: 8, repeat: Infinity, ease: 'linear' }, opacity: { duration: 1.7, repeat: Infinity, ease: 'easeInOut' } }}
                  style={{ transformOrigin: 'center' }}
                />
                <circle cx={SIZE/2} cy={SIZE/2} r={R} fill="none" stroke="var(--color-border)" strokeWidth={2} opacity={0.55} />
                <circle cx={SIZE/2} cy={SIZE/2} r={R}
                  fill={`color-mix(in srgb, var(--color-accent) ${Math.round(fillOpacity * 100)}%, transparent)`}
                  stroke="none" style={{ transition: 'fill 0.4s ease' }} />
                {groups.map((group, index) => {
                  const before = groups.slice(0, index).reduce((total, item) => total + item.points.length, 0)
                  const length = count > 0 ? coloredLength * (group.points.length / count) : 0
                  const offset = -before / count * coloredLength
                  return (
                    <motion.circle
                      key={group.name}
                      cx={SIZE/2}
                      cy={SIZE/2}
                      r={R}
                      fill="none"
                      stroke={group.color}
                      strokeWidth={strokeW}
                      strokeDasharray={`${length} ${CIRC}`}
                      strokeDashoffset={offset}
                      strokeLinecap="butt"
                      transform={`rotate(-90 ${SIZE/2} ${SIZE/2})`}
                      filter="url(#star-ring-glow)"
                      animate={{
                        opacity: generating ? [0.7, 1, 0.7] : [0.76, 1, 0.82],
                        strokeWidth: generating ? [strokeW, strokeW + 1.8, strokeW] : [strokeW, strokeW + 0.9, strokeW],
                      }}
                      transition={{
                        opacity: { duration: 1.6 + index * 0.18, repeat: Infinity, ease: 'easeInOut' },
                        strokeWidth: { duration: 2.2 + index * 0.12, repeat: Infinity, ease: 'easeInOut' },
                      }}
                      style={{ transition: 'stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease' }}
                    />
                  )
                })}
              </svg>
              <motion.span
                className="relative flex h-8 w-8 items-center justify-center rounded-full border border-amber-200/25 bg-bg/80 text-xs font-semibold text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.28)]"
                style={{ fontSize: 11 }}
                animate={{
                  boxShadow: [
                    '0 0 12px rgba(251,191,36,0.22)',
                    '0 0 26px rgba(251,191,36,0.52)',
                    '0 0 16px rgba(255,255,255,0.18)',
                  ],
                  scale: generating ? [1, 1.08, 1] : [1, 1.04, 1],
                }}
                transition={{ duration: 1.55, repeat: Infinity, ease: 'easeInOut' }}
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : count}
              </motion.span>
            </motion.button>

            <AnimatePresence>
              {panelOpen && (
                <motion.div
                  ref={panelRef}
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  className="fixed bottom-24 right-6 z-50 w-[min(23rem,calc(100vw-3rem))] overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl"
                >
                  <div className="flex items-start justify-between border-b border-border px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-fg">星星来源</p>
                      <p className="mt-0.5 text-xs text-fg-faint">单击查看，双击圆环生成研报</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPanelOpen(false)}
                      className="rounded-md p-1 text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="px-4 py-3">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs text-fg-faint">采集总数</div>
                      <div className="text-sm font-medium text-fg">{count}</div>
                    </div>
                    <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-bg">
                      {groups.map((group) => (
                        <span
                          key={group.name}
                          className="h-full"
                          style={{ width: `${(group.points.length / count) * 100}%`, backgroundColor: group.color }}
                        />
                      ))}
                    </div>
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden">
                      {groups.map((group) => {
                        const canSwitch = !group.isCurrent && group.historyItem !== null

                        return (
                        <button
                          key={group.name}
                          type="button"
                          onClick={() => handleSourceClick(group)}
                          disabled={!canSwitch}
                          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-left transition-colors enabled:hover:border-accent/40 enabled:hover:bg-bg-hover disabled:cursor-default"
                          title={group.isCurrent ? '当前文章' : group.historyItem ? '切换到这篇文章' : '没有可切换的历史记录'}
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                            <FileText size={12} className="text-fg-faint" />
                            <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">{group.name}</span>
                            {group.isCurrent && (
                              <span className="rounded-full border border-accent/25 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">当前</span>
                            )}
                            <span className="rounded-full bg-bg-hover px-1.5 py-0.5 text-[10px] text-fg-muted">{group.points.length}</span>
                          </div>
                          <div className="space-y-1">
                            {group.points.slice(0, 3).map((point) => (
                              <p key={point.id} className="truncate text-[11px] text-fg-faint">{preview(point.content)}</p>
                            ))}
                            {group.points.length > 3 && (
                              <p className="text-[11px] text-fg-faint">还有 {group.points.length - 3} 个</p>
                            )}
                          </div>
                        </button>
                        )
                      })}
                    </div>
                    {imageError && (
                      <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-300">
                        {imageError}
                      </p>
                    )}
                    <div className="mt-3 rounded-lg border border-border bg-bg p-1">
                      {([
                        ['artwork', '艺术图'],
                        ['knowledge', '知识图'],
                      ] as const).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setImageMode(mode)}
                          disabled={imageGenerating || preparingPrompt}
                          className={`w-1/2 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                            imageMode === mode
                              ? 'bg-accent/15 text-accent'
                              : 'text-fg-muted hover:bg-bg-hover hover:text-fg'
                          } disabled:opacity-50`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={!canGenerate || generating || clearing || imageGenerating}
                        onClick={() => void handleClear()}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-fg-muted transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                        title="清空圆环采集"
                      >
                        {clearing ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        清空
                      </button>
                      <button
                        type="button"
                        disabled={!canGenerateImage || generating || clearing || imageGenerating || preparingPrompt}
                        onClick={() => void handleGenerateImage()}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-fg-muted transition-colors hover:border-accent/40 hover:bg-bg-hover hover:text-fg disabled:opacity-50"
                        title={canGenerateImage ? `使用当前采集生成${imageMode === 'knowledge' ? '知识图' : '图片'}` : `至少需要 10 个 point，当前 ${count} 个`}
                      >
                        {imageGenerating || preparingPrompt ? <Loader2 size={13} className="animate-spin" /> : <Image size={13} />}
                        {preparingPrompt ? '准备中' : imageMode === 'knowledge' ? '生成知识图' : '生成图片'}
                      </button>
                      <button
                        type="button"
                        disabled={!canGenerate || generating || clearing || imageGenerating}
                        onClick={() => void handleGenerateDigest()}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-fg-muted transition-colors hover:border-accent/40 hover:bg-bg-hover hover:text-fg disabled:opacity-50"
                        title="点击生成知识研报"
                      >
                        {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                        生成研报
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {digest && (
          <DigestModal
            content={digest}
            starredPoints={digestPoints}
            onClose={() => setDigest(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {imagePromptOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
            onClick={handleCancelImage}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="w-[min(38rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-border px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-fg">确认图片 Prompt</p>
                  <p className="mt-0.5 text-xs text-fg-faint">
                    {promptPreview?.mode === 'knowledge' ? '知识图模式，确认后才会调用图片模型' : '确认后才会调用图片模型'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCancelImage}
                  disabled={imageGenerating}
                  className="rounded-md p-1 text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:opacity-50"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="space-y-3 px-4 py-3">
                <textarea
                  value={imagePromptDraft}
                  onChange={(event) => setImagePromptDraft(event.target.value)}
                  rows={6}
                  disabled={imageGenerating}
                  className="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2 text-sm leading-relaxed text-fg outline-none placeholder:text-fg-faint focus:border-accent disabled:opacity-60"
                  placeholder="编辑图片生成 Prompt"
                />
                {promptPreview && (
                  <div className="rounded-lg border border-border bg-bg px-3 py-2">
                    <div className="mb-1.5 flex items-center justify-between text-xs text-fg-faint">
                      <span>来源 star</span>
                      <span>{promptPreview.sourcePoints.length}</span>
                    </div>
                    <div className="max-h-28 space-y-1 overflow-y-auto pr-1 text-[11px] leading-relaxed text-fg-muted [&::-webkit-scrollbar]:hidden">
                      {promptPreview.sourcePoints.slice(0, 6).map((point) => (
                        <p key={point.id} className="truncate">
                          {(point.sourceDocName || '未命名来源')} · {point.content}
                        </p>
                      ))}
                      {promptPreview.sourcePoints.length > 6 && (
                        <p className="text-fg-faint">还有 {promptPreview.sourcePoints.length - 6} 个 star</p>
                      )}
                    </div>
                  </div>
                )}
                {imageError && (
                  <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-red-300">
                    {imageError}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancelImage}
                    disabled={imageGenerating}
                    className="rounded-lg border border-border px-3 py-2 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmImage()}
                    disabled={imageGenerating || !imagePromptDraft.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                  >
                    {imageGenerating ? <Loader2 size={13} className="animate-spin" /> : <Image size={13} />}
                    确认生图
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
