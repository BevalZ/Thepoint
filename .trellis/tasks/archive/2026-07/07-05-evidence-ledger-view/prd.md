# Evidence Ledger View MVP

## Goal

Add a dedicated Evidence ledger surface so saved fact checks are visible, filterable, and reusable even when the user is not actively searching.

## Requirements

* Add an Evidence management subview in the Library page.
* Show recent Evidence by default, ordered newest first.
* Support text search over Evidence claim, answer, context, reasoning, and external evidence source fields.
* Support verdict filtering for `supported`, `contradicted`, `mixed`, and `uncertain`.
* Let users jump from an Evidence record back to its linked Source/Chunk when available.
* Show external evidence source links.
* Let users add/remove Evidence records from Digest input.
* Provide a clear empty state explaining that Evidence comes from saved fact checks.

## Acceptance Criteria

* [ ] Library includes an Evidence view that works without entering a search query.
* [ ] Evidence view can list recent/all records from persisted SQLite data.
* [ ] Evidence search and verdict filters can be combined.
* [ ] Evidence records preserve existing source jump and Digest input actions.
* [ ] Empty and no-results states distinguish "no saved Evidence yet" from "filters matched nothing".
* [ ] UI does not call Tauri `invoke` directly; calls go through `frontend/src/api`.
* [ ] Backend command registration, frontend command map, and API wrapper stay in sync.
* [ ] Focused backend and frontend regressions cover the new list/filter behavior.

## Definition of Done

* Rust tests for Evidence data access pass.
* Frontend Vitest tests pass.
* Frontend typecheck and boundary checks pass.
* `cargo check` passes.
* Trellis check has been run before commit.

## Technical Approach

Add a small `list_recent_evidence` DB helper and Tauri command instead of overloading `search_evidence` with blank-query behavior. Reuse the existing `EvidenceList` component, `searchEvidence`, and `useEvidenceDigestStore`. Add the Evidence ledger as a Library subview because Library already owns knowledge asset browsing, search, Digest input selection, and source jumps.

## Decision (ADR-lite)

**Context**: Evidence is currently visible through point/source context and search results, but users cannot browse saved fact checks as a first-class ledger.

**Decision**: Add a Library Evidence subview backed by a recent/all Evidence command, with client-side verdict filtering and existing search behavior.

**Consequences**: The MVP remains small and reuses existing UI/data flows. It does not introduce editing, deletion, trust scoring, or a new persisted report model.

## Out of Scope

* Editing Evidence.
* Deleting Evidence.
* Trust scoring or automatic recrawl/recheck.
* Semantic search.
* New report persistence tables.

## Technical Notes

* Existing Evidence component: `frontend/src/components/EvidenceList.tsx`.
* Existing Library search and Digest input integration: `frontend/src/pages/Library.tsx`.
* Existing Evidence API surface: `frontend/src/api/index.ts`, `frontend/src/api/commandMap.ts`, `frontend/src/api/types.ts`.
* Existing backend Evidence helpers: `src-tauri/src/db/mod.rs`, `src-tauri/src/commands/library.rs`, `src-tauri/src/lib.rs`.
* Product roadmap reference: `docs/knowledge-workbench-plan.md`.
