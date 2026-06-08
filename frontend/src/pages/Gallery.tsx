import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Image, RefreshCw, Trash2, X, ChevronDown, ChevronRight } from 'lucide-react'
import { useGalleryStore } from '@/store'
import { cn } from '@/lib/utils'
import type { GalleryItem } from '@/api/types'
import { convertFileSrc } from '@tauri-apps/api/core'
import { diagnoseGalleryFile } from '@/api'

type Granularity = 'day' | 'month' | 'year'

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const k = key(item); (acc[k] ??= []).push(item); return acc
  }, {} as Record<string, T[]>)
}

function autoGranularity(items: GalleryItem[]): Granularity {
  const days = new Set(items.map(i => i.generatedAt.slice(0, 10))).size
  if (days <= 7) return 'day'
  const months = new Set(items.map(i => i.generatedAt.slice(0, 7))).size
  if (months <= 12) return 'month'
  return 'year'
}

function describeDiagnostic(diag: Awaited<ReturnType<typeof diagnoseGalleryFile>>) {
  return [
    `exists=${diag.exists}`,
    `bytes=${diag.sizeBytes ?? 'n/a'}`,
    `size=${diag.imageWidth && diag.imageHeight ? `${diag.imageWidth}x${diag.imageHeight}` : 'n/a'}`,
    diag.error ? `error=${diag.error}` : null,
  ].filter(Boolean).join(' | ')
}

async function logImageLoadFailure(
  log: ReturnType<typeof useGalleryStore.getState>['log'],
  label: string,
  item: GalleryItem,
  filePath: string,
  assetSrc: string
) {
  log({
    level: 'error',
    message: `${label}加载失败`,
    detail: `id=${item.id} | path=${filePath || 'empty'} | asset=${assetSrc || 'empty'}`,
  })
  if (!filePath) return
  try {
    const diag = await diagnoseGalleryFile(filePath)
    log({
      level: diag.exists && !diag.error ? 'warn' : 'error',
      message: `${label}文件诊断`,
      detail: describeDiagnostic(diag),
    })
  } catch (error) {
    log({
      level: 'error',
      message: `${label}文件诊断失败`,
      detail: error instanceof Error ? error.message : String(error),
    })
  }
}

// ── Image tile ───────────────────────────────────────────────────────────────
function Tile({ item, onDelete, onClick }: { item: GalleryItem; onDelete: () => void; onClick: () => void }) {
  const { log } = useGalleryStore()
  const src = convertFileSrc(item.downloadStatus === 'ok' ? item.thumbnailPath : '')
  return (
    <div className="group relative rounded-lg overflow-hidden cursor-pointer bg-bg-elevated border border-border"
      onClick={onClick}>
      {item.downloadStatus === 'ok'
        ? <img
            src={src}
            alt={item.prompt}
            className="w-full aspect-video object-cover"
            onError={() => { void logImageLoadFailure(log, '缩略图', item, item.thumbnailPath, src) }}
          />
        : <div className="w-full aspect-video flex items-center justify-center text-xs text-fg-faint">下载失败</div>
      }
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 opacity-0 group-hover:opacity-100 transition-opacity text-white hover:bg-red-600">
        <Trash2 size={12} />
      </button>
      {item.sourcePoints.length > 0 && (
        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/85">
          <FileText size={10} />
          {item.sourcePoints.length}
        </span>
      )}
    </div>
  )
}

