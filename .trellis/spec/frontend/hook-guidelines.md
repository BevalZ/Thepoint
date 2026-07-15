# Frontend Hook Guidelines

> How hooks are used in this project.

---

## Overview

Custom hooks are rare and focused. They are used when a reusable behavior needs React lifecycle or memoized callbacks, especially DOM animation helpers. Data fetching is usually handled directly in Zustand stores or page-level `useEffect` blocks rather than through a query library.

Reference files:

- `frontend/src/hooks/useStarFly.ts`
- `frontend/src/hooks/useFlyToHeatmapCell.ts`
- `frontend/src/pages/Explore.tsx` for page-local hooks such as `useScrollMoreHint`.
- `frontend/src/App.tsx` for app-shell effects and memoized navigation callbacks.

---

## Custom Hook Patterns

Custom hooks should:

- Be named `use*`.
- Return a stable callback or a small state object.
- Keep DOM measurements at call time when the target can move due to resize or scroll.
- Clean up DOM nodes, timers, listeners, and observers they create.

`useStarFly()` returns a memoized callback that clones the source element, animates it to the global Star ring, and removes the clone on animation finish.

`useFlyToHeatmapCell()` returns a memoized callback that finds a heatmap cell by `data-date`, scrolls if needed, runs the animation, then calls `onDone`.

### Event-Driven Layout Measurement

When an overlay follows another element, measure it once on mount and schedule a single `requestAnimationFrame` after `resize` or captured `scroll` events. Do not leave a self-scheduling `requestAnimationFrame` loop running while the overlay is merely visible. Reuse the last coordinates when values are unchanged to avoid a redundant React render.

```ts
const schedule = () => {
  if (frame !== 0) return
  frame = requestAnimationFrame(() => {
    frame = 0
    update()
  })
}
```

---

## Page-Local Hooks

When a hook is only meaningful inside one large page, it can stay in that page file.

Example: `useScrollMoreHint` in `Explore.tsx` observes one scroll container and depends on page-specific layout behavior. It creates a `ResizeObserver`, listens to resize/scroll, and cleans everything up in the effect return function.

Extract a page-local hook to `src/hooks/` only when another page needs it or the hook becomes a stable reusable UI primitive.

---

## Data Fetching

There is no React Query/SWR layer. Existing patterns are:

- Store-owned async actions for domain state, e.g. `useLibraryStore.fetch()` and `useConfigStore.fetchConfig()`.
- Page-owned effects for view-specific recent/search state, e.g. `Library.tsx` loading recent Evidence/Reports.
- Direct typed API calls inside event handlers when the result only affects the current component.

Async hooks/effects should:

- Set loading/error state before the request when the UI depends on it.
- Catch failures and render an error or empty state rather than throwing from render.
- Use an `alive` flag or cleanup when delayed/debounced requests can resolve after the component changes mode or query.

---

## Effects And Event Listeners

- Always return cleanup for global event listeners, timers, `ResizeObserver`, Tauri `listen` callbacks, and DOM nodes appended to `document.body`.
- Keep effect dependencies explicit. Memoize event handlers with `useCallback` when they are effect dependencies.
- Use `void` when intentionally starting an async action from a synchronous event or effect.

Reference examples:

- `Explore.tsx` cleans up document drag/drop and paste listeners.
- `exploreStore.ts` unregisters Tauri streaming listeners after completion.
- `App.tsx` guards Tauri window API calls behind runtime detection.

---

## Anti-Patterns

- Do not introduce a fetching hook that bypasses the existing Zustand/API boundary for one feature.
- Do not add hooks that hide durable domain state inside component-local closures.
- Do not leave cloned DOM elements or global listeners without cleanup.
- Do not read layout once at hook creation time for an animation target that can move.
- Do not use a perpetual `requestAnimationFrame` loop for a static overlay or connection line.
