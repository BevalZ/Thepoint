# Knowledge Workbench E2E Regression

## Goal

Add a repeatable validation layer for the completed knowledge workbench route so future changes do not silently break Evidence search, Digest citations, or multi-source synthesis inputs.

## Requirements

- Document a manual end-to-end acceptance checklist for the full Source -> Point -> Evidence -> Digest -> Synthesis route.
- Add frontend regression tests for the reusable citation artifact logic used by Digest/Synthesis.
- Add frontend regression tests for Evidence and Source selection stores used as report inputs.
- Keep the first automated layer on the existing Vitest stack; do not introduce Playwright until browser/Tauri command mocking is designed.
- Ensure tests cover citation appendix preservation for copy/download/archive payloads.
- Ensure tests cover dedupe, remove, toggle, and clear behavior for report input stores.
- Keep production UI behavior unchanged unless a test exposes a real bug.

## Acceptance Criteria

- [x] Manual E2E checklist exists and covers import, Point, fact-check, Evidence save/search, Digest, synthesis, and citation return.
- [x] Digest/Synthesis citation artifact helpers are testable outside React components.
- [x] Vitest covers citation markdown and saved source excerpt generation.
- [x] Vitest covers Evidence Digest selection store behavior.
- [x] Vitest covers Synthesis Source selection store behavior.
- [x] `npm run test:run` passes from `frontend/`.
- [x] `npm run typecheck` passes from `frontend/`.
- [x] `npm run check:boundaries` passes from `frontend/`.
- [x] Relevant Rust tests still pass.

## Definition of Done

- `npm run test:run` passes from `frontend/`.
- `npm run typecheck` passes from `frontend/`.
- `npm run check:boundaries` passes from `frontend/`.
- `cargo test --manifest-path src-tauri/Cargo.toml digest` passes.
- `cargo test --manifest-path src-tauri/Cargo.toml evidence` passes.
- `cargo test --manifest-path src-tauri/Cargo.toml synthesis` passes.
- `git diff --check` passes.

## Technical Approach

- Extract pure Digest/Synthesis artifact helpers from `DigestModal.tsx` into `frontend/src/lib/digestArtifacts.ts`.
- Keep `DigestModal` as a consumer of those helpers.
- Test helper output using Vitest.
- Test Zustand stores directly through their `getState()` APIs.
- Add `docs/knowledge-workbench-e2e-checklist.md` for manual acceptance.

## Decision (ADR-lite)

**Context**: The app currently has Vitest but no Playwright. Direct browser E2E would require mocking Tauri `invoke` and seeded app state.

**Decision**: First add low-friction, deterministic Vitest regression coverage around the completed route's contract points, plus a manual E2E checklist. Defer Playwright until a mock Tauri runtime strategy is designed.

**Consequences**: This gives immediate regression protection without new dependencies. It does not replace a future browser automation layer.

## Out of Scope

- Adding Playwright or browser E2E infrastructure.
- Mocking all Tauri commands.
- Testing actual OpenAI API calls.
- Reworking UI layout.
- Persisted synthesis report table.

## Technical Notes

- Existing frontend test stack: Vitest.
- Existing tests live under `frontend/src/lib/*.test.ts`.
- Key production files: `frontend/src/components/DigestModal.tsx`, `frontend/src/store/evidenceDigestStore.ts`, `frontend/src/store/synthesisStore.ts`.
