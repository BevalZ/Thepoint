import { AnimatePresence } from 'framer-motion'
import { open } from '@tauri-apps/plugin-dialog'
import { FileText, Loader2, Sparkles, AlertCircle, Save, Check } from 'lucide-react'
import { useConfigStore, useExploreStore } from '@/store'
import { PointCard } from '@/components/PointCard'
import { cn } from '@/lib/utils'

export default function Explore() {
  const {
    text,
    sourceName,
    points,
    parsing,
    extracting,
    saving,
    savedCount,
    error,
    setText,
    parseFile,
    extract,
    save,
  } = useExploreStore()
  const { config, loaded } = useConfigStore()

  const noKey = loaded && !config?.openaiApiKey
  const busy = parsing || extracting || saving
  const canExtract = text.trim().length > 0 && !busy

  const handlePick = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        { name: '文档', extensions: ['pdf', 'txt', 'md', 'markdown'] },
      ],
    })
    if (typeof selected === 'string') {
      await parseFile(selected)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-8 py-10">
      <header>
        <h1 className="text-lg font-semibold">探索</h1>
        <p className="mt-1 text-sm text-fg-muted">
          选择文件或粘贴文本，提取其中的关键观点。
        </p>
      </header>

      {noKey && (
        <div className="mt-5 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-fg">
          尚未配置 API Key，请先到「设置」页填写后再提取。
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handlePick}
          disabled={busy}
          className={cn(
            'flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-3.5 py-2 text-sm transition-colors',
            busy
              ? 'cursor-not-allowed opacity-60'
              : 'hover:bg-bg-hover'
          )}
        >
          {parsing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <FileText size={16} />
          )}
          {parsing ? '解析中…' : '选择文件'}
        </button>
        {sourceName && (
          <span className="truncate text-sm text-fg-muted">{sourceName}</span>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="在此粘贴或编辑文本…"
        className="mt-4 h-48 w-full resize-none rounded-lg border border-border bg-bg-elevated px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-fg-faint focus:border-accent"
      />

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={extract}
          disabled={!canExtract}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            canExtract
              ? 'bg-accent text-white hover:bg-accent-hover'
              : 'cursor-not-allowed bg-bg-hover text-fg-faint'
          )}
        >
          {extracting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {extracting ? '提取中…' : '提取观点'}
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      <div className="mt-6 flex-1">
        {points.length > 0 ? (
          <div className="space-y-3 pb-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-fg-muted">
                共 {points.length} 条观点
              </span>
              <button
                onClick={save}
                disabled={saving}
                className={cn(
                  'flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-3.5 py-2 text-sm transition-colors',
                  saving
                    ? 'cursor-not-allowed opacity-60'
                    : 'hover:bg-bg-hover'
                )}
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : savedCount !== null ? (
                  <Check size={16} className="text-emerald-400" />
                ) : (
                  <Save size={16} />
                )}
                {saving
                  ? '保存中…'
                  : savedCount !== null
                    ? `已保存 ${savedCount} 条`
                    : '保存到知识库'}
              </button>
            </div>
            <AnimatePresence>
              {points.map((point, i) => (
                <PointCard key={i} point={point} index={i} />
              ))}
            </AnimatePresence>
          </div>
        ) : (
          !busy && (
            <div className="flex h-full min-h-32 items-center justify-center text-sm text-fg-faint">
              提取后，关键观点会以卡片形式展示在这里。
            </div>
          )
        )}
      </div>
    </div>
  )
}
