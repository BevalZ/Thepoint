# Capability Center UI

## Goal

Turn the 20 completed capability-refinement rounds into a discoverable, usable frontend surface. Add a Capability Center page for roadmap health and read-only diagnostics, plus a global command palette that routes users to the relevant capability without bypassing the typed API boundary.

## Requirements

* Add a lazy-loaded `CapabilityCenter` page and compact app navigation entry.
* Provide scorecard overview, diagnostics, and command catalog views.
* Render scorecard aggregates, recommendations, and all 20 rounds.
* Load citation quality, reprocess queue, import diagnostics, Investigation QA, and mirror sync audit through existing typed API wrappers.
* Keep diagnostic failures isolated and provide explicit loading, empty, error, and refresh states.
* Add a global `Ctrl/Cmd+K` command palette backed by `listCommandPaletteItems`, with search, keyboard selection, and Escape close.
* Selecting a command routes to the Capability Center and focuses the relevant view.
* Commands with required input or non-read-only risk are described, never dynamically invoked.
* Browser preview fallback data must render as valid empty states.

## Acceptance Criteria

* [x] Navigation opens the Capability Center without affecting existing pages.
* [x] `Ctrl/Cmd+K` opens the palette; typing filters through the manifest; arrows, Enter, and Escape work.
* [x] Overview renders all scorecard aggregates and round rows returned by the backend.
* [x] Diagnostics can refresh and inspect citation, reprocess, import, QA, and mirror results independently.
* [x] Command selection opens the appropriate tab and visibly focuses the selected command where applicable.
* [x] No page/component imports raw Tauri `invoke` or constructs an untyped generic command call.
* [x] Focused helper tests cover command-to-view routing and presentation metadata.
* [x] Typecheck, boundary check, tests, and production build pass.

## Definition of Done

* Tests cover stable command routing and presentation helpers.
* All required frontend quality commands pass.
* The read-only palette execution boundary is captured in the frontend spec.
* Task changes are committed without unrelated dirty files.

## Technical Approach

Create `frontend/src/pages/CapabilityCenter.tsx` for page-owned fetching, `frontend/src/components/CommandPalette.tsx` for the global overlay, and `frontend/src/lib/capabilityCenter.ts` for pure routing and presentation mappings. `App.tsx` remains the navigation owner and passes a transient target into the page. Existing typed API wrappers are reused unchanged.

Each diagnostic request keeps its own result/error status. Refreshes may run concurrently, but rendering remains independent. The command palette only navigates; the Capability Center invokes known typed read-only wrappers.

## Decision (ADR-lite)

**Context**: The backend capabilities are difficult to discover, while a generic command executor would need unsafe runtime payload construction across incompatible commands and risk levels.

**Decision**: Build a navigation-oriented command palette plus a typed read-only Capability Center. Generic selection routes to a known UI view and never calls arbitrary command names.

**Consequences**: Discovery and diagnostics become useful immediately. Input-driven Block Reference and Board Snapshot workflows remain separate UI work because they need asset context and richer renderers.

## Out of Scope

* Dynamic invocation by command or wrapper name.
* Write, export, draft-generation, or model-call execution from the palette.
* Block Reference Cards and Board Snapshot visual preview.
* New backend commands, SQLite schema, or persistent frontend state.
* Changes to `src-tauri/src/commands/digest.rs`, `src-tauri/src/commands/gallery.rs`, or `炼化/`.

## Technical Notes

* `frontend/src/App.tsx` owns navigation and transient page targets.
* `frontend/src/api/index.ts` and `types.ts` already expose all required contracts.
* Relevant specs are under `.trellis/spec/frontend/` and `.trellis/spec/guides/`.
