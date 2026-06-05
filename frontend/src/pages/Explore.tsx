import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { open } from '@tauri-apps/plugin-dialog'
import { FileText, Loader2, Sparkles, AlertCircle, Save, Check, Upload } from 'lucide-react'
import { useConfigStore, useExploreStore } from '@/store'
import { savePoints } from '@/api'
import { PointCard } from '@/components/PointCard'
import { AnnotatedText } from '@/components/AnnotatedText'
import { cn } from '@/lib/utils'
import type { ExtractedPoint } from '@/api/types'

/** Strip noise tags and extract readable HTML + plain text from clipboard HTML. */
function processWebHtml(html: string): { richHtml: string; text: string; url: string | null } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  let url: string | null = null
  const canonical = doc.querySelector('link[rel="canonical"]')
  if (canonical) url = canonical.getAttribute('href')
  if (!url) url = doc.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? null
  doc.querySelectorAll('script,style,nav,footer,aside,noscript,iframe').forEach(el => el.remove())
  return {
    richHtml: doc.body?.innerHTML ?? html,
    text: (doc.body?.innerText ?? doc.body?.textContent ?? '').trim(),
    url,
  }
}

const SUPPORTED_EXTS = new Set(['txt','md','markdown','rst','csv','docx','odt','html','htm'])

