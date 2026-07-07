# Implementation Audit: Citation Jump/Highlight UI

## Summary

Implemented the 4th `炼化/`-derived feature round: Report citation audit can now open Source Workspace with a transient quote highlight. This turns citation audit from a passive diagnostic into an actionable verification flow.

## Frontend

* Added `frontend/src/lib/sourceHighlight.ts` with `SourceHighlightRequest` and deterministic text splitting.
* Added `frontend/src/lib/sourceHighlight.test.ts` covering offset-based matching, repeated quote disambiguation, quote fallback, and missing quote fallback.
* Extended the app-level `onOpenSource(sourceId, chunkIndex, highlight?)` callback contract.
* Kept highlight state transient in `App.tsx` / `Explore.tsx`, not in Zustand or SQLite.
* Updated `ReportModal` so located Source citations open the Source and highlight the first match.
* Updated `ReportModal` so multiple-match Source citations expose per-match buttons.
* Updated `Explore`/`ThemeBlock` to render a short-lived `<mark>` for the matching source text and gracefully fall back when the quote cannot be found.
* Synchronized callback prop types through Library, DigestModal, and StarRing.

## Spec

* Updated `.trellis/spec/frontend/component-guidelines.md` with the Source Citation Highlight Navigation convention.

## Verification

Passed during implementation:

* `npm run typecheck`
* `npm run check:boundaries`
* `npm run test:run`
* `npm run build`
* `cargo check --manifest-path src-tauri/Cargo.toml`
* `cargo test --manifest-path src-tauri/Cargo.toml`

## Out Of Scope Kept

* No new backend commands or SQLite schema.
* No durable annotation/highlight storage.
* No Point/Evidence card deep-linking.
* No PDF/image coordinate mapping.
