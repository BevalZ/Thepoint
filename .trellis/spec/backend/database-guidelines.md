# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

The backend uses local SQLite through `rusqlite`, not an ORM. The database file is `deep_explorer.db`, resolved from the Tauri app data directory by `db_path(app)` in `src-tauri/src/db/mod.rs`.

`db/mod.rs` is the database boundary today. It owns:

- serialized record/input structs returned through Tauri commands
- `open_db(path)` and idempotent schema initialization in `init_db(conn)`
- inline schema creation, lightweight migrations, indexes, FTS triggers, and DB helpers
- module-local unit tests for persistence contracts

Commands should call DB helpers from `src-tauri/src/commands/<area>.rs`; they should not duplicate SQL in the command layer except for established local cases such as the batch insert in `save_points`.

---

## Query Patterns

Use explicit `rusqlite` calls with typed helper functions:

- Helpers accept `&Connection` for reads/simple writes and `&mut Connection` when the helper opens a transaction.
- Helpers return `anyhow::Result<T>`.
- Use `params!` / `params_from_iter` instead of string-built values.
- Return hydrated records when callers need nested data, such as `EvidenceRecord { sources }`.
- Treat blank lookup/search inputs as empty results or no-op behavior when that contract already exists.
- Keep command-facing records `#[serde(rename_all = "camelCase")]`.

Good examples:

- `save_evidence(conn: &mut Connection, input: SaveEvidenceInput)` validates and saves evidence plus sources in one transaction.
- `get_evidence`, `list_evidence_for_point`, `list_evidence_for_source`, and `search_evidence` return hydrated Evidence records.
- `save_report`, `get_report`, `list_recent_reports`, `search_reports`, and `delete_report` keep Report archive behavior separate from Points/Sources/Evidence.
- `delete_point` detaches Evidence with `UPDATE evidence_records SET point_id = NULL` before deleting Points.

Async Tauri commands must run DB work inside `tokio::task::spawn_blocking` and map both join errors and DB errors to strings at the command boundary.

---

## Migrations

There is no migrations directory or framework yet. Schema setup and incremental migrations live in `init_db(conn)`:

- Add new tables and indexes with `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`.
- Add new columns with a `column_exists(conn, table, column)` guard before `ALTER TABLE`.
- Keep initialization idempotent so every `open_db(path)` can safely call `init_db`.
- Add backfill logic in `init_db` when existing rows need derived state, as the Points FTS5 backfill does.
- Preserve existing user data during schema changes; do not drop and recreate durable tables for a migration.

If migration complexity outgrows this inline model, introduce a real migration strategy as a separate architecture change and update this spec before adding migration files.

---

## Naming Conventions

Current SQL naming conventions:

- table names are lowercase snake_case plurals, for example `points`, `source_documents`, `source_chunks`, `evidence_records`, `evidence_sources`, `reports`, and `suggestions`
- column names are lowercase snake_case, for example `source_id`, `chunk_index`, `created_at`, `citations_json`
- index names use `idx_<table>_<field_or_purpose>`
- trigger names use `<table_or_feature>_<action>`, for example `points_fts_insert`
- Rust/frontend serialized fields use camelCase at the boundary through serde, while DB columns stay snake_case

IDs are stored as `TEXT` and generated in Rust with `uuid::Uuid::new_v4().to_string()` in the helpers that create durable records.

---

## Common Mistakes

- Do not put schema changes only inside a command handler; schema belongs in `init_db`.
- Do not bypass existing DB helpers from UI-facing command code when a helper owns the contract.
- Do not use raw string interpolation for query values; bind parameters with `rusqlite`.
- Do not delete audit records accidentally when deleting UI objects. Evidence detaches from deleted Points; Report deletion only deletes the Report row.
- Do not return partially hydrated records from helpers whose contract says they include nested records, such as Evidence `sources`.
- Do not change frontend command payload casing by renaming Rust fields without checking `frontend/src/api/commandMap.ts`.

## Scenario: Local Research Workspace Assets

### 1. Scope / Trigger

- Trigger: cross-layer durable research workspace assets: Investigation Reports, Journal memory, asset relations, Review Queue, Open Data Mirror, and External Folder Indexing.
- Applies to: `src-tauri/src/db/mod.rs`, `src-tauri/src/commands/library.rs`, `src-tauri/src/commands/digest.rs`, `src-tauri/src/lib.rs`, `frontend/src/api/*`, `frontend/src/pages/Library.tsx`, `frontend/src/pages/Explore.tsx`, and `frontend/src/pages/Settings.tsx`.
- This scenario must stay local-first. Do not add a Python sidecar, HTTP API, MCP server, background worker queue, Electron, Capacitor, FSRS dependency, embeddings, OCR, or bidirectional mirror sync for this contract.

### 2. Signatures

Report kind:

```rust
kind TEXT NOT NULL CHECK (kind IN ('digest', 'synthesis', 'investigation'))
```

## Scenario: Semantic Chunk Index And Grounded Research Answers

### 1. Scope / Trigger

- Trigger: adding or changing embedding providers, `chunk_embeddings`, hybrid retrieval, Research Q&A citations, credential migration, or DB backup/restore.

### 2. Signatures

```rust
rebuild_semantic_index(input: RebuildSemanticIndexInput) -> SemanticIndexStatus
hybrid_semantic_search(input: HybridSearchInput) -> Vec<HybridSearchHit>
generate_grounded_answer(input: GroundedAnswerInput) -> GroundedAnswerResult
save_grounded_answer_report(input: SaveGroundedAnswerReportInput) -> ReportRecord
```

DB keys are `(chunk_id, model_key)`; vectors are normalized little-endian `f32` blobs with explicit dimension and SHA-256 `text_hash`.

### 3. Contracts

- V1 embeds `source_chunks` only. Missing rows are pending; hash mismatches are stale; old model rows remain but are ignored.
- Local E5 uses `query:` and `passage:` prefixes and must return 384 dimensions. Keyword and semantic candidate limits are 60 and fuse with RRF `k=60`.
- Final index counts must be recomputed from SQLite after a rebuild; batch counters are progress only.
- A Source citation persists `id=source_id` plus `chunk_index`; never store a chunk row id as a citation whose `kind` is `source`.
- Evidence-insufficient requests return `refused=true`, `invocationId=null`, and do not call the chat model.
- Secret migration is write → read verify → delete plaintext. DB migration is integrity check → validated backup → schema change.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Vector bytes/dimension mismatch | Reject row/query; do not score it |
| Remote response count/dimensions mismatch | Return provider error |
| Model answer has no valid `[S#]` or an unknown label | Reject answer |
| No/short selected context | Refuse before chat request |
| Credential write/read verification fails | Keep plaintext value |
| Backup integrity check fails | Do not replace live DB |

### 5. Good/Base/Bad Cases

- Good: changed chunk hash becomes stale, is re-embedded, then final status is read from DB.
- Base: keyword results still work with zero ready vectors.
- Bad: infer final ready/failed totals only from the current rebuild batch.
- Bad: save `{ kind: "source", id: chunk_id }` and break citation resolution.

### 6. Tests Required

- Vector round-trip/dimension, hash invalidation, normalization, RRF ordering/ties, refusal-before-model, citation label validation, remote response validation, and schema idempotence.
- Cross-layer command parity plus frontend typecheck/boundary checks.
- Manual desktop: download/index → search → select → answer → citation jump → save Investigation → restart.

### 7. Wrong vs Correct

#### Wrong

```rust
GroundedCitation { kind: "source".into(), id: hit.id, chunk_index: Some(hit.chunk_index), /* ... */ }
```

#### Correct

```rust
GroundedCitation { kind: "source".into(), id: hit.source_id, chunk_index: Some(hit.chunk_index), /* ... */ }
```

Durable tables:

```sql
journal_entries(id, query, note, tags_json, source_ids_json, point_ids_json,
  evidence_ids_json, report_ids_json, created_report_id, source_kind,
  created_at, invalidated_at, invalidated_reason)
asset_relations(id, from_kind, from_id, to_kind, to_id, relation, reason,
  score, source_kind, created_at, vetted_at)
review_items(id, target_kind, target_id, title, note, status, priority,
  due_at, last_reviewed_at, review_count, ease, interval_days, created_at, updated_at)
open_data_mirror_config(id, enabled, root_path, export_sources, export_evidence,
  export_reports, export_journal, export_gallery_index, updated_at)
indexed_folders(id, path, name, enabled, last_scanned_at, created_at)
indexed_files(id, folder_id, path, name, extension, size_bytes, modified_at,
  source_id, indexed_at)
ai_invocations(id, task_kind, model_profile_id, model_name, prompt_version,
  input_query, input_refs_json, context_manifest_json, output_ref_kind,
  output_ref_id, token_usage_json, warnings_json, created_at)
investigation_context_items(id, invocation_id, target_kind, target_id, label,
  role, included, truncated, reason, char_count, source_text_hash, created_at)
```

Backend commands:

```rust
generate_investigation(app, input: InvestigationInput) -> Result<DigestResult, String>
load_report_invocation_audit(app, report_id: String) -> Result<Option<ReportInvocationAudit>, String>
save_journal_entry(app, input: SaveJournalEntryInput) -> Result<JournalEntry, String>
list_recent_journal_entries(app) -> Result<Vec<JournalEntry>, String>
search_journal_entries(app, query: String) -> Result<Vec<JournalEntry>, String>
invalidate_journal_entry(app, id: String, reason: String) -> Result<(), String>
discover_related_assets(app, kind: String, id: String) -> Result<Vec<AssetRelationRecord>, String>
rebuild_asset_relations(app) -> Result<usize, String>
add_review_item(app, input: AddReviewItemInput) -> Result<ReviewItem, String>
list_due_review_items(app) -> Result<Vec<ReviewItem>, String>
list_all_review_items(app) -> Result<Vec<ReviewItem>, String>
build_review_queue_plan(app, input: ReviewQueuePlanInput) -> Result<ReviewQueuePlan, String>
complete_review_item(app, id: String, rating: String) -> Result<ReviewItem, String>
snooze_review_item(app, id: String, days: i64) -> Result<ReviewItem, String>
dismiss_review_item(app, id: String) -> Result<(), String>
get_open_data_mirror_config(app) -> Result<OpenDataMirrorConfig, String>
set_open_data_mirror_config(app, config: OpenDataMirrorConfig) -> Result<(), String>
build_open_data_mirror_plan(app) -> Result<OpenDataMirrorPlan, String>
export_open_data_mirror(app) -> Result<MirrorExportResult, String>
load_open_data_mirror_manifest(app) -> Result<Option<OpenDataMirrorManifest>, String>
prune_open_data_mirror(app) -> Result<OpenDataMirrorPruneResult, String>
add_indexed_folder(app, path: String) -> Result<IndexedFolder, String>
list_indexed_folders(app) -> Result<Vec<IndexedFolder>, String>
scan_indexed_folder(app, folder_id: String) -> Result<IndexedFolderScanResult, String>
remove_indexed_folder(app, folder_id: String) -> Result<(), String>
```

