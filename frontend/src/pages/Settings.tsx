import { useEffect, useState } from 'react'
import { Eye, EyeOff, Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { useConfigStore } from '@/store'
import { cn } from '@/lib/utils'

const MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo']

export default function Settings() {
  const { config, loaded, fetchConfig, saveConfig } = useConfigStore()
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!loaded) fetchConfig()
  }, [loaded, fetchConfig])

  useEffect(() => {
    if (config) {
      setApiKey(config.openaiApiKey)
      setModel(config.openaiModel)
    }
  }, [config])

  const handleSave = async () => {
    await saveConfig({ openaiApiKey: apiKey, openaiModel: model })
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  const noKey = loaded && !config?.openaiApiKey

  return (
    <div className="mx-auto max-w-xl px-8 py-12">
      <h1 className="text-lg font-semibold">设置</h1>
      <p className="mt-1 text-sm text-fg-muted">
        配置 OpenAI 接入信息。密钥仅保存在本地。
      </p>

      {noKey && (
        <div className="mt-6 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-fg">
          尚未配置 API Key，AI 提取功能不可用。
        </div>
      )}

      <div className="mt-8 space-y-6">
        <div>
          <label className="text-sm font-medium">OpenAI API Key</label>
          <div className="mt-2 flex items-center gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="flex-1 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm outline-none placeholder:text-fg-faint focus:border-accent"
            />
            <button
              onClick={() => setShowKey((s) => !s)}
              className="rounded-md border border-border bg-bg-elevated p-2 text-fg-muted hover:bg-bg-hover"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">模型</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {MODELS.map((m) => (
              <option key={m} value={m} className="bg-bg-elevated">
                {m}
              </option>
            ))}
          </select>
        </div>

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleSave}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            saved
              ? 'bg-green-600 text-white'
              : 'bg-accent text-white hover:bg-accent-hover'
          )}
        >
          {saved ? <Check size={16} /> : null}
          {saved ? '已保存' : '保存'}
        </motion.button>
      </div>
    </div>
  )
}
