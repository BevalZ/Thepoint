# Backend Directory Structure

> Project-specific layout for the Tauri/Rust backend.

---

## Overview

The backend is the Rust side of a Tauri 2 desktop app. It runs in-process with the WebView and exposes behavior through Tauri commands, not through an HTTP server. The source root is `src-tauri/src/`.

Current layout:

```text
src-tauri/src/
├── main.rs              # tiny binary entrypoint, calls deep_explorer_lib::run()
├── lib.rs               # Tauri builder, plugins, and command registration
├── commands/            # Tauri command handlers grouped by product area
├── db/                  # SQLite path, schema init/migration, records, queries
├── ai/                  # OpenAI-compatible request builders and AI DTOs
├── parsers/             # file parser dispatch and format-specific parsers
└── search/              # reserved module; currently no substantive code
```

Reference files:

- `src-tauri/src/lib.rs`
- `src-tauri/src/commands/library.rs`
- `src-tauri/src/commands/extract.rs`
- `src-tauri/src/db/mod.rs`
- `src-tauri/src/ai/mod.rs`
- `src-tauri/src/parsers/mod.rs`

---

## Runtime Entry Points

`src-tauri/src/main.rs` should stay minimal:

```rust
fn main() {
    deep_explorer_lib::run()
}
```

`src-tauri/src/lib.rs` owns the Tauri runtime wiring:

- Declare backend modules with `mod`.
- Register Tauri plugins such as store and dialog.
- Register every frontend-callable command in `tauri::generate_handler![...]`.
- Start the app with `tauri::Builder::default().run(...)`.

Do not put product logic in `lib.rs`; add it to a command, DB helper, parser, or AI module and only register the command in `lib.rs`.

---

## `commands/`

`commands/` is the frontend-facing boundary. Files are grouped by product area:

- `config.rs`: settings, model/profile config, endpoint construction.
- `extract.rs`: URL/file ingestion, page cleanup, image description, fact check, text analysis commands.
- `library.rs`: points, sources, Evidence, Reports, search, archive, star commands.
- `digest.rs`: Digest and multi-source synthesis commands.
- `gallery.rs`: image prompt generation, image file persistence, gallery commands.
- `explore.rs`: framework/deepening/similarity commands.
- `analytics.rs`: analytics and explore suggestions.
- `suggestions.rs`: daily suggestion persistence commands.
- `mod.rs`: module exports only.

Command handlers should:

- Be annotated with `#[tauri::command]`.
- Return `Result<T, String>` unless the command is intentionally diagnostic and always returns a payload, such as `diagnose_gallery_file`.
- Convert camelCase frontend payloads with `#[serde(rename_all = "camelCase")]` on command input structs.
- Use typed conversion helpers when frontend input maps into a DB input, for example `report_command_input_to_db()` and `fact_check_result_to_evidence()` in `commands/library.rs`.
- Use `tokio::task::spawn_blocking` for SQLite and filesystem work.

When adding a frontend-callable command, update all of these together:

1. `src-tauri/src/commands/<area>.rs`
2. `src-tauri/src/lib.rs` command registration
3. `frontend/src/api/commandMap.ts`
4. `frontend/src/api/index.ts`

---

## `db/`

`db/mod.rs` owns SQLite records and persistence helpers. This project currently uses a single module rather than a migrations directory or query submodules.

The local pattern is:

- Define serialized record/input structs near the top of `db/mod.rs`.
- Use `#[serde(rename_all = "camelCase")]` for records returned to the frontend.
- Resolve the DB file with `db_path(app)`.
- Open and initialize with `open_db(path)`.
- Keep schema creation and idempotent migrations in `init_db(conn)`.
- Keep reusable database operations as functions that accept `&Connection` or `&mut Connection` and return `anyhow::Result<T>`.
- Put unit tests in the `#[cfg(test)]` module in `db/mod.rs`.

Reference helpers:

- `save_evidence`, `get_evidence`, `search_evidence`
- `save_report`, `get_report`, `search_reports`, `delete_report`
- `get_source_workspace`, `search_workspace`
- `required_trimmed`, `optional_trimmed`, `validate_report_kind`

Read `database-guidelines.md` before changing DB schema or persistence behavior.

---

## `ai/`

`ai/` owns model-facing DTOs and OpenAI-compatible HTTP behavior.

- `ai/mod.rs` defines shared serialized DTOs such as `ExtractedPoint`, `Label`, and `ChunkCard`.
- `ai/models.rs` defines built-in mental models and custom model merging.
- `ai/openai.rs` handles chunk splitting, point extraction, chunk analysis, and OpenAI-compatible request/response parsing.
- `ai/explore.rs` handles explore/deepening/search-context model calls.

Keep provider request construction and model response parsing out of UI-facing command handlers when the behavior is reusable. Command handlers should assemble config and inputs, call the AI helper, then map errors to `String`.

---

## `parsers/`

`parsers/mod.rs` dispatches by file extension and documents supported formats:

- `plaintext.rs`: txt, md, markdown, rst, csv.
- `docx.rs`: docx.
- `odt.rs`: odt.
- `html.rs`: html/htm.
- `pdf.rs`: currently returns unsupported behavior through dispatch.

Parser functions return `anyhow::Result<String>`. Unsupported formats should fail with a user-facing message from the dispatch layer rather than leaking low-level parser errors.

Reference tests in `parsers/mod.rs` verify supported plaintext/markdown and rejection messages for unsupported PDF/DOC paths.

---

## Tests

Backend tests are currently module-local Rust unit tests:

- `db/mod.rs` tests persistence, search, validation, delete semantics, and source workspace behavior.
- `commands/library.rs` tests command-input conversion and conservative Evidence verdict inference.
- `commands/extract.rs` tests HTML extraction, edge trimming, and fact-check parsing helpers.
- `parsers/mod.rs` tests parser dispatch.
- `ai/openai.rs` includes prompt/parse focused tests.

Run backend checks with:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

---

## Placement Rules

- New frontend-callable behavior starts in `commands/<area>.rs`; add a new command file only when no existing product area owns it.
- New durable data behavior belongs in `db/mod.rs` plus `database-guidelines.md` updates when the contract changes.
- New shared AI request/response logic belongs in `ai/`, not directly in a command handler.
- New document parsing support belongs in `parsers/<format>.rs` plus dispatch in `parsers/mod.rs`.
- New command DTOs should live near the command that owns them unless they are DB records or shared AI DTOs.

---

## Anti-Patterns

- Do not add an HTTP server or sidecar process for app-internal frontend/backend communication; this app uses Tauri commands.
- Do not put schema changes only in a command handler; schema initialization belongs in `db::init_db`.
- Do not block the async runtime with direct SQLite or large filesystem work in an async command; wrap it in `spawn_blocking`.
- Do not add command registration without updating the frontend typed API boundary.
- Do not create aspirational directories such as `db/migrations/` or `services/` unless the codebase actually adopts that structure.