Frontend API:

```ts
generateInvestigation(input: InvestigationInput): Promise<DigestResult>
loadReportInvocationAudit(reportId: string): Promise<ReportInvocationAudit | null>
listRecentJournalEntries(): Promise<JournalEntry[]>
discoverRelatedAssets(kind: AssetKind, id: string): Promise<AssetRelationRecord[]>
addReviewItem(input: AddReviewItemInput): Promise<ReviewItem>
buildReviewQueuePlan(input?: ReviewQueuePlanInput): Promise<ReviewQueuePlan>
buildOpenDataMirrorPlan(): Promise<OpenDataMirrorPlan>
exportOpenDataMirror(): Promise<MirrorExportResult>
loadOpenDataMirrorManifest(): Promise<OpenDataMirrorManifest | null>
pruneOpenDataMirror(): Promise<OpenDataMirrorPruneResult>
scanIndexedFolder(folderId: string): Promise<IndexedFolderScanResult>
```

### 3. Contracts

- `reports.kind = 'investigation'` uses the existing `reports` table. Do not create a separate investigation table.
- Saving an Investigation through `save_report` automatically creates one Journal entry with the report summary as the note and citation-derived Source/Point/Evidence IDs.
- Journal can seed future Investigation context, but final citations must still point to Source, Point, or Evidence assets.
- `generate_investigation` gathers explicit scope first, then optional Journal, workspace search, Evidence search, Report search, and related assets.
- `generate_investigation` returns `DigestResult.invocationId` for Investigation calls and records a durable AI invocation plus context manifest. Digest and Synthesis may return `null` or omit this field.
- `DigestCitation` keeps `kind`, `label`, `id`, `title`, `excerpt`, `source_id`, `chunk_index`, and `url`, and may include `quote` and `reason`.
- Asset relations are rebuilt from Report co-citations, Evidence Source/Point links, Journal co-occurrence, Gallery Point links, and Review Queue co-presence.
- Review scheduling is deliberately simple: `again = 1`, `hard = 3`, `good = 7`, `easy = 14` days. `ease` and `interval_days` are persisted for future scheduler upgrades.
- Review Queue Planner is schema-free and read-only: `build_review_queue_plan` reads `review_items`, writes nothing, supports `mode = due | catchup`, clamps `limit`, and returns stats plus planned items with `reason`.
- Review Queue Planner sorting must use an explicit rank (`high = 3`, `normal = 2`, `low = 1`) rather than lexicographic string order; future active and dismissed/non-active records are excluded from plan items but counted.
- Open Data Mirror is export-only. It writes stable Markdown plus `manifest.json` under the configured root and never reads changes back into SQLite.
- Open Data Mirror v2 is plan-first: `build_open_data_mirror_plan` returns current assets grouped into `to_write`, `unchanged`, `stale`/overwrite, and `to_prune` without writing or deleting files.
- `export_open_data_mirror` must reuse the same planner, write only `write`/`overwrite` assets plus `index.md` and `manifest.json`, and return the executed plan plus a manifest v2 payload.
- Manifest v2 stores per-asset `kind`, `id`, `title`, relative `path`, `content_hash`, `exported_at`, `attachments`, and `warnings`, plus `counts`, `errors`, `stale`, and `pruned`.
- `load_open_data_mirror_manifest` supports v1 count-only manifests by returning `version = 1`, count summary, and empty asset arrays. It may read when Mirror is disabled as long as `root_path` exists.
- `prune_open_data_mirror` is the only command allowed to delete mirror files. It deletes only current plan `to_prune` paths or manifest stale paths after root-contained relative-path validation.
- Indexed folder scanning never moves, copies, or deletes user source files. Text-like files become `source_documents`/`source_chunks`; PDF, EPUB, DOCX, and unknown/binary formats remain metadata-only for now.
- For indexed folders, parser-supported prose formats use `parsers::parse_document`; code/config text formats are read as UTF-8 directly so ordinary source files can be indexed without expanding the import parser contract.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Existing `reports` table lacks `investigation` check value | Inline migration rebuilds the table and preserves existing report rows |
| Blank Investigation query | `generate_investigation` returns `Err("调查问题不能为空")` |
| Investigation context has no Source/Point/Evidence citations | `generate_investigation` returns an error instead of producing uncited output |
| Report has no linked AI invocation | `load_report_invocation_audit` returns `Ok(None)` and ReportModal still opens |
| Browser preview requests report invocation audit | Frontend fallback returns `null`, never a fake audit |
| Invalid Journal invalidation reason | DB helper returns validation error |
| Invalid asset kind or relation | DB helper returns validation error |
| Invalid Review target kind, priority, or rating | DB helper returns validation error |
| Review planner input has blank/unknown mode | Planner falls back to `mode = "due"` |
| Review planner input has `limit < 1` or missing limit | Planner clamps to `1` or defaults to `12` |
| Review item has future active `due_at` | Planner excludes it from `items` and increments `future_count` |
| Review item is dismissed or otherwise non-active | Planner excludes it from `items` and increments `dismissed_count` |
| Snooze days less than 1 | DB helper returns validation error |
| Mirror disabled or missing root path | Plan/export/prune commands return an error and write/delete nothing |
| Mirror root path set but no manifest exists | Manifest load returns `Ok(None)` |
| Existing manifest is v1 count-only | Manifest load returns counts and empty assets/stale/pruned arrays |
| Mirror plan sees current file hash equals generated hash | Plan item goes to `unchanged` with action `skip` |
| Mirror plan sees current file exists but hash differs | Plan item goes to `stale` with action `overwrite` |
| Mirror manifest asset no longer exists in current export scope | Plan item goes to `to_prune`; export leaves the file untouched |
| Mirror prune path is absolute or contains `..` | Prune records an error for that item and does not delete it |
| Indexed folder path is blank or missing | Add/scan commands return validation errors |
| Text-like file cannot be decoded or parsed | Indexed file row is recorded metadata-only |
| Removing an indexed folder | Deletes `indexed_folders`/`indexed_files` rows only; existing knowledge assets remain |

### 5. Good/Base/Bad Cases

- Good: a user generates an Investigation, saves it as a Report, sees an automatic Journal entry, rebuilds relations, adds the Report to Review, exports Mirror Markdown, and can still open citation-backed assets.
- Good: a user opens Library -> Review and sees a deterministic plan with due/overdue/future/dismissed/overflow counts and per-item reasons.
- Good: scanning a Markdown/code folder indexes readable text into Source Workspace while leaving the original files untouched.
- Base: Journal search returns only non-invalidated entries by default.
- Base: Mirror export can include zero assets in a category and still writes `index.md` plus manifest v2.
- Base: Mirror v1 manifests load as compatibility metadata but cannot produce precise prune candidates.
- Bad: treating Journal text as factual evidence in citations, or emitting Investigation conclusions without Source/Point/Evidence citations.
- Bad: deleting a Report, Review item, or indexed folder cascades into Sources, Points, Evidence, Gallery files, or user-owned folders.
- Bad: export implicitly deletes stale mirror files. Stale cleanup must be a separate explicit prune command.

### 6. Tests Required

- Rust DB tests: Investigation report kind saves/searches, Journal list/search/invalidate, Review schedule/snooze/dismiss, Review planner priority rank/future/dismissed/overflow/limit behavior, Mirror config defaults/round-trip, Indexed Folder/File round-trip, and relation rebuild across report/journal/evidence/gallery/review signals.
- Rust command/helper tests: command input conversion for Reports remains camelCase-compatible; Investigation context/citation helpers must stay deterministic when changed; Mirror planner covers first export, unchanged repeat plans, overwrite/stale detection, manifest v1 loading, disabled-scope prune candidates, and explicit prune deletion.
- Frontend helper tests: report artifact parsing/filtering includes `investigation`; citation JSON with optional `quote`/`reason` remains backward compatible.
- Frontend checks: `npm run typecheck`, `npm run check:boundaries`, `npm run test:run`, and `npm run build`.
- Backend checks: `cargo check --manifest-path src-tauri/Cargo.toml` and `cargo test --manifest-path src-tauri/Cargo.toml`.
- Manual desktop smoke: start the Tauri app after material UI/API changes and confirm the WebView reaches the workbench.

### 7. Wrong vs Correct

#### Wrong

```rust
// Splits Investigation into a separate table and loses Report tooling.
CREATE TABLE investigations (...);
```

#### Correct

```rust
// Investigation remains a first-class Report kind.
validate_report_kind("investigation")?;
db::save_report(conn, input)
```

#### Wrong

```rust
// Lexicographic order puts low/normal/high in string order, not scheduler order.
ORDER BY due_at ASC, priority DESC
```

#### Correct

```rust
// Review planner and due listing use the explicit scheduler rank.
CASE priority WHEN 'high' THEN 3 WHEN 'normal' THEN 2 WHEN 'low' THEN 1 ELSE 0 END
```

#### Wrong

```rust
// Export must not silently delete old mirror paths.
fs::remove_file(root.join(old_manifest_asset.path))?;
```

#### Correct

```rust
// Export reports stale paths; only prune_open_data_mirror may delete them.
let plan = build_open_data_mirror_plan_data(conn, &config, &root)?;
assert!(!plan.plan.to_prune.is_empty());
```

#### Wrong

```rust
// parse_document rejects code/config extensions, so scanner records code files as metadata-only.
let text = crate::parsers::parse_document(&path)?;
```

#### Correct

```rust
// Scanner owns the broader indexing contract without changing normal import parsing.
let text = read_indexable_text_file(&path, extension.as_deref())?;
```

---

## Scenario: AI Invocation Audit And Investigation Context Manifest

### 1. Scope / Trigger

