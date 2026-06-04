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

## Common Mistakes

- ❌ Fetching inside `useEffect` in a component — put fetches in store actions
- ❌ Storing entire Point tree in component state — keep in `pointStore`
