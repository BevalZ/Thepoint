# Backend Error Handling

> How errors are represented, propagated, and returned from the Rust/Tauri backend.

---

## Overview

Backend internals use `anyhow::Result<T>` for fallible work. Tauri commands expose errors to the frontend as `Result<T, String>`, because frontend `invoke` rejects with a string-like error.

The common path is:

1. Validate command input early when the command can produce a clearer user message.
2. Run DB/file work inside `tokio::task::spawn_blocking`.
3. Use `?` inside internal helpers that return `anyhow::Result<T>`.
4. Convert both task join errors and internal errors with `.map_err(|e| e.to_string())`.

Reference files:

- `src-tauri/src/commands/library.rs`
- `src-tauri/src/commands/extract.rs`
- `src-tauri/src/commands/digest.rs`
- `src-tauri/src/db/mod.rs`
- `src-tauri/src/parsers/mod.rs`
- `src-tauri/src/ai/openai.rs`

---

## Error Types

### Command boundary

Tauri commands generally return:

```rust
Result<T, String>
```

Use this for any command listed in `src-tauri/src/lib.rs` and called from `frontend/src/api`.

Examples:

- `commands/library.rs`: `save_evidence`, `search_reports`, `delete_point`
- `commands/extract.rs`: `parse_document`, `describe_image`, `fact_check_claim`
- `commands/digest.rs`: `generate_digest`, `generate_synthesis`

### Internal helpers

Internal DB, parser, and AI helpers generally return:

```rust
anyhow::Result<T>
```

Examples:

- `db::open_db(path) -> Result<Connection>`
- `db::save_report(conn, input) -> Result<ReportRecord>`
- `parsers::parse_document(path) -> anyhow::Result<String>`
- `openai::extract_points(...) -> anyhow::Result<Vec<ExtractedPoint>>`

`db/mod.rs` imports `anyhow::{Context, Result}` and uses context for low-level DB setup and schema creation failures.

---

## Command Pattern

For commands that touch SQLite:

```rust
let path = db::db_path(&app).map_err(|e| e.to_string())?;
tokio::task::spawn_blocking(move || -> anyhow::Result<T> {
    let conn = db::open_db(&path)?;
    db::some_operation(&conn, &input)
})
.await
.map_err(|e| e.to_string())?
.map_err(|e| e.to_string())
```

The first `map_err` after `.await` handles the blocking task join error. The second handles the internal `anyhow::Result<T>`.

Do not collapse this into an unchecked `unwrap()` or direct blocking DB call in async commands.

---

## Validation Errors

Prefer explicit validation at the closest layer that can give the best message:

- Command layer: validate simple user input before doing work, such as empty manual point content or empty fact-check claim.
- DB layer: validate persistence invariants, such as required report fields, valid Evidence verdict values, valid source stance values, and citation JSON shape.
- Parser dispatch layer: validate unsupported file types and return user-facing unsupported-format messages.
- AI layer: validate missing API keys and non-success HTTP responses.

Reference examples:

- `commands/library.rs` trims manual/fact-check child point content and returns a command error when empty.
- `db/mod.rs` uses `required_trimmed`, `validate_evidence_verdict`, `validate_evidence_stance`, `validate_report_kind`, and `normalize_report_citations_json`.
- `parsers/mod.rs` rejects PDF and DOC imports with format-specific guidance.
- `commands/extract.rs` rejects missing image URL, missing API key, disabled search model, and empty fact-check claim before sending requests.

---

## Context And Messages

Use `anyhow::Context` when wrapping low-level failures that would otherwise be ambiguous.

Good examples in `db/mod.rs`:

- resolving the app data directory
- creating the app data directory
- opening the library DB
- creating tables and indexes in `init_db`
- parsing report citation JSON

Use `anyhow::bail!` for validation or provider-response failures inside internal helpers.

Good examples:

- `ai/openai.rs` bails on missing API key and non-success model responses.
- `parsers/mod.rs` bails on unsupported formats.
- `db/mod.rs` bails on invalid Evidence/Report enum values.

At the command boundary, map the error into a string. Do not expose custom Rust error types to Tauri commands unless the frontend contract is also changed.

---

## Recoverable Degradation

Some workflows intentionally continue after non-critical failures. Make this explicit and keep the primary user action successful.

Examples:

- `commands/extract.rs` returns the deterministic page extraction when AI edge cleanup fails, logging a short skip message.
- Streaming extraction/analysis emits successful chunk results and ignores per-chunk failures instead of failing the whole stream.
- `commands/gallery.rs` ignores filesystem removal errors after the gallery DB row has been deleted.
- `diagnose_gallery_file` returns a diagnostic payload with `error: Some(...)` instead of returning `Result`.

Use this pattern only when the feature can produce a correct partial result and the caller has no useful recovery action.

---

## Tests

Test validation and conversion behavior close to the layer that owns it.

Examples:

- `commands/library.rs` tests conservative fact-check verdict inference and command-to-DB input conversion.
- `commands/extract.rs` tests page extraction, metadata removal, edge trimming, and JSON parsing/clamping helpers.
- `parsers/mod.rs` tests unsupported PDF/DOC messages.
- `db/mod.rs` tests DB validation failures, search behavior, delete semantics, and idempotent no-op behavior for missing report deletes.

Use `unwrap()` and `expect()` freely inside tests when setup must succeed for the assertion to matter. Avoid `unwrap()` in production command/helper code except for static invariants that cannot fail in normal operation, such as known-valid CSS selectors.

---

## Wrong Vs Correct

### Wrong

```rust
#[tauri::command]
pub async fn list_reports(app: tauri::AppHandle<Wry>) -> Result<Vec<ReportRecord>, String> {
    let conn = db::open_db(&db::db_path(&app).unwrap()).unwrap();
    Ok(db::list_recent_reports(&conn, 120).unwrap())
}
```

### Correct

```rust
#[tauri::command]
pub async fn list_reports(app: tauri::AppHandle<Wry>) -> Result<Vec<ReportRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<ReportRecord>> {
        let conn = db::open_db(&path)?;
        db::list_recent_reports(&conn, 120)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}
```

---

## Anti-Patterns

- Do not use `unwrap()` or `expect()` in command handlers for runtime input, DB, filesystem, network, or model failures.
- Do not return `anyhow::Error` directly from a Tauri command.
- Do not replace user-facing validation messages with raw SQL or HTTP errors when the command can validate earlier.
- Do not swallow a persistence failure and report success to the frontend.
- Do not add logging-only error handling for operations whose caller needs to know the command failed.
