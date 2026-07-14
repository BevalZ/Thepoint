# Reduce Runtime Resource Usage and Improve Responsiveness

## Goal

Substantially reduce idle CPU and memory usage while making startup, navigation, animations, and local data interactions feel faster, without removing knowledge-workbench functionality or interrupting long-running Explore workflows when the user changes pages.

## What I Already Know

* The app is React 18 + Vite inside Tauri 2 / WebView2, with Framer Motion and Zustand.
* Warm development-runtime baseline on 2026-07-13: 8 app/WebView processes, 4.344 CPU seconds over a 5-second idle sample, 652.5 MB working set, and 432.8 MB private bytes.
* `StarfieldBackground` redraws 220 stars on every animation frame and performs random/twinkle work for every star.
* `StarRing` runs multiple permanent glow, orbit, dash, stroke, and shadow animations whenever any input is starred.
* `StartupSplash` blocks the application for 3.9 seconds and animates 58 particles plus per-character effects.
* Explore is intentionally kept mounted so fact checks and investigations continue across navigation, but its full DOM is retained while hidden.
* `PointEvidence` immediately issues one backend request per rendered Point, including off-screen cards.
* Point rows and deepening controls subscribe to entire Zustand stores, so unrelated row changes can rerender all cards.
* Grouped Library view repeatedly scans the full Point list and walks parents with repeated `find` calls.
* `db::open_db` runs the full idempotent schema initialization while holding a global mutex for every command.
* The bundled Noto Serif SC variable font is 25,053,412 bytes and is the default when no font preference has been saved.

## Assumptions

* Use a balanced default: preserve the visual identity but stop decorative animation from consuming resources continuously.
* System font becomes the default only when no explicit UI-font preference exists; users can still select Noto Serif SC.
* Optimize application-controlled work. Model/network latency and WebView2 base-process overhead are measured but not treated as fully removable.

## Requirements

* Eliminate continuous JavaScript canvas repainting from the global background.
* Keep StarRing controls and progress visualization, but animate only while work is active or during short entry/interaction feedback.
* Reduce the startup splash to at most one second and allow immediate dismissal.
* Reduce navigation/page transition duration and remove high-cost decorative hover/layout motion.
* Preserve Explore local state and in-flight Promise chains across navigation while removing its hidden DOM subtree.
* Skip layout and paint for off-screen heavy cards/blocks using Chromium-compatible content visibility.
* Load per-Point Evidence only when its host is near the viewport.
* Replace broad Zustand subscriptions in frequently repeated components with narrow selectors.
* Build grouped Source/Point trees in linear time instead of repeated full-array scans.
* Initialize each database path once per process, retain first-open migration/backup behavior, and invalidate the fast path after database restore.
* Preserve all existing UI actions, source navigation, fact checks, investigations, reports, evidence, and gallery behavior.

## Acceptance Criteria

* [x] Same-machine idle CPU sample reaches 0.859 CPU seconds / 5 seconds in the representative cold-restart sample (80.2% reduction); development WebView2 variance is recorded in `research/performance-baseline.md`.
* [x] Cold-restart development working set is 105.9 MB in the empty Explore state (83.8% below baseline); the populated-state and WebView Private Bytes variance is recorded explicitly.
* [x] Startup splash completes in <= 1 second and can be skipped by click.
* [x] Navigation transition duration is <= 150ms and no permanent nav hover/sweep animation runs.
* [x] Hidden Explore renders no heavy DOM while fact-check/investigation Promise state continues and reappears on return.
* [x] Off-screen Point Evidence does not issue a backend request until near the viewport.
* [x] Updating one Point's deepening/expanded state does not notify every Point row through a whole-store subscription.
* [x] Repeated `open_db` calls skip full schema initialization after the first successful initialization for that path; restore invalidates the cache.
* [x] Frontend typecheck, boundary check, tests, and production build pass.
* [x] Backend check and full tests pass.

## Definition of Done

