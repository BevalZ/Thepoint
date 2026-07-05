# Foliole / Marginalia Research Workspace

## Goal

Upgrade Thepoint from a traceable knowledge workbench into a local-first personal research and review workbench. Materials should be searchable, investigated, cited, related, reviewed, exported as readable Markdown, and reusable as investigation memory without introducing Python services, HTTP APIs, MCP, worker queues, Electron, Capacitor, or FSRS infrastructure.

## Requirements

- Extend Reports with `kind = "investigation"` while keeping Digest and Synthesis reports compatible.
- Add durable Journal entries for investigation memory. Journal may seed future investigations but must not be treated as final factual evidence.
- Extend citation records with source/point/evidence metadata plus optional quote and reason fields. Investigation conclusions must be cited or explicitly marked as inference/uncertain.
- Add durable asset relations across Source, Point, Evidence, Report, Journal, Gallery, and Review assets.
- Add Review Queue records and commands for Source, Point, Evidence, Report, and Journal assets with simple scheduling: again = 1 day, hard = 3 days, good = 7 days, easy = 14 days.
- Add Open Data Mirror configuration and export commands that write readable Markdown snapshots under a user-selected folder.
- Add External Folder Indexing for local files. Text-like files should be indexed into existing Source documents/chunks; binary/deep formats should record metadata only for now.
- Add Investigation workflow commands and UI surfaces that gather selected assets, Journal context, workspace search, evidence search, report search, and related assets before generating cited Markdown.
- Add Library/Explore/Settings UI affordances for Investigations, Journal, Related Assets, Review, Mirror, and Indexed Folders while reusing existing workbench components and typed API boundary.

## Acceptance Criteria

- [ ] SQLite schema includes Journal, Relations, Review Queue, Mirror config, Indexed Folders/Files, and `reports.kind = investigation` compatibility.
- [ ] All new Tauri commands are registered in `src-tauri/src/lib.rs` and exposed through `frontend/src/api`.
- [ ] Investigation reports can be generated, saved as Reports, reopened after restart, and cited back to Source/Point/Evidence.
- [ ] Saving an Investigation creates a Journal entry that can be listed, searched, invalidated, and optionally included in later investigations.
- [ ] Related assets can be rebuilt and discovered using co-citation, same-source, Journal co-occurrence, Gallery-Point links, and Review relations.
- [ ] Review items can be added, listed, completed, snoozed, dismissed, and opened back to their assets.
- [ ] Mirror export writes stable Markdown files plus `index.md` and `manifest.json`.
- [ ] Indexed folders can be added, scanned, listed, and removed without moving or deleting source files.
- [ ] Frontend typecheck, API boundary check, Vitest suite, build, `cargo check`, and `cargo test` pass.

## Definition of Done

- Backend data helpers and command conversions have focused Rust tests.
- Frontend durable helpers have focused Vitest tests.
- Cross-layer command payloads use camelCase frontend fields and typed wrappers.
- No new sidecar runtime, backend worker, HTTP API, or cloud dependency is introduced.
- Docs or Trellis specs are updated for durable patterns learned during implementation.

## Technical Approach

Implement in phases matching the supplied plan:

1. Type and data foundation.
2. Investigation workflow.
3. Journal memory.
4. Related/discover.
5. Review queue.
6. Open Data Mirror.
7. External Folder Indexing.
8. Quality and desktop experience pass.

The first implementation slice should land the durable object model and typed command surface so later UI and workflow work has stable contracts.

## Out of Scope

- Full FSRS algorithm and card memory modeling.
- Python FastAPI sidecar, MCP server, CLI, or background worker queue.
- OCR, multimodal PDF processing, EPUB/DOCX deep parsing, embeddings, or reranking.
- Bidirectional mirror sync. Mirror is export-only.

## Technical Notes

- Follow inline SQLite migration style in `src-tauri/src/db/mod.rs`.
- Commands belong under `src-tauri/src/commands/` and must use `spawn_blocking` for DB/filesystem work.
- Frontend code must call through `frontend/src/api`, never direct Tauri invoke.
- Existing untracked `炼化/` directory was present before this task and is not part of this implementation unless explicitly inspected for reference.
