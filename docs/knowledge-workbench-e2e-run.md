# Knowledge Workbench E2E Run

Date: 2026-07-05

Commit under test: `bfa5331`

Checklist: `docs/knowledge-workbench-e2e-checklist.md`

## Summary

Automated regression coverage passed for the Source/Point/Evidence/Digest/Synthesis/Report contracts covered by the current test suite. Full manual desktop E2E remains pending because it requires a visible Tauri window plus configured text-model and search/fact-check providers.

## Environment Check

| Check | Result |
|---|---|
| Tauri CLI | PASS: `tauri-cli 2.0.0` |
| Desktop runtime command | `cargo tauri dev` available |
| Browser preview suitability | Not suitable for persistence validation; API fallbacks bypass Tauri/SQLite |

## Automated Regression Results

| Command | Result |
|---|---|
| `cd frontend; npm run test:run` | PASS: 6 files, 18 tests |
| `cd frontend; npm run typecheck` | PASS |
| `cd frontend; npm run check:boundaries` | PASS |
| `cargo test --manifest-path src-tauri\Cargo.toml evidence` | PASS: 12 tests |
| `cargo test --manifest-path src-tauri\Cargo.toml report` | PASS: 6 tests |
| `cargo test --manifest-path src-tauri\Cargo.toml digest` | PASS: 5 tests |
| `cargo test --manifest-path src-tauri\Cargo.toml synthesis` | PASS: 2 tests |
| `cargo check --manifest-path src-tauri\Cargo.toml` | PASS |

## Manual Desktop E2E Status

Status: Pending.

Reason: The manual flow requires interactive desktop validation in the Tauri app, including configured model/search providers for live extraction, fact-checking, Digest, and Synthesis generation. The current automated session verified command availability and regression tests but did not drive the visible desktop UI.

Required next manual run:

1. Start the desktop app with `cargo tauri dev`.
2. Follow `docs/knowledge-workbench-e2e-checklist.md` from Import a Source through Empty and degradation states.
3. Pay particular attention to the newest Report checks:
   - save Digest and Synthesis as Reports,
   - filter Reports by “知识研报”, “多来源综合”, and “全部”,
   - delete one Report,
   - confirm Source, Point, Evidence, and remaining Reports are unaffected,
   - confirm deleted Report title no longer appears in Report search,
   - reopen a remaining Report and verify citation source/chunk controls.

## Decision

No product issue was found by automated regression checks. The next gating item before further feature work is one manual desktop pass with configured providers.
