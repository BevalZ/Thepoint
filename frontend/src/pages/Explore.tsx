import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { open } from '@tauri-apps/plugin-dialog'
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Calendar,
  Clipboard,
  Database,
  ExternalLink,
  FileText,
  Globe,
  Hash,
  Images,
  Info,
  Link,
  Loader2,
  RotateCcw,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useConfigStore, useExploreHistoryStore, useExploreStore, useStarStore } from '@/store'
import { cn } from '@/lib/utils'
import { useStarFly } from '@/hooks/useStarFly'
import { describeImage, savePoints } from '@/api'
import type { AppConfig, ChunkCard, ExploreHistoryItem, ExploreSourceMetadata } from '@/api/types'

const URL_RE = /^https?:\/\/[^\s]+$/
const SUPPORTED_EXTS = ['txt','md','markdown','rst','csv','docx','odt','html','htm']
const BLOCK_PREVIEW_LIMIT = 320
const INFO_BLOCK_MIN_CHARS = 200
const INFO_BLOCK_MAX_CHARS = 400
const STAGE_GAP = 150
const STAGE_WINDOW = 3
const STAGE_ADVANCE_MS = 720
const STAGE_CATCHUP_MS = 260
const RESULT_REVEAL_START_MS = 180
const RESULT_REVEAL_MS = 180
const ORBIT_DOTS = [
  'rotate-0',
  'rotate-[36deg]',
  'rotate-[72deg]',
  'rotate-[108deg]',
  'rotate-[144deg]',
  'rotate-180',
  'rotate-[216deg]',
  'rotate-[252deg]',
  'rotate-[288deg]',
  'rotate-[324deg]',
]
const STATUS_DOTS = Array.from({ length: 5 }, (_, index) => index)
const STAR_BURST = [
  { x: -24, y: -16, rotate: -28, size: 7 },
  { x: 18, y: -22, rotate: 22, size: 6 },
  { x: 28, y: 2, rotate: 44, size: 5 },
  { x: -18, y: 18, rotate: -46, size: 5 },
  { x: 4, y: 27, rotate: 12, size: 6 },
]
const CONFETTI_PIECES = [
  { x: -240, y: -120, r: -160, c: 'bg-amber-300', w: 7, h: 18, d: 0 },
  { x: -198, y: -52, r: 140, c: 'bg-cyan-300', w: 5, h: 16, d: 0.03 },
  { x: -166, y: 88, r: -90, c: 'bg-fuchsia-300', w: 8, h: 12, d: 0.06 },
  { x: -126, y: -154, r: 110, c: 'bg-emerald-300', w: 6, h: 18, d: 0.02 },
  { x: -88, y: 136, r: -130, c: 'bg-sky-300', w: 7, h: 14, d: 0.08 },
  { x: -42, y: -108, r: 180, c: 'bg-rose-300', w: 5, h: 18, d: 0.05 },
  { x: 0, y: 118, r: -180, c: 'bg-amber-300', w: 8, h: 13, d: 0.01 },
  { x: 46, y: -148, r: 120, c: 'bg-lime-300', w: 6, h: 16, d: 0.07 },
  { x: 92, y: 96, r: -110, c: 'bg-cyan-300', w: 5, h: 15, d: 0.04 },
  { x: 132, y: -76, r: 160, c: 'bg-fuchsia-300', w: 7, h: 17, d: 0.09 },
  { x: 176, y: 46, r: -150, c: 'bg-emerald-300', w: 8, h: 12, d: 0.02 },
  { x: 226, y: -126, r: 95, c: 'bg-rose-300', w: 6, h: 18, d: 0.05 },
]

type SourceBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; src: string; alt: string; caption: string | null }

type SourceResultItem =
  | { block: Extract<SourceBlock, { type: 'text' }>; index: number; card: ChunkCard | null; valuable: boolean }
  | { block: Extract<SourceBlock, { type: 'image' }>; index: number; card: null; valuable: false }

function processWebHtml(html: string): { richHtml: string; text: string; url: string | null } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  let url: string | null = null
  const canonical = doc.querySelector('link[rel="canonical"]')
  if (canonical) url = canonical.getAttribute('href')
  if (!url) url = doc.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? null
  doc.querySelectorAll('script,style,nav,footer,aside,noscript,iframe').forEach(el => el.remove())
  return { richHtml: doc.body?.innerHTML ?? html, text: (doc.body?.innerText ?? '').trim(), url }
}

function splitIntoInfoBlocks(text: string): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').trim()
  if (!cleaned) return []

  const paragraphs = cleaned
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean)

  const blocks: string[] = []
  let current = ''
  let currentLength = 0

  const flush = () => {
    if (current) {
      blocks.push(current)
      current = ''
      currentLength = 0
    }
  }

  for (const paragraph of paragraphs.length > 0 ? paragraphs : [cleaned]) {
    const parts = splitLongInfoPart(paragraph)
    for (const part of parts) {
      if (shouldKeepStandaloneBlock(part)) {
        flush()
        blocks.push(part)
        continue
      }

      const partLength = Array.from(part).length
      const separator = current ? '\n\n' : ''
      const nextLength = currentLength + partLength
      if (current && nextLength > INFO_BLOCK_MAX_CHARS) {
        flush()
      }

      current = current ? `${current}${separator}${part}` : part
      currentLength += partLength
      if (currentLength >= INFO_BLOCK_MIN_CHARS) {
        flush()
      }
    }
  }

  flush()
  return blocks
}

function splitLongInfoPart(part: string): string[] {
  const normalized = part.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const sentenceParts = normalized.match(/[^。！？!?；;.!?]+[。！？!?；;.!?]?/g) ?? [normalized]
  const chunks: string[] = []

  for (const sentence of sentenceParts) {
    const trimmed = sentence.trim()
    if (!trimmed) continue
    if (Array.from(trimmed).length <= INFO_BLOCK_MAX_CHARS) {
      chunks.push(trimmed)
      continue
    }

    const chars = Array.from(trimmed)
    for (let start = 0; start < chars.length; start += INFO_BLOCK_MAX_CHARS) {
      chunks.push(chars.slice(start, start + INFO_BLOCK_MAX_CHARS).join(''))
    }
  }

  return chunks
}

function normalizedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function isMetadataTextBlock(normalized: string): boolean {
  if (/^(作者|撰文|来源|发布|日期|时间|编辑|译者|摄影|图|图注|标题|by|source|date|updated|published)\s*[：:]/i.test(normalized)) return true
  if (/^\d{4}[-年]\d{1,2}([-/月]\d{1,2})?\s*$/.test(normalized)) return true
  return false
}

function hasAnalysisSignalText(normalized: string): boolean {
  return /(为什么|因为|但是|然而|所以|因此|如果|意味着|说明|反映|问题|观点|趋势|影响|矛盾|选择|价值|事实|判断|because|however|therefore|implies|impact|trend|problem|argument|evidence)/i.test(normalized)
}

