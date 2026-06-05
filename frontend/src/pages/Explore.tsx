import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { open } from '@tauri-apps/plugin-dialog'
import { Loader2, Upload, FileText, Star, X, Link, AlertCircle } from 'lucide-react'
import { useConfigStore, useExploreStore, useStarStore } from '@/store'
import { cn } from '@/lib/utils'
import { useStarFly } from '@/hooks/useStarFly'
import { savePoints } from '@/api'
import type { ChunkCard } from '@/api/types'

const URL_RE = /^https?:\/\/[^\s]+$/
const SUPPORTED_EXTS = ['txt','md','markdown','rst','csv','docx','odt','html','htm']

function processWebHtml(html: string): { richHtml: string; text: string; url: string | null } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  let url: string | null = null
  const canonical = doc.querySelector('link[rel="canonical"]')
  if (canonical) url = canonical.getAttribute('href')
  if (!url) url = doc.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? null
  doc.querySelectorAll('script,style,nav,footer,aside,noscript,iframe').forEach(el => el.remove())
  return { richHtml: doc.body?.innerHTML ?? html, text: (doc.body?.innerText ?? '').trim(), url }
}

// ── Drawer ─────────────────────────────────────────────────────────────────
function ChunkDrawer({ card, commentatorEmoji, commentatorName, onClose }: {
  card: ChunkCard; commentatorEmoji: string; commentatorName: string; onClose: () => void
}) {
  const CATEGORY_COLOR: Record<string, string> = {
    '事实': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    '观点': 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    '中间混淆形态': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    '规范性/分析性': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    '修辞性': 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  }
  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed right-0 top-0 h-full w-[360px] z-40 border-l border-border bg-bg-elevated shadow-2xl flex flex-col"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <span className="text-sm font-medium text-fg">主题分析</span>
        <button onClick={onClose} className="rounded-md p-1 text-fg-muted hover:bg-bg-hover transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-faint">总结</p>
          <p className="text-sm leading-relaxed text-fg">{card.summary}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-lg">{commentatorEmoji}</span>
            <span className="text-xs font-medium text-fg-muted">{commentatorName} 说</span>
          </div>
          <p className="text-sm leading-relaxed text-fg italic">{card.hotTake}</p>
        </div>
        {card.labels.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-faint">信息分类</p>
            <div className="flex flex-wrap gap-1.5">
              {card.labels.map((label, i) => (
                <span key={i} className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs',
                  CATEGORY_COLOR[label.category] ?? 'bg-bg-hover text-fg-muted border-border'
                )}>
                  {label.category} · {label.sub}
                </span>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-faint">原文</p>
          <p className="text-xs leading-relaxed text-fg-muted whitespace-pre-wrap">{card.text}</p>
        </div>
      </div>
    </motion.div>
  )
}

// ── ThemeBlock ──────────────────────────────────────────────────────────────
function ThemeBlock({ card, index, starred, onOpen, onToggleStar }: {
  card: ChunkCard
  index: number
  starred: boolean
  onOpen: () => void
  onToggleStar: (el: HTMLButtonElement) => void
}) {
  const starRef = useRef<HTMLButtonElement>(null)
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, type: 'spring', stiffness: 200, damping: 22 }}
      className="group relative flex items-start gap-3"
    >
      <div className="flex-1 rounded-xl border border-border bg-bg-elevated px-5 py-4 text-sm leading-relaxed text-fg">
        {card.text}
      </div>
      <motion.button
        ref={starRef}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: index * 0.08 + 0.15, type: 'spring', stiffness: 400, damping: 15 }}
        onClick={onOpen}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); starRef.current && onToggleStar(starRef.current) }}
        className={cn(
          'mt-3 shrink-0 rounded-full p-1.5 transition-colors',
          starred ? 'text-amber-400 bg-amber-400/15' : 'text-amber-400/50 hover:text-amber-400 hover:bg-amber-400/10'
        )}
        title={starred ? '右键取消采集' : '左键查看分析 / 右键采集'}
      >
        <Star size={18} fill={starred ? 'currentColor' : 'none'} />
      </motion.button>
    </motion.div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function Explore() {
  const { chunkCards, analyzing, parsing, error, sourceName, sourceUrl, setRichContent, parseFile, fetchUrlContent, reset } = useExploreStore()
  const { config, loaded } = useConfigStore()
  const { star, unstar } = useStarStore()
  const fly = useStarFly()

  const [dragging, setDragging] = useState(false)
  const [activeCard, setActiveCard] = useState<ChunkCard | null>(null)
  // index → saved point id (once a chunk has been saved+starred)
  const [savedIds, setSavedIds] = useState<Record<number, string>>({})

  const busy = analyzing || parsing
  const hasContent = chunkCards.length > 0 || busy
  const commentatorEmoji = config?.commentatorEmoji ?? '🧐'
  const commentatorName = config?.commentatorName ?? '鲁迅'

  useEffect(() => { if (analyzing) { setActiveCard(null); setSavedIds({}) } }, [analyzing])

  const handleToggleStar = useCallback(async (index: number, card: ChunkCard, el: HTMLButtonElement) => {
    const existing = savedIds[index]
    if (existing) {
      // already saved: unstar and remove from map
      await unstar(existing)
      setSavedIds(m => { const n = { ...m }; delete n[index]; return n })
    } else {
      // first star: save chunk summary as a point, then star it
      try {
        fly(el)
        const ids = await savePoints([{ content: card.summary, tagType: '作者观点' }], sourceName)
        const pointId = ids[0]
        if (pointId) {
          await star(pointId)
          setSavedIds(m => ({ ...m, [index]: pointId }))
        }
      } catch {
        // silently fail
      }
    }
  }, [savedIds, sourceName, fly, star, unstar])

  // ── File picker ──────────────────────────────────────────────────────────
  const handlePick = async () => {
    const selected = await open({ multiple: false, filters: [{ name: '文档', extensions: SUPPORTED_EXTS }] })
    if (typeof selected === 'string') await parseFile(selected)
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: Event) => { e.preventDefault(); setDragging(true) }, [])
  const handleDragLeave = useCallback((e: Event) => {
    if (!((e as DragEvent).relatedTarget instanceof Node)) setDragging(false)
  }, [])
  const handleDrop = useCallback(async (e: Event) => {
    e.preventDefault(); setDragging(false)
    const file = (e as DragEvent).dataTransfer?.files[0]
    if (!file) return
    await parseFile((file as unknown as { path?: string }).path ?? file.name)
  }, [parseFile])

  useEffect(() => {
    document.body.addEventListener('dragover', handleDragOver as EventListener)
    document.body.addEventListener('dragleave', handleDragLeave as EventListener)
    document.body.addEventListener('drop', handleDrop as EventListener)
    return () => {
      document.body.removeEventListener('dragover', handleDragOver as EventListener)
      document.body.removeEventListener('dragleave', handleDragLeave as EventListener)
      document.body.removeEventListener('drop', handleDrop as EventListener)
    }
  }, [handleDragOver, handleDragLeave, handleDrop])

  // ── Paste ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const plain = e.clipboardData?.getData('text/plain')?.trim() ?? ''
      const html = e.clipboardData?.getData('text/html') ?? ''
      if (URL_RE.test(plain)) { e.preventDefault(); await fetchUrlContent(plain); return }
      if (html && html.trim().length > 200) {
        e.preventDefault()
        const { richHtml, text, url } = processWebHtml(html)
        setRichContent(richHtml, text, url)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [fetchUrlContent, setRichContent])

  return (
    <div className="relative flex h-full overflow-hidden">
      <div className={cn('flex h-full flex-1 flex-col transition-all duration-300', activeCard ? 'mr-[360px]' : '')}>

        {!hasContent && (
          <div className="flex flex-1 items-center justify-center px-8">
            {loaded && !config?.openaiApiKey && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-fg">
                尚未配置 API Key，请先到「设置」页填写。
              </div>
            )}
            <motion.div
              animate={dragging ? { scale: 1.03, borderColor: 'var(--color-accent)' } : { scale: 1 }}
              transition={{ duration: 0.15 }}
              onClick={handlePick}
              className={cn(
                'flex w-full max-w-md cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-border bg-bg-elevated px-8 py-16 transition-colors',
                dragging ? 'bg-accent/5 border-accent' : 'hover:border-accent/50 hover:bg-bg-hover',
              )}
            >
              <Upload size={32} className={cn('transition-colors', dragging ? 'text-accent' : 'text-fg-faint')} />
              <div className="text-center">
                <p className="text-sm font-medium text-fg">{dragging ? '松开以导入文件' : '拖拽文件 / 点击选择'}</p>
                <p className="mt-1 text-xs text-fg-faint">或粘贴文本、网页链接、复制的网页内容</p>
              </div>
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-bg px-3 py-1.5 text-xs text-fg-muted">
                <FileText size={13} />txt · md · docx · odt · html · csv
              </div>
            </motion.div>
          </div>
        )}

        {hasContent && (
          <>
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-2.5 text-xs text-fg-faint">
              {busy ? (
                <><Loader2 size={12} className="animate-spin text-accent" /><span className="text-accent">{parsing ? '解析中…' : '分析中…'}</span></>
              ) : (
                <>
                  {sourceName && <span className="truncate max-w-[260px] text-fg-muted">{sourceName}</span>}
                  {sourceUrl && (
                    <a href={sourceUrl} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 hover:text-accent transition-colors truncate max-w-[200px]">
                      <Link size={11} />{sourceUrl}
                    </a>
                  )}
                  <button onClick={handlePick} className="ml-auto rounded border border-border px-2 py-0.5 hover:bg-bg-hover transition-colors">
                    <FileText size={11} className="inline mr-1" />换文件
                  </button>
                  <button onClick={reset} className="rounded border border-border px-2 py-0.5 hover:bg-bg-hover transition-colors">清空</button>
                </>
              )}
            </div>

            {error && (
              <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertCircle size={16} className="mt-0.5 shrink-0" /><span className="break-words">{error}</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
              <div className="mx-auto max-w-2xl space-y-4 pb-10">
                <AnimatePresence>
                  {chunkCards.map((card, i) => (
                    <ThemeBlock
                      key={i}
                      card={card}
                      index={i}
                      starred={i in savedIds}
                      onOpen={() => setActiveCard(card)}
                      onToggleStar={(el) => handleToggleStar(i, card, el)}
                    />
                  ))}
                </AnimatePresence>
                {analyzing && chunkCards.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-xs text-fg-faint">
                    <Loader2 size={12} className="animate-spin" />分析中…
                  </motion.div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {activeCard && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-30" onClick={() => setActiveCard(null)} />
            <ChunkDrawer card={activeCard} commentatorEmoji={commentatorEmoji}
              commentatorName={commentatorName} onClose={() => setActiveCard(null)} />
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
