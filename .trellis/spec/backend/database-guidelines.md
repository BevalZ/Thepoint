# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

<!--
Document your project's database conventions here.

Questions to answer:
- What ORM/query library do you use?
- How are migrations managed?
- What are the naming conventions for tables/columns?
- How do you handle transactions?
-->

(To be filled by the team)

---

## Query Patterns

<!-- How should queries be written? Batch operations? -->

(To be filled by the team)

---

## Migrations

<!-- How to create and run migrations -->

(To be filled by the team)

---

## Naming Conventions

<!-- Table names, column names, index names -->

(To be filled by the team)

---

## Common Mistakes

<!-- Database-related mistakes your team has made -->

(To be filled by the team)

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
  kind TEXT NOT NULL CHECK (kind IN ('digest', 'synthesis')),
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

- `kind` values are exactly `digest` or `synthesis`.
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
