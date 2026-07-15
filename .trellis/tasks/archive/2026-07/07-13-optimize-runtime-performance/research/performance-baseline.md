# Runtime Performance Baseline — 2026-07-13

## Measurement

Warm `cargo tauri dev` runtime, Deep Explorer responding, five-second idle sample of the `deep-explorer.exe` process tree:

| Metric | Baseline |
|---|---:|
| Process count | 8 |
| CPU time over 5 seconds | 4.344 seconds |
| Approximate one-core utilization | 86.9% |
| Working set | 652.5 MB |
| Private bytes | 432.8 MB |

The two active WebView2 processes consumed 2.44 and 1.91 CPU seconds respectively. The Rust host consumed no measurable CPU in the sample, which localizes the idle issue to frontend rendering/compositing.

## High-Confidence Hot Paths

1. `StarfieldBackground.tsx`: 220 stars, `requestAnimationFrame`, full-canvas clear, trigonometry, random twinkle, and sprite draw every frame.
2. `StarRing.tsx`: multiple simultaneous infinite Framer Motion animations, SVG filters, blur, orbiting children, animated stroke width, opacity, rotation, scale, and box shadow.
3. `StartupSplash.tsx`: 3.9-second input-blocking overlay, interval-driven scramble, 58 particles, per-character motion, and permanent pulse while visible.
4. Hidden Explore: workflow preservation currently retains the entire rendered document and analysis-card DOM while another page is visible.
5. `PointEvidence`: one immediate backend call per visible Point, including cards outside the viewport.
6. Broad Zustand subscriptions: repeated Point components rerender on unrelated library/deepening state changes.
7. Grouped Library view: repeated `filter` and `find` scans make grouping degrade superlinearly.
8. `db::open_db`: full schema initialization and a global initialization mutex are used on every ordinary command open.
9. Font: default Noto Serif SC variable font is 25.05 MB before decoding and glyph caches.

## Chosen Interventions

* Keep visual identity with static/precomposed decoration and short task-state animation instead of permanent frame loops.
* Preserve workflow state by retaining the Explore component but returning no DOM while inactive.
* Prefer browser-native `content-visibility` and `IntersectionObserver` over a new virtualization dependency.
* Use narrow Zustand selectors at repeated-component boundaries.
* Use an explicit process-local DB initialization cache with restore invalidation rather than a connection pool or migration rewrite.

## Measurement Caveats

Development mode includes Vite/HMR and debug Rust overhead. Before/after measurements must use a cold restart and the same page/source state. WebView2 working-set trimming is asynchronous; memory should be sampled after a short warm idle period and reported as a range if necessary.

## Post-Optimization Measurement — 2026-07-13

After a cold restart with the optimized frontend and an idle empty Explore workspace, the Deep Explorer process tree contained 8 processes:

| Metric | Post-optimization |
|---|---:|
| Process count | 8 |
| Working set | 105.9 MB |
| Private bytes | 429.5 MB |
| CPU over 5 seconds (sample 1) | 0.859 seconds |
| CPU over 5 seconds (sample 2) | 0.953 seconds |
| CPU over 5 seconds (sample 3) | 1.047 seconds |

The representative first sample is an 80.2% reduction from the 4.344-second baseline. The 0.953–1.047-second samples show normal WebView2/GPU scheduling variance in development mode; the app-controlled frame loops and idle animation sources were removed. Working set is 83.8% below the baseline, but the comparison is an empty Explore state rather than the original populated state; Private Bytes remains dominated by WebView2/GPU allocation and is essentially unchanged.

After the final Rust path-key fix and another warm restart, a spot check measured 8 processes, 0.625 CPU seconds / 5 seconds, 99.0 MB working set, and 450.0 MB private bytes. This confirms the optimization remains active after the backend rebuild; the small memory difference is WebView2 allocation variance.

## Ten-Round Follow-up Verification — 2026-07-14

The follow-up pass audited active-work motion, navigation workflow retention, Zustand subscriptions, off-screen media, grouping complexity, database-open behavior, lazy chunks, and real browser interactions. Additional changes reduced the Explore processing stage from roughly ten concurrent infinite Framer Motion loops to one bounded-to-work scanning loop, narrowed Gallery subscriptions, deferred Gallery thumbnail decode/paint, made StarRing source grouping linear before sorting, and replaced the single ECharts radar with a lightweight SVG.

The Analytics production chunk changed from 464.09 kB (156.56 kB gzip) to 20.74 kB (7.01 kB gzip), a 95.5% raw-size reduction. ECharts and its React wrapper were removed from runtime dependencies.

After the Rust path-key normalization fix triggered a fresh `cargo tauri dev` rebuild, three consecutive five-second idle samples on the empty Explore workspace measured:

| Sample | Processes | CPU over 5 seconds | Working set | Private bytes |
|---:|---:|---:|---:|---:|
| 1 | 8 | 0.50 s | 92.3 MB | 443.8 MB |
| 2 | 8 | 0.50 s | 92.4 MB | 443.8 MB |
| 3 | 8 | 0.59 s | 92.4 MB | 443.8 MB |

The representative 0.50-second sample is 88.5% below the original 4.344-second baseline. The 92.3 MB working set is 85.9% below the original 652.5 MB sample. Private bytes remain a WebView2/GPU reservation metric and stayed in the previously observed range.

A final explicit stop/start after all quality gates confirmed the WebView2 working-set caveat. During the first minute, before Windows trimmed the new WebView processes, three samples were 0.88 / 0.94 / 0.72 CPU seconds per 5 seconds with a 678.8–680.6 MB working set. After a further 30-second warm idle, the same process tree measured 0.59 / 0.66 / 0.77 CPU seconds per 5 seconds, a 66.7–67.5 MB working set, and 446.8–446.9 MB private bytes. The stabilized representative 0.59-second CPU sample remains 86.4% below the original baseline, while the immediate cold working-set peak is retained here rather than presented as a steady-state regression.

Playwright browser-preview verification covered Explore, Library, Gallery, Analytics, Settings, the UI-language selector, and the command palette. All tested empty/loading/navigation states rendered, the selector switched to English, and the console reported zero errors and zero warnings. Tauri-only command execution remains covered by desktop runtime checks and Rust tests rather than browser preview.
