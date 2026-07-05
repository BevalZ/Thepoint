# Workbench E2E checklist update

## Goal

Update the Knowledge Workbench manual E2E checklist so the now-complete Source -> Point -> Evidence -> Digest/Synthesis -> Report flow includes the latest Reports management behavior and a clear manual validation path.

## What I already know

* The latest committed work added Library -> Reports kind filtering and report deletion.
* `docs/knowledge-workbench-e2e-checklist.md` already covers save/reopen Report flows but does not explicitly cover report kind filtering or deletion.
* `src-tauri/tauri.conf.json` defines `devUrl` as `http://localhost:5173` and `beforeDevCommand` as `npm run dev` in `frontend/`.
* The repo has no root `package.json`; desktop manual E2E should be started with `cargo tauri dev` from the repo root.
* Browser preview cannot validate persistence-heavy flows because the frontend API has browser fallbacks when the Tauri runtime is unavailable.

## Requirements

* Update the E2E checklist to mention Reports in the release scope.
* Add explicit manual steps for filtering Reports by Digest/Synthesis.
* Add explicit manual steps for deleting a Report and verifying linked Sources, Points, and Evidence are unaffected.
* Add a short manual run section that tells the tester to use `cargo tauri dev` rather than browser-only preview for persistence workflows.
* Preserve the checklist as a concise executable checklist, not a broad roadmap.

## Acceptance Criteria

* [ ] `docs/knowledge-workbench-e2e-checklist.md` includes Reports management coverage.
* [ ] Checklist states that Tauri runtime is required for manual persistence validation.
* [ ] Automated regression command block remains accurate.
* [ ] No product code changes are made in this task.
* [ ] `git diff --check` passes.

## Definition of Done

* Documentation updated and committed.
* Trellis task archived and session recorded.

## Technical Approach

Patch only `docs/knowledge-workbench-e2e-checklist.md`. Add the new steps near the existing Digest/Synthesis Report flow so the tester validates Reports immediately after creating them.

## Out of Scope

* Adding Playwright or Tauri UI automation.
* Changing Report UI behavior.
* Adding new app commands or frontend code.
* Running a full live model-backed manual E2E without configured API credentials and desktop interaction.

## Technical Notes

* Desktop command: `cargo tauri dev`
* Frontend command used by Tauri: `npm run dev` in `frontend/`
* Relevant docs inspected:
  * `docs/knowledge-workbench-e2e-checklist.md`
  * `docs/knowledge-workbench-plan.md`
  * `README.md`
  * `docs/dev-setup.md`
  * `src-tauri/tauri.conf.json`
