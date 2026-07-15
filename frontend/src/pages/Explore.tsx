import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { open } from '@tauri-apps/plugin-dialog'
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Calendar,
  ChevronDown,
  Clipboard,
  Database,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Hash,
  Images,
  Info,
  Link,
  Loader2,
  Link2,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useConfigStore, useExploreHistoryStore, useExploreStore, useStarStore } from '@/store'
import { cn } from '@/lib/utils'
import { initialExplorePresentation } from '@/lib/explorePresentation'
import { useStarFly } from '@/hooks/useStarFly'
import { addReviewItem, analyzeTextBlock, describeImage, discoverRelatedAssets, factCheckClaim, generateInvestigation, getSourceAssets, listRecentJournalEntries, listRecentSources, saveEvidence, savePoints } from '@/api'
import type { AppConfig, AssetRelationRecord, ChunkCard, DigestResult, EvidenceRecord, ExploreHistoryItem, ExploreSourceMetadata, FactCheckResult, JournalEntry, ReportRecord, SourceAssetsRecord, SourceSummaryRecord, StoredPoint } from '@/api/types'
import { ExternalLinkPreview } from '@/components/ExternalLinkPreview'
import { DigestModal } from '@/components/DigestModal'
import { reportKindLabel, reportMarkdownWithCitations } from '@/lib/reportArtifacts'
import { evidenceMarkdown, markdownFileName, sourceAssetsMarkdown, sourceDisplayTitle } from '@/lib/workbenchArtifacts'
import { splitSourceHighlight, type SourceHighlightRequest, type SourceHighlightSegment } from '@/lib/sourceHighlight'
import { sourceBlocksFromContentPlan, type ExploreSourceBlock as SourceBlock } from '@/lib/exploreContentPlan'
import {
  INVESTIGATION_MAX_AUTO_ANALYSIS_BLOCKS,
  INVESTIGATION_TARGET_EVIDENCE,
  INVESTIGATION_TARGET_POINTS,
  investigationMissingLabel,
  investigationReadinessForAssets,
  type InvestigationReadiness,
} from '@/lib/investigationPreparation'
const URL_RE = /^https?:\/\/[^\s]+$/
const SUPPORTED_EXTS = ['txt','md','markdown','rst','csv','docx','odt','html','htm']
const BLOCK_PREVIEW_LIMIT = 320
const INFO_BLOCK_SOFT_MIN_CHARS = 120
const INFO_BLOCK_MIN_CHARS = 200
const INFO_BLOCK_MAX_CHARS = 400
const INFO_HEADING_BLOCK_MAX_CHARS = 500
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
const WEBSITE_NOISE_TERMS = [
  '推荐', '财经', 'AI', '自助报道', '浙江', '最新', '创投', '汽车', '科技', '专精特新', '直播', '视频', '专题', '活动',
  '资讯推荐', '最近内容', '下一篇', '城市合作', '寻求报道', '我要入驻', '投资者关系', '商务合作', '关于我们', '联系我们',
  '加入我们', '热门资讯', '热门产品', '快讯标签', '快讯', '36氪欧洲站', '36氢欧洲站', '首页',
  'Auto', '数字时氪', 'Power on', '36氪研究院', '36氪企服点评', 'bonus36碳后浪研究所', 'Waves',
  '氪气氛', '企业号', '企业服务', '企服点评', '36Kr研究院', '创新咨询', '核心服务', '政府服务',
  '城市之窗', '创投发布', 'LP源计划', 'VClub', 'VClub投资机构库', '投资机构职位推介', '投资人认证',
  '寻求报道', 'Pro创投氪', '投资氪企业', '入驻创业者服务', '创投平台', 'AI测评网',
]
const WEBSITE_NOISE_SET = new Set(WEBSITE_NOISE_TERMS.map((term) => term.toLowerCase()))
const LS_FACT_CHECKS = 'explore-fact-checks-v1'

type SourceResultItem =
  | { block: Extract<SourceBlock, { type: 'text' }>; index: number; card: ChunkCard | null; valuable: boolean }
  | { block: Extract<SourceBlock, { type: 'image' }>; index: number; card: null; valuable: false }

type AnalysisAnchor = { x: number; y: number }
type AnalysisStackEntry = { id: string; card: ChunkCard; anchor: AnalysisAnchor | null; blockIndex: number; title: string }
type ImageViewerState = { src: string; alt: string; caption: string | null }

interface ChunkDrawerProps {
  entry: AnalysisStackEntry
  depth: number
  inactiveCount: number
  active: boolean
  commentatorEmoji: string
  commentatorName: string
  onClose: () => void
  onSelect: () => void
}

interface AnalysisLinkProps {
  sourceElement: HTMLElement | null
}

interface ThemeBlockProps {
  card: ChunkCard
  index: number
  starred: boolean
  onOpen?: (el: HTMLButtonElement) => void
  onToggleStar?: (el: HTMLButtonElement) => void
  onAnalyze?: (el: HTMLButtonElement) => void
  onRegenerate?: (el: HTMLButtonElement) => void
  analyzing?: boolean
  analyzeError?: string | null
  displayText?: string
  muted?: boolean
  blockRef?: (node: HTMLDivElement | null) => void
  onFactCheck?: (claim: string, context: string, anchor: HTMLElement, range: FactCheckTextRange) => void
  userAnnotations?: UserTextAnnotation[]
  annotationColors?: AnnotationColors
  activeFactCheck?: FactCheckInlineMarker | null
  sourceHighlight?: SourceHighlightRequest | null
}

type AnnotationKind = 'fact' | 'data' | 'viewpoint' | 'quote' | 'poem' | 'description'

interface TextAnnotation {
  start: number
  end: number
  kind: AnnotationKind
  clickable: boolean
}

interface FactCheckTextRange {
  blockIndex: number
  start: number
  end: number
}

interface FactCheckInlineMarker extends FactCheckTextRange {
  loading: boolean
  onOpen: (anchor: HTMLElement) => void
}

type UserAnnotationKind = 'wavy' | 'line' | 'highlight' | 'comment'

interface AnnotationColors {
  underline: string
  wavy: string
  highlight: string
}

interface UserTextAnnotation {
  id: string
  start: number
  end: number
  kind: UserAnnotationKind
  comment?: string
}

interface FactBubbleState {
  claim: string
  context: string
  loading: boolean
  x: number
  y: number
  blockIndex: number | null
  start: number | null
  end: number | null
  collapsed: boolean
  result?: FactCheckResult
  error?: string
  saved?: boolean
  saving?: boolean
  saveError?: string
  evidenceId?: string
}

interface SelectionToolbarState {
  text: string
  context: string
  x: number
  y: number
  blockIndex: number
  start: number
  end: number
}

interface CommentDialogState extends SelectionToolbarState {
  error?: string
}

type PointTagType = '事实陈述' | '作者观点' | '待验证疑问'
interface InvestigationPreparationCandidate {
  displayIndex: number
  blockIndex: number
  text: string
  card: ChunkCard | null
}

interface PreparedInvestigationPoint {
  id: string
  claim: string
  context: string
  blockIndex: number
  card: ChunkCard
  tagType: PointTagType
}

interface InvestigationEvidenceCandidate {
  pointId: string | null
  claim: string
  context: string
  blockIndex: number | null
}
function tagTypeForChunkCard(card: ChunkCard): PointTagType {
  const joined = `${card.summary}\n${card.text}`
  if (/[？?]/.test(card.summary) || /(是否|能否|会不会|为什么|如何|待验证|不确定|存疑|需要核查)/.test(card.summary)) {
    return '待验证疑问'
  }

  const scores: Record<PointTagType, number> = {
    事实陈述: 0,
    作者观点: 0,
    待验证疑问: 0,
  }
  for (const label of card.labels) {
    const category = label.category.trim()
    const sub = label.sub.trim()
    if (category === '事实' || /(事实|统计|数据|法律|制度|技术|参数|历史|案例|存在|科学共识)/.test(sub)) {
      scores.事实陈述 += 2
    } else if (category === '中间混淆形态' || /(预测|推测|匿名|伪装|归因|断言|待验证)/.test(sub)) {
      scores.待验证疑问 += 2
    } else if (category === '观点' || category === '修辞性' || /(判断|建议|呼吁|评价|审美|解释|隐喻|类比|反讽)/.test(sub)) {
      scores.作者观点 += 2
    } else if (category === '规范性/分析性') {
      scores.事实陈述 += 1
    }
  }

  if (/(公司|政府|机构|制度|法律|规则|政策|数据|比例|历史|报告|研究|规定|参数|成本|利润|分配|工资)/.test(joined)) {
    scores.事实陈述 += 1
  }
  if (/(应该|必须|需要|值得|不应|更好|糟糕|荒诞|合理|不合理)/.test(joined)) {
    scores.作者观点 += 1
  }

  if (scores.待验证疑问 > scores.事实陈述 && scores.待验证疑问 >= scores.作者观点) return '待验证疑问'
  if (scores.事实陈述 >= scores.作者观点 && scores.事实陈述 > 0) return '事实陈述'
  return '作者观点'
}

function pointClaimForInvestigation(card: ChunkCard): string {
  return normalizedText(card.summary || card.hotTake || card.text)
}

function investigationEvidenceContext(point: StoredPoint): string {
  return normalizedText(point.sourceExcerpt || point.content)
}
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

function factCheckKey(claim: string, context: string): string {
  return `${claim.trim().toLowerCase()}::${context.trim().slice(0, 240).toLowerCase()}`
}

function loadSavedFactChecks(): Array<{ key: string; result: FactCheckResult; savedAt: string }> {
  try {
    const raw = localStorage.getItem(LS_FACT_CHECKS)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) =>
      item
      && typeof item.key === 'string'
      && typeof item.savedAt === 'string'
      && item.result
      && typeof item.result === 'object'
    )
  } catch {
    return []
  }
}

function findSavedFactCheck(claim: string, context: string): FactCheckResult | null {
  const key = factCheckKey(claim, context)
  return loadSavedFactChecks().find((item) => item.key === key)?.result ?? null
}

function saveFactCheckResult(claim: string, context: string, result: FactCheckResult) {
  const key = factCheckKey(claim, context)
  const next = [
    { key, result, savedAt: new Date().toISOString() },
    ...loadSavedFactChecks().filter((item) => item.key !== key),
  ].slice(0, 200)
  localStorage.setItem(LS_FACT_CHECKS, JSON.stringify(next))
}

function useScrollMoreHint(ref: RefObject<HTMLElement>, watchKey: string | number | boolean) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) {
      setVisible(false)
      return
    }

    const update = () => {
      setVisible(element.scrollHeight - element.clientHeight - element.scrollTop > 10)
    }

    update()
    const frame = window.requestAnimationFrame(update)
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    resizeObserver?.observe(element)
    window.addEventListener('resize', update)
    element.addEventListener('scroll', update, { passive: true })

    return () => {
      window.cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', update)
      element.removeEventListener('scroll', update)
    }
  }, [ref, watchKey])

  return visible
}

