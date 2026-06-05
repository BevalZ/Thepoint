import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Check, RefreshCw, ChevronDown } from 'lucide-react'
import { motion } from 'framer-motion'
import { useConfigStore } from '@/store'
import { fetchModels } from '@/api'
import { cn } from '@/lib/utils'

const PROVIDERS = [
  { label: 'OpenAI', baseUrl: 'https://api.openai.com' },
  { label: 'xAI / Grok', baseUrl: 'https://api.x.ai' },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
  { label: 'Qwen / 通义', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode' },
  { label: 'Gemini (OpenAI compat)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { label: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn' },
  { label: '自定义', baseUrl: '' },
] as const

export default function Settings() {
  const { config, loaded, fetchConfig, saveConfig } = useConfigStore()
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [baseUrl, setBaseUrl] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchErr, setFetchErr] = useState<string | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const sugRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loaded) fetchConfig()
  }, [loaded, fetchConfig])

  useEffect(() => {
    if (config) {
      setApiKey(config.openaiApiKey)
      setModel(config.openaiModel)
      setBaseUrl(config.openaiBaseUrl)
    }
  }, [config])

  // close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sugRef.current && !sugRef.current.contains(e.target as Node)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSave = async () => {
    await saveConfig({ openaiApiKey: apiKey, openaiModel: model, openaiBaseUrl: baseUrl })
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  const handleFetchModels = async () => {
    setFetching(true); setFetchErr(null)
    try {
      const list = await fetchModels(apiKey, baseUrl)
      setModels(list)
      if (list.length > 0 && !list.includes(model)) setModel(list[0])
    } catch (e: unknown) {
      setFetchErr(typeof e === 'string' ? e : '获取失败，请检查 Key 和 Base URL')
    } finally {
      setFetching(false)
    }
  }

  const filteredSuggestions = models.filter(m =>
    m.toLowerCase().includes(model.toLowerCase())
  )

  const noKey = loaded && !config?.openaiApiKey

  return (
    <div className="mx-auto max-w-xl px-8 py-12">
      <h1 className="text-lg font-semibold">设置</h1>
      <p className="mt-1 text-sm text-fg-muted">配置 AI 接入信息。密钥仅保存在本地。</p>

      {noKey && (
        <div className="mt-6 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-fg">
          尚未配置 API Key，AI 提取功能不可用。
        </div>
      )}

      <div className="mt-8 space-y-6">

        {/* Provider presets */}
        <div>
          <label className="text-sm font-medium">服务商</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {PROVIDERS.map(p => (
              <button
                key={p.label}
                onClick={() => { if (p.baseUrl) setBaseUrl(p.baseUrl) }}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs transition-colors',
                  baseUrl === p.baseUrl && p.baseUrl
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-bg-elevated text-fg-muted hover:bg-bg-hover'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Base URL */}
        <div>
          <label className="text-sm font-medium">Base URL</label>
          <input
            type="text"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com（留空使用默认）"
            className="mt-2 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
          />
          <p className="mt-1 text-xs text-fg-faint">会自动补全 /v1/chat/completions，无需手动填写路径</p>
        </div>

        {/* API Key */}
        <div>
          <label className="text-sm font-medium">API Key</label>
          <div className="mt-2 flex items-center gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="flex-1 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
            />
            <button
              onClick={() => setShowKey(s => !s)}
              className="rounded-md border border-border bg-bg-elevated p-2 text-fg-muted hover:bg-bg-hover"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Model — combo (text input + datalist / fetched dropdown) */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">模型</label>
            <button
              onClick={handleFetchModels}
              disabled={fetching}
              className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={12} className={cn(fetching && 'animate-spin')} />
              {fetching ? '获取中…' : '获取可用模型'}
            </button>
          </div>

          <div className="relative mt-2" ref={sugRef}>
            <input
              type="text"
              value={model}
              onChange={e => { setModel(e.target.value); setShowSuggestions(true) }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="输入或选择模型名"
              className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 pr-8 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
            />
            {models.length > 0 && (
              <button
                onClick={() => setShowSuggestions(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted"
              >
                <ChevronDown size={14} />
              </button>
            )}
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-border bg-bg-elevated shadow-lg">
                {filteredSuggestions.map(m => (
                  <button
                    key={m}
                    onMouseDown={() => { setModel(m); setShowSuggestions(false) }}
                    className={cn(
                      'block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-bg-hover',
                      m === model ? 'text-accent' : 'text-fg'
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>

          {fetchErr && <p className="mt-1 text-xs text-red-400">{fetchErr}</p>}
          {models.length > 0 && !fetchErr && (
            <p className="mt-1 text-xs text-fg-faint">已加载 {models.length} 个可用模型</p>
          )}
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleSave}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            saved ? 'bg-green-600 text-white' : 'bg-accent text-white hover:bg-accent-hover'
          )}
        >
          {saved && <Check size={16} />}
          {saved ? '已保存' : '保存'}
        </motion.button>
      </div>
    </div>
  )
}
