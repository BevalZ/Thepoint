# 20-Round Capability Refinement

## Goal

继续从 `炼化/` 参考项目中提炼高收益能力，按 20 轮小步新增、评估、验证的方式持续增强 Thepoint。每一轮都必须产生明确结果：新增一个能力切片、补强一个现有能力、或形成可执行评估/诊断机制；不能只写想法清单。

## What I Already Know

* 用户明确要求“再进行 20 轮能力新增和评估”。
* Thepoint 当前是 Tauri/Rust + React/Vite 本地知识工作台，已有 Sources、Points、Evidence、Reports/Investigations、Journal、Gallery、Review、Open Data Mirror、Indexed Folders、Unified Search。
* `炼化/` 包含 AFFiNE、anything-llm、AppFlowy、foam、joplin、khoj、kotaemon、logseq、marginalia、memos、quivr、silverbullet、siyuan、Zettlr、zotero 等项目。
* 上一轮已完成 Unified Search + Filter DSL + Preview，为后续 command palette、related diagnostics、agent read tools、评估面板打下基础。

## Operating Model

每一轮采用同一节奏：

1. **Select**: 从 `炼化/` 候选中选一个最适合当前架构的能力。
2. **Refine**: 明确 MVP，不引入重型依赖或不必要 schema 复杂度。
3. **Implement**: 写代码或文档化可执行评估机制。
4. **Evaluate**: 记录能力来源、收益、风险、验证命令、后续扩展。
5. **Verify**: 跑该轮相关质量门，必要时补测试。

## 20-Round Candidate Matrix

| Round | Source Inspiration | Capability | Expected Thepoint Benefit | Status |
|---:|---|---|---|---|
| 01 | marginalia / Zotero | Search Evaluation Harness | 让统一搜索有可回归评估集和指标 | completed |
| 02 | Khoj / Quivr / Kotaemon | Read-only Agent Retrieval Context | 给未来 agent/RAG 提供安全只读资产上下文 | completed |
| 03 | Foam / Logseq | Backlink & Unlinked Mention Suggestions | 从统一搜索/relations 发现潜在双链 | completed |
| 04 | Zotero | Citation Quality Dashboard | 聚合引用定位、过期、缺失状态 | completed |
| 05 | Joplin / SiYuan | Saved Search / Smart Collections | 将搜索 filter 保存成动态集合 | completed |
| 06 | Memos | Quick Capture Inbox | 快速记录想法并后续归档到 Source/Point/Journal | completed |
| 07 | AFFiNE / AppFlowy | Template-based Report/Investigation Starters | 调查报告模板和结构化启动器 | completed |
| 08 | marginalia | Low-quality Asset Reprocess Queue | 识别低质量索引/证据/报告并建议重跑 | completed |
| 09 | Zotero | Duplicate/near-duplicate Asset Detection | Source/Point/Report 去重提示 | completed |
| 10 | Logseq / Foam | Graph Neighborhood Preview | 查看资产周边一跳/二跳上下文 | completed |
| 11 | SilverBullet | Command Palette | 用一个命令入口调用搜索、创建、导出、评估 | completed |
| 12 | AnythingLLM | Workspace-scoped Retrieval Profiles | 不同搜索/调查范围预设 | completed |
| 13 | Khoj | Automation Suggestions | 基于 due review、stale citations、new sources 生成行动建议 | completed |
| 14 | Zotero / Joplin | Import Diagnostics Ledger | 记录导入/扫描失败、格式、恢复建议 | completed |
| 15 | marginalia | Ranking Explainability | 搜索结果解释字段更精确，帮助调参 | completed |
| 16 | SiYuan | Block-level References | Point/Chunk 粒度引用卡片增强 | completed |
| 17 | AFFiNE | Canvas/Board Snapshot Export | 将相关资产输出为可视化板/Markdown map | completed |
| 18 | AppFlowy | Local-first Sync/Export Audit | Mirror/export 一致性审计增强 | completed |
| 19 | Kotaemon | Multi-document QA Eval Fixtures | Investigation 质量回归样例 | completed |
| 20 | Cross-project | Capability Scorecard | 统一评估 20 轮收益、风险、后续路线 | completed |

## Round 01 MVP: Search Evaluation Harness

### Rationale

Unified Search 刚落地，下一步最值得做的是评估基线。没有评估集，后续继续炼化 ranking、filter、agent retrieval 会缺少客观回归标准。`marginalia` 中大量 `eval_ranking`、search metadata、journal/search 回归测试体现了同一个方法论：先有可重复 query fixtures，再谈 ranking 优化。

### Requirements

* 增加一个本地评估脚本或测试入口，不依赖真实用户数据库。
* 覆盖 Unified Search 的关键资产类型：source、point、report、journal、indexed_file，Evidence/Gallery 可作为后续扩展。
* 评估结果至少包含：query、expected kind/id、top result、hit@1、hit@k、reason。
* 评估 fixtures 必须可读、可维护，可被后续 20 轮复用。
* 不能引入网络依赖或外部服务。

### Acceptance Criteria

* [x] 有可运行的 Search Eval 命令或 Rust/Node 测试。
* [x] fixture 覆盖至少 5 个查询。
* [x] 输出可用于判断统一搜索是否退化。
* [x] 文档记录第 01 轮评估结论和后续扩展建议。
* [x] 相关质量门通过。

### Round 01 Evaluation Result

新增 `search_assets_eval_fixture_tracks_hit_at_1_and_hit_at_k` Rust 单测，直接复用内存 SQLite、现有 DB helper 和统一搜索入口 `search_assets`。评估 harness 包含 `SearchEvalCase`、`SearchEvalOutcome`、`run_search_eval` 和 Markdown 摘要生成；失败时会输出 query、expected kind/id、top result、hit@1、hit@k、reason，便于判断 ranking/recall 是否退化。

当前 fixture 覆盖 5 类关键资产：

* `source`: `alpha-source-anchor`
* `point`: `delta-point-insight`
* `report`: `Market Rotation Report`
* `journal`: `pricing-power-journal`
* `indexed_file`: `semantic-map-needle`

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml search_assets_eval_fixture_tracks_hit_at_1_and_hit_at_k
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

后续建议：Round 02 做只读 Agent Retrieval Context 时，直接复用本轮 fixture 作为 retrieval smoke baseline；Round 15 Ranking Explainability 时扩展该 harness，加入 expected reason/score bucket、负样本、filter DSL 和 evidence/gallery 覆盖。

## Round 02 MVP: Read-only Agent Retrieval Context

### Rationale

Khoj、Quivr、Kotaemon 的共同方法论是先把检索上下文变成明确、可控、可审计的只读 payload，再交给 agent 或生成链路。Thepoint 已有统一搜索，因此本轮不引入向量库或 agent loop，而是把统一搜索结果包装成压缩上下文 manifest，作为后续 RAG/agent 工具的安全入口。

### Result

新增 `build_retrieval_context(input)`：

* 后端 DB helper：`build_retrieval_context(conn, input)` 只调用 `search_assets`，不写 SQLite、不读文件系统、不调用模型。
* Tauri command：`commands::library::build_retrieval_context`，注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：`RetrievalContextInput`、`RetrievalContext`、`RetrievalContextItem`、`buildRetrievalContext(input)` 和 browser preview fallback。
* 输出字段包含 query、itemCount、totalChars、items、warnings；每个 item 包含 kind/id/title/excerpt/reason/score/sourceId/chunkIndex/metadataJson。
* limit clamp 为 `1..20`，单条 excerpt clamp 为 `120..2000` 字符，避免未来 agent prompt 被无界上下文撑爆。

### Evaluation Result

新增 `build_retrieval_context_returns_agent_safe_read_only_manifest` Rust 单测：

