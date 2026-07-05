# Backend Quality Guidelines

> Code quality and verification expectations for the Tauri/Rust backend.

---

## Overview

Backend quality is enforced through Rust compilation, module-local unit tests, explicit command boundary contracts, and consistency with the frontend typed API layer. There is no custom Rust lint configuration yet; do not claim `cargo clippy` or formatting gates are required unless the project adds them.

Required backend verification from the repository root:

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

For changes touching Source, Point, Evidence, Digest, Synthesis, or Report behavior, also consult `docs/knowledge-workbench-e2e-checklist.md` and the targeted commands recorded in `docs/knowledge-workbench-e2e-run.md`.

---

## Required Patterns

Use the established backend boundaries:

- Tauri commands live in `src-tauri/src/commands/<area>.rs` and are registered in `src-tauri/src/lib.rs`.
- Frontend-callable commands return `Result<T, String>`.
- Internal DB/parser/AI helpers return `anyhow::Result<T>`.
- SQLite and heavier filesystem work inside async commands runs through `tokio::task::spawn_blocking`.
- Serialized command inputs and DB records that cross the frontend boundary use `#[serde(rename_all = "camelCase")]`.
- Command-to-DB conversion helpers stay near the command that owns the payload, for example `fact_check_result_to_evidence()` and `report_command_input_to_db()` in `src-tauri/src/commands/library.rs`.

When adding or changing a command, update the full boundary together:

1. Rust command implementation in `src-tauri/src/commands/`.
2. Command registration in `src-tauri/src/lib.rs`.
3. `frontend/src/api/commandMap.ts`.
4. Frontend API wrapper exports under `frontend/src/api/`.

Run frontend type and boundary checks when the command contract changes:

```powershell
cd frontend
npm run typecheck
npm run check:boundaries
```

---

## Forbidden Patterns

Avoid these in production backend code:

- `unwrap()` or `expect()` on runtime input, DB, filesystem, network, model response, or JSON parsing failures.
- Direct SQLite work in async command bodies when it can block the runtime.
- Returning `anyhow::Error` directly from a Tauri command.
- Adding a Tauri command without registering it and updating the frontend typed API boundary.
- Swallowing persistence or model failures and returning success to the caller.
- Logging raw prompts, document text, model bodies, API keys, or full binary/base64 payloads.
- Creating new aspirational layers such as `services/` or `db/migrations/` unless the codebase adopts that structure in source.

Allowed exceptions for `unwrap()` / `expect()`:

- Unit tests may use them for setup where failure should abort the test.
- Static invariants may use `expect()`, such as known-valid CSS selectors in `src-tauri/src/parsers/html.rs`.
- App startup may keep the Tauri builder `.expect("error while running tauri application")` pattern in `src-tauri/src/lib.rs`.

---

## Testing Requirements

Add tests near the module that owns the behavior.

Current trusted examples:

- `src-tauri/src/db/mod.rs` tests DB validation, search, delete semantics, Evidence hydration, Report persistence, and idempotent no-op behavior.
- `src-tauri/src/commands/library.rs` tests command input conversion and conservative fact-check verdict inference.
- `src-tauri/src/commands/digest.rs` tests Digest/Synthesis input labeling and citation construction.
- `src-tauri/src/commands/extract.rs` tests HTML extraction helpers, edge trimming, and fact-check parsing.
- `src-tauri/src/commands/gallery.rs` tests image response parsing helpers.
- `src-tauri/src/parsers/mod.rs` tests parser dispatch and unsupported format messages.
- `src-tauri/src/ai/openai.rs` tests chunk splitting and model payload parsing helpers.

For DB changes, include validation, empty-input, ordering, hydration, and delete/no-op cases. For command changes, include conversion tests when the command maps frontend DTOs into DB inputs. For AI/parser helper changes, test deterministic parsing and prompt/response shaping without requiring live providers.

---

## Review Checklist

Before considering backend work done:

- The command/error/logging behavior matches `directory-structure.md`, `error-handling.md`, `database-guidelines.md`, and `logging-guidelines.md`.
- Cross-layer command payload names are camelCase on the frontend boundary and compatible with Rust serde annotations.
- All new fallible runtime paths return errors or documented recoverable degradation; no new production `unwrap()`/`expect()` was added.
- Blocking DB/filesystem work is wrapped in `spawn_blocking`.
- Tests cover the owning module and any changed command-to-DB conversion.
- `cargo check --manifest-path src-tauri/Cargo.toml` passes.
- `cargo test --manifest-path src-tauri/Cargo.toml` passes.

When backend changes also touch frontend contracts, run the frontend typecheck and boundary check before committing.