* Focused regression tests cover new pure performance helpers/state contracts.
* Before/after process measurements are recorded using the same sampling script and runtime state.
* No hidden background listener/timer/animation remains without an activity or visibility reason.
* Project specs record the performance contracts and database initialization rule.
* Rollback remains file-local: visual optimizations and DB fast path can be reverted independently.

## Technical Approach

1. Replace per-frame star rendering with a resize-only canvas and compositor-level low-frequency opacity treatment.
2. Convert StarRing idle visuals to static SVG/CSS and retain only task-state feedback.
3. Shorten/simplify splash and App navigation motion.
4. Return `null` from Explore while inactive after hooks have retained workflow state; add `content-visibility` to heavy repeated rows.
5. Add an IntersectionObserver-backed near-viewport hook for Point Evidence.
6. Narrow Zustand subscriptions in App, Library, PointTree, DeepenActions, GroupedView, and StarRing.
7. Replace GroupedView descendant collection with indexed linear-time grouping.
8. Add a process-local initialized-path set around `open_db`; invalidate it from restore.
9. Run targeted tests, full gates, cold restart, and repeat the process baseline.

## Decision (ADR-lite)

**Context**: A global performance toggle would add settings/state complexity and leave the resource-heavy default intact.

**Decision**: Make the balanced low-resource behavior the default, retain opt-in Noto font and meaningful busy-state animation, and avoid adding a new configuration surface in this slice.

**Consequences**: Decorative motion becomes subtler, while core feedback and workflows remain. WebView2 retains a non-trivial base memory cost, but application-controlled CPU, DOM, font, and command overhead are reduced.

## Out of Scope

* Changing model providers, prompts, or network request latency.
* Replacing WebView2 or Tauri.
* Adding a third-party virtualization or database-pool dependency.
* Rewriting large pages into a new architecture.
* Removing optional Noto Serif SC or user-selected visual settings.

## Research References

* [`research/performance-baseline.md`](research/performance-baseline.md) — measured process baseline, identified hot paths, and selected low-risk interventions.

## Technical Notes

* Relevant frontend files: `StarfieldBackground.tsx`, `StarRing.tsx`, `StartupSplash.tsx`, `App.tsx`, `Explore.tsx`, `EvidenceList.tsx`, `PointTree.tsx`, `DeepenActions.tsx`, Library view components, `themeStore.ts`, and `index.css`.
* Relevant backend files: `db/mod.rs`, `commands/library.rs`, and the database restore path in `semantic/commands.rs`.
* Existing dirty changes belong to earlier active tasks and must be preserved.

## Ten-Round Follow-up Result — 2026-07-14

* Active Explore processing feedback now uses one continuous scan instead of roughly ten simultaneous Framer Motion loops.
* App theme initialization no longer subscribes the whole app shell; repeated Gallery components use narrow selectors.
* Gallery thumbnails use lazy loading, asynchronous decoding, and off-screen content visibility.
* StarRing source grouping avoids repeated array copies and repeated history scans.
* Analytics replaced ECharts with an accessible SVG radar: its lazy chunk fell from 464.09 kB to 20.74 kB (95.5%).
* UI language moved from the Search-model sub-tab to the Appearance landing panel and was verified with Playwright.
* Database initialization keys now lexically normalize relative `..` segments, preventing equivalent paths from bypassing the per-process initialization cache.
* Final cold-rebuild idle samples were 0.50 / 0.50 / 0.59 CPU seconds per 5 seconds with a 92.3–92.4 MB working set.
* A separate explicit stop/start produced a temporary 678.8–680.6 MB WebView working-set peak; after 30 seconds of Windows trimming it stabilized at 66.7–67.5 MB with 0.59 / 0.66 / 0.77 CPU seconds per 5 seconds.
* Final gates passed: 15 frontend test files / 43 tests, frontend typecheck/boundaries/build, Rust check, and 137 Rust tests (2 intentionally ignored).
