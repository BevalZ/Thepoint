# AI Invocation Audit And Context Manifest

## Goal

实现下一批从 `炼化/` 中最值得吸收的功能：AI Invocation Audit + Investigation Context Manifest。目标是让每次 Investigation 生成都能追溯模型、prompt version、输入范围、上下文材料、裁剪状态、warnings，并在保存 Report 后能从 ReportModal 回看生成上下文。

## What I Already Know

- 上一轮已完整分析 `炼化/` 下 AFFiNE、anything-llm、AppFlowy、foam、foliole、joplin、khoj、kotaemon、logseq、marginalia、memos、quivr、silverbullet、siyuan、Zettlr、zotero。
- 上一轮已实现 Indexed Folder descriptor/preview cache 和 Report citation audit。
- 当前 Thepoint 已有 Investigation、Journal、Related Assets、Review Queue、Open Data Mirror、Indexed Folders。
- 当前 Mirror 仍是 v1 manifest，缺少 export plan、prune plan、per-asset hash/path/error 明细。
- 当前 Review Queue 有简单 due/rating/priority，但缺少 queue plan、available_at、候选统计、同来源分散、session record。
- 当前 workspace search 主要覆盖 Source/Point，Evidence/Report/Journal/Gallery/Indexed File 的统一搜索与 filter DSL 仍未形成。
- 当前 Related Assets 已有自动关系 rebuild，但规则散落在函数里，还不是可解释、可配置、可测试的 rule registry。
- 当前 Investigation 能拼装上下文并调用模型，但没有 durable `ai_invocations`、context manifest、prompt version、token/warning audit。
- 用户确认采用推荐路线，从 AI Invocation Audit 开始。

## Requirements

- 新增本地 SQLite audit 表，记录 AI invocation 和 Investigation context items。
- `generate_investigation` 生成时保存 invocation record，并返回 `invocationId`。
- context item 要区分 `source`、`point`、`evidence`、`prior_report`、`journal_recall`、`related_clue` 等 role。
- context item 要记录 label、included、truncated、reason、char_count、source_text_hash。
- 保存由 Investigation 生成的 Report 时，如果前端传入 `invocationId`，后端把 invocation 关联到 report。
- ReportModal 加载并展示与该 Report 关联的 invocation/context manifest。
- 旧报告没有 invocation 时必须正常打开。
- 不引入 sidecar、HTTP API、vector DB、Agent runtime、MCP、同步或插件系统。

## Acceptance Criteria

- [x] `ai_invocations` 和 `investigation_context_items` 由 `db::init_db` 幂等创建。
- [x] 生成 Investigation 后返回的 `DigestResult.invocationId` 非空。
- [x] 保存 Report 时可以传入 `invocationId`，并把 invocation 的 `output_ref_kind/output_ref_id` 更新为 `report/<id>`。
- [x] `load_report_invocation_audit(report_id)` 能返回 invocation + context items。
- [x] ReportModal 对有 invocation 的报告显示模型、prompt version、上下文数量、included/truncated 统计和上下文清单。
- [x] Browser fallback 对 audit 返回 `null`，不伪造结果。
- [x] Rust tests 覆盖 invocation/context persistence 和 report 关联。
- [x] Frontend typecheck、boundary check 通过；backend check/test 通过。

## Definition of Done

- Tests added/updated where deterministic.
- Lint/typecheck/build quality gates run where applicable.
- Docs/spec updated if a new durable contract is introduced.
- Trellis task archived after commits.

## Technical Notes

- 上一轮归档研究路径：`.trellis/tasks/archive/2026-07/07-06-high-star-oss-references/research/`
- 关键输入：
  - `borrowable-feature-catalog.md`
  - `thepoint-second-stage-plan.md`
  - `implementation-audit.md`
  - `docs/research-workspace.md`
- 当前代码核对：
  - `src-tauri/src/commands/library.rs` 已有 Mirror export、Review commands、Citation Audit、Indexed Folder scanner。
  - `src-tauri/src/db/mod.rs` 已有 `journal_entries`、`asset_relations`、`review_items`、`open_data_mirror_config`、`indexed_files`。
  - `src-tauri/src/commands/digest.rs` 已有 Investigation context collection，但缺少持久 invocation/context manifest。

## Out of Scope

- 本轮不实现 persisted `report_claims` / `report_citations`。
- 不做 RAG、Agent、插件、MCP、同步。
- 不重新完整阅读 16 个参考项目代码；使用上一轮已归档的完整代码检视成果和当前 Thepoint 代码核对。
- 不引入 RAG、Agent、插件、同步等重型能力，除非作为后续路线说明。
