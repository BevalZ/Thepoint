# Frontend State Management

> How state is managed in the React frontend.

---

## Overview

The frontend uses Zustand for shared application/domain state and React local state for view-only UI state. There is no server-state cache library. Persistent app data is either in the Tauri/Rust backend through typed API wrappers or in explicitly named localStorage entries for frontend-only history/preferences.

Reference files:

- `frontend/src/store/libraryStore.ts`
- `frontend/src/store/exploreStore.ts`
- `frontend/src/store/configStore.ts`
- `frontend/src/store/evidenceDigestStore.ts`
- `frontend/src/store/synthesisStore.ts`
- `frontend/src/store/reportInputStores.test.ts`
- `frontend/src/pages/Library.tsx`

---

## Store Organization

Each store owns a domain and exports a `use*Store` hook from its file. `frontend/src/store/index.ts` re-exports public stores and store-owned types.

Patterns:

- Define a local `interface` for store state and actions.
- Initialize all state fields in the `create<Store>()` call.
- Put async actions in the store when they mutate shared domain state.
- Use `set((state) => ...)` for updates based on current state.
- Use `get()` for guards or when an action needs current store data.

Example stores:

- `useConfigStore`: app configuration and profiles loaded from backend commands.
- `useLibraryStore`: points, archived points, deepening state, related matches, archive/delete operations.
- `useExploreStore`: current source workspace, parsing/analyzing state, source metadata.
- `useExploreHistoryStore`: local analysis history persisted in localStorage.
- `useEvidenceDigestStore` and `useSynthesisStore`: session selection state for report inputs.

---

## State Categories

### Backend-backed domain state

State persisted by Rust/Tauri commands should be read and mutated through `frontend/src/api`.

Examples:

- Points and archives in `libraryStore.ts`.
- Source workspaces in `exploreStore.ts`.
- Config/profiles in `configStore.ts`.
- Gallery items in `galleryStore.ts`.

After a successful mutation, update local store state to match the backend response or remove the deleted item. Do not optimistically show success before a backend write resolves unless the existing store already follows that pattern.

### Frontend session state

Short-lived cross-component selections can live in small stores.

Examples:

- `useEvidenceDigestStore` tracks selected Evidence records for Digest input.
- `useSynthesisStore` tracks selected Sources for synthesis.

These stores should expose direct operations such as `add`, `toggle`, `remove`, `clear`, and `has`, and should be testable with `useStore.getState()`.

### Component-local UI state

Use `useState` in components for modal open state, search query, draft text, hover/animation flags, temporary loading flags, and page-specific filters.

Examples:

- `Library.tsx` owns `query`, `searchResults`, `selectedReport`, report kind filter, and delete loading state.
- `DigestModal.tsx` owns copied/archive button state.
- `PointCard.tsx` owns edit draft state.

### localStorage-backed frontend state

Use localStorage only for explicit frontend preferences/history, with validation on read.

Examples:

- `Library.tsx` stores view mode and content mode under `lib-view-mode` and `lib-content-mode`.
- `exploreStore.ts` stores analysis history under `explore-analysis-history-v1` and validates entries with `isExploreHistoryItem`.

---

## Error And Loading State

- Use `loading` / `parsing` / `analyzing` booleans where the UI needs a specific busy state.
- Use `error: string | null` for user-visible failures.
- Convert unknown errors through a helper like `errorMessage(e: unknown)`.
- Keep failed fetches from crashing render; clear or preserve existing state according to the current feature contract.

Examples:

- `libraryStore.ts` sets `loading` around `listPoints()` and stores error messages.
- `exploreStore.ts` catches parse/fetch/analyze failures and sets `error`.
- `Library.tsx` catches Evidence/Report recent-list errors independently so one panel failure does not break the whole Library page.

---

## Cross-Store Coordination

Stores may call another store only for a clear domain side effect.

Example: `libraryStore.deletePoint()` removes the point subtree, then calls `useStarStore.getState().init()` so the global Star count stays consistent after deletion.

Avoid broad cross-store coupling. Prefer lifting orchestration into a page or app shell when multiple domains are involved.

---

## Testing Store Behavior

Small deterministic stores should be tested directly with `useStore.getState()`.

Reference: `frontend/src/store/reportInputStores.test.ts` verifies add, dedupe, toggle, remove, and clear behavior for Evidence Digest and Synthesis Source stores.

Use `beforeEach` to reset store state when tests mutate global store singletons.

---

## Anti-Patterns

- Do not duplicate backend command payloads in stores or pages; add typed wrappers in `src/api`.
- Do not store durable user data only in localStorage unless the feature is explicitly local history/preference state.
- Do not keep cross-page selections in component local state.
- Do not update local state as if a backend mutation succeeded before the awaited command resolves.
- Do not leave duplicate records in selection stores; preserve stable order and dedupe by id.
