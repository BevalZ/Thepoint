# Implementation Audit: Persisted Report Claims/Citations

## Summary

Implemented the save-time durable audit layer for Reports:

- Added `report_citations` and `report_claims` tables in `db::init_db`.
- Added DB records and helpers for `ReportAuditRecord`, `ReportAuditCoverage`, persistent claim rows, and persistent citation rows.
- Updated `save_report` to save the Report, persistent audit rows, optional AI invocation link, and Investigation Journal entry in one SQLite transaction.
- Added `load_report_audit(report_id)` as a Tauri command and frontend typed API wrapper.
- Updated `ReportModal` to display persisted coverage, warnings, and claim shells while preserving the existing computed citation audit UI.

## Backend Contract

- `report_claims` stores deterministic claim shells extracted from Report Markdown.
- Claim shells with labels like `[S1]`, `[P1]`, or `[E1]` are `cited`; other substantive shells are `inferred`.
- `report_citations` stores target, label, title, quote/excerpt, reason, source location metadata, current target text hash, first matched span, locator status, and match count.
- Persistent citation rows reuse the existing citation locator from `commands/library.rs`; the DB layer does not duplicate locator rules.
- Legacy Reports without persistent rows still return an audit payload with empty rows and coverage warnings.
- Browser fallback returns `null` for `load_report_audit`.

## Tests Added

- DB: `extract_report_claims_marks_cited_and_inferred_shells`
- DB: `report_audit_rows_round_trip_and_summarize_coverage`
- Command/helper: `persisted_report_audit_saves_locator_rows_and_claim_shells`

## Verification

Passed during implementation:

- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm run typecheck`
- `npm run check:boundaries`
- `npm run test:run`

Final full verification is run after spec/doc updates.