* 同一 query 覆盖 source、point、report、journal、indexed_file。
* 校验返回 index 顺序、excerpt 截断、reason 非空、source/indexed_file 定位字段。
* 查询前后对比 source_documents、points、reports、journal_entries、indexed_folders、indexed_files 表计数，证明该能力是只读查询。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml build_retrieval_context_returns_agent_safe_read_only_manifest
cargo check --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
```

后续建议：Round 03 的 Backlink/Unlinked Mention Suggestions 可以使用 `buildRetrievalContext` 的 item manifest 作为候选输入；Round 15 可以把 retrieval item 的 reason 扩展为可解释 score components。

## Round 03 MVP: Backlink & Unlinked Mention Suggestions

### Rationale

Foam 和 Logseq 的核心价值之一是把“已经写出来但尚未显式连接”的内容自动暴露出来：backlinks/linked references 让用户看到谁指向当前节点，unlinked mentions 则提示哪些笔记文本已经提到当前概念但还没有建立双链。Thepoint 已有统一搜索和 `asset_relations`，本轮不新增 schema、不自动写 relation，而是先做只读候选建议器，降低误连风险。

### Result

新增 `suggest_backlinks(input)`：

* 后端 DB helper：`suggest_backlinks(conn, input)` 支持 `source`、`point`、`evidence`、`report`、`journal`、`gallery`、`indexed_file` 作为目标资产类型。
* 目标解析：按资产类型抽取 title/content/summary/note/chunks/preview/metadata 等可搜索文本，并生成稳定查询词。
* 候选发现：复用 `search_assets` 查找提到目标标题或关键 terms 的候选资产。
* 去重与过滤：过滤目标自身，过滤 `asset_relations` 中已经存在双向关系的候选，只返回未链接提及。
* 建议 payload：返回 target/candidate kind/id、candidate title/excerpt、`relation = same_topic`、reason、score、sourceId/chunkIndex、metadataJson、existingRelation。
* Tauri command：`commands::library::suggest_backlinks`，已注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `BacklinkSuggestionInput`、`BacklinkSuggestion`、`suggestBacklinks(input)`、`TauriCommandMap.suggest_backlinks` 和 browser preview fallback。

### Evaluation Result

新增 `suggest_backlinks_finds_unlinked_mentions_without_persisting_relations` Rust 单测：

* fixture 中 Source 作为目标资产，Report 和 Journal 文本提到该 Source 标题但没有 relation。
* 另建一个已经通过 `asset_relations` 连接到目标 Source 的 Point，验证它不会作为重复建议返回。
* 查询前后对比 source_documents、points、reports、journal_entries、indexed_folders、indexed_files 和 asset_relations 计数，证明该能力只读、不写 relation、不改资产表。
* 验证返回建议包含 `same_topic` relation、非空 excerpt、可解释 reason 和正 score。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml suggest_backlinks_finds_unlinked_mentions_without_persisting_relations
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
npm run test:run
npm run build
```

后续建议：Round 04 可以直接用本轮 suggestions 作为 Citation Quality Dashboard 的“待补链/待审查引用”输入；Round 10 Graph Neighborhood Preview 可以把已存在 relations 和本轮 unlinked suggestions 同屏展示，形成“已连接 vs 可连接”的图谱视图。

## Round 04 MVP: Citation Quality Dashboard

### Rationale

Zotero 的 Citation Explorer / bibliography workflow 把引用视为可刷新、可检查、可定位的问题对象，而不是仅作为正文中的字符串。Thepoint 已有 computed citation locator 和持久化 `report_claims` / `report_citations`，本轮不引入 citeproc、文献库 schema 或实时重跑 locator，而是把已有报告审计状态聚合为只读质量仪表盘，作为后续自动化建议、Review Queue、ReportModal 面板的基础数据源。

### Result

新增 `load_citation_quality_dashboard(limit)`：

* 后端 DB helper：`build_citation_quality_dashboard(conn, limit)` 读取最近 Reports，并复用 `load_report_audit` / `ReportAuditCoverage` 聚合 claim/citation 健康度。
* 聚合指标：reportCount、auditedReportCount、total/cited/inferred/unsupported claims、total/located/warning/missing citations、stale/ambiguous/notFound/targetMissing/notApplicable 状态分布、coverageRatio、qualityScore。
* 报告行：每个报告返回质量分、严重度 `ok | warning | critical`、coverage 计数和 warnings；legacy 未持久化审计行的报告会被标为 warning。
* 问题引用清单：把 `multiple_matches`、`stale`、`not_found`、`target_missing`、`not_applicable` 提升为结构化 `problemCitations`，包含报告标题、引用 label/title、target、locator status、reason、source/chunk 和可读 message。
* Tauri command：`commands::library::load_citation_quality_dashboard`，已注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `CitationQualityDashboard`、`CitationQualityReportRow`、`CitationQualityProblemCitation`、`loadCitationQualityDashboard(limit)` 和 browser preview fallback。

### Evaluation Result

新增 `citation_quality_dashboard_aggregates_report_audit_health_read_only` Rust 单测：

* 构造健康报告、问题报告和 legacy 未审计报告。
* 覆盖 located、stale、multiple_matches、not_found、target_missing、not_applicable 六类 citation locator 状态。
* 验证 claim/citation 聚合计数、状态分布、coverageRatio、qualityScore、problemCitations、报告 severity 和全局 warnings。
* 查询前后对比 `reports`、`report_claims`、`report_citations` 表计数，证明 dashboard 是只读聚合能力。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml citation_quality_dashboard_aggregates_report_audit_health_read_only
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
npm run test:run
npm run build
```

后续建议：Round 05 Saved Search / Smart Collections 可以把 `severity == critical`、`staleCitations > 0`、`auditedReportCount < reportCount` 变成动态集合；Round 13 Automation Suggestions 可以基于本 dashboard 自动生成“复查过期引用 / 补充缺失引用 / 刷新 legacy 报告审计”的行动建议。

## Round 05 MVP: Saved Search / Smart Collections

### Rationale

Joplin 的搜索实现强调可复用 query/filter 语义，SiYuan 的数据库/Attribute View 则把 filters、sorts、view state 作为可保存、可替换的结构化条件。Thepoint 已有 `search_assets` 统一搜索和安全 filter DSL，因此本轮不引入复杂递归过滤器或 UI 视图系统，先把现有统一搜索条件保存成动态集合：保存的是 query/kinds/filter/limit 定义，预览时重新执行当前库搜索，不保存结果快照。

### Result

新增 Saved Asset Search / Smart Collection 能力：

* SQLite schema：新增 `saved_asset_searches(id, name, query, kinds_json, filter, limit_value, created_at, updated_at)`，`name` 唯一，支持同名覆盖。
* 后端 DB helper：`save_asset_search`、`list_saved_asset_searches`、`preview_saved_asset_search`、`delete_saved_asset_search`。
* 安全约束：保存时复用现有 `parse_search_asset_filter`，只接受 `kind == "..."`、`reportKind == "investigation"`、`sourceKind == "indexed_folder"`；filter 与 kinds 冲突时拒绝保存。
* 动态集合：`preview_saved_asset_search` 每次调用都复用 `search_assets`，所以新增 Report/Source/Point 后会自动出现在集合预览中。
* Tauri commands：`save_asset_search`、`list_saved_asset_searches`、`preview_saved_asset_search`、`delete_saved_asset_search`，已注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `SaveAssetSearchInput`、`SavedAssetSearch`、`SavedAssetSearchPreview` 和对应 API wrapper；browser preview 对读取型命令返回空/`null`，不伪造保存成功。

### Evaluation Result

新增 `saved_asset_searches_preview_dynamic_collections_read_only` Rust 单测：

* 先保存一个无匹配的 Investigation smart collection，验证保存定义不依赖当前是否有结果。
* 后续新增 Investigation 和 Digest 两个同 query 报告，预览只返回符合 `reportKind == "investigation"` 的 Report，证明集合是动态计算而非结果快照。
* 查询前后对比 `saved_asset_searches` 和 `reports` 表计数，证明 preview 只读。
* 同名保存会覆盖旧定义且保留同一个 id，表内仍只有一条 saved search。
* filter 与 kinds 冲突时返回错误，避免保存永远无效或语义混乱的集合。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml saved_asset_searches_preview_dynamic_collections_read_only
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
npm run test:run
npm run build
```

后续建议：Round 06 Quick Capture Inbox 可以把 inbox 条目导向某个 saved search/smart collection；Round 11 Command Palette 可以把 saved searches 作为可执行命令入口；Round 13 Automation Suggestions 可以自动生成“高价值 saved search 候选”，例如 `kind == "report"` + stale citation。

## Round 06 MVP: Quick Capture Inbox

### Rationale

Memos 的核心价值不是复杂协作模型，而是低摩擦 memo 捕获：`memo_service.proto` 里的 `content`、`tags`、`state`、`create_time` / `update_time` 和 store 层 `RowStatus` 说明它把“先记下来、后续再处理”作为一等对象。Thepoint 当前已有 Source、Point、Journal 三类本地知识资产，因此本轮不复制 Memos 的账号、visibility、reaction、share、attachment、resource 体系，而是炼化出一个本地 Quick Capture Inbox：先保存原始想法，再以事务方式归档到现有知识资产。

### Result

新增 Quick Capture Inbox 能力：

* SQLite schema：新增 `quick_capture_items(id, content, tags_json, source_kind, status, resolved_kind, resolved_id, resolved_at, created_at, updated_at)`，状态限制为 `inbox | resolved | dismissed`，并按 status/updated_at 和 resolved target 建索引。
* 后端 DB helper：新增 `save_quick_capture`、`list_quick_captures`、`resolve_quick_capture`、`dismiss_quick_capture`。
* 归档目标：`resolve_quick_capture` 支持 `journal`、`point`、`source`；Journal 写入 `journal_entries`，Point 写入 `points`，Source 写入 `source_documents` + 单条 `source_chunks`，canonical URI 使用 `quick-capture://<capture-id>`。
* 事务边界：归档 target 创建与 capture 状态更新在同一 SQLite transaction 内完成，避免出现“目标资产已创建但 inbox 仍未 resolved”或反向分裂状态。
* 非破坏性处理：`dismiss_quick_capture` 只把 capture 标记为 `dismissed`，不删除用户原始文本；已 resolved/dismissed 的 capture 不能再次 resolve。
* Tauri commands：新增 `save_quick_capture`、`list_quick_captures`、`resolve_quick_capture`、`dismiss_quick_capture` 并注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `SaveQuickCaptureInput`、`ResolveQuickCaptureInput`、`QuickCaptureItem`、`QuickCaptureResolution`、`saveQuickCapture`、`listQuickCaptures`、`resolveQuickCapture`、`dismissQuickCapture`；浏览器 preview 只对读取型 `list_quick_captures` 返回空数组，不伪造保存/归档成功。

