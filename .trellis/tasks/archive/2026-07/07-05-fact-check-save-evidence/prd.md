# Fact Check Save Evidence

## Goal

Make fact-check results durable by saving them as structured Evidence records, while preserving the current ability to save a fact-check as a child Point.

## Requirements

- Add a Tauri command that saves a `FactCheckResult` as an Evidence record through the existing DB helper.
- The save input must carry optional `point_id`, `source_id`, and `chunk_index` context.
- The command must map existing fact-check sources into `evidence_sources`.
- Because `FactCheckResult` has no explicit verdict yet, infer a conservative first-version verdict from the answer text:
  - clear support wording -> `supported`
  - clear contradiction/false wording -> `contradicted`
  - mixed wording -> `mixed`
  - otherwise -> `uncertain`
- Default evidence source stance to `unknown` in this slice. Do not invent support/contradict stance per source from weak text.
- Keep `fact_check_claim` output shape compatible with current UI.
- Update frontend API types, command map, and invoke wrapper for the save command.
- In Explore fact-check bubble, “save” must persist to Evidence instead of localStorage-only state.
- In DeepenActions, running fact-check from a saved Point must also save Evidence linked to that Point before/alongside saving the child fact-check Point.

## Acceptance Criteria

- [x] Backend command `save_evidence` is registered in `src-tauri/src/lib.rs`.
- [x] Backend command accepts structured fact-check data and optional Point/Source/Chunk context.
- [x] Saved Evidence includes claim, answer, context, sources, inferred verdict, and timestamps.
- [x] Explore fact-check save persists Evidence and still gives immediate saved feedback.
- [x] DeepenActions fact-check persists Evidence linked to the current Point.
- [x] Frontend API typecheck covers the new command shape.
- [x] Rust tests cover verdict inference and command save mapping.
- [x] Existing evidence/source DB tests still pass.

## Definition of Done

- [x] `cargo test --manifest-path src-tauri/Cargo.toml evidence` passes.
- [x] `cargo test --manifest-path src-tauri/Cargo.toml fact` passes or the closest targeted command tests pass.
- [x] `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- [x] `npm run typecheck` passes from `frontend/`.
- [x] `npm run check:boundaries` passes from `frontend/`.
- [x] `git diff --check` passes.

## Technical Approach

- Implement the command in `src-tauri/src/commands/library.rs` so it can reuse DB access patterns and source context helpers.
- Reuse `FactCheckResult` / `FactCheckSource` from `commands::extract` rather than duplicating shape.
- Add frontend interfaces for `EvidenceRecord`, `EvidenceSourceRecord`, and `SaveEvidenceInput`.
- Add `saveEvidence(...)` API wrapper and commandMap entry.
- In Explore, use current `sourceId` and selected text block index when saving from annotated text.
- In Library/DeepenActions, resolve point source context before saving Evidence if possible; fall back to Point-only Evidence when no source link exists.

## Out of Scope

- Evidence list panel.
- Source Workspace Evidence panel.
- Evidence search UI.
- Digest citation wiring.
- Changing the fact-check model prompt to emit explicit verdict/stance.
- Auto-saving every fact-check result without user action in Explore.

## Notes

- Previous slice commit: `eb0d896 feat: add evidence ledger data layer`.
- Forward plan: `docs/knowledge-workbench-plan.md` Issue 3.