- Trigger: Investigation generation needs a durable audit trail so a saved Report can explain which model, prompt version, input scope, context roles, truncation state, and warnings produced it.
- Applies to: `src-tauri/src/db/mod.rs`, `src-tauri/src/commands/digest.rs`, `src-tauri/src/commands/library.rs`, `src-tauri/src/lib.rs`, `frontend/src/api/*`, `frontend/src/lib/reportArtifacts.ts`, `frontend/src/components/DigestModal.tsx`, and `frontend/src/components/ReportModal.tsx`.
- This is local-first audit metadata. Do not add a sidecar service, HTTP API, vector DB, RAG runtime, plugin runtime, MCP server, or agent tool loop for this contract.

### 2. Signatures

Durable tables:

```sql
ai_invocations(
  id TEXT PRIMARY KEY,
  task_kind TEXT NOT NULL,
  model_profile_id TEXT,
  model_name TEXT,
  prompt_version TEXT NOT NULL,
  input_query TEXT,
  input_refs_json TEXT NOT NULL,
  context_manifest_json TEXT NOT NULL,
  output_ref_kind TEXT,
  output_ref_id TEXT,
  token_usage_json TEXT,
  warnings_json TEXT NOT NULL,
  created_at TEXT NOT NULL
)

investigation_context_items(
  id TEXT PRIMARY KEY,
  invocation_id TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  label TEXT,
  role TEXT NOT NULL,
  included INTEGER NOT NULL,
  truncated INTEGER NOT NULL,
  reason TEXT,
  char_count INTEGER,
  source_text_hash TEXT,
  created_at TEXT NOT NULL
)
```

DB helpers:

```rust
save_ai_invocation(conn: &Connection, input: SaveAiInvocationInput) -> Result<AiInvocationRecord>
get_ai_invocation(conn: &Connection, invocation_id: &str) -> Result<Option<AiInvocationRecord>>
save_investigation_context_items(conn: &Connection, inputs: Vec<SaveInvestigationContextItemInput>) -> Result<Vec<InvestigationContextItemRecord>>
link_ai_invocation_output(conn: &Connection, invocation_id: &str, output_ref_kind: &str, output_ref_id: &str) -> Result<()>
load_report_invocation_audit(conn: &Connection, report_id: &str) -> Result<Option<ReportInvocationAudit>>
stable_text_hash(text: &str) -> String
```

Backend command and payload changes:

```rust
DigestResult {
  content: String,
  citations: Vec<DigestCitation>,
  invocation_id: Option<String>,
}

SaveReportCommandInput {
  title: String,
  kind: String,
  source_name: Option<String>,
  body_md: String,
  summary: String,
  citations_json: String,
  invocation_id: Option<String>,
}

generate_investigation(app, input: InvestigationInput) -> Result<DigestResult, String>
save_report(app, input: SaveReportCommandInput) -> Result<ReportRecord, String>
load_report_invocation_audit(app, report_id: String) -> Result<Option<ReportInvocationAudit>, String>
```

Frontend API:

```ts
interface DigestResult {
  content: string
  citations: DigestCitation[]
  invocationId?: string | null
}

interface SaveReportInput {
  title: string
  kind: ReportKind
  sourceName?: string | null
  bodyMd: string
  summary: string
  citationsJson: string
  invocationId?: string | null
}

loadReportInvocationAudit(reportId: string): Promise<ReportInvocationAudit | null>
```

### 3. Contracts

- `init_db` owns `ai_invocations` and `investigation_context_items` creation with idempotent `CREATE TABLE IF NOT EXISTS` and indexes.
- `generate_investigation` writes one invocation record after a successful model response and returns its `invocationId`; `generate_digest` and `generate_synthesis` may return `null` or omit `invocationId`.
- Investigation audit uses prompt version `investigation.v1` until the prompt contract changes; changing prompt semantics must bump the version.
- Context roles are limited to `source`, `point`, `evidence`, `prior_report`, `journal_recall`, and `related_clue`.
- Context target kinds are limited to `source`, `point`, `evidence`, `report`, `journal`, and `relation`.
- Audit stores metadata only: model name, prompt version, input query, scoped refs, manifest counts, warnings, context role/label/id, included/truncated flags, reason, character count, and stable FNV-1a text hash. Do not persist full prompts or full source/report/journal text in these audit tables.
- `save_report` links `input.invocation_id` to the saved report by updating `ai_invocations.output_ref_kind = 'report'` and `output_ref_id = report.id` before returning.
- `load_report_invocation_audit` returns the latest invocation linked to the report plus its ordered context item list and aggregate counts.
- Old Reports without a linked invocation return `Ok(None)` and must still open normally in ReportModal.
- Browser preview fallback returns `null` for `load_report_invocation_audit`; do not synthesize fake audit data outside the Tauri runtime.
- Frontend UI must call `loadReportInvocationAudit` through `frontend/src/api`, and `reportSaveInput()` must forward `DigestResult.invocationId` to `SaveReportInput.invocationId`.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Blank invocation id for output linking | `link_ai_invocation_output` is a no-op success |
| Blank output kind/id during non-blank link | DB helper returns validation error |
| Unsupported output kind | DB helper returns validation error via asset kind validation |
| Blank `task_kind` or `prompt_version` | DB helper returns validation error |
| `input_refs_json`, `context_manifest_json`, or `token_usage_json` is invalid or non-object | DB helper returns validation error |
| `warnings_json` is invalid or non-array | DB helper returns validation error |
| Context item has unsupported `target_kind` or `role` | DB helper returns validation error |
| Blank report id for audit load | Return `Ok(None)` |
| Report exists but has no linked invocation | Return `Ok(None)` |
| Browser fallback loads invocation audit | Return `null` |
| SQLite failure in command | Return `Err(String)` from the command boundary |

### 5. Good/Base/Bad Cases

- Good: user generates an Investigation, saves it as a Report, reopens the Report, and sees model, prompt version, query, warnings, included/truncated counts, and context rows.
- Good: Journal context appears as `journal_recall`, so recall clues are not confused with source/evidence citations.
- Base: a Digest or Synthesis report has no invocation id; saving and reopening still works and no generation-context panel is shown.
- Base: a legacy Investigation report has citations but no invocation link; citation audit can still run and invocation audit returns `null`.
- Bad: storing the full prompt or entire source/report text in `ai_invocations.context_manifest_json`.
- Bad: calling `invoke('load_report_invocation_audit')` directly from ReportModal instead of using the typed API wrapper.
- Bad: treating Journal recall rows as final citation evidence in coverage or claim validation.

### 6. Tests Required

- Rust DB test: invocation input refs/manifest/warnings JSON validation and persistence.
- Rust DB test: context items persist role, included/truncated flags, char count, and source text hash.
- Rust DB test: report linkage via `link_ai_invocation_output` makes `load_report_invocation_audit(report_id)` return invocation, context rows, and aggregate counts.
- Rust command test: `SaveReportCommandInput` remains camelCase-compatible and maps report fields without losing `invocation_id`.
- Frontend helper test: `reportSaveInput()` forwards `DigestResult.invocationId` and `digestResultFromReport()` sets `invocationId: null`.
- Frontend typecheck: `DigestResult`, `SaveReportInput`, `ReportInvocationAudit`, commandMap, API wrapper, and ReportModal compile.
- Boundary check: ReportModal loads invocation audit through `frontend/src/api`.
- Build/test gates: `cargo check`, `cargo test`, `npm run typecheck`, `npm run check:boundaries`, `npm run test:run`, and `npm run build`.

### 7. Wrong vs Correct

#### Wrong

```rust
// Leaks raw user/source content into a long-lived audit row.
context_manifest_json = serde_json::json!({ "fullPrompt": prompt, "allContext": source_text })
```

#### Correct

```rust
// Stores enough metadata to debug generation without persisting full context text.
context_manifest_json = serde_json::json!({ "promptVersion": "investigation.v1", "counts": counts })
source_text_hash = Some(db::stable_text_hash(context_text))
```

#### Wrong

```ts
// Bypasses typed command and browser fallback contracts.
const audit = await invoke('load_report_invocation_audit', { reportId: report.id })
```

#### Correct

```ts
const audit = await loadReportInvocationAudit(report.id)
```

#### Wrong

```rust
// Splits the generated output into an Investigation-only table and loses Report tooling.
INSERT INTO investigation_reports (...)
```

#### Correct

```rust
let report = db::save_report(&conn, report_command_input_to_db(input))?;
db::link_ai_invocation_output(&conn, &invocation_id, "report", &report.id)?;
```

## Scenario: Source Asset Aggregation And Gallery Search

### 1. Scope / Trigger

- Trigger: Source Workspace needs one typed payload containing the durable assets linked to a Source, and Library default search needs Gallery image results alongside Source, Point, Evidence, and Report results.
- Applies to: `src-tauri/src/db/mod.rs`, `src-tauri/src/commands/library.rs`, `src-tauri/src/commands/gallery.rs`, `src-tauri/src/lib.rs`, `frontend/src/api/*`, `frontend/src/pages/Explore.tsx`, and `frontend/src/pages/Library.tsx`.

### 2. Signatures

DB record:

```rust
SourceAssetsRecord {
  source: SourceSummaryRecord,
  points: Vec<StoredPoint>,
  evidence: Vec<EvidenceRecord>,
  reports: Vec<ReportRecord>,
  gallery: Vec<GalleryItem>,
}
```

DB helpers:

```rust
get_source_assets(conn: &Connection, source_id: &str) -> Result<Option<SourceAssetsRecord>>
list_points_for_source(conn: &Connection, source_id: &str, limit: usize) -> Result<Vec<StoredPoint>>
list_reports_for_source(conn: &Connection, source_id: &str, limit: usize) -> Result<Vec<ReportRecord>>
list_gallery_for_source(conn: &Connection, source_id: &str, limit: usize) -> Result<Vec<GalleryItem>>
search_gallery(conn: &Connection, query: &str, limit: usize) -> Result<Vec<GalleryItem>>
```

Backend commands:

```rust
get_source_assets(app, source_id: String) -> Result<Option<SourceAssetsRecord>, String>
search_gallery(app, query: String) -> Result<Vec<GalleryItem>, String>
```

Frontend API:

```ts
getSourceAssets(sourceId: string): Promise<SourceAssetsRecord | null>
searchGallery(query: string): Promise<GalleryItem[]>
```

### 3. Contracts

