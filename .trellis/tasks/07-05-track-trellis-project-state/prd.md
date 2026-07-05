# Track Trellis project state

## Goal

Align git ignore rules with Trellis' project-managed state so task archives and workspace journals can be committed normally instead of failing because the whole `.trellis/` directory is ignored.

## What I already know

* Root `.gitignore` currently ignores `.trellis/`.
* Trellis archive and journal commands have repeatedly warned that they cannot auto-commit because `.trellis/` is ignored.
* `.agents/` and `.codex/` Trellis platform integration files are already tracked.
* `.trellis/.gitignore` already ignores local-only developer/runtime files such as `.developer`, `.runtime/`, temporary files, and Python caches.
* Trellis warning recommends replacing broad `.trellis/` ignore with specific runtime/cache/backup ignores.

## Requirements

* Stop ignoring the entire `.trellis/` directory at the root.
* Keep local-only Trellis runtime/cache/backup files ignored.
* Ensure normal `git add .trellis` does not include runtime sessions, pycache, backup, cache, worktree, or template hash state.
* Do not use `git add -f .trellis/`.
* Do not change product code.

## Acceptance Criteria

* [ ] `git check-ignore` no longer reports `.trellis/config.yaml`, `.trellis/spec/...`, `.trellis/tasks/...`, or `.trellis/workspace/...` as ignored.
* [ ] `git check-ignore` still reports `.trellis/.runtime/...`, `.trellis/.template-hashes.json`, backup/cache/worktree paths, and Python cache files as ignored.
* [ ] Trellis project files can be staged without force-adding.
* [ ] Working tree changes are limited to ignore rules plus newly visible Trellis project state.

## Definition of Done

* Git ignore changes and Trellis project state committed.
* Current task archived and session journal recorded.
* No runtime/cache files committed.

## Technical Approach

* Replace root `.gitignore` entry `.trellis/` with explicit local-only Trellis ignore patterns.
* Extend `.trellis/.gitignore` to cover `.template-hashes.json`, `.cache/`, `worktrees/`, and `target/`-style generated state if present.
* Use normal `git add` to stage `.trellis/` after verifying ignore behavior.

## Out of Scope

* Changing Trellis workflow semantics.
* Editing Trellis scripts.
* Disabling `session_auto_commit`.
* Cleaning or rewriting historical task archives/journals.

## Technical Notes

Relevant files:

* `.gitignore`
* `.trellis/.gitignore`
* `.trellis/config.yaml`
* `.trellis/tasks/`
* `.trellis/workspace/`
* `.trellis/spec/`
