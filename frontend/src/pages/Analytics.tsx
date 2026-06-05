import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { cn } from '@/lib/utils'
import { getAnalytics } from '@/api'
import type { AnalyticsData } from '@/api/types'
import { HeatmapChart } from '@/components/HeatmapChart'

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
function StatCard({ label, value, className }: StatCardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-bg-elevated p-4', className)}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-fg-muted">{label}</div>
    </div>
  )
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAnalytics()
      .then(setData)
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false))
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
        <div className="flex gap-4">
          <div className="flex-1 rounded-lg border border-border bg-bg-elevated p-4">
            <div className="mb-2 text-sm text-fg-muted">探索模式雷达</div>
            <ReactECharts option={radarOption(data)} style={{ height: 280 }} />
          </div>
          <div className="flex-1 rounded-lg border border-border bg-bg-elevated p-4">
            <div className="mb-2 text-sm text-fg-muted">近 365 天深挖趋势</div>
            <HeatmapChart dailyActions={data.dailyActions} />
          </div>
        </div>
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
    </div>
  )
}
