import { useEffect, useState } from 'react'
import { AnimatePresence, motion, type Variants } from 'framer-motion'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { RadarChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAnalytics, getExploreSuggestions, listMarkedDates } from '@/api'
import type { AnalyticsData } from '@/api/types'
import { HeatmapChart } from '@/components/HeatmapChart'
import { ExploreSuggestions, SuggestionDayList, SuggestionViewModal } from '@/pages/ExploreSuggestions'

echarts.use([RadarChart, TooltipComponent, CanvasRenderer])

const RADAR_NAMES = ['深度指数', '反方关注度', '追问率', '解释偏好', '框架使用率']
const ACTION_LABELS = {
  explain: '解释',
  counter: '反方',
  followup: '追问',
  similar: '相似',
  framework: '框架',
} as const

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
      center: ['50%', '52%'],
      radius: '68%',
      axisLine: { lineStyle: { color: '#2a2a3a' } },
      splitLine: { lineStyle: { color: '#2a2a3a' } },
      splitArea: { areaStyle: { color: ['rgba(255,255,255,0.035)', 'rgba(255,255,255,0.018)'] } },
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

function actionRows(data: AnalyticsData) {
  return [
    { key: 'explain', label: ACTION_LABELS.explain, value: data.explainCount, color: 'bg-sky-400' },
    { key: 'counter', label: ACTION_LABELS.counter, value: data.counterCount, color: 'bg-rose-400' },
    { key: 'followup', label: ACTION_LABELS.followup, value: data.followupCount, color: 'bg-amber-300' },
    { key: 'similar', label: ACTION_LABELS.similar, value: data.similarCount, color: 'bg-emerald-400' },
    { key: 'framework', label: ACTION_LABELS.framework, value: data.frameworkCount, color: 'bg-violet-400' },
  ]
}

function formatPercent(value: number, total: number) {
  if (total <= 0) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

function activeDayCount(data: AnalyticsData) {
  return data.dailyActions.filter(day => day.count > 0).length
}

function busiestDay(data: AnalyticsData) {
  return data.dailyActions.reduce<DailyPeak | null>((peak, day) => {
    if (day.count <= 0) return peak
    if (!peak || day.count > peak.count) return { date: day.date, count: day.count }
    return peak
  }, null)
}

interface DailyPeak {
  date: string
  count: number
}

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

function MetricStrip({ data }: { data: AnalyticsData }) {
  const activeDays = activeDayCount(data)
  const peak = busiestDay(data)
  const derivedRatio = data.totalPoints > 0
    ? Math.round((data.totalChildPoints / data.totalPoints) * 100)
    : 0
  const metrics = [
    { label: '总 Points', value: data.totalPoints, detail: `${data.totalChildPoints} 个延展节点` },
    { label: '总深挖次数', value: data.totalActions, detail: `${activeDays} 天有记录` },
    { label: '延展占比', value: `${derivedRatio}%`, detail: '越高代表越常继续追问' },
    { label: '峰值日', value: peak?.count ?? 0, detail: peak?.date ?? '暂无' },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <motion.div
          key={metric.label}
          variants={STAT_CARD_VARIANTS}
          whileHover="hover"
          whileTap="tap"
          className="relative isolate overflow-hidden rounded-lg border border-border bg-bg-elevated px-4 py-3 transition-colors hover:border-border-strong"
        >
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-y-1 -left-16 w-14 rounded-full bg-accent/15"
            initial="rest"
            variants={STAT_SWEEP_VARIANTS}
          />
          <div className="relative text-2xl font-semibold text-fg">{metric.value}</div>
          <div className="relative mt-1 text-xs text-fg-muted">{metric.label}</div>
          <div className="relative mt-2 truncate text-[11px] text-fg-faint">{metric.detail}</div>
        </motion.div>
      ))}
    </div>
  )
}