- `get_source_assets` returns `Ok(None)` when the Source ID is missing from `source_documents`.
- Linked Points come from `point_source_links.source_id`.
- Linked Evidence comes from `evidence_records.source_id` and must remain hydrated with `sources`.
- Linked Reports are Reports whose `citations_json` array references the Source by `sourceId`, `source_id`, or `kind = "source"` plus `id = source_id`.
- Linked Gallery images are Gallery rows whose `point_ids` include a Point linked to the Source through `point_source_links`.
- Gallery rows without source-linked `point_ids` do not appear in Source asset aggregation.
- `search_gallery` is lexical search over `prompt`, `file_path`, `thumbnail_path`, `point_ids`, and `source_points`; semantic/vector search is out of scope.
- Tauri command registration and frontend `commandMap` entries must be updated together.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Blank `source_id` in child list helpers | Return empty vector |
| Missing Source in `get_source_assets` | Return `Ok(None)` |
| Existing Source with no linked assets | Return `Some(SourceAssetsRecord)` with empty vectors |
| Malformed Report `citations_json` | Ignore that Report for source aggregation |
| Report citation uses snake_case `source_id` | Treat as a Source reference |
| Gallery row has no linked Point for Source | Exclude from Source Gallery assets |
| Blank Gallery search query | Return empty vector |
| Gallery search limit is `0` | Return empty vector |
| SQLite failure in command | Return `Err(String)` from the command boundary |

### 5. Good/Base/Bad Cases

- Good: a Source with linked Points, Evidence, Report citations, and Gallery images returns all four grouped asset vectors in one command payload.
- Base: a Source with no linked Gallery images still returns Source metadata plus empty `gallery`.
- Bad: Source asset aggregation scans Gallery `source_points` display text instead of resolving durable `point_ids` through `point_source_links`.

### 6. Tests Required

- DB test: `get_source_assets` returns Source metadata and grouped linked Points, Evidence, Reports, and Gallery images.
- DB test: Report source detection accepts `sourceId`, `source_id`, and `kind=source/id=...` citation shapes.
- DB test: Gallery rows without Source-linked `point_ids` are excluded from Source assets.
- DB test: `search_gallery` matches prompt, paths, point IDs/source point JSON text, respects limit, and returns empty results for blank queries.
- Frontend typecheck: `SourceAssetsRecord`, `getSourceAssets`, and `searchGallery` commandMap/API wrappers compile.
- Boundary check: Explore and Library import only typed wrappers from `frontend/src/api`.

### 7. Wrong vs Correct

#### Wrong

```rust
// Text-only heuristic can attach images to the wrong Source.
gallery.source_points.iter().any(|point| point.source_doc_name == source.title)
```

#### Correct

```rust
// Durable linkage: Gallery -> point_ids -> point_source_links -> Source.
let point_ids = point_ids_for_source(conn, source_id)?;
item.point_ids.iter().any(|point_id| point_ids.contains(point_id))
```

---

## Scenario: Evidence Ledger Data Layer

### 1. Scope / Trigger

- Trigger: database schema change for durable fact-check evidence.
- Applies to: `src-tauri/src/db/mod.rs` inline SQLite initialization and DB helper functions.
- Evidence records are audit objects. They may reference a Point or Source, but they are not deleted when a Point is deleted.

### 2. Signatures

Tables:

```sql
evidence_records(
  id TEXT PRIMARY KEY,
  claim TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (...),
  answer TEXT NOT NULL,
  reasoning TEXT,
  context TEXT,
  point_id TEXT,
  source_id TEXT,
  chunk_index INTEGER,
  checked_at TEXT NOT NULL,
  created_at TEXT NOT NULL
)

evidence_sources(
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL,
  title TEXT,
  url TEXT NOT NULL,
  snippet TEXT,
  stance TEXT NOT NULL CHECK (...),
  created_at TEXT NOT NULL
)
```

Rust helper signatures:

```rust
save_evidence(conn: &mut Connection, input: SaveEvidenceInput) -> Result<EvidenceRecord>
get_evidence(conn: &Connection, evidence_id: &str) -> Result<Option<EvidenceRecord>>
list_evidence_for_point(conn: &Connection, point_id: &str) -> Result<Vec<EvidenceRecord>>
list_evidence_for_source(conn: &Connection, source_id: &str) -> Result<Vec<EvidenceRecord>>
search_evidence(conn: &Connection, query: &str, limit: usize) -> Result<Vec<EvidenceRecord>>
```

### 3. Contracts

- `verdict` values: `supported`, `contradicted`, `mixed`, `uncertain`.
- `stance` values: `support`, `contradict`, `context`, `unknown`.
- `claim`, `answer`, and evidence source `url` are trimmed and must be non-empty.
- Optional string fields are trimmed and converted to `None` when blank.
- Read/list/search helpers return hydrated `EvidenceRecord` values with `sources`.
- `source_id` plus `chunk_index` point to source workspace context when available.
- `delete_point` must set matching `evidence_records.point_id = NULL` before deleting points.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Empty `claim` | Return error before transaction |
| Empty `answer` | Return error before transaction |
| Invalid `verdict` | Return error before transaction |
| Empty evidence source `url` | Return error before transaction |
| Invalid evidence source `stance` | Return error before transaction |
| Blank `evidence_id` in `get_evidence` | Return `Ok(None)` |
| Blank point/source/query for list/search | Return empty vector |

### 5. Good/Base/Bad Cases

- Good: evidence with `point_id`, `source_id`, `chunk_index`, and multiple source URLs saves in one transaction and reads back hydrated.
- Base: evidence with no Point or Source link saves as an independent audit record.
- Bad: deleting a Point must not delete Evidence; it must detach `point_id`.

### 6. Tests Required

- Save/read: assert record fields, trimming, and source rows persist.
- List by Point: assert only matching `point_id` records return, with hydrated sources.
- List by Source: assert only matching `source_id` records return.
- Search: assert matches on claim, answer, reasoning, context, source title/url/snippet/stance.
- Delete Point: assert evidence remains and `point_id` becomes `NULL`.
- Validation: assert invalid verdict, invalid stance, and blank source URL fail.

### 7. Wrong vs Correct

#### Wrong

```rust
// Deletes audit evidence when deleting a point.
DELETE FROM evidence_records WHERE point_id IN (SELECT id FROM descendants);
```

#### Correct

```rust
// Preserves audit evidence and only detaches the deleted Point link.
UPDATE evidence_records SET point_id = NULL WHERE point_id IN (SELECT id FROM descendants);
```

---

## Scenario: Fact Check Save Evidence Command

### 1. Scope / Trigger

- Trigger: new Tauri command and frontend API contract for saving `FactCheckResult` into Evidence Ledger.
- Applies to: `src-tauri/src/commands/library.rs`, `src-tauri/src/lib.rs`, `frontend/src/api/*`, and fact-check UI callers.
- This command bridges transient fact-check results to durable `evidence_records`.

### 2. Signatures

Backend command:

```rust
save_evidence(app, input: SaveEvidenceCommandInput) -> Result<EvidenceRecord, String>
```

Command input:

```rust
SaveEvidenceCommandInput {
  result: FactCheckResult,
  point_id: Option<String>,
  source_id: Option<String>,
  chunk_index: Option<i64>,
}
```

Frontend API:

```ts
saveEvidence(
  result: FactCheckResult,
  context?: { pointId?: string | null; sourceId?: string | null; chunkIndex?: number | null }
): Promise<EvidenceRecord>
```

### 3. Contracts

- `fact_check_claim` response shape stays unchanged; do not require the model to emit `verdict` yet.
- `save_evidence` infers a conservative `verdict` from `FactCheckResult.answer`.
- Evidence source `stance` defaults to `unknown` until fact-check output explicitly supports source-level stance.
- Frontend commandMap entry must match Rust serde camelCase fields: `result`, `pointId`, `sourceId`, `chunkIndex`.
- Explore saves selection fact checks with current `sourceId` and selected block index when available.
- Point/Library fact checks save with `pointId`, then try to attach `sourceId/chunkIndex` from `get_point_source_context`.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Empty `FactCheckResult.claim` | DB helper returns validation error |
| Empty `FactCheckResult.answer` | DB helper returns validation error |
| Blank optional context ids | Persist as `NULL` |
| Missing source link for Point | Save point-only Evidence |
| Empty source URL in `result.sources` | DB helper returns validation error |
| Verdict cannot be inferred confidently | Persist `uncertain` |
| Source context lookup fails in UI | Fall back to point-only Evidence instead of blocking fact-check |

### 5. Good/Base/Bad Cases

- Good: fact-check from a sourced Point saves Evidence with `pointId`, `sourceId`, `chunkIndex`, answer, sources, and inferred verdict.
- Base: Explore selection with no saved Point saves Evidence with Source/Chunk context only.
- Bad: UI says “saved” after writing only localStorage; “saved as Evidence” must mean backend persistence succeeded.

### 6. Tests Required

- Rust unit test: verdict inference maps supported, contradicted, mixed, and uncertain cases.
- Rust unit test: command input maps claim/answer/context/extra/sources/context ids into `db::SaveEvidenceInput`.
- Frontend typecheck: `save_evidence` commandMap and `saveEvidence` wrapper compile with `EvidenceRecord`.
- Boundary check: no direct `invoke` from UI components.

### 7. Wrong vs Correct

#### Wrong

```ts
// Local-only state: disappears from durable Evidence Ledger.
localStorage.setItem('explore-fact-checks-v1', JSON.stringify(result))
```

#### Correct

```ts
// Persist first, then update local UI feedback.
const evidence = await saveEvidence(result, { sourceId, chunkIndex })
```

---

## Scenario: Evidence Display List Commands

### 1. Scope / Trigger

- Trigger: new Tauri commands and frontend API contract for reading durable Evidence into Point and Source views.
- Applies to: `src-tauri/src/commands/library.rs`, `src-tauri/src/lib.rs`, `frontend/src/api/*`, `frontend/src/components/EvidenceList.tsx`, Point tree views, Library Kanban cards, and Explore Source Workspace.
- This scenario is display-only. It must not add global Evidence search, Digest integration, editing, or deletion.

### 2. Signatures

Backend commands:

```rust
list_evidence_for_point(app, point_id: String) -> Result<Vec<EvidenceRecord>, String>
list_evidence_for_source(app, source_id: String) -> Result<Vec<EvidenceRecord>, String>
```

Frontend API:

```ts
listEvidenceForPoint(pointId: string): Promise<EvidenceRecord[]>
listEvidenceForSource(sourceId: string): Promise<EvidenceRecord[]>
```

