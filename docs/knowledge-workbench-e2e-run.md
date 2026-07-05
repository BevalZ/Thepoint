# Knowledge Workbench E2E Run

Date: 2026-07-05

Revision under test: uncommitted task working tree on `main` after Workbench Readiness And Asset Features changes, based on recent commit `adfb107`.

Checklist: `docs/knowledge-workbench-e2e-checklist.md`

## Summary

Automated regression coverage passed for the Source/Point/Evidence/Digest/Synthesis/Report/Gallery contracts covered by the current test suite. This run also validated the new Source asset aggregation and Gallery search DB helpers, frontend Markdown artifact helpers, command boundary typing, and production frontend build.

Full manual desktop E2E remains pending because it requires a visible Tauri window plus configured text-model, search/fact-check, and image/provider settings.

## Environment Check

| Check | Result |
|---|---|
| Tauri CLI | PASS: `tauri-cli 2.0.0` |
| Desktop runtime command | `cargo tauri dev` available |
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

## New Coverage Added

- Backend DB tests cover `get_source_assets` grouping linked Points, Evidence, Reports, and Gallery items for a Source.
- Backend DB tests cover `search_gallery` matching prompts, file paths, and linked source Point content.
- Frontend helper tests cover Source asset Markdown, Evidence Markdown, and portable file-name generation.
- Frontend boundary/type checks cover the new `get_source_assets` and `search_gallery` command/API contracts.

## Manual Desktop E2E Status

Status: Pending.

Reason: The manual flow requires interactive desktop validation in the Tauri app, including configured model/search providers for live extraction, fact-checking, Digest, and Synthesis generation, plus real local download behavior from the WebView. The current automated session verified command availability, typed boundaries, persistence helper behavior, export helper output, and regression tests but did not drive the visible desktop UI.

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

No product issue was found by automated regression checks. The next gating item before further feature work is one manual desktop pass with configured providers and local download verification.
