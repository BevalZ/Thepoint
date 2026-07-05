# Workbench Readiness And Asset Features

## Goal

Complete the next four product-readiness steps before starting another feature wave:

1. Run and document the desktop E2E readiness pass for the current knowledge workbench.
2. Add a Source asset panel MVP that gathers assets linked to a Source.
3. Add unified asset search across the durable knowledge asset types.
4. Add Markdown/local export for reusable assets.

The product goal is to make the current Source/Evidence/Digest/Synthesis/Report foundation feel complete enough that the next feature design can build on verified behavior rather than unknown gaps.

## What I Already Know

- The repository is a Tauri 2 + React/Vite desktop app with Rust backend commands and SQLite persistence.
- Source Workspace, Evidence Ledger, Digest citations, Multi-Source Synthesis, and saved Reports are already implemented according to `docs/knowledge-workbench-plan.md`.
- `docs/knowledge-workbench-e2e-run.md` says automated regression checks passed, but full manual desktop E2E is still pending.
- Existing specs require frontend code to call Tauri through `frontend/src/api/` wrappers, not direct `invoke`.
- Existing specs require backend command changes to update Rust command registration plus frontend `commandMap`.
- There is an untracked local directory `炼化/`; it is outside this task unless the developer explicitly asks to include it.

## Assumptions

- The Source asset panel should be an MVP inside the existing Explore/Source Workspace flow, not a new standalone page.
- Unified asset search should start with SQLite-backed lexical search and type grouping, not embeddings.
- Markdown/local export should use existing desktop file-save patterns and generate portable Markdown files.
- If a full interactive desktop E2E cannot be completed in this environment, the task must still run all automated checks and update the E2E run document with exact evidence and remaining manual steps.

## Requirements

- Add or update desktop E2E documentation after validation.
- Add a Source asset panel that displays assets connected to the current Source:
  - linked Points
  - linked Evidence
  - linked Reports or citations when available
  - linked Gallery images when available or a clear empty state if no source linkage exists yet
- Add unified asset search with type-separated results for existing durable assets:
  - Source
  - Point
  - Evidence
  - Report
  - Gallery image if data supports lexical search
- Add Markdown/local export for useful assets:
  - Report export preserving body and citation appendix
  - Evidence export preserving claim, verdict, answer, sources, and source/chunk context
  - Source asset export summarizing source metadata plus linked assets
- Keep UI additions consistent with the existing Library/Explore surfaces.
- Keep command/API boundaries typed through `frontend/src/api`.
- Preserve local-first behavior; exports write to user-selected local files only.

## Acceptance Criteria

- [ ] Desktop E2E status is updated in `docs/knowledge-workbench-e2e-run.md` with exact commands/results and any manual limitations.
- [ ] Current Source Workspace shows a usable asset panel with empty/loading/error states.
- [ ] Unified asset search returns grouped results and opens/navigates to the correct asset/source context where supported.
- [ ] Reports can be exported as Markdown with citation appendix.
- [ ] Evidence can be exported as Markdown with sources and source/chunk context.
- [ ] A Source asset bundle can be exported as Markdown.
- [ ] Backend tests cover any new DB/helper behavior.
- [ ] Frontend helper/component tests cover filtering/export/search helper behavior where practical.
- [ ] Required checks pass:
  - `cargo check --manifest-path src-tauri/Cargo.toml`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `cd frontend; npm run typecheck`
  - `cd frontend; npm run check:boundaries`
  - `cd frontend; npm run test:run`
  - `cd frontend; npm run build`

## Definition Of Done

- Code implemented and committed in logical commits.
- Specs updated if new durable contracts or conventions are introduced.
- E2E/run docs updated with current evidence.
- Task archived and journal recorded after work commits.

## Out Of Scope

- Cloud sync, accounts, team collaboration, or remote storage.
- Embedding/vector semantic search.
- Character-level claim highlighting.
- New plugin or marketplace architecture.
- Complex trust scoring for Evidence.
- Rewriting Explore or Library page architecture.
- Including the untracked `炼化/` directory.

## Technical Approach

### Decision: Source Asset Panel Placement

Put the MVP panel in the existing Explore Source Workspace, directly below `SourceHeader`. This keeps the panel tied to the currently opened Source and avoids creating a new page or changing Library navigation. Library remains the cross-asset search/browse surface.

### Decision: Backend Aggregation

Add a backend `get_source_assets(source_id)` command in `commands/library.rs` backed by DB helpers in `db/mod.rs`. The command should return one typed payload with:

- Source summary
- linked Points
- Evidence for the Source
- Reports whose citation JSON references the Source
- Gallery items whose `point_ids` link back to the Source through `point_source_links`

This keeps frontend loading simple and preserves the typed API boundary.

### Decision: Unified Search Extension

Keep the current Library default search composition for Source/Point/Evidence/Report and extend it with Gallery search. Evidence-only and Reports-only modes remain scoped to their asset type.

### Decision: Markdown Export

Use frontend `src/lib` artifact helpers for Markdown generation and browser-compatible download helpers, following existing `DigestModal` and `ReportModal` behavior. No new filesystem command is required for the MVP.

### Data Flow

```text
SQLite
  -> db::get_source_assets / db::search_gallery
  -> Tauri commands in library.rs / gallery.rs
  -> frontend/src/api typed wrappers
  -> Explore SourceAssetPanel / Library unified search
  -> frontend/src/lib markdown helpers
```

## Open Questions

- None blocking. Any Gallery record without source-linked `point_ids` should simply not appear in Source assets.

## Technical Notes

- Relevant docs:
  - `docs/knowledge-workbench-plan.md`
  - `docs/knowledge-workbench-e2e-checklist.md`
  - `docs/knowledge-workbench-e2e-run.md`
  - `docs/foliole-functional-roadmap.md`
- Relevant specs:
  - `.trellis/spec/frontend/index.md`
  - `.trellis/spec/backend/index.md`
  - `.trellis/spec/guides/index.md`
- Likely source areas:
  - `frontend/src/pages/Explore.tsx`
  - `frontend/src/pages/Library.tsx`
  - `frontend/src/components/EvidenceList.tsx`
  - `frontend/src/components/ReportModal.tsx`
  - `frontend/src/components/DigestModal.tsx`
  - `frontend/src/api/*`
  - `src-tauri/src/db/mod.rs`
  - `src-tauri/src/commands/library.rs`
  - `src-tauri/src/commands/gallery.rs`
  - `src-tauri/src/lib.rs`
