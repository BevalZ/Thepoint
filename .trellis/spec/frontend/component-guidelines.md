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

## Common Mistakes

- ❌ Calling `invoke()` directly inside a component — use `api/index.ts` wrappers
- ❌ Editing files in `components/ui/` — they are auto-managed by shadcn CLI
- ❌ Hardcoded colors outside Tailwind theme tokens