// ── Day stack ────────────────────────────────────────────────────────────────
function DayStack({ date, items, onSelect }: { date: string; items: GalleryItem[]; onSelect: (item: GalleryItem) => void }) {
  const [open, setOpen] = useState(false)
  const { remove, retry, log } = useGalleryStore()

  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-fg-muted mb-2 hover:text-fg transition-colors">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {date} · {items.length} 张
      </button>
      {open ? (
        <div className="grid grid-cols-2 gap-2">
          {items.map(item => (
            <div key={item.id}>
              <Tile item={item} onDelete={() => remove(item.id)} onClick={() => onSelect(item)} />
              {item.downloadStatus === 'failed' && (
                <button onClick={() => retry(item.id)}
                  className="mt-1 text-xs text-accent hover:underline">重新下载</button>
              )}
            </div>
          ))}
        </div>
      ) : (
        // stacked preview
        <div className="relative h-24 cursor-pointer" onClick={() => setOpen(true)}>
          {items.slice(0, 3).map((item, i) => (
            <div key={item.id} className="absolute rounded-lg overflow-hidden border border-border bg-bg-elevated"
              style={{ top: i * 6, left: i * 8, right: -(i * 8), zIndex: 3 - i, opacity: 1 - i * 0.2 }}>
              {item.downloadStatus === 'ok' && (
                <img
                  src={convertFileSrc(item.thumbnailPath)}
                  alt=""
                  className="w-full h-20 object-cover"
                  onError={() => { void logImageLoadFailure(log, '堆叠缩略图', item, item.thumbnailPath, convertFileSrc(item.thumbnailPath)) }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ item, onClose, onDelete }: { item: GalleryItem; onClose: () => void; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { log } = useGalleryStore()
  const src = convertFileSrc(item.filePath)
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}>
      <div className="relative max-w-4xl w-full mx-4" onClick={e => e.stopPropagation()}>
        <img
          src={src}
          alt={item.prompt}
          className="w-full rounded-xl object-contain max-h-[80vh]"
          onError={() => { void logImageLoadFailure(log, '原图', item, item.filePath, src) }}
        />
        <div className="absolute top-3 right-3 flex gap-2">
          {confirmDelete ? (
            <>
              <button onClick={() => { onDelete(); onClose() }}
                className="rounded-full bg-red-600 px-3 py-1.5 text-xs text-white">确认删除</button>
              <button onClick={() => setConfirmDelete(false)}
                className="rounded-full bg-black/60 px-3 py-1.5 text-xs text-white">取消</button>
            </>
          ) : (
            <>
              <button onClick={() => setConfirmDelete(true)}
                className="rounded-full bg-black/60 p-2 text-white hover:bg-red-600 transition-colors">
                <Trash2 size={14} />
              </button>
              <button onClick={onClose}
                className="rounded-full bg-black/60 p-2 text-white hover:bg-black/80 transition-colors">
                <X size={14} />
              </button>
            </>
          )}
        </div>
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/75">
          <p className="text-xs leading-relaxed">{item.prompt}</p>
          {item.sourcePoints.length > 0 && (
            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-white/60">
                <FileText size={12} />
                生成来源 · {item.sourcePoints.length} 个 star
              </div>
              <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1 text-[11px] leading-relaxed text-white/55 [&::-webkit-scrollbar]:hidden">
                {item.sourcePoints.map((point) => (
                  <p key={point.id} className="line-clamp-2">
                    <span className="text-white/75">{point.sourceDocName || '未命名来源'}</span>
                    <span className="mx-1 text-white/30">·</span>
                    {point.content}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function Gallery() {
  const { items, fetch, logs, clearLogs } = useGalleryStore()
  const [granularity, setGranularity] = useState<Granularity | null>(null)
  const [selected, setSelected] = useState<GalleryItem | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const { remove } = useGalleryStore()

  useEffect(() => { fetch() }, [fetch])

  const effective = granularity ?? autoGranularity(items)

  const groups = (() => {
    if (effective === 'day') return groupBy(items, i => i.generatedAt.slice(0, 10))
    if (effective === 'month') return groupBy(items, i => i.generatedAt.slice(0, 7))
    return groupBy(items, i => i.generatedAt.slice(0, 4))
  })()

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-6 py-3">
        <span className="text-sm font-medium text-fg flex-1">AI 画廊</span>
        <div className="flex gap-1">
          <button
            onClick={() => setShowLogs(value => !value)}
            className={cn('rounded px-2.5 py-1 text-xs transition-colors',
              showLogs ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:text-fg hover:bg-bg-hover')}
          >
            日志 {logs.length > 0 ? logs.length : ''}
          </button>
          {(['day', 'month', 'year'] as Granularity[]).map(g => (
            <button key={g} onClick={() => setGranularity(g === effective && granularity ? null : g)}
              className={cn('rounded px-2.5 py-1 text-xs transition-colors',
                effective === g && granularity ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:text-fg hover:bg-bg-hover')}>
              {g === 'day' ? '日' : g === 'month' ? '月' : '年'}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {showLogs && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden border-b border-border bg-bg-elevated/50"
          >
            <div className="px-6 py-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-fg-muted">生图诊断日志</p>
                <button
                  type="button"
                  onClick={clearLogs}
                  className="rounded px-2 py-1 text-xs text-fg-faint transition-colors hover:bg-bg-hover hover:text-fg"
                >
                  清空
                </button>
              </div>
              <div className="max-h-44 space-y-1 overflow-y-auto pr-1 text-[11px] leading-relaxed [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                {logs.length === 0 ? (
                  <p className="text-fg-faint">暂无日志。生成图片或图片加载失败时会记录在这里。</p>
                ) : logs.map(entry => (
                  <div
                    key={entry.id}
                    className={cn(
                      'rounded-md border px-2 py-1.5',
                      entry.level === 'error'
                        ? 'border-red-500/25 bg-red-500/8 text-red-200'
                        : entry.level === 'warn'
                          ? 'border-amber-500/25 bg-amber-500/8 text-amber-200'
                          : 'border-border bg-bg text-fg-muted'
                    )}
                  >
                    <span className="mr-2 text-fg-faint">{entry.time}</span>
                    <span>{entry.message}</span>
                    {entry.detail && <p className="mt-0.5 break-all text-fg-faint">{entry.detail}</p>}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-fg-faint">
            <div className="text-center space-y-2">
              <Image size={32} className="mx-auto opacity-30" />
              <p>暂无 AI 生成图片</p>
              <p className="text-xs">采集 ≥10 个 star 后，在圆环面板里生成图片</p>
            </div>
          </div>
        ) : Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0])).map(([key, groupItems]) => (
          <div key={key}>
            {effective === 'day'
              ? <DayStack date={key} items={groupItems} onSelect={setSelected} />
              : (
                <div>
                  <p className="text-xs font-medium text-fg-muted mb-3">{key}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {groupItems.map(item => (
                      <Tile key={item.id} item={item} onDelete={() => remove(item.id)} onClick={() => setSelected(item)} />
                    ))}
                  </div>
                </div>
              )
            }
          </div>
        ))}
      </div>

      <AnimatePresence>
        {selected && (
          <Lightbox item={selected} onClose={() => setSelected(null)}
            onDelete={() => { remove(selected.id); setSelected(null) }} />
        )}
      </AnimatePresence>
    </div>
  )
}