### Evaluation Result

新增 `quick_capture_inbox_resolves_to_journal_point_and_source_transactionally` Rust 单测：

* 空 content 被拒绝。
* 保存 capture 后进入 `inbox`，tags 和 `source_kind` 可 round-trip。
* `list_quick_captures(Some("inbox"))` 只读，不改变 capture、Journal、Point、Source、Chunk 表计数。
* resolve 到 Journal 时创建 `journal_entries`，capture 变为 `resolved` 并记录 `resolvedKind = journal` / `resolvedId`。
* resolve 到 Point 时创建 `points`，保留 parentId、`tagType = quick_capture` 和 `sourceDocName = Quick Capture Inbox`。
* resolve 到 Source 时创建 `source_documents` 与 `source_chunks`，canonical URI 指向原 capture。
* dismiss 保留原始文本并出现在 dismissed 列表中。
* 重复 resolve 已 resolved/dismissed capture 会报错，非法 target kind 不创建任何目标资产且 capture 保持 inbox。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml quick_capture_inbox_resolves_to_journal_point_and_source_transactionally
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
npm run test:run
npm run build
```

后续建议：Round 07 的模板化 Report/Investigation starter 可以允许从 Quick Capture 直接生成调查初稿；Round 11 Command Palette 可以把 `saveQuickCapture` 做成全局快捷入口；Round 13 Automation Suggestions 可以扫描长期未处理的 inbox capture，建议归档为 Source/Point/Journal 或 dismiss。

## Round 07 MVP: Template-based Report / Investigation Starters

### Rationale

AFFiNE 的模板系统把模板抽象为可分类、可搜索、可扩展的 `TemplateManager`，并通过 insert job + middleware 处理插入前的 ID、位置和类型转换。AppFlowy 的默认 grid/board/calendar 模板和 workspace template builder 则体现了另一个模式：模板不是一段静态文本，而是“可构建的对象集合”，创建时能跳过不支持对象并保留结构。Thepoint 不需要复制 AFFiNE 的画布插入引擎、BlockSuite snapshot、远程模板库或 AppFlowy 的 collab/database view 模型；本轮炼化为只读 Report Starter Draft：基于内置模板和已选 Source/Point/Evidence 生成可保存的 Report 输入草稿。

### Result

新增 Report Starter 能力：

* 内置模板清单：`investigation-brief`、`evidence-review`、`synthesis-note`，每个模板包含 id、name、category、kind、description、sections、sourceInspiration。
* 后端 DB helper：`list_report_starter_templates(category, query)` 支持按 category 与 query 搜索模板；`build_report_starter(conn, input)` 按模板生成草稿，不写 `reports` 表。
* 上下文收集：`BuildReportStarterInput` 接收 `sourceIds`、`pointIds`、`evidenceIds`，去重后读取 Source chunk、Point content、Evidence answer/reasoning/context，生成 `ReportStarterContextItem`。
* 草稿输出：`ReportStarterDraft.saveInput` 直接复用现有 `SaveReportInput`，包含 title、kind、sourceName、bodyMd、summary、citationsJson；后续 UI 可用已有 `saveReport` 保存。
* Citation seed：按选中资产生成 `[S1]`、`[P1]`、`[E1]` 标签和 citation JSON，草稿正文中的各 section 提示用户使用这些 labels。
* 失败降级：缺失 Source/Point/Evidence 不会使整个 starter 失败，而是进入 `warnings`；空 query、未知 template id 仍明确报错。
* Tauri commands：新增 `list_report_starter_templates` 与 `build_report_starter`，已注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `ReportStarterTemplate`、`BuildReportStarterInput`、`ReportStarterContextItem`、`ReportStarterDraft`、`listReportStarterTemplates`、`buildReportStarter`；browser preview 只对模板列表返回 `[]`，不伪造依赖本地资产的草稿。

### Evaluation Result

新增 `report_starter_templates_build_read_only_drafts_with_context_citations` Rust 单测：

* 模板列表支持 category/query 过滤，并至少返回 3 个内置模板。
* 构造 Source、Point、Evidence 后生成 Investigation starter 草稿。
* 生成的 Markdown 包含 `## Evidence Map`、`[S1] source`、`[P1] point`、`[E1] evidence` 等结构化 scaffold。
* `citationsJson` 包含 3 条 starter citation，labels 与 context item 顺序一致。
* 缺失 Source/Point/Evidence 进入 warnings。
* 构建 starter 前后对比 Source、Chunk、Point、Evidence、Report 表计数，证明该能力是只读草稿生成，不自动保存 Report。
* 空 query 与未知 template id 返回明确错误。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml report_starter_templates_build_read_only_drafts_with_context_citations
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
npm run test:run
npm run build
```

后续建议：Round 11 Command Palette 可以把 `listReportStarterTemplates` 暴露为“Create investigation from template”；Round 13 Automation Suggestions 可根据 stale citation / saved search 自动推荐合适 starter；Round 17 Canvas/Board Export 可复用 `contextItems` 输出可视化研究板。

## Round 08 MVP: Low-quality Asset Reprocess Queue

### Rationale

marginalia 的 ingest lifecycle 明确区分 `pending/running/done/failed/dead`，并在 README/CHANGELOG 中反复强调 failed-only reprocess、stale recovery、missing model credentials 后自动重跑、semantic index rebuild 后避免清空可用索引等机制。核心方法论是：先把低质量/失败/过期状态变成可解释队列，再执行重跑；不能让用户在海量资产中猜哪些东西需要处理。Thepoint 当前没有后台任务队列，因此本轮不引入 worker 或真正 reprocess 执行器，而是做只读诊断队列，为后续 Command Palette / indexed folder rescan / report regeneration 提供统一入口。

### Result

新增 Low-quality Asset Reprocess Queue 能力：

* 后端 DTO/helper：`ReprocessQueueInput`、`ReprocessQueueItem`、`ReprocessQueue`、`build_reprocess_queue(conn, input)`。
* 支持资产类型：`indexed_file`、`source`、`report`；`kinds` 可筛选，未知 kind 被忽略，若没有有效 kind 则默认检查全部。
* Indexed File 规则：`read_status <> ok`、`index_status <> indexed`、`last_error` 非空会进入队列；missing/stale/read failed 为 critical，partial/metadata_only/last_error warning；建议动作包括 `scan_indexed_folder`、`rescan_or_reimport_file`、`inspect_parser_support`。
* Source 规则：Source 没有任何 `source_chunks` 时进入 warning 队列，因为检索与 citation locator 都会变弱；建议动作 `reimport_or_replace_source_chunks`。
* Report 规则：读取 `load_report_audit`，把缺失 audit rows、missing/warning citations、unsupported/inferred claims 聚合成 report 队列项；critical 用于 missing citations/unsupported claims，warning 用于 stale/ambiguous/inferred/legacy audit 状态。
* 排序与限制：critical 优先，按 target kind/title 稳定排序，limit 默认 50、范围 `1..200`；截断时返回 warning。
* Tauri command：新增 `load_reprocess_queue` 并注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `ReprocessQueueInput`、`ReprocessQueueItem`、`ReprocessQueue`、`loadReprocessQueue(input)`；browser preview 返回空队列和 runtime warning。

### Evaluation Result

新增 `reprocess_queue_surfaces_low_quality_assets_without_mutating_them` Rust 单测：

* 构造 missing/stale indexed file、metadata-only/unsupported indexed file、健康 indexed file。
* 构造无 chunks 的 Source 和健康 Source，队列只包含无 chunks Source。
* 构造 legacy/unaudited Report，队列返回 `report_missing_audit_rows`。
* 验证 critical 优先、counts 正确、folderId/sourceId/issueKind/suggestedAction 可用于后续执行入口。
* kind filter `["source", "unknown"]` 只返回 Source 项。
* 查询前后对比 `indexed_files`、`source_documents`、`source_chunks`、`reports`、`report_claims`、`report_citations` 表计数，证明该队列是只读诊断能力。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml reprocess_queue_surfaces_low_quality_assets_without_mutating_them
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
npm run test:run
npm run build
```

后续建议：Round 11 Command Palette 可以把队列项变成可执行命令；Round 13 Automation Suggestions 可把 critical reprocess items 变成每日建议；Round 18 Local-first Sync/Export Audit 可把 Mirror stale/prune 状态并入统一 reprocess/maintenance queue。

