# Review Queue Planner v2

## Goal

继续第 5 轮从 `炼化/` 吸收的能力：把 Review Queue 从“到期 item 列表”升级成“可解释计划”。用户进入 Library -> Review 时，可以看到今日计划、候选数量、overdue/overflow/future 统计，以及为什么某些 item 被排入本轮。

## What I Already Know

* 前 4 轮已完成 AI Invocation Audit、Persisted Report Claims/Citations、Open Data Mirror v2、Citation Jump/Highlight UI。
* `炼化/` 研究把 Review Queue Planner v2 列为高收益切片，借鉴 Foliole 的 queue planner、Memos 的轻量 filter、Joplin 的可诊断状态变化。
* 当前 Thepoint 已有 `review_items`、priority、due_at、complete/snooze/dismiss 和 again/hard/good/easy 简单间隔。
* 当前 `list_due_review_items` 只是 due 列表，没有 plan stats；SQL 的 `priority DESC` 对 `low/normal/high` 字符串不是可靠优先级排序。
* 当前 Library Review 页直接展示所有 review items，没有“本轮计划”摘要。

## Requirements

* 新增后端命令 `build_review_queue_plan(input)`。
* MVP 不改 schema，不新增 review session 表，不迁移已有数据。
* planner 从当前 `review_items` 读取 active/dismissed/future/due 状态并返回可解释统计。
* planner 输入支持 `limit` 和 `mode`；MVP 支持 `due` 和 `catchup`，非法/空值回退到 `due`。
* planner 必须使用显式 priority rank：`high > normal > low`，不能依赖字符串排序。
* planner 返回排入本轮的 items、overflow count、candidate/due/overdue/future/dismissed 统计和每个计划项的 reason。
* Frontend 通过 typed API wrapper 调用 planner；不得直接 invoke。
* Library -> Review 显示 plan summary 和计划项，完成/snooze/dismiss 后刷新 plan。

## Acceptance Criteria

* [x] `build_review_queue_plan` 返回 `ReviewQueuePlan`，包括 stats、items 和 reasons。
* [x] high priority due item 在相同条件下排在 normal/low 之前。
* [x] limit 小于 due 候选数量时，`overflowCount` 正确。
* [x] future active items 不进入 due plan，但计入 `futureCount`。
* [x] dismissed items 不进入 due plan，但计入 `dismissedCount`。
* [x] Library Review 页显示本轮计划摘要和计划项。
* [x] Frontend API map/wrapper/fallback 全部更新，boundary check 通过。
* [x] Rust tests、frontend typecheck/boundary/tests/build 全部通过。

## Definition of Done

* Tests added/updated where deterministic.
* `cargo check --manifest-path src-tauri/Cargo.toml`
* `cargo test --manifest-path src-tauri/Cargo.toml`
* `npm run typecheck`
* `npm run check:boundaries`
* `npm run test:run`
* `npm run build`
* Spec/docs updated if a new backend/frontend command contract is introduced.
* Task code changes committed separately from archive/journal bookkeeping.

## Technical Approach

* Add DB DTOs: `ReviewQueuePlanInput`, `ReviewQueuePlan`, `ReviewQueuePlanItem`.
* Add DB helper `build_review_queue_plan(conn, input)` and pure-ish planner helper for deterministic tests.
* Add Tauri command in `commands/library.rs`, register in `src-tauri/src/lib.rs`.
* Add frontend types, command map, browser fallback, and wrapper.
* Update Library Review mode to load plan alongside all review items and refresh it after mutations.
* Keep plan read-only: no DB writes during plan generation.

## Decision (ADR-lite)

**Context**: The full research proposal included available_at/source_kind/source_id/scheduler_state and session records. That is useful long-term but too broad for a fifth feature round.

**Decision**: MVP is plan-first and schema-free. It fixes sorting/stat visibility and provides an explicit planner command/UI without changing review scheduling persistence.

**Consequences**: Users get immediate queue clarity. Future slices can add session records and richer scheduler state without breaking the planner payload.

## Out of Scope

* No `available_at`, `source_kind`, `source_id`, or scheduler JSON columns.
* No `review_sessions` / `review_session_items` tables.
* No spaced-repetition algorithm replacement beyond current simple intervals.
* No AI-generated review prioritization.
* No RAG, Agent, plugin/MCP, sync, sidecar, or background job.

## Technical Notes

* Prior research source: `.trellis/tasks/archive/2026-07/07-06-further-oss-feature-refinement/research/further-feature-refinement.md`, section "Review Queue Planner v2".
* Relevant backend files: `src-tauri/src/db/mod.rs`, `src-tauri/src/commands/library.rs`, `src-tauri/src/lib.rs`.
* Relevant frontend files: `frontend/src/api/types.ts`, `frontend/src/api/commandMap.ts`, `frontend/src/api/index.ts`, `frontend/src/api/invoke.ts`, `frontend/src/pages/Library.tsx`.
* Existing unrelated dirty files must not be staged: `src-tauri/src/commands/gallery.rs`, `炼化/`.
