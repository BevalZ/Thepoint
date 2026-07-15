# Fix Explore Navigation Re-import

## Goal

Keep an already imported/analyzed article stable when navigating away from Explore and returning. Returning to Explore must restore the existing result immediately instead of replaying the import/processing presentation.

## What I Already Know

* `App.tsx` renders only the active page, so switching pages unmounts `Explore`.
* Article data and chunk cards live in the persistent Zustand Explore store and are not lost on navigation.
* Explore presentation counters (`stageCompletedCount` and `revealedCount`) are component-local state initialized to zero on every mount.
* A remount with existing content therefore replays staged processing even though `parseFile`, `fetchUrlContent`, and `upsertSourceDocument` are not invoked again.

## Requirements

* A fresh explicit import or reanalysis continues to show the existing processing/reveal sequence.
* Remounting Explore with already available, non-busy content starts in the fully displayed state.
* Navigating Explore -> another page -> Explore does not invoke import, fetch, parse, upsert, or analysis again.
* Preserve the current Zustand content/history behavior and all explicit reanalysis controls.

## Acceptance Criteria

* [x] Existing non-busy content initializes the Explore presentation as complete.
* [x] Empty or actively processing content retains the normal initial state.
* [x] Switching away and back no longer visually re-imports/reprocesses the article.
* [x] Frontend typecheck, boundary checks, tests, and build pass.

## Definition of Done

* A regression test covers remount initialization for existing content.
* The real desktop navigation flow is verified.
* No duplicate import or analysis side effects are introduced.

## Technical Approach

Extract a small deterministic presentation-state initializer and use it for Explore's mount-time stage/reveal counters. Existing non-busy content receives completed counters; empty or busy state starts at zero and continues through the existing effects.

## Decision (ADR-lite)

**Context**: Keeping every page mounted would avoid local-state reset but would materially change application lifecycle, background effects, and resource usage.

**Decision**: Preserve current page unmounting and make Explore's mount initialization aware of persisted content.

**Consequences**: Minimal scope and no routing architecture change. Future Explore-local transient UI state remains intentionally reset unless explicitly promoted to the store.

## Out of Scope

* Keeping all application pages mounted simultaneously.
* Persisting drawers, selection toolbars, fact-check bubbles, or other transient Explore UI.
* Changing Source database schemas or import deduplication.

## Technical Notes

* Primary files: `frontend/src/pages/Explore.tsx` and a focused frontend test/helper.
* Unrelated dirty Rust command files and `炼化/` must remain untouched.
