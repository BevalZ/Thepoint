# Unified Search Filter Preview

## Goal

继续从 `炼化/` 吸收高收益能力：把当前 Library 中分散的 Source/Point/Evidence/Report/Journal/Gallery/Indexed File 搜索收敛成一个统一的 typed backend command 和统一结果模型。MVP 目标是“一个搜索入口 + 白名单 filter + preview/reason”，先提升日常检索效率，同时为后续 Related diagnostics、command palette、RAG/agent 只读工具打基础。

## Recommendation Rationale

上一轮完成 Review Queue Planner v2 后，Thepoint 的本地资产类型已经明显增多：Sources、Points、Evidence、Reports/Investigations、Journal、Gallery、Indexed Files、Review items。继续堆单点功能会让入口越来越散。Unified Search 是下一步最适合的连接层：

* 用户每天都能直接受益。
* 可以复用现有搜索 helpers，不需要 schema/migration。
* 可测试、可渐进替换当前 Library 搜索。
* 后续 Filter DSL、Related Rule Diagnostics、Command Palette、只读 Agent tools 都会依赖这个统一入口。

## Requirements

* 新增后端命令 `search_assets(input)`。
* 新增 typed frontend API wrapper `searchAssets(input)`；UI 不得直接 invoke。
* 新增统一结果 DTO `SearchAssetResult`，至少包含 `kind`、`id`、`title`、`snippet`、`preview`、`reason`、`score`、`sourceId`、`chunkIndex`、`metadataJson`。
* MVP 搜索覆盖：
  * Source / Point：复用 workspace search。
  * Evidence：复用 evidence search。
  * Report / Investigation：复用 report search，kind 保留 report，metadata 标记 reportKind。
  * Journal：复用 journal search。
  * Gallery：复用 gallery search。
  * Indexed File：搜索 indexed file name/path/preview/metadata。
* `SearchAssetsInput` 支持：
  * `query: string`
  * `kinds?: string[] | null`
  * `filter?: string | null`
  * `limit?: number | null`
* 空 query 返回空数组。
* `limit` 默认 40，范围 clamp 到 1..100。
* `kinds` 是白名单过滤；未知 kind 忽略或不返回结果，不报 SQL 错。
* `filter` MVP 只支持白名单等值语法：
  * `kind == "source"`
  * `kind == "point"`
  * `kind == "evidence"`
  * `kind == "report"`
  * `kind == "journal"`
  * `kind == "gallery"`
  * `kind == "indexed_file"`
  * `reportKind == "investigation"`
  * `sourceKind == "indexed_folder"`
* 非法 filter 返回清晰错误，不拼接任意 SQL。
* Library 默认 `points` 模式搜索改用 `searchAssets`，并渲染统一分组结果；Evidence/Reports/Journal/Gallery 专用 tab 可以暂时保留原有 scoped 搜索。
* Browser preview fallback 返回空数组。

## Acceptance Criteria

* [ ] `search_assets` 注册到 Tauri command 并通过 `spawn_blocking` 执行 DB 工作。
* [ ] Frontend `types.ts`、`commandMap.ts`、`index.ts`、`invoke.ts` 全部更新。
* [ ] Library 默认搜索使用 `searchAssets`，结果按 kind 分组展示。
* [ ] `kind == "report"` 只返回 report 类结果。
* [ ] `reportKind == "investigation"` 只返回 Investigation report。
* [ ] `sourceKind == "indexed_folder"` 可返回 indexed file 结果。
* [ ] 空 query 返回空数组。
* [ ] 非法 filter 返回错误，不执行任意 SQL。
* [ ] Rust tests 覆盖 filter parser、kind filtering、indexed file result。
* [ ] Frontend typecheck/boundary/test/build 通过。

## Definition of Done

* Backend and frontend checks pass:
  * `cargo check --manifest-path src-tauri/Cargo.toml`
  * `cargo test --manifest-path src-tauri/Cargo.toml`
  * `npm run typecheck`
  * `npm run check:boundaries`
  * `npm run test:run`
  * `npm run build`
* Spec/docs updated because this adds a cross-layer command contract.
* Work commits are separate from task archive/journal commits.
* Existing unrelated dirty files are not staged:
  * `src-tauri/src/commands/digest.rs`
  * `src-tauri/src/commands/gallery.rs`
  * `炼化/`

## Technical Approach

* Add DB DTOs and helper in `src-tauri/src/db/mod.rs`.
* Build an internal safe filter parser that only accepts a narrow whitelist.
* Reuse existing DB search helpers where practical and map results into `SearchAssetResult`.
* Add indexed file search helper against existing indexed file columns.
* Add command in `src-tauri/src/commands/library.rs`, register in `src-tauri/src/lib.rs`.
* Add frontend API types/wrapper/fallback.
* Update `Library.tsx` default search path to use the unified result stream while leaving scoped tabs mostly untouched for this slice.

## Out of Scope

* No FTS/schema migration for unified search.
* No arbitrary SQL-like DSL.
* No semantic/vector search.
* No RAG/agent runtime.
* No replacement of every scoped Library search tab in this slice.
* No background indexing changes.
* No editing or committing unrelated dirty files.

