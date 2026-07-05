# Desktop E2E Readiness Pass

## Goal

Run the next product-readiness step after the Workbench asset work: verify the Tauri desktop runtime can start, capture exact validation evidence, and update the desktop E2E run notes with what was and was not validated in this environment.

## What I Already Know

- The previous task implemented Source asset aggregation, Gallery unified search, Markdown exports, E2E docs, and spec updates.
- The previous task passed all automated checks:
  - `cargo check --manifest-path src-tauri/Cargo.toml`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `cd frontend; npm run typecheck`
  - `cd frontend; npm run check:boundaries`
  - `cd frontend; npm run test:run`
  - `cd frontend; npm run build`
- `docs/knowledge-workbench-e2e-run.md` still marks full manual desktop E2E as pending because interactive desktop validation needs a visible Tauri window and configured providers.
- Browser preview is not sufficient for persistence-heavy validation because API fallbacks bypass Tauri/SQLite.
- The untracked `炼化/` directory is unrelated and must stay out of this task.

## Requirements

- Run a Tauri desktop startup/readiness smoke pass from the repository root.
- Capture exact commands and relevant results.
- Confirm whether the environment allows interactive desktop validation.
- Update `docs/knowledge-workbench-e2e-run.md` with the newest evidence and remaining manual limitations.
- Do not change product code unless the smoke pass reveals a reproducible startup defect.

## Acceptance Criteria

- [x] The Tauri desktop startup command is attempted and its result is recorded.
- [x] Any orphaned dev/runtime process from the smoke pass is cleaned up before finishing.
- [x] `docs/knowledge-workbench-e2e-run.md` includes the newest desktop startup evidence.
- [x] If full manual E2E remains blocked, the doc states the concrete reason and exact remaining manual steps.
- [ ] Git commits include only this task's docs/task artifacts, not `炼化/`.

## Result

- `cargo tauri dev` launched the desktop runtime far enough to create the Vite dev server, `deep-explorer.exe`, and app-owned WebView2 child processes.
- Port `5173` was listening and had established WebView connections during the smoke pass.
- Cleanup removed the launched `cargo`, `cargo-tauri`, Vite `node`, `deep-explorer.exe`, and app-owned WebView2 processes.
- Full interactive manual E2E remains pending because provider-backed workflows need credentials plus a human/operator driving the visible desktop UI.

## Definition Of Done

- Desktop startup/readiness evidence collected.
- E2E run doc updated.
- Task artifacts committed, archived, and journaled if the task produces changes.

## Out Of Scope

- Designing or implementing a new feature.
- Running live model/fact-check/image provider workflows without configured credentials.
- Adding automated desktop UI control tooling.
- Including or modifying `炼化/`.

## Technical Approach

1. Check Tauri CLI availability.
2. Start `cargo tauri dev` in a controlled process, capture logs for a bounded window, then stop the process tree.
3. Classify the result:
   - Startup pass: app compiles/launches far enough to report a running dev desktop runtime.
   - Startup fail: record exact build/runtime error.
   - Interactive manual blocked: visible UI/provider-driven workflows still require human/operator validation.
4. Update the E2E run doc with the evidence.

## Technical Notes

- Primary doc: `docs/knowledge-workbench-e2e-run.md`
- Checklist: `docs/knowledge-workbench-e2e-checklist.md`
- Command likely to use: `cargo tauri dev`
