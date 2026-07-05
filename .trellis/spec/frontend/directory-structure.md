# Frontend Directory Structure

> Project-specific layout for the React/Vite frontend.

---

## Overview

The frontend lives under `frontend/` and is a single React 18 application for the Tauri desktop shell. Source code is organized by responsibility rather than by route-only feature folders:

```text
frontend/
├── scripts/                  # local verification scripts
├── src/
│   ├── api/                  # typed Tauri command boundary
│   ├── components/           # shared and feature-specific UI components
│   │   └── library/          # Library view variants
│   ├── hooks/                # reusable DOM/animation hooks
│   ├── lib/                  # pure helpers and tested artifact logic
│   ├── pages/                # top-level application pages
│   ├── store/                # Zustand stores and store tests
│   ├── App.tsx               # app shell, navigation, lazy page loading
│   ├── index.css             # Tailwind tokens and global styles
│   └── main.tsx              # React entrypoint
├── package.json
├── tsconfig.json
└── vite.config.ts
```

Reference files:

- `frontend/src/App.tsx` wires top-level navigation and lazy page loading.
- `frontend/src/pages/Library.tsx` owns the Library page workflow.
- `frontend/src/components/library/GroupedView.tsx` and sibling files are page-specific view components.
- `frontend/src/api/commandMap.ts`, `frontend/src/api/index.ts`, and `frontend/src/api/invoke.ts` define the command boundary.

---

## Module Boundaries

### `src/api/`

All Tauri command calls go through this directory.

- `commandMap.ts` is the typed command registry.
- `invoke.ts` is the only regular place to import `@tauri-apps/api/core` and call `invoke`.
- `index.ts` exposes narrow frontend functions such as `searchReports(query)` and `saveEvidence(result, context)`.

Do not call `invoke` directly from `pages/`, `components/`, `store/`, or `lib/`.

### `src/pages/`

Top-level pages own workflow state, cross-component orchestration, and page-specific helper functions. Large pages may keep local subcomponents and pure helpers in the same file when the behavior is only used there.

Examples:

- `Explore.tsx` contains source parsing UI, fact-check bubble state, selection toolbar state, and local text-processing helpers.
- `Library.tsx` coordinates Library modes, search state, report deletion, synthesis input, and reusable Library view components.

Move code out of a page when it is reused by another page, needs unit tests, or becomes a stable cross-feature contract.

### `src/components/`

Shared UI components live here when they are used across pages or represent a durable UI concept.

Examples:

- `EvidenceList.tsx` renders Evidence records and accepts `renderAction` for page-specific controls.
- `DigestModal.tsx` and `ReportModal.tsx` encapsulate report display and citation controls.
- `Markdown.tsx`, `StarRing.tsx`, and `SourceExcerptButton.tsx` are reusable UI primitives.

Feature-specific component clusters can live under a subdirectory, as with `components/library/*` for Library view modes.

### `src/store/`

Zustand stores live in one file per domain and are re-exported from `store/index.ts`.

Examples:

- `libraryStore.ts` handles points, archive actions, deepening state, and related-point state.
- `exploreStore.ts` handles source workspace state and local explore history.
- `evidenceDigestStore.ts` and `synthesisStore.ts` are small selection stores with direct tests.

### `src/lib/`

Put pure, testable helpers here. This is the preferred home for formatting and artifact logic that must be shared by UI actions, tests, or future features.

Examples:

- `digestArtifacts.ts` builds citation markdown and source excerpts.
- `reportArtifacts.ts` converts reports to/from digest results and filters report kinds.
- `evidenceLedger.ts` filters Evidence by verdict.
- `utils.ts` exposes `cn()` for class merging.

---

## Naming Conventions

- React component files use `PascalCase.tsx`: `DigestModal.tsx`, `PointCard.tsx`.
- Page files use `PascalCase.tsx`: `Explore.tsx`, `Library.tsx`, `Settings.tsx`.
- Zustand stores use `camelCaseStore.ts`: `libraryStore.ts`, `themeStore.ts`.
- Hooks use `use*.ts`: `useStarFly.ts`, `useFlyToHeatmapCell.ts`.
- Pure helper modules use `camelCase.ts` with co-located `*.test.ts` when they have stable behavior: `reportArtifacts.ts` and `reportArtifacts.test.ts`.
- Use the `@/` alias for imports from `src/`, as configured in `vite.config.ts` and `tsconfig.json`.

---

## Placement Rules

- Add new Tauri commands to `src/api/commandMap.ts` and expose them from `src/api/index.ts` before using them in UI or stores.
- Keep reusable artifact transformations in `src/lib/`, not inside component closures.
- Keep single-page orchestration in the page until another page needs it.
- Keep DOM animation helpers that return callbacks in `src/hooks/`.
- Keep shared UI rendering in `src/components/`; use subdirectories only when the components belong to a specific feature cluster.

---

## Anti-Patterns

- Do not create a new top-level source directory for a one-off feature unless the ownership boundary is genuinely new.
- Do not import from `@tauri-apps/api/core` outside `src/api/invoke.ts`; `scripts/check-frontend-boundary.mjs` enforces this.
- Do not duplicate report/digest citation logic in modal components; use `src/lib/*Artifacts.ts`.
- Do not hide long-lived selection state inside a page if multiple components need to read or mutate it; use a small Zustand store.
