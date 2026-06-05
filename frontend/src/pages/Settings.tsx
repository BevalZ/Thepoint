import { useEffect, useState } from 'react'
import { Eye, EyeOff, Check, RefreshCw, X, MessageSquare, Image, Settings2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useConfigStore } from '@/store'
import { fetchModels } from '@/api'
import { cn } from '@/lib/utils'
import type { ConfigProfile } from '@/api/types'

const PROVIDERS = [
  { key: 'openai-compat', label: 'OpenAI compatible', baseUrl: 'https://api.openai.com', suffix: '/v1/chat/completions' },
  { key: 'anthropic-compat', label: 'Anthropic compatible', baseUrl: 'https://api.anthropic.com', suffix: '/v1/messages' },
  { key: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', suffix: '/v1/chat/completions' },
  { key: 'grok', label: 'Grok', baseUrl: 'https://api.x.ai', suffix: '/v1/chat/completions' },
  { key: 'qwen', label: 'Qwen', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode', suffix: '/v1/chat/completions' },
  { key: 'gemini', label: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', suffix: '/v1/chat/completions' },
  { key: 'kimi', label: 'Kimi', baseUrl: 'https://api.moonshot.cn', suffix: '/v1/chat/completions' },
  { key: 'custom', label: '自定义', baseUrl: '', suffix: '' },
] as const

type ProviderKey = typeof PROVIDERS[number]['key']

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function Settings() {
  const { config, loaded, fetchConfig, saveConfig, profiles, loadProfiles, saveProfiles } = useConfigStore()

  const [tab, setTab] = useState<'chat' | 'image' | 'advanced'>('chat')

  // Chat tab state
  const [providerKey, setProviderKey] = useState<ProviderKey>('openai-compat')
  const [baseUrl, setBaseUrl] = useState('')
  const [customEndpoint, setCustomEndpoint] = useState('')
  const [customProviderName, setCustomProviderName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [showKey, setShowKey] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchErr, setFetchErr] = useState<string | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState('')

  // Image tab state
  const [imageBaseUrl, setImageBaseUrl] = useState('')
  const [imageApiKey, setImageApiKey] = useState('')
  const [imageModel, setImageModel] = useState('')
  const [showImageKey, setShowImageKey] = useState(false)

  // Advanced tab state
  const [jsonText, setJsonText] = useState('')
  const [jsonEditing, setJsonEditing] = useState(false)
  const [jsonError, setJsonError] = useState<string | null>(null)

  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!loaded) fetchConfig()
    loadProfiles()
  }, [loaded, fetchConfig, loadProfiles])

  useEffect(() => {
    if (config) {
      setApiKey(config.openaiApiKey)
      setModel(config.openaiModel)
      setBaseUrl(config.openaiBaseUrl)
      setProviderKey((config.providerKey as ProviderKey) || 'openai-compat')
      setCustomEndpoint(config.customEndpoint || '')
      setCustomProviderName(config.customProviderName || '')
      setImageBaseUrl(config.imageBaseUrl)
      setImageApiKey(config.imageApiKey)
      setImageModel(config.imageModel)
      // Build JSON text for advanced tab
      const fullConfig = {
        openaiApiKey: config.openaiApiKey,
        openaiModel: config.openaiModel,
        openaiBaseUrl: config.openaiBaseUrl,
        providerKey: config.providerKey,
        customEndpoint: config.customEndpoint,
        customProviderName: config.customProviderName,
        imageBaseUrl: config.imageBaseUrl,
        imageApiKey: config.imageApiKey,
        imageModel: config.imageModel,
        extraHeaders: (() => {
          try { return JSON.parse(config.extraHeaders || '{}') } catch { return {} }
        })(),
      }
      setJsonText(JSON.stringify(fullConfig, null, 2))
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
      providerKey,
      customEndpoint,
      customProviderName,
      extraHeaders: config?.extraHeaders ?? '{}',
    })
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

  const handleSaveAdvanced = async () => {
    setJsonError(null)
    try {
      const parsed = JSON.parse(jsonText)
      const extraHeaders = parsed.extraHeaders
        ? JSON.stringify(parsed.extraHeaders)
        : '{}'
      await saveConfig({
        openaiApiKey: parsed.openaiApiKey ?? apiKey,
        openaiModel: parsed.openaiModel ?? model,
        openaiBaseUrl: parsed.openaiBaseUrl ?? baseUrl,
        imageBaseUrl: parsed.imageBaseUrl ?? imageBaseUrl,
        imageApiKey: parsed.imageApiKey ?? imageApiKey,
        imageModel: parsed.imageModel ?? imageModel,
        providerKey: parsed.providerKey ?? providerKey,
        customEndpoint: parsed.customEndpoint ?? customEndpoint,
        customProviderName: parsed.customProviderName ?? customProviderName,
        extraHeaders,
      })
      setJsonEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
    } catch (e: unknown) {
      setJsonError(typeof e === 'string' ? e : (e instanceof Error ? e.message : 'JSON 格式错误'))
    }
  }

  const handleFormatJson = () => {
    setJsonError(null)
    try {
      setJsonText(JSON.stringify(JSON.parse(jsonText), null, 2))
    } catch (e: unknown) {
      setJsonError(typeof e === 'string' ? e : (e instanceof Error ? e.message : 'JSON 格式错误'))
    }
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

  const handleSelectProvider = (key: ProviderKey) => {
    setProviderKey(key)
    const p = PROVIDERS.find(p => p.key === key)
    if (p && p.baseUrl) setBaseUrl(p.baseUrl)
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
    await saveProfiles([...profiles, newProfile])
    setSelectedProfileId(newProfile.id)
  }

  const handleDeleteProfile = async (id: string) => {
    await saveProfiles(profiles.filter(p => p.id !== id))
    if (selectedProfileId === id) setSelectedProfileId('')
  }

  const noKey = loaded && !config?.openaiApiKey
  const currentProvider = PROVIDERS.find(p => p.key === providerKey)

  return (
    <div className="mx-auto max-w-xl px-8 py-12">
      <h1 className="text-lg font-semibold">设置</h1>
      <p className="mt-1 text-sm text-fg-muted">配置 AI 接入信息。密钥仅保存在本地。</p>

      {noKey && (
        <div className="mt-6 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-fg">
          尚未配置 API Key，AI 提取功能不可用。
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-border">
        {([
          { id: 'chat', icon: <MessageSquare size={14} />, label: '聊天模型' },
          { id: 'image', icon: <Image size={14} />, label: '图片生成' },
          { id: 'advanced', icon: <Settings2 size={14} />, label: '高级配置' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-sm transition-colors border-b-2 -mb-px',
              tab === t.id
                ? 'border-accent text-accent font-medium'
                : 'border-transparent text-fg-muted hover:text-fg'
            )}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-6">

        {/* Tab 1: Chat model */}
        {tab === 'chat' && (
          <>
            {/* Profiles */}
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

            {/* Provider buttons */}
            <div>
              <label className="text-sm font-medium">服务商</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROVIDERS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => handleSelectProvider(p.key)}
                    className={cn(
                      'rounded-md border px-3 py-1.5 text-xs transition-colors',
                      providerKey === p.key
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border bg-bg-elevated text-fg-muted hover:bg-bg-hover'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom provider inputs */}
            {providerKey === 'custom' ? (
              <>
                <div>
                  <label className="text-sm font-medium">供应商名称（可选）</label>
                  <input
                    type="text"
                    value={customProviderName}
                    onChange={e => setCustomProviderName(e.target.value)}
                    placeholder="如 MyProxy"
                    className="mt-2 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">完整请求地址</label>
                  <input
                    type="text"
                    value={customEndpoint}
                    onChange={e => setCustomEndpoint(e.target.value)}
                    placeholder="https://x666.me/v1/chat/completions"
                    className="mt-2 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
                  />
                  <p className="mt-1 text-xs text-fg-faint">直接填写最终 endpoint，不做 base+suffix 拼接</p>
                </div>
              </>
            ) : (
              <div>
                <label className="text-sm font-medium">Base URL</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com"
                  className="mt-2 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
                />
                {currentProvider?.suffix && (
                  <p className="mt-1 text-xs text-fg-faint">会自动补全 {currentProvider.suffix}</p>
                )}
              </div>
            )}

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

            {/* Model */}
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
                  <select
                    value={models.includes(model) ? model : ''}
                    onChange={e => { if (e.target.value) setModel(e.target.value) }}
                    className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm outline-none focus:border-accent"
                  >
                    {!models.includes(model) && <option value="">— 自定义 —</option>}
                    {models.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
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
          </>
        )}

        {/* Tab 2: Image generation */}
        {tab === 'image' && (
          <>
            <p className="text-sm text-fg-muted">为图片生成功能配置独立的服务接入信息（预留）。</p>
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
          </>
        )}

        {/* Tab 3: Advanced / JSON editor */}
        {tab === 'advanced' && (
          <>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">配置 JSON</label>
              <button
                onClick={() => { setJsonEditing(e => !e); setJsonError(null) }}
                className="text-xs text-fg-muted hover:text-fg transition-colors"
              >
                {jsonEditing ? '只读模式' : '编辑模式'}
              </button>
            </div>
            <textarea
              value={jsonText}
              onChange={e => setJsonText(e.target.value)}
              readOnly={!jsonEditing}
              rows={18}
              className={cn(
                'w-full rounded-md border bg-bg-elevated px-3 py-2 font-mono text-xs outline-none resize-y',
                jsonEditing ? 'border-accent' : 'border-border text-fg-muted',
              )}
            />
            {jsonError && <p className="text-xs text-red-400">{jsonError}</p>}
            <div className="flex items-center gap-3">
              <button
                onClick={handleFormatJson}
                className="rounded-md border border-border bg-bg-elevated px-4 py-2 text-sm text-fg-muted hover:bg-bg-hover transition-colors"
              >
                格式化
              </button>
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={handleSaveAdvanced}
                className={cn(
                  'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                  saved ? 'bg-green-600 text-white' : 'bg-accent text-white hover:bg-accent-hover'
                )}
              >
                {saved && <Check size={16} />}
                {saved ? '已保存' : '保存配置'}
              </motion.button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