## Round 09 MVP: Duplicate / Near-duplicate Asset Detection

### Rationale

Zotero 的 duplicates 体系把“可能重复”作为一个虚拟集合来呈现，而不是立即删除或合并条目；它先通过规范化字符串、分组和同类型限制暴露候选，再让用户决定是否 merge。Thepoint 当前的 Source、Point、Report 都是用户知识资产，误合并成本高，因此本轮不复制 Zotero 的完整 merge pane、replaced item relation 或跨字段冲突处理，而是炼化为只读 Duplicate Asset Report：先把疑似重复资产稳定分组，并明确 exact / near 的原因和分数。

### Result

新增 Duplicate / Near-duplicate Asset Detection 能力：

* 后端 DTO/helper：`DuplicateAssetInput`、`DuplicateAssetCandidate`、`DuplicateAssetGroup`、`DuplicateAssetReport`、`detect_duplicate_assets(conn, input)`。
* 支持资产类型：`source`、`point`、`report`；`kinds` 可筛选，未知 kind 被忽略，默认检查全部支持类型。
* 指纹策略：Source 使用标题与 canonical URI 派生候选文本，Point 使用 content，Report 使用 title；统一做小写、去标点、压缩空白等规范化，降低大小写和标点差异造成的漏检。
* 分组策略：先生成同 kind 的 `exact_fingerprint` 组，再生成同 kind 的 `near_fingerprint` 组；near 匹配使用指纹相似度阈值 `0.82`。
* 安全边界：同名跨类型资产不会被归为重复组，符合 Zotero merge 只处理同类型 top-level items 的约束；本轮不执行删除、合并、关系替换或 schema 迁移。
* 输出字段：每组包含 `groupId`、`duplicateKey`、`matchKind`、`score`、`reason`、`candidates`；每个候选包含 kind/id/title/excerpt/fingerprint/metadataJson。
* 限制与排序：limit 默认 30，范围 `1..100`；按分数降序和 duplicate key 稳定排序；结果被截断时返回 warning。
* Tauri command：新增 `detect_duplicate_assets` 并注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `DuplicateAssetKind`、`DuplicateAssetInput`、`DuplicateAssetCandidate`、`DuplicateAssetGroup`、`DuplicateAssetReport`、`detectDuplicateAssets(input)`；browser preview 返回空报告和 runtime warning，不伪造本地库诊断结果。

### Evaluation Result

新增 `duplicate_asset_detection_groups_exact_and_near_matches_read_only` Rust 单测：

* 构造 exact Source 重复、near Source 重复、exact Point 重复、near Report 重复。
* 构造一个与 Source 同名的 Report，验证跨 kind 不会混入 Source duplicate group。
* 验证 `reports_only` kind filter 只返回 Report candidates，未知 kind 被忽略。
* 查询前后对比 `source_documents`、`points`、`reports`、`asset_relations` 表计数，证明该能力是只读诊断，不写 relation、不删除、不合并。
* 验证 exact 与 near 分组均有可解释 `matchKind`、`score` 和候选资产 payload。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml duplicate_asset_detection_groups_exact_and_near_matches_read_only
cd frontend
npm run typecheck
```

后续建议：Round 10 Graph Neighborhood Preview 可以把 duplicate groups 作为“可能应合并/应连边”的邻域提示；Round 11 Command Palette 可以增加“Review duplicate assets”入口；Round 13 Automation Suggestions 可以把高置信 exact duplicate 变成每日维护建议，但仍应保持人工确认，不做自动合并。

## Round 10 MVP: Graph Neighborhood Preview

### Rationale

Foam 的 `FoamGraph` 同时维护 forward links 和 backlinks，并在 graph webview 协议中把图谱拆成 `nodeInfo` 与 `links` 两个清晰 payload；其 focus subset 逻辑按选中节点和 depth 计算可见邻域。Logseq 的 `build-page-graph` 则把当前页引用的 pages、提到当前页的 mentioned pages，以及这些邻居之间的关系一起构造成局部图，并过滤隐藏/无效节点。Thepoint 已有 `asset_relations`、Round 03 的 unlinked mention suggestion 和 Round 09 的 duplicate suggestion，因此本轮不引入 D3/force-graph UI 或新图数据库，而是炼化为只读 Graph Neighborhood Preview API。

### Result

新增 Graph Neighborhood Preview 能力：

* 后端 DTO/helper：`GraphNeighborhoodInput`、`GraphNeighborhoodNode`、`GraphNeighborhoodEdge`、`GraphNeighborhoodPreview`、`build_graph_neighborhood_preview(conn, input)`。
* 输入：`kind`、`id`、`depth`、`includeSuggestions`、`limit`；`kind` 复用现有资产类型校验，depth clamp 到 `1..2`，limit clamp 到 `1..150`。
* 真实关系：以目标资产为 root，从 `asset_relations` 做 bounded BFS，支持一跳/二跳邻域；真实边输出为 `edgeKind = relation`、`existingRelation = true`，并保留 relation/reason/score/provenance。
* 建议关系：当 `includeSuggestions` 为 true 时，复用 Round 03 `suggest_backlinks` 生成 `suggested_backlink` 边，复用 Round 09 `detect_duplicate_assets` 生成 `suggested_duplicate` 边；建议边只出现在 preview 中，不写 `asset_relations`。
* 节点快照：每个节点返回 kind/id/title/label/depth/root/assetExists/metadataJson，Source、Point、Evidence、Report、Journal、Gallery、Review 都有轻量标题和 metadata。
* Placeholder 语义：关系指向的资产若已不存在，仍返回 placeholder 节点并写入 warning，避免图谱因半失效关系整体失败，借鉴 Foam placeholder 思路。
* 边去重：对 auto symmetric relations 做无向去重，避免 `rebuild_asset_relations` 产生的双向边在局部图中重复显示；manual 和 suggested 边保留方向。
* Tauri command：新增 `build_graph_neighborhood_preview` 并注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `GraphNeighborhoodInput`、`GraphNeighborhoodNode`、`GraphNeighborhoodEdge`、`GraphNeighborhoodPreview`、`buildGraphNeighborhoodPreview(input)`；browser preview 返回空图和 runtime warning。

### Evaluation Result

新增 `graph_neighborhood_preview_builds_read_only_relation_and_suggestion_graph` Rust 单测：

* 构造 root Source、真实一跳 Point、真实二跳 Evidence。
* 构造一个未显式连接但正文提到 root Source 标题的 Report，验证 `suggested_backlink` 边出现且不写入 relation 表。
* 构造一个同名 Source 重复项，验证 `suggested_duplicate` 边出现且不执行合并。
* 验证 root node depth=0、Point depth=1、Evidence depth=2。
* 验证 `includeSuggestions = false` 时只返回真实 `relation` 边。
* 查询前后对比 `source_documents`、`points`、`evidence_records`、`reports`、`asset_relations` 表计数，证明该能力是只读预览。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml graph_neighborhood_preview_builds_read_only_relation_and_suggestion_graph
cd frontend
npm run typecheck
```

后续建议：Round 11 Command Palette 可以把本轮 API 暴露为“Preview graph neighborhood”；Round 13 Automation Suggestions 可以把 suggested edges 和 duplicate edges 转成维护建议；后续 UI 若做可视化，应直接消费本轮 `nodes` / `edges` payload，而不是让页面重新查询各类资产。

## Round 11 MVP: Command Palette Manifest

### Rationale

SilverBullet 的 Command Palette 不是硬编码按钮列表，而是由 command manifest 构成：`client/plugos/hooks/command.ts` 会合并内置命令、plug 命令和脚本命令，并按 `requireMode` 过滤只读/读写能力；`client/components/command_palette.tsx` 再把命令 map 转成可搜索 options，显示快捷键提示，并按 `lastRun` / `priority` 排序。`docs/Command.md`、`docs/Command Palette.md` 和 `docs/API/system.md` 进一步说明命令既可以从 palette 执行，也可以被 API 枚举。Thepoint 当前还没有全局 palette UI，因此本轮不引入通用执行器、不做全局快捷键、不允许任意命令动态调用；先炼化为只读 Command Palette Manifest API，让所有高价值能力有统一、可搜索、可审计的命令目录。

### Result

新增 `list_command_palette_items(input)` 能力：