export default function Explore() {
  const {
    text, sourceName, richHtml, sourceUrl,
    points, parsing, extracting, saving, savedCount, error,
    setText, setRichContent, parseFile, extract, extractSelection, save, updatePoint, removePoint,
  } = useExploreStore()
  const { config, loaded } = useConfigStore()

  const [dragging, setDragging] = useState(false)
  const [selection, setSelection] = useState('')
  // Per-point save state (index → saved)
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set())

  const noKey = loaded && !config?.openaiApiKey
  const busy = parsing || extracting || saving
  const canExtract = (text.trim().length > 0 || !!richHtml) && !busy

  // Split points into anchored (has anchor, matchable) and fallback (no anchor)
  const anchoredPoints = points
    .map((p, idx) => ({ ...p, idx }))
    .filter(p => p.anchor && text.includes(p.anchor.slice(0, 30)))
  const fallbackPoints = points
    .map((p, idx) => ({ ...p, idx }))
    .filter(p => !p.anchor || !text.includes(p.anchor.slice(0, 30)))

  const showAnnotated = points.length > 0 && text.trim().length > 0

  // ── File picker ────────────────────────────────────────────────────────────
  const handlePick = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: '文档', extensions: [...SUPPORTED_EXTS] }],
    })
    if (typeof selected === 'string') await parseFile(selected)
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); setDragging(true) }, [])
  const handleDragLeave = useCallback(() => setDragging(false), [])
  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer?.files[0]
    if (!file) return
    const path = (file as unknown as { path?: string }).path ?? file.name
    await parseFile(path)
  }, [parseFile])

  useEffect(() => {
    const el = document.body
    el.addEventListener('dragover', handleDragOver)
    el.addEventListener('dragleave', handleDragLeave)
    el.addEventListener('drop', handleDrop as unknown as EventListener)
    return () => {
      el.removeEventListener('dragover', handleDragOver)
      el.removeEventListener('dragleave', handleDragLeave)
      el.removeEventListener('drop', handleDrop as unknown as EventListener)
    }
  }, [handleDragOver, handleDragLeave, handleDrop])

  // ── Paste detection ────────────────────────────────────────────────────────
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const html = e.clipboardData?.getData('text/html')
      if (html && html.trim().length > 200) {
        e.preventDefault()
        const { richHtml, text, url } = processWebHtml(html)
        setRichContent(richHtml, text, url)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [setRichContent])

  // ── Text selection for manual extract ─────────────────────────────────────
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection()?.toString().trim() ?? ''
      setSelection(sel)
    }
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [])

  // ── Per-point save ─────────────────────────────────────────────────────────
  const handleSavePoint = async (idx: number) => {
    const point = points[idx]
    if (!point) return
    await savePoints([point], sourceName ?? undefined)
    setSavedIndices(s => new Set([...s, idx]))
  }

  // Reset saved indices when new extraction runs
  useEffect(() => { setSavedIndices(new Set()) }, [points])

  return (
    <div className={cn('mx-auto flex h-full max-w-3xl flex-col px-8 py-10 transition-colors', dragging && 'bg-accent/5')}>
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-2 border-dashed border-accent rounded-xl bg-accent/10">
          <div className="flex flex-col items-center gap-2 text-accent">
            <Upload size={32} />
            <span className="text-sm font-medium">松开以导入文件</span>
          </div>
        </div>
      )}

      <header>
        <h1 className="text-lg font-semibold">探索</h1>
        <p className="mt-1 text-sm text-fg-muted">选择文件、拖拽、或粘贴文本 / 网页内容，提取关键观点。</p>
      </header>

      {noKey && (
        <div className="mt-5 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-fg">
          尚未配置 API Key，请先到「设置」页填写后再提取。
        </div>
      )}

      <div className="mt-6 flex items-center gap-3 flex-wrap">
        <button onClick={handlePick} disabled={busy}
          className={cn('flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-3.5 py-2 text-sm transition-colors',
            busy ? 'cursor-not-allowed opacity-60' : 'hover:bg-bg-hover')}>
          {parsing ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
          {parsing ? '解析中…' : '选择文件'}
        </button>
        {sourceName && <span className="truncate text-sm text-fg-muted">{sourceName}</span>}
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noreferrer"
            className="truncate text-xs text-fg-faint hover:text-accent transition-colors max-w-[220px]">
            {sourceUrl}
          </a>
        )}
      </div>

      {/* Content area */}
      {richHtml ? (
        <>
          <div
            className="mt-4 min-h-48 max-h-[55vh] overflow-y-auto rounded-lg border border-border bg-bg-elevated px-6 py-4 text-sm leading-loose
                       [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2
                       [&_p]:my-1 [&_p]:text-fg [&_li]:text-fg
                       [&_img]:max-w-full [&_img]:rounded [&_img]:my-2
                       [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-fg-muted"
            dangerouslySetInnerHTML={{ __html: richHtml }}
          />
          <button onClick={() => setText('')} className="mt-1 self-end text-xs text-fg-faint hover:text-fg transition-colors">
            切换为文本编辑
          </button>
        </>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="在此粘贴或编辑文本，或直接粘贴网页内容…"
          className="mt-4 h-48 w-full resize-none rounded-lg border border-border bg-bg-elevated px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-fg-faint focus:border-accent"
        />
      )}

      {/* Toolbar */}
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button onClick={extract} disabled={!canExtract}
          className={cn('flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            canExtract ? 'bg-accent text-white hover:bg-accent-hover' : 'cursor-not-allowed bg-bg-hover text-fg-faint')}>
          {extracting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {extracting ? '提取中…' : '提取全文观点'}
        </button>

        {/* Selection extract button */}
        {selection.length > 10 && !extracting && (
          <button onClick={() => extractSelection(selection)}
            className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3.5 py-2 text-sm text-accent hover:bg-accent/20 transition-colors">
            <Sparkles size={15} />
            提取选中内容（{selection.length} 字）
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /><span className="break-words">{error}</span>
        </div>
      )}

      {/* Result area */}
      <div className="mt-6 flex-1">
        {points.length > 0 ? (
          <div className="space-y-4 pb-6">
            {/* Header + bulk save */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-fg-muted">
                共 {points.length} 条观点
                {anchoredPoints.length > 0 && `（${anchoredPoints.length} 条已标注到原文）`}
              </span>
              <button onClick={save} disabled={saving}
                className={cn('flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-3.5 py-2 text-sm transition-colors',
                  saving ? 'cursor-not-allowed opacity-60' : 'hover:bg-bg-hover')}>
                {saving ? <Loader2 size={16} className="animate-spin" /> :
                  savedCount !== null ? <Check size={16} className="text-emerald-400" /> :
                  <Save size={16} />}
                {saving ? '保存中…' : savedCount !== null ? `已保存 ${savedCount} 条` : '全部保存到知识库'}
              </button>
            </div>

            {/* Annotated text view */}
            {showAnnotated && anchoredPoints.length > 0 && (
              <div className="rounded-lg border border-border bg-bg-elevated px-6 py-5 max-h-[60vh] overflow-y-auto">
                <AnnotatedText
                  text={text}
                  points={anchoredPoints}
                  onSavePoint={handleSavePoint}
                  savedIndices={savedIndices}
                />
              </div>
            )}

            {/* Fallback cards for unmatched points */}
            {fallbackPoints.length > 0 && (
              <>
                {anchoredPoints.length > 0 && (
                  <p className="text-xs text-fg-faint">以下观点未能定位到原文，以卡片形式展示：</p>
                )}
                <AnimatePresence>
                  {fallbackPoints.map((point) => (
                    <PointCard
                      key={point.idx}
                      point={point}
                      index={point.idx}
                      onEdit={(patch) => updatePoint(point.idx, patch)}
                      onRemove={() => removePoint(point.idx)}
                    />
                  ))}
                </AnimatePresence>
              </>
            )}
          </div>
        ) : (
          !busy && (
            <div className="flex h-full min-h-32 flex-col items-center justify-center gap-1 text-sm text-fg-faint">
              <Upload size={20} className="opacity-40" />
              <span>拖拽文件、粘贴文本或网页，然后点击「提取全文观点」</span>
            </div>
          )
        )}
      </div>
    </div>
  )
}
