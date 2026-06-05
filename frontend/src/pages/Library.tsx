import { useEffect, useRef, useState } from 'react'
import { Loader2, AlertCircle, BookMarked, ChevronRight, FileText, Inbox, Search, X } from 'lucide-react'
import { useDeepenStore, useLibraryStore } from '@/store'
import { PointTree } from '@/components/PointTree'
import { cn } from '@/lib/utils'
import type { StoredPoint } from '@/api/types'
import { searchPoints } from '@/api'

const NO_DOC = '（无来源）'

/** Group root points by sourceDocName; children stay attached via buildTree */
function groupBySource(points: StoredPoint[]): Map<string, StoredPoint[]> {
  const map = new Map<string, StoredPoint[]>()
  for (const p of points) {
    if (p.parentId) continue // only bucket root points
    const key = p.sourceDocName ?? NO_DOC
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  return map
}

export default function Library() {
  const { points, loading, error, fetch } = useLibraryStore()
  const { fetchMentalModels } = useDeepenStore()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<StoredPoint[] | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch()
    fetchMentalModels()
  }, [fetch, fetchMentalModels])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!query.trim()) { setSearchResults(null); return }
    timerRef.current = setTimeout(() => {
      searchPoints(query).then(setSearchResults).catch(() => setSearchResults([]))
    }, 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  const toggle = (key: string) =>
    setCollapsed(s => ({ ...s, [key]: !s[key] }))

  const groups = groupBySource(points)

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-8 py-10">
      <header>
        <h1 className="text-lg font-semibold">知识库</h1>
        <p className="mt-1 text-sm text-fg-muted">
          已保存的全部观点，按来源文档分组。对任意观点深挖，子观点会缩进挂在其下方。
        </p>
      </header>

      {/* Search bar */}
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm">
        <Search size={15} className="shrink-0 text-fg-muted" />
        <input
          className="flex-1 bg-transparent text-fg outline-none placeholder:text-fg-faint"
          placeholder="搜索观点…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && (
          <button onClick={() => setQuery('')} className="shrink-0 text-fg-muted hover:text-fg">
            <X size={14} />
          </button>
        )}
      </div>

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      <div className="mt-6 flex-1">
        {searchResults !== null ? (
          searchResults.length > 0 ? (
            <div className="pb-6">
              <p className="mb-3 text-xs text-fg-faint">共 {searchResults.length} 条结果</p>
              <PointTree points={searchResults} />
            </div>
          ) : (
            <div className="flex h-full min-h-32 items-center justify-center text-sm text-fg-faint">
              无匹配结果
            </div>
          )
        ) : loading ? (
          <div className="flex h-full min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
            <Loader2 size={16} className="animate-spin" />
            加载中…
          </div>
        ) : groups.size > 0 ? (
          <div className="space-y-3 pb-6">
            {[...groups.entries()].map(([source, rootPoints]) => {
              const rootIds = new Set(rootPoints.map(p => p.id))
              const groupPoints = points.filter(p => {
                if (rootIds.has(p.id)) return true
                let cur: StoredPoint | undefined = p
                while (cur?.parentId) {
                  const parent = points.find(x => x.id === cur!.parentId)
                  if (!parent) break
                  if (rootIds.has(parent.id)) return true
                  cur = parent
                }
                return false
              })

              const isOpen = !collapsed[source]
              return (
                <div key={source} className="rounded-xl border border-border overflow-hidden">
                  <button
                    onClick={() => toggle(source)}
                    className="flex w-full items-center gap-3 px-4 py-3 bg-bg-elevated hover:bg-bg-hover transition-colors text-left"
                  >
                    <ChevronRight
                      size={15}
                      className={cn('shrink-0 text-fg-muted transition-transform', isOpen && 'rotate-90')}
                    />
                    {source === NO_DOC
                      ? <Inbox size={15} className="shrink-0 text-fg-faint" />
                      : <FileText size={15} className="shrink-0 text-accent" />
                    }
                    <span className="flex-1 truncate text-sm font-medium text-fg">{source}</span>
                    <span className="text-xs text-fg-faint shrink-0">{rootPoints.length} 条</span>
                  </button>
                  {isOpen && (
                    <div className="px-4 py-4 bg-bg">
                      <PointTree points={groupPoints} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-sm text-fg-faint">
            <BookMarked size={24} className="opacity-50" />
            还没有保存任何观点。去「探索」页提取并保存吧。
          </div>
        )}
      </div>
    </div>
  )
}
