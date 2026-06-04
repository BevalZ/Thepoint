# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

<!--
Document your project's database conventions here.

Questions to answer:
- What ORM/query library do you use?
- How are migrations managed?
- What are the naming conventions for tables/columns?
- How do you handle transactions?
-->

Library: `rusqlite` with `bundled` feature (SQLite embedded, no system dependency).
DB file path: resolved by Tauri's `app_data_dir()` → `deep-explorer/data.db`.

## Query Patterns

```rust
// Always access DB via AppState, never open a new connection per command
pub fn get_points_by_session(conn: &Connection, session_id: &str) -> anyhow::Result<Vec<Point>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, parent_id, tag_type, custom_tags, source_location, highlight, created_at
         FROM points WHERE session_id = ?1"
    )?;
    // ...
}
```

- Queries > 3 lines → `db/queries/` module, not inline in commands
- Use `?1, ?2` positional params — never string interpolation
- Transactions: wrap multi-step writes in `conn.execute("BEGIN", [])` / `COMMIT`

## Migrations

Files in `src-tauri/src/db/migrations/` named `001_init.sql`, `002_fts5.sql`, etc.  
`db::init()` runs all migrations in order on startup using a `schema_version` table to track applied ones.

## Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Tables | `snake_case` plural | `points`, `sessions`, `explore_actions` |
| Columns | `snake_case` | `parent_id`, `created_at`, `tag_type` |
| Indexes | `idx_<table>_<col>` | `idx_points_session` |
| FTS tables | `<table>_fts` | `points_fts` |

- Primary keys: TEXT UUID generated in Rust (`uuid::Uuid::new_v4().to_string()`)
- Timestamps: TEXT in ISO 8601 (`chrono::Utc::now().to_rfc3339()`)
- Booleans: INTEGER (0/1)
- JSON arrays: TEXT serialized with `serde_json`

## Common Mistakes

- ❌ Storing API keys in the DB — use `tauri-plugin-store` (encrypted) instead
- ❌ Forgetting to update `points_fts` triggers when altering the `points` table
- ❌ Using `i64` for UUIDs — always TEXT
