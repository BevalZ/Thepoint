import { useEffect, useState } from 'react'
import { Eye, EyeOff, Check, RefreshCw, X, MessageSquare, Image, Settings2, Pencil, Type, Palette, Bot, Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useConfigStore, useThemeStore, UI_FONTS, CODE_FONTS } from '@/store'
import type { ThemeMode, UiFontKey, CodeFontKey, FontSize } from '@/store'
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
type TopTab = 'ai' | 'appearance'
type AiSubTab = 'chat' | 'image' | 'advanced' | 'search' | 'commentator'

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-fg">{label}</label>
      {children}
      {hint && <p className="text-xs text-fg-faint">{hint}</p>}
    </div>
  )
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors"
      />
      <button onClick={() => setShow(s => !s)} className="rounded-lg border border-border bg-bg-elevated p-2 text-fg-muted hover:bg-bg-hover transition-colors">
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

export default function Settings() {
  const { config, loaded, fetchConfig, saveConfig, profiles, loadProfiles, saveProfiles } = useConfigStore()

  const [topTab, setTopTab] = useState<TopTab>('ai')
  const [aiTab, setAiTab] = useState<AiSubTab>('chat')

  const [providerKey, setProviderKey] = useState<ProviderKey>('openai-compat')
  const [baseUrl, setBaseUrl] = useState('')
  const [customEndpoint, setCustomEndpoint] = useState('')
  const [customProviderName, setCustomProviderName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [models, setModels] = useState<string[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetchErr, setFetchErr] = useState<string | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
  const [editingProfileName, setEditingProfileName] = useState('')

  const [imageBaseUrl, setImageBaseUrl] = useState('')
  const [imageApiKey, setImageApiKey] = useState('')
  const [imageModel, setImageModel] = useState('')
  const [imageProviderKey, setImageProviderKey] = useState<'openai-compatible' | 'gemini-image'>('openai-compatible')

  const [searchEnabled, setSearchEnabled] = useState(false)
  const [searchProviderKey, setSearchProviderKey] = useState<ProviderKey>('openai-compat')
  const [searchBaseUrl, setSearchBaseUrl] = useState('')
  const [searchCustomEndpoint, setSearchCustomEndpoint] = useState('')
  const [searchApiKey, setSearchApiKey] = useState('')
  const [searchModel, setSearchModel] = useState('')
  const [searchModels, setSearchModels] = useState<string[]>([])
  const [searchFetching, setSearchFetching] = useState(false)
  const [searchFetchErr, setSearchFetchErr] = useState<string | null>(null)

  const [commentatorName, setCommentatorName] = useState('鲁迅')
  const [commentatorStyle, setCommentatorStyle] = useState('犀利讽刺，言简意赅，擅用反讽')
  const [commentatorEmoji, setCommentatorEmoji] = useState('🧐')

  const [jsonText, setJsonText] = useState('')
  const [jsonEditing, setJsonEditing] = useState(false)
  const [jsonError, setJsonError] = useState<string | null>(null)

  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!loaded) fetchConfig()
    loadProfiles()
  }, [loaded, fetchConfig, loadProfiles])

  useEffect(() => {
    if (!config) return
    setApiKey(config.openaiApiKey)
    setModel(config.openaiModel)
    setBaseUrl(config.openaiBaseUrl)
    setProviderKey((config.providerKey as ProviderKey) || 'openai-compat')
    setCustomEndpoint(config.customEndpoint || '')
    setCustomProviderName(config.customProviderName || '')
    setImageBaseUrl(config.imageBaseUrl)
    setImageApiKey(config.imageApiKey)
    setImageModel(config.imageModel)
    setImageProviderKey((config.imageProviderKey as 'openai-compatible' | 'gemini-image') || 'openai-compatible')
    setSearchEnabled(config.searchEnabled ?? false)
    setSearchProviderKey((config.searchProviderKey as ProviderKey) || 'openai-compat')
    setSearchBaseUrl(config.searchBaseUrl || '')
    setSearchCustomEndpoint(config.searchCustomEndpoint || '')
    setSearchApiKey(config.searchApiKey || '')
    setSearchModel(config.searchModel || '')
    setCommentatorName(config.commentatorName || '鲁迅')
    setCommentatorStyle(config.commentatorStyle || '犀利讽刺，言简意赅，擅用反讽')
    setCommentatorEmoji(config.commentatorEmoji || '🧐')
    setJsonText(JSON.stringify({
      openaiApiKey: config.openaiApiKey,
      openaiModel: config.openaiModel,
      openaiBaseUrl: config.openaiBaseUrl,
      providerKey: config.providerKey,
      customEndpoint: config.customEndpoint,
      customProviderName: config.customProviderName,
      imageBaseUrl: config.imageBaseUrl,
      imageApiKey: config.imageApiKey,
      imageModel: config.imageModel,
      extraHeaders: (() => { try { return JSON.parse(config.extraHeaders || '{}') } catch { return {} } })(),
    }, null, 2))
  }, [config])

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1800) }

  const handleSave = async () => {
    await saveConfig({
      openaiApiKey: apiKey, openaiModel: model, openaiBaseUrl: baseUrl,
      imageBaseUrl, imageApiKey, imageModel,
      imageProviderKey,
      providerKey, customEndpoint, customProviderName,
      extraHeaders: config?.extraHeaders ?? '{}',
      searchEnabled, searchApiKey, searchModel, searchBaseUrl,
      searchProviderKey, searchCustomEndpoint,
      commentatorName, commentatorStyle, commentatorEmoji,
    })
    if (selectedProfileId) {
      await saveProfiles(profiles.map(p =>
        p.id === selectedProfileId ? { ...p, baseUrl, apiKey, model, imageBaseUrl, imageApiKey, imageModel } : p
      ))
    }
    flash()
  }

  const handleSaveAdvanced = async () => {
    setJsonError(null)
    try {
      const parsed = JSON.parse(jsonText)
      await saveConfig({
        openaiApiKey: parsed.openaiApiKey ?? apiKey,
        openaiModel: parsed.openaiModel ?? model,
        openaiBaseUrl: parsed.openaiBaseUrl ?? baseUrl,
        imageBaseUrl: parsed.imageBaseUrl ?? imageBaseUrl,
        imageApiKey: parsed.imageApiKey ?? imageApiKey,
        imageModel: parsed.imageModel ?? imageModel,
        imageProviderKey: parsed.imageProviderKey ?? imageProviderKey,
        providerKey: parsed.providerKey ?? providerKey,
        customEndpoint: parsed.customEndpoint ?? customEndpoint,
        customProviderName: parsed.customProviderName ?? customProviderName,
        extraHeaders: parsed.extraHeaders ? JSON.stringify(parsed.extraHeaders) : '{}',
        searchEnabled, searchApiKey, searchModel, searchBaseUrl,
        searchProviderKey, searchCustomEndpoint,
        commentatorName, commentatorStyle, commentatorEmoji,
      })
      setJsonEditing(false)
      flash()
    } catch (e: unknown) {
      setJsonError(e instanceof Error ? e.message : 'JSON 格式错误')
    }
  }

  const handleFetchModels = async () => {
    setFetching(true); setFetchErr(null)
    try {
      const list = await fetchModels(apiKey, baseUrl)
      setModels(list)
      if (list.length > 0 && !list.includes(model)) setModel(list[0])
    } catch {
      setFetchErr('获取失败，请检查 Key 和 Base URL')
    } finally {
      setFetching(false)
    }
  }

  const handleSelectProvider = (key: ProviderKey) => {
    setProviderKey(key)
    const p = PROVIDERS.find(p => p.key === key)
    if (p?.baseUrl) setBaseUrl(p.baseUrl)
  }

  const handleSelectProfile = (id: string) => {
    setSelectedProfileId(id)
    const p = profiles.find(pr => pr.id === id)
    if (p) {
      setBaseUrl(p.baseUrl); setApiKey(p.apiKey); setModel(p.model)
      setImageBaseUrl(p.imageBaseUrl ?? ''); setImageApiKey(p.imageApiKey ?? ''); setImageModel(p.imageModel ?? '')
    }
  }

  const handleSaveAsProfile = async () => {
    const newProfile: ConfigProfile = {
      id: genId(), name: '新配置', baseUrl, apiKey, model,
      imageBaseUrl: imageBaseUrl || undefined, imageApiKey: imageApiKey || undefined, imageModel: imageModel || undefined,
    }
    const updated = [...profiles, newProfile]
    await saveProfiles(updated)
    setSelectedProfileId(newProfile.id)
    setEditingProfileId(newProfile.id)
    setEditingProfileName(newProfile.name)
  }

  const handleRenameProfile = async (id: string, name: string) => {
    await saveProfiles(profiles.map(p => p.id === id ? { ...p, name } : p))
    setEditingProfileId(null)
  }

  const handleDeleteProfile = async (id: string) => {
    await saveProfiles(profiles.filter(p => p.id !== id))
    if (selectedProfileId === id) setSelectedProfileId('')
  }

  const noKey = loaded && !config?.openaiApiKey
  const currentProvider = PROVIDERS.find(p => p.key === providerKey)

  const SaveBtn = ({ onClick }: { onClick: () => void }) => (
    <motion.button whileTap={{ scale: 0.97 }} onClick={onClick}
      className={cn('flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-colors',
        saved ? 'bg-green-600 text-white' : 'bg-accent text-white hover:bg-accent-hover')}>
      {saved && <Check size={15} />}{saved ? '已保存' : '保存'}
    </motion.button>
  )

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-fg">设置</h1>
        <p className="mt-1 text-sm text-fg-muted">应用配置，密钥仅保存在本地。</p>
      </div>

      {noKey && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
          尚未配置 API Key，AI 提取功能不可用。
        </div>
      )}

      {/* Top-level tabs */}
      <div className="flex gap-1 rounded-xl bg-bg-elevated p-1 mb-8 border border-border">
        {([
          { id: 'ai', icon: <Bot size={15} />, label: 'AI 配置' },
          { id: 'appearance', icon: <Palette size={15} />, label: '外观' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTopTab(t.id)}
            className={cn('flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all',
              topTab === t.id ? 'bg-bg shadow-sm text-fg' : 'text-fg-muted hover:text-fg')}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* AI Config tab */}
      {topTab === 'ai' && (
        <div className="rounded-2xl border border-border bg-bg overflow-hidden">
          {/* Sub-tabs */}
          <div className="flex border-b border-border bg-bg-elevated/50">
            {([
              { id: 'chat', icon: <MessageSquare size={13} />, label: '聊天模型' },
              { id: 'image', icon: <Image size={13} />, label: '图片生成' },
              { id: 'search', icon: <Search size={13} />, label: '搜索模型' },
              { id: 'commentator', icon: <Bot size={13} />, label: '评论员' },
              { id: 'advanced', icon: <Settings2 size={13} />, label: '高级配置' },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setAiTab(t.id)}
                className={cn('flex items-center gap-1.5 px-5 py-3 text-sm transition-all border-b-2 -mb-px',
                  aiTab === t.id ? 'border-accent text-accent font-medium' : 'border-transparent text-fg-muted hover:text-fg')}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          <div className="p-6 space-y-6">
            {/* Chat sub-tab */}
            {aiTab === 'chat' && (
              <>
                {/* Profiles */}
                {profiles.length > 0 && (
                  <Field label="已保存配置">
                    <div className="space-y-1.5 mt-1">
                      {profiles.map(p => (
                        <div key={p.id}
                          className={cn('flex items-center gap-2 rounded-xl border px-3 py-2.5 cursor-pointer transition-all',
                            selectedProfileId === p.id ? 'border-accent bg-accent/8 shadow-sm' : 'border-border bg-bg-elevated hover:bg-bg-hover')}
                          onClick={() => handleSelectProfile(p.id)}>
                          <div className={cn('w-2 h-2 rounded-full flex-shrink-0', selectedProfileId === p.id ? 'bg-accent' : 'bg-border')} />
                          {editingProfileId === p.id ? (
                            <input autoFocus value={editingProfileName}
                              onChange={e => setEditingProfileName(e.target.value)}
                              onBlur={() => handleRenameProfile(p.id, editingProfileName || p.name)}
                              onKeyDown={e => { if (e.key === 'Enter') handleRenameProfile(p.id, editingProfileName || p.name); if (e.key === 'Escape') setEditingProfileId(null) }}
                              onClick={e => e.stopPropagation()}
                              className="flex-1 bg-transparent text-sm outline-none border-b border-accent text-fg"
                            />
                          ) : (
                            <span className={cn('flex-1 text-sm', selectedProfileId === p.id ? 'text-accent font-medium' : 'text-fg')}>{p.name}</span>
                          )}
                          <div className="flex items-center gap-1 ml-auto" onClick={e => e.stopPropagation()}>
                            <button onClick={() => { setEditingProfileId(p.id); setEditingProfileName(p.name) }}
                              className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-bg-hover transition-colors">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => handleDeleteProfile(p.id)}
                              className="p-1.5 rounded-lg text-fg-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Field>
                )}

                {/* Provider */}
                <Field label="服务商">
                  <div className="flex flex-wrap gap-2 mt-1">
                    {PROVIDERS.map(p => (
                      <button key={p.key} onClick={() => handleSelectProvider(p.key)}
                        className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                          providerKey === p.key ? 'border-accent bg-accent/10 text-accent shadow-sm' : 'border-border bg-bg-elevated text-fg-muted hover:border-fg-muted hover:text-fg')}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </Field>

                {providerKey === 'custom' ? (
                  <>
                    <Field label="供应商名称（可选）">
                      <input type="text" value={customProviderName} onChange={e => setCustomProviderName(e.target.value)}
                        placeholder="如 MyProxy"
                        className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                    </Field>
                    <Field label="完整请求地址" hint="直接填写最终 endpoint，不做 base+suffix 拼接">
                      <input type="text" value={customEndpoint} onChange={e => setCustomEndpoint(e.target.value)}
                        placeholder="https://x666.me/v1/chat/completions"
                        className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                    </Field>
                  </>
                ) : (
                  <Field label="Base URL" hint={currentProvider?.suffix ? `会自动补全 ${currentProvider.suffix}` : undefined}>
                    <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                      placeholder="https://api.openai.com"
                      className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                  </Field>
                )}

                <Field label="API Key">
                  <SecretInput value={apiKey} onChange={setApiKey} placeholder="sk-..." />
                </Field>

                <Field label="模型">
                  <div className="flex items-center justify-between mb-1.5">
                    <span />
                    <button onClick={handleFetchModels} disabled={fetching}
                      className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50 transition-colors">
                      <RefreshCw size={11} className={cn(fetching && 'animate-spin')} />
                      {fetching ? '获取中…' : '获取可用模型'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {models.length > 0 && (
                      <select value={models.includes(model) ? model : ''} onChange={e => { if (e.target.value) setModel(e.target.value) }}
                        className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none focus:border-accent">
                        {!models.includes(model) && <option value="">— 自定义 —</option>}
                        {models.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    )}
                    <input type="text" value={model} onChange={e => setModel(e.target.value)}
                      placeholder="输入模型名"
                      className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                  </div>
                  {fetchErr && <p className="mt-1 text-xs text-red-400">{fetchErr}</p>}
                  {models.length > 0 && !fetchErr && <p className="mt-1 text-xs text-fg-faint">已加载 {models.length} 个可用模型</p>}
                </Field>

                <div className="flex items-center gap-3 pt-2">
                  <SaveBtn onClick={handleSave} />
                  <button onClick={handleSaveAsProfile}
                    className="rounded-lg border border-border bg-bg-elevated px-4 py-2 text-sm text-fg-muted hover:bg-bg-hover transition-colors">
                    保存为新配置
                  </button>
                </div>
              </>
            )}

            {/* Image sub-tab */}
            {aiTab === 'image' && (
              <>
                <p className="text-sm text-fg-muted rounded-xl bg-bg-elevated border border-border px-4 py-3">
                  为图片生成功能配置独立的服务接入信息，留空则复用聊天模型配置。
                </p>
                <Field label="服务商">
                  <div className="flex gap-2 mt-1">
                    {([['openai-compatible', 'OpenAI Compatible'], ['gemini-image', 'Gemini Imagen']] as const).map(([key, label]) => (
                      <button key={key} onClick={() => setImageProviderKey(key)}
                        className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                          imageProviderKey === key ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-bg-elevated text-fg-muted hover:border-fg-muted hover:text-fg')}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-fg-faint">
                    {imageProviderKey === 'gemini-image'
                      ? '端点: {base_url}/v1beta/models/{model}:generateContent?key={api_key}'
                      : '端点: {base_url}/v1/images/generations'}
                  </p>
                </Field>
                <Field label="Image Base URL">
                  <div className="flex gap-2 mb-1.5">
                    <button
                      onClick={() => {
                        setImageProviderKey('openai-compatible')
                        setImageBaseUrl('https://narralucky.c0ffee.space')
                        setImageModel('gpt-image-1')
                      }}
                      className="rounded border border-border bg-bg-elevated px-2.5 py-1 text-xs text-fg-muted hover:border-fg-muted hover:text-fg transition-colors">
                      🎨 Narralucky
                    </button>
                  </div>
                  <input type="text" value={imageBaseUrl} onChange={e => setImageBaseUrl(e.target.value)}
                    placeholder={imageProviderKey === 'gemini-image' ? 'https://api.nanobananai.com' : '留空则复用聊天模型地址'}
                    className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                </Field>
                <Field label="Image API Key">
                  <SecretInput value={imageApiKey} onChange={setImageApiKey} placeholder="留空则复用聊天 Key" />
                </Field>
                <Field label="Image Model">
                  <input type="text" value={imageModel} onChange={e => setImageModel(e.target.value)}
                    placeholder={imageProviderKey === 'gemini-image' ? 'gemini-3-pro-image-preview' : 'dall-e-3'}
                    className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                </Field>
                <div className="pt-2"><SaveBtn onClick={handleSave} /></div>
              </>
            )}

            {/* Search sub-tab */}
            {aiTab === 'search' && (
              <>
                <div className="flex items-center justify-between rounded-xl border border-border bg-bg-elevated px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-fg">启用搜索模型</p>
                    <p className="text-xs text-fg-muted mt-0.5">深挖时自动检索相关信息并注入上下文</p>
                  </div>
                  <button
                    onClick={() => setSearchEnabled(e => !e)}
                    className={cn('relative h-6 w-11 rounded-full transition-colors', searchEnabled ? 'bg-accent' : 'bg-border')}
                  >
                    <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', searchEnabled ? 'translate-x-5' : 'translate-x-0.5')} />
                  </button>
                </div>

                {searchEnabled && (
                  <>
                    <Field label="服务商">
                      <div className="flex flex-wrap gap-2 mt-1">
                        {PROVIDERS.map(p => (
                          <button key={p.key} onClick={() => {
                            setSearchProviderKey(p.key)
                            if (p.baseUrl) setSearchBaseUrl(p.baseUrl)
                          }}
                            className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                              searchProviderKey === p.key ? 'border-accent bg-accent/10 text-accent shadow-sm' : 'border-border bg-bg-elevated text-fg-muted hover:border-fg-muted hover:text-fg')}>
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </Field>

                    {searchProviderKey === 'custom' ? (
                      <Field label="完整请求地址" hint="直接填写最终 endpoint">
                        <input type="text" value={searchCustomEndpoint} onChange={e => setSearchCustomEndpoint(e.target.value)}
                          placeholder="https://example.com/v1/chat/completions"
                          className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                      </Field>
                    ) : (
                      <Field label="Base URL">
                        <input type="text" value={searchBaseUrl} onChange={e => setSearchBaseUrl(e.target.value)}
                          placeholder="https://api.openai.com"
                          className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                      </Field>
                    )}

                    <Field label="API Key">
                      <SecretInput value={searchApiKey} onChange={setSearchApiKey} placeholder="sk-..." />
                    </Field>

                    <Field label="模型">
                      <div className="flex items-center justify-between mb-1.5">
                        <span />
                        <button onClick={async () => {
                          setSearchFetching(true); setSearchFetchErr(null)
                          try {
                            const list = await fetchModels(searchApiKey, searchBaseUrl)
                            setSearchModels(list)
                            if (list.length > 0 && !list.includes(searchModel)) setSearchModel(list[0])
                          } catch { setSearchFetchErr('获取失败，请检查 Key 和 Base URL') }
                          finally { setSearchFetching(false) }
                        }} disabled={searchFetching}
                          className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg disabled:opacity-50 transition-colors">
                          <RefreshCw size={11} className={cn(searchFetching && 'animate-spin')} />
                          {searchFetching ? '获取中…' : '获取可用模型'}
                        </button>
                      </div>
                      <div className="space-y-2">
                        {searchModels.length > 0 && (
                          <select value={searchModels.includes(searchModel) ? searchModel : ''} onChange={e => { if (e.target.value) setSearchModel(e.target.value) }}
                            className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none focus:border-accent">
                            {!searchModels.includes(searchModel) && <option value="">— 自定义 —</option>}
                            {searchModels.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        )}
                        <input type="text" value={searchModel} onChange={e => setSearchModel(e.target.value)}
                          placeholder="输入模型名"
                          className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                      </div>
                      {searchFetchErr && <p className="mt-1 text-xs text-red-400">{searchFetchErr}</p>}
                    </Field>
                  </>
                )}

                <div className="pt-2"><SaveBtn onClick={handleSave} /></div>
              </>
            )}

            {/* Commentator sub-tab */}
            {aiTab === 'commentator' && (
              <>
                <Field label="评论员名称">
                  <input value={commentatorName} onChange={e => setCommentatorName(e.target.value)}
                    placeholder="鲁迅" className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                </Field>
                <Field label="风格描述" hint="AI 将以此风格生成辣评">
                  <input value={commentatorStyle} onChange={e => setCommentatorStyle(e.target.value)}
                    placeholder="犀利讽刺，言简意赅，擅用反讽" className="w-full rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent transition-colors" />
                </Field>
                <Field label="头像 Emoji">
                  <div className="flex flex-wrap gap-2">
                    {['🧐','🤨','😤','🙃','🫠','👀','💀','🐉','🦊','🤖','📢','🎭'].map(e => (
                      <button key={e} onClick={() => setCommentatorEmoji(e)}
                        className={cn('rounded-xl border p-2 text-xl transition-all',
                          commentatorEmoji === e ? 'border-accent bg-accent/10 scale-110' : 'border-border bg-bg-elevated hover:bg-bg-hover')}>
                        {e}
                      </button>
                    ))}
                  </div>
                </Field>
                <div className="rounded-xl border border-border bg-bg-elevated px-4 py-3 flex items-start gap-3">
                  <span className="text-2xl">{commentatorEmoji}</span>
                  <div>
                    <p className="text-sm font-medium text-fg">{commentatorName || '评论员'}</p>
                    <p className="text-xs text-fg-muted mt-0.5">{commentatorStyle || '（无风格描述）'}</p>
                  </div>
                </div>
                <div className="pt-2"><SaveBtn onClick={handleSave} /></div>
              </>
            )}

            {/* Advanced sub-tab */}
            {aiTab === 'advanced' && (
              <>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-fg">配置 JSON</label>
                  <button onClick={() => { setJsonEditing(e => !e); setJsonError(null) }}
                    className="text-xs text-fg-muted hover:text-fg transition-colors">
                    {jsonEditing ? '只读模式' : '编辑模式'}
                  </button>
                </div>
                <textarea value={jsonText} onChange={e => setJsonText(e.target.value)} readOnly={!jsonEditing} rows={18}
                  className={cn('w-full rounded-xl border bg-bg-elevated px-4 py-3 font-mono text-xs outline-none resize-y transition-colors',
                    jsonEditing ? 'border-accent' : 'border-border text-fg-muted')} />
                {jsonError && <p className="text-xs text-red-400">{jsonError}</p>}
                <div className="flex items-center gap-3">
                  <button onClick={() => { try { setJsonText(JSON.stringify(JSON.parse(jsonText), null, 2)) } catch (e: unknown) { setJsonError(e instanceof Error ? e.message : 'JSON 格式错误') } }}
                    className="rounded-lg border border-border bg-bg-elevated px-4 py-2 text-sm text-fg-muted hover:bg-bg-hover transition-colors">
                    格式化
                  </button>
                  <SaveBtn onClick={handleSaveAdvanced} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Appearance tab */}
      {topTab === 'appearance' && <AppearancePanel />}
    </div>
  )
}

// ── Appearance panel ─────────────────────────────────────────────────────────

const THEME_OPTIONS: { id: ThemeMode; label: string; desc: string }[] = [
  { id: 'dark',   label: '深色', desc: '始终使用深色主题' },
  { id: 'light',  label: '浅色', desc: '始终使用浅色主题' },
  { id: 'system', label: '跟随系统', desc: '自动跟随操作系统设置' },
]

function AppearancePanel() {
  const { mode, accent, accentPresets, uiFont, codeFont, fontSize, setMode, setAccent, setUiFont, setCodeFont, setFontSize } = useThemeStore()
  const [customAccent, setCustomAccent] = useState(accent)

  return (
    <div className="space-y-6">
      {/* Theme mode */}
      <div className="rounded-2xl border border-border bg-bg overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-bg-elevated/50">
          <p className="text-sm font-medium text-fg">配色主题</p>
        </div>
        <div className="p-4 flex gap-3">
          {THEME_OPTIONS.map(opt => (
            <button key={opt.id} onClick={() => setMode(opt.id)}
              className={cn('flex-1 rounded-xl border px-4 py-3 text-left transition-all',
                mode === opt.id ? 'border-accent bg-accent/10 shadow-sm' : 'border-border bg-bg-elevated hover:bg-bg-hover')}>
              <div className={cn('text-sm font-medium', mode === opt.id ? 'text-accent' : 'text-fg')}>{opt.label}</div>
              <div className="text-xs text-fg-muted mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Accent color */}
      <div className="rounded-2xl border border-border bg-bg overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-bg-elevated/50">
          <p className="text-sm font-medium text-fg">强调色</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-3">
            {accentPresets.map(color => (
              <button key={color} onClick={() => { setAccent(color); setCustomAccent(color) }}
                title={color}
                className={cn('w-8 h-8 rounded-full border-2 transition-transform hover:scale-110',
                  accent === color ? 'border-fg scale-110' : 'border-transparent')}
                style={{ backgroundColor: color }} />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border border-border flex-shrink-0" style={{ backgroundColor: customAccent }} />
            <input type="text" value={customAccent}
              onChange={e => setCustomAccent(e.target.value)}
              onBlur={() => { if (/^#[0-9a-fA-F]{6}$/.test(customAccent)) setAccent(customAccent) }}
              onKeyDown={e => { if (e.key === 'Enter' && /^#[0-9a-fA-F]{6}$/.test(customAccent)) setAccent(customAccent) }}
              placeholder="#6366f1"
              className="w-32 rounded-lg border border-border bg-bg-elevated px-3 py-1.5 font-mono text-sm outline-none focus:border-accent transition-colors" />
            <span className="text-xs text-fg-faint">输入 hex 后 Enter 或失焦应用</span>
          </div>
        </div>
      </div>

      {/* Font */}
      <div className="rounded-2xl border border-border bg-bg overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-bg-elevated/50">
          <p className="text-sm font-medium text-fg">字体</p>
        </div>
        <div className="p-5 space-y-5">
          {/* UI font */}
          <div className="space-y-2">
            <p className="text-xs text-fg-muted">界面字体</p>
            <div className="flex gap-2">
              {UI_FONTS.map(f => (
                <button key={f.key} onClick={() => setUiFont(f.key as UiFontKey)}
                  className={cn('flex-1 rounded-xl border px-3 py-2.5 text-left transition-all',
                    uiFont === f.key ? 'border-accent bg-accent/10' : 'border-border bg-bg-elevated hover:bg-bg-hover')}>
                  <div className={cn('text-sm font-medium', uiFont === f.key ? 'text-accent' : 'text-fg')}
                    style={{ fontFamily: f.value }}>{f.label}</div>
                  <div className="text-xs text-fg-faint mt-0.5" style={{ fontFamily: f.value }}>AaBbCc 你好世界</div>
                </button>
              ))}
            </div>
          </div>
          {/* Code font */}
          <div className="space-y-2">
            <p className="text-xs text-fg-muted">代码字体</p>
            <div className="flex gap-2">
              {CODE_FONTS.map(f => (
                <button key={f.key} onClick={() => setCodeFont(f.key as CodeFontKey)}
                  className={cn('flex-1 rounded-xl border px-3 py-2.5 text-left transition-all',
                    codeFont === f.key ? 'border-accent bg-accent/10' : 'border-border bg-bg-elevated hover:bg-bg-hover')}>
                  <div className={cn('text-sm font-medium', codeFont === f.key ? 'text-accent' : 'text-fg')}
                    style={{ fontFamily: f.value }}>{f.label}</div>
                  <div className="text-xs text-fg-faint mt-0.5 font-mono" style={{ fontFamily: f.value }}>const x = 42</div>
                </button>
              ))}
            </div>
          </div>
          {/* Font size */}
          <div className="space-y-2">
            <p className="text-xs text-fg-muted">字号</p>
            <div className="flex gap-2">
              {([['sm','小','13px'],['md','中','15px'],['lg','大','17px']] as [FontSize,string,string][]).map(([id, label, px]) => (
                <button key={id} onClick={() => setFontSize(id)}
                  className={cn('flex-1 rounded-xl border px-3 py-2.5 text-center transition-all',
                    fontSize === id ? 'border-accent bg-accent/10' : 'border-border bg-bg-elevated hover:bg-bg-hover')}>
                  <span className={cn('font-medium', fontSize === id ? 'text-accent' : 'text-fg')} style={{ fontSize: px }}>{label}</span>
                  <div className="text-xs text-fg-faint mt-0.5">{px}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
