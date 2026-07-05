# Knowledge Workbench E2E Run

Date: 2026-07-05

Revision under test: `695d03e` (`chore: record journal`) after Workbench Readiness And Asset Features.

Checklist: `docs/knowledge-workbench-e2e-checklist.md`

## Summary

Automated regression coverage passed for the Source/Point/Evidence/Digest/Synthesis/Report/Gallery contracts covered by the current test suite. This run also validated the new Source asset aggregation and Gallery search DB helpers, frontend Markdown artifact helpers, command boundary typing, production frontend build, and a Tauri desktop startup smoke pass.

Full interactive manual desktop E2E remains pending because it requires an operator to drive the visible Tauri window plus configured text-model, search/fact-check, and image/provider settings.

## Environment Check

| Check | Result |
|---|---|
| Tauri CLI | PASS: `tauri-cli 2.0.0` |
| Desktop runtime command | PASS: `cargo tauri dev` launches the desktop runtime |
| Browser preview suitability | Not suitable for persistence validation; API fallbacks bypass Tauri/SQLite |

## Automated Regression Results

| Command | Result |
|---|---|
| `cd frontend; npm run typecheck` | PASS |
| `cd frontend; npm run check:boundaries` | PASS |
| `cd frontend; npm run test:run` | PASS: 7 files, 21 tests |
| `cd frontend; npm run build` | PASS: `tsc && vite build`, 3011 modules transformed |
| `cargo check --manifest-path src-tauri/Cargo.toml` | PASS |
| `cargo test --manifest-path src-tauri/Cargo.toml source_assets` | PASS: 1 targeted test |
| `cargo test --manifest-path src-tauri/Cargo.toml search_gallery` | PASS: 1 targeted test |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS: 56 tests |

## Desktop Runtime Smoke Results

| Check | Result |
|---|---|
| Command | `cargo tauri dev` |
| Run time | Started on 2026-07-05 at approximately 22:57 Asia/Shanghai; terminated by the automation timeout after about 94 seconds because `tauri dev` is a long-running process |
| Startup evidence | PASS: immediately after timeout, process inspection showed `cargo.exe tauri dev`, `cargo-tauri.exe tauri dev`, `npm run dev`, Vite `node`, `src-tauri/target/debug/deep-explorer.exe`, and WebView2 child processes for `deep-explorer.exe` |
| Dev server evidence | PASS: port `5173` had a Vite listener and established WebView connections |
| Cleanup evidence | PASS: process tree cleanup removed `cargo`, `cargo-tauri`, Vite `node`, `deep-explorer.exe`, and app-owned WebView2 children; port `5173` had only transient `TimeWait` entries afterward |
| Interactive coverage | NOT RUN: no automated desktop UI driver was attached, and provider-backed workflows need configured credentials plus operator interaction |

## New Coverage Added

- Backend DB tests cover `get_source_assets` grouping linked Points, Evidence, Reports, and Gallery items for a Source.
- Backend DB tests cover `search_gallery` matching prompts, file paths, and linked source Point content.
- Frontend helper tests cover Source asset Markdown, Evidence Markdown, and portable file-name generation.
- Frontend boundary/type checks cover the new `get_source_assets` and `search_gallery` command/API contracts.

## Manual Desktop E2E Status

Status: Startup smoke passed; full interactive manual E2E pending.

Reason: The Tauri app can launch in the desktop runtime, but the full manual flow still requires interactive desktop validation in the visible app, including configured model/search providers for live extraction, fact-checking, Digest, Synthesis, image generation, and real local download behavior from the WebView.

Required next manual run:

1. Start the desktop app with `cargo tauri dev`.
2. Follow `docs/knowledge-workbench-e2e-checklist.md` from Import a Source through Empty and degradation states.
3. Pay particular attention to the newest asset checks:
   - open a Source and confirm the Source asset panel loads linked Points, Evidence, Reports, and Gallery images or clear empty states,
   - export the Source asset bundle as Markdown,
   - export an Evidence record as Markdown,
   - reopen a saved Report and export it as Markdown with citation appendix,
   - search Library default mode for a known Gallery prompt/path/source Point and confirm Gallery appears as its own grouped result,
   - save Digest and Synthesis as Reports,
   - filter Reports by “知识研报”, “多来源综合”, and “全部”,
   - delete one Report,
   - confirm Source, Point, Evidence, and remaining Reports are unaffected,
   - confirm deleted Report title no longer appears in Report search,
   - reopen a remaining Report and verify citation source/chunk controls.

## Decision

No product issue was found by automated regression checks or the Tauri desktop startup smoke pass. The next gating item before further feature work is one operator-driven manual desktop pass with configured providers and local download verification.

---

# Research Workspace E2E Run

Date: 2026-07-06

Revision under test: working tree for Foliole / Marginalia research workspace integration.

Checklist: `docs/knowledge-workbench-e2e-checklist.md`

## Summary

Automated regression coverage passed for the new Investigation, Journal, Related Assets, Review Queue, Open Data Mirror, and Indexed Folder contracts covered by unit/type/build checks. A Tauri desktop startup smoke pass also launched the app runtime and cleaned up the process tree.

Full interactive manual desktop E2E remains pending because provider-backed Investigation generation and end-to-end UI workflows require a configured text model and an operator driving the visible desktop window.

## Automated Regression Results

| Command | Result |
|---|---|
| `cd frontend; npm run typecheck` | PASS |
| `cd frontend; npm run check:boundaries` | PASS |
| `cd frontend; npm run test:run` | PASS: 7 files, 21 tests |
| `cd frontend; npm run build` | PASS: `tsc && vite build`, 3011 modules transformed |
| `cargo check --manifest-path src-tauri/Cargo.toml` | PASS |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS: 62 tests |

## Desktop Runtime Smoke Results

| Check | Result |
|---|---|
| Command | `cargo tauri dev --no-watch` |
| Run time | Started on 2026-07-06 at approximately 00:34 Asia/Shanghai; observed for 126 seconds |
| Startup evidence | PASS: process tree included `cargo-tauri.exe`, Vite `node.exe`, `deep-explorer.exe`, and WebView2 child processes for `deep-explorer.exe` |
| Dev server evidence | PASS: port `5173` had a Vite listener |
| Cleanup evidence | PASS: wrapper stopped the spawned process tree; no `deep-explorer.exe` or repo-owned command processes remained; port `5173` only had transient `TimeWait` entries |
| Interactive coverage | NOT RUN: no desktop UI driver was attached |

## New Coverage Added

- Backend DB tests cover Investigation report kind compatibility, Journal list/search/invalidate, Review scheduling, Mirror config, Indexed Folder/File round-trip, and relation rebuild signals.
- Frontend helper tests cover Investigation report kind filtering and optional citation fields through existing report artifact parsing.
- Trellis backend code-spec documents the local research workspace contract and the indexed-folder text/code-file reader split.
- Manual checklist now covers Investigation -> Journal -> Related -> Review -> Mirror -> Indexed Folder.

## Manual Desktop E2E Status

Status: Startup smoke passed; full interactive manual E2E pending.

Required next manual run:

1. Start the desktop app with `cargo tauri dev`.
2. Follow `docs/knowledge-workbench-e2e-checklist.md` steps 11 through 17 for the new research workspace loop.
3. Use configured model/search providers and a temporary local folder containing Markdown, JSON, code, and binary/PDF files.

## Decision

No product issue was found by automated regression checks or the Tauri desktop startup smoke pass. The remaining risk is interactive workflow validation with real configured providers and local files.
