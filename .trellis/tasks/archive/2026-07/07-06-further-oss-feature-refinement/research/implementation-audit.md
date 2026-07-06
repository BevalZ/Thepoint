# Implementation Audit: AI Invocation Audit And Context Manifest

## Summary

Implemented the recommended `炼化/` refinement slice: every successful Investigation generation now creates a durable local AI invocation audit and context manifest, and saved Investigation Reports can display that generation context in ReportModal.

This implementation keeps the existing Tauri command, Rust SQLite, and typed React API architecture. It does not add a sidecar, HTTP API, vector database, RAG runtime, agent runtime, plugin system, MCP server, or sync layer.

## Backend

- Added SQLite tables in `db::init_db`: `ai_invocations` and `investigation_context_items`, with indexes for task/output lookup and context target lookup.
- Added DB DTOs and helpers for saving invocations, saving context items, linking an invocation to a saved output, loading a report invocation audit, and computing stable `fnv1a64` text hashes.
- Extended `generate_investigation` to persist an audit after a successful model response and return `DigestResult.invocationId`.
- Added prompt versioning for Investigation with `investigation.v1`.
- Recorded context item roles: `source`, `point`, `evidence`, `prior_report`, `journal_recall`, and `related_clue`.
- Stored only audit metadata: model, prompt version, query, scoped refs, manifest counts, warnings, target IDs, labels, roles, included/truncated flags, reason, char count, and stable text hash.
- Extended `save_report` to accept `invocation_id` and link the invocation to the saved Report.
- Added `load_report_invocation_audit` Tauri command and registration.
- Reused `db::stable_text_hash` from citation audit code to avoid duplicate hash algorithms.

## Frontend

- Extended `DigestResult` and `SaveReportInput` with optional `invocationId`.
- Added `AiInvocationRecord`, `InvestigationContextItemRecord`, and `ReportInvocationAudit` API types.
- Added typed API wrapper `loadReportInvocationAudit(reportId)` and browser fallback returning `null`.
- Updated `reportSaveInput()` to forward `result.invocationId` when saving a generated Report.
- Updated ReportModal to load citation audit and invocation audit through typed API wrappers.
- Added a ReportModal "生成上下文" panel showing model, prompt version, input query, warnings, context totals, included/truncated counts, and context rows.
- Legacy Reports without invocation audit continue to open normally.

## Tests And Verification

- Added Rust DB test `ai_invocation_audit_persists_context_and_links_to_report`.
- Updated frontend report artifact test to cover invocation id propagation and legacy saved-report reconstruction.
- Verification run:
  - `cargo check --manifest-path src-tauri/Cargo.toml`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `npm run typecheck`
  - `npm run check:boundaries`
  - `npm run test:run`
  - `npm run build`

All checks passed.

## Follow-Up Candidates

- Persisted Report Claims/Citations with save-time coverage gate.
- Citation jump/highlight UI using existing locator spans.
- Open Data Mirror v2 plan/manifest/prune.
