# Error Handling

> How errors are handled in this project.

---

## Overview

<!--
Document your project's error handling conventions here.

Questions to answer:
- What error types do you define?
- How are errors propagated?
- How are errors logged?
- How are errors returned to clients?
-->

## Error Handling Patterns

Tauri commands must return `Result<T, String>` — the `String` is serialized and sent to the frontend.

```rust
// Internal logic: use anyhow::Result for ergonomic ? propagation
fn parse_pdf(path: &str) -> anyhow::Result<String> {
    // ...
}

// Tauri command boundary: convert anyhow::Error → String
#[tauri::command]
pub async fn extract_file(file_path: String) -> Result<Vec<Point>, String> {
    parse_pdf(&file_path)
        .and_then(|text| extract_points(&text))
        .map_err(|e| e.to_string())
}
```

- Internal modules (`db/`, `parsers/`, `ai/`): return `anyhow::Result<T>`
- Tauri commands: always `Result<T, String>`, convert with `.map_err(|e| e.to_string())`
- Never `unwrap()` or `expect()` in command handlers — propagate all errors

## Common Mistakes

- ❌ Returning raw `anyhow::Error` from a command (won't compile)
- ❌ Swallowing errors with `let _ = ...` in commands
- ❌ Panicking in async commands (crashes the whole app)