* 后端 DTO/helper：`CommandPaletteInput`、`CommandPaletteItem`、`CommandPaletteManifest`、`list_command_palette_items(input)`。
* Manifest 字段：每个 item 包含 `id`、`title`、`category`、`description`、`keywords`、`commandName`、`wrapperName`、`executionKind`、`requiredInput`、`inputHint`、`risk`、`shortcutHint`、`sourceInspiration`、`priority`。
* 过滤与排序：支持 `query`、`category`、`limit`；query 覆盖标题、分类、描述、keywords、Tauri command、frontend wrapper、输入提示和来源；limit 默认 60，范围 `1..100`；排序借鉴 SilverBullet priority 机制，按 priority 降序稳定输出。
* 安全边界：本轮只返回 manifest，不执行命令、不打开数据库、不写 SQLite、不调用模型、不写文件；`risk` 明确区分 `read_only`、`creates_or_updates_local_records`、`draft_only`、`writes_export_files`、`model_call`。
* 覆盖范围：manifest 已登记统一搜索、Retrieval Context、Quick Capture、Report Starter、Citation Quality、Saved Searches、Reprocess Queue、Duplicate Detection、Graph Neighborhood、Backlink Suggestions、Review Queue、Open Data Mirror、Investigation/Digest/Synthesis、Analytics 等入口。
* Tauri command：新增 `commands::library::list_command_palette_items` 并注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `CommandPaletteInput`、`CommandPaletteItem`、`CommandPaletteManifest`、`listCommandPaletteItems(input = {})` 和 `TauriCommandMap.list_command_palette_items`。
* Browser preview fallback：无 Tauri runtime 时返回空 manifest 和 warning，不伪造本地命令目录。

### Evaluation Result

新增 `command_palette_manifest_filters_static_actions_without_db_writes` Rust 单测：

* 验证 manifest 覆盖不少于 20 个命令入口，并包含 diagnostics、graph、capture 等分类。
* 验证 Round 08 `load_reprocess_queue`、Round 09 `detect_duplicate_assets`、Round 10 `build_graph_neighborhood_preview` 均被登记，且保留来源轮次与风险语义。
* 验证 category 过滤大小写不敏感，diagnostics 分类只返回 diagnostics item。
* 验证 fuzzy-style query 能找到 duplicate review 命令。
* 验证 limit 截断返回 warning，无匹配返回明确 warning。
* 对比 Source、Point、Report、Saved Search、Quick Capture、Relation 表计数，证明 manifest 生成不写数据库。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml command_palette_manifest_filters_static_actions_without_db_writes
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
npm run test:run
npm run build
```

后续建议：Round 12 Workspace-scoped Retrieval Profiles 可以直接作为新的 `category = "retrieval"` manifest item 登记；真正的 palette UI 应消费本轮 manifest，并按 `risk` 对 `write/export/model` 类命令做确认或参数收集，不要实现无约束的 arbitrary command executor。

## Round 12 MVP: Workspace-scoped Retrieval Profiles

### Rationale

AnythingLLM 的 workspace 不是单纯文件夹，而是把检索默认值作为 workspace 级行为持久化：`server/models/workspace.js` 中的 `similarityThreshold`、`topN`、`chatMode`、`vectorSearchMode`、`openAiHistory`、`queryRefusalResponse` 会直接进入 `server/utils/chats/stream.js`、`server/utils/chats/apiChatHandler.js` 和 `/api/workspace/:slug/vector-search` 的检索/问答路径；`DocumentManager.pinnedDocs()` 与 `WorkspaceParsedFiles.getContextFiles()` 又提供 workspace/thread 级上下文注入；`fillSourceWindow()` 会在当前检索不足时从历史 sources 回填上下文窗口。Thepoint 当前已有统一搜索、saved search 和只读 retrieval context，因此本轮不复制 AnythingLLM 的向量库、聊天执行、线程、pin 文件系统或 reranker，而是炼化为本地 `RetrievalProfile`：把“某类问题应该用什么 query 默认值、资产类型、filter、上下文预算、score threshold 和模式”保存成可复用 profile，并用只读 preview 复用现有检索上下文。

### Result

新增 Workspace-scoped Retrieval Profiles 能力：

* SQLite schema：新增 `retrieval_profiles(id, name, description, query, kinds_json, filter, saved_search_id, limit_value, max_chars_per_item, min_score, mode, created_at, updated_at)`，`name` 唯一，支持同名覆盖。
* 后端 DB helper：新增 `save_retrieval_profile`、`list_retrieval_profiles`、`preview_retrieval_profile`、`delete_retrieval_profile`。
* Profile scope：profile 可直接保存 `query/kinds/filter`，也可通过 `savedSearchId` 引用 Round 05 的 saved search；预览时 profile 字段优先，缺省字段从 saved search 继承。
* AnythingLLM 参数映射：`topN` 炼化为 `limit`，`similarityThreshold` 炼化为 `minScore`，`chatMode` 炼化为 `mode = automatic | query | chat`，上下文窗口预算炼化为 `maxCharsPerItem`。
* 只读预览：`preview_retrieval_profile` 调用现有 `build_retrieval_context`，再按 `minScore` 过滤并重排 item index；不写资产表、不写 saved search、不调用模型、不读文件系统。
* Query-mode 语义：当 `mode = query` 且预览无上下文时返回 warning，借鉴 AnythingLLM query mode 的“无检索上下文则拒答”机制，但本轮不生成回答。
* Tauri commands：新增 `save_retrieval_profile`、`list_retrieval_profiles`、`preview_retrieval_profile`、`delete_retrieval_profile` 并注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `SaveRetrievalProfileInput`、`RetrievalProfile`、`PreviewRetrievalProfileInput`、`RetrievalProfilePreview` 和对应 API wrappers；browser preview 对读取型命令返回空/`null`，不伪造保存成功。
* Command Palette：登记 `retrieval.profiles.preview`、`retrieval.profiles.save`、`retrieval.profiles.list`，分类为 `retrieval`，来源标记为 AnythingLLM Round 12。

### Evaluation Result

新增 `retrieval_profiles_save_list_preview_saved_search_scope_read_only` Rust 单测：

* 保存一个引用 saved search 的 Investigation-only retrieval profile，验证空 profile query 可继承 saved search query。
* 构造同 query 的 Source、Investigation Report、Digest Report，预览只返回符合 `reportKind == "investigation"` 且通过 `minScore` 的 Investigation Report。
* 查询前后对比 `retrieval_profiles`、`saved_asset_searches`、`source_documents`、`reports` 表计数，证明 preview 是只读上下文构建。
* 验证 list 返回 profile，同名保存会覆盖旧定义并保留 id。
* 验证 `limit` clamp 到 20、`maxCharsPerItem` clamp 到 2000、`minScore` clamp 到 1.0、`mode` 保存为 `chat`。
* 验证 kinds 与 filter 冲突会报错，避免保存语义空集 profile。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml retrieval_profiles_save_list_preview_saved_search_scope_read_only
cd frontend
npm run typecheck
```

后续建议：Round 13 Automation Suggestions 可以基于 due review、stale citations、critical reprocess queue 和高价值 retrieval profile 生成行动建议；后续 Investigation UI 可允许用户选择 retrieval profile 来填充 scope，而不是每次手动配置 query/kinds/filter/limit。

## Round 13 MVP: Automation Suggestions

### Rationale

Khoj 的 Automations 体系把自动化拆成几个清晰部分：`api_automation.py` 负责创建/列出/编辑/删除/手动触发 automation，`schedule_automation()` 把 query、subject、crontime、conversation_id 持久化进 scheduler job metadata，`AutomationAdapters.get_automation_metadata()` 把 job 转成可展示的 subject/query/schedule/next payload，前端 `automations/page.tsx` 还提供 suggested automation preset cards，并在创建后从探索列表中隐藏已存在同 subject 的建议。Thepoint 当前没有后台 worker、邮件通知或云端 scheduler，因此本轮不复制 APScheduler、cron、email、thread trigger 或模型推断 schedule，而是炼化出一个本地只读 `AutomationSuggestion` 聚合层：把已经存在的 due review、stale/missing citations、critical reprocess queue、duplicates、quick capture inbox、new sources 和 retrieval profiles 转成可执行建议 manifest。

### Result

新增 Automation Suggestions 能力：

* 后端 DTO/helper：新增 `AutomationSuggestionInput`、`AutomationSuggestionItem`、`AutomationSuggestionReport`、`load_automation_suggestions(conn, input)`。
* 聚合来源：读取 `build_review_queue_plan`、`build_citation_quality_dashboard`、`build_reprocess_queue`、`detect_duplicate_assets`、`list_quick_captures`、`list_recent_sources`、`list_retrieval_profiles`。
* 输出语义：每条建议包含 category、priority、priorityScore、subject、summary、reason、actionLabel、commandName、wrapperName、inputJson、targetKind/targetId、scheduleHint、sourceInspiration。
* 安全边界：本轮只生成建议，不执行命令、不新增 scheduler、不写 SQLite、不调用模型、不发邮件；即使建议指向 `addReviewItem` / `resolveQuickCapture` 这类写命令，也只是返回可审查的 action manifest。
* 过滤与排序：支持 `categories` 和 `limit`，category 支持 review/citations/reprocess/duplicates/capture/sources/retrieval；limit 默认 40、范围 `1..100`；按 priorityScore、category、subject 稳定排序。
* Tauri command：新增 `load_automation_suggestions` 并注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `AutomationSuggestionInput`、`AutomationSuggestionItem`、`AutomationSuggestionReport`、`loadAutomationSuggestions(input = {})` 和 browser preview fallback。
* Command Palette：登记 `automation.suggestions`，分类为 `automation`，来源标记为 Khoj Round 13，风险为 `read_only`。