function hasNumbersAndContextText(normalized: string): boolean {
  return /\d/.test(normalized) && normalized.length >= 42
}

function looksLikeHeadingText(normalized: string): boolean {
  if (!normalized) return false
  if (hasAnalysisSignalText(normalized) || hasNumbersAndContextText(normalized)) return false
  if (/^#{1,6}\s+/.test(normalized)) return true
  if (/^[一二三四五六七八九十\d]+[、.]\s*\S{1,40}$/.test(normalized)) return true
  if (normalized.length > 72) return false
  if (/[。！？!?；;]/.test(normalized)) return false
  if (/[,，]\s*\S{12,}/.test(normalized)) return false
  return true
}

function shouldKeepStandaloneBlock(text: string): boolean {
  const normalized = normalizedText(text)
  return isMetadataTextBlock(normalized) || looksLikeHeadingText(normalized)
}

function isValuableTextBlock(text: string): boolean {
  const normalized = normalizedText(text)
  if (!normalized) return false
  if (isMetadataTextBlock(normalized)) return false
  if (looksLikeHeadingText(normalized)) return false
  if (normalized.length < 28) return false

  const sentenceMarks = (normalized.match(/[。！？!?；;]/g) ?? []).length
  const hasAnalysisSignals = hasAnalysisSignalText(normalized)
  const hasNumbersAndContext = hasNumbersAndContextText(normalized)

  return normalized.length >= 80 || sentenceMarks >= 2 || hasAnalysisSignals || hasNumbersAndContext
}

function parseSourceBlocks(richHtml: string | null, fallbackText: string, baseUrl: string | null): SourceBlock[] {
  if (!richHtml) {
    return splitIntoInfoBlocks(fallbackText).map((text) => ({ type: 'text', text }))
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(richHtml, 'text/html')
  const blocks: SourceBlock[] = []
  const pendingText: string[] = []
  const handledImageIndexes = new Map<string, number>()
  const blockTags = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'li', 'blockquote', 'pre', 'td', 'th',
  ])

  const pushText = (text: string) => {
    const normalized = text.trim()
    if (normalized) pendingText.push(normalized)
  }

  const flushText = () => {
    if (pendingText.length === 0) return
    for (const part of splitIntoInfoBlocks(pendingText.join('\n\n'))) {
      blocks.push({ type: 'text', text: part })
    }
    pendingText.length = 0
  }

  const pushImage = (img: HTMLImageElement, caption: string | null) => {
    flushText()
    const rawSrc = img.getAttribute('src')?.trim()
    if (!rawSrc) return
    const resolvedSrc = resolveImageSrc(rawSrc, baseUrl)
    const imageKey = normalizeImageSrcKey(resolvedSrc)
    if (!imageKey) return
    const alt = img.getAttribute('alt')?.trim() ?? ''
    const nextCaption = caption ?? meaningfulCaption(alt)
    const existingIndex = handledImageIndexes.get(imageKey)
    if (existingIndex !== undefined) {
      const existing = blocks[existingIndex]
      if (existing.type === 'image') {
        if (!existing.alt && alt) existing.alt = alt
        if (!existing.caption && nextCaption) existing.caption = nextCaption
      }
      return
    }
    handledImageIndexes.set(imageKey, blocks.length)
    blocks.push({
      type: 'image',
      src: resolvedSrc,
      alt,
      caption: nextCaption,
    })
  }

  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim()
      if (text) pushText(text)
      return
    }
    if (!(node instanceof Element)) return

    const tag = node.tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'noscript') return
    if (tag === 'figure') {
      const img = node.querySelector('img')
      if (img instanceof HTMLImageElement) {
        pushImage(img, meaningfulCaption(node.querySelector('figcaption')?.textContent))
      }
      return
    }
    if (tag === 'img' && node instanceof HTMLImageElement) {
      pushImage(node, null)
      return
    }
    if (tag === 'figcaption') return

    if (blockTags.has(tag)) {
      if (node.querySelector('img,figure')) {
        node.childNodes.forEach(visit)
        return
      }
      const text = node.textContent?.trim()
      if (text) pushText(text)
      return
    }

    node.childNodes.forEach(visit)
  }

  doc.body.childNodes.forEach(visit)
  flushText()
  return blocks.length > 0
    ? blocks
    : splitIntoInfoBlocks(fallbackText).map((text) => ({ type: 'text', text }))
}

function meaningfulCaption(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, ' ').trim()
  if (!text) return null
  const lower = text.toLowerCase()
  if (lower === 'image' || lower === 'img' || lower === 'photo' || lower === 'picture') return null
  if (/^\.(png|jpe?g|webp|gif|svg)$/i.test(lower)) return null
  return text
}

function resolveImageSrc(src: string, baseUrl: string | null): string {
  if (!baseUrl || src.startsWith('data:')) return src
  try {
    return new URL(src, baseUrl).toString()
  } catch {
    return src
  }
}

function normalizeImageSrcKey(src: string): string {
  const trimmed = src.trim()
  if (!trimmed) return ''
  if (/^data:/i.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed)
    url.hash = ''
    return url.toString()
  } catch {
    const hashIndex = trimmed.indexOf('#')
    return hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed
  }
}

function previewText(block: SourceBlock): string {
  if (block.type === 'text') {
    return block.text.length > BLOCK_PREVIEW_LIMIT
      ? `${block.text.slice(0, BLOCK_PREVIEW_LIMIT)}...`
      : block.text
  }
  return block.caption ?? block.alt ?? '图片'
}

function isRemoteImageSrc(src: string): boolean {
  return /^https?:\/\//i.test(src) || /^data:image\//i.test(src)
}

function supportsMultimodal(config: AppConfig | null): boolean {
  if (!config) return false
  const model = config.openaiModel.toLowerCase()
  const provider = config.providerKey.toLowerCase()
  return [
    'gpt-5',
    'gpt-4o',
    'gpt-4.1',
    'vision',
    'gemini',
    'claude-3',
    'sonnet',
    'opus',
    'haiku',
    'qwen-vl',
    'qwen2-vl',
    'qwen2.5-vl',
    'glm-4v',
    'kimi-vl',
    'doubao',
    'llava',
    'vl',
  ].some((token) => model.includes(token) || provider.includes(token))
}

function formatHistoryDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '未知'
  if (bytes < 1024) return `${bytes} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unitIndex]}`
}

