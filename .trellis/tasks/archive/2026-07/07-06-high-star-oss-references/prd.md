# High-Star OSS References For Thepoint

## Goal

Research high-star open-source projects on GitHub that overlap with Thepoint's local-first research, knowledge workbench, citation, review, note/library, and AI retrieval workflows. Clone the most relevant repositories into `炼化/`, inspect their product and architecture patterns, then produce a second-stage development plan for Thepoint.

Follow-up implementation goal, approved by the user after the research phase:

Use the persisted research results under this task's `research/` directory to make targeted Thepoint product improvements, implement the highest-value immediate slices, run repeated confirmation and testing loops, and stop only after the current implementation state and remaining follow-up scope are explicitly documented.

## What I Already Know

- Thepoint is a Tauri + Rust + SQLite + React local-first knowledge workbench.
- Thepoint already has Source / Point / Evidence / Report / Gallery plus recent Investigation / Journal / Related / Review / Mirror / Indexed Folder work.
- Existing references under `炼化/` are `foliole/` and `marginalia/`.
- User asked to clone similar high-star GitHub projects into `炼化/`.
- If clone/download fails, retry with proxy `http://127.0.0.1:7890`.

## Assumptions

- "High-star" means projects with meaningful GitHub traction, roughly 10k+ stars when available, but relevance can outweigh raw stars.
- The initial output was a planning/research deliverable. The follow-up scope now includes implementation because the user explicitly requested product改造 based on the research directory.
- Clones should be shallow (`--depth 1`) to reduce disk/network cost.
- Implementation should prioritize the research plan's immediate, low-architecture-risk slices before later-stage RAG/Agent/plugin/sync work.
- The first implementation batch should focus on foundations that unlock later work: Indexed Folder descriptor/preview reliability and Citation locator/audit support.

## Requirements

### Research Requirements

- Identify comparable GitHub projects with current star counts and source URLs.
- Prefer projects relevant to local-first notes, knowledge base, AI search/RAG, research/citation, review, and export workflows.
- Clone selected repos into `炼化/`, preserving existing `foliole/` and `marginalia/`.
- Inspect each cloned project enough to extract reusable product/architecture ideas.
- Analyze every project currently present under `炼化/`, including projects analyzed earlier.
- Base the analysis on code-level inspection, not README-only summaries.
- Cover product features, architecture/framework choices, data models, sync/storage/indexing patterns, AI/RAG patterns, plugin/extensibility approaches, UI/UX flows, testing/tooling, and methodology/process ideas.
- For each project, list concrete functions, advantages, implementation patterns, and borrowable ideas that could be added to Thepoint.
- Produce a plan for Thepoint that separates:
  - immediately useful features,
  - later-stage features,
  - unsuitable features.

### Implementation Requirements

- Use `research/thepoint-second-stage-plan.md` and `research/borrowable-feature-catalog.md` as the implementation source of truth.
- Preserve Thepoint's current Tauri 2 + Rust + SQLite + React typed-command architecture.
- Do not introduce sidecars, HTTP app-internal APIs, MCP, external vector databases, plugin runtimes, LAN sync, or GraphRAG in this implementation batch.
- Implement the first targeted batch:
  - Indexed Folder descriptor and preview cache reliability.
  - Citation quote locator and report citation audit support.
- Keep all frontend calls behind `frontend/src/api/`.
- Add or update tests close to the owning modules.
- Perform at least three confirmation/testing loops:
  - loop 1: confirm implementation slice and run baseline checks before edits,
  - loop 2: validate Indexed Folder descriptor behavior after implementation,
  - loop 3: validate Citation locator/audit behavior after implementation.
- Persist an implementation audit under this task directory summarizing what was implemented, test commands/results, remaining roadmap items, and any deliberate deferrals.

## Acceptance Criteria

### Research Acceptance Criteria

- [ ] Research artifact lists selected repositories with GitHub URL, star count, primary domain, and why it matters.
- [ ] Selected repositories are cloned under `炼化/` or documented as skipped with reason.
- [ ] Research notes cover all projects present under `炼化/`.
- [ ] Research notes document the code-inspection method and core files/directories inspected per project.
- [ ] Research notes summarize transferable features, architecture patterns, implementation details, and constraints for Thepoint.
- [ ] A second-stage development plan exists with phased implementation slices, acceptance criteria, and out-of-scope decisions.

### Implementation Acceptance Criteria

- [ ] Indexed Folder records expose descriptor/read/index state, metadata, and preview/cache details needed for reliable external-file workflows.
- [ ] Indexed Folder scan behavior records missing/unsupported/unreadable files without mutating user-owned folders.
- [ ] Citation quote locator can return located, multiple match, not found, stale, target missing, and not-applicable style outcomes.
- [ ] Report citation audit can inspect saved report citations and return coverage counts plus per-citation locator status.
- [ ] Rust command registration, frontend command map, and API wrappers are updated together.
- [ ] Tests cover new DB/helper behavior and command/API contracts.
- [ ] At least three confirmation/testing loops are recorded in task research or implementation notes.
- [ ] No unrelated product files are modified beyond the targeted implementation scope.

## Definition Of Done

- Research notes are persisted under this task directory.
- The final plan is persisted under this task directory.
- Git clone failures, proxy retries, and skipped repositories are documented.
- Targeted implementation changes are persisted in product code.
- Required backend and frontend checks have been run, with results recorded.
- User receives a concise summary of implemented changes, tests, and remaining recommended phases.

## Out Of Scope

- Importing large binary datasets, model weights, or generated build artifacts.
- Implementing later-stage RAG, Agent, plugin runtime, MCP, sidecar HTTP server, LAN/mobile sync, cloud sync, or full block-editor rewrites in this implementation batch.
- Replacing Thepoint's current Tauri command boundary or SQLite persistence model.

## Technical Notes

- Use current GitHub data, not remembered star counts.
- Use shallow clones where possible.
- Keep `炼化/foliole` and `炼化/marginalia` intact.
