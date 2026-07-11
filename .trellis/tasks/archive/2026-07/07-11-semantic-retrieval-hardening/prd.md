# Semantic Retrieval Release Hardening

## Goal

Turn the newly implemented semantic retrieval and grounded Research Q&A workflow into a release-ready slice by closing the remaining automated-verification and lifecycle gaps before requiring user credentials or subjective product decisions.

## Requirements

* Add a deterministic bilingual retrieval evaluation fixture with Hit@5 assertions and stable RRF ordering.
* Add provider-response parsing tests for remote embeddings without live network credentials.
* Prevent concurrent semantic-index rebuilds and make cancellation/status transitions deterministic.
* Verify empty, partial-failure, stale-hash, retry, and source-scoped index lifecycle behavior against SQLite.
* Harden database backup/restore replacement behavior and validate backups before live data changes.
* Add an executable desktop/manual acceptance checklist for model download, offline retry, citation jump, report save, and restart recovery.
* Preserve browser-preview behavior and command-registry parity.

## Acceptance Criteria

* [ ] Bilingual fixture measures Hit@5 and verifies hybrid retrieval does not regress below its keyword baseline.
* [ ] Remote embedding JSON validation covers ordering, count mismatch, empty vectors, and dimension mismatch.
* [ ] A second rebuild request fails clearly while one rebuild is active; cancellation reaches a terminal state.
* [ ] SQLite lifecycle tests cover pending → ready, content change → stale, failure → retry, and model isolation.
* [ ] Restore validates a candidate DB and leaves the live DB recoverable if replacement fails.
* [ ] Manual checklist clearly separates tests requiring model download, offline mode, and configured chat credentials.
* [ ] Rust tests, frontend tests, typecheck, boundary check, command parity, and production build pass.

## Definition of Done

* Automated tests cover deterministic behavior without downloading a model or requiring API credentials.
* Manual desktop steps are documented for the remaining environment-dependent verification.
* No changes are made to existing dirty `digest.rs`, `gallery.rs`, `library.rs`, or `炼化/` work.
* Task changes are committed, archived, and journaled after user confirmation.

## Technical Approach

Keep production ownership inside `src-tauri/src/semantic/`. Extract pure parsing/evaluation/state-transition helpers where deterministic tests need them. Use SQLite in-memory fixtures for storage lifecycle tests. Use an atomic rebuild guard independent of the cancellation flag. Keep live model download and chat-model calls out of automated CI.

## Decision (ADR-lite)

**Context**: The feature compiles and passes broad regression tests, but its highest-risk lifecycle paths still depend on manual environments.

**Decision**: Harden deterministic contracts first, then stop only when a real desktop model download or configured chat API is required.

**Consequences**: CI remains credential-free and reproducible. A final environment-dependent manual pass remains necessary before release.

## Out of Scope

* Changing embedding model choice or retrieval UX.
* ANN/vector database adoption.
* Supplying or storing user credentials on the user's behalf.
* Editing unrelated dirty worktree files.

## Technical Notes

* Baseline after feature implementation: 113 Rust tests, 30 frontend tests, 141 aligned commands.
* Relevant specs: backend database/error/quality guidelines and frontend type/boundary/quality guidelines.
