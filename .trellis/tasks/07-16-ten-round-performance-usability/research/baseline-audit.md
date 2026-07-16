# Performance and Usability Baseline Audit

Date: 2026-07-16

## Prior Optimization Baseline

The archived `07-13-optimize-runtime-performance` task already addressed the largest global costs:

* removed the permanent starfield JavaScript animation loop;
* bounded StarRing and startup motion;
* kept Explore mounted while rendering no hidden DOM;
* added near-viewport Evidence loading and content visibility;
* narrowed repeated Zustand subscriptions and made grouping linear;
* cached successful database initialization per normalized path;
* replaced ECharts, reducing the Analytics lazy chunk by about 95.5%;
* measured stable warm idle samples around 0.50-0.77 CPU seconds per five seconds and 66.7-92.4 MB working set after WebView trimming.

This task must not count those completed changes again.

## Current Working-Tree Baseline

The worktree contains intentional pre-existing WIP that predates this task:

* canonical content-plan browser fallback and sentence-boundary regression helpers;
* reopened-Source reanalysis fallback plus streaming-listener cleanup;
* an Investigation prompt-depth revision;
* a per-block Star button motion removal;
* Rust formatting changes in `config.rs`, `digest.rs`, and `gallery.rs` that must not be treated as functional optimization.

These changes will be reviewed semantically and precisely staged. Formatting-only and unrelated hunks remain excluded.

## New High-Confidence Findings

### Explore presentation work continues while hidden

`Explore.tsx` returns `null` when inactive, but presentation-only effects above that return still advance the processing stack, allocate result-reveal timers, and schedule completion confetti. Long-running analysis must continue, but hidden animation bookkeeping does not need to run.

### Result reveal allocates one timer per result

The result-reveal effect uses `Array.from({ length: resultTargetCount })` and schedules one timeout per block. A large document therefore creates a timer and state update for every visible result. One self-rescheduling timer can preserve progressive reveal with constant timer count.

### Repeated result cards mount Framer Motion buttons

Every `ThemeBlock` creates a `motion.button` with a spring entrance, even when opening an already analyzed or translated long document. The control does not need layout animation to communicate state.

### Near-viewport hooks create one observer per component instance

`useNearViewport` constructs an `IntersectionObserver` for every `PointEvidence` and remote Source image instance. A pooled observer keyed by root margin can observe the same number of nodes with a bounded observer count.

### HTTP connection pools are repeatedly discarded

There are 24 direct `reqwest::Client::new()` call sites. Several are on per-block analysis, fact-check, search, Digest, Investigation, and Gallery paths. Reusing a process-wide default client preserves connection pooling and avoids repeated client/TLS setup; commands that require custom redirect/timeout policies keep dedicated builders.

### Explore history always inserts a new full snapshot

`saveCurrent()` creates a new ID on every analysis completion and stores full text, rich HTML, content plan, and cards. Reanalysis of the same persisted Source therefore duplicates large snapshots in memory and synchronous localStorage until the 48-active-entry cap is reached. Persisted Source identity can update the existing history entry while preserving its original creation time.

### Config/profile loading can fan out

`App` and `Settings` can call `fetchConfig()` concurrently before `loaded` becomes true. Settings also calls `loadProfiles()` in an effect that reruns when config loading flips `loaded`, causing duplicate profile reads on first entry. Store-level single-flight requests and an explicit profiles-loaded flag remove redundant commands.

## Usability Findings in Existing WIP

* Sentence splitting must protect abbreviations, citations, decimals, initials, and URLs so blocks do not begin with fragments such as `e. instructions`.
* Reanalysis must recover content from Source history or persisted chunk cards when the current text buffer is empty, and must clean listeners even if the command resolves without a completion event.
* Investigation output needs explicit evidence-role, strength, confidence, non-fabrication, and anti-padding instructions; the prompt version must change so audits distinguish old and new behavior.

## Verification Baseline

The immediately preceding isolated translation commit passed:

* frontend typecheck, boundary check, command registry check, 16 files / 48 tests, and production build;
* Rust 157 passed / 2 ignored and `cargo check`.

The full mixed worktree previously passed 18 frontend files / 53 tests and 158 Rust tests / 2 ignored. Exact counts may grow as this task adds focused tests.

## Constraints

* Preserve mounted Explore async workflows across navigation.
* Do not introduce a third-party virtualization, state, or HTTP dependency.
* Do not apply a blanket `cargo fmt` commit over unrelated WIP.
* Measure structural costs deterministically where runtime process metrics are noisy: timer count, observer instance count, request single-flight count, history snapshot count, direct client-construction count, test count, and production chunk size.