Command map payloads:

```ts
list_evidence_for_point: { args: { pointId: string }; result: EvidenceRecord[] }
list_evidence_for_source: { args: { sourceId: string }; result: EvidenceRecord[] }
```

### 3. Contracts

- Both commands return hydrated `EvidenceRecord[]` values, including nested `sources`.
- Frontend commandMap uses camelCase serde field names: `pointId`, `sourceId`.
- UI components must call the typed API wrappers, not `invoke` directly.
- Point Evidence display fetches by `point.id`; Source Workspace display fetches by current `sourceId`.
- Evidence with `sourceId` may expose a return control; the control calls the existing Source open path with `(sourceId, chunkIndex)`.
- Evidence without `sourceId` renders a clear no-location state instead of a broken navigation control.
- Empty result sets render no inline Evidence panel; loading state belongs to the parent view when needed.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Blank `point_id` passed to DB helper | Return empty vector |
| Blank `source_id` passed to DB helper | Return empty vector |
| Backend DB error | Command returns `Err(String)` |
| Frontend list request fails in inline Point display | Render no Evidence records and keep existing Point actions usable |
| Frontend Source Workspace list request fails | Clear Source Evidence and stop loading state |
| Evidence has `sourceId` but `chunkIndex = null` | Open Source without focused chunk |
| Evidence has no `sourceId` | Render `无来源定位` |

### 5. Good/Base/Bad Cases

- Good: sourced Evidence appears in both the linked Point card and the Source Workspace, and the locate control opens the correct Source/Chunk.
- Base: Evidence linked only to a Point appears on that Point and shows no source location.
- Bad: a Point card calls Tauri `invoke` directly, or a missing source link renders a locate button that cannot navigate.

### 6. Tests Required

- Rust unit tests: `list_evidence_for_point` and `list_evidence_for_source` return only matching records with hydrated sources.
- Frontend typecheck: commandMap and API wrappers compile against `EvidenceRecord[]`.
- Boundary check: UI components import `listEvidenceForPoint` / `listEvidenceForSource` through `frontend/src/api`, with no direct `invoke`.
- Manual/UI acceptance: after saving fact-check Evidence, Library Point views and Explore Source Workspace show verdict, claim, answer, checked time, evidence source links, and source/chunk return behavior.

### 7. Wrong vs Correct

#### Wrong

```ts
// Bypasses the API boundary and duplicates command payload details in UI code.
const records = await invoke('list_evidence_for_point', { pointId })
```

#### Correct

```ts
// Keeps the command payload typed in one API layer.
const records = await listEvidenceForPoint(pointId)
```

---

## Scenario: Evidence Search And Digest Citations

### 1. Scope / Trigger

- Trigger: new Evidence search/detail commands and changed Digest command request/response contract.
- Applies to: `src-tauri/src/commands/library.rs`, `src-tauri/src/commands/digest.rs`, `src-tauri/src/lib.rs`, `frontend/src/api/*`, Library search UI, StarRing, DigestModal, and the frontend Digest Evidence selection store.
- This scenario makes Evidence reusable in Digest without introducing a persisted Digest report table.

### 2. Signatures

Backend Evidence commands:

```rust
get_evidence(app, evidence_id: String) -> Result<Option<EvidenceRecord>, String>
search_evidence(app, query: String) -> Result<Vec<EvidenceRecord>, String>
```

Backend Digest command:

```rust
GenerateDigestInput { evidence_ids: Vec<String> }
generate_digest(app, input: GenerateDigestInput) -> Result<DigestResult, String>
```

Digest response:

```rust
DigestResult {
  content: String,
  citations: Vec<DigestCitation>
}

DigestCitation {
  kind: String,          // "point" | "evidence"
  label: String,         // "P1", "E1", ...
  id: String,
  title: String,
  excerpt: String,
  source_id: Option<String>,
  chunk_index: Option<i64>,
  url: Option<String>
}
```

Frontend API:

```ts
getEvidence(evidenceId: string): Promise<EvidenceRecord | null>
searchEvidence(query: string): Promise<EvidenceRecord[]>
generateDigest(evidenceIds?: string[]): Promise<DigestResult>
```

### 3. Contracts

- `search_evidence` uses the DB helper and returns hydrated Evidence records with `sources`.
- `get_evidence` returns `null` for blank or missing IDs.
- Frontend commandMap uses camelCase serde field names: `evidenceId`, `evidenceIds`, `sourceId`, `chunkIndex`.
- Library search must render Evidence as a separate section from Source and Point results.
- Selected Evidence for Digest is frontend session state only; durable Evidence remains in SQLite.
- Digest prompt labels starred Points as `[P1]`, `[P2]` and selected Evidence as `[E1]`, `[E2]`.
- Digest modal renders structured citations from `DigestResult.citations`; source/chunk buttons use `sourceId/chunkIndex` when present.
- Copy/download/archive paths must preserve the citation appendix, not just the model Markdown body.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Blank Evidence search query | DB helper returns empty vector |
| Blank Evidence detail ID | `get_evidence` returns `Ok(None)` |
| Duplicate or blank Digest `evidenceIds` | Trim and deduplicate before DB lookup |
| Missing Evidence ID in Digest input | Skip that ID |
| No starred Points and no resolved Evidence | Return `Err("还没有采集任何 point 或选择 Evidence")` |
| Model request fails | Return model/API error and do not clear current frontend Evidence selection |
| Digest succeeds | Clear starred Points in DB and clear frontend Evidence selection |
| Citation lacks source location | Render citation metadata without source/chunk navigation |

### 5. Good/Base/Bad Cases

- Good: user searches Evidence, adds two records to Digest input, generates a Digest with `[E1]` citations, and clicks a citation source button back to Source/Chunk.
- Base: user has only starred Points and no selected Evidence; Digest still works with `[P]` citations.
- Bad: `generate_digest` returns a raw string after the frontend expects `DigestResult`, or Evidence search results are merged into Point results without object-type separation.

### 6. Tests Required

- Rust unit tests: Digest input text includes `[P]` and `[E]` labels.
- Rust unit tests: Digest citation builder preserves Point source locations and Evidence source/chunk/URL metadata.
- Rust unit tests: Digest Evidence ID normalization trims and deduplicates.
- Existing DB tests: Evidence search returns hydrated records from record and source fields.
- Frontend typecheck: `generateDigest`, `DigestModal`, commandMap, and API wrappers compile with `DigestResult`.
- Boundary check: no direct Tauri `invoke` outside `frontend/src/api`.

### 7. Wrong vs Correct

#### Wrong

```ts
// Loses citation metadata; UI cannot jump from Digest citations to sources.
const digest: string = await generateDigest()
```

#### Correct

```ts
// Preserves Markdown body and structured Point/Evidence citation metadata.
const digest = await generateDigest(selectedEvidence.map(record => record.id))
digest.citations.forEach(citation => openSource(citation.sourceId, citation.chunkIndex))
```

---

## Scenario: Evidence Ledger Library View

### 1. Scope / Trigger

- Trigger: first-class Library view for browsing saved Evidence outside search/source/point context.
- Applies to: `src-tauri/src/db/mod.rs`, `src-tauri/src/commands/library.rs`, `src-tauri/src/lib.rs`, `frontend/src/api/*`, `frontend/src/pages/Library.tsx`, and focused frontend helper tests.
- This scenario is display and selection only. It must not add Evidence editing, deletion, trust scoring, or a new persisted report model.

### 2. Signatures

DB helper:

```rust
list_recent_evidence(conn: &Connection, limit: usize) -> Result<Vec<EvidenceRecord>>
```

Backend command:

```rust
list_recent_evidence(app) -> Result<Vec<EvidenceRecord>, String>
```

Frontend API:

```ts
listRecentEvidence(): Promise<EvidenceRecord[]>
```

Frontend helper:

```ts
type EvidenceVerdictFilter = 'all' | EvidenceRecord['verdict']
filterEvidenceByVerdict(records: EvidenceRecord[], verdict: EvidenceVerdictFilter): EvidenceRecord[]
```

### 3. Contracts

- Recent Evidence lists order by `checked_at DESC, created_at DESC`.
- `limit = 0` returns an empty vector.
- List results must be hydrated `EvidenceRecord[]` values with nested `sources`.
- Tauri command registration, frontend commandMap, and API wrapper must be updated together.
- Library Evidence view fetches recent Evidence when selected and uses `searchEvidence(query)` for non-empty Evidence search.
- Verdict filtering is frontend-only over the current recent/search result set.
- Digest input selection uses `useEvidenceDigestStore`; the ledger view must not duplicate that state.
- Source/chunk navigation reuses existing `onOpenSource(sourceId, chunkIndex)` behavior and renders no navigation for Evidence without `sourceId`.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| No saved Evidence | Library Evidence view shows an empty state explaining Evidence comes from saved fact checks |
| Recent list DB error | UI shows a load error and keeps the rest of Library usable |
| Non-empty Evidence search fails | Search result set becomes empty; existing recent list is not overwritten |
| Verdict filter has no match | UI shows a no-results state distinct from no saved Evidence |
| Evidence has external sources | Render source links through `EvidenceList` |
| Evidence has `sourceId` with `chunkIndex = null` | Open Source without focused chunk |
| Evidence has no `sourceId` | Render no-source-location state |

### 5. Good/Base/Bad Cases

- Good: user opens Library → Evidence, sees recent saved fact checks, filters to `mixed`, adds one to Digest input, and jumps back to Source/Chunk.
- Base: user has Evidence with no Source link; record still appears and can be added to Digest, but shows no source location.
- Bad: Evidence ledger calls Tauri `invoke` directly from the page, or search with a verdict filter displays stale results from the Point/Source search mode.

### 6. Tests Required

- Rust unit test: `list_recent_evidence` returns newest hydrated records and respects limit.
- Frontend helper test: verdict filtering preserves order and handles no matches.
- Frontend typecheck: `listRecentEvidence`, commandMap, and Library Evidence view compile with `EvidenceRecord[]`.
- Boundary check: Library imports `listRecentEvidence` and `searchEvidence` from `frontend/src/api`, not direct Tauri invoke.

### 7. Wrong vs Correct

#### Wrong

```ts
// Duplicates command details in UI and bypasses the typed API boundary.
const records = await invoke('list_recent_evidence')
```

#### Correct

