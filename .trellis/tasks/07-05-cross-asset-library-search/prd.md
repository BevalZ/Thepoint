# Cross Asset Library Search

## Goal

让知识库默认搜索成为跨资产入口：用户在「观点」模式输入关键词时，可以一次看到匹配的 Source、Point、Evidence 和 Report，而不是需要分别切换到 Evidence 或 Reports 标签页再次搜索。

## What I Already Know

* `frontend/src/pages/Library.tsx` 已经有三种模式：`points`、`evidence`、`reports`。
* 默认 `points` 搜索当前并行调用 `searchWorkspace(query)` 和 `searchEvidence(query)`，其中 `searchWorkspace` 返回 Source/Point，Evidence 单独返回。
* Report 搜索 API 已存在：`searchReports(query)`，Report 列表、打开 `ReportModal`、删除 `deleteReport` 已在 Reports 标签页实现。
* 前端 API 入口已集中在 `frontend/src/api/index.ts`，UI 不应直接调用 Tauri `invoke`。

## Requirements

* 在默认 `points` 模式的搜索中，同时调用 `searchWorkspace(query)`、`searchEvidence(query)` 和 `searchReports(query)`。
* 默认搜索结果按现有分区风格展示 Source、Point、Evidence、Reports 四类结果。
* Source 结果继续支持加入「多来源综合」输入。
* Point 结果继续支持回到来源块。
* Evidence 结果继续支持加入研报输入和回到来源块。
* Report 结果支持打开 `ReportModal`，并复用已有标题、摘要、类型标签、创建时间展示。
* Report 结果中的删除行为应复用已有 `handleDeleteReport`，删除后同步移除搜索结果、最近报告列表和当前打开的报告。
* Evidence 标签页和 Reports 标签页的专属搜索行为保持不变。
* 搜索 loading、结果总数和空状态需要覆盖四类资产，不能在 Report 搜索仍未返回时提前显示空结果。

## Acceptance Criteria

* [ ] 在 `points` 模式输入关键词时，前端同时请求 Workspace、Evidence、Reports 搜索。
* [ ] Source、Point、Evidence、Report 匹配项都能在同一搜索结果页出现。
* [ ] 搜索结果总数包含 Report 数量。
* [ ] Report 搜索结果可以打开详情弹窗。
* [ ] 删除 Report 后，该条目从统一搜索结果和 Reports 最近列表中消失。
* [ ] `evidence` 模式仍只展示 Evidence 搜索/筛选结果。
* [ ] `reports` 模式仍只展示 Reports 搜索/筛选结果。
* [ ] 前端类型检查、边界检查和测试通过。

## Definition of Done

* 修改范围保持在前端 Library 搜索体验及必要测试/工具代码内。
* 不新增后端命令、不改数据库 schema。
* 不直接在 UI 层调用 Tauri `invoke`。
* `npm run typecheck`、`npm run check:boundaries`、`npm run test:run` 通过。
* 如实现过程中发现可复用约定或跨层契约变化，再更新 `.trellis/spec/`。

## Technical Approach

采用前端聚合的最小实现：默认 `points` 搜索分支并行调用现有三个 API，把 Report 结果存入已有 `reportResults` state，并在统一搜索 UI 中新增 Reports 分区。Reports 标签页已有的报告行渲染逻辑会抽出为组件内 helper，避免两处 UI/删除逻辑分叉。

## Decision (ADR-lite)

**Context**: Report Archive 已经具备后端搜索命令，默认知识库搜索只缺少前端接入。新增后端聚合命令会扩大 API surface，并引入排序/分页/跨表契约问题。

**Decision**: 本任务不新增后端聚合命令；复用 `searchWorkspace`、`searchEvidence`、`searchReports`，在 Library 页面做轻量聚合展示。

**Consequences**: 实现风险低，能快速补齐用户可见能力。结果排序仍按类型分区，不提供跨类型全局排序、权重排名或统一分页；这些留给后续搜索系统改造。

## Out of Scope

* 后端统一搜索命令。
* 数据库 schema / FTS 索引调整。
* 跨类型全局排序、权重打分、分页。
* 语义搜索或向量检索。
* Evidence / Reports 标签页的信息架构改版。

## Technical Notes

* 主要目标文件：`frontend/src/pages/Library.tsx`。
* API 已存在：`searchWorkspace`、`searchEvidence`、`searchReports`、`deleteReport`。
* Report 展示 helpers 已存在于 `frontend/src/lib/reportArtifacts.ts`：`reportKindLabel`、`filterReportsByKind`、`REPORT_KIND_FILTERS`。
* Reports 详情弹窗已存在：`frontend/src/components/ReportModal.tsx`。
* Evidence 结果列表已存在：`frontend/src/components/EvidenceList.tsx`。
