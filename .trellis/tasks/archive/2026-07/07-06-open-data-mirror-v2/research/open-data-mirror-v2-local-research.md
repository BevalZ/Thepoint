# Open Data Mirror v2 Local Research

## Comparable Patterns From `炼化/`

* Foliole-like export flows emphasize a build-plan step before writing, then a manifest that records path/hash/error per asset.
* Zotero-like asset management separates stable item identity from export path so renamed titles do not silently orphan old files without diagnostics.
* Joplin-like local export/sync flows avoid implicit destructive cleanup; stale local files are reported first and removed only through an explicit operation.

## Current Thepoint Constraints

* The app is local-first Tauri with Rust commands and SQLite helpers, not an HTTP sidecar.
* File export already lives in `src-tauri/src/commands/library.rs`.
* Frontend command calls must go through `frontend/src/api`.
* The existing v1 `manifest.json` contains only counts, so v1 loading can show summary but cannot produce precise prune candidates.
* `safe_file_stem(id, title)` already provides deterministic file naming and should be reused.

## Feasible Approaches

### Approach A: Plan-First Manifest v2 (Recommended)

Build all generated Markdown assets in memory, hash content, compare with manifest v2 entries and existing file hashes, then classify plan items. Export reuses this plan and writes current assets plus manifest v2. Prune deletes only manifest-listed stale paths.

Pros:
* Keeps implementation local and testable.
* Aligns preview and export semantics.
* Avoids destructive cleanup during normal export.

Cons:
* Large libraries build generated content in memory for planning.
* Does not solve attachment export yet.

### Approach B: Export-Only Manifest v2

Keep export simple, write manifest v2, and add prune later.

Pros:
* Smaller first change.

Cons:
* Does not satisfy preview requirement and still leaves user blind before export.

### Approach C: Full Backup Catalog

Introduce a broader backup/snapshot catalog with retention and restore.

Pros:
* Strong long-term data portability.

Cons:
* Too large for this slice; overlaps with sync/backup design not yet scoped.

## MVP Decision

Use Approach A. Do not add backup catalog, attachments, background jobs, or restore behavior in this task.
