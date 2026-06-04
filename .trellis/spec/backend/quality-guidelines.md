# Quality Guidelines

> Code quality standards for backend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

## Forbidden Patterns

- ❌ `unwrap()` / `expect()` outside of tests
- ❌ Direct `rusqlite` usage in `commands/` — go through `db/`
- ❌ Storing secrets (API keys) in SQLite — use `tauri-plugin-store`
- ❌ Blocking calls inside `async` commands — use `tokio::task::spawn_blocking` for CPU-heavy work (parsing)
- ❌ String interpolation in SQL queries — always use `?1` params

## Required Patterns

- All Tauri command return types: `Result<T, String>`
- All types crossing the Tauri boundary: `#[derive(Serialize, Deserialize, Clone)]`
- New commands: must be registered in `lib.rs` `generate_handler![]`
- UUID generation: `uuid::Uuid::new_v4().to_string()` — never sequential integers

## Testing Requirements

- Unit tests for all `db/queries/` and `parsers/` functions
- Use an in-memory SQLite (`Connection::open_in_memory()`) in tests
- Commands themselves don't need unit tests — test through the query/parser layer
