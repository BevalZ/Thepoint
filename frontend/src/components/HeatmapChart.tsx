import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { DailyActions } from '@/api/types'

interface HeatmapChartProps {
  dailyActions: DailyActions[]
  className?: string
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS = ['Mon','','Wed','','Fri','','']

function getLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0 || max === 0) return 0
  const ratio = count / max
  if (ratio < 0.25) return 1
  if (ratio < 0.5) return 2
  if (ratio < 0.75) return 3
  return 4
}

const LEVEL_CLASSES = [
  'bg-bg-elevated border border-border/50',
  'bg-accent/20',
  'bg-accent/40',
  'bg-accent/70',
  'bg-accent',
]

export function HeatmapChart({ dailyActions, className }: HeatmapChartProps) {
  const [tooltip, setTooltip] = useState<{ date: string; count: number; x: number; y: number } | null>(null)

  const { weeks, monthLabels } = useMemo(() => {
    const countMap = new Map(dailyActions.map(d => [d.date, d.count]))
    const max = Math.max(...dailyActions.map(d => d.count), 1)

    // Build 52 weeks ending today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // Align to the Sunday of this week
    const endSunday = new Date(today)
    endSunday.setDate(today.getDate() + (6 - ((today.getDay() + 6) % 7)))

    const weeks: Array<Array<{ date: string; count: number; level: 0|1|2|3|4 } | null>> = []
    const monthLabels: Array<{ label: string; col: number }> = []

    let lastMonth = -1
    for (let w = 51; w >= 0; w--) {
      const week: typeof weeks[0] = []
      for (let d = 0; d < 7; d++) {
        const date = new Date(endSunday)
        date.setDate(endSunday.getDate() - w * 7 - (6 - d))
        const iso = date.toISOString().slice(0, 10)
        const count = countMap.get(iso) ?? 0
        week.push({ date: iso, count, level: getLevel(count, max) })
        if (d === 0) {
          const m = date.getMonth()
          if (m !== lastMonth) {
            monthLabels.push({ label: MONTHS[m], col: 51 - w })
            lastMonth = m
          }
        }
      }
      weeks.push(week)
    }
    return { weeks, monthLabels }
  }, [dailyActions])

  return (
    <div className={cn('relative', className)}>
      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-md bg-bg-elevated border border-border px-2.5 py-1.5 text-xs text-fg shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y - 40, transform: 'translateX(-50%)' }}
        >
          {tooltip.count > 0 ? `${tooltip.count} 次深挖` : '无深挖'} · {tooltip.date}
        </div>
      )}

      <div className="flex gap-1.5">
        {/* Weekday labels */}
        <div className="flex flex-col gap-0.5 pt-5 shrink-0">
          {DAYS.map((d, i) => (
            <div key={i} className="h-3 w-6 text-[9px] text-fg-faint flex items-center">{d}</div>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {/* Month labels */}
          <div className="flex mb-1 h-4">
            {monthLabels.map((m, i) => (
              <div
                key={i}
                className="absolute text-[10px] text-fg-faint"
                style={{ left: `calc(1.75rem + ${m.col} * (0.75rem + 2px))` }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="flex gap-0.5 relative">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-0.5">
                {week.map((cell, di) =>
                  cell ? (
                    <div
                      key={di}
                      className={cn('h-3 w-3 rounded-sm cursor-default transition-opacity hover:opacity-80', LEVEL_CLASSES[cell.level])}
                      onMouseEnter={e => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect()
                        const parent = (e.target as HTMLElement).closest('.relative')!.getBoundingClientRect()
                        setTooltip({ date: cell.date, count: cell.count, x: rect.left - parent.left + 6, y: rect.top - parent.top })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  ) : (
                    <div key={di} className="h-3 w-3" />
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 mt-2 justify-end">
        <span className="text-[10px] text-fg-faint mr-1">少</span>
        {([0,1,2,3,4] as const).map(l => (
          <div key={l} className={cn('h-3 w-3 rounded-sm', LEVEL_CLASSES[l])} />
        ))}
        <span className="text-[10px] text-fg-faint ml-1">多</span>
      </div>
    </div>
  )
}
