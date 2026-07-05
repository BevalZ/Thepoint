# Report Archive MVP

## Goal

Persist generated Digest and multi-source Synthesis reports as first-class knowledge assets so users can reopen, search, copy/download, and follow structured citations after the modal is closed.

## Requirements

* Add a durable `reports` data layer for generated reports.
* Save report body, report kind (`digest` or `synthesis`), title, source name, summary, citations JSON, and creation time.
* Replace DigestModal's current Point-based archive action with a first-class report save action.
* Add Library `Reports` subview alongside `观点` and `Evidence`.
* Show recent reports by default, newest first.
* Support text search over report title, summary, body, kind, and citation JSON.
* Open a saved report in a modal that reuses the existing Markdown and citation rendering behavior.
* Support citation jump back to Source/Chunk and external evidence/source URLs when citation metadata exists.
* Support copy and Markdown download for saved reports.
* Provide clear empty and no-results states.

## Acceptance Criteria

* [ ] A Digest can be generated, saved as a Report, and reopened after closing the modal.
* [ ] A Synthesis report can be saved and reopened.
* [ ] Saved reports retain `DigestResult.citations` as structured JSON, not only Markdown text.
* [ ] Library has a `Reports` subview that lists recent reports without requiring a search query.
* [ ] Reports can be searched by title/summary/body/citation metadata.
* [ ] Saved report citation actions can open Source/Chunk or external URLs where available.
* [ ] UI uses `frontend/src/api` wrappers only; no direct Tauri `invoke` outside the API layer.
* [ ] Backend command registration, frontend commandMap, and API wrappers stay in sync.
* [ ] Focused backend and frontend regressions cover report persistence and artifact rendering.

## Definition of Done

* DB tests for save/list/get/search reports pass.
* Frontend helper tests cover summary/title generation or saved report artifact behavior.
* Frontend typecheck and boundary check pass.
* Relevant Rust tests and `cargo check` pass.
* Trellis check has been run before commit.

## Technical Approach

Add a `reports` SQLite table in `src-tauri/src/db/mod.rs` using the current inline schema initialization pattern. Store citations as JSON text because `DigestCitation` is already a structured frontend/backend contract and the MVP does not need citation-level querying.

Add Tauri commands under `src-tauri/src/commands/library.rs`:

* `save_report`
* `list_recent_reports`
* `get_report`
* `search_reports`

Add matching frontend types/API wrappers, then update `DigestModal` so its archive/save button persists a report instead of creating a `Point`. Library gets a `Reports` mode that lists/searches saved reports and opens a read-only modal using the same citation UI.

## Decision (ADR-lite)

**Context**: DigestModal currently stores reports as Points using `savePoints`, which makes the report searchable as text but loses first-class report identity and forces structured citations into Markdown.

**Decision**: Create a dedicated Report object with body Markdown plus serialized structured citations.

**Consequences**: Reports become reusable assets without changing Digest/Synthesis generation. The MVP intentionally avoids editing, deleting, tagging, report collections, and citation-level SQL joins.

## Out of Scope

* Editing saved reports.
* Deleting saved reports.
* Report tags/collections.
* Citation-level relational tables.
* Automatic title generation through an extra model call.
* Migrating old Point-based archived reports into the new table.

## Technical Notes

* Existing Digest/Synthesis response type: `DigestResult` with `content` and `citations`.
* Existing citation rendering and Markdown artifacts: `frontend/src/components/DigestModal.tsx`, `frontend/src/lib/digestArtifacts.ts`.
* Existing Report-like but unrelated date archive: `suggestions` table and `ExploreSuggestions`; do not overload it.
* Existing Library subview pattern: `frontend/src/pages/Library.tsx`.
* Existing command/API sync files: `src-tauri/src/lib.rs`, `frontend/src/api/types.ts`, `frontend/src/api/commandMap.ts`, `frontend/src/api/index.ts`.
