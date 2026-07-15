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

### Convention: Remount-safe presentation state

Pages in `App.tsx` are unmounted when navigation selects another page. If durable or session domain state remains in Zustand, component-local presentation state must initialize from that existing domain state instead of assuming every mount is a new workflow.

For staged processing/reveal UI:

- A new or currently busy workflow starts counters at zero.
- Existing non-busy results start in the completed presentation state.
- A mount-time effect must not immediately reset that restored completed state; use an explicit one-shot guard when the normal effect begins by clearing counters.
- Navigation alone must never call import, parse, upsert, or model-analysis actions again.

```ts
const initial = initialPresentation({ hasContent, busy })
const skipInitialReveal = useRef(initial.skipInitialReveal)
const [revealedCount, setRevealedCount] = useState(initial.revealedCount)

useEffect(() => {
  if (skipInitialReveal.current) {
    skipInitialReveal.current = false
    return
  }
  // Normal reveal sequence for a new workflow.
}, [resultCount])
```

Add a focused pure-helper regression test for empty, busy, and existing-complete initialization. Manually verify the owning desktop navigation flow when browser preview cannot reproduce Tauri runtime behavior.

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

## Scenario: Persisted UI Language And Independent Panel Requests

### 1. Scope / Trigger

- Trigger: a settings-backed language preference changes copy in a data panel that loads multiple backend resources.
- Applies to `AppConfig`, `useConfigStore`, Settings controls, Source Workspace asset requests, and every Capability Center view.

### 2. Signatures

```ts
interface AppConfig {
  uiLanguage: 'zh-CN' | 'en-US'
}

commandPresentation(item, language = 'zh-CN'): CommandPresentation
localizeCapabilityScorecard(scorecard, language): CapabilityScorecard

Promise.allSettled([
  listRecentJournalEntries(),
  discoverRelatedAssets('source', sourceId),
])
```

The Rust config contract persists the camel-case field as the store key `ui_language`. `normalize_ui_language(value)` accepts only the exact value `en-US`; a missing, empty, `zh-CN`, or otherwise unsupported value resolves to `zh-CN` on both read and write.

### 3. Contracts

- `uiLanguage` has exactly two supported values: `zh-CN` and `en-US`.
- Existing installations and browser preview default to `zh-CN`.
- Settings saves the preference through the existing typed `get_config` / `set_config` boundary; UI code must not create a second localStorage language source.
- A panel must select all owned headings, actions, empty states, titles, and fallback errors from the same current language.
- Capability Center Overview, diagnostics, and command catalog must use the same preference. Localize backend scorecard labels through `localizeCapabilityScorecard`, and pass the preference into `commandPresentation`; do not translate stable command identifiers or search metadata.
- Journal and Related are independent resources. Either fulfilled result is rendered even when the other rejects.
- An empty fulfilled Related array is a valid empty state, not an error.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Stored language key missing | Return `zh-CN` |
| Stored or submitted language is empty/unsupported | Normalize to `zh-CN`; never expose an invalid value through `AppConfig` |
| Journal succeeds, Related fails | Render Journal; clear only Related; show Related error |
| Journal fails, Related succeeds empty | Render Related empty state; clear only Journal; show Journal error |
| Both requests succeed empty | Render both empty states without an error |
| Language changes while panel is open | Re-render all panel-owned copy in the selected language |

### 5. Good/Base/Bad Cases

- Good: English mode shows English Source Workspace and Capability Center labels and errors while successfully loaded Journal entries remain visible after a Related failure.
- Base: a new installation opens in Chinese and both resource lists may be empty without warnings.
- Bad: `Promise.all` rejects the combined load and clears both lists, an unsupported persisted language leaks into frontend state, or Capability diagnostics retain hard-coded Chinese copy in English mode.

### 6. Tests Required

- Frontend type-check asserts the exact `AppConfig.uiLanguage` union crosses the typed API boundary.
- Backend tests/checks assert missing and unsupported configuration values use `zh-CN`, exact `en-US` is preserved, and config serialization remains camel-case.
- Pure frontend tests assert `commandPresentation` returns language-matched risk/input labels and `localizeCapabilityScorecard` translates Chinese mode while preserving the English scorecard object.
- Manual Tauri verification switches language, saves, restarts, and confirms persistence plus single-language Source Workspace and Capability Center copy.
- Manual failure/empty verification confirms Journal and Related do not erase or mislabel one another.

### 7. Wrong vs Correct

#### Wrong

