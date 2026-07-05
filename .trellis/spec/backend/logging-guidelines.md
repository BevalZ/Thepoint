# Backend Logging Guidelines

> Current diagnostic logging conventions for the Tauri/Rust backend.

---

## Overview

The backend does not currently use a structured logging framework. `src-tauri/Cargo.toml` has no `log`, `tracing`, or Tauri logging plugin dependency, and production diagnostics are limited to a few `println!` calls in command helpers.

Treat backend logging as sparse developer diagnostics, not as a product event stream. Command failures should normally be returned as `Result<T, String>` and surfaced to the caller; logging is only for non-sensitive metadata that helps understand recoverable degradation or provider/file handling behavior.

Reference files:

- `src-tauri/Cargo.toml`
- `src-tauri/src/commands/gallery.rs`
- `src-tauri/src/commands/extract.rs`
- `src-tauri/src/commands/library.rs`
- `src-tauri/src/commands/digest.rs`

---

## Current Format

Use `println!` with a bracketed subsystem prefix when a command needs diagnostics:

```rust
println!(
    "[Gallery] image request provider={} model={} size={} aspect={} prompt_chars={}",
    config.image_provider_key,
    model,
    image_size,
    aspect_ratio,
    prompt.chars().count()
);
```

Existing prefixes:

- `[Gallery]` for image generation, response shape, persisted image size, and download metadata.
- `[Extract]` for skipped AI edge cleanup when deterministic extraction can still proceed.

Do not invent pseudo log levels such as `[INFO]` or `[ERROR]` unless the project adopts a real logging facade. Keep the subsystem prefix stable and make the message key/value oriented.

---

## What To Log

Log only short operational metadata that is useful without exposing content:

- provider/model identifiers already selected by configuration
- counts, byte lengths, base64 lengths, prompt character count
- image dimensions, persisted file/thumbnail path strings
- response shape, such as `type=b64_json`, `type=url`, or `type=inlineData`
- recoverable degradation that intentionally falls back to a valid result

Good local examples:

- `src-tauri/src/commands/gallery.rs` logs saved image id, byte count, dimensions, and file paths after image persistence.
- `src-tauri/src/commands/gallery.rs` logs image API request metadata using `prompt_chars`, not the prompt body.
- `src-tauri/src/commands/extract.rs` logs `[Extract] edge cleanup skipped: {error}` and returns deterministic page extraction when optional cleanup fails.

---

## What Not To Log

Never log secrets or high-volume user/model content:

- API keys, authorization headers, or full endpoint URLs containing credentials.
- Raw prompts, imported documents, extracted page text, chunk text, notes, claims, or report bodies.
- Raw model response bodies unless a future explicit diagnostic mode redacts them first.
- Full base64 image payloads or downloaded image bytes.
- User data from SQLite records beyond ids, counts, or lengths needed for diagnostics.

If a caller needs to know an operation failed, return an error. Do not log the error and report success unless the behavior is an explicitly documented recoverable degradation, like skipped edge cleanup.

---

## Adding More Logging

Before adding logging:

1. Check whether the error should be returned through the command `Result<T, String>` instead.
2. Prefer metadata that can be represented as counts, ids, or enum-like response kinds.
3. Use the owning command area as the prefix: `[Library]`, `[Digest]`, `[Gallery]`, `[Extract]`, etc.
4. Keep logs near the boundary that has the context. Avoid threading logging-only data through DB or AI helpers.

Avoid adding `dbg!`, ad hoc `eprintln!`, or a logging dependency for a single diagnostic. If structured logs become a requirement, update this guide and `src-tauri/Cargo.toml` together and migrate existing `println!` messages intentionally.
