# Evidence Display And Return

## Goal

Make saved Evidence visible from the existing Point and Source workflows, with a reliable return path to Source/Chunk context.

## Requirements

- Add Tauri commands for listing Evidence by Point and by Source.
- Add frontend API wrappers and commandMap entries for those commands.
- Point cards in Library must show a compact Evidence section when Evidence exists for that Point.
- Source Workspace / Explore source view must show a compact Evidence section for the current Source.
- Evidence entries must display verdict, claim, answer, checked time, and source links.
- Evidence entries with `sourceId` + `chunkIndex` must provide a control to jump back to that Source/Chunk.
- Evidence entries with no source context must show a clear “no source location” state.
- Keep this slice display-only; do not add global Evidence search or Digest integration.

## Acceptance Criteria

- [x] `list_evidence_for_point` Tauri command is registered.
- [x] `list_evidence_for_source` Tauri command is registered.
- [x] Frontend API exposes `listEvidenceForPoint` and `listEvidenceForSource`.
- [x] Library Point cards render linked Evidence without breaking existing Point actions.
- [x] Explore Source Workspace renders Evidence for the opened Source.
- [x] Evidence with source/chunk context can jump to the correct Source/Chunk.
- [x] Evidence without source/chunk context renders a clear empty-location state.
- [x] Frontend typecheck and boundary check pass.
- [x] Rust evidence/source tests still pass.

## Definition of Done

- `cargo test --manifest-path src-tauri/Cargo.toml evidence` passes.
- `cargo test --manifest-path src-tauri/Cargo.toml source` passes.
- `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- `npm run typecheck` passes from `frontend/`.
- `npm run check:boundaries` passes from `frontend/`.
- `git diff --check` passes.

## Technical Approach

- Reuse DB helpers added in the Evidence data layer.
- Put commands in `src-tauri/src/commands/library.rs` because the existing Library/Source commands live there.
- Add command registrations in `src-tauri/src/lib.rs`.
- Add frontend wrappers in `frontend/src/api/index.ts` and typed contracts in `frontend/src/api/commandMap.ts`.
- Fetch Point Evidence inside Point row UI to keep the change local and avoid global store churn.
- Fetch Source Evidence from Explore when `sourceId` changes.
- Reuse `openSourceById(sourceId, chunkIndex)` for return navigation.

## Out of Scope

- Evidence search UI.
- Evidence detail page.
- Editing or deleting Evidence.
- Digest citations.
- Multi-source synthesis.
- Changing saved Evidence schema.

## Notes

- Previous slice commit: `e3b2142 feat: persist fact checks as evidence`.
- Forward plan: `docs/knowledge-workbench-plan.md` Issue 4.
- Implemented Library display in Point tree views and Kanban cards; Table remains a dense row view without inline Evidence detail.