### Evaluation Result

新增 `automation_suggestions_aggregate_existing_diagnostics_read_only` Rust 单测：

* 构造 due review item、target_missing citation、missing/stale indexed file、exact duplicate report group、quick capture inbox item、recent Source、retrieval profile。
* 验证建议覆盖 review、citations、reprocess、duplicates、capture、sources、retrieval 七类入口。
* 验证建议携带正确 `commandName` 和 wrapper-friendly `inputJson`，例如 review 指向 `build_review_queue_plan`、capture 指向 `resolve_quick_capture`、new Source 指向 `add_review_item`、retrieval profile 指向 `preview_retrieval_profile`。
* 查询前后对比 `review_items`、`reports`、`report_claims`、`report_citations`、`indexed_files`、`quick_capture_items`、`source_documents`、`source_chunks`、`retrieval_profiles`、`asset_relations` 表计数，证明该能力是只读聚合。
* 验证 category filter 只返回指定类别，Command Palette 能通过 “khoj automation suggestions” 找到本轮入口。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml automation_suggestions_aggregate_existing_diagnostics_read_only
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
npm run test:run
npm run build
```

后续建议：Round 14 Import Diagnostics Ledger 可以把导入/扫描失败也并入 `AutomationSuggestion` 的 reprocess/import category；Round 15 Ranking Explainability 可以让建议解释为什么某个 retrieval profile 或 saved search 应优先执行；真正自动执行前应增加用户确认、风险等级和执行日志，不能直接从建议 manifest 无提示触发写命令。

## Round 14 MVP: Import Diagnostics Ledger

### Rationale

Zotero 的导入向导和 `ProgressQueue` 把导入拆成可观察的 row：每个文件/条目有 queued、processing、failed、succeeded 状态和 message，最终页面再把成功、失败、错误上报入口集中展示。Joplin 的 `InteropService` 和 importer 体系则把导入结果收敛到统一 `ImportExportResult.warnings`，对缺失 resource、malformed item、不可解析内容采用“尽量继续 + 记录 warning”的方式。Thepoint 已有 Indexed Folder 扫描和 `indexed_files.read_status/index_status/last_error`，因此本轮不新增重型 importer、不复制 Zotero/Joplin 的导入 UI，而是把已有扫描结果炼化成一个只读 Import Diagnostics Ledger。

### Result

新增 Import Diagnostics Ledger 能力：

* 后端 DTO/helper：新增 `ImportDiagnosticsInput`、`ImportDiagnosticItem`、`ImportFolderDiagnosticSummary`、`ImportDiagnosticsLedger`、`load_import_diagnostics_ledger(conn, input)`。
* 数据来源：复用既有 `indexed_files` / `indexed_folders` 持久扫描结果，不新增表、不写 SQLite、不读文件系统、不调用模型。
* 分类规则：按 `read_status`、`index_status`、`descriptor_kind`、`last_error` 聚合为 `ok | warning | critical`，并输出 `issueKind`，覆盖 `missing_or_stale_file`、`file_read_failed`、`partial_index`、`file_too_large`、`metadata_only_file`、`import_warning`、`import_ok`。
* 恢复建议：每个 ledger item 带 `message`、`recoveryAction`、`commandName`、`wrapperName`、`inputJson`，可直接提示用户重扫 folder 或打开 indexed file preview。
* Folder summary：每个 indexed folder 输出 total/ok/warning/critical、metadataOnly、partial、failed、missing、stale 计数，用于判断是哪次扫描或哪个目录质量下降。
* 过滤：支持 `folderId`、`statuses`、`includeOk`、`limit`；默认只返回非 OK 诊断项，但全局和 folder summary 仍统计全部文件。
* Tauri command：新增 `load_import_diagnostics_ledger` 并注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `ImportDiagnosticsInput`、`ImportDiagnosticItem`、`ImportFolderDiagnosticSummary`、`ImportDiagnosticsLedger`、`loadImportDiagnosticsLedger(input = {})` 和 browser preview fallback。
* Command Palette：登记 `diagnostics.import_ledger`，分类为 `diagnostics`，来源标记为 Zotero/Joplin Round 14，风险为 `read_only`。
* Automation Suggestions：新增 `import` category，把 import ledger 中的 warning/critical 扫描项转成可执行建议，指向 `load_import_diagnostics_ledger`，不直接执行重扫或写操作。

### Evaluation Result

新增 `import_diagnostics_ledger_summarizes_scan_outcomes_read_only` Rust 单测：

* 构造 ok indexed Markdown、metadata-only image、partial text、missing/stale Markdown 四类扫描记录。
* 验证默认 ledger 只返回 3 个问题项，同时 folder summary 统计 4 个文件。
* 验证 critical/warning/ok 计数、metadataOnly/partial/missing/stale 计数、recovery command/inputJson、message 与 issueKind。
* 验证 `includeOk = true` 返回 OK 文件，`statuses = ["critical"]` 只返回 missing/stale 文件。
* 查询前后对比 `indexed_folders`、`indexed_files`、`source_documents`、`source_chunks` 表计数，证明 ledger 是只读诊断。
* 验证 `AutomationSuggestion` 的 `import` category 能从 ledger 生成建议；验证 Command Palette 能通过 “zotero joplin import ledger” 找到本轮入口。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml import_diagnostics_ledger_summarizes_scan_outcomes_read_only
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
npm run test:run
npm run build
```

后续建议：Round 15 Ranking Explainability 可以复用本轮 `message/recoveryAction/inputJson` 的解释模式，把 search result 的 reason 拆成可审计 scoring components；后续如果增加真正的 file import UI，应先写入同一 ledger contract，再由 UI 展示，而不是每个导入入口各自弹错误。

## Round 15 MVP: Ranking Explainability

### Rationale

`marginalia` 的检索链路不是只返回一个 opaque score：`search_metadata` 会把 query 拆成可解释 terms，并按 display name、summary、extra、description、tag facet 等字段加权；`recall_knowledge` 会把 metadata/tag/semantic 命中合并成 `matched_by`、`lexical_rank`、`semantic_rank`、`rrf_score` 和 `score_components`；eval 层又用 MRR、hit@k、recall@k、NDCG 和 ablation delta 判断某个检索组件是否真的提升质量。Thepoint 当前 `search_assets` 已有 coarse score/reason，但 reason 仍是单句描述，无法回答“为什么这个结果排在前面、命中了哪些词、是否只是资产类型基础分更高”。本轮不引入 embedding/rerank/FTS schema，也不改变排序行为；先把现有排序变成可审计诊断 payload，为后续调参和评估提供观察面。

### Result

新增 Ranking Explainability 能力：

* 后端 DTO/helper：新增 `SearchRankingExplanationInput`、`SearchRankingComponent`、`SearchRankingItemExplanation`、`SearchRankingExplanation`、`explain_search_ranking(conn, input)`。
* 数据来源：只调用现有 `search_assets`，不新增 schema、不写 SQLite、不读文件系统、不调用模型、不改变排序结果。
* Query 解释：输出 `queryTerms`，包含完整 query phrase、拆分后的词项、数字/大写/符号词和 CJK 短词；借鉴 `marginalia.agent.text_query` / `_rank_terms` 的“短词过滤但保留 CJK/数字/大写”的方法。
* 排序说明：每个 result 输出 rank、kind/id/title、原始 `score`、`scoreDeltaFromTop`、原始 `reason`、`matchedTerms`、`missingTerms`、`matchedFields`。
* Score components：每个 result 输出 `asset_kind_prior`、`term_coverage`、`field_match`、`source_locator`、`metadata_quality` 五类 component，并标注 `usedForRanking`。当前真正参与排序的是 `asset_kind_prior`，其余为诊断信号，避免误导后续 UI 或 agent。
* Metadata 诊断：Indexed File 会暴露 missing/stale/failed/partial/metadata-only 等质量信号；Report/Evidence/Gallery 会基于已有 metadata 给出轻量可解释性信号。
* Tauri command：新增 `commands::library::explain_search_ranking` 并注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `SearchRankingExplanationInput`、`SearchRankingExplanation` 等类型，新增 `explainSearchRanking(input)` wrapper，`TauriCommandMap.explain_search_ranking` 和 browser preview fallback。
* Command Palette：登记 `search.ranking_explainability`，分类为 `search`，来源标记为 marginalia Round 15，风险为 `read_only`。

### Evaluation Result

新增 `explain_search_ranking_breaks_down_scores_without_changing_search_order` Rust 单测：

