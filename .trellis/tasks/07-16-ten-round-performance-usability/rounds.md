# Ten-Round Execution Record

Date: 2026-07-16

## Round 1: Canonical sentence-boundary usability

Evidence: Existing WIP had a frontend `sentenceBoundaries` helper and a Rust test-only comparison splitter for abbreviation-safe boundaries. The regression target is avoiding fragments such as `e. instructions`.

Change: Kept sentence splitting in `frontend/src/lib/sentenceBoundaries.ts` and the Rust test helper in `src-tauri/src/ai/openai.rs`; no second production canonical planner was introduced.

Verification: `npm run test:run -- src/lib/sentenceBoundaries.test.ts` passed as part of the focused frontend run. The Rust test remains in `openai.rs` and will run with full `cargo test`.

Result: English abbreviations, citations, decimals, versions, URLs, compact initials, and CJK sentence breaks are protected by deterministic tests.

## Round 2: Reanalysis recovery and listener lifecycle

Evidence: Reopened Sources may have `current.text = ""` while history or saved chunk cards still contain analyzable text. Existing streaming listeners could otherwise leave `analyzing` stuck when command return and completion event diverge.

Change: `reanalyzeCurrent()` resolves input by current text, matching history text, then saved chunk text through `reanalysisTextForCurrent()`. The streaming command settles through one guarded cleanup path.

Verification: `npm run test:run -- src/lib/exploreReanalysis.test.ts src/store/exploreStore.test.ts` passed as part of the focused frontend run.

Result: Reanalysis recovers reopened content and unregisters both listeners on command completion, done event, or late rejection.

## Round 3: Investigation depth and evidence quality

Evidence: Investigation reports were too shallow because the prompt did not force evidence role, strength, confidence, or anti-padding behavior.

Change: `src-tauri/src/commands/digest.rs` updates Investigation system rules and bumps `INVESTIGATION_PROMPT_VERSION` to `investigation.v2`.

Verification: `cargo check --manifest-path src-tauri/Cargo.toml` passed. Full Rust tests are still required in the final gate.

Result: Generated Investigation records can now be distinguished by prompt version, and the deterministic prompt contract asks for more evidence-grounded output without asserting live model quality.

## Round 4: Hidden Explore presentation suspension

Evidence: `Explore` returns `null` while inactive, but stage/reveal/confetti effects above the return still advanced timers and presentation state.

Change: Gated stage advancement, reveal scheduling, and completion burst while `active === false`. Long-running analysis, fact check, Investigation, Gallery, and Translation Promise work remains mounted and unaffected.

Verification: `nextStagePresentationCount()` and `nextRevealPresentationCount()` tests passed in `src/lib/explorePresentation.test.ts`.

Result: Hidden Explore no longer spends timers on presentation-only work, while mounted async workflows continue.

## Round 5: Constant-count result reveal scheduling

Evidence: The reveal effect allocated one timeout per result via `Array.from({ length: resultTargetCount })`, so large imports created many timers at once.

Change: Replaced per-result timeout allocation with one self-rescheduling timeout driven by `revealedCount`.

Verification: `src/lib/explorePresentation.test.ts` confirms one-step reveal and hidden/restored immediate catch-up behavior.

Result: Result reveal now uses constant live timer count.

## Round 6: Remove repeated block entrance animation cost

Evidence: Every repeated result block previously mounted a Framer Motion star/analyze button. Current WIP already replaced it with a normal `button`.

Change: Preserved the normal button implementation in `ThemeBlock`, including click open/analyze, double-click regenerate, context-menu collect/uncollect, busy state, error titles, and focus target ref.

Verification: Focused frontend tests do not cover button rendering directly; manual desktop verification remains part of final acceptance.

Result: Repeated block controls avoid per-card Framer Motion spring overhead.

## Round 7: Pool near-viewport observers

Evidence: `useNearViewport` created one `IntersectionObserver` per hook instance for Evidence and Source image lazy work.

Change: Added `nearViewportObserverPool.ts`, sharing observers by root margin, unobserving nodes after first intersection, and releasing empty pools. No-observer fallback still marks content near immediately.

Verification: `src/hooks/nearViewportObserverPool.test.ts` passed with mocked observers.

Result: Observer instance count is bounded by distinct root margins instead of repeated component count.

## Round 8: Reuse backend HTTP client

Evidence: There were 24 ordinary `reqwest::Client::new()` call sites across AI, Digest, Gallery, config, analytics, suggestions, extract, and semantic paths.

Change: Added `src-tauri/src/http.rs` with a process-wide default client and replaced ordinary `Client::new()` call sites with `crate::http::client()`. Existing `Client::builder()` URL fetch paths are preserved for dedicated redirect/timeout behavior.

Verification: `cargo check --manifest-path src-tauri/Cargo.toml` passed. Remaining direct constructors are intentional `Client::builder()` call sites plus the shared static initializer.

Result: Ordinary backend model/search/image requests share connection pools and avoid repeated client construction.

## Round 9: Upsert Explore history snapshots

Evidence: `saveCurrent()` always inserted a new full snapshot, duplicating large text/html/card payloads for repeated analysis of the same persisted Source.

Change: Added `upsertExploreHistorySnapshot()` and wired `saveCurrent()` to update existing persisted Source entries while preserving stable history id and original creation time. Paste entries without `sourceId` remain append-only.

Verification: `src/lib/exploreHistory.test.ts` passed.

Result: Reanalysis of a saved Source updates one snapshot instead of filling localStorage/history with duplicates.

## Round 10: Single-flight configuration loading

Evidence: `App` and `Settings` could request config/profiles concurrently on first entry, and Settings could reload profiles when config `loaded` flipped.

Change: Added store-level single-flight promises for config and profiles, `profilesLoaded` readiness, retry after failure, and Settings guards around profile loading.

Verification: `src/store/configStore.test.ts` passed.

Result: Concurrent first-load requests are coalesced while failed requests remain retryable.

## Focused Verification So Far

Passed:

```powershell
cd frontend
npm run test:run -- src/lib/explorePresentation.test.ts src/lib/exploreHistory.test.ts src/hooks/nearViewportObserverPool.test.ts src/store/configStore.test.ts src/lib/sentenceBoundaries.test.ts src/lib/exploreReanalysis.test.ts src/store/exploreStore.test.ts
```

Result: 7 files, 21 tests passed.

Passed:

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```
