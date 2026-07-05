# Implementation Audit

> Date: 2026-07-06
> Task: `.trellis/tasks/07-06-high-star-oss-references`

## Scope Implemented

This implementation batch followed `thepoint-second-stage-plan.md` and `borrowable-feature-catalog.md`, limited to the approved immediate slices:

- Indexed Folder descriptor and preview cache reliability.
- Citation quote locator and Report citation audit support.

No sidecar server, HTTP app-internal API, MCP bridge, vector database, plugin runtime, LAN sync, or GraphRAG was introduced.

## Indexed Folder Descriptor Slice

Implemented:

- Extended `indexed_files` with descriptor/cache/status fields: `canonical_path`, `descriptor_kind`, `read_status`, `index_status`, `metadata_json`, `preview_text`, `text_hash`, `extracted_chars`, `total_chars`, and `last_error`.
- Added idempotent inline SQLite migration guards in `db::init_db`.
- Added `UpsertIndexedFileInput` to keep the DB helper contract maintainable as descriptor fields grow.
- Updated scan behavior to canonicalize the folder root, verify root containment, record unsupported/partial/missing/stale states, extract Markdown headings/tags/wikilinks, persist preview text, and compute stable FNV-1a text hashes.
- Added Tauri commands and frontend typed API wrappers for `list_indexed_files_for_folder` and `load_indexed_file_preview`.
- Added Settings UI diagnostics and cached preview panel for Indexed Folder records.

Tests added/updated:

- DB round-trip coverage for the expanded Indexed File fields.
- Command fixture test for markdown preview/metadata, unsupported image, partial unreadable text, and missing file status after rescan.

## Citation Locator And Audit Slice

Implemented:

- Added `locate_citation_quote` command.
- Added `load_report_citation_audit` command.
- Registered both commands in `src-tauri/src/lib.rs`.
- Added frontend shared DTOs, `commandMap` entries, API wrappers, and browser preview fallback for report audit.
- Added ReportModal audit display: coverage count, review-needed count, per-citation locator badges, and first matched snippet when available.

Locator behavior:

- Supports `source`, `point`, and `evidence` targets.
- Prioritizes `quote`, falls back to `excerpt`.
- Returns `located`, `multiple_matches`, `not_found`, `stale`, `target_missing`, and `not_applicable`.
- Computes current target text hash as `fnv1a64:<hex>`.
- Marks `stale` when a provided `sourceTextHash` / `source_text_hash` differs from the current target text hash.
- Leaves persisted reports unchanged; audit is computed from saved `reports.citations_json`.

Tests added:

- Source quote exact location with span and hash.
- Point quote multiple matches.
- Source not found, stale hash, missing target, and no quote/excerpt.
- Evidence quote lookup via excerpt fallback.
- Saved Report audit counts across all locator statuses.

## Confirmation And Testing Loops

### Loop 1: Baseline / Slice Confirmation

Recorded from the continuation handoff:

- Scope was confirmed as the first implementation batch from research artifacts: Indexed Folder descriptor/preview reliability and Citation locator/audit.
- Baseline verification was completed before the previous implementation edits.
- The handoff did not include exact command output for this loop, so exact counts are not restated here.

### Loop 2: Indexed Folder Verification

Recorded from the continuation handoff:

- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed, 63 tests.
- `npm run typecheck`: passed.
- `npm run check:boundaries`: passed.
- `npm run test:run`: passed, 7 files / 21 tests.

### Loop 3: Citation Locator/Audit Verification

Executed in this continuation after adding Citation tests and ReportModal audit UI:

- `cargo test --manifest-path src-tauri/Cargo.toml commands::library::tests::locate_citation_quote -- --nocapture`: passed, 4 targeted tests.
- `cargo test --manifest-path src-tauri/Cargo.toml commands::library::tests::report_citation_audit_counts_locator_statuses_for_saved_report -- --nocapture`: passed, 1 targeted test.
- `npm run typecheck`: passed.
- `npm run check:boundaries`: passed.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- `npm run test:run`: passed, 7 files / 21 tests.
- `npm run build`: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed, 68 tests.

## Deliberate Deferrals

Deferred to later slices:

- Persisted `report_citations` / `report_claims` tables. Current audit is computed from `reports.citations_json`.
- Saving Investigation claims as `cited/inferred/unsupported`.
- Save-time unsupported-claim confirmation.
- Citation highlight/jump to exact Source span in the workspace UI.
- Mirror manifest v2.
- Review Queue v2.
- Unified Search / Filter DSL / Related rules v2.
- AI invocation audit and Investigation context manifest.
- Semantic retrieval/RAG, guarded Agent runtime, plugin/MCP/LAN sync.

## Remaining Risks

- Report audit depends on saved citation JSON having usable `kind`, `id`, and `quote` or `excerpt` fields. Malformed entries are skipped defensively.
- `stale` detection only works when the saved citation includes `sourceTextHash` or `source_text_hash`.
- Source span offsets are returned as character offsets in the synthesized target text, not yet wired to visual source-highlight navigation.
- Browser preview returns `null` for report audit because locator work requires the Tauri/Rust runtime and SQLite.

## Completion Audit

Requirement-by-requirement evidence checked on 2026-07-06:

| Requirement | Evidence | Status |
|---|---|---|
| Research artifact lists selected repositories with URLs, stars, domain/relevance | `research/github-metadata.json`; `research/code-inspection-index.md` project table | Proven |
| Selected repositories are cloned under `炼化/` or documented | Local directories: AFFiNE, anything-llm, AppFlowy, foam, foliole, joplin, khoj, kotaemon, logseq, marginalia, memos, quivr, silverbullet, siyuan, Zettlr, zotero | Proven |
| Research covers all projects currently under `炼化/`, including foliole and marginalia | `research/code-inspection-index.md`; `research/oss-reference-analysis.md` sections for all 16 projects | Proven |
| Analysis is code-inspection based, not README-only | `research/code-inspection-index.md` lists inspection method and deep-read source paths per project | Proven |
| Transferable product/architecture/function/testing ideas are documented | `research/oss-reference-analysis.md`; `research/borrowable-feature-catalog.md` | Proven |
| Second-stage plan separates immediate, later-stage, and unsuitable work | `research/thepoint-second-stage-plan.md` with phases, acceptance criteria, and "暂缓或不建议" | Proven |
| Implementation uses research plan as source of truth | `prd.md`; `implementation-audit.md`; implemented slices match immediate Slice 1 and Slice 2 | Proven |
| Current Tauri/Rust/SQLite/React typed-command architecture is preserved | Commands registered in `src-tauri/src/lib.rs`; frontend calls through `frontend/src/api/*`; no sidecar/vector/plugin/MCP additions in diff | Proven |
| Indexed Folder descriptor/read/index/metadata/preview/cache details are exposed | `src-tauri/src/db/mod.rs` `IndexedFile`/migration/helper fields; `frontend/src/api/types.ts`; Settings diagnostics UI | Proven |
| Indexed Folder scan records missing/unsupported/unreadable without mutating user-owned folders | `scan_indexed_folder_blocking`; `describe_indexed_file`; `mark_missing_indexed_files`; command fixture test | Proven |
| Citation locator returns located/multiple/not_found/stale/target_missing/not_applicable | `locate_citation_quote_in_db`; Rust tests covering all statuses | Proven |
| Report citation audit inspects saved report citations and returns counts/statuses | `load_report_citation_audit`; `build_report_citation_audit`; saved-report audit test | Proven |
| Rust command registration, frontend command map, and API wrappers are updated together | `src-tauri/src/lib.rs`; `frontend/src/api/commandMap.ts`; `frontend/src/api/index.ts`; `frontend/src/api/invoke.ts` | Proven |
| Tests cover new DB/helper behavior and command/API contracts | DB indexed-file round-trip; command fixture tests; Citation locator/audit tests; frontend type/boundary checks | Proven |
| At least three confirmation/testing loops are recorded | Loop 1, Loop 2, Loop 3 sections above | Proven |
| Implementation audit persisted under task directory | This file | Proven |
| Required backend/frontend checks run and recorded | Loop 3 records cargo/npm commands and pass counts | Proven |
| No unrelated product files modified beyond targeted implementation scope | `git diff --name-only HEAD` content changes are limited to task files; `src-tauri/src/commands/digest.rs` and `gallery.rs` appear in `git status` only as no-content line-ending state | Proven with caveat |