* 构造 Point、Investigation Report、Source、Indexed File 四类资产。
* 验证 explanation 的首项与 `search_assets` 原始首项一致，证明本轮不改变排序行为。
* 验证 query terms 包含完整 phrase 和拆分 token，例如 `round-fifteen-ranking`、`fifteen`、`ranking`。
* 验证 Point explanation 暴露 matchedTerms、matchedFields、`asset_kind_prior` 和 `field_match` component，且 `asset_kind_prior.usedForRanking = true`、诊断 component 不参与当前排序。
* 验证 Indexed File explanation 暴露 `source_locator` 和 `metadata_quality` 正向信号。
* 验证 CJK query `机器学习` 不会被短词过滤，并能进入 matchedTerms。
* 查询前后对比 `source_documents`、`source_chunks`、`points`、`reports`、`indexed_folders`、`indexed_files` 表计数，证明该能力只读。
* 验证 Command Palette 能通过 “marginalia score components” 找到本轮入口。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml explain_search_ranking_breaks_down_scores_without_changing_search_order
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
npm run test:run
npm run build
```

后续建议：Round 16 Block-level References 可以把 `matchedFields/matchedTerms/source_locator` 用到 Point/Chunk 引用卡片中；后续若真正调整 ranking，应先扩展 Round 01 eval harness，让 `term_coverage/field_match/metadata_quality` 的权重变更有 hit@k/MRR 回归证据，而不是凭感觉改排序。

## Round 16 MVP: Block-level References

### Rationale

SiYuan 的核心知识组织能力之一是 block-level reference：用户不是只能引用整篇文档，而是可以引用一个块，并在卡片里看到块内容、位置和可跳转上下文。Thepoint 已经有 Source chunk、Point、Evidence、Report、Journal、Gallery、Indexed File 和 Round 15 的 `matchedTerms/matchedFields` 解释能力，因此本轮不新增块表、不改编辑器、不做双向持久引用；先炼化出一个只读 `BlockReferenceManifest`，把现有资产投影成可渲染、可定位、可审计的 block reference cards。

### Result

新增 Block-level References 能力：

* 后端 DTO/helper：新增 `BlockReferenceInput`、`BlockReferenceCard`、`BlockReferenceManifest` 和 `build_block_reference_manifest(conn, input)`。
* 支持目标资产：`source`、`point`、`evidence`、`report`、`journal`、`gallery`、`indexed_file`。
* 卡片粒度：Source 输出 `source_chunk`，Point 输出 `point_card` 并可带所在 Source chunk，Evidence 输出 `evidence_claim`，Report 输出 `report_section` 并可展开 citation target，Journal 输出 `journal_note` 并可展开引用的 Source/Point/Evidence/Report，Gallery 输出 `gallery_prompt`/`gallery_source_point`，Indexed File 输出 `indexed_file_preview` 并可展开 linked Source。
* 解释字段：每张卡片包含 `matchedTerms`、`matchedFields`、`score`、`reason`、`locator`、`blockHash`，复用 Round 15 的 query term 解析和 field match 口径。
* 跳转入口：每张卡片包含 `commandName`、`wrapperName`、`inputJson`，复用 `open_source_workspace`、`get_point_source_context`、`get_evidence`、`get_report`、`load_indexed_file_preview` 等现有命令。
* 安全边界：该能力只读，不新增 SQLite schema、不写资产表、不读文件系统、不调用模型、不改变搜索排序。
* Tauri command：新增 `commands::library::build_block_reference_manifest` 并注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `BlockReferenceInput`、`BlockReferenceCard`、`BlockReferenceManifest`、`buildBlockReferenceManifest(input)`、`TauriCommandMap.build_block_reference_manifest` 和 browser preview fallback。
* Command Palette：登记 `references.block_manifest`，分类为 `references`，来源标记为 SiYuan Round 16，风险为 `read_only`。

### Evaluation Result

新增 `block_reference_manifest_builds_point_chunk_cards_read_only` Rust 单测：

* 构造 Source 两个 chunks、链接到 chunk 1 的 Point、以及挂到该 Point/Source 的 Evidence。
* 以 Point 为 root 构建 block reference manifest，验证返回 `point_card`、`source_chunk`、`evidence_claim` 三类卡片。
* 验证 Source chunk card 保留 `sourceId`、`chunkIndex`、`open_source_workspace` action 和 `inputJson`。
* 验证 Point/Evidence card 暴露 `matchedTerms`、`matchedFields`、`blockHash` 和对应 command wrapper。
* 查询前后对比 `source_documents`、`source_chunks`、`points`、`point_source_links`、`evidence_records`、`evidence_sources` 表计数，证明该能力只读。
* 验证 missing target 返回 warning 而不是报错。
* 验证 Command Palette 能通过 “siyuan block references” 找到本轮入口。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml block_reference_manifest_builds_point_chunk_cards_read_only
cargo check --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
```

后续建议：Round 17 Canvas/Board Snapshot Export 可以直接消费 `BlockReferenceManifest.cards`，把 source chunk、point、evidence、report section 输出成 Markdown map 或 board node；真正做块级 UI 时，应优先渲染本轮 manifest，而不是让每个页面各自解析 Source/Point/Evidence。

## Round 17 MVP: Canvas/Board Snapshot Export

### Rationale

AFFiNE 的 canvas 和 AppFlowy 的 board/database view 都体现了同一个能力：把分散知识对象临时组织成可视化工作面，而不是只在列表里逐条打开。Thepoint 当前还不需要引入完整画布编辑器、拖拽布局、同步状态或文件写入；第 16 轮已经把 Source chunk、Point、Evidence 等资产投影成 block cards，因此本轮最小可行切片是只读 `BoardSnapshotExport`：把 block reference cards 转成 board nodes/edges，并生成 portable Markdown map，供后续 UI、导出或报告 starter 复用。

### Result

新增 Canvas/Board Snapshot Export 能力：

* 后端 DTO/helper：新增 `BoardSnapshotInput`、`BoardSnapshotNode`、`BoardSnapshotEdge`、`BoardSnapshotExport` 和 `build_board_snapshot_export(conn, input)`。
* 数据来源：内部复用 Round 16 `build_block_reference_manifest`，不新增查询体系、不新增 SQLite schema、不写文件、不调用模型。
* Board node：每个 block card 转成节点，保留 `assetKind`、`assetId`、`blockKind`、`blockId`、`title`、`excerpt`、`locator`、`commandName`、`wrapperName`、`inputJson`、`blockHash`。
* 简单布局：按 asset kind 分 lane，`source/indexed_file -> sources`，`point/evidence -> claims`，`report -> reports`，`journal -> memory`，`gallery -> media`，并生成稳定 `x/y` 坐标。
* Board edge：以 root node 为中心，将其它节点连接为 `references` edge，先形成可读一跳 board snapshot，后续可扩展为 relation/duplicate/backlink typed edges。
* Markdown map：输出包含摘要、Mermaid `flowchart LR` 和 Cards 清单的 Markdown，不落盘、不触发导出写操作。
* Tauri command：新增 `commands::library::build_board_snapshot_export` 并注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `BoardSnapshotInput`、`BoardSnapshotNode`、`BoardSnapshotEdge`、`BoardSnapshotExport`、`buildBoardSnapshotExport(input)`、`TauriCommandMap.build_board_snapshot_export` 和 browser preview fallback。
* Command Palette：登记 `board.snapshot_export`，分类为 `board`，来源标记为 AFFiNE/AppFlowy Round 17，风险为 `draft_only`。

### Evaluation Result

新增 `board_snapshot_export_converts_block_refs_to_markdown_map_read_only` Rust 单测：

