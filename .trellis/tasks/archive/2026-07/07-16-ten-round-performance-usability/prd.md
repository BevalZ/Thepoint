# Ten Rounds of Performance and Usability Hardening

## Goal

Run ten evidence-based improvement rounds across the desktop application to reduce runtime resource consumption, improve animation and interaction responsiveness, and verify that important workflows remain usable. Each round must identify a concrete issue, make a scoped improvement when justified, and record proportional verification rather than counting inspection-only activity as optimization.

## What I Already Know

* The application is a React 18/Vite frontend inside a Tauri/Rust desktop shell.
* A previous performance task already reduced idle polling, hidden-page work, motion overhead, and repeated backend initialization; this task must find additional measurable opportunities rather than repeating those edits.
* Explore must remain mounted so analysis, investigation, fact checking, and translation continue across navigation.
* The working tree contains pre-existing content chunking, reanalysis, investigation, and formatting changes. They must be preserved and must not be silently mixed into unrelated commits.
* The user requested ten rounds of performance optimization and functional usability checks, followed by complete verification and a GitHub push after all work is finished.

## Assumptions

* Preserve current product behavior unless a workflow is demonstrably broken or unnecessarily expensive.
* Prefer removing repeated work, reducing render/effect churn, bounding concurrency and payloads, and improving perceived latency over adding dependencies.
* Use deterministic code/tests and browser or desktop acceptance evidence where practical; avoid synthetic micro-optimizations with no user-visible or resource benefit.

## Requirements

* Complete exactly ten documented rounds, each with: observed problem, evidence, scoped change or explicit no-change conclusion, verification, and result.
* Cover both performance/resource usage and functional usability; neither category may be represented only by static review.
* Audit idle/background behavior, navigation persistence, Explore rendering, long-running workflows, backend blocking work, database access, network concurrency, and failure/retry states.
* Preserve source text, anchors, saved assets, translations, and in-progress Explore workflows.
* Add focused regression tests for every behavioral fix and for performance contracts that can be expressed deterministically.
* Keep unrelated pre-existing working-tree changes intact and use precise staging for any overlapping files.
* Run the complete frontend and Rust quality gates after round ten.
* Inspect branch, remote, final diff, and commit history before pushing the completed work to GitHub.
* Execute the ten rounds defined in `research/round-plan.md`; changing a round target requires recording why the replacement has higher evidence and equivalent scope.

## Acceptance Criteria

* [ ] Ten round records exist and every round has a concrete finding and verification result.
* [ ] At least four rounds produce a defensible reduction in repeated CPU work, rendering, I/O, allocation, or network pressure.
* [ ] At least four rounds exercise and improve or confirm a user-facing workflow, including navigation persistence and failure recovery.
* [ ] No Explore long-running workflow is cancelled merely because the user changes pages.
* [ ] No new unbounded polling, timers, listeners, queues, database scans, payloads, or concurrent requests are introduced.
* [ ] Frontend typecheck, boundary check, command registry check, tests, and production build pass.
* [ ] Rust check and tests pass.
* [ ] The final commits contain only reviewed task changes; unrelated WIP remains preserved.
* [ ] The verified final branch is pushed to the configured GitHub remote.

## Definition of Done

* Ten rounds are implemented or closed with evidence and recorded in task artifacts.
* Focused tests cover changed behavior and prevent the same regression class.
* Full frontend and backend gates pass from the exact staged/committed tree.
* Performance and state-management contracts are added to project specs when new reusable knowledge emerges.
* Work commits, task archive, journal entry, and authorized GitHub push are complete.

## Decision (ADR-lite)

**Context**: A fixed number of optimization rounds can encourage cosmetic edits or repeated broad refactors that increase risk.

**Decision**: Use an evidence-first audit loop. A round starts with a named hypothesis and baseline evidence, then makes the smallest justified change, adds deterministic protection where possible, and records the result. A valid no-change conclusion is allowed only when the audit evidence is retained and another concrete issue is selected for the round's implementation target.

**Consequences**: The work remains reviewable and avoids optimization theater, but requires explicit measurement artifacts and precise commits in a dirty worktree.

## Out of Scope

* Replacing React, Tauri, SQLite, Zustand, or the existing AI provider architecture.
* Visual redesign unrelated to responsiveness or workflow usability.
* Removing navigation persistence for Explore to reduce memory.
* Destructive cleanup or automatic inclusion of pre-existing unrelated changes.
* Claims about power, CPU, or memory improvement without code-path evidence or reproducible measurement.

## Technical Notes

* Likely frontend areas: `frontend/src/pages/Explore.tsx`, application navigation/mounting, Zustand stores, API wrappers, hooks, animation primitives, and large-list rendering.
* Likely backend areas: Tauri commands, database initialization/query paths, network request limits, parsing/chunking, and async blocking boundaries.
* Round records will live under this task directory and should cite commands, tests, traces, or code-path evidence.
* Existing uncommitted work must be inventoried before implementation and treated as an explicit baseline.
* Baseline evidence: [`research/baseline-audit.md`](research/baseline-audit.md).
* Round sequence and verification contract: [`research/round-plan.md`](research/round-plan.md).