function formatDateTime(value: string | null): string {
  if (value === null) return '未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知'
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function sourceKindLabel(kind: ExploreSourceMetadata['kind']): string {
  if (kind === 'file') return '本地文件'
  if (kind === 'webpage') return '网页'
  return '粘贴内容'
}

function sourceKindIcon(kind: ExploreSourceMetadata['kind']) {
  if (kind === 'file') return FileText
  if (kind === 'webpage') return Globe
  return Clipboard
}

function buildFallbackSourceMetadata(
  sourceName: string | null,
  sourceUrl: string | null,
  text: string
): ExploreSourceMetadata {
  return {
    kind: sourceUrl === null ? 'paste' : 'webpage',
    name: sourceName,
    path: null,
    url: sourceUrl,
    sizeBytes: null,
    createdAt: null,
    modifiedAt: null,
    characterCount: Array.from(text).length,
  }
}

interface MetadataRowProps {
  icon: typeof Info
  label: string
  value: string
  href?: string
}

function MetadataRow({ icon: Icon, label, value, href }: MetadataRowProps) {
  return (
    <div className="grid grid-cols-[1rem,4.5rem,minmax(0,1fr)] items-start gap-2 text-xs">
      <Icon size={13} className="mt-0.5 text-accent" />
      <span className="text-fg-faint">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="break-all text-fg-muted underline decoration-accent/30 underline-offset-4 transition-colors hover:text-accent"
        >
          {value}
        </a>
      ) : (
        <span className="break-words text-fg-muted">{value}</span>
      )}
    </div>
  )
}

function SourceMetadataPanel({ metadata }: { metadata: ExploreSourceMetadata }) {
  const KindIcon = sourceKindIcon(metadata.kind)
  const rows: MetadataRowProps[] = [
    { icon: KindIcon, label: '类型', value: sourceKindLabel(metadata.kind) },
  ]

  if (metadata.name !== null) rows.push({ icon: FileText, label: '名称', value: metadata.name })

  if (metadata.kind === 'file') {
    rows.push(
      { icon: Database, label: '大小', value: formatBytes(metadata.sizeBytes) },
      { icon: Calendar, label: '创建', value: formatDateTime(metadata.createdAt) },
      { icon: Calendar, label: '修改', value: formatDateTime(metadata.modifiedAt) },
      { icon: Hash, label: '字符', value: `${formatCount(metadata.characterCount)} 字` },
    )
    if (metadata.path !== null) rows.push({ icon: Link, label: '路径', value: metadata.path })
  } else if (metadata.kind === 'webpage') {
    rows.push({ icon: Hash, label: '字符', value: `${formatCount(metadata.characterCount)} 字` })
    if (metadata.url !== null) rows.push({ icon: ExternalLink, label: '地址', value: metadata.url, href: metadata.url })
  } else {
    rows.push({ icon: Hash, label: '字符', value: `${formatCount(metadata.characterCount)} 字` })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="absolute right-6 top-[calc(100%+0.5rem)] z-30 w-[min(28rem,calc(100vw-3rem))] rounded-lg border border-border-strong bg-bg-elevated p-4 shadow-2xl"
    >
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-accent/30 bg-accent/10 text-accent">
          <Info size={15} />
        </div>
        <div>
          <p className="text-sm font-medium text-fg">元信息</p>
          <p className="text-[11px] text-fg-faint">{sourceKindLabel(metadata.kind)}</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {rows.map((row) => (
          <MetadataRow key={`${row.label}-${row.value}`} {...row} />
        ))}
      </div>
    </motion.div>
  )
}

interface SourceHeaderProps {
  busy: boolean
  parsing: boolean
  sourceName: string | null
  sourceUrl: string | null
  metadata: ExploreSourceMetadata
  onOpenHistory: () => void
  onChangeFile: () => void
  onClear: () => void
}

function SourceHeader({
  busy,
  parsing,
  sourceName,
  sourceUrl,
  metadata,
  onOpenHistory,
  onChangeFile,
  onClear,
}: SourceHeaderProps) {
  const [metadataOpen, setMetadataOpen] = useState(false)
  const KindIcon = sourceKindIcon(metadata.kind)

  useEffect(() => {
    setMetadataOpen(false)
  }, [metadata])

  return (
    <div className="relative shrink-0 border-b border-border bg-bg-elevated/95 px-6 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <KindIcon size={16} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-md border border-border bg-bg px-2 py-0.5 text-[11px] text-fg-faint">
              {busy ? parsing ? '解析中' : '分析中' : sourceKindLabel(metadata.kind)}
            </span>
            <p className="truncate text-sm font-medium text-fg">{sourceName ?? metadata.name ?? '未命名来源'}</p>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-fg-faint">
            <span>{formatCount(metadata.characterCount)} 字符</span>
            {sourceUrl !== null && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-1 truncate transition-colors hover:text-accent"
              >
                <ExternalLink size={11} className="shrink-0" />
                <span className="truncate">{sourceUrl}</span>
              </a>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMetadataOpen((openValue) => !openValue)}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg',
              metadataOpen && 'border-accent/40 bg-accent/10 text-accent'
            )}
            title="元信息"
          >
            <Info size={14} />
          </button>
          <button
            type="button"
            onClick={onOpenHistory}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
            title="缩略图"
          >
            <Images size={13} />
            缩略图
          </button>
          <button
            type="button"
            onClick={onChangeFile}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
            title="换文件"
          >
            <FileText size={13} />
            换文件
          </button>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
            title="清空"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <AnimatePresence>
        {metadataOpen && <SourceMetadataPanel metadata={metadata} />}
      </AnimatePresence>
    </div>
  )
}