* 构造 Source chunks、链接到 chunk 1 的 Point、以及关联 Evidence。
* 以 Point 为 root 构建 board snapshot，验证 node 数量、edge 数量、sources/claims lane、`references` edges。
* 验证 Markdown 包含 Mermaid `flowchart LR` 和 Cards 清单，可作为 portable Markdown map。
* 查询前后对比 `source_documents`、`source_chunks`、`points`、`point_source_links`、`evidence_records`、`evidence_sources` 表计数，证明该能力只读。
* 验证 Command Palette 能通过 “affine appflowy board snapshot” 找到本轮入口。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml board_snapshot_export_converts_block_refs_to_markdown_map_read_only
cargo check --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
```

后续建议：Round 18 Local-first Sync/Export Audit 可以复用 board snapshot 的 Markdown 和 node hash，审计 Mirror/export 是否包含最新 source chunk、point/evidence 卡片；如果后续实现真正 Canvas UI，应把本轮 nodes/edges 作为只读 snapshot 输入，而不是先引入复杂画布持久化。

## Round 18 MVP: Local-first Sync/Export Audit

### Rationale

AppFlowy 的 local-first 方法学强调本地 workspace 状态必须可观察：同步、导出、缓存和本地视图之间如果不一致，用户需要看到差异，而不是只能重新执行一次写操作。Thepoint 已有 Open Data Mirror 的 plan/export/prune 生命周期，也已经能区分 `write`、`skip`、`overwrite`、`prune`。本轮不新增同步协议、不写文件、不自动导出或删除；只把现有 mirror plan 和 manifest 差异炼化成一个只读 Export Sync Audit，让用户知道当前本地资产、mirror 文件、manifest 是否一致。

### Result

新增 Local-first Sync/Export Audit 能力：

* 后端 command DTO：新增 `ExportSyncAuditItem`、`ExportSyncAuditReport`。
* Tauri command：新增 `commands::library::build_export_sync_audit` 并注册到 `src-tauri/src/lib.rs`。
* 数据来源：复用现有 `build_open_data_mirror_plan_data`、`read_open_data_mirror_manifest` 和 mirror hash 逻辑，不新增 SQLite schema、不调用 export/prune、不写 mirror root。
* 审计状态：返回 `status = in_sync | out_of_sync | needs_config | error`。
* 差异项：将 mirror plan 分类提升为 `missing_export`、`stale_export`、`orphaned_export`、`in_sync`、`error`，每项包含 kind/id/title/path/action/currentHash/previousHash/message。
* 聚合计数：输出 currentAssetCount、manifestAssetCount、inSyncCount、pendingWriteCount、pendingOverwriteCount、pendingPruneCount、errorCount。
* 配置降级：Mirror disabled 或缺 root path 时返回 `needs_config` warning，不把配置缺失伪装成成功。
* Frontend typed boundary：新增 `ExportSyncAuditReport`、`ExportSyncAuditItem`、`buildExportSyncAudit()`、`TauriCommandMap.build_export_sync_audit` 和 browser fallback。
* Command Palette：登记 `mirror.sync_audit`，分类为 `export`，来源标记为 AppFlowy Round 18，风险为 `read_only`。

### Evaluation Result

新增 `export_sync_audit_reports_missing_in_sync_and_stale_read_only` Rust 单测：

* Mirror 默认 disabled 时，audit 返回 `needs_config` 和 warning。
* 配置 source-only mirror 且尚未导出时，audit 返回 `out_of_sync`、`pendingWriteCount = 1` 和 `missing_export`。
* 执行既有 export 后，audit 返回 `in_sync`、manifest version 2、current/manifest asset count 均为 1。
* 手动改写 mirror 文件内容后，audit 返回 `out_of_sync`、`pendingOverwriteCount = 1` 和 `stale_export`。
* 验证 Command Palette 能通过 “appflowy local first sync audit” 找到本轮入口。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml export_sync_audit_reports_missing_in_sync_and_stale_read_only
cargo check --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
```

后续建议：Round 19 Multi-document QA Eval Fixtures 可以把 sync audit 纳入 Investigation 质量回归：如果报告引用的 Source/Point 尚未进入 mirror 或 mirror stale，则 QA fixture 应标记“外部可复现上下文不足”。

## Round 19 MVP: Multi-document QA Eval Fixtures

### Rationale

Kotaemon 的价值不只是多文档问答本身，而是把多文档 QA 做成可检查、可复现的工作流：问题、上下文、引用覆盖、答案结构和失败原因都要能被评估。Thepoint 已有 Investigation Report、持久 claim/citation audit、citation locator、Round 18 sync audit；本轮不引入模型裁判、不跑外部 benchmark、不新增 fixture 表，而是把已保存的 Investigation 转换成 deterministic QA eval cases，作为未来 RAG/Investigation 质量回归的本地基线。

### Result

新增 Multi-document QA Eval Fixtures 能力：

* 后端 DTO/helper：新增 `InvestigationQaEvalInput`、`InvestigationQaEvalCheck`、`InvestigationQaEvalCase`、`InvestigationQaEvalReport` 和 `run_investigation_qa_eval(conn, input)`。
* 数据来源：读取 `reports.kind = investigation`，复用 `load_report_audit` 的 claims/citations/coverage，不新增 schema、不写 SQLite、不调用模型。
* Eval checks：每个 Investigation case 输出 `multi_document_context`、`citation_health`、`claim_coverage`、`answer_structure`、`citation_kind_mix` 五类检查。
* Scoring：每个 check 归一为 `pass = 1.0`、`warning = 0.5`、`fail = 0.0`；case 输出平均 score 和 `pass | warning | fail` 状态。
* 多文档判定：要求至少 2 个唯一 citation target；citation kind mix 期望 Source + Point/Evidence 组合。
* 输入过滤：支持 `reportId` 单报告评估和 `limit` 最近 Investigation 批量评估。
* Tauri command：新增 `commands::library::run_investigation_qa_eval` 并注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `InvestigationQaEvalInput`、`InvestigationQaEvalReport` 等类型，新增 `runInvestigationQaEval(input = {})`，`TauriCommandMap.run_investigation_qa_eval` 和 browser fallback。
* Command Palette：登记 `evaluations.investigation_qa`，分类为 `evaluations`，来源标记为 Kotaemon Round 19，风险为 `read_only`。

### Evaluation Result

新增 `investigation_qa_eval_scores_multi_document_reports_read_only` Rust 单测：

* 构造 Source、Source chunk、Point 和 Point-Source link。
* 保存一个包含 Source + Point 两类 citation 的合格 Investigation，验证其 QA case `pass`、unique citation targets = 2、citation kinds 包含 source/point。
* 保存一个无 citation 的弱 Investigation，验证 eval 聚合中 `failCount = 1`。
* 验证 `reportId` 过滤只返回目标报告 case。
* 查询前后对比 `reports`、`report_claims`、`report_citations`、`source_documents`、`points` 表计数，证明该能力只读。
* 验证 Command Palette 能通过 “kotaemon multi document qa fixtures” 找到本轮入口。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml investigation_qa_eval_scores_multi_document_reports_read_only
cargo check --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
```

后续建议：Round 20 Capability Scorecard 应把 Round 01-19 的每轮能力、风险、只读/写入边界、测试覆盖和后续 UI 消费路径汇总成一个总评分面板或文档，作为下一阶段路线依据。

## Round 20 MVP: Capability Scorecard

### Rationale

前 19 轮已经覆盖搜索评估、检索上下文、双链建议、引用质量、smart collections、quick capture、模板 starter、reprocess/duplicate/import diagnostics、graph preview、command palette、retrieval profiles、automation suggestions、ranking explainability、block references、board snapshot、mirror sync audit 和 Investigation QA eval。最后一轮需要把这些能力收敛成一个可执行 scorecard：每轮的收益、风险、边界、命令入口、验证方式和下一步 UI 消费路径必须集中呈现，避免后续路线只凭记忆推进。

### Result

新增 Capability Scorecard 能力：

* 后端 DTO/helper：新增 `CapabilityScorecardItem`、`CapabilityScorecard` 和 `build_capability_scorecard()`。
* Scorecard 覆盖 Round 01-20，每项包含 sourceInspiration、capability、status、boundary、impactScore、riskScore、readiness、commandNames、verification、nextStep。
* 聚合指标：输出 itemCount、completedCount、readOnlyCount、writeCount、draftCount、modelCallCount、averageImpactScore、averageRiskScore。
* 推荐路线：输出下一阶段建议，优先将 read-only diagnostics 接入 UI，再处理 write workflows 和模型链路。
* Tauri command：新增 `commands::library::build_capability_scorecard` 并注册到 `src-tauri/src/lib.rs`。
* Frontend typed boundary：新增 `CapabilityScorecardItem`、`CapabilityScorecard`、`buildCapabilityScorecard()`、`TauriCommandMap.build_capability_scorecard` 和 browser fallback。
* Command Palette：登记 `system.capability_scorecard`，分类为 `system`，来源标记为 Cross-project Round 20，风险为 `read_only`。

### Evaluation Result

新增 `capability_scorecard_summarizes_all_refinement_rounds` Rust 单测：

* 验证 scorecard 包含 20 项且 completedCount = 20。
* 验证 readOnly/write 边界计数、平均 impact/risk 分数在合理范围。
* 验证 Round 19 包含 `run_investigation_qa_eval`，Round 20 包含 `build_capability_scorecard`。
* 验证 recommendations 包含下一阶段 read-only diagnostics UI 路线。
* 验证 Command Palette 能通过 “round 20 capability scorecard roadmap” 找到本轮入口。

验证命令：

```powershell
cargo test --manifest-path src-tauri/Cargo.toml capability_scorecard_summarizes_all_refinement_rounds
cargo check --manifest-path src-tauri/Cargo.toml
cd frontend
npm run typecheck
npm run check:boundaries
```

后续建议：20 轮能力炼化已经形成一套本地知识工作台底座。下一阶段优先做 UI 集成，而不是继续增加后端能力：Command Palette UI、Diagnostics Center、Block Reference Cards、Board Snapshot Preview、Investigation QA Dashboard 是最高收益路径。

## Definition of Done

* 每轮完成后更新本 PRD 的 matrix status。
* 每轮至少有一个代码/测试/文档交付。
* 不提交无关 dirty 文件：`src-tauri/src/commands/digest.rs`、`src-tauri/src/commands/gallery.rs`、`炼化/`。
* 代码轮次必须跑对应 backend/frontend 检查。

## Out of Scope

* 一次性实现全部 20 个大功能。
* 引入外部向量库、sidecar、HTTP server 或云服务。
* 对 `炼化/` 下参考项目做提交。
* 修改无关 dirty 文件。
