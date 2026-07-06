# Open Data Mirror v2 Plan/Manifest/Prune

## Goal

Upgrade Open Data Mirror from a one-shot Markdown dump into a repeatable, diagnosable local snapshot. The mirror should show what will change before export, persist per-asset manifest details after export, keep old manifest compatibility, and prune stale mirror files only when the user explicitly asks.

## What I Already Know

* Prior `炼化/` analysis recommends Mirror v2 as the next high-value slice after AI invocation audit and persisted report citations.
* Current backend has `open_data_mirror_config` plus `export_open_data_mirror`.
* Current export writes Markdown files, `index.md`, and a counts-only `manifest.json` with `version: 1`.
* Current frontend Settings page can save mirror config and run immediate export, but cannot preview writes/skips/stale files or prune stale files.
* Dirty `src-tauri/src/commands/gallery.rs` and untracked `炼化/` are unrelated and must not be staged.

## Requirements

* Add a backend command to build an Open Data Mirror plan without writing files.
* The plan must classify enabled export assets as write candidates, unchanged assets, stale/overwrite candidates, and stale mirror files eligible for prune.
* Add manifest v2 with per-asset kind/id/title/path/content hash/export timestamp plus errors and pruned entries.
* Export must use the same planner as preview so Settings results match real writes.
* Add a backend command to load existing manifest data and support old v1 count-only manifests gracefully.
* Add a backend command to prune stale files only from explicit plan output, never as part of export.
* Expose all new commands through typed frontend API wrappers.
* Settings Data tab must show plan summary, manifest summary, export result, and an explicit prune action.

## Acceptance Criteria

* [ ] Building a plan twice with no content changes reports enabled assets as unchanged.
* [ ] Changing an asset produces a stale/overwrite plan item for that asset only.
* [ ] Removing/disabling a previously mirrored asset produces prune candidates, but export does not delete them.
* [ ] Running prune deletes only stale mirror files represented by manifest asset paths and records the prune result.
* [ ] Manifest v1 can still be loaded without throwing and exposes count summary where possible.
* [ ] Settings UI uses typed API wrappers only; no direct Tauri `invoke` calls.
* [ ] Rust and frontend tests/type checks pass.

## Definition of Done

* Tests added/updated for planner, manifest compatibility, export, and prune behavior.
* `cargo check`, `cargo test`, frontend typecheck, boundary check, test run, and build pass.
* Cross-layer contract changes are reflected in `.trellis/spec/` if useful for future work.
* Task code changes are committed separately from archive/journal bookkeeping.

## Technical Approach

Implement the mirror planner in `src-tauri/src/commands/library.rs` near the existing export logic. Reuse the existing DB list helpers and Markdown builders, produce deterministic relative paths using the existing `safe_file_stem`, hash generated Markdown content before writing, and read `manifest.json` to classify previous assets.

Expose DTOs from Rust using camelCase serde and mirror them in `frontend/src/api/types.ts`, command map, wrappers, and the Settings page. Keep the existing `export_open_data_mirror` command name but return an enriched result compatible with existing fields.

## Decision (ADR-lite)

**Context**: Mirror export needs to become reliable without adding backup/sync infrastructure.

**Decision**: Use plan-first local filesystem logic and versioned manifest JSON. Export writes current assets and manifest v2. Prune is separate and deletes only manifest-known stale files under the configured mirror root.

**Consequences**: The user gets predictable preview/export/prune behavior now. Attachment rewriting, background jobs, restore, and full backup catalogs remain out of scope and can build on manifest v2 later.

## Out of Scope

* Attachment or gallery binary export/link rewriting.
* Backup/restore workflows.
* Background job progress/cancel for long exports.
* Cloud sync, LAN sync, plugin/MCP, or sidecar services.
* Arbitrary filesystem cleanup outside manifest-known mirror paths.

## Technical Notes

* Relevant backend files: `src-tauri/src/commands/library.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/db/mod.rs`.
* Relevant frontend files: `frontend/src/api/types.ts`, `frontend/src/api/commandMap.ts`, `frontend/src/api/index.ts`, `frontend/src/pages/Settings.tsx`.
* Existing exported asset groups: sources, evidence, reports, investigations, journal, gallery index.
* Exported paths must remain relative and pass root containment checks before deletion.
* Research reference: `research/open-data-mirror-v2-local-research.md`.