function ActionStructure({ data }: { data: AnalyticsData }) {
  const rows = actionRows(data)
  const total = Math.max(data.totalActions, 1)
  const dominant = rows.reduce((best, row) => row.value > best.value ? row : best, rows[0])

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-fg">行为结构</p>
          <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] text-fg-muted">
            主偏好 · {dominant.label}
          </span>
        </div>
        <div className="space-y-3">
          {rows.map((row) => {
            const width = `${Math.max(3, Math.round((row.value / total) * 100))}%`
            return (
              <div key={row.key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-fg-muted">{row.label}</span>
                  <span className="tabular-nums text-fg-faint">{row.value} · {formatPercent(row.value, data.totalActions)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-bg">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width }}
                    transition={{ duration: 0.42, ease: 'easeOut' }}
                    className={cn('h-full rounded-full shadow-[0_0_14px_rgba(255,255,255,0.12)]', row.color)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-bg px-3 py-2">
          <p className="text-[11px] text-fg-faint">深度指数</p>
          <p className="mt-1 text-lg font-semibold text-fg">{formatPercent(data.totalChildPoints, Math.max(data.totalPoints - data.totalChildPoints, 1))}</p>
        </div>
        <div className="rounded-lg border border-border bg-bg px-3 py-2">
          <p className="text-[11px] text-fg-faint">覆盖天数</p>
          <p className="mt-1 text-lg font-semibold text-fg">{activeDayCount(data)}</p>
        </div>
      </div>
    </div>
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

  const refreshMarkedDates = () => {
    listMarkedDates().then(dates => setMarkedDates(new Set(dates))).catch(() => {})
  }

  useEffect(() => {
    getAnalytics()
      .then(setData)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
    refreshMarkedDates()
  }, [])

  if (loading) return <div className="p-8 text-fg-muted">加载中…</div>
  if (error) return <div className="p-8 text-red-400">{error}</div>
  if (!data) return null

  const isEmpty = data.totalActions === 0

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-fg">统计</h1>
          <p className="mt-1 text-xs text-fg-muted">深挖行为、知识延展和探索建议的本地记录。</p>
        </div>
        <div className="hidden items-center gap-2 text-xs text-fg-faint sm:flex">
          <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_var(--color-accent)]" />
          最近 365 天
        </div>
      </div>

      <MetricStrip data={data} />

      {isEmpty ? (
        <div className="rounded-lg border border-border bg-bg-elevated p-12 text-center text-fg-muted">
          暂无数据，先去探索和深化吧！
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="rounded-lg border border-border bg-bg-elevated p-4">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm font-medium text-fg">探索模式雷达</p>
                <span className="text-xs text-fg-faint">5 维倾向</span>
              </div>
              <div className="grid min-h-[260px] items-center gap-4 lg:grid-cols-[minmax(260px,0.62fr)_minmax(220px,0.38fr)]">
                <ReactEChartsCore echarts={echarts} option={radarOption(data)} style={{ height: 250, minWidth: 260 }} />
                <div className="space-y-3 text-sm leading-relaxed text-fg-muted">
                  <p>
                    当前记录更集中在
                    <span className="mx-1 text-fg">{actionRows(data).reduce((best, row) => row.value > best.value ? row : best, actionRows(data)[0]).label}</span>
                    行为，雷达图用于观察解释、追问、反方和框架使用是否均衡。
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {actionRows(data).slice(0, 4).map(row => (
                      <div key={row.key} className="rounded-md border border-border bg-bg px-2.5 py-2">
                        <p className="text-[11px] text-fg-faint">{row.label}</p>
                        <p className="mt-1 text-base font-semibold text-fg">{formatPercent(row.value, data.totalActions)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-bg-elevated p-4">
              <ActionStructure data={data} />
            </section>
          </div>

          <section className="rounded-lg border border-border bg-bg-elevated p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-fg">近 365 天深挖趋势</p>
              <span className="text-xs text-fg-faint">点击带标记日期查看建议存档</span>
            </div>
            <HeatmapChart
              dailyActions={data.dailyActions}
              markedDates={markedDates}
              onCellClick={setViewingDate}
            />
          </section>
        </>
      )}

      <ExploreSuggestions onMarkedDatesChange={setMarkedDates} onCellClick={setViewingDate} />

      {/* Day list popover */}
      <AnimatePresence>
        {viewingDate && (
          <div className="relative">
            <SuggestionDayList
              date={viewingDate}
              onPick={id => { setViewingDate(null); setViewingSuggestionId(id) }}
              onClose={() => setViewingDate(null)}
              onDeleted={refreshMarkedDates}
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
            onDeleted={refreshMarkedDates}
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
