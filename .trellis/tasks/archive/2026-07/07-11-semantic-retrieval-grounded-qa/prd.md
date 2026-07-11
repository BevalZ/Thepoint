# Semantic Retrieval and Grounded Q&A

## Goal

Add a local-first semantic retrieval and citation-grounded research Q&A workflow. The feature must deepen the existing Source/Chunk/Evidence/Report model rather than introduce a generic chat window or a separate server.

## Requirements

* Add a deep Rust semantic module that owns embedding providers, model lifecycle, vector encoding, indexing, hybrid retrieval, and progress state.
* Default to `fastembed` 5.17.x with `EmbeddingModel::MultilingualE5Small`; download model artifacts on first enable and cache them under app data.
* Support an optional OpenAI-compatible `/v1/embeddings` adapter using typed settings.
* Persist chunk embeddings with model key, source text hash, dimension, vector bytes, status, error, and timestamp.
* Index `source_chunks` only in v1; existing keyword search continues to cover Point, Evidence, Report, Journal, Gallery, and indexed-file metadata.
* Detect pending/stale chunks from missing rows or text-hash changes; interrupted rebuilds resume safely.
* Fuse keyword and semantic ranks with Reciprocal Rank Fusion (`k=60`), preserving Source/Chunk locators and explaining why each result matched.
* Add a lazy-loaded Research Q&A page with query, optional Source scope, hybrid results, context selection, generated answer, warnings, and clickable citations.
* Grounded answers may use only selected retrieval context. Evidence-insufficient queries return an explicit refusal without an LLM call.
* Reuse `DigestCitation`, citation navigation, investigation report persistence, and invocation-audit contracts.
* Add an OS credential-store adapter for API keys and migrate existing plaintext Store values only after a successful credential write.
* Add local database backup, restore validation, and integrity-check commands before applying new schema migrations.
* Add a CI quality job that runs Rust tests plus frontend typecheck, boundary check, tests, and build before installer jobs.
* Add command-registry parity tests so Rust registration, TypeScript command map, and wrapper command names remain identical.
* Update foundational product/architecture/API/database documentation to match the implemented Source-centric system.

## Acceptance Criteria

* [ ] Local model status is visible; first-use download has progress, cancellation, retry, checksum/error handling, and offline states.
* [ ] Rebuilding the semantic index reports total/ready/stale/failed counts and resumes after interruption.
* [ ] New or changed Source chunks become pending/stale without deleting existing knowledge assets.
* [ ] Hybrid search returns stable RRF ordering with keyword and semantic rank metadata.
* [ ] Research Q&A works with an optional Source scope and exposes the retrieved context before/with the answer.
* [ ] Every answer citation resolves to Source/Chunk, Point, or Evidence; invalid citations are rejected or warned.
* [ ] Insufficient evidence produces a refusal and does not call the chat model.
* [ ] Answers can be saved as Investigation reports and retain invocation/context audit data.
* [ ] Existing plaintext API keys migrate to the OS credential store and are removed from ordinary config only after success.
* [ ] Database backup/restore integrity checks protect local data around migrations.
* [ ] Browser preview renders valid disabled/empty states without Tauri or a downloaded model.
* [ ] Existing and new Rust/frontend tests, boundary check, typecheck, production build, and CI quality job pass.

## Definition of Done

* Focused tests cover vector serialization, hash invalidation, RRF, provider adapters, DB migrations, citation validation, and refusal behavior.
* A deterministic bilingual retrieval fixture measures Hit@5 and preserves or improves the keyword baseline.
* Manual desktop flow passes: configure/download → index → hybrid search → answer → citation jump → save Investigation → restart/recover.
* No page imports raw Tauri `invoke`; all commands use the typed frontend API boundary.
* New semantic and secret-storage contracts are captured in `.trellis/spec/`.
* Task changes are committed without the unrelated `digest.rs`, `gallery.rs`, or `炼化/` work.

## Technical Approach

Create `src-tauri/src/semantic/` as the deep module. SQLite remains the durable source of truth; the semantic module may cache current-model vectors in memory for exact cosine search. Personal-library v1 targets up to 50,000 chunks and does not add sqlite-vec, HNSW, Python, HTTP servers, or cloud infrastructure.

Add `semantic_index_meta` and `chunk_embeddings`. Vectors are little-endian `f32` blobs. A model change leaves old rows intact but ignores them until cleanup. Local E5 inputs use `query:` and `passage:` prefixes. Remote embeddings implement the same adapter interface.

Keyword top-60 and semantic top-60 results are fused with RRF and reduced to a typed `HybridSearchHit` stream. Grounded Q&A consumes selected hits, validates citations through existing locator/audit logic, and saves via the Investigation report path.

The Research page is a new top-level navigation surface rather than another Library mode. Settings gains semantic model/index controls and data-safety controls without adding more provider state directly to the page.

## Decision (ADR-lite)

**Context**: The app already has unified keyword search, retrieval profiles, Source chunks, structured citations, and Investigation reports. The missing capability is semantic recall and a researcher-facing grounded workflow.

**Decision**: Use a local-first, adapter-based semantic module with a pinned multilingual E5-small model, exact in-memory cosine search over SQLite-backed vectors, RRF fusion, and a dedicated Research Q&A page. Remote embeddings are optional.

**Consequences**: The installer remains small but first enable requires a model download. Exact search is intentionally bounded to a personal corpus; larger-scale ANN indexing is deferred. This feature creates a model module pattern without mechanically splitting existing monoliths.

## Out of Scope

* Generic multi-turn chat or autonomous agents.
* Embedding Point, Evidence, Report, Journal, or Gallery bodies in v1.
* Cloud accounts, collaboration, hosted vector databases, or background services.
* sqlite-vec/HNSW before the 50,000-chunk performance threshold is exceeded.
* OCR, academic DOI/Zotero integration, research-project management, and source-version diff.
* Refactoring all of `db/mod.rs`, `library.rs`, Explore, Library, or Settings in this task.

## Research References

* [`research/embedding-dependencies.md`](research/embedding-dependencies.md) — current crate versions, supported model, TLS/runtime, and keyring constraints.

## Technical Notes

* Preserve pre-existing dirty changes in `src-tauri/src/commands/digest.rs`, `src-tauri/src/commands/gallery.rs`, and `炼化/`.
* Existing command surface: 130 Rust registrations, 130 TypeScript map entries, and 130 wrappers currently match.
* Current quality baseline: 102 Rust tests and 28 frontend tests pass.
* Key code seams: `source_chunks`, `search_assets`, `build_retrieval_context`, `DigestCitation`, report audit, App navigation, Settings config.

