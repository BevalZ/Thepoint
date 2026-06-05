import { useEffect, useState } from 'react'
import { Eye, EyeOff, Check, RefreshCw, ChevronDown, ChevronRight, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useConfigStore } from '@/store'
import { fetchModels } from '@/api'
import { cn } from '@/lib/utils'
import type { ConfigProfile } from '@/api/types'

const PROVIDERS = [
  { label: 'OpenAI', baseUrl: 'https://api.openai.com' },
  { label: 'xAI / Grok', baseUrl: 'https://api.x.ai' },
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
  { label: 'Qwen / 通义', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode' },
  { label: 'Gemini (OpenAI compat)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  { label: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn' },
  { label: '自定义', baseUrl: '' },
] as const

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function Settings() {
  const { config, loaded, fetchConfig, saveConfig, profiles, loadProfiles, saveProfiles } = useConfigStore()

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [baseUrl, setBaseUrl] = useState('')
  const [imageBaseUrl, setImageBaseUrl] = useState('')
  const [imageApiKey, setImageApiKey] = useState('')
  const [imageModel, setImageModel] = useState('')

  const [showKey, setShowKey] = useState(false)
  const [showImageKey, setShowImageKey] = useState(false)
  const [imageExpanded, setImageExpanded] = useState(false)
  const [saved, setSaved] = useState(false)

  const [models, setModels] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchErr, setFetchErr] = useState<string | null>(null)

  const [selectedProfileId, setSelectedProfileId] = useState('')

  useEffect(() => {
    if (!loaded) fetchConfig()
    loadProfiles()
  }, [loaded, fetchConfig, loadProfiles])

  useEffect(() => {
    if (config) {
      setApiKey(config.openaiApiKey)
      setModel(config.openaiModel)
      setBaseUrl(config.openaiBaseUrl)
      setImageBaseUrl(config.imageBaseUrl)
      setImageApiKey(config.imageApiKey)
      setImageModel(config.imageModel)
    }
  }, [config])

  const handleSave = async () => {
    await saveConfig({
      openaiApiKey: apiKey,
      openaiModel: model,
      openaiBaseUrl: baseUrl,
      imageBaseUrl,
      imageApiKey,
      imageModel,
    })
    // update selected profile if one is active
    if (selectedProfileId) {
      const updated = profiles.map(p =>
        p.id === selectedProfileId
          ? { ...p, baseUrl, apiKey, model, imageBaseUrl, imageApiKey, imageModel }
          : p
      )
      await saveProfiles(updated)
    }
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

  const handleSelectProfile = (id: string) => {
    setSelectedProfileId(id)
    const p = profiles.find(pr => pr.id === id)
    if (p) {
      setBaseUrl(p.baseUrl)
      setApiKey(p.apiKey)
      setModel(p.model)
      setImageBaseUrl(p.imageBaseUrl ?? '')
      setImageApiKey(p.imageApiKey ?? '')
      setImageModel(p.imageModel ?? '')
    }
  }

  const handleSaveAsProfile = async () => {
    const name = prompt('输入配置名称')?.trim()
    if (!name) return
    const newProfile: ConfigProfile = {
      id: genId(),
      name,
      baseUrl,
      apiKey,
      model,
      imageBaseUrl: imageBaseUrl || undefined,
      imageApiKey: imageApiKey || undefined,
      imageModel: imageModel || undefined,
    }
    const updated = [...profiles, newProfile]
    await saveProfiles(updated)
    setSelectedProfileId(newProfile.id)
  }

  const handleDeleteProfile = async (id: string) => {
    const updated = profiles.filter(p => p.id !== id)
    await saveProfiles(updated)
    if (selectedProfileId === id) setSelectedProfileId('')
  }

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

        {/* Multi-profile management */}
        {profiles.length > 0 && (
          <div>
            <label className="text-sm font-medium">已保存配置</label>
            <div className="mt-2 flex flex-col gap-1">
              {profiles.map(p => (
                <div
                  key={p.id}
                  className={cn(
                    'flex items-center justify-between rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors',
                    selectedProfileId === p.id
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-bg-elevated text-fg hover:bg-bg-hover'
                  )}
                  onClick={() => handleSelectProfile(p.id)}
                >
                  <span>{p.name}</span>
                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteProfile(p.id) }}
                    className="ml-2 text-fg-muted hover:text-fg"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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

        {/* Model — native select when models loaded, plus text input */}
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

          <div className="mt-2 space-y-2">
            {models.length > 0 && (
              <div className="relative">
                <select
                  value={models.includes(model) ? model : ''}
                  onChange={e => { if (e.target.value) setModel(e.target.value) }}
                  className="w-full appearance-none rounded-md border border-border bg-bg-elevated px-3 py-2 pr-8 text-sm outline-none focus:border-accent"
                >
                  {!models.includes(model) && (
                    <option value="">— 自定义 —</option>
                  )}
                  {models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted" />
              </div>
            )}
            <input
              type="text"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="输入模型名"
              className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
            />
          </div>

          {fetchErr && <p className="mt-1 text-xs text-red-400">{fetchErr}</p>}
          {models.length > 0 && !fetchErr && (
            <p className="mt-1 text-xs text-fg-faint">已加载 {models.length} 个可用模型</p>
          )}
        </div>

        {/* Image model section (collapsible) */}
        <div>
          <button
            onClick={() => setImageExpanded(s => !s)}
            className="flex items-center gap-1.5 text-sm font-medium text-fg-muted hover:text-fg transition-colors"
          >
            {imageExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            生图模型（可选）
          </button>

          {imageExpanded && (
            <div className="mt-3 space-y-4">
              <div>
                <label className="text-sm font-medium">Image Base URL</label>
                <input
                  type="text"
                  value={imageBaseUrl}
                  onChange={e => setImageBaseUrl(e.target.value)}
                  placeholder="留空则复用聊天模型地址"
                  className="mt-2 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Image API Key</label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type={showImageKey ? 'text' : 'password'}
                    value={imageApiKey}
                    onChange={e => setImageApiKey(e.target.value)}
                    placeholder="留空则复用聊天 Key"
                    className="flex-1 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
                  />
                  <button
                    onClick={() => setShowImageKey(s => !s)}
                    className="rounded-md border border-border bg-bg-elevated p-2 text-fg-muted hover:bg-bg-hover"
                  >
                    {showImageKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Image Model</label>
                <input
                  type="text"
                  value={imageModel}
                  onChange={e => setImageModel(e.target.value)}
                  placeholder="gpt-image-1、imagen-3 等"
                  className="mt-2 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
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
          <button
            onClick={handleSaveAsProfile}
            className="rounded-md border border-border bg-bg-elevated px-4 py-2 text-sm text-fg-muted hover:bg-bg-hover transition-colors"
          >
            保存为新配置
          </button>
        </div>
      </div>
    </div>
  )
}
