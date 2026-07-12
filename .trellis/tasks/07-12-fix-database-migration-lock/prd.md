# Fix Concurrent Database Migration Lock

## Goal

Prevent application startup and normal concurrent command reads from failing with `database integrity check failed before migration ... database is locked`.

## Requirements

* Check `PRAGMA user_version` before running expensive migration-only integrity validation.
* Serialize the process-local migration check, schema initialization, and version write so concurrent startup commands cannot race.
* Preserve validated pre-migration backups for databases whose version actually requires migration.
* Add regression coverage for already-current databases and concurrent `open_db` calls.
* Do not alter or delete existing user knowledge data.

## Acceptance Criteria

* [x] An already-current database skips pre-migration `integrity_check`.
* [x] Multiple concurrent `open_db` calls succeed without schema/FTS lock errors.
* [x] Version-zero databases still receive integrity validation and a validated backup before migration.
* [x] Existing backend and frontend quality gates pass.

## Definition of Done

* Regression tests reproduce the old ordering/race and pass with the fix.
* Desktop app restarts without the reported error.
* Changes are committed, archived, and journaled without including unrelated dirty files.

## Technical Approach

Add a process-local `OnceLock<Mutex<()>>` around the `open_db` initialization phase. In `prepare_schema_migration_backup`, query `user_version` first and return immediately for current schemas; run integrity validation and backup only when migration is needed.

## Out of Scope

* Replacing the inline migration architecture.
* Changing FTS schemas or rebuilding user search indexes.
* Editing unrelated `digest.rs`, `gallery.rs`, `library.rs`, or `炼化/` work.
