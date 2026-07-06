# Persisted Report Claims/Citations

## Goal

继续从 `炼化/` 中吸收可靠性能力：把 Report 的 claims/citations 从“只存在于 Markdown 与 `citations_json` 的运行时审计”推进到“保存时落库、可重复读取、可复查”的 durable audit layer。用户保存 Report 后，ReportModal 能看到持久化的 citation rows、claim shells、coverage summary，为后续真正的 claim coverage gate、RAG/Agent 可信闭环打基础。

## What I Already Know

- 已实现 Report archive、Report citation locator/audit、AI Invocation Audit + Context Manifest。
- 当前 `load_report_citation_audit` 仍从 `reports.citations_json` 动态计算，不持久保存 citation span/hash/status。
- 当前没有 `report_claims`，无法持久区分 cited/inferred/unsupported claim。
- 上一轮研究建议第 2 个切片是 `Persisted Report Claims/Citations + Save-time Coverage Gate`。
- 本轮应避免引入 RAG、Agent、MCP、插件、同步、sidecar 或 HTTP API。

## Requirements

- 新增 SQLite 表 `report_citations`，保存每条 Report citation 的 target、label、quote/excerpt、reason、source hash、span、locator status。
- 新增 SQLite 表 `report_claims`，保存从 Report 正文确定性抽取的 claim shells。
- 保存 Report 时自动生成并持久化 citation rows 和 claim shells。
- claim extraction MVP 采用确定性文本规则：从 Markdown 段落、列表项、heading 下正文提取候选 claim；含 citation label 的 claim 标记为 `cited`，没有 label 但有实质内容标记为 `inferred`。
- 不在本轮让模型输出结构化 claims，不做强制阻断式保存 gate；先提供 `coverage` summary 和 warning，为后续 gate 做准备。
- 新增命令加载持久 report audit：claims、citations、coverage summary。
- ReportModal 显示持久 claims/citations audit；旧 Report 没有持久 rows 时能 fallback 到现有 computed citation audit 或空 claim state。
- Browser fallback 返回 `null`，不伪造 audit。

## Acceptance Criteria

- [x] `report_claims` 和 `report_citations` 由 `db::init_db` 幂等创建。
- [x] `save_report` 保存新报告时写入 `report_citations` rows。
- [x] `save_report` 保存新报告时写入 `report_claims` rows。
- [x] `load_report_audit(report_id)` 能返回 claims、citations 和 coverage summary。
- [x] ReportModal 显示 claim/citation 持久审计摘要。
- [x] 旧报告没有持久 audit 时仍能打开，且 citation audit 继续可用。
- [x] Rust tests 覆盖 citation persistence、claim shell extraction、report audit summary。
- [x] Frontend typecheck、boundary check 通过；backend check/test 通过。

## Technical Approach

- DB layer owns durable records and deterministic extraction helpers.
- Command layer reuses existing citation locator behavior where possible, then persists locator-derived rows after report save.
- Frontend adds typed DTOs and `loadReportAudit` wrapper.
- ReportModal loads both existing computed citation audit and new persisted report audit. Persisted audit is additive, not a replacement yet.

## Decision (ADR-lite)

**Context**: Strict claim extraction from natural language reports can become a second AI workflow and force schema/prompt coupling too early.

**Decision**: MVP uses deterministic claim shell extraction and persists citation locator rows. It surfaces coverage summary but does not block save.

**Consequences**: Users get durable, inspectable audit immediately. Some `inferred` claims may be conservative/noisy until a later structured-output claim extraction slice.

## Out of Scope

- No model-based claim extraction in this task.
- No hard save blocking when unsupported/inferred claims exist.
- No persisted `report_claims` editing UI.
- No vector search, RAG, agent runtime, plugin/MCP, sync, or sidecar.
- No migration framework; keep inline idempotent SQLite schema in `db::init_db`.

## Technical Notes

- Prior research: `.trellis/tasks/archive/2026-07/07-06-further-oss-feature-refinement/research/further-feature-refinement.md`.
- Relevant existing code:
  - `src-tauri/src/db/mod.rs`
  - `src-tauri/src/commands/library.rs`
  - `frontend/src/api/*`
  - `frontend/src/components/ReportModal.tsx`
  - `frontend/src/lib/reportArtifacts.ts`

## Definition of Done

- Tests added/updated where deterministic.
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm run typecheck`
- `npm run check:boundaries`
- `npm run test:run`
- `npm run build`
- Spec/docs updated if durable contract changes.