```ts
// Keeps command payloads and result typing centralized.
const records = await listRecentEvidence()
const visible = filterEvidenceByVerdict(records, verdictFilter)
```

---

## Scenario: Multi-Source Synthesis Command

### 1. Scope / Trigger

- Trigger: new `generate_synthesis` Tauri command for bounded multi-source synthesis.
- Applies to: `src-tauri/src/commands/digest.rs`, `src-tauri/src/lib.rs`, `frontend/src/api/*`, Library Source search UI, frontend synthesis selection store, and DigestModal reuse.
- This scenario reuses `DigestResult` and does not add a persisted `synthesis_reports` table.

### 2. Signatures

Backend command:

```rust
GenerateSynthesisInput {
  source_ids: Vec<String>,
  include_starred: bool,
}

generate_synthesis(app, input: GenerateSynthesisInput) -> Result<DigestResult, String>
```

Frontend API:

```ts
generateSynthesis(sourceIds: string[], includeStarred: boolean): Promise<DigestResult>
```

Citation kinds:

```ts
DigestCitation.kind: 'source' | 'point' | 'evidence'
```

### 3. Contracts

- `sourceIds` are trimmed, deduplicated, and resolved through `get_source_workspace`.
- Missing Source IDs are skipped; at least one Source or included Star must remain.
- Selected Sources contribute `[S1]`, `[S2]` labels using stable chunk excerpts.
- Evidence linked to selected Sources contributes `[E1]`, `[E2]` labels.
- If `includeStarred` is true, current starred Points contribute `[P1]`, `[P2]` labels.
- Synthesis prompt must explicitly request common themes, aligned claims, conflicting claims, evidence strength, unresolved questions, next steps, and citations.
- Unlike `generate_digest`, `generate_synthesis` must not clear starred Points after success.
- DigestModal can be reused with a synthesis title/source name as long as `DigestResult.citations` remains populated.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Blank or duplicate Source IDs | Trim and deduplicate |
| Missing Source ID | Skip missing Source |
| No resolved Sources and no included starred Points | Return `Err("请选择至少一个 Source，或包含当前 Star 集合")` |
| Selected Source has no chunks | Include Source citation with no chunk focus |
| Selected Source has Evidence | Include Evidence labels and Evidence citations |
| `includeStarred = false` | Do not include Points even if Star collection exists |
| Model/API failure | Return error and keep frontend selection state |

### 5. Good/Base/Bad Cases

- Good: user selects three Sources, includes Stars, receives a report with `[S]`, `[E]`, and `[P]` citations that can jump to Source/Chunk.
- Base: user selects one Source and no Stars; synthesis still works with Source and linked Evidence citations.
- Bad: synthesis silently scans the whole library or clears starred Points as a side effect.

### 6. Tests Required

- Rust unit test: synthesis input text includes `[S]`, `[E]`, and `[P]` labels.
- Rust unit test: synthesis citation builder preserves Source, Evidence, and Point source locations.
- Frontend typecheck: Library synthesis panel, API wrapper, commandMap, and DigestModal compile.
- Boundary check: Library calls `generateSynthesis` through `frontend/src/api`.
- Existing Evidence/Source tests must still pass.

### 7. Wrong vs Correct

#### Wrong

```rust
// Unbounded and untraceable: scans everything and cannot prove citation scope.
let all_points = db::list_points(conn)?;
```

#### Correct

```rust
// Bounded inputs: only user-selected Sources and optional Star collection.
let source_ids = normalized_unique_ids(input.source_ids);
let include_starred = input.include_starred;
```

---

## Scenario: Report Archive Persistence

### 1. Scope / Trigger

- Trigger: generated Digest and Synthesis reports become first-class persisted knowledge assets.
- Applies to: `src-tauri/src/db/mod.rs`, `src-tauri/src/commands/library.rs`, `src-tauri/src/lib.rs`, `frontend/src/api/*`, `frontend/src/components/DigestModal.tsx`, `frontend/src/components/ReportModal.tsx`, `frontend/src/pages/Library.tsx`, and report artifact helpers/tests.
- This scenario persists report content and structured citations. It must not save reports as Points or overload the `suggestions` table.

### 2. Signatures

Table:

```sql
reports(
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('digest', 'synthesis', 'investigation')),
  source_name TEXT,
  body_md TEXT NOT NULL,
  summary TEXT NOT NULL,
  citations_json TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

DB helpers:

```rust
save_report(conn: &Connection, input: SaveReportInput) -> Result<ReportRecord>
get_report(conn: &Connection, report_id: &str) -> Result<Option<ReportRecord>>
list_recent_reports(conn: &Connection, limit: usize) -> Result<Vec<ReportRecord>>
search_reports(conn: &Connection, query: &str, limit: usize) -> Result<Vec<ReportRecord>>
delete_report(conn: &Connection, report_id: &str) -> Result<()>
```

Backend commands:

```rust
save_report(app, input: SaveReportCommandInput) -> Result<ReportRecord, String>
list_recent_reports(app) -> Result<Vec<ReportRecord>, String>
get_report(app, report_id: String) -> Result<Option<ReportRecord>, String>
search_reports(app, query: String) -> Result<Vec<ReportRecord>, String>
delete_report(app, report_id: String) -> Result<(), String>
```

Frontend API:

```ts
saveReport(input: SaveReportInput): Promise<ReportRecord>
listRecentReports(): Promise<ReportRecord[]>
getReport(reportId: string): Promise<ReportRecord | null>
searchReports(query: string): Promise<ReportRecord[]>
deleteReport(reportId: string): Promise<void>
filterReportsByKind(records: ReportRecord[], kind: 'all' | ReportKind): ReportRecord[]
```

### 3. Contracts

- `kind` values are exactly `digest`, `synthesis`, or `investigation`.
- `title`, `body_md`, `summary`, and `citations_json` are required and trimmed before persistence.
- `citations_json` must be valid JSON and must parse to an array.
- `body_md` stores the raw report body. Copy/download paths append the citation appendix from `citations_json`; do not store only flattened Markdown.
- Reports list newest first by `created_at DESC`.
- Report search matches title, kind, source name, body, summary, and citation JSON.
- `delete_report` deletes the `reports` row plus that Report's own `report_claims`/`report_citations` rows. It must not delete or mutate Sources, Points, Evidence, or files.
- Blank or missing `report_id` values are no-op success for delete so stale UI state and repeat actions stay idempotent.
- `DigestModal` saves reports through `saveReport`, not `savePoints`.
- Library `Reports` view uses `listRecentReports` for the empty-query ledger and `searchReports` for non-empty search.
- Library `Reports` kind filtering is frontend-only over the current recent/search result set unless a future scale requirement adds typed list/search commands.
- Library delete actions must call `deleteReport` through `frontend/src/api`, confirm the destructive action, and remove the deleted row from local recent/search state after success.
- Saved report display parses citations defensively; malformed citation entries are ignored rather than breaking the modal.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Blank title/body/summary | DB helper returns validation error |
| Invalid report kind | DB helper returns validation error |
| Blank citation JSON | DB helper returns validation error |
| Citation JSON is invalid or not an array | DB helper returns validation error |
| Blank `report_id` in `get_report` | Return `Ok(None)` |
| Blank `report_id` in `delete_report` | Return `Ok(())` |
| Missing `report_id` in `delete_report` | Return `Ok(())` |
| Blank report search query | Return empty vector |
| Browser preview without Tauri runtime | API fallback returns empty lists/null detail for report read/search commands |
| Delete command DB error | Return `Err(String)` and keep the report visible in UI |
| Saved citation lacks source location | Report modal renders citation metadata without Source/Chunk navigation |

### 5. Good/Base/Bad Cases

- Good: user generates a Digest, saves it as a Report, opens Library -> Reports, reopens the report, and citation controls jump back to Source/Chunk.
- Good: user filters Library -> Reports to `digest`, deletes one saved Digest report, and the row disappears without changing linked Sources, Points, or Evidence.
- Base: report has zero citations; it still saves and reopens, and copy/download produces body Markdown only.
- Bad: report archive writes a Point with the report Markdown, because that loses first-class report identity and forces structured citations into text.
- Bad: deleting a Report cascades into source/evidence tables or leaves the row visible after the command succeeds.

### 6. Tests Required

- Rust DB tests: save/get preserves fields and citation JSON, list recent orders by newest with limit, search matches body/summary/citations, delete removes the report from get/list/search while missing ids are no-op, validation rejects invalid kind/body/citations.
- Rust command test: `SaveReportCommandInput` maps camelCase frontend payload fields into `db::SaveReportInput`.
- Frontend helper tests: save input preserves raw body, citation JSON round-trips into `DigestResult`, copy/download helper appends citation appendix, malformed citation JSON is ignored, report kind filtering preserves order.
- Frontend typecheck: Report types, commandMap, API wrappers, DigestModal, ReportModal, and Library delete/filter UI compile.
- Boundary check: UI imports report commands from `frontend/src/api` only.
- Manual E2E: save Digest and Synthesis reports, filter both kinds in Library -> Reports, delete one report, reopen the remaining report, verify citation actions.

### 7. Wrong vs Correct

#### Wrong

```ts
// Stores the report as a generic Point and loses first-class report metadata.
await savePoints([{ content: digestMarkdownWithCitations(result), tagType: '研报摘要' }])
```

#### Correct

```ts
// Persists raw body plus structured citations for reopening and citation navigation.
await saveReport(reportSaveInput(result, 'digest', '知识研报', '知识研报'))
```

#### Wrong

```rust
// Report delete must not cascade into durable source/evidence assets.
DELETE FROM evidence_records WHERE id IN (SELECT id FROM reports WHERE id = ?1);
```

#### Correct

```rust
// Delete only the report asset; citations remain historical references.
DELETE FROM reports WHERE id = ?1;
```

---

## Scenario: Report Citation Locator And Audit

### 1. Scope / Trigger

- Trigger: saved Report citations need post-save quote location and stale/missing diagnostics without changing the current report archive table shape.
- Applies to: `src-tauri/src/commands/library.rs`, `src-tauri/src/lib.rs`, `frontend/src/api/*`, and `frontend/src/components/ReportModal.tsx`.
- This is a computed audit contract. It remains read-only and recomputes against current Source/Point/Evidence text. Durable per-report citation and claim rows are owned by the later "Persistent Report Claims/Citations" scenario below.

### 2. Signatures

Backend command DTOs:

```rust
CitationLocatorInput {
  kind: String,
  id: String,
  quote: Option<String>,
  excerpt: Option<String>,
  source_id: Option<String>,
  chunk_index: Option<i64>,
  source_text_hash: Option<String>,
}

CitationLocatorResult {
  status: String,
  target_kind: String,
  target_id: String,
  target_title: Option<String>,
  quote: Option<String>,
  match_count: i64,
  locations: Vec<CitationLocation>,
  source_text_hash: Option<String>,
  message: Option<String>,
}

ReportCitationAudit {
  report_id: String,
  total: i64,
  located_count: i64,
  multiple_matches_count: i64,
  not_found_count: i64,
  stale_count: i64,
  target_missing_count: i64,
  not_applicable_count: i64,
  citations: Vec<ReportCitationAuditItem>,
}
```

Backend commands:

```rust
locate_citation_quote(app, input: CitationLocatorInput) -> Result<CitationLocatorResult, String>
load_report_citation_audit(app, report_id: String) -> Result<Option<ReportCitationAudit>, String>
```

Frontend API:

```ts
locateCitationQuote(input: CitationLocatorInput): Promise<CitationLocatorResult>
loadReportCitationAudit(reportId: string): Promise<ReportCitationAudit | null>
```

Report citation JSON fields consumed by audit:

```json
{
  "kind": "source",
  "id": "source-id",
  "label": "S1",
  "title": "Source title",
  "quote": "exact quote",
  "excerpt": "fallback quote",
  "sourceId": "source-id",
  "chunkIndex": 0,
  "sourceTextHash": "fnv1a64:..."
}
```

Snake-case aliases `source_id`, `chunk_index`, and `source_text_hash` are accepted when reading persisted citation JSON.

### 3. Contracts

- Locator targets are `source`, `point`, and `evidence`.
- `quote` is preferred over `excerpt`; if both are blank or missing, return `not_applicable`.
- Source targets locate against the selected `chunk_index` when present, otherwise against all Source chunks joined with blank lines.
- Point targets locate against point content plus non-empty source excerpt.
- Evidence targets locate against claim, answer, reasoning, context, and evidence source snippets.
- Text hash is computed as stable FNV-1a and serialized as `fnv1a64:<16 hex chars>`.
- If input has non-empty `source_text_hash` and it differs from the current target text hash, status is `stale` even if quote text still matches.
- `load_report_citation_audit` returns `Ok(None)` for a missing or blank report id through the existing `get_report` behavior.
- Malformed citation entries in `reports.citations_json` are skipped defensively instead of failing the modal.
- Browser preview fallback returns `null` for report audit. Do not invent a fake successful audit without the Tauri/Rust runtime.

Locator statuses:

```text
located | multiple_matches | not_found | stale | target_missing | not_applicable
```

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Blank `kind` or `id` | Return `target_missing` if quote/excerpt exists, because no target can be resolved |
| Unsupported `kind` | Return `target_missing` |
| Missing Source/Point/Evidence row | Return `target_missing` |
| Missing `quote` and `excerpt` | Return `not_applicable` |
| Quote appears once | Return `located` with one `CitationLocation` |
| Quote appears more than once | Return `multiple_matches` with all exact matches |
| Quote appears zero times | Return `not_found` |
| Provided text hash differs from current target text hash | Return `stale` and include the current hash |
| Report row missing | `load_report_citation_audit` returns `Ok(None)` |
| Report citation JSON malformed or non-array | Audit returns zero parsed citations |
| SQLite failure | Command returns `Err(String)` |

### 5. Good/Base/Bad Cases

- Good: a saved Report citation has `quote`, target Source text still contains it once, and ReportModal shows `located` plus the matched snippet.
- Good: a saved Report citation has a stale `sourceTextHash`, and audit shows `stale` so the user knows to re-check the evidence.
- Base: a citation has only `excerpt`; locator uses it as the quote target.
- Base: a citation has no quote/excerpt; audit counts it as `not_applicable` without hiding the citation metadata.
- Bad: treating a missing target as a successful citation because the citation JSON still has a title or URL.
- Bad: mutating report body or citation JSON during audit. Audit must remain read-only.

### 6. Tests Required

- Rust command/helper tests: exact source quote returns `located`, span offsets, and current text hash.
- Rust command/helper tests: repeated point quote returns `multiple_matches`.
- Rust command/helper tests: absent quote returns `not_found`.
- Rust command/helper tests: mismatched saved hash returns `stale`.
- Rust command/helper tests: missing target returns `target_missing`.
- Rust command/helper tests: no quote/excerpt returns `not_applicable`.
- Rust command/helper tests: evidence text can be located from excerpt fallback.
- Rust command/helper tests: saved Report audit count fields match per-citation locator statuses.
- Frontend typecheck: commandMap, API wrappers, and ReportModal compile with `ReportCitationAudit`.
- Boundary check: ReportModal loads audit through `frontend/src/api`, never direct Tauri `invoke`.

### 7. Wrong vs Correct

#### Wrong

```rust
// Audit must not silently accept historical labels as proof that a citation is still valid.
if citation.title.is_some() {
    status = "located";
}
```

#### Correct

```rust
// Recompute against current target text and expose stale/missing/not-found states.
let current_hash = stable_text_hash(&target.text);
let locations = locate_quote_spans(&target.text, &quote);
```

#### Wrong

```ts
// Bypasses the typed API boundary and duplicates command payload details.
const audit = await invoke('load_report_citation_audit', { reportId: report.id })
```

#### Correct

```ts
// Keeps command names, payloads, result types, and browser fallback centralized.
const audit = await loadReportCitationAudit(report.id)
```

---

## Scenario: Persistent Report Claims/Citations

### 1. Scope / Trigger

- Trigger: saved Reports need durable, save-time claim/citation audit rows so coverage can be reread without reparsing Markdown and citation JSON every time.
- Applies to: `src-tauri/src/db/mod.rs`, `src-tauri/src/commands/library.rs`, `src-tauri/src/lib.rs`, `frontend/src/api/*`, and `frontend/src/components/ReportModal.tsx`.
- This is a local-first persistence contract. Do not add model-based claim extraction, a hard save gate, RAG/vector DB, sidecar service, HTTP API, plugin runtime, or MCP server for this slice.

### 2. Signatures

Durable tables:

```sql
report_citations(
  id, report_id, citation_index, target_kind, target_id, label, title,
  quote, excerpt, reason, source_id, chunk_index, source_text_hash,
  span_start, span_end, locator_status, match_count, created_at
)

report_claims(
  id, report_id, claim_index, claim_text, claim_status,
  citation_labels_json, created_at
)
```

DB helpers:

```rust
replace_report_audit_rows(conn, report_id, claims, citations) -> Result<ReportAuditRecord>
load_report_audit(conn, report_id) -> Result<Option<ReportAuditRecord>>
extract_report_claims(body_md, citation_labels) -> Vec<SaveReportClaimInput>
extract_report_claims_for_report(report) -> Vec<SaveReportClaimInput>
```

Backend command:

```rust
load_report_audit(app, report_id: String) -> Result<Option<ReportAuditRecord>, String>
```

Frontend API:

```ts
loadReportAudit(reportId: string): Promise<ReportAuditRecord | null>
```

### 3. Contracts

- `init_db` owns `report_citations` and `report_claims` creation with idempotent `CREATE TABLE IF NOT EXISTS` and indexes.
- `save_report` persists the Report and replaces its durable audit rows in the same SQLite transaction.
- Citation rows are derived from `reports.citations_json` plus the existing computed locator behavior; do not implement a second locator in the DB layer.
- Persisted citation `target_kind` is limited to `source`, `point`, and `evidence`.
- Persisted citation `locator_status` values match computed audit: `located`, `multiple_matches`, `not_found`, `stale`, `target_missing`, and `not_applicable`.
- Persisted citation `span_start` and `span_end` store the first located span when available. Multi-match details remain available through computed citation audit.
- Persisted claim shells are extracted deterministically from Markdown paragraphs and list items, skipping headings, separators, and fenced code blocks.
- Claim shells containing known citation labels such as `[S1]`, `[P1]`, or `[E1]` are marked `cited`; other substantive shells are marked `inferred`.
- `unsupported` is a reserved claim status for a future stronger gate; this MVP does not aggressively infer it.
- `load_report_audit` returns `Ok(None)` for blank or missing report ids; legacy reports without audit rows return an audit with empty `claims`/`citations` and coverage warnings.
- Browser preview fallback returns `null`; do not synthesize fake audit data outside the Tauri runtime.
- `delete_report` deletes only the Report and its own `report_claims`/`report_citations` rows. It must not delete Sources, Points, Evidence, files, Journal entries, or AI invocation rows.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Blank report id for `load_report_audit` | Return `Ok(None)` |
| Missing report id for `load_report_audit` | Return `Ok(None)` |
| Existing report has no persistent audit rows | Return empty rows with coverage warnings |
| Invalid claim status | DB helper returns validation error |
| Invalid citation target kind | DB helper returns validation error |
| Invalid citation locator status | DB helper returns validation error |
| Negative claim/citation index | DB helper returns validation error |
| Invalid citation span | DB helper returns validation error |
| Malformed citation JSON entry | Save-time persistent citation row skips that entry; report save still uses existing normalized citations JSON validation |
| Browser preview loads persistent audit | Frontend fallback returns `null` |

### 5. Good/Base/Bad Cases

- Good: saving a new Report writes the Report, citation rows, claim shells, invocation link, and Investigation Journal entry in one transaction.
- Good: ReportModal shows persisted coverage and claim shells while still showing computed citation locator details for per-citation diagnosis.
- Base: legacy Reports without audit rows still open and computed citation audit continues to work from `citations_json`.
- Base: Reports with no citations save successfully and show coverage warnings rather than blocking.
- Bad: using an AI model to invent structured claims in this slice, because it couples report saving to a second model workflow.
- Bad: treating persisted citation rows as proof of current validity forever; computed citation audit is still the current-text diagnostic path.

### 6. Tests Required

- Rust DB tests: claim extraction marks cited vs inferred shells; persistent audit rows round-trip; coverage counts cited/inferred/located/warning/missing rows; legacy empty audit returns warnings; report delete removes audit rows only.
- Rust command/helper tests: save-time persistent audit reuses locator-derived span, hash, status, and match count.
- Frontend typecheck: `ReportAuditRecord`, command map, API wrapper, fallback, and ReportModal compile.
- Boundary check: ReportModal imports `loadReportAudit` from `frontend/src/api`, never direct Tauri `invoke`.
- Full checks: `cargo check --manifest-path src-tauri/Cargo.toml`, `cargo test --manifest-path src-tauri/Cargo.toml`, `npm run typecheck`, `npm run check:boundaries`, `npm run test:run`, and `npm run build`.

### 7. Wrong vs Correct

#### Wrong

```rust
// Duplicates locator rules and risks diverging from computed citation audit.
let status = if citation.title.is_some() { "located" } else { "target_missing" };
```

#### Correct

```rust
// Reuse the existing locator, then persist the derived status/hash/span.
let locator = locate_citation_quote_in_db(conn, &citation.input)?;
```

#### Wrong

```ts
// Browser preview must not invent durable audit data.
return { reportId, claims: [], citations: [], coverage: { coverageRatio: 1 } }
```

#### Correct

```ts
// Keep non-Tauri preview honest: no runtime, no audit.
case 'load_report_audit':
  return null as TauriCommandResult<T>
```

---

## Scenario: Unified Asset Search Command

### 1. Scope / Trigger

- Trigger: backend search changes that aggregate multiple Library asset types behind one command.
- Applies to: `src-tauri/src/db/mod.rs`, `src-tauri/src/commands/library.rs`, `src-tauri/src/lib.rs`, `frontend/src/api/*`, and `frontend/src/pages/Library.tsx`.
- This is a local SQLite aggregation contract. Do not add a sidecar, HTTP endpoint, vector DB, schema migration, or arbitrary SQL DSL for this slice.

### 2. Signatures

Backend DTOs and command:

```rust
SearchAssetsInput {
    query: String,
    kinds: Option<Vec<String>>,
    filter: Option<String>,
    limit: Option<i64>,
}

SearchAssetResult {
    kind: String,
    id: String,
    title: String,
    snippet: String,
    preview: Option<String>,
    reason: String,
    score: f64,
    source_id: Option<String>,
    chunk_index: Option<i64>,
    metadata_json: String,
}

search_assets(app, input: SearchAssetsInput) -> Result<Vec<SearchAssetResult>, String>
```

Frontend API:

```ts
searchAssets(input: SearchAssetsInput): Promise<SearchAssetResult[]>
```

### 3. Contracts

- `search_assets` runs SQLite work inside `tokio::task::spawn_blocking`.
- Empty `query` returns `Ok(vec![])`.
- `limit` defaults to `40` and clamps to `1..100`.
- `kinds` is a whitelist over `source`, `point`, `evidence`, `report`, `journal`, `gallery`, and `indexed_file`; unknown kind strings are ignored.
- `filter` supports only exact quoted equality: `kind == "..."`, `reportKind == "investigation"`, and `sourceKind == "indexed_folder"`.
- Filter parsing must not concatenate caller values into SQL. Asset queries use bound parameters and existing helpers wherever possible.
- `source` and `point` reuse `search_workspace`; Evidence, Report, Journal, and Gallery reuse their scoped helpers.
- Indexed File search matches bounded LIKE terms over name, path, canonical path, extension, descriptor/read/index status, metadata, and preview text.
- Results are deduplicated by `(kind, id)`, sorted by coarse score, and truncated to the normalized limit.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Blank query | Return empty list |
| `limit` missing | Use 40 |
| `limit < 1` | Clamp to 1 |
| `limit > 100` | Clamp to 100 |
| Unknown `kinds` entry | Ignore it; if no valid kinds remain, return empty list |
| Malformed filter such as `kind = report` | Return an error containing `unsupported search filter` |
| Unsupported filter field/value | Return an error; do not execute fallback SQL |
| Browser preview calls `search_assets` | Frontend fallback returns `[]` |

### 5. Good/Base/Bad Cases

- Good: default Library search finds a Report, Evidence, Journal entry, Gallery item, and Indexed File through one `searchAssets` call.
- Good: `reportKind == "investigation"` returns Report results whose metadata marks `reportKind: investigation`.
- Base: Indexed File results are display-first and may include `sourceId` when scanning produced a source.
- Base: Ranking is coarse and deterministic; future FTS/semantic ranking can replace scoring behind the same DTO.
- Bad: accepting arbitrary SQL-like filter strings or passing filter text directly into a SQL statement.
- Bad: changing the default Library search back to a component-level multi-command fan-out.

### 6. Tests Required

- Rust DB test: empty query returns empty.
- Rust DB test: `kind == "report"` returns only report results.
- Rust DB test: `reportKind == "investigation"` excludes digest/synthesis reports.
- Rust DB test: malformed filters return a clear error.
- Rust DB test: `sourceKind == "indexed_folder"` can return an `indexed_file` result with metadata/source info.
- Frontend checks: `npm run typecheck`, `npm run check:boundaries`, `npm run test:run`, and `npm run build`.
- Backend checks: `cargo check --manifest-path src-tauri/Cargo.toml` and `cargo test --manifest-path src-tauri/Cargo.toml`.

### 7. Wrong vs Correct

#### Wrong

```rust
let sql = format!("SELECT * FROM reports WHERE {filter}");
```

#### Correct

```rust
let filter = parse_search_asset_filter(input.filter.as_deref())?;
let reports = search_reports(conn, query, limit)?;
```

---

## Scenario: Capability Refinement Read-only Manifests

### 1. Scope / Trigger

- Trigger: adding read-only capability manifest, diagnostic, evaluation, or scorecard commands that aggregate existing local workspace data across backend DB helpers and frontend typed API boundaries.
- Applies to: `src-tauri/src/db/mod.rs`, `src-tauri/src/commands/library.rs`, `src-tauri/src/lib.rs`, `frontend/src/api/types.ts`, `frontend/src/api/commandMap.ts`, `frontend/src/api/index.ts`, and `frontend/src/api/invoke.ts`.
- This scenario covers commands such as `build_block_reference_manifest`, `build_board_snapshot_export`, `build_export_sync_audit`, `run_investigation_qa_eval`, and `build_capability_scorecard`.

### 2. Signatures

Backend helpers and commands:

```rust
build_block_reference_manifest(conn, input: BlockReferenceInput) -> Result<BlockReferenceManifest>
build_board_snapshot_export(conn, input: BoardSnapshotInput) -> Result<BoardSnapshotExport>
build_export_sync_audit(app) -> Result<ExportSyncAuditReport, String>
run_investigation_qa_eval(conn, input: InvestigationQaEvalInput) -> Result<InvestigationQaEvalReport>
build_capability_scorecard() -> CapabilityScorecard
```

Frontend API wrappers:

```ts
buildBlockReferenceManifest(input: BlockReferenceInput): Promise<BlockReferenceManifest>
buildBoardSnapshotExport(input: BoardSnapshotInput): Promise<BoardSnapshotExport>
buildExportSyncAudit(): Promise<ExportSyncAuditReport>
runInvestigationQaEval(input?: InvestigationQaEvalInput): Promise<InvestigationQaEvalReport>
buildCapabilityScorecard(): Promise<CapabilityScorecard>
```

### 3. Contracts

- These commands are read-only unless their name explicitly says save/resolve/export/prune. They must not insert, update, delete, write mirror files, call models, or read arbitrary user files outside existing planner/manifest read paths.
- Manifest payloads must include enough action metadata for future UI: `commandName`, `wrapperName`, `inputJson`, ids, hashes, warnings, and source inspiration where applicable.
- `BlockReferenceManifest` is the source of truth for block cards; board/export UIs should consume it or helpers derived from it rather than reparsing Source/Point/Evidence independently.
- `BoardSnapshotExport` is a draft payload. Markdown generation is allowed, but filesystem writes belong only to explicit export commands.
- `ExportSyncAuditReport` may read mirror files and manifest to compare hashes, but must not create directories, write `manifest.json`, export files, or prune files.
- `InvestigationQaEvalReport` evaluates saved Investigation Reports using persisted report audit rows and deterministic checks; no model judge is allowed in this slice.
- `CapabilityScorecard` is a static product manifest and should be updated when capability rounds or command names change.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Blank block reference kind/id | Return empty manifest with warning |
| Unknown asset kind | Return validation error |
| Missing target asset | Return empty manifest with not-found warning |
| Board snapshot has no block cards | Return empty nodes/edges and propagate warnings |
| Mirror disabled or root path missing | Export sync audit returns `needs_config`, not success |
| Mirror plan/manifest read fails | Export sync audit returns `error` report with diagnostic item |
| No Investigation reports | QA eval returns zero cases with warning |
| Browser preview calls read-only manifest command | Frontend fallback returns empty honest payload with `Tauri runtime unavailable` warning |

### 5. Good/Base/Bad Cases

- Good: a Point target produces `point_card`, linked `source_chunk`, Evidence cards, command metadata, hashes, and no table writes.
- Good: a board snapshot converts block cards to stable nodes/edges plus Mermaid Markdown without writing files.
- Good: mirror audit reports missing/stale/orphaned exports before the user runs export/prune.
- Good: Investigation QA eval marks a multi-document, citation-backed report as pass and an uncited report as fail.
- Base: scorecard command returns a static manifest and has no DB dependency.
- Bad: a read-only diagnostic command silently mutates `asset_relations`, saves review items, writes mirror files, or calls an LLM.
- Bad: frontend components bypass `frontend/src/api` and call Tauri `invoke` directly for these commands.

### 6. Tests Required

- Rust DB/helper tests must compare table counts before/after read-only manifest/eval commands when SQLite data is involved.
- Rust command tests must cover mirror audit states: `needs_config`, missing export, in-sync, and stale export.
- Command palette tests must verify each new capability command is discoverable by source-inspired query terms.
- Frontend checks must include `npm run typecheck` and `npm run check:boundaries` for every new command wrapper.
- Full backend checks must include `cargo check --manifest-path src-tauri/Cargo.toml` and `cargo test --manifest-path src-tauri/Cargo.toml`.

### 7. Wrong vs Correct

#### Wrong

```rust
// A diagnostic command writes mirror files as a side effect.
let export = export_open_data_mirror_blocking(db_path)?;
Ok(audit_from_export(export))
```

#### Correct

```rust
// Audit is read-only: reuse planner and manifest reads, but never export/prune.
let build = build_open_data_mirror_plan_data(&conn, &config, &root)?;
let manifest = read_open_data_mirror_manifest(&root)?;
Ok(export_sync_audit_from_plan(build.plan, manifest))
```