function ScrollMoreHint({ visible, className }: { visible: boolean; className?: string }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          className={cn('pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2', className)}
        >
          <motion.div
            animate={{
              y: [0, 6, 0],
              opacity: [0.62, 1, 0.68],
              boxShadow: [
                '0 0 14px rgba(226,232,240,0.32), 0 0 22px rgba(56,189,248,0.18)',
                '0 0 24px rgba(226,232,240,0.82), 0 0 38px rgba(56,189,248,0.45)',
                '0 0 16px rgba(226,232,240,0.38), 0 0 24px rgba(56,189,248,0.22)',
              ],
            }}
            transition={{ duration: 0.95, repeat: Infinity, ease: 'easeInOut' }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-100/55 bg-bg-elevated/75 text-cyan-50 backdrop-blur-sm"
          >
            <ChevronDown size={17} strokeWidth={2.4} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function formatCommentKnowledgeContent(selection: CommentDialogState, comment: string): string {
  return `Comment: ${comment}\n\n原文: ${selection.text}`
}

function selectionOffsetWithin(container: HTMLElement, targetNode: Node, targetOffset: number): number {
  const range = document.createRange()
  range.selectNodeContents(container)
  range.setEnd(targetNode, targetOffset)
  return range.toString().length
}

function splitIntoInfoBlocks(text: string): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').trim()
  if (!cleaned) return []

  const seenParagraphs = new Set<string>()
  const paragraphs = cleaned
    .split(/\n+/)
    .map((part) => part.trim())
    .filter((part) => {
      if (!part || isDiscardableTextFragment(part)) return false
      const key = comparableTextKey(part)
      if (seenParagraphs.has(key)) return false
      seenParagraphs.add(key)
      return true
    })

  if (paragraphs.some(isExplicitSectionHeading)) {
    return splitExplicitSectionsIntoBlocks(paragraphs)
  }

  return splitParagraphsIntoInfoBlocks(paragraphs, INFO_BLOCK_MAX_CHARS)
}

function splitExplicitSectionsIntoBlocks(paragraphs: string[]): string[] {
  const sections: string[][] = []
  let current: string[] = []

  for (const paragraph of paragraphs) {
    if (isExplicitSectionHeading(paragraph) && current.length > 0) {
      sections.push(current)
      current = [paragraph]
    } else {
      current.push(paragraph)
    }
  }

  if (current.length > 0) sections.push(current)

  const blocks: string[] = []
  const seenBlocks = new Set<string>()
  const pushUnique = (block: string) => {
    const trimmed = block.trim()
    const key = comparableTextKey(trimmed)
    if (!trimmed || isDiscardableTextFragment(trimmed) || seenBlocks.has(key)) return
    blocks.push(trimmed)
    seenBlocks.add(key)
  }

  for (const section of sections) {
    if (section.length === 1 && isBareSectionMarker(section[0])) continue
    const sectionText = section.join('\n\n')
    if (Array.from(sectionText).length <= INFO_HEADING_BLOCK_MAX_CHARS) {
      pushUnique(sectionText)
      continue
    }
    for (const block of splitParagraphsIntoInfoBlocks(section, INFO_HEADING_BLOCK_MAX_CHARS)) {
      pushUnique(block)
    }
  }

  return blocks
}

function splitParagraphsIntoInfoBlocks(paragraphs: string[], maxChars: number): string[] {
  const blocks: string[] = []
  const seenBlocks = new Set<string>()
  let current = ''
  let currentLength = 0

  const flush = () => {
    if (current) {
      const key = comparableTextKey(current)
      if (!seenBlocks.has(key) && !isDiscardableTextFragment(current)) {
        blocks.push(current)
        seenBlocks.add(key)
      }
      current = ''
      currentLength = 0
    }
  }

  for (const paragraph of paragraphs) {
    const parts = splitLongInfoPart(paragraph, maxChars)
    for (const part of parts) {
      if (isDiscardableTextFragment(part)) continue

      const partLength = Array.from(part).length
      const separator = current ? '\n\n' : ''
      const nextLength = currentLength + partLength + Array.from(separator).length
      if (current && currentLength >= INFO_BLOCK_SOFT_MIN_CHARS && startsNewInfoBlock(part)) {
        flush()
      }
      if (current && nextLength > maxChars) {
        flush()
      }

      if (current) {
        current = `${current}\n\n${part}`
        currentLength += 2 + partLength
      } else {
        current = part
        currentLength = partLength
      }
    }
  }

  flush()
  return blocks
}

function splitLongInfoPart(part: string, maxChars = INFO_BLOCK_MAX_CHARS): string[] {
  const normalized = part.replace(/\s+/g, ' ').trim()
  if (!normalized) return []

  const sentenceParts = normalized.match(/[^。！？!?；;.!?]+[。！？!?；;.!?]?/g) ?? [normalized]
  const chunks: string[] = []

  for (const sentence of sentenceParts) {
    const trimmed = sentence.trim()
    if (!trimmed) continue
    if (Array.from(trimmed).length <= maxChars) {
      chunks.push(trimmed)
      continue
    }

    const chars = Array.from(trimmed)
    for (let start = 0; start < chars.length; start += maxChars) {
      chunks.push(chars.slice(start, start + maxChars).join(''))
    }
  }

  return chunks
}

function normalizedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function isExplicitSectionHeading(text: string): boolean {
  const normalized = normalizedText(text)
  if (!normalized) return false
  if (/^#{1,6}\s+\S+/.test(normalized)) return true
  if (/^第[一二三四五六七八九十百千万\d]+[章节部分篇条]\s*\S{0,80}$/.test(normalized)) return true
  if (/^[（(]?[一二三四五六七八九十\d]{1,4}(?:[）)、.．]|\s+|-|—|–)\s*\S{0,80}$/.test(normalized)) return true
  if (/^[A-Z][.)．]\s*\S{0,80}$/.test(normalized)) return true
  return false
}

function isBareSectionMarker(text: string): boolean {
  const normalized = normalizedText(text)
  return /^[（(]?(?:[一二三四五六七八九十\d]{1,4}|[A-Z])[）)、.．]$/.test(normalized)
}

function startsNewInfoBlock(text: string): boolean {
  const normalized = normalizedText(text)
  if (!normalized) return false
  if (/^(公开的)?(报道|资料|数据显示|统计显示|公开信息|原文|文中|报告).{0,12}(写道|显示|称|指出|如下)[：:]?$/.test(normalized)) return true
  if (/^(据|根据).{1,24}(报道|资料|数据|统计|报告|文件)/.test(normalized)) return true
  if (/^(以.{1,18}为例|例如|比如|举例来说|再看|另一个例子|接下来|下面)/.test(normalized)) return true
  if (/^(首先|其次|再次|最后|总之|结论是|问题是|原因是|解决办法是)[，,:：]/.test(normalized)) return true
  return false
}

function comparableTextKey(text: string): string {
  return normalizedText(text)
    .replace(/[“”"‘’'「」『』]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function isDiscardableTextFragment(text: string): boolean {
  const normalized = normalizedText(text)
  if (!normalized) return true
  if (isWebsiteNoiseText(normalized)) return true
  if (normalized.length <= 4 && /^[“”"‘’'「」『』,，.。;；:：、\s]+$/.test(normalized)) return true
  if (/^[“”"‘’'「」『』]+$/.test(normalized)) return true
  return false
}

function isWebsiteNoiseText(normalized: string): boolean {
  const compact = normalized.replace(/\s+/g, '')
  const lower = normalized.toLowerCase()
  const compactLower = compact.toLowerCase()
  if (WEBSITE_NOISE_SET.has(lower) || WEBSITE_NOISE_SET.has(compactLower)) return true
  if (compact === '专注上市公司价值发现、创造与传播。') return true
  if (/^(首页|推荐|财经|最新|直播|视频|专题|活动|快讯|AI测评网|创投平台)$/.test(compact)) return true
  if (/^\d+\s*(分钟前|小时前|天前)$/.test(normalized)) return true
  if (compact.length <= 90 && /\d+(分钟前|小时前|天前)$/.test(compact)) return true

  const hitCount = WEBSITE_NOISE_TERMS.reduce((count, term) => (
    compactLower.includes(term.toLowerCase().replace(/\s+/g, '')) ? count + 1 : count
  ), 0)
  if (compact.length <= 160 && hitCount >= 2 && !/[。！？!?；;]/.test(compact)) return true
  if (compact.length <= 260 && hitCount >= 5 && !/[。！？!?；;]/.test(compact)) return true
  if (/36[氪Kr]/i.test(compact) && hitCount >= 2 && !/[。！？!?；;]/.test(compact)) return true
  if ((compact.match(/36[氪氢]欧洲站/g) ?? []).length >= 2) return true
  return false
}

function isMetadataTextBlock(normalized: string): boolean {
  if (/^(作者|撰文|来源|发布|日期|时间|编辑|译者|摄影|图|图注|标题|by|source|date|updated|published)\s*[：:]/i.test(normalized)) return true
  if (/^\d{4}[-年]\d{1,2}([-/月]\d{1,2})?\s*$/.test(normalized)) return true
  return false
}

function stripLeadingMetadataLines(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let start = 0
  while (start < lines.length) {
    const normalized = normalizedText(lines[start])
    if (!normalized || isMetadataTextBlock(normalized)) {
      start += 1
      continue
    }
    break
  }
  return lines.slice(start).join('\n').trim()
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

function isValuableTextBlock(text: string): boolean {
  const normalized = normalizedText(stripLeadingMetadataLines(text))
  if (!normalized) return false
  if (isMetadataTextBlock(normalized)) return false
  if (looksLikeHeadingText(normalized)) return false
  if (Array.from(normalized).length < INFO_BLOCK_MIN_CHARS) return false

  const sentenceMarks = (normalized.match(/[。！？!?；;]/g) ?? []).length
  const hasAnalysisSignals = hasAnalysisSignalText(normalized)
  const hasNumbersAndContext = hasNumbersAndContextText(normalized)

  return sentenceMarks >= 2 || hasAnalysisSignals || hasNumbersAndContext
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
  const handledTextBlocks = new Set<string>()
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
      const key = comparableTextKey(part)
      if (handledTextBlocks.has(key)) continue
      handledTextBlocks.add(key)
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

function analysisTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return '未命名片段'
  const chars = Array.from(normalized)
  const title = chars.slice(0, 10).join('')
  return chars.length > 10 ? `${title}...` : title
}

function analysisTabTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return '片段'
  return Array.from(normalized).slice(0, 3).join('')
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

function parseJsonStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function exploreErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
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
    if (metadata.author) rows.push({ icon: Info, label: '作者', value: metadata.author })
    if (metadata.publishedAt) rows.push({ icon: Calendar, label: '发布', value: metadata.publishedAt })
    if (metadata.readingTime) rows.push({ icon: Info, label: '阅读', value: metadata.readingTime })
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
  summary: SourceSummaryRecord | null
  onReanalyze: () => void
  onOpenHistory: () => void
  onOpenRecent: () => void
  onChangeFile: () => void
  onClear: () => void
}

function SourceHeader({
  busy,
  parsing,
  sourceName,
  sourceUrl,
  metadata,
  summary,
  onReanalyze,
  onOpenHistory,
  onOpenRecent,
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
            {summary && (
              <>
                <span>{summary.chunkCount} 块</span>
                <span>{summary.pointCount} 点</span>
                <span>{summary.starCount} 星</span>
                <span>{formatHistoryDate(summary.updatedAt)}</span>
              </>
            )}
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
            onClick={onReanalyze}
            disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
            title="重新采集"
          >
            <RotateCcw size={13} className={busy ? 'animate-spin' : undefined} />
            重新采集
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
            onClick={onOpenRecent}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
            title="最近来源"
          >
            <Database size={13} />
            最近来源
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

interface SourceAssetPanelProps {
  language: AppConfig['uiLanguage']
  assets: SourceAssetsRecord | null
  loading: boolean
  error: string | null
  journalEntries: JournalEntry[]
  relations: AssetRelationRecord[]
  relationsLoading: boolean
  actionError: string | null
  investigationLoading: boolean
  investigationReadiness: InvestigationReadiness | null
  preparationLoading: boolean
  preparationStatus: string | null
  reviewLoading: boolean
  onOpenSource: (sourceId: string, chunkIndex?: number | null) => void
  onExportSource: () => void
  onExportEvidence: (record: EvidenceRecord) => void
  onExportReport: (record: ReportRecord) => void
  onPrepareInvestigation: () => void
  onGenerateInvestigation: () => void
  onForceGenerateInvestigation: () => void
  onAddReview: () => void
  onRefreshRelations: () => void
}

function SourceAssetPanel({
  language,
  assets,
  loading,
  error,
  journalEntries,
  relations,
  relationsLoading,
  actionError,
  investigationLoading,
  investigationReadiness,
  preparationLoading,
  preparationStatus,
  reviewLoading,
  onOpenSource,
  onExportSource,
  onExportEvidence,
  onExportReport,
  onPrepareInvestigation,
  onGenerateInvestigation,
  onForceGenerateInvestigation,
  onAddReview,
  onRefreshRelations,
}: SourceAssetPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  if (!assets && !loading && !error) return null
  const zh = language !== 'en-US'

  const pointCount = assets?.points.length ?? 0
  const evidenceCount = assets?.evidence.length ?? 0
  const reportCount = assets?.reports.length ?? 0
  const investigationCount = assets?.reports.filter((report) => report.kind === 'investigation').length ?? 0
  const galleryCount = assets?.gallery.length ?? 0
  const totalCount = pointCount + evidenceCount + reportCount + galleryCount + journalEntries.length + relations.length
  const investigationBusy = investigationLoading || preparationLoading
  const needsPreparation = Boolean(assets && investigationReadiness && !investigationReadiness.ready)

  return (
    <section className="mx-6 mt-4 rounded-lg border border-border bg-bg-elevated px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-fg">
            <Database size={14} className="text-accent" />
            <span>{zh ? '来源资产' : 'Source assets'}</span>
            {loading && <Loader2 size={13} className="animate-spin text-fg-faint" />}
          </div>
          <p className="mt-1 text-xs text-fg-faint">
            {assets
              ? zh
                ? `${pointCount} 个观点 · ${evidenceCount} 条证据 · ${reportCount} 份报告 · ${galleryCount} 张图片`
                : `${pointCount} Points · ${evidenceCount} Evidence · ${reportCount} Reports · ${galleryCount} Images`
              : zh ? '正在整理与当前来源关联的资产' : 'Loading assets linked to this source'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {assets && (
            <>
            <button
              type="button"
              onClick={needsPreparation ? onPrepareInvestigation : onGenerateInvestigation}
              disabled={investigationBusy}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent disabled:opacity-50"
              title={needsPreparation
                ? (zh ? '先补充观点和证据，再生成调查报告' : 'Prepare points and evidence before generating the investigation')
                : (zh ? '基于当前来源生成调查报告' : 'Generate an investigation from this source')}
            >
              {investigationBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {needsPreparation ? (zh ? '准备后调查' : 'Prepare + Investigate') : (zh ? '调查' : 'Investigate')}
            </button>
            <button
              type="button"
              onClick={onAddReview}
              disabled={reviewLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent disabled:opacity-50"
              title={zh ? '加入复习队列' : 'Add to review queue'}
            >
              {reviewLoading ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />}
              {zh ? '复习' : 'Review'}
            </button>
            <button
              type="button"
              onClick={onRefreshRelations}
              disabled={relationsLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent disabled:opacity-50"
              title={zh ? '刷新相关资产' : 'Refresh related assets'}
            >
              {relationsLoading ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />}
              {zh ? '相关' : 'Related'}
            </button>
            <button
              type="button"
              onClick={onExportSource}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent"
              title={zh ? '导出来源资产 Markdown' : 'Export source assets as Markdown'}
            >
              <Download size={13} />
              {zh ? '导出' : 'Export'}
            </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent"
            title={collapsed ? (zh ? '展开来源资产' : 'Expand source assets') : (zh ? '收起来源资产' : 'Collapse source assets')}
            aria-expanded={!collapsed}
          >
            <ChevronDown size={13} className={cn('transition-transform', !collapsed && 'rotate-180')} />
            {collapsed ? (zh ? '展开' : 'Expand') : (zh ? '收起' : 'Collapse')}
          </button>
        </div>
      </div>

      <div className={cn(collapsed && 'hidden')}>
      {(error || actionError) && (
        <div className={cn(
          'mt-3 rounded-md border px-3 py-2 text-xs',
          actionError?.startsWith('已') || actionError?.startsWith('Added')
            ? 'border-border bg-bg text-fg-muted'
            : 'border-red-500/25 bg-red-500/10 text-red-300'
        )}>
          {error ?? actionError}
        </div>
      )}

      {preparationStatus && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-accent/25 bg-accent/10 px-3 py-2 text-xs text-accent">
          <Loader2 size={13} className="animate-spin" />
          <span>{preparationStatus}</span>
        </div>
      )}

      {assets && investigationReadiness && !investigationReadiness.ready && (
        <div className="mt-3 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-xs text-amber-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {zh ? '调查准备度不足' : 'Investigation context is thin'}
              </p>
              <p className="mt-1 leading-relaxed text-amber-100/80">
                {zh
                  ? '当前来源的观点或证据偏少，直接调查容易生成粗略报告。建议先自动补充关键观点和少量证据。'
                  : 'This source has too few points or evidence items. Generating now may produce a shallow report.'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {investigationReadiness.missing.map((missing) => (
                  <span key={missing} className="rounded-full border border-amber-300/25 bg-bg/40 px-2 py-0.5 text-[11px]">
                    {investigationMissingLabel(missing, language)}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={onPrepareInvestigation}
                disabled={investigationBusy}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/35 bg-amber-300/10 px-2.5 py-1.5 text-xs text-amber-50 transition-colors hover:bg-amber-300/20 disabled:opacity-50"
              >
                {investigationBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {zh ? '准备后调查' : 'Prepare + Investigate'}
              </button>
              <button
                type="button"
                onClick={onForceGenerateInvestigation}
                disabled={investigationBusy}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300/25 px-2.5 py-1.5 text-xs text-amber-100/85 transition-colors hover:bg-amber-300/10 disabled:opacity-50"
              >
                {zh ? '仍然直接调查' : 'Generate anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      {assets && totalCount === 0 && !error && (
        <div className="mt-3 rounded-md border border-border bg-bg px-3 py-4 text-center text-xs text-fg-faint">
          {zh
            ? '当前来源还没有可聚合的观点、证据、报告、日志、相关资产或画廊图片。'
            : 'This source has no linked points, evidence, reports, journal entries, related assets, or gallery images yet.'}
        </div>
      )}

      {assets && totalCount > 0 && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <AssetGroup title={zh ? '观点' : 'Points'} count={pointCount} icon={<FileText size={13} />}>
            {assets.points.length > 0 ? (
              assets.points.slice(0, 4).map((point) => (
                <div key={point.id} className="rounded-md border border-border bg-bg px-3 py-2">
                  <div className="mb-1 flex items-center gap-1.5 text-[11px] text-fg-faint">
                    <span>{point.tagType ?? (zh ? '未分类' : 'Uncategorized')}</span>
                    {point.starred && <span className="text-accent">{zh ? '已收藏' : 'Starred'}</span>}
                  </div>
                  <p className="line-clamp-2 text-xs leading-relaxed text-fg-muted">{point.content}</p>
                </div>
              ))
            ) : (
              <EmptyAssetGroup text={zh ? '暂无关联观点' : 'No linked points'} />
            )}
          </AssetGroup>

          <AssetGroup title={zh ? '证据' : 'Evidence'} count={evidenceCount} icon={<ShieldCheck size={13} />}>
            {assets.evidence.length > 0 ? (
              assets.evidence.slice(0, 3).map((record) => {
                const evidenceSourceId = record.sourceId
                return (
                  <div key={record.id} className="rounded-md border border-border bg-bg px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-xs font-medium text-fg">{record.claim}</p>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-fg-muted">{record.answer}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onExportEvidence(record)}
                        className="shrink-0 rounded-md border border-border px-1.5 py-1 text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent"
                        title={zh ? '导出证据' : 'Export evidence'}
                      >
                        <Download size={12} />
                      </button>
                    </div>
                    {evidenceSourceId && (
                      <button
                        type="button"
                        onClick={() => onOpenSource(evidenceSourceId, record.chunkIndex)}
                        className="mt-2 text-[11px] text-accent hover:underline"
                      >
                        {zh ? '回到来源块' : 'Open source chunk'}
                      </button>
                    )}
                  </div>
                )
              })
            ) : (
              <EmptyAssetGroup text={zh ? '暂无证据' : 'No evidence'} />
            )}
          </AssetGroup>

          <AssetGroup title={zh ? '报告' : 'Reports'} count={reportCount} icon={<ScrollText size={13} />}>
            {assets.reports.length > 0 ? (
              assets.reports.slice(0, 3).map((report) => (
                <div key={report.id} className="rounded-md border border-border bg-bg px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-xs font-medium text-fg">{report.title}</p>
                      <p className="mt-1 text-[11px] text-fg-faint">{zh ? reportKindLabel(report.kind) : report.kind}</p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-fg-muted">{report.summary}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onExportReport(report)}
                      className="shrink-0 rounded-md border border-border px-1.5 py-1 text-fg-muted transition-colors hover:bg-bg-hover hover:text-accent"
                      title={zh ? '导出报告' : 'Export report'}
                    >
                      <Download size={12} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyAssetGroup text={zh ? '暂无引用当前来源的报告' : 'No reports cite this source'} />
            )}
          </AssetGroup>

          <AssetGroup title={zh ? '调查报告' : 'Investigations'} count={investigationCount} icon={<Sparkles size={13} />}>
            {assets.reports.some((report) => report.kind === 'investigation') ? (
              assets.reports
                .filter((report) => report.kind === 'investigation')
                .slice(0, 3)
                .map((report) => (
                  <div key={report.id} className="rounded-md border border-border bg-bg px-3 py-2">
                    <p className="line-clamp-1 text-xs font-medium text-fg">{report.title}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-fg-muted">{report.summary}</p>
                  </div>
                ))
            ) : (
              <EmptyAssetGroup text={zh ? '暂无当前来源调查报告' : 'No investigation for this source'} />
            )}
          </AssetGroup>

          <AssetGroup title={zh ? '画廊' : 'Gallery'} count={galleryCount} icon={<Images size={13} />}>
            {assets.gallery.length > 0 ? (
              assets.gallery.slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-md border border-border bg-bg px-3 py-2">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-fg-faint">
                    <span>{item.downloadStatus}</span>
                    <span>{item.pointIds.length} {zh ? '个观点' : 'Points'}</span>
                  </div>
                  <p className="line-clamp-2 text-xs leading-relaxed text-fg-muted">{item.prompt}</p>
                </div>
              ))
            ) : (
              <EmptyAssetGroup text={zh ? '暂无来源关联图片' : 'No linked images'} />
            )}
          </AssetGroup>

          <AssetGroup title={zh ? '日志' : 'Journal'} count={journalEntries.length} icon={<FileText size={13} />}>
            {journalEntries.length > 0 ? (
              journalEntries.slice(0, 3).map((entry) => (
                <div key={entry.id} className={cn('rounded-md border border-border bg-bg px-3 py-2', entry.invalidatedAt && 'opacity-70')}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-fg-faint">
                    <span>{formatHistoryDate(entry.createdAt)}</span>
                    {entry.invalidatedAt && <span className="text-red-300">{zh ? '失效' : 'Invalidated'}</span>}
                  </div>
                  <p className="line-clamp-1 text-xs font-medium text-fg">{entry.query}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-fg-muted">{entry.note}</p>
                </div>
              ))
            ) : (
              <EmptyAssetGroup text={zh ? '暂无来源相关日志' : 'No related journal entries'} />
            )}
          </AssetGroup>

          <AssetGroup title={zh ? '相关资产' : 'Related'} count={relations.length} icon={<Link2 size={13} />}>
            {relations.length > 0 ? (
              relations.slice(0, 3).map((relation) => (
                <div key={relation.id} className="rounded-md border border-border bg-bg px-3 py-2">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-fg-faint">
                    <span>{relation.toKind}</span>
                    <span>{relation.relation}</span>
                  </div>
                  <p className="line-clamp-1 text-xs font-medium text-fg">{relation.toId}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-fg-muted">{relation.reason}</p>
                </div>
              ))
            ) : (
              <EmptyAssetGroup text={zh ? '暂无相关资产' : 'No related assets'} />
            )}
          </AssetGroup>
        </div>
      )}
      </div>
    </section>
  )
}

function AssetGroup({ title, count, icon, children }: { title: string; count: number; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between text-xs text-fg-faint">
        <span className="inline-flex items-center gap-1.5">{icon}{title}</span>
        <span>{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function EmptyAssetGroup({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-border bg-bg px-3 py-3 text-center text-xs text-fg-faint">
      {text}
    </div>
  )
}

function downloadMarkdownFile(fileName: string, markdown: string) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

// ── Drawer ─────────────────────────────────────────────────────────────────
function ChunkDrawer({ entry, depth, inactiveCount, active, commentatorEmoji, commentatorName, onClose, onSelect }: ChunkDrawerProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const { card } = entry
  const displayCommentatorEmoji = card.commentatorEmoji ?? commentatorEmoji
  const displayCommentatorName = card.commentatorName ?? commentatorName
  const showMore = useScrollMoreHint(contentRef, `${active}-${card.summary}-${card.hotTake}-${card.labels.length}`)
  const tabTop = `calc(50% - ${inactiveCount * 25}px + ${depth * 50}px)`
  const tabTitle = analysisTabTitle(card.text)
  const CATEGORY_COLOR: Record<string, string> = {
    '事实': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    '观点': 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    '中间混淆形态': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    '规范性/分析性': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    '修辞性': 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  }
  return (
    <motion.div
      initial={active ? { x: 34, y: '-50%', opacity: 0, scale: 0.96 } : { x: 24, opacity: 0 }}
      animate={{
        x: 0,
        y: active ? '-50%' : 0,
        opacity: 1,
        scale: 1,
      }}
      whileHover={active ? undefined : { x: -8 }}
      exit={active ? { x: 20, y: '-50%', opacity: 0, scale: 0.96 } : { x: 18, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      onClick={onSelect}
      title={active ? undefined : '点击切换到对应文本块'}
      style={{
        top: active ? '50%' : tabTop,
        zIndex: active ? 48 : 47 - depth,
        maxHeight: active ? 'min(72vh, 34rem)' : undefined,
      }}
      className={cn(
        active
          ? 'fixed right-4 flex w-[min(320px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl transition-colors'
          : 'fixed right-[21rem] flex h-11 w-16 cursor-pointer items-center rounded-l-lg border border-r-0 border-border/70 bg-bg-elevated/95 px-2 text-left shadow-xl transition-colors hover:border-accent/45 hover:bg-bg-hover'
      )}
    >
      {!active && (
        <>
          <span className="mr-1.5 h-2 w-2 shrink-0 rounded-full bg-accent/70 shadow-[0_0_10px_rgba(250,204,21,0.42)]" />
          <span className="min-w-0 truncate text-xs font-medium text-fg-muted">{tabTitle}</span>
        </>
      )}
      {active && <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <span className="min-w-0 truncate text-sm font-medium text-fg">{entry.title}</span>
        <button
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          className="rounded-md p-1 text-fg-muted hover:bg-bg-hover transition-colors"
        >
          <X size={16} />
        </button>
      </div>}
      {active && <div className="relative min-h-0 flex-1 overflow-hidden">
        <div ref={contentRef} className="max-h-[calc(72vh-3.25rem)] space-y-5 overflow-y-auto overscroll-contain px-5 pb-16 pt-4 [&::-webkit-scrollbar]:hidden">
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-fg-faint">总结</p>
            <p className="text-sm leading-relaxed text-fg">{card.summary}</p>
          </div>
          <div className="rounded-xl border border-border bg-bg px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">{displayCommentatorEmoji}</span>
              <span className="text-xs font-medium text-fg-muted">{displayCommentatorName} 说</span>
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
        <ScrollMoreHint visible={showMore} />
      </div>}
    </motion.div>
  )
}

function AnalysisLink({ sourceElement }: AnalysisLinkProps) {
  const [points, setPoints] = useState<{ x: number; y: number; targetX: number; targetY: number } | null>(null)

  useEffect(() => {
    if (!sourceElement) {
      setPoints(null)
      return
    }

    let frame = 0
    let alive = true

    const update = () => {
      if (!alive) return
      const rect = sourceElement.getBoundingClientRect()
      const cardWidth = Math.min(320, window.innerWidth - 32)
      setPoints({
        x: rect.right + 8,
        y: rect.top + rect.height / 2,
        targetX: window.innerWidth - cardWidth - 16,
        targetY: window.innerHeight / 2,
      })
      frame = window.requestAnimationFrame(update)
    }

    update()
    return () => {
      alive = false
      window.cancelAnimationFrame(frame)
    }
  }, [sourceElement])

  if (points === null) return null

  const controlX = Math.max(points.x + 46, points.targetX - 136)
  const path = `M ${points.x} ${points.y} C ${controlX} ${points.y}, ${controlX} ${points.targetY}, ${points.targetX} ${points.targetY}`

  return (
    <svg className="pointer-events-none fixed inset-0 z-[39]" aria-hidden>
      <defs>
        <linearGradient id="analysis-link-gradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="32%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="62%" stopColor="rgba(226,232,240,1)" />
          <stop offset="100%" stopColor="rgba(148,163,184,0.72)" />
        </linearGradient>
        <filter id="analysis-link-glow">
          <feGaussianBlur stdDeviation="3.1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <motion.path
        d={path}
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="9"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0.28, 0.58, 0.32] }}
        exit={{ pathLength: 0, opacity: 0 }}
        transition={{
          pathLength: { duration: 0.22, ease: 'easeOut' },
          opacity: { duration: 0.95, repeat: Infinity, ease: 'easeInOut' },
        }}
      />
      <motion.path
        d={path}
        fill="none"
        stroke="url(#analysis-link-gradient)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray="9 11"
        filter="url(#analysis-link-glow)"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: [0.55, 1, 0.66], strokeDashoffset: [0, -56] }}
        exit={{ pathLength: 0, opacity: 0 }}
        transition={{
          pathLength: { duration: 0.26, ease: 'easeOut' },
          opacity: { duration: 0.82, repeat: Infinity, ease: 'easeInOut' },
          strokeDashoffset: { duration: 0.9, repeat: Infinity, ease: 'linear' },
        }}
      />
      <motion.circle
        cx={points.x}
        cy={points.y}
        r="5.5"
        fill="rgba(255,255,255,0.92)"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0.75, 1.65, 0.75], opacity: [0.48, 1, 0.48] }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ duration: 0.72, repeat: Infinity, ease: 'easeInOut' }}
        filter="url(#analysis-link-glow)"
      />
      <motion.circle
        cx={points.targetX}
        cy={points.targetY}
        r="4"
        fill="rgba(226,232,240,0.9)"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0.8, 1.4, 0.8], opacity: [0.42, 0.95, 0.42] }}
        exit={{ scale: 0, opacity: 0 }}
        transition={{ duration: 0.78, repeat: Infinity, ease: 'easeInOut' }}
        filter="url(#analysis-link-glow)"
      />
    </svg>
  )
}

const ANNOTATION_CLASSES: Record<AnnotationKind, string> = {
  fact: 'decoration-[#00A4EF]/80 decoration-2 underline underline-offset-[5px] hover:text-[#7dd8ff]',
  data: 'rounded bg-[#7FBA00]/14 px-0.5 hover:bg-[#7FBA00]/20',
  viewpoint: 'decoration-[#F25022]/80 decoration-wavy decoration-2 underline underline-offset-[5px]',
  quote: 'decoration-[#FFB900]/80 decoration-2 underline underline-offset-[5px]',
  poem: 'decoration-[#7373d9]/75 decoration-2 underline underline-offset-[5px]',
  description: 'decoration-[#7373d9]/55 decoration-2 underline underline-offset-[5px]',
}

function countNumericTokens(text: string) {
  return text.match(/[0-9０-９]+(?:[.,，]\d+)?|[一二三四五六七八九十百千万亿]+(?=年|月|日|%|％|人|个|家|元|岁|倍|成|分)/g)?.length ?? 0
}

function classifyAnnotation(sentence: string): AnnotationKind | null {
  const trimmed = sentence.trim()
  if (Array.from(trimmed).length < 10) return null
  if (countNumericTokens(trimmed) > 3) return 'data'
  if (/报道|报道称|公开|数据显示|统计|发布|根据|来源|指出|称|调查|研究|报告|新闻|公告|披露/.test(trimmed)) return 'fact'
  if (/[“”"『』「」‘’]/.test(trimmed)) return 'quote'
  if (/认为|主张|应该|必须|意味着|说明|问题在于|关键是|本质上|值得注意|真正的/.test(trimmed)) return 'viewpoint'
  if (/诗曰|词曰|写道|诗句|古诗|原文为/.test(trimmed)) return 'poem'
  if (/形容|描写|呈现出|场景是|画面是/.test(trimmed)) return 'description'
  return null
}

function findTextAnnotations(text: string): TextAnnotation[] {
  const annotations: TextAnnotation[] = []
  const counts: Record<AnnotationKind, number> = {
    fact: 0,
    data: 0,
    viewpoint: 0,
    quote: 0,
    poem: 0,
    description: 0,
  }
  const sentenceRe = /[^。！？!?；;\n]+[。！？!?；;]?/g
  let match: RegExpExecArray | null

  while ((match = sentenceRe.exec(text)) !== null && annotations.length < 9) {
    const sentence = match[0]
    const kind = classifyAnnotation(sentence)
    if (!kind) continue
    if (kind !== 'data' && counts[kind] >= 3) continue

    const rawStart = match.index
    const leading = sentence.length - sentence.trimStart().length
    const trimmed = sentence.trim()
    const chars = Array.from(trimmed)
    if (chars.length < 10) continue

    const visibleText = chars.length > 120 ? chars.slice(0, 120).join('') : trimmed
    const start = rawStart + leading
    const end = start + visibleText.length
    if (annotations.some((item) => start < item.end && end > item.start)) continue
    annotations.push({ start, end, kind, clickable: kind === 'fact' || kind === 'data' })
    counts[kind] += 1
  }

  return annotations
}

const DEFAULT_ANNOTATION_COLORS: AnnotationColors = {
  underline: '#00A4EF',
  wavy: '#F25022',
  highlight: '#FFB900',
}

function colorWithAlpha(hex: string, alpha: number) {
  const normalized = hex.trim()
  const match = /^#?([0-9a-f]{6})$/i.exec(normalized)
  if (!match) return normalized
  const value = match[1]
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function manualAnnotationClass(kind: UserAnnotationKind) {
  if (kind === 'highlight') return 'rounded px-0.5'
  if (kind === 'comment') return 'rounded border-b border-dotted bg-[#7FBA00]/10 px-0.5'
  return 'underline decoration-2 underline-offset-[5px]'
}

function manualAnnotationStyle(kind: UserAnnotationKind, colors: AnnotationColors): CSSProperties {
  if (kind === 'wavy') {
    return { textDecorationStyle: 'wavy', textDecorationColor: colors.wavy }
  }
  if (kind === 'line') {
    return { textDecorationColor: colors.underline }
  }
  if (kind === 'highlight') {
    return { backgroundColor: colorWithAlpha(colors.highlight, 0.2) }
  }
  return { borderBottomColor: colors.highlight }
}

function CommentAnnotationMark({ claim, annotation, colors }: {
  claim: string
  annotation: UserTextAnnotation
  colors: AnnotationColors
}) {
  const [open, setOpen] = useState(false)
  const popupRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const comment = annotation.comment?.trim()

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (popupRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [open])

  return (
    <span className="relative inline">
      <span
        className={cn('transition-colors', manualAnnotationClass(annotation.kind))}
        style={manualAnnotationStyle(annotation.kind, colors)}
      >
        {claim}
      </span>
      {comment && (
        <span className="relative inline-block">
          <button
            ref={buttonRef}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setOpen(value => !value)
            }}
            title="查看 Comment"
            aria-label="查看 Comment"
            className="relative -top-1 ml-0.5 inline-flex align-super text-[0.5em] text-zinc-200 drop-shadow-[0_0_5px_rgba(226,232,240,0.85)] transition-transform hover:scale-125"
          >
            <motion.span
              animate={{ opacity: [0.45, 1, 0.6], scale: [0.88, 1.22, 0.96] }}
              transition={{ duration: 1.35, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Star size={10} fill="currentColor" />
            </motion.span>
          </button>
          <AnimatePresence>
            {open && (
              <motion.span
                ref={popupRef}
                initial={{ opacity: 0, y: 4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 3, scale: 0.97 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
                className="absolute left-1 top-4 z-[72] block w-max max-w-[min(300px,calc(100vw-2rem))] rounded-lg border border-border bg-bg-elevated/88 px-3 py-2 text-xs leading-relaxed text-fg shadow-xl backdrop-blur-md"
              >
                <span className="whitespace-pre-wrap">{comment}</span>
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      )}
    </span>
  )
}

function FactCheckInlineStar({ loading, onOpen }: { loading: boolean; onOpen: (anchor: HTMLElement) => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onOpen(event.currentTarget)
      }}
      title={loading ? '事实审查运行中，点击展开' : '查看事实审查'}
      aria-label={loading ? '事实审查运行中，点击展开' : '查看事实审查'}
      className="relative -top-1 ml-0.5 inline-flex align-super text-[0.52em] text-cyan-100 transition-transform hover:scale-125"
    >
      <motion.span
        animate={loading
          ? {
              opacity: [0.35, 1, 0.42],
              scale: [0.78, 1.34, 0.9],
              filter: [
                'drop-shadow(0 0 4px rgba(103,232,249,0.45))',
                'drop-shadow(0 0 12px rgba(103,232,249,0.95))',
                'drop-shadow(0 0 5px rgba(103,232,249,0.5))',
              ],
            }
          : { opacity: [0.52, 0.9, 0.52], scale: [0.92, 1.12, 0.92] }}
        transition={{ duration: loading ? 0.88 : 1.45, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Star size={11} fill="currentColor" />
      </motion.span>
    </button>
  )
}

function AnnotatedTextContent({ content, blockIndex, onFactCheck, userAnnotations = [], annotationColors = DEFAULT_ANNOTATION_COLORS, activeFactCheck }: {
  content: string
  blockIndex: number
  onFactCheck?: (claim: string, context: string, anchor: HTMLElement, range: FactCheckTextRange) => void
  userAnnotations?: UserTextAnnotation[]
  annotationColors?: AnnotationColors
  activeFactCheck?: FactCheckInlineMarker | null
}) {
  const colors = annotationColors
  const factMarker = activeFactCheck?.blockIndex === blockIndex ? activeFactCheck : null
  const annotations = useMemo(() => {
    const manual = userAnnotations
      .filter((item) => item.start >= 0 && item.end > item.start && item.end <= content.length)
      .sort((a, b) => a.start - b.start || a.end - b.end)
    const auto = findTextAnnotations(content).filter((item) =>
      !manual.some((manualItem) => item.start < manualItem.end && item.end > manualItem.start)
    )
    return [
      ...manual.map((item) => ({ ...item, source: 'manual' as const, clickable: false })),
      ...auto.map((item) => ({ ...item, id: `auto-${item.start}-${item.end}-${item.kind}`, source: 'auto' as const })),
    ].sort((a, b) => a.start - b.start || a.end - b.end)
  }, [content, userAnnotations])
  if (annotations.length === 0 && !factMarker) return <MarkdownContent content={content} />

  const renderFactMarker = (start: number, end: number) => {
    if (!factMarker || factMarker.start !== start || factMarker.end !== end) return null
    return <FactCheckInlineStar loading={factMarker.loading} onOpen={factMarker.onOpen} />
  }

  const nodes: ReactNode[] = []
  let cursor = 0
  const renderAnnotations = factMarker && !annotations.some((item) => item.start === factMarker.start && item.end === factMarker.end)
    ? [...annotations, { ...factMarker, id: `fact-marker-${factMarker.blockIndex}-${factMarker.start}-${factMarker.end}`, kind: 'fact' as const, clickable: false, source: 'auto' as const }]
        .sort((a, b) => a.start - b.start || a.end - b.end)
    : annotations

  renderAnnotations.forEach((annotation, index) => {
    if (annotation.start > cursor) {
      nodes.push(<span key={`t-${index}`}>{content.slice(cursor, annotation.start)}</span>)
    }
    if (annotation.start < cursor) return

    const claim = content.slice(annotation.start, annotation.end)
    if (annotation.source === 'manual') {
      nodes.push(annotation.kind === 'comment'
        ? <CommentAnnotationMark key={annotation.id} claim={claim} annotation={annotation} colors={colors} />
        : (
          <span
            key={annotation.id}
            className={cn('transition-colors', manualAnnotationClass(annotation.kind))}
            style={manualAnnotationStyle(annotation.kind, colors)}
          >
            {claim}
            {renderFactMarker(annotation.start, annotation.end)}
          </span>
        )
      )
      cursor = annotation.end
      return
    }

    const className = cn(
      'transition-colors',
      ANNOTATION_CLASSES[annotation.kind],
      annotation.clickable && onFactCheck && 'cursor-pointer rounded-sm hover:bg-bg-hover'
    )
    if (annotation.clickable && onFactCheck) {
      nodes.push(
        <button
          key={`a-${index}`}
          type="button"
          title="事实查询"
          className={cn('inline text-left align-baseline', className)}
          onClick={(event) => {
            event.stopPropagation()
            onFactCheck(claim, content, event.currentTarget, { blockIndex, start: annotation.start, end: annotation.end })
          }}
        >
          {claim}
          {renderFactMarker(annotation.start, annotation.end)}
        </button>
      )
    } else {
      nodes.push(<span key={`a-${index}`} className={className}>{claim}{renderFactMarker(annotation.start, annotation.end)}</span>)
    }
    cursor = annotation.end
  })

  if (cursor < content.length) nodes.push(<span key="t-end">{content.slice(cursor)}</span>)

  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed">
      {nodes}
    </div>
  )
}

function HighlightedSourceText({ segments, label }: { segments: SourceHighlightSegment[]; label?: string | null }) {
  return (
    <div className="whitespace-pre-wrap text-sm leading-relaxed">
      {segments.map((segment, index) => segment.kind === 'match' ? (
        <mark
          key={`highlight-${index}`}
          title={label ? `引用 ${label}` : '引用命中'}
          className="rounded-sm bg-amber-300/25 px-0.5 text-amber-100 ring-1 ring-amber-300/45 shadow-[0_0_18px_rgba(251,191,36,0.2)]"
        >
          {segment.text}
        </mark>
      ) : (
        <span key={`text-${index}`}>{segment.text}</span>
      ))}
    </div>
  )
}

function FactCheckBubble({ bubble, onClose, onSave }: { bubble: FactBubbleState; onClose: () => void; onSave: () => void }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight
  const left = Math.min(Math.max(bubble.x - 150, 16), Math.max(viewportWidth - 388, 16))
  const maxHeight = Math.max(240, Math.min(520, viewportHeight - 32))
  const top = Math.min(Math.max(bubble.y + 18, 16), Math.max(viewportHeight - maxHeight - 16, 16))
  const showMore = useScrollMoreHint(contentRef, `${bubble.loading}-${bubble.error ?? ''}-${bubble.result?.answer ?? ''}`)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      className="fixed z-[92] flex w-[min(360px,calc(100vw-2rem))] flex-col rounded-2xl border border-accent/35 bg-bg-elevated p-4 text-sm shadow-[0_18px_52px_rgba(0,0,0,0.42)]"
      style={{ left, top, maxHeight }}
    >
      <span className="absolute -top-2 left-12 h-4 w-4 rotate-45 border-l border-t border-accent/35 bg-bg-elevated" />
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-accent">事实查询</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-muted">{bubble.claim}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg">
          <X size={15} />
        </button>
      </div>
      <div ref={contentRef} className="relative min-h-0 flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden">
        {bubble.loading && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-3 text-xs text-fg-muted">
            <Loader2 size={13} className="animate-spin text-accent" />
            调用搜索模型核查中…
          </div>
        )}
        {bubble.error && !bubble.loading && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {bubble.error}
          </div>
        )}
        {bubble.result && !bubble.loading && (
          <div className="space-y-3 pb-7">
            <div className="rounded-xl border border-border bg-bg px-3 py-2">
              <p className="text-sm leading-relaxed text-fg">{bubble.result.answer}</p>
            </div>
            {bubble.result.extra.length > 0 && (
              <div className="space-y-1">
                {bubble.result.extra.slice(0, 4).map((item, index) => (
                  <p key={index} className="text-xs leading-relaxed text-fg-muted">· {item}</p>
                ))}
              </div>
            )}
            {bubble.result.sources.length > 0 && (
              <div>
                <p className="mb-2 text-xs text-fg-faint">来源</p>
                <div className="flex flex-wrap gap-2">
                  {bubble.result.sources.map((source, index) => (
                    <button
                      key={`${source.url}-${index}`}
                      type="button"
                      onClick={() => setPreviewUrl(source.url)}
                      title={`${source.title}\n${source.url}\n${source.snippet}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-accent/35 bg-accent/10 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onSave}
                disabled={bubble.saving || bubble.saved}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                  bubble.saved
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-border text-fg-muted hover:bg-bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-60'
                )}
              >
                {bubble.saved ? '已存为证据' : bubble.saving ? '保存中' : '保存为证据'}
              </button>
            </div>
            {bubble.saveError && (
              <p className="text-right text-xs text-red-300">{bubble.saveError}</p>
            )}
          </div>
        )}
      </div>
      <ScrollMoreHint visible={showMore} />
      <ExternalLinkPreview url={previewUrl} onClose={() => setPreviewUrl(null)} />
    </motion.div>
  )
}

function CommentDialog({ state, value, saving, onChange, onCancel, onSave }: {
  state: CommentDialogState
  value: string
  saving: boolean
  onChange: (value: string) => void
  onCancel: () => void
  onSave: () => void
}) {
  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth
  const left = Math.min(Math.max(state.x - 150, 16), Math.max(viewportWidth - 348, 16))
  const top = Math.max(state.y - 8, 16)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 360, damping: 30 }}
      className="fixed z-[94] w-[min(320px,calc(100vw-2rem))] rounded-xl border border-border bg-bg-elevated p-3 text-sm shadow-[0_18px_52px_rgba(0,0,0,0.42)]"
      style={{ left, top }}
    >
      <p className="text-xs font-medium text-fg">Comment</p>
      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-fg-faint">{state.text}</p>
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={3}
        autoFocus
        placeholder="写下你的评论…"
        className="mt-2 w-full resize-none rounded-lg border border-border bg-bg px-2.5 py-2 text-sm leading-relaxed text-fg outline-none placeholder:text-fg-faint focus:border-accent"
      />
      {state.error && <p className="mt-1.5 text-xs text-red-400">{state.error}</p>}
      <div className="mt-2.5 flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-border px-2.5 py-1 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || value.trim().length === 0}
          className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? '保存中' : '保存'}
        </button>
      </div>
    </motion.div>
  )
}

function SelectionToolbar({ state, onFactCheck, onMark, onClose, annotationColors = DEFAULT_ANNOTATION_COLORS }: {
  state: SelectionToolbarState
  onFactCheck: () => void
  onMark: (kind: 'wavy' | 'line' | 'highlight' | 'comment') => void
  onClose: () => void
  annotationColors?: AnnotationColors
}) {
  const colors = annotationColors
  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth
  const left = Math.min(Math.max(state.x - 170, 12), Math.max(viewportWidth - 360, 12))
  const top = Math.max(state.y - 46, 12)

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.96 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="fixed z-[93] flex max-w-[calc(100vw-1.5rem)] items-center gap-1 rounded-xl border border-border bg-bg-elevated/98 p-1 shadow-2xl backdrop-blur"
      style={{ left, top }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <button type="button" onClick={onFactCheck} className="rounded-lg px-2.5 py-1.5 text-xs text-emerald-300 transition-colors hover:bg-bg-hover">
        事实审查
      </button>
      <button type="button" onClick={() => onMark('wavy')} className="rounded-lg px-2 py-1.5 text-xs text-fg-muted underline decoration-wavy decoration-2 underline-offset-4 transition-colors hover:bg-bg-hover hover:text-fg" style={{ textDecorationColor: colors.wavy }}>
        波浪线
      </button>
      <button type="button" onClick={() => onMark('line')} className="rounded-lg px-2 py-1.5 text-xs text-fg-muted underline decoration-2 underline-offset-4 transition-colors hover:bg-bg-hover hover:text-fg" style={{ textDecorationColor: colors.underline }}>
        横线
      </button>
      <button type="button" onClick={() => onMark('highlight')} className="rounded-lg px-2 py-1.5 text-xs text-fg transition-colors hover:bg-bg-hover" style={{ backgroundColor: colorWithAlpha(colors.highlight, 0.16) }}>
        高亮
      </button>
      <button type="button" onClick={() => onMark('comment')} className="rounded-lg px-2 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg">
        Comment
      </button>
      <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-fg-faint transition-colors hover:bg-bg-hover hover:text-fg">
        <X size={13} />
      </button>
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
  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 720 : window.innerHeight
  const spreadX = viewportWidth * 0.46
  const spreadY = viewportHeight * 0.44

  return (
    <motion.div
      key={burstKey}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[90] overflow-hidden"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 1.55, delay: 0.36, ease: 'easeOut' }}
    >
      <div className="absolute left-1/2 top-1/2 h-0 w-0">
        {[0, 1, 2].map((ring) => (
          <motion.div
            key={ring}
            className="absolute -left-10 -top-10 h-20 w-20 rounded-full border border-amber-300/55 shadow-[0_0_36px_rgba(250,204,21,0.28)]"
            initial={{ opacity: 0.85, scale: 0.15 }}
            animate={{ opacity: 0, scale: 5.2 + ring * 1.5 }}
            transition={{ duration: 0.9 + ring * 0.16, delay: ring * 0.04, ease: 'easeOut' }}
          />
        ))}
        {CONFETTI_PIECES.map((piece, index) => {
          const angle = (index / CONFETTI_PIECES.length) * Math.PI * 2 - Math.PI / 2
          const distanceX = spreadX * (0.72 + (index % 4) * 0.08)
          const distanceY = spreadY * (0.66 + (index % 5) * 0.07)
          const x = Math.cos(angle) * distanceX
          const y = Math.sin(angle) * distanceY

          return (
            <motion.span
              key={`${piece.x}-${piece.y}-${index}`}
              className={cn('absolute left-0 top-0 rounded-sm shadow-[0_0_16px_rgba(255,255,255,0.2)]', piece.c)}
              style={{ width: piece.w, height: piece.h }}
              initial={{ opacity: 0, x: 0, y: 0, rotate: 0, scale: 0.35 }}
              animate={{
                opacity: [0, 1, 1, 0],
                x: [0, x * 0.48, x],
                y: [0, y * 0.48, y],
                rotate: [0, piece.r * 0.62, piece.r],
                scale: [0.45, 1.1, 0.9],
              }}
              transition={{ duration: 1.22, delay: piece.d, ease: 'easeOut' }}
            />
          )
        })}
        {STAR_BURST.map((spark, index) => (
          <motion.span
            key={`finish-star-${index}`}
            className="absolute left-0 top-0 text-amber-300"
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.2, rotate: 0 }}
            animate={{ opacity: [0, 1, 0], x: spark.x * 5.4, y: spark.y * 4.8, scale: 1.2, rotate: spark.rotate * 2 }}
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
function ThemeBlock({ card, index, starred, onOpen, onToggleStar, onAnalyze, onRegenerate, analyzing = false, analyzeError = null, displayText, muted = false, blockRef, onFactCheck, userAnnotations = [], annotationColors = DEFAULT_ANNOTATION_COLORS, activeFactCheck = null, sourceHighlight = null }: ThemeBlockProps) {
  const starRef = useRef<HTMLButtonElement>(null)
  const selectableText = displayText ?? card.text
  const highlightSegments = splitSourceHighlight(selectableText, sourceHighlight)
  const shouldRenderAnnotations = displayText !== undefined || userAnnotations.length > 0 || activeFactCheck?.blockIndex === index
  return (
    <motion.div
      ref={blockRef}
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
        <div className="relative" data-selectable-text="true" data-block-index={index}>
          {shouldRenderAnnotations ? (
            highlightSegments ? (
              <HighlightedSourceText segments={highlightSegments} label={sourceHighlight?.label ?? null} />
            ) : (
              <AnnotatedTextContent
                content={selectableText}
                blockIndex={index}
                onFactCheck={onFactCheck}
                userAnnotations={userAnnotations}
                annotationColors={annotationColors}
                activeFactCheck={activeFactCheck}
              />
            )
          ) : (
            highlightSegments ? (
              <HighlightedSourceText segments={highlightSegments} label={sourceHighlight?.label ?? null} />
            ) : (
              <MarkdownContent content={card.text} />
            )
          )}
        </div>
      </div>
      {(onOpen && onToggleStar) || onAnalyze ? (
        <motion.button
          ref={starRef}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.16, type: 'spring', stiffness: 400, damping: 15 }}
          onClick={() => {
            if (!starRef.current) return
            if (onOpen) onOpen(starRef.current)
            else onAnalyze?.(starRef.current)
          }}
          onDoubleClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (starRef.current) onRegenerate?.(starRef.current)
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (starRef.current && onToggleStar) onToggleStar(starRef.current)
          }}
          disabled={analyzing}
          className={cn(
            'shrink-0 rounded-full border p-2 shadow-lg transition-colors',
            onAnalyze
              ? analyzeError
                ? 'border-red-400/30 bg-red-500/5 text-red-300/70 hover:border-red-300/45 hover:bg-red-500/10 hover:text-red-200 disabled:opacity-60'
                : 'border-border bg-bg text-fg-faint hover:border-amber-400/25 hover:bg-amber-400/5 hover:text-amber-400/70 disabled:opacity-60'
              : starred
              ? 'border-amber-400/50 bg-amber-400/15 text-amber-400'
              : 'border-border bg-bg-elevated text-amber-400/60 hover:border-amber-400/40 hover:bg-amber-400/10 hover:text-amber-400'
          )}
          title={onAnalyze
            ? analyzeError ? `生成失败，点击重试：${analyzeError}` : '点击尝试生成 AI 解读'
            : analyzeError
              ? `重新生成失败，双击重试：${analyzeError}`
              : starred ? '单击查看 / 双击重新生成 / 右键取消采集' : '单击查看 / 双击重新生成 / 右键采集'}
        >
          {analyzing ? <Loader2 size={20} className="animate-spin" /> : <Star size={20} fill={starred ? 'currentColor' : 'none'} />}
        </motion.button>
      ) : null}
    </motion.div>
  )
}

function SourceImageBlock({ block, active, shouldDescribe, descriptions, setDescriptions, onOpenOriginal, onImageError }: {
  block: Extract<SourceBlock, { type: 'image' }>
  active: boolean
  shouldDescribe: boolean
  descriptions: Record<string, string | null | undefined>
  setDescriptions: Dispatch<SetStateAction<Record<string, string | null | undefined>>>
  onOpenOriginal?: (image: ImageViewerState) => void
  onImageError?: () => void
}) {
  const [failed, setFailed] = useState(false)
  const caption = block.caption ?? meaningfulCaption(block.alt)
  const generated = descriptions[block.src]
  const canDescribe = shouldDescribe && !caption && isRemoteImageSrc(block.src)

  useEffect(() => {
    setFailed(false)
  }, [block.src])

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

  if (failed) return null

  return (
    <div className="relative">
      <div
        className={cn(
          'overflow-hidden rounded-xl border border-border bg-bg',
          onOpenOriginal && 'cursor-zoom-in'
        )}
        onDoubleClick={() => onOpenOriginal?.({
          src: block.src,
          alt: block.alt || caption || '原文图片',
          caption: visibleCaption,
        })}
        title={onOpenOriginal ? '双击查看原图' : undefined}
      >
        <img
          src={block.src}
          alt={block.alt || caption || '原文图片'}
          className="aspect-video w-full object-contain"
          loading="lazy"
          onError={() => {
            setFailed(true)
            onImageError?.()
          }}
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

function SourceImageResultBlock({ block, index, shouldDescribeImages, imageDescriptions, setImageDescriptions, onOpenOriginal }: {
  block: Extract<SourceBlock, { type: 'image' }>
  index: number
  shouldDescribeImages: boolean
  imageDescriptions: Record<string, string | null | undefined>
  setImageDescriptions: Dispatch<SetStateAction<Record<string, string | null | undefined>>>
  onOpenOriginal: (image: ImageViewerState) => void
}) {
  const [hidden, setHidden] = useState(false)
  useEffect(() => setHidden(false), [block.src])
  if (hidden) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 58, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 250, damping: 24, delay: index * 0.02 }}
      className="group relative flex items-center gap-3"
    >
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-bg-elevated px-4 py-3 shadow-[0_12px_34px_rgba(0,0,0,0.18)]">
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
          onOpenOriginal={onOpenOriginal}
          onImageError={() => setHidden(true)}
        />
      </div>
      <div aria-hidden className="h-10 w-10 shrink-0" />
    </motion.div>
  )
}

function ImageLightbox({ image, onClose }: { image: ImageViewerState; onClose: () => void }) {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    setScale(1)
  }, [image.src])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/88"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/15 bg-black/40 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        title="关闭"
      >
        <X size={17} />
      </button>
      <div
        className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-xs text-white/70"
      >
        {Math.round(scale * 100)}%
      </div>
      <div
        className="max-h-[92vh] max-w-[92vw] overflow-auto overscroll-contain rounded-lg [&::-webkit-scrollbar]:hidden"
        onClick={(event) => event.stopPropagation()}
        onWheel={(event) => {
          event.preventDefault()
          const direction = event.deltaY > 0 ? -1 : 1
          setScale((value) => Math.min(8, Math.max(0.25, value + direction * 0.14)))
        }}
      >
        <motion.img
          src={image.src}
          alt={image.alt}
          draggable={false}
          className="block max-h-[88vh] max-w-[88vw] select-none object-contain"
          style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
        />
      </div>
      {image.caption && (
        <div className="pointer-events-none absolute bottom-12 left-1/2 max-w-[min(44rem,88vw)] -translate-x-1/2 text-center text-xs leading-relaxed text-white/55">
          {image.caption}
        </div>
      )}
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

function HistoryTile({ item, onActivate, onReanalyze, onArchive, onUnarchive, onDelete }: {
  item: ExploreHistoryItem
  onActivate: () => void
  onReanalyze: () => void
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
        <button
          onClick={(event) => {
            event.stopPropagation()
            onReanalyze()
          }}
          className="rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
          title="重新采集"
        >
          采集
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

function HistoryDrawer({ items, onClose, onActivate, onReanalyze, onArchive, onUnarchive, onDelete }: {
  items: ExploreHistoryItem[]
  onClose: () => void
  onActivate: (id: string) => void
  onReanalyze: (id: string) => void
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
                      onReanalyze={() => onReanalyze(item.id)}
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
                      onReanalyze={() => onReanalyze(item.id)}
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

function sourceTitle(source: SourceSummaryRecord): string {
  return source.title?.trim() || source.canonicalUri || '未命名来源'
}

function coerceSourceKind(kind: string): ExploreSourceMetadata['kind'] {
  if (kind === 'file' || kind === 'webpage' || kind === 'paste') return kind
  return 'paste'
}

function RecentSourcesDrawer({ sources, loading, onClose, onOpen }: {
  sources: SourceSummaryRecord[]
  loading: boolean
  onClose: () => void
  onOpen: (sourceId: string) => void
}) {
  return (
    <motion.div
      initial={{ x: '-100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '-100%', opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed left-0 top-0 z-50 flex h-full w-[390px] flex-col border-r border-border bg-bg-elevated shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <p className="text-sm font-medium text-fg">最近来源</p>
          <p className="mt-0.5 text-xs text-fg-faint">已持久化的文件和网页</p>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-fg-muted transition-colors hover:bg-bg-hover">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 [&::-webkit-scrollbar]:hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-fg-faint">
            <Loader2 size={15} className="animate-spin" />
            加载中…
          </div>
        ) : sources.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-fg-faint">
            <div>
              <Database size={30} className="mx-auto mb-2 opacity-40" />
              <p>暂无来源</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {sources.map((source) => {
              const KindIcon = sourceKindIcon(coerceSourceKind(source.kind))
              return (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => onOpen(source.id)}
                  className="flex w-full items-start gap-3 rounded-lg border border-border bg-bg px-4 py-3 text-left transition-colors hover:bg-bg-hover"
                >
                  <KindIcon size={15} className="mt-0.5 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{sourceTitle(source)}</span>
                    <span className="mt-1 block truncate text-[11px] text-fg-faint">{source.canonicalUri}</span>
                    <span className="mt-2 flex flex-wrap gap-2 text-[11px] text-fg-faint">
                      <span>{source.chunkCount} 块</span>
                      <span>{source.pointCount} 点</span>
                      <span>{source.starCount} 星</span>
                      <span>{formatHistoryDate(source.updatedAt)}</span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────
interface ExploreProps {
  sourceHighlight?: SourceHighlightRequest | null
  onSourceHighlightConsumed?: () => void
}

export default function Explore({ sourceHighlight = null, onSourceHighlightConsumed }: ExploreProps) {
  const {
    text,
    richHtml,
    chunkCards,
    contentPlan,
    analyzing,
    parsing,
    error,
    sourceId,
    sourceSummary,
    focusChunkIndex,
    sourceOpenVersion,
    sourceName,
    sourceUrl,
    sourceMetadata,
    setText,
    setRichContent,
    parseFile,
    fetchUrlContent,
    openSourceById,
    clearFocusChunk,
    reanalyzeCurrent,
    reset,
  } = useExploreStore()
  const history = useExploreHistoryStore()
  const { config, loaded } = useConfigStore()
  const { star, unstar, count: globalStarCount } = useStarStore()
  const fly = useStarFly()
  const blockRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const initialPresentation = initialExplorePresentation({
    hasContent: text.trim().length > 0 || Boolean(richHtml?.trim()) || chunkCards.length > 0,
    busy: analyzing || parsing,
  })
  const skipInitialRevealRef = useRef(initialPresentation.skipInitialReveal)

  const [dragging, setDragging] = useState(false)
  const [analysisStack, setAnalysisStack] = useState<AnalysisStackEntry[]>([])
  const [stageCompletedCount, setStageCompletedCount] = useState(initialPresentation.stageCompletedCount)
  const [revealedCount, setRevealedCount] = useState(initialPresentation.revealedCount)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [recentSourcesOpen, setRecentSourcesOpen] = useState(false)
  const [recentSources, setRecentSources] = useState<SourceSummaryRecord[]>([])
  const [recentSourcesLoading, setRecentSourcesLoading] = useState(false)
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null)
  const [imageDescriptions, setImageDescriptions] = useState<Record<string, string | null | undefined>>({})
  const [generationInProgress, setGenerationInProgress] = useState(false)
  const [completionBurstKey, setCompletionBurstKey] = useState<number | null>(null)
  const [adHocCards, setAdHocCards] = useState<Record<number, ChunkCard>>({})
  const [regeneratedCards, setRegeneratedCards] = useState<Record<number, ChunkCard>>({})
  const [adHocAnalyzing, setAdHocAnalyzing] = useState<Record<number, boolean>>({})
  const [adHocErrors, setAdHocErrors] = useState<Record<number, string>>({})
  const [factBubble, setFactBubble] = useState<FactBubbleState | null>(null)
  const [sourceAssets, setSourceAssets] = useState<SourceAssetsRecord | null>(null)
  const [sourceAssetsLoading, setSourceAssetsLoading] = useState(false)
  const [sourceAssetsError, setSourceAssetsError] = useState<string | null>(null)
  const [sourceJournalEntries, setSourceJournalEntries] = useState<JournalEntry[]>([])
  const [sourceRelations, setSourceRelations] = useState<AssetRelationRecord[]>([])
  const [sourceRelationsLoading, setSourceRelationsLoading] = useState(false)
  const [sourceAssetActionError, setSourceAssetActionError] = useState<string | null>(null)
  const [sourceInvestigationLoading, setSourceInvestigationLoading] = useState(false)
  const [sourceInvestigationPreparationLoading, setSourceInvestigationPreparationLoading] = useState(false)
  const [sourceInvestigationPreparationStatus, setSourceInvestigationPreparationStatus] = useState<string | null>(null)
  const [sourceReviewLoading, setSourceReviewLoading] = useState(false)
  const [sourceInvestigationResult, setSourceInvestigationResult] = useState<DigestResult | null>(null)
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null)
  const [commentDialog, setCommentDialog] = useState<CommentDialogState | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const [userAnnotations, setUserAnnotations] = useState<Record<number, UserTextAnnotation[]>>({})
  const [activeSourceHighlight, setActiveSourceHighlight] = useState<SourceHighlightRequest | null>(null)
  // index → saved point id (once a chunk has been saved+starred)
  const [savedIds, setSavedIds] = useState<Record<number, string>>({})

  useEffect(() => {
    setRegeneratedCards({})
  }, [sourceId, sourceOpenVersion])

  const busy = analyzing || parsing
  const sourceBlocks = useMemo(() => {
    const plannedBlocks = sourceBlocksFromContentPlan(contentPlan)
    return plannedBlocks.length > 0 ? plannedBlocks : parseSourceBlocks(richHtml, text, sourceUrl)
  }, [contentPlan, richHtml, sourceUrl, text])
  const hasContent = text.trim().length > 0 || sourceBlocks.length > 0 || chunkCards.length > 0 || busy
  const hasSourceBlocks = sourceBlocks.length > 0
  const valuableSourceIndexes = useMemo(() => new Set(
    sourceBlocks
      .map((block, index) => block.type === 'text' && isValuableTextBlock(block.text) ? index : -1)
      .filter((index) => index >= 0)
  ), [sourceBlocks])
  const isValuableSourceBlock = useCallback((index: number) => valuableSourceIndexes.has(index), [valuableSourceIndexes])
  const sourceResultItems = useMemo<SourceResultItem[]>(() => {
    let legacyTextIndex = 0
    const cardsByIndex = new Map(chunkCards.map((card) => [card.index, card]))
    return sourceBlocks.map((block, index) => {
      if (block.type === 'text') {
        const valuable = isValuableTextBlock(block.text)
        const canonicalCard = block.chunkIndex === undefined
          ? (valuable ? chunkCards[legacyTextIndex] ?? null : null)
          : cardsByIndex.get(block.chunkIndex) ?? null
        if (block.chunkIndex === undefined && valuable) legacyTextIndex += 1
        const card = canonicalCard ?? adHocCards[index] ?? null
        return { block, index, card, valuable }
      }
      return { block, index, card: null, valuable: false }
    })
  }, [adHocCards, chunkCards, sourceBlocks])
  const sourceInvestigationReadiness = useMemo(
    () => investigationReadinessForAssets(sourceAssets),
    [sourceAssets]
  )
  const investigationPreparationCandidates = useMemo<InvestigationPreparationCandidate[]>(() => {
    if (hasSourceBlocks) {
      const candidates: InvestigationPreparationCandidate[] = []
      for (const item of sourceResultItems) {
        if (item.block.type !== 'text' || !item.valuable) continue
        candidates.push({
          displayIndex: item.index,
          blockIndex: item.block.chunkIndex ?? item.index,
          text: item.block.text,
          card: item.card,
        })
      }
      return candidates.slice(0, INVESTIGATION_MAX_AUTO_ANALYSIS_BLOCKS)
    }

    return chunkCards
      .map((card, index) => ({
        displayIndex: index,
        blockIndex: Number.isFinite(card.index) && card.index >= 0 ? card.index : index,
        text: card.text,
        card,
      }))
      .slice(0, INVESTIGATION_MAX_AUTO_ANALYSIS_BLOCKS)
  }, [chunkCards, hasSourceBlocks, sourceResultItems])
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
  const annotationColors = useMemo<AnnotationColors>(() => ({
    underline: config?.annotationUnderlineColor || DEFAULT_ANNOTATION_COLORS.underline,
    wavy: config?.annotationWavyColor || DEFAULT_ANNOTATION_COLORS.wavy,
    highlight: config?.annotationHighlightColor || DEFAULT_ANNOTATION_COLORS.highlight,
  }), [config?.annotationHighlightColor, config?.annotationUnderlineColor, config?.annotationWavyColor])
  const shouldDescribeImages = supportsMultimodal(config)
  const displaySourceMetadata = useMemo(
    () => sourceMetadata ?? buildFallbackSourceMetadata(sourceName, sourceUrl, text),
    [sourceMetadata, sourceName, sourceUrl, text]
  )
  const activeFactCheckMarker = useMemo<FactCheckInlineMarker | null>(() => {
    if (
      !factBubble?.collapsed
      || factBubble.blockIndex === null
      || factBubble.start === null
      || factBubble.end === null
    ) {
      return null
    }

    return {
      blockIndex: factBubble.blockIndex,
      start: factBubble.start,
      end: factBubble.end,
      loading: factBubble.loading,
      onOpen: (anchor) => {
        const rect = anchor.getBoundingClientRect()
        setFactBubble((current) => current
          ? {
              ...current,
              x: rect.left + rect.width / 2,
              y: rect.bottom,
              collapsed: false,
            }
          : current
        )
      },
    }
  }, [factBubble])

  useEffect(() => {
    if (analyzing || parsing) {
      skipInitialRevealRef.current = false
      setAnalysisStack([])
      setImageViewer(null)
      setSavedIds({})
      setImageDescriptions({})
      setAdHocCards({})
      setAdHocAnalyzing({})
      setAdHocErrors({})
      setFactBubble(null)
      setSelectionToolbar(null)
      setCommentDialog(null)
      setCommentDraft('')
      setCommentSaving(false)
      setUserAnnotations({})
      setStageCompletedCount(0)
      setRevealedCount(0)
      setGenerationInProgress(true)
      setCompletionBurstKey(null)
    }
  }, [analyzing, parsing])

  useEffect(() => {
    if (globalStarCount === 0) setSavedIds({})
  }, [globalStarCount])

  useEffect(() => {
    if (history.activeVersion === 0) return

    skipInitialRevealRef.current = true
    setAnalysisStack([])
    setImageViewer(null)
    setStageCompletedCount(Number.MAX_SAFE_INTEGER)
    setRevealedCount(Number.MAX_SAFE_INTEGER)
    setGenerationInProgress(false)
    setCompletionBurstKey(null)
    setImageDescriptions({})
    setAdHocCards({})
    setAdHocAnalyzing({})
    setAdHocErrors({})
    setFactBubble(null)
    setSelectionToolbar(null)
    setCommentDialog(null)
    setCommentDraft('')
    setCommentSaving(false)
    setUserAnnotations({})
  }, [history.activeVersion])

  useEffect(() => {
    if (sourceOpenVersion === 0) return

    skipInitialRevealRef.current = true
    setAnalysisStack([])
    setImageViewer(null)
    setStageCompletedCount(Number.MAX_SAFE_INTEGER)
    setRevealedCount(Number.MAX_SAFE_INTEGER)
    setGenerationInProgress(false)
    setCompletionBurstKey(null)
    setImageDescriptions({})
    setAdHocCards({})
    setAdHocAnalyzing({})
    setAdHocErrors({})
    setFactBubble(null)
    setSelectionToolbar(null)
    setCommentDialog(null)
    setCommentDraft('')
    setCommentSaving(false)
    setUserAnnotations({})
  }, [sourceOpenVersion])

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
    if (skipInitialRevealRef.current) {
      skipInitialRevealRef.current = false
      setRevealedCount(Number.MAX_SAFE_INTEGER)
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
    if (!generationInProgress || showProcessing || resultTargetCount === 0) return

    setCompletionBurstKey(Date.now())
    setGenerationInProgress(false)
    const timer = window.setTimeout(() => setCompletionBurstKey(null), 1700)
    return () => window.clearTimeout(timer)
  }, [generationInProgress, resultTargetCount, showProcessing])

  useEffect(() => {
    const updateSelectionToolbar = () => {
      window.setTimeout(() => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          setSelectionToolbar(null)
          return
        }

        const text = selection.toString().replace(/\s+/g, ' ').trim()
        if (text.length < 2) {
          setSelectionToolbar(null)
          return
        }

        const range = selection.getRangeAt(0)
        const ancestor = range.commonAncestorContainer
        const element = ancestor instanceof Element ? ancestor : ancestor.parentElement
        const textBlock = element?.closest('[data-selectable-text="true"]')
        if (!(textBlock instanceof HTMLElement)) {
          setSelectionToolbar(null)
          return
        }

        const rect = range.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) return
        const blockIndex = Number(textBlock.dataset.blockIndex)
        if (!Number.isFinite(blockIndex)) {
          setSelectionToolbar(null)
          return
        }
        const start = selectionOffsetWithin(textBlock, range.startContainer, range.startOffset)
        const end = selectionOffsetWithin(textBlock, range.endContainer, range.endOffset)
        const normalizedStart = Math.min(start, end)
        const normalizedEnd = Math.max(start, end)
        if (normalizedEnd <= normalizedStart) {
          setSelectionToolbar(null)
          return
        }
        setSelectionToolbar({
          text,
          context: textBlock.textContent?.trim() ?? text,
          x: rect.left + rect.width / 2,
          y: rect.top,
          blockIndex,
          start: normalizedStart,
          end: normalizedEnd,
        })
      }, 0)
    }

    const hideSelectionToolbar = () => {
      setSelectionToolbar(null)
    }

    document.addEventListener('mouseup', updateSelectionToolbar)
    document.addEventListener('keyup', updateSelectionToolbar)
    window.addEventListener('scroll', hideSelectionToolbar, true)
    return () => {
      document.removeEventListener('mouseup', updateSelectionToolbar)
      document.removeEventListener('keyup', updateSelectionToolbar)
      window.removeEventListener('scroll', hideSelectionToolbar, true)
    }
  }, [])

  const runFactCheck = useCallback((claim: string, context: string, x: number, y: number, range?: FactCheckTextRange) => {
    const anchorState = {
      blockIndex: range?.blockIndex ?? null,
      start: range?.start ?? null,
      end: range?.end ?? null,
      collapsed: false,
    }
    const saved = findSavedFactCheck(claim, context)
    if (saved) {
      setFactBubble({ claim, context, loading: false, x, y, ...anchorState, result: saved })
      return
    }

    setFactBubble({ claim, context, loading: true, x, y, ...anchorState })
    factCheckClaim(claim, context)
      .then((result) => {
        setFactBubble((current) => {
          if (!current || current.claim !== claim) return current
          return { ...current, loading: false, result }
        })
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error || '事实查询失败')
        setFactBubble((current) => {
          if (!current || current.claim !== claim) return current
          return { ...current, loading: false, error: message }
        })
      })
  }, [])

  const handleSaveFactCheck = useCallback(() => {
    const current = factBubble
    if (!current?.result || current.saving || current.saved) return

    setFactBubble((existing) => existing?.claim === current.claim
      ? { ...existing, saving: true, saveError: undefined }
      : existing
    )
    saveEvidence(current.result, {
      sourceId,
      chunkIndex: current.blockIndex,
    })
      .then((evidence) => {
        saveFactCheckResult(current.claim, current.context, current.result!)
        if (evidence.sourceId === sourceId) {
          setSourceAssets((assets) => assets
            ? {
                ...assets,
                evidence: [
                  evidence,
                  ...assets.evidence.filter((record) => record.id !== evidence.id),
                ],
              }
            : assets
          )
        }
        setFactBubble((existing) => existing?.claim === current.claim
          ? { ...existing, saving: false, saved: true, evidenceId: evidence.id }
          : existing
        )
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error || '保存证据失败')
        setFactBubble((existing) => existing?.claim === current.claim
          ? { ...existing, saving: false, saveError: message }
          : existing
        )
      })
  }, [factBubble, sourceId])

  const handleSelectionFactCheck = useCallback(() => {
    if (!selectionToolbar) return
    runFactCheck(
      selectionToolbar.text,
      selectionToolbar.context,
      selectionToolbar.x,
      selectionToolbar.y,
      {
        blockIndex: selectionToolbar.blockIndex,
        start: selectionToolbar.start,
        end: selectionToolbar.end,
      }
    )
    setSelectionToolbar(null)
    window.getSelection()?.removeAllRanges()
  }, [runFactCheck, selectionToolbar])

  const addUserAnnotation = useCallback((selection: SelectionToolbarState, kind: UserAnnotationKind, comment?: string) => {
    const nextAnnotation: UserTextAnnotation = {
      id: `${selection.blockIndex}-${selection.start}-${selection.end}-${Date.now()}`,
      start: selection.start,
      end: selection.end,
      kind,
      comment,
    }
    setUserAnnotations((current) => ({
      ...current,
      [selection.blockIndex]: [
        ...(current[selection.blockIndex] ?? []).filter((item) =>
          !(nextAnnotation.start < item.end && nextAnnotation.end > item.start)
        ),
        nextAnnotation,
      ].sort((a, b) => a.start - b.start || a.end - b.end),
    }))
  }, [])

  const handleSelectionMark = useCallback((kind: 'wavy' | 'line' | 'highlight' | 'comment') => {
    if (!selectionToolbar) return

    if (kind === 'comment') {
      setCommentDialog(selectionToolbar)
      setCommentDraft('')
      setSelectionToolbar(null)
      window.getSelection()?.removeAllRanges()
      return
    }

    addUserAnnotation(selectionToolbar, kind)
    setSelectionToolbar(null)
    window.getSelection()?.removeAllRanges()
  }, [addUserAnnotation, selectionToolbar])

  const handleCancelComment = useCallback(() => {
    setCommentDialog(null)
    setCommentDraft('')
    setCommentSaving(false)
  }, [])

  const handleSaveComment = useCallback(async () => {
    if (!commentDialog || commentSaving) return
    const comment = commentDraft.trim()
    if (!comment) {
      setCommentDialog(current => current ? { ...current, error: '请输入 Comment' } : current)
      return
    }
    setCommentSaving(true)
    try {
      addUserAnnotation(commentDialog, 'comment', comment)
      await savePoints(
        [{ content: formatCommentKnowledgeContent(commentDialog, comment), tagType: '作者观点' }],
        sourceName ?? 'Comment',
        commentDialog.context
      )
      setCommentDialog(null)
      setCommentDraft('')
    } catch (error: unknown) {
      setCommentDialog(current => current ? {
        ...current,
        error: error instanceof Error ? error.message : '保存到知识库失败',
      } : current)
    } finally {
      setCommentSaving(false)
    }
  }, [addUserAnnotation, commentDialog, commentDraft, commentSaving, sourceName])

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
        const ids = await savePoints(
          [{ content: card.summary, tagType: tagTypeForChunkCard(card) }],
          sourceName,
          card.text,
          sourceId ? {
            sourceId,
            chunkIndex: card.index,
            anchorText: card.text,
          } : null
        )
        const pointId = ids[0]
        if (pointId) {
          await star(pointId)
          setSavedIds(m => ({ ...m, [index]: pointId }))
        }
      } catch {
        // silently fail
      }
    }
  }, [savedIds, sourceId, sourceName, fly, star, unstar])

  const scrollToBlock = useCallback((blockIndex: number) => {
    blockRefs.current[blockIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    })
  }, [])

  const sourceHighlightForBlock = useCallback((blockIndex: number, cardIndex: number | null = null): SourceHighlightRequest | null => {
    if (!activeSourceHighlight || !sourceId || activeSourceHighlight.sourceId !== sourceId) return null
    const targetChunkIndex = activeSourceHighlight.chunkIndex
    if (targetChunkIndex === null || targetChunkIndex === undefined) return activeSourceHighlight
    if (targetChunkIndex === blockIndex || targetChunkIndex === cardIndex) return activeSourceHighlight
    return null
  }, [activeSourceHighlight, sourceId])

  useEffect(() => {
    if (!sourceHighlight || !sourceId || sourceHighlight.sourceId !== sourceId) return
    setActiveSourceHighlight(sourceHighlight)
    const timer = window.setTimeout(() => {
      setActiveSourceHighlight((current) => current === sourceHighlight ? null : current)
      onSourceHighlightConsumed?.()
    }, 5200)
    return () => window.clearTimeout(timer)
  }, [onSourceHighlightConsumed, sourceHighlight, sourceId, sourceOpenVersion])

  useEffect(() => {
    if (focusChunkIndex === null || busy || showProcessing) return
    const timer = window.setTimeout(() => {
      scrollToBlock(focusChunkIndex)
      clearFocusChunk()
    }, 80)
    return () => window.clearTimeout(timer)
  }, [busy, clearFocusChunk, focusChunkIndex, scrollToBlock, showProcessing, visibleCards.length, visibleSourceItems.length])

  useEffect(() => {
    if (!sourceId) {
      setSourceAssets(null)
      setSourceAssetsLoading(false)
      setSourceAssetsError(null)
      return
    }
    let alive = true
    setSourceAssetsLoading(true)
    setSourceAssetsError(null)
    getSourceAssets(sourceId)
      .then((assets) => { if (alive) setSourceAssets(assets) })
      .catch((error: unknown) => {
        if (!alive) return
        setSourceAssets(null)
        setSourceAssetsError(exploreErrorMessage(
          error,
          config?.uiLanguage === 'en-US'
            ? 'Failed to load source assets. Please try again.'
            : '加载来源资产失败，请稍后重试。'
        ))
      })
      .finally(() => { if (alive) setSourceAssetsLoading(false) })
    return () => { alive = false }
  }, [config?.uiLanguage, sourceId, sourceOpenVersion])

  useEffect(() => {
    if (!sourceId) {
      setSourceJournalEntries([])
      setSourceRelations([])
      setSourceRelationsLoading(false)
      setSourceAssetActionError(null)
      return
    }

    let alive = true
    setSourceRelationsLoading(true)
    setSourceAssetActionError(null)
    Promise.allSettled([
      listRecentJournalEntries(),
      discoverRelatedAssets('source', sourceId),
    ])
      .then(([entriesResult, relationsResult]) => {
        if (!alive) return
        const errors: string[] = []
        if (entriesResult.status === 'fulfilled') {
          setSourceJournalEntries(entriesResult.value.filter((entry) => parseJsonStringArray(entry.sourceIdsJson).includes(sourceId)))
        } else {
          setSourceJournalEntries([])
          errors.push(exploreErrorMessage(entriesResult.reason, config?.uiLanguage === 'en-US' ? 'Failed to load source journal' : '加载来源日志失败'))
        }
        if (relationsResult.status === 'fulfilled') {
          setSourceRelations(relationsResult.value)
        } else {
          setSourceRelations([])
          errors.push(exploreErrorMessage(relationsResult.reason, config?.uiLanguage === 'en-US' ? 'Failed to load related assets' : '加载相关资产失败'))
        }
        setSourceAssetActionError(errors.length > 0 ? errors.join('；') : null)
      })
      .finally(() => { if (alive) setSourceRelationsLoading(false) })

    return () => { alive = false }
  }, [config?.uiLanguage, sourceId, sourceOpenVersion])

  const handleOpenCard = useCallback((card: ChunkCard, blockIndex: number, el: HTMLButtonElement) => {
    scrollToBlock(blockIndex)
    const rect = el.getBoundingClientRect()
    const anchor = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
    const id = `${blockIndex}:${card.index}`
    setAnalysisStack((current) => [
      ...current.filter((entry) => entry.id !== id),
      { id, card, anchor, blockIndex, title: analysisTitle(card.text) },
    ])
  }, [scrollToBlock])

  const handleSelectAnalysis = useCallback((id: string) => {
    setAnalysisStack((current) => {
      const selected = current.find((entry) => entry.id === id)
      if (!selected) return current
      scrollToBlock(selected.blockIndex)
      return [...current.filter((entry) => entry.id !== id), selected]
    })
  }, [scrollToBlock])

  const handleCloseAnalysis = useCallback((id: string) => {
    setAnalysisStack((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const handleAnalyzeBlock = useCallback(async (
    displayIndex: number,
    chunkIndex: number,
    blockText: string,
    el: HTMLButtonElement
  ) => {
    if (adHocAnalyzing[displayIndex]) return

    const existing = adHocCards[displayIndex]
    if (existing) {
      handleOpenCard(existing, displayIndex, el)
      return
    }

    setAdHocAnalyzing((current) => ({ ...current, [displayIndex]: true }))
    setAdHocErrors((current) => {
      const next = { ...current }
      delete next[displayIndex]
      return next
    })
    try {
      const card = await analyzeTextBlock(blockText, chunkIndex)
      setAdHocCards((current) => ({ ...current, [displayIndex]: card }))
      handleOpenCard(card, displayIndex, el)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error || '生成 AI 解读失败')
      setAdHocErrors((current) => ({ ...current, [displayIndex]: message }))
    } finally {
      setAdHocAnalyzing((current) => {
        const next = { ...current }
        delete next[displayIndex]
        return next
      })
    }
  }, [adHocAnalyzing, adHocCards, handleOpenCard])

  const handleRegenerateBlock = useCallback(async (
    blockIndex: number,
    card: ChunkCard,
    el: HTMLButtonElement,
    adHoc: boolean
  ) => {
    if (adHocAnalyzing[blockIndex]) return
    setAdHocAnalyzing((current) => ({ ...current, [blockIndex]: true }))
    setAdHocErrors((current) => {
      const next = { ...current }
      delete next[blockIndex]
      return next
    })
    try {
      const result = await analyzeTextBlock(card.text, card.index)
      const regenerated = { ...result, index: card.index }
      if (adHoc) {
        setAdHocCards((current) => ({ ...current, [blockIndex]: regenerated }))
      } else {
        setRegeneratedCards((current) => ({ ...current, [card.index]: regenerated }))
      }
      setAnalysisStack((current) => current.map((entry) =>
        entry.blockIndex === blockIndex && entry.card.index === card.index
          ? { ...entry, card: regenerated, title: analysisTitle(regenerated.text) }
          : entry
      ))
      handleOpenCard(regenerated, blockIndex, el)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error || '重新生成 AI 解读失败')
      setAdHocErrors((current) => ({ ...current, [blockIndex]: message }))
    } finally {
      setAdHocAnalyzing((current) => {
        const next = { ...current }
        delete next[blockIndex]
        return next
      })
    }
  }, [adHocAnalyzing, handleOpenCard])

  const handleFactCheck = useCallback((claim: string, context: string, anchor: HTMLElement, range: FactCheckTextRange) => {
    const rect = anchor.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.bottom
    runFactCheck(claim, context, x, y, range)
  }, [runFactCheck])

  // ── File picker ──────────────────────────────────────────────────────────
  const handlePick = async () => {
    const selected = await open({ multiple: false, filters: [{ name: '文档', extensions: SUPPORTED_EXTS }] })
    if (typeof selected === 'string') await parseFile(selected)
  }

  const handleChangeFile = () => {
    reset()
    setAnalysisStack([])
    setImageViewer(null)
    setHistoryOpen(false)
    setStageCompletedCount(0)
    setRevealedCount(0)
    setImageDescriptions({})
    setAdHocCards({})
    setAdHocAnalyzing({})
    setAdHocErrors({})
    setFactBubble(null)
    setSelectionToolbar(null)
    setUserAnnotations({})
    setGenerationInProgress(false)
    setCompletionBurstKey(null)
  }

  const handleOpenRecentSources = useCallback(async () => {
    setRecentSourcesOpen(true)
    setRecentSourcesLoading(true)
    try {
      setRecentSources(await listRecentSources())
    } finally {
      setRecentSourcesLoading(false)
    }
  }, [])

  const handleOpenRecentSource = useCallback(async (nextSourceId: string) => {
    const opened = await openSourceById(nextSourceId, null)
    if (opened) setRecentSourcesOpen(false)
  }, [openSourceById])

  const handleExportSourceAssets = useCallback(() => {
    if (!sourceAssets) return
    const title = sourceDisplayTitle(sourceAssets.source)
    downloadMarkdownFile(
      markdownFileName('source-assets', title, sourceAssets.source.id),
      sourceAssetsMarkdown(sourceAssets)
    )
  }, [sourceAssets])

  const handleExportEvidence = useCallback((record: EvidenceRecord) => {
    downloadMarkdownFile(
      markdownFileName('evidence', record.claim, record.id),
      evidenceMarkdown(record)
    )
  }, [])

  const handleExportReport = useCallback((record: ReportRecord) => {
    downloadMarkdownFile(
      markdownFileName('report', record.title, record.id),
      reportMarkdownWithCitations(record)
    )
  }, [])

  const generateSourceInvestigationFromAssets = useCallback(async (assets: SourceAssetsRecord) => {
    if (!sourceId) return
    setSourceInvestigationLoading(true)
    setSourceAssetActionError(null)
    try {
      const title = sourceDisplayTitle(assets.source)
      const result = await generateInvestigation({
        query: config?.uiLanguage === 'en-US' ? `Investigate the current source: ${title}` : `调查当前来源：${title}`,
        mode: 'deep',
        scope: {
          sourceIds: [sourceId],
          pointIds: assets.points.map(point => point.id),
          evidenceIds: assets.evidence.map(record => record.id),
          reportIds: assets.reports.map(report => report.id),
          includeLibrarySearch: true,
          includeJournal: true,
        },
      })
      setSourceInvestigationResult(result)
    } catch (error: unknown) {
      setSourceAssetActionError(exploreErrorMessage(error, config?.uiLanguage === 'en-US' ? 'Failed to generate source investigation' : '生成来源调查报告失败'))
    } finally {
      setSourceInvestigationLoading(false)
    }
  }, [config?.uiLanguage, sourceId])

  const handleForceGenerateSourceInvestigation = useCallback(async () => {
    if (!sourceAssets || sourceInvestigationLoading || sourceInvestigationPreparationLoading) return
    await generateSourceInvestigationFromAssets(sourceAssets)
  }, [generateSourceInvestigationFromAssets, sourceAssets, sourceInvestigationLoading, sourceInvestigationPreparationLoading])

  const handleGenerateSourceInvestigation = useCallback(async () => {
    if (!sourceAssets || sourceInvestigationLoading || sourceInvestigationPreparationLoading) return
    if (sourceInvestigationReadiness && !sourceInvestigationReadiness.ready) {
      setSourceAssetActionError(config?.uiLanguage === 'en-US'
        ? 'Investigation context is thin. Use “Prepare + Investigate” to generate source-linked points and evidence first.'
        : '调查上下文偏少。请先使用“准备后调查”自动补充来源观点和证据。')
      return
    }
    await generateSourceInvestigationFromAssets(sourceAssets)
  }, [
    config?.uiLanguage,
    generateSourceInvestigationFromAssets,
    sourceAssets,
    sourceInvestigationLoading,
    sourceInvestigationPreparationLoading,
    sourceInvestigationReadiness,
  ])

  const handlePrepareAndGenerateSourceInvestigation = useCallback(async () => {
    if (
      !sourceId
      || !sourceAssets
      || sourceInvestigationLoading
      || sourceInvestigationPreparationLoading
    ) {
      return
    }

    const zh = config?.uiLanguage !== 'en-US'
    setSourceInvestigationPreparationLoading(true)
    setSourceAssetActionError(null)
    setSourceInvestigationPreparationStatus(zh ? '正在检查调查上下文…' : 'Checking investigation context…')

    try {
      let nextAssets = sourceAssets
      const preparedPoints: PreparedInvestigationPoint[] = []
      const preparationFailures: string[] = []
      const existingPointKeys = new Set(nextAssets.points.map((point) => comparableTextKey(point.content)))
      const pointsToCreate = Math.max(0, INVESTIGATION_TARGET_POINTS - nextAssets.points.length)
      const selectedCandidates = investigationPreparationCandidates
        .filter((candidate) => normalizedText(candidate.text).length > 0)

      if (pointsToCreate > 0 && selectedCandidates.length === 0) {
        throw new Error(zh
          ? '当前来源没有足够的可分析文本块，无法自动准备调查。'
          : 'This source has no analyzable text blocks for automatic preparation.')
      }

      for (const candidate of selectedCandidates) {
        if (preparedPoints.length >= pointsToCreate) break
        setSourceInvestigationPreparationStatus(zh
          ? `正在生成观点 ${preparedPoints.length + 1}/${pointsToCreate}…`
          : `Generating point ${preparedPoints.length + 1}/${pointsToCreate}…`)
        try {
          const existingCard = candidate.card
          const card = existingCard ?? {
            ...(await analyzeTextBlock(candidate.text, candidate.blockIndex)),
            index: candidate.blockIndex,
          }
          if (!existingCard) {
            setAdHocCards((current) => ({ ...current, [candidate.displayIndex]: card }))
          }
          const claim = pointClaimForInvestigation(card)
          const key = comparableTextKey(claim)
          if (!claim || existingPointKeys.has(key)) continue
          const tagType = tagTypeForChunkCard(card)
          const ids = await savePoints(
            [{ content: claim, tagType }],
            sourceDisplayTitle(nextAssets.source),
            candidate.text,
            {
              sourceId,
              chunkIndex: card.index,
              anchorText: candidate.text,
            }
          )
          const pointId = ids[0]
          if (!pointId) continue
          existingPointKeys.add(key)
          preparedPoints.push({
            id: pointId,
            claim,
            context: candidate.text,
            blockIndex: card.index,
            card,
            tagType,
          })
        } catch (error: unknown) {
          preparationFailures.push(exploreErrorMessage(
            error,
            zh ? '生成来源观点失败' : 'Failed to generate a source-linked point'
          ))
        }
      }

      if (preparedPoints.length > 0) {
        const refreshed = await getSourceAssets(sourceId)
        if (refreshed) {
          nextAssets = refreshed
          setSourceAssets(refreshed)
        }
      }

      const evidenceNeeded = Math.max(0, INVESTIGATION_TARGET_EVIDENCE - nextAssets.evidence.length)
      const existingEvidenceClaims = new Set(nextAssets.evidence.map((record) => comparableTextKey(record.claim)))
      const evidenceCandidates: InvestigationEvidenceCandidate[] = [
        ...preparedPoints.map((point) => ({
          pointId: point.id,
          claim: point.claim,
          context: point.context,
          blockIndex: point.blockIndex,
        })),
        ...nextAssets.points.map((point) => ({
          pointId: point.id,
          claim: point.content,
          context: investigationEvidenceContext(point),
          blockIndex: null,
        })),
      ].filter((candidate) =>
        normalizedText(candidate.claim).length > 0
        && normalizedText(candidate.context).length > 0
        && !existingEvidenceClaims.has(comparableTextKey(candidate.claim))
      )

      let savedEvidenceCount = 0
      for (const candidate of evidenceCandidates) {
        if (savedEvidenceCount >= evidenceNeeded) break
        const candidateEvidenceKey = comparableTextKey(candidate.claim)
        if (existingEvidenceClaims.has(candidateEvidenceKey)) continue
        setSourceInvestigationPreparationStatus(zh
          ? `正在事实审查 ${savedEvidenceCount + 1}/${evidenceNeeded}…`
          : `Fact-checking ${savedEvidenceCount + 1}/${evidenceNeeded}…`)
        try {
          const result = await factCheckClaim(candidate.claim, candidate.context)
          const evidence = await saveEvidence(result, {
            pointId: candidate.pointId,
            sourceId,
            chunkIndex: candidate.blockIndex,
          })
          existingEvidenceClaims.add(candidateEvidenceKey)
          existingEvidenceClaims.add(comparableTextKey(evidence.claim))
          savedEvidenceCount += 1
        } catch (error: unknown) {
          preparationFailures.push(exploreErrorMessage(
            error,
            zh ? '事实审查候选失败' : 'Failed to fact-check a candidate'
          ))
        }
      }

      const refreshed = await getSourceAssets(sourceId)
      if (refreshed) {
        nextAssets = refreshed
        setSourceAssets(refreshed)
      }
      const nextReadiness = investigationReadinessForAssets(nextAssets)
      if (nextReadiness && !nextReadiness.ready) {
        const failureHint = preparationFailures[0]
          ? (zh ? ` 首个失败原因：${preparationFailures[0]}` : ` First failure: ${preparationFailures[0]}`)
          : ''
        throw new Error(zh
          ? `已补充 ${preparedPoints.length} 个观点、${savedEvidenceCount} 条证据，但调查上下文仍不足。请检查文本/搜索模型配置或手动保存更多证据。${failureHint}`
          : `Prepared ${preparedPoints.length} points and ${savedEvidenceCount} evidence items, but the investigation context is still thin. Check text/search model settings or save more evidence manually.${failureHint}`)
      }

      setSourceInvestigationPreparationStatus(zh ? '准备完成，正在生成调查报告…' : 'Context ready. Generating investigation…')
      await generateSourceInvestigationFromAssets(nextAssets)
    } catch (error: unknown) {
      setSourceAssetActionError(exploreErrorMessage(error, zh ? '准备调查上下文失败' : 'Failed to prepare investigation context'))
    } finally {
      setSourceInvestigationPreparationLoading(false)
      setSourceInvestigationPreparationStatus(null)
    }
  }, [
    config?.uiLanguage,
    generateSourceInvestigationFromAssets,
    investigationPreparationCandidates,
    sourceAssets,
    sourceId,
    sourceInvestigationLoading,
    sourceInvestigationPreparationLoading,
  ])

  const handleAddSourceReview = useCallback(async () => {
    if (!sourceId || !sourceAssets || sourceReviewLoading) return
    setSourceReviewLoading(true)
    setSourceAssetActionError(null)
    try {
      const title = sourceDisplayTitle(sourceAssets.source)
      await addReviewItem({
        targetKind: 'source',
        targetId: sourceId,
        title,
        priority: 'normal',
      })
      setSourceAssetActionError(config?.uiLanguage === 'en-US' ? 'Added to the review queue.' : '已加入复习队列。')
    } catch (error: unknown) {
      setSourceAssetActionError(exploreErrorMessage(error, config?.uiLanguage === 'en-US' ? 'Failed to add to review queue' : '加入复习队列失败'))
    } finally {
      setSourceReviewLoading(false)
    }
  }, [config?.uiLanguage, sourceAssets, sourceId, sourceReviewLoading])

  const handleRefreshSourceRelations = useCallback(async () => {
    if (!sourceId || sourceRelationsLoading) return
    setSourceRelationsLoading(true)
    setSourceAssetActionError(null)
    try {
      setSourceRelations(await discoverRelatedAssets('source', sourceId))
    } catch (error: unknown) {
      setSourceAssetActionError(exploreErrorMessage(error, config?.uiLanguage === 'en-US' ? 'Failed to refresh related assets' : '刷新相关资产失败'))
    } finally {
      setSourceRelationsLoading(false)
    }
  }, [config?.uiLanguage, sourceId, sourceRelationsLoading])

  const handleActivateHistory = (id: string) => {
    history.activate(id)
    setHistoryOpen(false)
    setAnalysisStack([])
    setImageViewer(null)
    setStageCompletedCount(Number.MAX_SAFE_INTEGER)
    setRevealedCount(Number.MAX_SAFE_INTEGER)
    setGenerationInProgress(false)
    setCompletionBurstKey(null)
  }

  const handleReanalyzeCurrent = useCallback(() => {
    setAnalysisStack([])
    setImageViewer(null)
    setHistoryOpen(false)
    setAdHocCards({})
    setAdHocAnalyzing({})
    setAdHocErrors({})
    setFactBubble(null)
    setSelectionToolbar(null)
    setUserAnnotations({})
    void reanalyzeCurrent()
  }, [reanalyzeCurrent])

  const handleReanalyzeHistory = useCallback((id: string) => {
    const item = history.activate(id)
    if (!item) return
    setHistoryOpen(false)
    setAnalysisStack([])
    setImageViewer(null)
    setAdHocCards({})
    setAdHocAnalyzing({})
    setAdHocErrors({})
    setFactBubble(null)
    setSelectionToolbar(null)
    setUserAnnotations({})
    void reanalyzeCurrent()
  }, [history, reanalyzeCurrent])

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
      <div className="flex h-full flex-1 flex-col">
        {!hasContent && (
          <button
            onClick={handleOpenRecentSources}
            className="absolute left-6 top-5 z-10 inline-flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2.5 py-1.5 text-xs text-fg-muted transition-colors hover:bg-bg-hover hover:text-fg"
          >
            <Database size={13} />
            最近来源
          </button>
        )}

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
              summary={sourceSummary}
              onReanalyze={handleReanalyzeCurrent}
              onOpenHistory={() => setHistoryOpen(true)}
              onOpenRecent={handleOpenRecentSources}
              onChangeFile={handleChangeFile}
              onClear={reset}
            />

            <SourceAssetPanel
              language={config?.uiLanguage ?? 'zh-CN'}
              assets={sourceAssets}
              loading={sourceAssetsLoading}
              error={sourceAssetsError}
              journalEntries={sourceJournalEntries}
              relations={sourceRelations}
              relationsLoading={sourceRelationsLoading}
              actionError={sourceAssetActionError}
              investigationLoading={sourceInvestigationLoading}
              investigationReadiness={sourceInvestigationReadiness}
              preparationLoading={sourceInvestigationPreparationLoading}
              preparationStatus={sourceInvestigationPreparationStatus}
              reviewLoading={sourceReviewLoading}
              onOpenSource={(nextSourceId, chunkIndex) => { void openSourceById(nextSourceId, chunkIndex) }}
              onExportSource={handleExportSourceAssets}
              onExportEvidence={handleExportEvidence}
              onExportReport={handleExportReport}
              onPrepareInvestigation={() => void handlePrepareAndGenerateSourceInvestigation()}
              onGenerateInvestigation={() => void handleGenerateSourceInvestigation()}
              onForceGenerateInvestigation={() => void handleForceGenerateSourceInvestigation()}
              onAddReview={() => void handleAddSourceReview()}
              onRefreshRelations={() => void handleRefreshSourceRelations()}
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
              <div className={cn(
                'flex-1 overflow-y-auto px-6 py-5 transition-[padding] duration-300 ease-out [&::-webkit-scrollbar]:hidden',
                analysisStack.length > 0 && 'pr-[21rem]'
              )}
                onScroll={() => {
                  setFactBubble((current) => current && !current.collapsed
                    ? { ...current, collapsed: true }
                    : current
                  )
                }}
              >
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
                              onOpenOriginal={setImageViewer}
                            />
                          )
                        }

                        const analysisCard = item.card
                        const blockText = item.block.text
                        const canonicalChunkIndex = item.block.chunkIndex ?? item.index
                        const card = analysisCard ?? {
                          index: item.block.chunkIndex ?? -item.index - 1,
                          text: blockText,
                          summary: blockText,
                          hotTake: '',
                          labels: [],
                        }
                        return (
                          <ThemeBlock
                            key={`source-${item.index}`}
                            blockRef={(node) => { blockRefs.current[item.index] = node }}
                            card={card}
                            index={item.index}
                            displayText={item.block.text}
                            muted={!analysisCard}
                            starred={analysisCard ? analysisCard.index in savedIds : false}
                            onOpen={analysisCard ? (el) => handleOpenCard(analysisCard, item.index, el) : undefined}
                            onToggleStar={analysisCard ? (el) => handleToggleStar(analysisCard.index, analysisCard, el) : undefined}
                            onAnalyze={!analysisCard ? (el) => handleAnalyzeBlock(
                              item.index,
                              canonicalChunkIndex,
                              blockText,
                              el
                            ) : undefined}
                            onRegenerate={analysisCard ? (el) => handleRegenerateBlock(item.index, analysisCard, el, true) : undefined}
                            analyzing={adHocAnalyzing[item.index] === true}
                            analyzeError={adHocErrors[item.index] ?? null}
                            onFactCheck={handleFactCheck}
                            userAnnotations={userAnnotations[item.index] ?? []}
                            annotationColors={annotationColors}
                            activeFactCheck={activeFactCheckMarker}
                            sourceHighlight={sourceHighlightForBlock(item.index, analysisCard?.index ?? null)}
                          />
                        )
                      })
                    ) : (
                      visibleCards.map((originalCard, i) => {
                        const card = regeneratedCards[originalCard.index] ?? originalCard
                        return <ThemeBlock
                          key={originalCard.index}
                          blockRef={(node) => { blockRefs.current[i] = node }}
                          card={card}
                          index={i}
                          starred={card.index in savedIds}
                          onOpen={(el) => handleOpenCard(card, i, el)}
                          onToggleStar={(el) => handleToggleStar(card.index, card, el)}
                          onRegenerate={(el) => handleRegenerateBlock(i, card, el, false)}
                          analyzing={adHocAnalyzing[i] === true}
                          analyzeError={adHocErrors[i] ?? null}
                          onFactCheck={handleFactCheck}
                          userAnnotations={userAnnotations[i] ?? []}
                          annotationColors={annotationColors}
                          activeFactCheck={activeFactCheckMarker}
                          sourceHighlight={sourceHighlightForBlock(i, card.index)}
                        />
                      })
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
        {selectionToolbar && (
          <SelectionToolbar
            state={selectionToolbar}
            onFactCheck={handleSelectionFactCheck}
            onMark={handleSelectionMark}
            annotationColors={annotationColors}
            onClose={() => {
              setSelectionToolbar(null)
              window.getSelection()?.removeAllRanges()
            }}
          />
        )}
        {commentDialog && (
          <CommentDialog
            state={commentDialog}
            value={commentDraft}
            saving={commentSaving}
            onChange={(value) => {
              setCommentDraft(value)
              setCommentDialog(current => current ? { ...current, error: undefined } : current)
            }}
            onCancel={handleCancelComment}
            onSave={() => void handleSaveComment()}
          />
        )}
        {factBubble && !factBubble.collapsed && <FactCheckBubble bubble={factBubble} onClose={() => setFactBubble(null)} onSave={handleSaveFactCheck} />}
        {sourceInvestigationResult && (
          <DigestModal
            result={sourceInvestigationResult}
            title={config?.uiLanguage === 'en-US' ? 'Source Investigation' : '来源调查报告'}
            sourceName={sourceName ?? sourceId ?? (config?.uiLanguage === 'en-US' ? 'Source Investigation' : '来源调查报告')}
            reportKind="investigation"
            onOpenSource={(nextSourceId, chunkIndex) => { void openSourceById(nextSourceId, chunkIndex) }}
            onClose={() => setSourceInvestigationResult(null)}
          />
        )}
        {imageViewer && <ImageLightbox image={imageViewer} onClose={() => setImageViewer(null)} />}
        {historyOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/20" onClick={() => setHistoryOpen(false)} />
            <HistoryDrawer
              items={history.items}
              onClose={() => setHistoryOpen(false)}
              onActivate={handleActivateHistory}
              onReanalyze={handleReanalyzeHistory}
              onArchive={history.archive}
              onUnarchive={history.unarchive}
              onDelete={history.remove}
            />
          </>
        )}
        {recentSourcesOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/20" onClick={() => setRecentSourcesOpen(false)} />
            <RecentSourcesDrawer
              sources={recentSources}
              loading={recentSourcesLoading}
              onClose={() => setRecentSourcesOpen(false)}
              onOpen={handleOpenRecentSource}
            />
          </>
        )}
        {analysisStack.length > 0 && (
          <>
            <AnalysisLink sourceElement={blockRefs.current[analysisStack[analysisStack.length - 1]?.blockIndex] ?? null} />
            {analysisStack.slice(-5).map((entry, index, visibleStack) => {
              const active = index === visibleStack.length - 1
              const depth = active ? 0 : index
              const inactiveCount = Math.max(visibleStack.length - 1, 0)

              return (
                <ChunkDrawer
                  key={entry.id}
                  entry={entry}
                  depth={depth}
                  inactiveCount={inactiveCount}
                  active={active}
                  commentatorEmoji={commentatorEmoji}
                  commentatorName={commentatorName}
                  onSelect={() => handleSelectAnalysis(entry.id)}
                  onClose={() => handleCloseAnalysis(entry.id)}
                />
              )
            })}
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
