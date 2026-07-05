# Backend Development Guidelines

> Project-specific guidance for the Tauri/Rust backend.

---

## Overview

The backend is the Rust core inside the Tauri desktop app. It exposes frontend-callable behavior through Tauri commands, persists durable state in local SQLite through `rusqlite`, calls OpenAI-compatible HTTP APIs with `reqwest`, and parses local/web documents in Rust modules.

Read the files below before changing backend code. For command/API changes, also read the frontend spec files that own `frontend/src/api/commandMap.ts` and wrapper usage.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Runtime entrypoints, command/db/ai/parser placement rules | Project-specific |
| [Database Guidelines](./database-guidelines.md) | SQLite/rusqlite helpers, inline migrations, naming, durable data contracts | Project-specific |
| [Error Handling](./error-handling.md) | `anyhow::Result`, command `Result<T, String>`, validation and degradation patterns | Project-specific |
| [Quality Guidelines](./quality-guidelines.md) | Verification commands, command boundary quality rules, tests, review checklist | Project-specific |
| [Logging Guidelines](./logging-guidelines.md) | Current minimal console diagnostics and sensitive-data limits | Project-specific |

---

## Pre-Development Checklist

Before backend implementation:

1. Read [Directory Structure](./directory-structure.md) to place commands, DB helpers, parser code, and AI helpers correctly.
2. Read [Error Handling](./error-handling.md) before adding commands or fallible helpers.
3. Read [Database Guidelines](./database-guidelines.md) before changing SQLite schema, query behavior, or durable records.
4. Read [Quality Guidelines](./quality-guidelines.md) before changing command contracts, async DB/filesystem work, or tests.
5. Read [Logging Guidelines](./logging-guidelines.md) before adding backend diagnostics or recoverable-degradation logging.
6. For cross-layer command changes, read frontend [Type Safety](../frontend/type-safety.md), [Directory Structure](../frontend/directory-structure.md), and [Quality Guidelines](../frontend/quality-guidelines.md).

---

## Quality Check

For material backend changes, run from the repository root:

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

---

## Core Boundary

Tauri commands are the app-internal API boundary. Add or update the Rust command, register it in `src-tauri/src/lib.rs`, then update the frontend typed API boundary in `frontend/src/api/`.
