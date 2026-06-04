# Hook Guidelines

> How hooks are used in this project.

---

## Overview

<!--
Document your project's hook conventions here.

Questions to answer:
- What custom hooks do you have?
- How do you handle data fetching?
- What are the naming conventions?
- How do you share stateful logic?
-->

## Data Fetching Pattern

No React Query / SWR. Data fetching lives in **Zustand store actions** (see state-management.md).
Components call store actions on mount:

```tsx
function ExplorePage() {
  const { fetchSessions, activeSessions } = useSessionStore()
  useEffect(() => { fetchSessions() }, [])
  // ...
}
```

## Custom Hook Patterns

Extract only when logic is reused across 2+ components:

```ts
// hooks/useOllamaStatus.ts
export function useOllamaStatus() {
  const [status, setStatus] = useState<OllamaStatus | null>(null)
  useEffect(() => {
    detectOllama().then(setStatus)
  }, [])
  return status
}
```

## Naming Conventions

- Always prefix with `use`
- File: `useFeatureName.ts` in `hooks/` (create this dir when first hook is needed)
- Never create a hook for logic used in only one place — keep it inline