// ── Drawer ─────────────────────────────────────────────────────────────────
function ChunkDrawer({ card, commentatorEmoji, commentatorName, onClose }: {
  card: ChunkCard; commentatorEmoji: string; commentatorName: string; onClose: () => void
}) {
  const CATEGORY_COLOR: Record<string, string> = {
    '事实': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    '观点': 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    '中间混淆形态': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    '规范性/分析性': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    '修辞性': 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  }
  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed right-0 top-0 h-full w-[360px] z-40 border-l border-border bg-bg-elevated shadow-2xl flex flex-col"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <span className="text-sm font-medium text-fg">主题分析</span>
        <button onClick={onClose} className="rounded-md p-1 text-fg-muted hover:bg-bg-hover transition-colors">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 [&::-webkit-scrollbar]:hidden">
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-faint">总结</p>
          <p className="text-sm leading-relaxed text-fg">{card.summary}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-lg">{commentatorEmoji}</span>
            <span className="text-xs font-medium text-fg-muted">{commentatorName} 说</span>
          </div>
          <p className="text-sm leading-relaxed text-fg italic">{card.hotTake}</p>
        </div>
        {card.labels.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-faint">信息分类</p>
            <div className="flex flex-wrap gap-1.5">
              {card.labels.map((label, i) => (
                <span key={i} className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs',
                  CATEGORY_COLOR[label.category] ?? 'bg-bg-hover text-fg-muted border-border'
                )}>
                  {label.category} · {label.sub}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="mb-3 text-lg font-semibold leading-snug text-fg">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-2 mt-4 text-base font-semibold leading-snug text-fg first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 mt-3 text-sm font-semibold leading-snug text-fg first:mt-0">{children}</h3>,
        h4: ({ children }) => <h4 className="mb-1.5 mt-3 text-sm font-medium leading-snug text-fg first:mt-0">{children}</h4>,
        p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
        em: ({ children }) => <em className="text-fg-muted">{children}</em>,
        ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="my-3 border-l-2 border-accent/50 pl-3 text-fg-muted">
            {children}
          </blockquote>
        ),
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline decoration-accent/30 underline-offset-4 hover:text-accent-hover"
          >
            {children}
          </a>
        ),
        code: ({ children, className }) => (
          <code className={cn('rounded border border-border bg-bg px-1 py-0.5 font-mono text-[0.92em] text-fg', className)}>
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="my-3 overflow-x-auto rounded-lg border border-border bg-bg p-3 font-mono text-xs leading-relaxed text-fg-muted">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-left text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-bg-hover text-fg">{children}</thead>,
        tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
        tr: ({ children }) => <tr className="align-top">{children}</tr>,
        th: ({ children }) => <th className="whitespace-nowrap px-3 py-2 font-semibold text-fg">{children}</th>,
        td: ({ children }) => <td className="px-3 py-2 text-fg-muted">{children}</td>,
        hr: () => <hr className="my-4 border-border" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function CompletionConfetti({ burstKey }: { burstKey: number }) {
  return (
    <motion.div
      key={burstKey}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-30 overflow-hidden"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 1.45, delay: 0.28, ease: 'easeOut' }}
    >
      <div className="absolute left-1/2 top-[42%] h-0 w-0">
        <motion.div
          className="absolute -left-10 -top-10 h-20 w-20 rounded-full border border-amber-300/60"
          initial={{ opacity: 0.9, scale: 0.2 }}
          animate={{ opacity: 0, scale: 3.4 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
        {CONFETTI_PIECES.map((piece, index) => (
          <motion.span
            key={`${piece.x}-${piece.y}-${index}`}
            className={cn('absolute left-0 top-0 rounded-sm shadow-[0_0_16px_rgba(255,255,255,0.16)]', piece.c)}
            style={{ width: piece.w, height: piece.h }}
            initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 0.4 }}
            animate={{
              opacity: [0, 1, 1, 0],
              x: [0, piece.x * 0.42, piece.x],
              y: [0, piece.y * 0.35 - 70, piece.y + 220],
              rotate: [0, piece.r * 0.55, piece.r],
              scale: [0.45, 1.05, 0.9],
            }}
            transition={{ duration: 1.18, delay: piece.d, ease: 'easeOut' }}
          />
        ))}
        {STAR_BURST.map((spark, index) => (
          <motion.span
            key={`finish-star-${index}`}
            className="absolute left-0 top-0 text-amber-300"
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.2, rotate: 0 }}
            animate={{ opacity: [0, 1, 0], x: spark.x * 3.4, y: spark.y * 2.8, scale: 1.15, rotate: spark.rotate * 2 }}
            transition={{ duration: 0.86, delay: 0.05 + index * 0.035, ease: 'easeOut' }}
          >
            <Star size={spark.size + 5} fill="currentColor" />
          </motion.span>
        ))}
      </div>
    </motion.div>
  )
}

// ── ThemeBlock ──────────────────────────────────────────────────────────────
function ThemeBlock({ card, index, starred, onOpen, onToggleStar, displayText, muted = false }: {
  card: ChunkCard
  index: number
  starred: boolean
  onOpen?: () => void
  onToggleStar?: (el: HTMLButtonElement) => void
  displayText?: string
  muted?: boolean
}) {
  const starRef = useRef<HTMLButtonElement>(null)
  return (
    <motion.div
      initial={{ opacity: 0, y: 58, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 250, damping: 24 }}
      className="group relative flex items-center gap-3"
    >
      <div className={cn(
        'relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border px-4 py-3 text-sm leading-relaxed shadow-[0_12px_34px_rgba(0,0,0,0.18)]',
        muted ? 'bg-bg/70 text-fg-muted' : 'bg-bg-elevated text-fg'
      )}>
        {!muted && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-28 w-20 bg-accent/20"
            initial={{ x: 0, skewX: -18 }}
            animate={{ x: 720, skewX: -18 }}
            transition={{ duration: 0.62, ease: 'easeOut', delay: 0.08 }}
          />
        )}
        <div className="relative">
          <MarkdownContent content={displayText ?? card.text} />
        </div>
      </div>
      {onOpen && onToggleStar && (
        <motion.button
          ref={starRef}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.16, type: 'spring', stiffness: 400, damping: 15 }}
          onClick={onOpen}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); starRef.current && onToggleStar(starRef.current) }}
          className={cn(
            'shrink-0 rounded-full border p-2 shadow-lg transition-colors',
            starred
              ? 'border-amber-400/50 bg-amber-400/15 text-amber-400'
              : 'border-border bg-bg-elevated text-amber-400/60 hover:border-amber-400/40 hover:bg-amber-400/10 hover:text-amber-400'
          )}
          title={starred ? '右键取消采集' : '左键查看分析 / 右键采集'}
        >
          <Star size={20} fill={starred ? 'currentColor' : 'none'} />
        </motion.button>
      )}
    </motion.div>
  )
}

function SourceImageBlock({ block, active, shouldDescribe, descriptions, setDescriptions }: {
  block: Extract<SourceBlock, { type: 'image' }>
  active: boolean
  shouldDescribe: boolean
  descriptions: Record<string, string | null | undefined>
  setDescriptions: Dispatch<SetStateAction<Record<string, string | null | undefined>>>
}) {
  const caption = block.caption ?? meaningfulCaption(block.alt)
  const generated = descriptions[block.src]
  const canDescribe = shouldDescribe && !caption && isRemoteImageSrc(block.src)

  useEffect(() => {
    if (!active || !canDescribe || block.src in descriptions) return
    setDescriptions((current) => ({ ...current, [block.src]: undefined }))
    describeImage(block.src)
      .then((text) => {
        setDescriptions((current) => ({ ...current, [block.src]: text.trim() || null }))
      })
      .catch(() => {
        setDescriptions((current) => ({ ...current, [block.src]: null }))
      })
  }, [active, block.src, canDescribe, descriptions, setDescriptions])

  const visibleCaption = caption ?? (generated && generated.length > 0 ? generated : null)

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-xl border border-border bg-bg">
        <img
          src={block.src}
          alt={block.alt || caption || '原文图片'}
          className="max-h-64 w-full object-contain"
          loading="lazy"
        />
      </div>
      {visibleCaption && (
        <p className="mt-2 text-xs leading-relaxed text-fg-muted">{visibleCaption}</p>
      )}
      {canDescribe && generated === undefined && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-accent">
          <Loader2 size={11} className="animate-spin" />
          生成图像说明…
        </div>
      )}
    </div>
  )
}