```ts
const [journal, related] = await Promise.all([loadJournal(), loadRelated()])
```

#### Correct

```ts
const [journal, related] = await Promise.allSettled([loadJournal(), loadRelated()])
// Apply each result to only the state that it owns.
```

## Scenario: Bounded Source Investigation Preparation

### 1. Scope / Trigger

- Trigger: Source Workspace Investigation would otherwise run with too few source-linked Points or Evidence and produce a shallow report.
- Applies to Explore workflow state, `getSourceAssets`, existing Point/Evidence commands, and `generateInvestigation`.

### 2. Signatures

```ts
investigationReadinessForAssets(assets): InvestigationReadiness | null
investigationMissingLabel(kind, language): string

const INVESTIGATION_MIN_POINTS = 3
const INVESTIGATION_MIN_EVIDENCE_OR_REPORTS = 1
const INVESTIGATION_TARGET_POINTS = 5
const INVESTIGATION_TARGET_EVIDENCE = 2
const INVESTIGATION_MAX_AUTO_ANALYSIS_BLOCKS = 8

analyzeTextBlock(text, index): Promise<ChunkCard>
savePoints(points, sourceName, excerpt, sourceLink): Promise<string[]>
factCheckClaim(claim, context): Promise<FactCheckResult>
saveEvidence(result, context): Promise<EvidenceRecord>
generateInvestigation({ mode: 'deep', scope, query }): Promise<DigestResult>
```

### 3. Contracts

- A Source is ready when it has at least three linked Points and at least one linked Evidence item or prior Report.
- Readiness calculation is a pure asset-count contract: unloaded assets return `null`, and language affects only `investigationMissingLabel`, never readiness thresholds or candidate selection.
- Preparation targets five deduplicated Points and two Evidence items while analyzing at most eight valuable source blocks.
- Reuse an existing `ChunkCard` before requesting new block analysis. Persist prepared Points with Source/Chunk links and refresh `SourceAssetsRecord` before generation.
- AI image generation is optional output and is never an Investigation prerequisite.
- One candidate analysis, Point save, or fact-check failure must not discard successful preparation or stop later candidates. Fail only when refreshed assets still miss readiness, and include a useful first-failure hint.
- The normal Source action uses deep Investigation mode after readiness. A visible explicit action may still let the user generate from thin context.
- Loading guards prevent duplicate preparation/generation requests, and Explore page keep-alive preserves the Promise chain across navigation.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Assets have enough context | Generate directly in deep mode |
| Points or evidence are below readiness | Show missing categories and route the primary action to Prepare + Investigate |
| Source has no analyzable blocks | Stop preparation with an actionable text-model/source-content error |
| One candidate analysis or fact check fails | Record the failure and continue with remaining candidates |
| Partial successes reach readiness | Refresh assets and generate; do not surface stale candidate failures as a fatal error |
| Partial successes remain below readiness | Preserve saved assets and show counts plus the first failure hint |
| User switches pages during preparation | Continue work; hidden Explore does not intercept global input |

### 5. Good/Base/Bad Cases

- Good: a thin Source automatically gains five linked Points and two Evidence items, then opens a deep citation-grounded Investigation.
- Base: a Source already has enough context, so no preparation calls are made and deep generation starts immediately.
- Base: one fact check fails, another succeeds, refreshed assets reach readiness, and generation continues.
- Bad: requiring the user to generate AI artwork before Investigation, retrying the same duplicate Point indefinitely, or aborting the whole workflow on the first candidate failure.

### 6. Tests Required

- Pure frontend tests: unloaded assets return `null`; empty assets report both missing categories; three Points plus Evidence or a prior Report are ready; `investigationMissingLabel` returns Chinese and English labels from the same thresholds.
- Frontend gates: `npm run typecheck`, `npm run check:boundaries`, `npm run test:run`, and `npm run build`.
- Backend tests: deep prompt requirements and citation labels remain present; full `cargo check` and `cargo test` pass.
- Manual desktop E2E: run Prepare + Investigate on a thin Source, navigate away and back, confirm progress survives, prepared assets remain linked, and the result is materially richer without image generation.

### 7. Wrong vs Correct

#### Wrong

```ts
// Thin context goes straight to the report model and produces a shallow result.
generateInvestigation({ mode: 'standard', scope, query })
```

#### Correct

```ts
const readiness = investigationReadinessForAssets(assets)
if (!readiness?.ready) await prepareBoundedSourceContext()
await generateInvestigation({ mode: 'deep', scope: refreshedScope, query })
```
