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
```

Backend commands:

```rust
generate_investigation(app, input: InvestigationInput) -> Result<DigestResult, String>
save_journal_entry(app, input: SaveJournalEntryInput) -> Result<JournalEntry, String>
list_recent_journal_entries(app) -> Result<Vec<JournalEntry>, String>
search_journal_entries(app, query: String) -> Result<Vec<JournalEntry>, String>
invalidate_journal_entry(app, id: String, reason: String) -> Result<(), String>
discover_related_assets(app, kind: String, id: String) -> Result<Vec<AssetRelationRecord>, String>
rebuild_asset_relations(app) -> Result<usize, String>
add_review_item(app, input: AddReviewItemInput) -> Result<ReviewItem, String>
list_due_review_items(app) -> Result<Vec<ReviewItem>, String>
list_all_review_items(app) -> Result<Vec<ReviewItem>, String>
complete_review_item(app, id: String, rating: String) -> Result<ReviewItem, String>
snooze_review_item(app, id: String, days: i64) -> Result<ReviewItem, String>
dismiss_review_item(app, id: String) -> Result<(), String>
get_open_data_mirror_config(app) -> Result<OpenDataMirrorConfig, String>
set_open_data_mirror_config(app, config: OpenDataMirrorConfig) -> Result<(), String>
export_open_data_mirror(app) -> Result<MirrorExportResult, String>
add_indexed_folder(app, path: String) -> Result<IndexedFolder, String>
list_indexed_folders(app) -> Result<Vec<IndexedFolder>, String>
scan_indexed_folder(app, folder_id: String) -> Result<IndexedFolderScanResult, String>
remove_indexed_folder(app, folder_id: String) -> Result<(), String>
```

Frontend API:

```ts
generateInvestigation(input: InvestigationInput): Promise<DigestResult>
listRecentJournalEntries(): Promise<JournalEntry[]>
discoverRelatedAssets(kind: AssetKind, id: string): Promise<AssetRelationRecord[]>
addReviewItem(input: AddReviewItemInput): Promise<ReviewItem>
exportOpenDataMirror(): Promise<MirrorExportResult>
scanIndexedFolder(folderId: string): Promise<IndexedFolderScanResult>
```

### 3. Contracts

- `reports.kind = 'investigation'` uses the existing `reports` table. Do not create a separate investigation table.
- Saving an Investigation through `save_report` automatically creates one Journal entry with the report summary as the note and citation-derived Source/Point/Evidence IDs.
- Journal can seed future Investigation context, but final citations must still point to Source, Point, or Evidence assets.
- `generate_investigation` gathers explicit scope first, then optional Journal, workspace search, Evidence search, Report search, and related assets.
- `DigestCitation` keeps `kind`, `label`, `id`, `title`, `excerpt`, `source_id`, `chunk_index`, and `url`, and may include `quote` and `reason`.
- Asset relations are rebuilt from Report co-citations, Evidence Source/Point links, Journal co-occurrence, Gallery Point links, and Review Queue co-presence.
- Review scheduling is deliberately simple: `again = 1`, `hard = 3`, `good = 7`, `easy = 14` days. `ease` and `interval_days` are persisted for future scheduler upgrades.
- Open Data Mirror is export-only. It writes stable Markdown plus `manifest.json` under the configured root and never reads changes back into SQLite.
- Indexed folder scanning never moves, copies, or deletes user source files. Text-like files become `source_documents`/`source_chunks`; PDF, EPUB, DOCX, and unknown/binary formats remain metadata-only for now.
- For indexed folders, parser-supported prose formats use `parsers::parse_document`; code/config text formats are read as UTF-8 directly so ordinary source files can be indexed without expanding the import parser contract.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Existing `reports` table lacks `investigation` check value | Inline migration rebuilds the table and preserves existing report rows |
| Blank Investigation query | `generate_investigation` returns `Err("调查问题不能为空")` |
| Investigation context has no Source/Point/Evidence citations | `generate_investigation` returns an error instead of producing uncited output |
| Invalid Journal invalidation reason | DB helper returns validation error |
| Invalid asset kind or relation | DB helper returns validation error |
| Invalid Review target kind, priority, or rating | DB helper returns validation error |
| Snooze days less than 1 | DB helper returns validation error |
| Mirror disabled or missing root path | Export command returns an error and writes nothing |
| Indexed folder path is blank or missing | Add/scan commands return validation errors |
| Text-like file cannot be decoded or parsed | Indexed file row is recorded metadata-only |
| Removing an indexed folder | Deletes `indexed_folders`/`indexed_files` rows only; existing knowledge assets remain |

### 5. Good/Base/Bad Cases

- Good: a user generates an Investigation, saves it as a Report, sees an automatic Journal entry, rebuilds relations, adds the Report to Review, exports Mirror Markdown, and can still open citation-backed assets.
- Good: scanning a Markdown/code folder indexes readable text into Source Workspace while leaving the original files untouched.
- Base: Journal search returns only non-invalidated entries by default.
- Base: Mirror export can include zero assets in a category and still writes `index.md` plus `manifest.json`.
- Bad: treating Journal text as factual evidence in citations, or emitting Investigation conclusions without Source/Point/Evidence citations.
- Bad: deleting a Report, Review item, or indexed folder cascades into Sources, Points, Evidence, Gallery files, or user-owned folders.

### 6. Tests Required

- Rust DB tests: Investigation report kind saves/searches, Journal list/search/invalidate, Review schedule/snooze/dismiss, Mirror config defaults/round-trip, Indexed Folder/File round-trip, and relation rebuild across report/journal/evidence/gallery/review signals.
- Rust command/helper tests: command input conversion for Reports remains camelCase-compatible; Investigation context/citation helpers must stay deterministic when changed.
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
// parse_document rejects code/config extensions, so scanner records code files as metadata-only.
let text = crate::parsers::parse_document(&path)?;
```

#### Correct

```rust
// Scanner owns the broader indexing contract without changing normal import parsing.
let text = read_indexable_text_file(&path, extension.as_deref())?;
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
- `delete_report` deletes only the `reports` row. It must not delete or mutate Sources, Points, Evidence, or files.
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
