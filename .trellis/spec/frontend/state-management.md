# State Management

> How state is managed in this project.

---

## Overview

<!--
Document your project's state management conventions here.

Questions to answer:
- What state management solution do you use?
- How is local vs global state decided?
- How do you handle server state?
- What are the patterns for derived state?
-->

## State Solution: Zustand

All global state lives in `store/index.ts`, split by domain slice.

```ts
// store/index.ts — example slice
interface SessionStore {
  activeSessions: Session[]
  currentSessionId: string | null
  setCurrentSession: (id: string) => void
  fetchSessions: () => Promise<void>
}

export const useSessionStore = create<SessionStore>((set) => ({
  activeSessions: [],
  currentSessionId: null,
  setCurrentSession: (id) => set({ currentSessionId: id }),
  fetchSessions: async () => {
    const sessions = await listSessions()
    set({ activeSessions: sessions })
  },
}))
```

## State Categories

| Category | Where | Example |
|----------|-------|---------|
| Server/Tauri data | Zustand store | sessions, points, stats |
| Local UI state | `useState` in component | dialog open/close, form input |
| Derived state | `useMemo` or Zustand `get()` | filtered point list |

## When to Use Global State

- Data shared across 2+ pages → Zustand
- Single component ephemeral state → `useState`
- Never duplicate server data in local state — fetch into store once, read everywhere

## Exception: Page-scoped Read-only Data

For pages that display **read-only aggregates used nowhere else** (e.g. Analytics stats), fetch directly into local `useState` — no store needed:

```tsx
const [data, setData] = useState<AnalyticsData | null>(null)
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)

useEffect(() => {
  getAnalytics()
    .then(setData)
    .catch((e: unknown) => setError(String(e)))
    .finally(() => setLoading(false))
}, [])
```

This pattern is acceptable **only when all three hold**: data is read-only, used on a single page, and not needed by any store action.

## Common Mistakes

- ❌ Fetching mutable/shared data inside `useEffect` in a component — put those fetches in store actions
- ❌ Storing entire Point tree in component state — keep in `pointStore`
- ❌ Using page-local `useState` for data that other pages or components need — use Zustand
