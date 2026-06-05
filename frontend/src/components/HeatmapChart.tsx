import { useMemo, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { DailyActions } from '@/api/types'

interface HeatmapChartProps {
  dailyActions: DailyActions[]
  className?: string
  markedDates?: Set<string>
  onCellClick?: (date: string) => void
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS = ['Mon','','Wed','','Fri','','']

const THRESHOLDS = [0, 1, 2, 4, 8, 16, 32, 64, 128] as const
const FILL_OPACITY = [0, 0.10, 0.20, 0.30, 0.40, 0.50, 0.62, 0.74, 0.86, 0.95] as const

function getLevel(count: number): 0|1|2|3|4|5|6|7|8|9 {
  if (count <= 0) return 0
  if (count >= 128) return 9
  return (Math.floor(Math.log2(count)) + 1) as 0|1|2|3|4|5|6|7|8|9
}

interface CellInfo { date: string; count: number; level: 0|1|2|3|4|5|6|7|8|9 }

export function HeatmapChart({ dailyActions, className, markedDates, onCellClick }: HeatmapChartProps) {
  const [tooltip, setTooltip] = useState<{ date: string; count: number; x: number; y: number; markedCount?: number } | null>(null)

  const { weeks, monthLabels } = useMemo(() => {
    const countMap = new Map(dailyActions.map(d => [d.date, d.count]))

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endSunday = new Date(today)
    endSunday.setDate(today.getDate() + (6 - ((today.getDay() + 6) % 7)))

    const weeks: CellInfo[][] = []
    const monthLabels: { label: string; col: number }[] = []
    let lastMonth = -1

    for (let w = 51; w >= 0; w--) {
      const week: CellInfo[] = []
      for (let d = 0; d < 7; d++) {
        const date = new Date(endSunday)
        date.setDate(endSunday.getDate() - w * 7 - (6 - d))
        const iso = date.toISOString().slice(0, 10)
        const count = countMap.get(iso) ?? 0
        week.push({ date: iso, count, level: getLevel(count) })
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

  const handleMouseEnter = useCallback((e: React.MouseEvent, cell: CellInfo) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const parent = (e.currentTarget as HTMLElement).closest('.heatmap-root')!.getBoundingClientRect()
    setTooltip({ date: cell.date, count: cell.count, x: rect.left - parent.left + 6, y: rect.top - parent.top, markedCount: markedDates?.has(cell.date) ? 1 : 0 })
  }, [markedDates])

  return (
    <div className={cn('heatmap-root relative', className)}>
      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-md bg-bg-elevated border border-border px-2.5 py-1.5 text-xs text-fg shadow-lg whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y - 40, transform: 'translateX(-50%)' }}
        >
          {tooltip.count > 0 ? `${tooltip.count} 次深挖` : '无深挖'}
          {tooltip.markedCount ? ` · ${tooltip.markedCount} 条建议` : ''}
          {' · '}{tooltip.date}
        </div>
      )}

      <div className="flex gap-1.5">
        {/* Weekday labels */}
        <div className="flex flex-col gap-0.5 pt-5 shrink-0">
          {DAYS.map((d, i) => (
            <div key={i} className="text-[9px] text-fg-faint flex items-center" style={{ height: 'calc(0.5rem + 2px)' }}>
              {d}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-hidden min-w-0">
          {/* Month labels */}
          <div className="relative h-4 mb-1">
            {monthLabels.map((m, i) => (
              <div
                key={i}
                className="absolute text-[10px] text-fg-faint"
                style={{ left: `calc(${m.col} * (100% / 52))` }}
              >
                {m.label}
              </div>
            ))}
          </div>

          {/* Grid — 52 columns, responsive */}
          <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(52, minmax(0, 1fr))' }}>
            {weeks.map((week, wi) =>
              week.map((cell, di) => {
                const marked = markedDates?.has(cell.date)
                return (
                  <div
                    key={`${wi}-${di}`}
                    data-date={cell.date}
                    className={cn(
                      'relative rounded-sm cursor-default transition-opacity hover:opacity-80',
                      cell.level === 0 && 'bg-bg-elevated border border-border/50',
                      marked && 'ring-1 ring-accent/60',
                      onCellClick && marked && 'cursor-pointer',
                    )}
                    style={{
                      aspectRatio: '1',
                      ...(cell.level > 0 ? { backgroundColor: `color-mix(in srgb, var(--color-accent) ${FILL_OPACITY[cell.level] * 100}%, transparent)` } : {}),
                    }}
                    onMouseEnter={e => handleMouseEnter(e, cell)}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => { if (marked && onCellClick) onCellClick(cell.date) }}
                  >
                    {/* Marker dot for dates with suggestions */}
                    {marked && (
                      <span className="absolute bottom-0 right-0 h-1 w-1 rounded-full bg-accent pointer-events-none" />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* Legend — 10 levels */}
      <div className="flex items-center gap-0.5 mt-2 justify-end">
        <span className="text-[10px] text-fg-faint mr-1">少</span>
        {FILL_OPACITY.map((op, i) => (
          <div
            key={i}
            className="h-3 w-3 rounded-sm border border-border/50"
            style={i === 0
              ? {}
              : { backgroundColor: `color-mix(in srgb, var(--color-accent) ${op * 100}%, transparent)` }
            }
          />
        ))}
        <span className="text-[10px] text-fg-faint ml-1">多</span>
      </div>
    </div>
  )
}
