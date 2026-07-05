# Knowledge Workbench Execution Slice 1

## Goal

Turn the knowledge-workbench plan into the first executable slice by auditing the already-implemented Source Workspace baseline, updating roadmap documentation to match reality, and cleaning the existing `src-tauri/Cargo.toml` line-ending dirty state.

## Requirements

- Mark which parts of `docs/foliole-functional-roadmap.md` are already implemented in the current codebase.
- Keep this slice scoped to documentation and repository hygiene unless the audit uncovers a small, blocking inconsistency.
- Preserve `docs/knowledge-workbench-plan.md` as the forward plan for Evidence Ledger and Multi-Source Synthesis.
- Fix the `src-tauri/Cargo.toml` dirty state without changing dependency content.
- Do not implement Evidence Ledger data tables in this slice.
- Do not refactor frontend or backend source files in this slice unless required to make the audit truthful.

## Acceptance Criteria

- [x] `docs/foliole-functional-roadmap.md` clearly identifies completed Source Workspace slices and the remaining work.
- [x] `docs/knowledge-workbench-plan.md` remains consistent with the updated roadmap.
- [x] `src-tauri/Cargo.toml` no longer appears as modified when there is no content change.
- [x] `git diff` shows only intentional documentation and task metadata changes.
- [x] Documentation links from `README.md` include the knowledge workbench plan.

## Definition of Done

- Run `git status --porcelain` and verify dirty state is understood.
- Run targeted docs inspection via `git diff`.
- No source build is required unless source files are changed.
- Record any next implementation slice explicitly.

## Technical Approach

- Use the current codebase as the source of truth for implemented source-workspace behavior.
- Update only planning docs, task files, and line-ending hygiene.
- Resolve the Cargo dirty state by restoring the index version with stable line endings, not by changing Cargo dependencies.

## Out of Scope

- Evidence Ledger schema and commands.
- Multi-source synthesis implementation.
- UI changes.
- Database migration changes.
- Search behavior changes.

## Technical Notes

- Existing source baseline includes `source_documents`, `source_chunks`, `point_source_links`, source workspace commands, recent source listing, and source/point workspace search.
- Existing fact check model is still transient: `FactCheckResult` is returned by command calls and can be saved as a regular fact-check Point, but not as structured Evidence.
- Prior dirty state included `src-tauri/Cargo.toml` with no content diff, likely caused by LF/CRLF normalization.
