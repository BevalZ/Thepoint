import { useEffect, useState } from 'react'
import { AnimatePresence, motion, type Variants } from 'framer-motion'
import ReactECharts from 'echarts-for-react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAnalytics, getExploreSuggestions, listMarkedDates } from '@/api'
import type { AnalyticsData } from '@/api/types'
import { HeatmapChart } from '@/components/HeatmapChart'
import { ExploreSuggestions, SuggestionDayList, SuggestionViewModal } from '@/pages/ExploreSuggestions'

const RADAR_NAMES = ['深度指数', '反方关注度', '追问率', '解释偏好', '框架使用率']

function radarOption(data: AnalyticsData) {
  const total = data.totalActions || 1
  const rootPoints = data.totalPoints - data.totalChildPoints || 1
  const values = [
    Math.min(data.totalChildPoints / rootPoints, 1),
    data.counterCount / total,
    data.followupCount / total,
    data.explainCount / total,
    data.frameworkCount / total,
  ]
  return {
    backgroundColor: 'transparent',
    tooltip: {},
    radar: {
      indicator: RADAR_NAMES.map((name) => ({ name, max: 1 })),
      axisLine: { lineStyle: { color: '#2a2a3a' } },
      splitLine: { lineStyle: { color: '#2a2a3a' } },
      name: { textStyle: { color: '#a0a0b0' } },
    },
    series: [{
      type: 'radar',
      data: [{ value: values }],
      areaStyle: { color: 'rgba(99,102,241,0.15)' },
      lineStyle: { color: '#6366f1' },
      itemStyle: { color: '#6366f1' },
    }],
  }
}


interface StatCardProps { label: string; value: number; className?: string }
const STAT_CARD_VARIANTS: Variants = {
  hover: {
    y: -3,
    scale: 1.012,
    transition: { duration: 0.16, ease: 'easeOut' },
  },
  tap: {
    scale: 0.995,
    transition: { duration: 0.1, ease: 'easeOut' },
  },
}
const STAT_SWEEP_VARIANTS: Variants = {
  rest: { opacity: 0, x: 0 },
  hover: {
    opacity: [0, 0.5, 0],
    x: 180,
    transition: { duration: 0.42, ease: 'easeOut' },
  },
}

function StatCard({ label, value, className }: StatCardProps) {
  return (
    <motion.div
      variants={STAT_CARD_VARIANTS}
      whileHover="hover"
      whileTap="tap"
      className={cn('relative isolate overflow-hidden rounded-lg border border-border bg-bg-elevated p-4 transition-colors hover:border-border-strong', className)}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 -left-16 w-14 rounded-full bg-accent/15"
        initial="rest"
        variants={STAT_SWEEP_VARIANTS}
      />
      <div className="relative text-2xl font-bold">{value}</div>
      <div className="relative text-sm text-fg-muted">{label}</div>
    </motion.div>
  )
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Suggestion lifecycle state
  const [markedDates, setMarkedDates] = useState<Set<string>>(new Set())
  const [viewingDate, setViewingDate] = useState<string | null>(null)
  const [viewingSuggestionId, setViewingSuggestionId] = useState<string | null>(null)

  useEffect(() => {
    getAnalytics()
      .then(setData)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
    listMarkedDates().then(dates => setMarkedDates(new Set(dates))).catch(() => {})
  }, [])

  if (loading) return <div className="p-8 text-fg-muted">加载中…</div>
  if (error) return <div className="p-8 text-red-400">{error}</div>
  if (!data) return null

  const isEmpty = data.totalActions === 0

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-lg font-semibold">统计</h1>

      <div className="flex gap-4">
        <StatCard label="总 Points" value={data.totalPoints} />
        <StatCard label="总深挖次数" value={data.totalActions} />
      </div>

      {isEmpty ? (
        <div className="rounded-lg border border-border bg-bg-elevated p-12 text-center text-fg-muted">
          暂无数据，先去探索和深化吧！
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-bg-elevated p-4">
            <div className="mb-2 text-sm text-fg-muted">探索模式雷达</div>
            <ReactECharts option={radarOption(data)} style={{ height: 280 }} />
          </div>
          <div className="rounded-lg border border-border bg-bg-elevated p-4">
            <div className="mb-2 text-sm text-fg-muted">近 365 天深挖趋势</div>
            <HeatmapChart
              dailyActions={data.dailyActions}
              markedDates={markedDates}
              onCellClick={setViewingDate}
            />
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-3">
        {(
          [
            ['解释', data.explainCount],
            ['反方', data.counterCount],
            ['追问', data.followupCount],
            ['相似', data.similarCount],
            ['框架', data.frameworkCount],
          ] as [string, number][]
        ).map(([label, count]) => (
          <StatCard key={label} label={label} value={count} className="min-w-[100px]" />
        ))}
      </div>

      <ExploreSuggestions onMarkedDatesChange={setMarkedDates} onCellClick={setViewingDate} />

      {/* Day list popover */}
      <AnimatePresence>
        {viewingDate && (
          <div className="relative">
            <SuggestionDayList
              date={viewingDate}
              onPick={id => { setViewingDate(null); setViewingSuggestionId(id) }}
              onClose={() => setViewingDate(null)}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Suggestion viewer modal */}
      <AnimatePresence>
        {viewingSuggestionId && (
          <SuggestionViewModal
            id={viewingSuggestionId}
            onClose={() => setViewingSuggestionId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function ExploreSuggestions_inline() {
  const [text, setText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = () => {
    setLoading(true); setError(null)
    getExploreSuggestions()
      .then(setText)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
  }

  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-fg">探索建议</p>
          <p className="text-xs text-fg-muted mt-0.5">基于你的使用习惯，由 AI 生成认知提升建议</p>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm text-fg-muted hover:bg-bg-hover disabled:opacity-50 transition-colors"
        >
          {loading && <Loader2 size={13} className="animate-spin" />}
          {loading ? '生成中…' : text ? '重新生成' : '生成建议'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {text && (
        <p className="text-sm text-fg leading-relaxed whitespace-pre-wrap">{text}</p>
      )}
    </div>
  )
}
