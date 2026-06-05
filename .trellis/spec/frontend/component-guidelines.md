# Component Guidelines

> How components are built in this project.

---

## Overview

<!--
Document your project's component conventions here.

Questions to answer:
- What component patterns do you use?
- How are props defined?
- How do you handle composition?
- What accessibility standards apply?
-->

## Component Structure

```tsx
// Standard component file structure
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'        // shadcn/ui utility
import type { Point } from '@/api/types'

interface PointCardProps {
  point: Point
  onAction: (action: string, pointId: string) => void
  className?: string
}

export function PointCard({ point, onAction, className }: PointCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('rounded-lg border bg-card p-4', className)}
    >
      {/* content */}
    </motion.div>
  )
}
```

## Props Conventions

- Always define a `Props` interface — no inline `{ prop: type }` in function signature
- `className?: string` on every presentational component for composability
- Callbacks named `on<Event>` (e.g. `onAction`, `onSave`)

## Styling Patterns

- **TailwindCSS utility classes only** — no inline `style={{}}` except for dynamic values ECharts needs
- Use `cn()` from `@/lib/utils` to merge conditional classes
- Dark mode via `dark:` prefix — test both light/dark
- Animations via **Framer Motion** (`motion.div`) — not CSS keyframes

## ECharts Usage

Use `echarts-for-react` (`ReactECharts`) for all chart components.

```tsx
import ReactECharts from 'echarts-for-react'

// Build option in a pure function outside the component
function lineOption(data: AnalyticsData): EChartsOption {
  return {
    backgroundColor: 'transparent',   // always transparent — page bg handles theming
    // axis lines and split lines use '#2a2a3a' (dark grid color)
    // all text labels use '#a0a0b0'
    // accent color: '#6366f1' (indigo-500) with 'rgba(99,102,241,0.1)' fill
  }
}

export function MyChart({ data }: Props) {
  return <ReactECharts option={lineOption(data)} style={{ height: 280 }} />
}
```

Rules:
- Option objects are built in **pure functions** outside the component body, not inline JSX
- `backgroundColor: 'transparent'` on every chart — never set to a solid color
- Dark-theme palette: grid/axis lines `#2a2a3a`, labels `#a0a0b0`, accent `#6366f1`
- Pass `style={{ height: Npx }}` to `ReactECharts` — do not size via Tailwind on the component itself
- The one allowed use of inline `style={{}}` is on `ReactECharts` for height (Tailwind cannot size it)

## Common Mistakes

- ❌ Calling `invoke()` directly inside a component — use `api/index.ts` wrappers
- ❌ Editing files in `components/ui/` — they are auto-managed by shadcn CLI
- ❌ Hardcoded colors outside Tailwind theme tokens
- ❌ Building ECharts `option` inline in JSX — extract to a named function
