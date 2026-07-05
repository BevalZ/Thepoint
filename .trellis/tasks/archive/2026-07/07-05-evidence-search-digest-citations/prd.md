# Evidence Search And Digest Citations

## Goal

Make saved Evidence discoverable and usable as a first-class Digest input, while preserving structured citation metadata for Point and Evidence references.

## Requirements

- Add Tauri commands for `search_evidence` and `get_evidence`.
- Add frontend API wrappers and commandMap entries for Evidence search/detail commands.
- Library search must show Evidence results in a separate section, not merge Evidence into Point results.
- Evidence search results must display verdict, claim, answer, checked time, source links, and source/chunk return state.
- Users can add/remove Evidence search results to the current Digest input collection.
- StarRing Digest generation must include both starred Points and selected Evidence records.
- Digest output must ask the model to cite inputs with stable labels: `[P1]`, `[P2]`, `[E1]`, `[E2]`.
- Digest command must return structured citation metadata for every Point/Evidence input label.
- Digest modal must display the structured citation list and allow source/chunk return when citation metadata has a source location.
- Saving a Digest to the knowledge library must preserve the structured citation list in the saved source excerpt.

## Acceptance Criteria

- [x] `search_evidence` Tauri command is registered and returns hydrated Evidence records.
- [x] `get_evidence` Tauri command is registered and returns one hydrated Evidence record or `null`.
- [x] Frontend API exposes `searchEvidence` and `getEvidence`.
- [x] Library search renders Evidence separately from Source and Point results.
- [x] Evidence search results can be added/removed from Digest input.
- [x] StarRing count/generate behavior includes selected Evidence as well as starred Points.
- [x] `generate_digest` accepts selected Evidence IDs and includes them in the prompt.
- [x] `generate_digest` returns `DigestResult` with `content` and structured `citations`.
- [x] Digest modal renders Point/Evidence citation metadata and opens source/chunk when available.
- [x] Frontend typecheck and boundary check pass.
- [x] Rust evidence/source/digest checks pass.

## Definition of Done

- `cargo test --manifest-path src-tauri/Cargo.toml evidence` passes.
- `cargo test --manifest-path src-tauri/Cargo.toml digest` passes.
- `cargo test --manifest-path src-tauri/Cargo.toml source` passes.
- `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- `npm run typecheck` passes from `frontend/`.
- `npm run check:boundaries` passes from `frontend/`.
- `git diff --check` passes.

## Technical Approach

- Reuse existing DB helpers: `search_evidence`, `get_evidence`, `list_starred_points`, and `get_point_source_context`.
- Put new Evidence read commands in `src-tauri/src/commands/library.rs`.
- Change `generate_digest` to accept `{ evidenceIds: string[] }` and return a typed `DigestResult`.
- Keep selected Evidence frontend-only in a small Zustand store; Evidence records are already durable in SQLite.
- Use the existing Library search box and add a separate Evidence section to avoid mixing object types.
- Reuse `EvidenceList` for Evidence rendering and source/chunk return behavior.
- Extend `DigestModal` with a compact citation panel rather than adding a new Digest detail page.

## Decision (ADR-lite)

**Context**: Evidence must become reusable in Digest without turning Library search into a mixed, hard-to-scan global search.

**Decision**: Use an explicit Evidence section in existing Library search and a frontend Digest Evidence selection store. Digest generation receives Evidence IDs, resolves them backend-side, and returns stable citation metadata.

**Consequences**: The MVP avoids new persistence for Digest drafts and avoids introducing a new Evidence page. A later slice can add persisted Digest reports or richer Evidence management without changing the command contract shape.

## Out of Scope

- Evidence editing or deletion.
- Semantic search or ranking changes.
- CSL/BibTeX citation formats.
- Persisted Digest report table.
- Automatic parsing/validation that every generated paragraph includes a citation.
- Mixing Evidence into every Point list or table row.

## Technical Notes

- Product plan source: `docs/knowledge-workbench-plan.md` Issue 5.
- Current Evidence DB helper already has focused tests for search hydration.
- Existing Digest flow lives in `src-tauri/src/commands/digest.rs`, `frontend/src/components/StarRing.tsx`, and `frontend/src/components/DigestModal.tsx`.
- Current Library search already separates Source and Point results; Evidence should follow that pattern as a third section.
