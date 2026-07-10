import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Command, Loader2, Search, ShieldCheck, X } from 'lucide-react'
import { listCommandPaletteItems } from '@/api'
import type { CommandPaletteItem, CommandPaletteManifest } from '@/api/types'
import { commandPresentation, filterCommandPaletteItems } from '@/lib/capabilityCenter'
import { cn } from '@/lib/utils'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onSelect: (item: CommandPaletteItem) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function CommandPalette({ open, onClose, onSelect }: CommandPaletteProps) {
  const [manifest, setManifest] = useState<CommandPaletteManifest | null>(null)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo(
    () => filterCommandPaletteItems(manifest?.items ?? [], query),
    [manifest, query]
  )

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setManifest(await listCommandPaletteItems())
    } catch (loadError) {
      setManifest(null)
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIndex(0)
    void load()
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((index) => items.length ? (index + 1) % items.length : 0)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((index) => items.length ? (index - 1 + items.length) % items.length : 0)
        return
      }
      if (event.key === 'Enter' && items[selectedIndex]) {
        event.preventDefault()
        onSelect(items[selectedIndex])
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [items, onClose, onSelect, open, selectedIndex])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={onClose}
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="全局命令面板"
        className="flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border-strong bg-bg-elevated shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
          <Search size={16} className="shrink-0 text-fg-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-faint"
            placeholder="搜索能力、命令或工作流"
            aria-label="搜索命令"
          />
          <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-[10px] text-fg-faint">ESC</kbd>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-bg-hover hover:text-fg"
            title="关闭命令面板"
          >
            <X size={14} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading && !manifest && (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-fg-muted">
              <Loader2 size={16} className="animate-spin" />加载命令目录…
            </div>
          )}

          {error && !loading && (
            <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-6 text-center">
              <AlertTriangle size={18} className="text-amber-400" />
              <p className="text-sm text-fg-muted">命令目录加载失败：{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-fg hover:bg-bg-hover"
              >
                重新加载
              </button>
            </div>
          )}

          {!loading && !error && manifest && items.length === 0 && (
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-sm text-fg-faint">
              <Command size={18} />
              <span>{query ? '没有匹配的命令。' : '当前没有可展示的命令。'}</span>
            </div>
          )}

          {items.map((item, index) => {
            const presentation = commandPresentation(item)
            const selected = index === selectedIndex
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => onSelect(item)}
                aria-selected={selected}
                className={cn(
                  'flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors',
                  selected ? 'bg-bg-hover text-fg' : 'text-fg-muted hover:bg-bg-hover/70 hover:text-fg'
                )}
              >
                <span className={cn(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
                  presentation.tone === 'safe' && 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
                  presentation.tone === 'attention' && 'border-amber-500/25 bg-amber-500/10 text-amber-400',
                  presentation.tone === 'restricted' && 'border-rose-500/25 bg-rose-500/10 text-rose-400'
                )}>
                  {presentation.tone === 'safe' ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{item.title}</span>
                    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-fg-faint">
                      {presentation.label}
                    </span>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-fg-faint">
                    {item.description}
                  </span>
                </span>
                <span className="mt-1 shrink-0 font-mono text-[10px] text-fg-faint">{item.category}</span>
              </button>
            )
          })}
        </div>

        <footer className="flex h-9 shrink-0 items-center justify-between border-t border-border px-4 text-[10px] text-fg-faint">
          <span>↑↓ 选择 · Enter 打开 · Esc 关闭</span>
          <span>{manifest ? `${items.length} / ${manifest.itemCount}` : '类型化命令目录'}</span>
        </footer>
      </section>
    </div>
  )
}
