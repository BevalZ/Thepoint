# Report management polish

## Goal

Complete the first management pass for persisted Reports so saved Digest and Synthesis reports can be filtered by kind and deleted when they are no longer useful.

## What I already know

* Report persistence already exists across SQLite, Tauri commands, frontend API wrappers, and Library -> Reports.
* Existing report commands are `save_report`, `list_recent_reports`, `get_report`, and `search_reports`.
* `ReportKind` is already constrained to `digest | synthesis` on the frontend and validated by backend save logic.
* Library -> Reports currently shows all recent reports or all search matches with no report-kind filter and no delete affordance.

## Assumptions

* Deleting a Report is a destructive, local-only operation that should remove the `reports` row and not affect Sources, Points, Evidence, or generated markdown files.
* A missing or already-deleted report should be treated as a no-op success at the database/command boundary so repeat clicks or stale UI state do not break the app.
* Type filtering should be frontend-side for this pass because recent/search result limits are already modest and the database has no typed list/search commands yet.

## Requirements

* Add a backend database helper and Tauri command to delete a Report by id.
* Expose the delete command through the typed frontend API layer; UI code must not call Tauri `invoke` directly.
* Add a Reports kind filter in Library with options for all, Digest, and Synthesis.
* Apply the Reports kind filter to both recent reports and search results.
* Add a delete action on each Report row, with confirmation and local list refresh/removal after success.
* Keep Report reopen, citation navigation, copy, and download behavior unchanged.

## Acceptance Criteria

* [ ] Rust database tests prove deleting a report removes it from `get_report`, recent list, and search results.
* [ ] Command/API mapping compiles and preserves the report id payload.
* [ ] Frontend unit tests cover report-kind filtering.
* [ ] Library -> Reports can filter all/digest/synthesis and delete a report without opening it accidentally.
* [ ] `npm run test:run`, `npm run typecheck`, `npm run check:boundaries`, and targeted Cargo checks pass.

## Definition of Done

* Tests added or updated for new backend and frontend behavior.
* Typecheck and boundary checks pass.
* `.trellis/spec/` updated if the cross-layer Report contract changes need to be preserved for future sessions.
* Work committed before Trellis finish-work bookkeeping.

## Technical Approach

* Backend: add `db::delete_report(conn, report_id) -> Result<()>` using `DELETE FROM reports WHERE id = ?1`; blank ids and missing rows are no-op success.
* Commands: add `delete_report(app, report_id) -> Result<(), String>` in `commands/library.rs` and register it in `src-tauri/src/lib.rs`.
* Frontend API: add `deleteReport(reportId)` through `types.ts` / `commandMap.ts` / `index.ts` / `invoke.ts`.
* Frontend UI: add report-kind filter constants/helper, use it in Library -> Reports, and add an icon delete button that stops event propagation.

## Decision (ADR-lite)

**Context**: Reports are now first-class persisted assets, but the Library view lacks basic curation controls.

**Decision**: Implement delete as a first-class command and kind filtering as frontend-only filtering over the existing recent/search result sets.

**Consequences**: This keeps the feature small and avoids adding separate typed search/list SQL commands until scale requires it. Delete still needs cross-layer contract documentation because it adds a command and user-visible destructive behavior.

## Out of Scope

* Editing report titles or summaries.
* Bulk delete, archive/restore, undo, or recycle bin semantics.
* Cross-asset unified search.
* Report-to-source/evidence reverse reference views.
* Server-side report-kind list/search commands.

## Technical Notes

* Main files expected to change:
  * `src-tauri/src/db/mod.rs`
  * `src-tauri/src/commands/library.rs`
  * `src-tauri/src/lib.rs`
  * `frontend/src/api/types.ts`
  * `frontend/src/api/commandMap.ts`
  * `frontend/src/api/index.ts`
  * `frontend/src/api/invoke.ts`
  * `frontend/src/pages/Library.tsx`
  * `frontend/src/lib/reportArtifacts.ts`
  * `frontend/src/lib/reportArtifacts.test.ts`
* Relevant existing spec: `.trellis/spec/backend/database-guidelines.md` scenario "Report Archive Persistence".
