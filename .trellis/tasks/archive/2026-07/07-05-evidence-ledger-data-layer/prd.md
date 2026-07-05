# Evidence Ledger Data Layer

## Goal

Implement the backend data foundation for Evidence Ledger so fact-check results can later be saved, listed, searched, cited, and linked back to Point / Source / Chunk context.

## Requirements

- Add durable SQLite storage for structured evidence records and evidence source links.
- Add Rust data types for evidence records, evidence sources, and save inputs.
- Add DB functions to save evidence, list evidence for a point, list evidence for a source, get evidence by id, and search evidence.
- Preserve optional links to `points`, `source_documents`, and `source_chunks` via `point_id`, `source_id`, and `chunk_index`.
- Use constrained string fields for first-version `verdict` and `stance` values, but keep validation simple and local to DB helper boundaries.
- Deleting a Point must not delete evidence records; it should detach `point_id` from related evidence so evidence remains auditable.
- Do not change the existing `fact_check_claim` command in this slice.
- Do not add frontend UI, Tauri commands, or Digest integration in this slice.

## Acceptance Criteria

- [x] Schema contains `evidence_records` and `evidence_sources`.
- [x] Saving evidence persists record fields plus source rows in one transaction.
- [x] Evidence can be listed by `point_id`.
- [x] Evidence can be listed by `source_id`.
- [x] Evidence can be fetched by id with its sources.
- [x] Evidence can be searched by claim, answer, reasoning, context, and evidence source fields.
- [x] Point deletion detaches evidence from deleted points instead of deleting evidence.
- [x] Focused DB tests cover save/read/list/search/detach behavior.
- [x] Existing source-workspace DB tests still pass.

## Definition of Done

- [x] `cargo test --manifest-path src-tauri/Cargo.toml evidence` passes.
- [x] `cargo test --manifest-path src-tauri/Cargo.toml source` passes.
- [x] `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- [x] `git diff --check` passes.

## Technical Approach

- Follow the existing `src-tauri/src/db/mod.rs` inline schema initialization and focused test style.
- Store evidence independently from points so audit history survives point deletion.
- Keep `verdict` values to `supported`, `contradicted`, `mixed`, and `uncertain`.
- Keep `stance` values to `support`, `contradict`, `context`, and `unknown`.
- Return hydrated evidence records with their source rows from read/list/search helpers.

## Decision (ADR-lite)

**Context**: Evidence Ledger needs a durable structure before UI and command layers can reliably save fact-check results.

**Decision**: Implement only the DB layer first. Evidence records are durable audit objects, not child points. Point links are optional and detachable.

**Consequences**: UI work can follow with a stable backend contract. This slice will not yet expose the feature to users, but it reduces risk before cross-layer wiring.

## Out of Scope

- Tauri command registration.
- Frontend API types and UI.
- Fact-check prompt changes.
- Evidence-to-Digest citation wiring.
- Multi-source synthesis.
- Semantic search / embeddings.

## Technical Notes

- Forward plan: `docs/knowledge-workbench-plan.md`.
- Source baseline: `docs/foliole-functional-roadmap.md`.
- Main implementation target: `src-tauri/src/db/mod.rs`.
- Current DB tests already cover `source_documents`, `source_chunks`, `point_source_links`, and `search_workspace`.
