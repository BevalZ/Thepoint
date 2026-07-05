# Multi-Source Synthesis MVP

## Goal

Upgrade the workflow from single-source exploration to bounded multi-source synthesis, with explicit conflict handling and source-backed citations.

## Requirements

- Add a Tauri command for generating a multi-source synthesis report.
- The command must accept manually selected Source IDs and a boolean for including the current Star collection.
- The command must use selected Source chunks, Evidence linked to selected Sources, and optionally starred Points as input.
- The generated report must request these sections: common themes, aligned claims, conflicting claims, evidence strength, unresolved questions, next steps, and citation list.
- The generated report must use stable labels: `[S1]`, `[S2]`, `[P1]`, `[E1]`.
- The command must return `DigestResult`-compatible `{ content, citations }` metadata.
- Library search Source results must support add/remove to a synthesis input collection.
- Library must show a compact synthesis panel with selected Source count, optional Star inclusion, generate, clear, and error states.
- Synthesis output must render in the existing citation-aware Digest modal and allow source/chunk return.

## Acceptance Criteria

- [x] `generate_synthesis` Tauri command is registered.
- [x] Frontend API exposes `generateSynthesis`.
- [x] Library Source search results can be added/removed from synthesis input.
- [x] Synthesis panel can generate from 1+ selected Sources.
- [x] Synthesis panel can include the current Star collection.
- [x] Backend prompt includes Source, Evidence, and optionally Point inputs with stable labels.
- [x] Backend result includes structured `source`/`point`/`evidence` citations.
- [x] Synthesis modal renders citation metadata and opens source/chunk when available.
- [x] Frontend typecheck and boundary check pass.
- [x] Rust synthesis/digest/source/evidence checks pass.

## Definition of Done

- `cargo test --manifest-path src-tauri/Cargo.toml synthesis` passes.
- `cargo test --manifest-path src-tauri/Cargo.toml digest` passes.
- `cargo test --manifest-path src-tauri/Cargo.toml evidence` passes.
- `cargo test --manifest-path src-tauri/Cargo.toml source` passes.
- `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- `npm run typecheck` passes from `frontend/`.
- `npm run check:boundaries` passes from `frontend/`.
- `git diff --check` passes.

## Technical Approach

- Implement `generate_synthesis` in `src-tauri/src/commands/digest.rs` to reuse the OpenAI config and `DigestResult` citation shape.
- Reuse DB helpers: `get_source_workspace`, `list_evidence_for_source`, `list_starred_points`, and `get_point_source_context`.
- Keep selected synthesis Sources frontend-only in a small Zustand store.
- Add source selection controls to the existing Library search Source section.
- Reuse `DigestModal` with a synthesis title/source name rather than creating a new report modal.

## Decision (ADR-lite)

**Context**: Multi-source synthesis needs bounded inputs and citations, but a persisted report table would slow the current roadmap.

**Decision**: Use selected Source IDs plus optional Star collection as an explicit bounded input. Return a `DigestResult` with `source`/`point`/`evidence` citations and reuse the citation-aware modal.

**Consequences**: The MVP is usable without new tables. Later work can persist synthesis reports using the same `content/citations/input` shape.

## Out of Scope

- Persisted `synthesis_reports` table.
- Automatic full-library scan.
- Semantic search or ranking.
- Conflict detection outside the LLM prompt.
- Star/source collection management beyond this session.

## Technical Notes

- Product plan source: `docs/knowledge-workbench-plan.md` Issue 6.
- `DigestCitation.kind` must include `source` for synthesis.
- Existing `DigestModal` already knows how to render and jump from structured citations.