function ProcessingStage({ blocks, completedIndexes, parsing, analyzing, shouldDescribeImages, imageDescriptions, setImageDescriptions, isValuableBlock }: {
  blocks: SourceBlock[]
  completedIndexes: Set<number>
  parsing: boolean
  analyzing: boolean
  shouldDescribeImages: boolean
  imageDescriptions: Record<string, string | null | undefined>
  setImageDescriptions: Dispatch<SetStateAction<Record<string, string | null | undefined>>>
  isValuableBlock: (index: number) => boolean
}) {
  const hasBlocks = blocks.length > 0
  const firstPendingIndex = hasBlocks
    ? blocks.findIndex((_, index) => !completedIndexes.has(index))
    : -1
  const activeIndex = firstPendingIndex >= 0 ? firstPendingIndex : Math.max(blocks.length - 1, 0)
  const visibleIndexes = hasBlocks
    ? blocks
        .map((_, index) => index)
        .filter((index) => index <= activeIndex && activeIndex - index <= STAGE_WINDOW)
    : []

  return (
    <div className="relative flex-1 overflow-hidden px-6">
      <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-px bg-border" />
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/15"
          animate={{ rotate: 360 }}
          transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
        >
          {ORBIT_DOTS.map((dot) => (
            <span key={dot} className={cn('absolute left-1/2 top-1/2 h-0 w-0', dot)}>
              <span className="block h-1.5 w-1.5 translate-x-36 rounded-full bg-accent/50" />
            </span>
          ))}
        </motion.div>
        <motion.div
          className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border"
          animate={{ rotate: -360 }}
          transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {!hasBlocks ? (
        <div className="flex h-full items-center justify-center">
          <div className="flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-4 py-2 text-sm text-fg-muted">
            <Loader2 size={14} className="animate-spin text-accent" />
            {parsing ? '解析文本中…' : '准备信息块…'}
          </div>
        </div>
      ) : (
        <div className="absolute inset-0">
          <AnimatePresence initial={false}>
            {visibleIndexes.map((index) => {
              const done = completedIndexes.has(index)
              const active = analyzing && index === activeIndex
              const pending = !done && !active
              const offset = index - activeIndex
              const block = blocks[index]
              const preview = previewText(block)
              const valuable = block.type === 'text' && isValuableBlock(index)
              const statusText = done
                ? block.type === 'image' ? '已插入' : valuable ? '已提取' : '已保留'
                : active
                  ? block.type === 'image' ? '处理中' : valuable ? '提取中' : '保留原文'
                  : '等待中'

              return (
                <div key={index} className="absolute left-1/2 top-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2">
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: offset * STAGE_GAP + 24, scale: 0.94 }}
                    animate={{
                      opacity: active ? 1 : done ? 0.62 : 0.32,
                      y: offset * STAGE_GAP,
                      scale: active ? 1 : 0.92,
                      filter: pending ? 'blur(1px)' : 'blur(0px)',
                    }}
                    exit={{ opacity: 0, y: offset * STAGE_GAP - 24, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 240, damping: 28 }}
                    className={cn(
                      'relative isolate overflow-hidden rounded-2xl border px-5 py-4 shadow-2xl',
                      active ? 'border-accent/60 bg-bg-elevated text-fg' : 'border-border bg-bg-elevated/70 text-fg-muted',
                      done && valuable && 'border-amber-400/25 bg-amber-400/5',
                      done && !valuable && 'border-border bg-bg/80'
                    )}
                  >
                    {active && (
                      <>
                        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_0,transparent_22px,var(--color-border)_23px)] bg-[length:100%_24px] opacity-20" />
                        <motion.div
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 -left-40 w-36 bg-accent/45"
                          animate={{ x: [0, 900] }}
                          transition={{ duration: 0.72, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <motion.div
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 -left-24 w-10 bg-white/25"
                          animate={{ x: [0, 900] }}
                          transition={{ duration: 0.72, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <motion.div
                          aria-hidden
                          className="pointer-events-none absolute inset-0 rounded-2xl border border-accent/70"
                          animate={{ opacity: [0.25, 1, 0.25], scale: [1, 1.012, 1] }}
                          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <motion.div
                          aria-hidden
                          className="pointer-events-none absolute left-0 top-0 h-px w-full bg-accent"
                          animate={{ y: [0, 220], opacity: [0, 1, 0] }}
                          transition={{ duration: 0.95, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <motion.div
                          aria-hidden
                          className="pointer-events-none absolute bottom-0 left-0 h-0.5 bg-accent"
                          animate={{ width: ['0%', '100%', '0%'], x: ['0%', '0%', '100%'] }}
                          transition={{ duration: 1.25, repeat: Infinity, ease: 'easeInOut' }}
                        />
                        <div aria-hidden className="pointer-events-none absolute left-3 top-3 h-4 w-4 border-l border-t border-accent/80" />
                        <div aria-hidden className="pointer-events-none absolute right-3 top-3 h-4 w-4 border-r border-t border-accent/80" />
                        <div aria-hidden className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 border-b border-l border-accent/80" />
                        <div aria-hidden className="pointer-events-none absolute bottom-3 right-3 h-4 w-4 border-b border-r border-accent/80" />
                      </>
                    )}

                    <div className="relative flex items-start gap-3">
                      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-bg text-xs font-medium text-fg-muted">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-center gap-2 text-xs text-fg-faint">
                          <span>{statusText}</span>
                          {active && valuable && <Loader2 size={11} className="animate-spin text-accent" />}
                          {active && valuable && (
                            <span className="flex items-center gap-1">
                              {STATUS_DOTS.map((dot) => (
                                <motion.span
                                  key={dot}
                                  className="h-1 w-1 rounded-full bg-accent"
                                  animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }}
                                  transition={{ duration: 0.62, delay: dot * 0.08, repeat: Infinity, ease: 'easeInOut' }}
                                />
                              ))}
                            </span>
                          )}
                        </div>
                        {block.type === 'image' ? (
                          <SourceImageBlock
                            block={block}
                            active={active}
                            shouldDescribe={shouldDescribeImages}
                            descriptions={imageDescriptions}
                            setDescriptions={setImageDescriptions}
                          />
                        ) : (
                          <p className="relative text-sm leading-relaxed">
                            {preview}
                            {active && (
                              <motion.span
                                aria-hidden
                                className="pointer-events-none absolute inset-0 bg-bg-elevated"
                                animate={{ x: ['0%', '105%'] }}
                                transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 0.2, ease: 'easeInOut' }}
                              />
                            )}
                          </p>
                        )}
                      </div>
                      <AnimatePresence>
                        {done && valuable && (
                          <div className="relative mt-1 shrink-0">
                            <motion.span
                              aria-hidden
                              initial={{ opacity: 0.8, scale: 0.2 }}
                              animate={{ opacity: 0, scale: 2.2 }}
                              transition={{ duration: 0.45, ease: 'easeOut' }}
                              className="absolute inset-0 rounded-full border border-amber-400/70"
                            />
                            {STAR_BURST.map((spark) => (
                              <motion.span
                                key={`${spark.x}-${spark.y}`}
                                aria-hidden
                                initial={{ opacity: 0.9, x: 0, y: 0, scale: 0.2, rotate: 0 }}
                                animate={{ opacity: 0, x: spark.x, y: spark.y, scale: 1, rotate: spark.rotate }}
                                transition={{ duration: 0.58, ease: 'easeOut' }}
                                className="absolute left-2 top-2 text-amber-300"
                              >
                                <Star size={spark.size} fill="currentColor" />
                              </motion.span>
                            ))}
                            <motion.div
                              initial={{ opacity: 0, scale: 0, rotate: -60 }}
                              animate={{ opacity: 1, scale: 1, rotate: 0 }}
                              exit={{ opacity: 0, scale: 0 }}
                              transition={{ type: 'spring', stiffness: 520, damping: 16 }}
                              className="relative rounded-full bg-amber-400/15 p-1.5 text-amber-400"
                            >
                              <Star size={17} fill="currentColor" />
                            </motion.div>
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                </div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

function SourceImageResultBlock({ block, index, shouldDescribeImages, imageDescriptions, setImageDescriptions }: {
  block: Extract<SourceBlock, { type: 'image' }>
  index: number
  shouldDescribeImages: boolean
  imageDescriptions: Record<string, string | null | undefined>
  setImageDescriptions: Dispatch<SetStateAction<Record<string, string | null | undefined>>>
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 58, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 250, damping: 24, delay: index * 0.02 }}
      className="group relative flex items-start gap-3"
    >
      <div className="relative flex-1 overflow-hidden rounded-xl border border-border bg-bg-elevated px-5 py-4">
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-28 w-20 bg-accent/20"
          initial={{ x: 0, skewX: -18 }}
          animate={{ x: 720, skewX: -18 }}
          transition={{ duration: 0.62, ease: 'easeOut', delay: 0.08 }}
        />
        <SourceImageBlock
          block={block}
          active
          shouldDescribe={shouldDescribeImages}
          descriptions={imageDescriptions}
          setDescriptions={setImageDescriptions}
        />
      </div>
    </motion.div>
  )
}

function HistoryStackPreview({ item }: { item: ExploreHistoryItem }) {
  const textBlocks = splitIntoInfoBlocks(item.text).slice(0, 3)
  return (
    <div className="relative h-32">
      {[0, 1, 2].map((offset) => (
        <div
          key={offset}
          className={cn(
            'absolute inset-x-0 h-24 overflow-hidden rounded-lg border border-border bg-bg-elevated shadow-lg',
            offset === 0 ? 'top-0' : offset === 1 ? 'top-3 left-2 right-[-0.5rem]' : 'top-6 left-4 right-[-1rem]'
          )}
          style={{ zIndex: 3 - offset, opacity: 1 - offset * 0.2 }}
        >
          {offset === 0 && item.previewImage ? (
            <img src={item.previewImage} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="p-3">
              <div className="mb-2 h-1.5 w-16 rounded-full bg-accent/50" />
              <p className="line-clamp-4 text-[11px] leading-relaxed text-fg-muted">
                {textBlocks[offset] ?? item.sourceName ?? '分析记录'}
              </p>
            </div>
          )}
        </div>
      ))}
      <div className="absolute bottom-0 right-0 z-10 rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] text-fg-muted">
        {item.chunkCards.length} 块
      </div>
    </div>
  )
}

function HistoryTile({ item, onActivate, onArchive, onUnarchive, onDelete }: {
  item: ExploreHistoryItem
  onActivate: () => void
  onArchive: () => void
  onUnarchive: () => void
  onDelete: () => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      className="group relative overflow-hidden rounded-xl border border-border bg-bg p-3"
    >
      <button onClick={onActivate} className="block w-full text-left">
        <HistoryStackPreview item={item} />
        <div className="mt-3 min-w-0">
          <p className="truncate text-xs font-medium text-fg">{item.sourceName ?? '未命名分析'}</p>
          <p className="mt-1 truncate text-[11px] text-fg-faint">{item.sourceUrl ?? formatHistoryDate(item.createdAt)}</p>
        </div>
      </button>
      <div className="mt-3 flex items-center gap-1.5 opacity-70 transition-opacity group-hover:opacity-100">
        <button
          onClick={onActivate}
          className="rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
          title="重新激活"
        >
          <RotateCcw size={12} className="inline" />
        </button>
        {item.archived ? (
          <button
            onClick={onUnarchive}
            className="rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
            title="取消存档"
          >
            <ArchiveRestore size={12} className="inline" />
          </button>
        ) : (
          <button
            onClick={onArchive}
            className="rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
            title="存档"
          >
            <Archive size={12} className="inline" />
          </button>
        )}
        <button
          onClick={onDelete}
          className="ml-auto rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
          title="删除"
        >
          <Trash2 size={12} className="inline" />
        </button>
      </div>
    </motion.div>
  )
}

function HistoryDrawer({ items, onClose, onActivate, onArchive, onUnarchive, onDelete }: {
  items: ExploreHistoryItem[]
  onClose: () => void
  onActivate: (id: string) => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onDelete: (id: string) => void
}) {
  const activeItems = items.filter((item) => !item.archived)
  const archivedItems = items.filter((item) => item.archived)

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed right-0 top-0 z-50 flex h-full w-[430px] flex-col border-l border-border bg-bg-elevated shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <p className="text-sm font-medium text-fg">分析缩略图</p>
          <p className="mt-0.5 text-xs text-fg-faint">当前记录与存档文件</p>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-fg-muted transition-colors hover:bg-bg-hover">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 [&::-webkit-scrollbar]:hidden">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-fg-faint">
            <div>
              <Images size={30} className="mx-auto mb-2 opacity-40" />
              <p>暂无分析记录</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <div className="mb-3 flex items-center justify-between text-xs text-fg-faint">
                <span>当前</span>
                <span>{activeItems.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <AnimatePresence mode="popLayout">
                  {activeItems.map((item) => (
                    <HistoryTile
                      key={item.id}
                      item={item}
                      onActivate={() => onActivate(item.id)}
                      onArchive={() => onArchive(item.id)}
                      onUnarchive={() => onUnarchive(item.id)}
                      onDelete={() => onDelete(item.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
            <section>
              <div className="mb-3 flex items-center justify-between text-xs text-fg-faint">
                <span>存档</span>
                <span>{archivedItems.length}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <AnimatePresence mode="popLayout">
                  {archivedItems.map((item) => (
                    <HistoryTile
                      key={item.id}
                      item={item}
                      onActivate={() => onActivate(item.id)}
                      onArchive={() => onArchive(item.id)}
                      onUnarchive={() => onUnarchive(item.id)}
                      onDelete={() => onDelete(item.id)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </section>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function Explore() {
  const {
    text,
    richHtml,
    chunkCards,
    analyzing,
    parsing,
    error,
    sourceName,
    sourceUrl,
    sourceMetadata,
    setText,
    setRichContent,
    parseFile,
    fetchUrlContent,
    reset,
  } = useExploreStore()
  const history = useExploreHistoryStore()
  const { config, loaded } = useConfigStore()
  const { star, unstar } = useStarStore()
  const fly = useStarFly()

  const [dragging, setDragging] = useState(false)
  const [activeCard, setActiveCard] = useState<ChunkCard | null>(null)
  const [stageCompletedCount, setStageCompletedCount] = useState(0)
  const [revealedCount, setRevealedCount] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [imageDescriptions, setImageDescriptions] = useState<Record<string, string | null | undefined>>({})
  const [generationInProgress, setGenerationInProgress] = useState(false)
  const [completionBurstKey, setCompletionBurstKey] = useState<number | null>(null)
  // index → saved point id (once a chunk has been saved+starred)
  const [savedIds, setSavedIds] = useState<Record<number, string>>({})

  const busy = analyzing || parsing
  const sourceBlocks = useMemo(() => parseSourceBlocks(richHtml, text, sourceUrl), [richHtml, text, sourceUrl])
  const hasContent = text.trim().length > 0 || sourceBlocks.length > 0 || chunkCards.length > 0 || busy
  const hasSourceBlocks = sourceBlocks.length > 0
  const valuableSourceIndexes = useMemo(() => new Set(
    sourceBlocks
      .map((block, index) => block.type === 'text' && isValuableTextBlock(block.text) ? index : -1)
      .filter((index) => index >= 0)
  ), [sourceBlocks])
  const isValuableSourceBlock = useCallback((index: number) => valuableSourceIndexes.has(index), [valuableSourceIndexes])
  const sourceResultItems = useMemo<SourceResultItem[]>(() => {
    let textIndex = 0
    return sourceBlocks.map((block, index) => {
      if (block.type === 'text') {
        const valuable = isValuableTextBlock(block.text)
        const card = valuable ? chunkCards[textIndex] ?? null : null
        if (valuable) textIndex += 1
        return { block, index, card, valuable }
      }
      return { block, index, card: null, valuable: false }
    })
  }, [chunkCards, sourceBlocks])
  const stageTargetCount = sourceBlocks.length > 0 ? sourceBlocks.length : chunkCards.length
  const completedIndexes = useMemo(
    () => new Set(Array.from(
      { length: Math.min(stageCompletedCount, sourceBlocks.length) },
      (_, index) => index
    )),
    [stageCompletedCount, sourceBlocks.length]
  )
  const stageDone = !busy && (stageTargetCount === 0 || stageCompletedCount >= stageTargetCount)
  const showProcessing = busy || (stageTargetCount > 0 && !stageDone)
  const resultTargetCount = hasSourceBlocks ? sourceResultItems.length : chunkCards.length
  const visibleCards = stageDone && !hasSourceBlocks ? chunkCards.slice(0, Math.min(revealedCount, chunkCards.length)) : []
  const visibleSourceItems = stageDone && hasSourceBlocks
    ? sourceResultItems.slice(0, Math.min(revealedCount, sourceResultItems.length))
    : []
  const commentatorEmoji = config?.commentatorEmoji ?? '🧐'
  const commentatorName = config?.commentatorName ?? '鲁迅'
  const shouldDescribeImages = supportsMultimodal(config)
  const displaySourceMetadata = useMemo(
    () => sourceMetadata ?? buildFallbackSourceMetadata(sourceName, sourceUrl, text),
    [sourceMetadata, sourceName, sourceUrl, text]
  )

  useEffect(() => {
    if (analyzing || parsing) {
      setActiveCard(null)
      setSavedIds({})
      setImageDescriptions({})
      setStageCompletedCount(0)
      setRevealedCount(0)
      setGenerationInProgress(true)
      setCompletionBurstKey(null)
    }
  }, [analyzing, parsing])

  useEffect(() => {
    if (stageTargetCount === 0) {
      setStageCompletedCount(0)
      return
    }
    if (stageCompletedCount >= stageTargetCount) return

    const timer = window.setTimeout(() => {
      setStageCompletedCount((count) => Math.min(count + 1, stageTargetCount))
    }, busy ? STAGE_ADVANCE_MS : STAGE_CATCHUP_MS)

    return () => window.clearTimeout(timer)
  }, [busy, stageCompletedCount, stageTargetCount])

  useEffect(() => {
    if (showProcessing) {
      setRevealedCount(0)
      return
    }
    if (resultTargetCount === 0) {
      setRevealedCount(0)
      return
    }

    setRevealedCount(0)
    const timers = Array.from({ length: resultTargetCount }, (_, index) =>
      window.setTimeout(
        () => setRevealedCount((count) => Math.max(count, index + 1)),
        RESULT_REVEAL_START_MS + index * RESULT_REVEAL_MS
      )
    )

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [showProcessing, resultTargetCount])

  useEffect(() => {
    if (!generationInProgress || showProcessing || resultTargetCount === 0 || revealedCount < resultTargetCount) return

    setCompletionBurstKey(Date.now())
    setGenerationInProgress(false)
    const timer = window.setTimeout(() => setCompletionBurstKey(null), 1700)
    return () => window.clearTimeout(timer)
  }, [generationInProgress, revealedCount, resultTargetCount, showProcessing])

  const handleToggleStar = useCallback(async (index: number, card: ChunkCard, el: HTMLButtonElement) => {
    const existing = savedIds[index]
    if (existing) {
      // already saved: unstar and remove from map
      await unstar(existing)
      setSavedIds(m => { const n = { ...m }; delete n[index]; return n })
    } else {
      // first star: save chunk summary as a point, then star it
      try {
        fly(el)
        const ids = await savePoints([{ content: card.summary, tagType: '作者观点' }], sourceName)
        const pointId = ids[0]
        if (pointId) {
          await star(pointId)
          setSavedIds(m => ({ ...m, [index]: pointId }))
        }
      } catch {
        // silently fail
      }
    }
  }, [savedIds, sourceName, fly, star, unstar])

  // ── File picker ──────────────────────────────────────────────────────────
  const handlePick = async () => {
    const selected = await open({ multiple: false, filters: [{ name: '文档', extensions: SUPPORTED_EXTS }] })
    if (typeof selected === 'string') await parseFile(selected)
  }

  const handleChangeFile = () => {
    reset()
    setActiveCard(null)
    setHistoryOpen(false)
    setStageCompletedCount(0)
    setRevealedCount(0)
    setImageDescriptions({})
    setGenerationInProgress(false)
    setCompletionBurstKey(null)
  }

  const handleActivateHistory = (id: string) => {
    history.activate(id)
    setHistoryOpen(false)
    setActiveCard(null)
    setStageCompletedCount(Number.MAX_SAFE_INTEGER)
    setRevealedCount(Number.MAX_SAFE_INTEGER)
    setGenerationInProgress(false)
    setCompletionBurstKey(null)
  }

  // ── Drag & drop ──────────────────────────────────────────────────────────
  const handleDragOver = useCallback((e: Event) => { e.preventDefault(); setDragging(true) }, [])
  const handleDragLeave = useCallback((e: Event) => {
    if (!((e as DragEvent).relatedTarget instanceof Node)) setDragging(false)
  }, [])
  const handleDrop = useCallback(async (e: Event) => {
    e.preventDefault(); setDragging(false)
    const file = (e as DragEvent).dataTransfer?.files[0]
    if (!file) return
    await parseFile((file as unknown as { path?: string }).path ?? file.name)
  }, [parseFile])

  useEffect(() => {
    document.body.addEventListener('dragover', handleDragOver as EventListener)
    document.body.addEventListener('dragleave', handleDragLeave as EventListener)
    document.body.addEventListener('drop', handleDrop as EventListener)
    return () => {
      document.body.removeEventListener('dragover', handleDragOver as EventListener)
      document.body.removeEventListener('dragleave', handleDragLeave as EventListener)
      document.body.removeEventListener('drop', handleDrop as EventListener)
    }
  }, [handleDragOver, handleDragLeave, handleDrop])

  // ── Paste ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const plain = e.clipboardData?.getData('text/plain')?.trim() ?? ''
      const html = e.clipboardData?.getData('text/html') ?? ''
      if (URL_RE.test(plain)) { e.preventDefault(); await fetchUrlContent(plain); return }
      if (html && html.trim().length > 200) {
        e.preventDefault()
        const { richHtml, text, url } = processWebHtml(html)
        setRichContent(richHtml, text, url)
        return
      }
      if (plain.length > 0) {
        e.preventDefault()
        setText(plain)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [fetchUrlContent, setRichContent, setText])

  return (
    <div className="relative flex h-full overflow-hidden">
      <div className={cn('flex h-full flex-1 flex-col transition-all duration-300', activeCard ? 'mr-[360px]' : '')}>
        {!hasContent && (
          <button
            onClick={() => setHistoryOpen(true)}
            className="absolute right-6 top-5 z-10 inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
          >
            <Images size={13} />
            缩略图
          </button>
        )}

        {!hasContent && (
          <div className="flex flex-1 items-center justify-center px-8">
            {loaded && !config?.openaiApiKey && (
              <div className="absolute top-6 left-1/2 -translate-x-1/2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-fg">
                尚未配置 API Key，请先到「设置」页填写。
              </div>
            )}
            <motion.div
              animate={dragging ? { scale: 1.03, borderColor: 'var(--color-accent)' } : { scale: 1 }}
              transition={{ duration: 0.15 }}
              onClick={handlePick}
              className={cn(
                'flex w-full max-w-md cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-border bg-bg-elevated px-8 py-16 transition-colors',
                dragging ? 'bg-accent/5 border-accent' : 'hover:border-accent/50 hover:bg-bg-hover',
              )}
            >
              <Upload size={32} className={cn('transition-colors', dragging ? 'text-accent' : 'text-fg-faint')} />
              <div className="text-center">
                <p className="text-sm font-medium text-fg">{dragging ? '松开以导入文件' : '拖拽文件 / 点击选择'}</p>
                <p className="mt-1 text-xs text-fg-faint">或粘贴文本、网页链接、复制的网页内容</p>
              </div>
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-bg px-3 py-1.5 text-xs text-fg-muted">
                <FileText size={13} />txt · md · docx · odt · html · csv
              </div>
            </motion.div>
          </div>
        )}

        {hasContent && (
          <>
            <SourceHeader
              busy={busy}
              parsing={parsing}
              sourceName={sourceName}
              sourceUrl={sourceUrl}
              metadata={displaySourceMetadata}
              onOpenHistory={() => setHistoryOpen(true)}
              onChangeFile={handleChangeFile}
              onClear={reset}
            />

            {error && (
              <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <AlertCircle size={16} className="mt-0.5 shrink-0" /><span className="break-words">{error}</span>
              </div>
            )}

            {showProcessing ? (
              <ProcessingStage
                blocks={sourceBlocks}
                completedIndexes={completedIndexes}
                parsing={parsing}
                analyzing={showProcessing && !parsing}
                shouldDescribeImages={shouldDescribeImages}
                imageDescriptions={imageDescriptions}
                setImageDescriptions={setImageDescriptions}
                isValuableBlock={isValuableSourceBlock}
              />
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-5 [&::-webkit-scrollbar]:hidden">
                <div className="mx-auto max-w-2xl space-y-4 pb-10">
                  {resultTargetCount > 0 && (hasSourceBlocks ? visibleSourceItems.length === 0 : visibleCards.length === 0) && (
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="mx-auto mt-24 flex w-fit items-center gap-2 rounded-full border border-border bg-bg-elevated px-4 py-2 text-sm text-fg-muted"
                    >
                      <Loader2 size={14} className="animate-spin text-accent" />
                      整理生成结果…
                    </motion.div>
                  )}
                  <AnimatePresence mode="popLayout">
                    {hasSourceBlocks ? (
                      visibleSourceItems.map((item) => {
                        if (item.block.type === 'image') {
                          return (
                            <SourceImageResultBlock
                              key={`source-${item.index}`}
                              block={item.block}
                              index={item.index}
                              shouldDescribeImages={shouldDescribeImages}
                              imageDescriptions={imageDescriptions}
                              setImageDescriptions={setImageDescriptions}
                            />
                          )
                        }

                        const analysisCard = item.card
                        const card = analysisCard ?? {
                          index: -item.index - 1,
                          text: item.block.text,
                          summary: item.block.text,
                          hotTake: '',
                          labels: [],
                        }
                        return (
                          <ThemeBlock
                            key={`source-${item.index}`}
                            card={card}
                            index={item.index}
                            displayText={item.block.text}
                            muted={!analysisCard}
                            starred={analysisCard ? analysisCard.index in savedIds : false}
                            onOpen={analysisCard ? () => setActiveCard(analysisCard) : undefined}
                            onToggleStar={analysisCard ? (el) => handleToggleStar(analysisCard.index, analysisCard, el) : undefined}
                          />
                        )
                      })
                    ) : (
                      visibleCards.map((card, i) => (
                        <ThemeBlock
                          key={card.index}
                          card={card}
                          index={i}
                          starred={card.index in savedIds}
                          onOpen={() => setActiveCard(card)}
                          onToggleStar={(el) => handleToggleStar(card.index, card, el)}
                        />
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {completionBurstKey !== null && <CompletionConfetti burstKey={completionBurstKey} />}
        {historyOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/20" onClick={() => setHistoryOpen(false)} />
            <HistoryDrawer
              items={history.items}
              onClose={() => setHistoryOpen(false)}
              onActivate={handleActivateHistory}
              onArchive={history.archive}
              onUnarchive={history.unarchive}
              onDelete={history.remove}
            />
          </>
        )}
        {activeCard && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-30" onClick={() => setActiveCard(null)} />
            <ChunkDrawer card={activeCard} commentatorEmoji={commentatorEmoji}
              commentatorName={commentatorName} onClose={() => setActiveCard(null)} />
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
