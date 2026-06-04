# Backend Development Guidelines

> Best practices for backend development in this project.
> Stack: Tauri 2 + Rust (commands layer) + SQLite (rusqlite)

---

## Pre-Development Checklist

Before writing any backend code, read:

- [ ] [Directory Structure](./directory-structure.md) — where to put new files
- [ ] [Database Guidelines](./database-guidelines.md) — SQLite/rusqlite patterns
- [ ] [Error Handling](./error-handling.md) — `Result<T, String>` convention for Tauri commands
- [ ] [Quality Guidelines](./quality-guidelines.md) — forbidden patterns

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization under `src-tauri/src/` | ✅ |
| [Database Guidelines](./database-guidelines.md) | rusqlite patterns, migrations, FTS5 | ✅ |
| [Error Handling](./error-handling.md) | Tauri command error convention | ✅ |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | ✅ |
| [Logging Guidelines](./logging-guidelines.md) | Structured logging with `tracing` | ✅ |
