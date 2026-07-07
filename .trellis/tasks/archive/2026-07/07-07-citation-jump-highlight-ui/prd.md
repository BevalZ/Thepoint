# Citation Jump/Highlight UI

## Goal

继续第 4 轮从 `炼化/` 吸收的能力：把已实现的 Report citation locator/span 审计推进到可操作的复核体验。用户在 ReportModal 里看到 located/multiple_matches 的 Source citation 时，可以跳回 Source Workspace 的对应 chunk，并短暂高亮 quote/snippet，减少人工查找原文的成本。

## What I Already Know

* 前 3 轮已完成 AI Invocation Audit、Persisted Report Claims/Citations、Open Data Mirror v2。
* 上一轮 `炼化/` 研究把 Citation Jump/Highlight UI 列为低风险 UI 成果，来源包括 Zotero reader、Kotaemon source citation、Zettlr 文档上下文联动。
* 当前 `load_report_citation_audit` 和 persisted audit 已能提供 citation status、locations、quote/excerpt、source/chunk metadata。
* 当前 ReportModal 已显示 citation audit，但用户仍需要自己在 Source Workspace 找 quote。
* 当前 `App.tsx` 已把 `onOpenSource(sourceId, chunkIndex)` 传给 ReportModal，用来打开 Source/Chunk。

## Requirements

* 扩展 source navigation payload，使 ReportModal 可以传递可选 highlight quote/snippet 和 citation label。
* ReportModal 对 `located` citation 显示“打开并高亮”动作。
* ReportModal 对 `multiple_matches` citation 允许用户选择具体 match，再打开并高亮该 match/snippet。
* Explore/Source Workspace 接收一次性 highlight 请求，打开目标 Source/chunk 后滚动到 Source 内容区并短暂高亮匹配文本。
* 高亮不改变 Source 文本，不写数据库，不依赖后端新命令。
* `stale`、`not_found`、`target_missing`、`not_applicable` 不执行高亮跳转，只保留现有诊断信息。
* Browser fallback 和旧报告缺少 locator 的场景必须正常显示。

## Acceptance Criteria

* [x] ReportModal 的 located Source citation 能调用 `onOpenSource(sourceId, chunkIndex, highlight)`。
* [x] multiple_matches 能选择具体 location 并用该 location 的 snippet/offset 作为 highlight 线索。
* [x] Explore 接收到 highlight 后能在 Source 内容中渲染 `<mark>` 高亮片段，并在短时间后自动清除。
* [x] highlight quote 不存在于当前 Source 内容时，Source 仍正常打开，不抛错。
* [x] TypeScript 类型、API 边界、Vitest、生产构建通过。
* [x] 后端未增加新命令或 schema 时，Rust check/test 仍通过。

## Definition of Done

* Tests added/updated for deterministic highlight helper behavior.
* `cargo check --manifest-path src-tauri/Cargo.toml`
* `cargo test --manifest-path src-tauri/Cargo.toml`
* `npm run typecheck`
* `npm run check:boundaries`
* `npm run test:run`
* `npm run build`
* Docs/spec updated if a new frontend navigation contract is worth preserving.
* Task code changes committed separately from archive/journal bookkeeping.

## Technical Approach

Use a narrow frontend-only contract:

* Define a `SourceHighlightRequest` type near the owning page/app boundary.
* Extend `onOpenSource` from `(sourceId, chunkIndex)` to `(sourceId, chunkIndex, highlight?)`.
* ReportModal derives highlight payload from citation locator/audit data without direct Tauri calls.
* Explore stores the pending highlight in page state, passes it to the Source content renderer, scrolls the content region into view, and clears it after a timeout.
* Add a small helper that safely splits source text into pre/match/post segments for rendering; test exact match, missing match, and repeated text with offset hints.

## Decision (ADR-lite)

**Context**: Source citation locator already computes match spans, but the UI only reports that a match exists. A full cross-asset deep-link system for Source/Point/Evidence would require broader routing and card selection work.

**Decision**: MVP implements Source citation jump/highlight only, using existing Source open flow plus a one-time highlight payload. Point/Evidence deep-linking remains out of scope.

**Consequences**: Users get immediate citation复核 value without backend/schema work. The highlight helper becomes a reusable base for future Point/Evidence or unified asset jump behavior.

## Out of Scope

* No new SQLite tables, migrations, or Tauri commands.
* No Point/Evidence card deep-linking in this slice.
* No persistent annotation/highlight storage.
* No PDF/image/OCR coordinate mapping.
* No RAG, Agent, plugin/MCP, sidecar, sync, or external viewer integration.

## Technical Notes

* Prior research source: `.trellis/tasks/archive/2026-07/07-06-further-oss-feature-refinement/research/further-feature-refinement.md`, section "Citation Jump/Highlight UI".
* Relevant frontend files: `frontend/src/App.tsx`, `frontend/src/pages/Explore.tsx`, `frontend/src/components/ReportModal.tsx`, `frontend/src/api/types.ts`, `frontend/src/lib/reportArtifacts.ts`.
* Relevant backend files for verification only: `src-tauri/src/commands/library.rs`, `src-tauri/src/db/mod.rs`.
* Existing unrelated dirty files must not be staged: `src-tauri/src/commands/gallery.rs`, `炼化/`.
