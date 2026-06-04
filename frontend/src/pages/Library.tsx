import { useEffect } from 'react'
import { Loader2, AlertCircle, BookMarked } from 'lucide-react'
import { useDeepenStore, useLibraryStore } from '@/store'
import { PointTree } from '@/components/PointTree'

export default function Library() {
  const { points, loading, error, fetch } = useLibraryStore()
  const { fetchMentalModels } = useDeepenStore()

  useEffect(() => {
    fetch()
    fetchMentalModels()
  }, [fetch, fetchMentalModels])

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-8 py-10">
      <header>
        <h1 className="text-lg font-semibold">知识库</h1>
        <p className="mt-1 text-sm text-fg-muted">
          已保存的全部观点。对任意观点深挖，子观点会缩进挂在其下方。
        </p>
      </header>

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      <div className="mt-6 flex-1">
        {loading ? (
          <div className="flex h-full min-h-32 items-center justify-center gap-2 text-sm text-fg-faint">
            <Loader2 size={16} className="animate-spin" />
            加载中…
          </div>
        ) : points.length > 0 ? (
          <PointTree points={points} className="pb-6" />
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
