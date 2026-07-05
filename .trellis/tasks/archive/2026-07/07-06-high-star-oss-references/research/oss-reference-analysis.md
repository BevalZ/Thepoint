# 炼化参考项目逐项深度分析

> 日期：2026-07-06  
> 配套索引：`code-inspection-index.md`  
> 目标读者：Thepoint 后续功能设计与实现者  
> 方法：全量索引 + 核心路径深读 + 关键实现抽样验证。

## 总体结论

这些项目可以分成八类参考价值：

| 类别 | 最强参考项目 | 对 Thepoint 的意义 |
|---|---|---|
| 本地优先工作台 | AFFiNE、AppFlowy、Logseq、SiYuan、SilverBullet、Zettlr | 证明知识工作台不应该只是 CRUD，而要有稳定内容模型、索引、命令系统、关系视图和可恢复状态 |
| 证据/引用/文献 | Zotero、Zettlr、Kotaemon、Quivr、Marginalia | Thepoint 的 Investigation 和 Citation Contract 应继续强化“结论必须可追溯” |
| 文件系统与外部资料 | Zettlr、Zotero、Foam、SilverBullet、Foliole | Indexed Folders 要有 descriptor/cache/watch/safe path/preview/ignore 机制，不能只是扫目录入库 |
| RAG 与 AI 问答 | anything-llm、Khoj、Kotaemon、Quivr、AppFlowy | 当前不建议照搬服务端 RAG，但可以先借鉴检索分层、证据去重、引用输出、流式元数据 |
| 块/图谱/关系 | Logseq、AFFiNE、Foam、SiYuan | Related Assets 可从轻量共现关系演进到更强的块图谱和查询规则 |
| 复习与阅读节奏 | Foliole、Logseq、Memos | Review Queue 可从简单间隔演进到 FSRS + 阅读材料分散 + 优先级继承 |
| 插件/扩展/命令 | SiYuan、Zotero、SilverBullet、Memos、anything-llm | 当前先做内部 typed command + command palette；插件运行时后置 |
| 工程方法学 | Joplin、Foliole、AFFiNE、Zotero | 大型本地应用的质量来自稳定模型层、迁移/同步/索引测试、边界脚本和降级路径 |

最适合 Thepoint 第二阶段的“立即借鉴”不是最大项目的协同编辑或完整 RAG，而是以下 12 个高性价比能力：

| 优先项 | 参考来源 | 建议 |
|---|---|---|
| 1. Source descriptor cache | Zettlr FSAL、Foam datastore、SilverBullet space | 为 Indexed Folders 增加文件 descriptor、mtime/size/hash、可读性、ignore 规则 |
| 2. Citation reliability panel | Zotero、Zettlr、Kotaemon、Quivr | Investigation 保存前显示“哪些结论有引用，哪些只是推断” |
| 3. Evidence span matching | Kotaemon、Zotero fulltext | 保存引用时保留 quote 在 source/highlight 中的位置匹配状态 |
| 4. Review Queue 规则化 | Foliole、Memos filter | 在简单间隔上增加 priority、due filter、reason、overdue/due soon 视图 |
| 5. Open Data Mirror manifest | Foliole mirror、Zotero attachment paths | Mirror 输出 manifest、稳定文件名、附件链接重写和 prune 策略 |
| 6. External search preview cache | Foliole externalSearch、Zettlr search | Indexed Folder 结果先预览，不强制全部导入 Source |
| 7. Journal 可信度分级 | Marginalia、Khoj safe prompts | Journal 只能做召回线索，最终结论必须回到 Source/Point/Evidence |
| 8. Agent/tool guardrails | SiYuan、Marginalia | 如果后续加 Agent，先做预算、loop guard、tool output untrusted、确认通道 |
| 9. Command palette action registry | SilverBullet、SiYuan、Zettlr | 把搜索、导出、复习、发现关联等动作集中成 typed action registry |
| 10. Import source lifecycle | Foliole Readwise import、Zotero attachments | 区分 imported、linked、indexed-only、removed、missing、stale |
| 11. Search query DSL lite | Memos filter、Logseq Datalog、Zettlr boolean search | 先做可解释过滤语法，不急着上 embedding |
| 12. Quality contract tests | Foliole/Joplin/Zotero tests | 为 mirror、indexed folders、review scheduling、citation extraction 建稳定测试 |

## 跨项目模式

### 1. 数据模型要表达“资产生命周期”，而不是只存内容

Zotero、Foliole、Zettlr、Joplin 都把“内容本身”和“内容状态”分开。Zotero attachment 有 imported file、linked file、linked URL、embedded image 等 link mode；Foliole 有 imported sources、external documents、mirror outputs、attachment blobs、removed source restore；Zettlr 的 FSAL 用 descriptor 表达 file/code/other/dir 和 cache 状态；Joplin 的 BaseModel/BaseItem 把本地 item、sync item、encryption item 分层。

Thepoint 现在已有 Source/Point/Evidence/Report/Journal/Indexed File，但第二阶段要补足：

| 缺口 | 借鉴 |
|---|---|
| Indexed file 是否仍存在、是否可读、是否被忽略 | Zettlr `getDescriptorFor`、Foam `IDataStore`、SilverBullet disk space |
| Source 是导入副本、外部链接、扫描索引还是镜像输出 | Zotero attachment link mode、Foliole external/import lifecycle |
| Evidence quote 是否还能在原文定位 | Kotaemon span matching、Zotero fulltext cache |
| Mirror 文件是否过期/被用户外部修改 | Foliole mirror manifest、stable path |
| Review target 是否源资产缺失 | Foliole review queue + missing attachment diagnostics |

### 2. 检索应先做“可解释”，再做“语义”

anything-llm、Khoj、Quivr、Kotaemon 都有成熟 RAG，但它们也说明语义检索会引入成本：嵌入模型、chunk 策略、向量库、rerank、引用 hallucination、异步任务、取消/重建、模型供应商差异。

Thepoint 当前更应该先强化可解释检索：

| 检索层 | 参考 | Thepoint 建议 |
|---|---|---|
| SQLite FTS | SiYuan、Zotero、Joplin | Source/Point/Evidence/Report/Journal 都有 FTS 或 unified search view |
| Boolean query | Zettlr | 对 Indexed Folders 提供 AND/OR/phrase/case-sensitive 的轻量搜索 |
| Filter DSL | Memos | Review Queue、Journal、Source search 支持 `tag == "x"`、`kind in (...)`、`created after ...` |
| Datalog-style rules | Logseq | 后续可做 asset relation 查询，不作为第一阶段 |
| Embedding/RAG | anything-llm、Khoj、Quivr、Kotaemon | 等 citation contract 稳定后再接 |

### 3. 引用不是“答案后附 sources”，而是贯穿生成、展示、保存、复查

Zotero 的整个产品围绕 citation 和 attachment；Zettlr 通过 citeproc 把外部 citation database 接入写作；Kotaemon 把 citation pipeline 与 answer pipeline 并行；Quivr 在 streaming final chunk 中传 metadata；Marginalia 把 citations 和 recall tools 放入 agent e2e 测试。

Thepoint 的 Investigation 应增加四层引用状态：

| 状态 | 含义 |
|---|---|
| cited | 结论绑定 Source/Point/Evidence，并保存 quote/reason |
| located | quote 能在当前原文或 highlight 中定位 |
| inferred | 结论是模型从多个证据推理，不能当直接事实 |
| unsupported | 无引用，不允许作为高可信结论保存，除非用户确认 |

### 4. Agent 必须先有防失控机制，再谈工具数量

SiYuan 和 Marginalia 的 Agent 实现非常值得借鉴。SiYuan 的 prompt 明确工具规则、领域概念、反捏造、untrusted tool output、确认/提问通道、SSE 事件；Marginalia 的 runtime 有 `NO_PLAN` 快路径、budget tiers、tool-call dedup、doom-loop guard、structured truncation、多模态 fallback。

Thepoint 如果加入 Agent，第一版不应该开放“万能自动操作”。更安全的路径是：

| 机制 | 来源 | Thepoint 形态 |
|---|---|---|
| 工具输出不可信包装 | SiYuan | 所有 search/read/mirror/review 工具返回统一 `tool_result`，模型不能把它当用户指令 |
| 预算与循环保护 | Marginalia | 最大工具调用数、重复调用去重、相同 query 连续失败停止 |
| 显式确认通道 | SiYuan | 删除、导出覆盖、批量入库、联网搜索必须用户确认 |
| 计划可跳过但可审计 | Marginalia | 简单查询可 `NO_PLAN`，复杂调查生成 plan 并保存 |
| 引用强制 | Kotaemon/Quivr | Agent 最终写入 Report 必须返回 citation coverage |

### 5. 插件系统不宜过早开放

Zotero、SiYuan、SilverBullet 的插件/脚本能力都很强，但代价高：权限、沙箱、生命周期、兼容性、UI 注入、国际化、版本阻断、测试矩阵。Thepoint 当前更适合先做内部 action registry 和 command palette：

| 先做 | 以后再做 |
|---|---|
| typed action registry | 第三方插件沙箱 |
| command palette | 插件 marketplace |
| internal tool adapters | 外部脚本执行 |
| structured import/export hooks | 插件 UI 注入 |
| dev-only diagnostics | 用户安装包插件生命周期 |

## AFFiNE

### 定位与技术栈

AFFiNE 是大型 local-first 协作知识工作台，核心价值在 BlockSuite 块编辑、白板/文档一体化、数据库块、嵌入块、云/本地同步抽象和 monorepo 工程治理。它远大于 Thepoint 当前规模，不适合照搬 UI 或协同编辑，但非常适合作为“未来工作台内容模型”的上限参考。

### 代码证据

| 路径 | 观察 |
|---|---|
| `package.json` | Yarn 4 monorepo，lint/type/test/build 脚本成熟，工作区边界强 |
| `blocksuite/affine/all/src/schemas.ts` | 统一注册 paragraph、root、list、note、image、surface、bookmark、frame、database、embed、table、callout 等 block schema |
| `packages/common/nbstore/src/index.ts` | nbstore 抽象把文档、blob、索引等本地存储能力模块化 |
| `packages/common/nbstore/src/impls/sqlite/v1/db.ts` | SQLite backend，说明大型知识工作台仍可围绕本地 DB 做 durable store |
| `packages/common/nbstore/src/sync/index.ts` | Sync 组合 doc/blob/awareness/indexer sync，区分 local/remotes |

### 核心特点

AFFiNE 的特点不是“有很多功能”，而是把内容类型抽象为 block schema。数据库、表格、callout、白板 frame、bookmark、embed 都是 schema 化能力，UI 与存储可以围绕 schema 做通用处理。同步层也不是单一“保存文档”，而是 doc、blob、awareness、indexer 多通道协调。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| 内容模型 | Thepoint 的 Source/Point/Evidence/Report/Journal 可以逐步抽象为 “asset block” 或 “knowledge block”，保留 kind-specific payload |
| 可扩展 schema | 未来新增 Gallery、Review、Citation、Mirror 不应不断堆字段，可采用 `kind + payload_json + indexes` 模式 |
| Blob 分离 | 图片、附件、网页快照、PDF 摘要应与知识记录分离，减少主表膨胀 |
| 索引通道 | 索引更新可成为独立任务/命令，不直接塞进每个保存命令 |
| 工程治理 | Thepoint 可以学习 workspace boundary check、schema registry、测试 fixture，而不是照搬 monorepo 复杂度 |

### Thepoint 落地建议

短期不引入 BlockSuite。更现实的是在 SQLite 层建立统一 asset registry：

| 表/视图 | 作用 |
|---|---|
| `knowledge_assets(kind, id, title, summary, created_at, updated_at)` view | 统一 Source/Point/Evidence/Report/Journal/Gallery/Review targets |
| `asset_payloads(asset_kind, asset_id, payload_json)` 可选 | 为后续新资产类型保留扩展位 |
| `asset_blobs(asset_kind, asset_id, blob_id, role)` | 统一图片、附件、snapshot、generated image |
| `asset_index_state(asset_kind, asset_id, fts_state, mirror_state, relation_state)` | 解耦保存与索引 |

### 不适合直接照搬

- AFFiNE 的协同编辑、awareness、block editor 复杂度过高，会偏离 Thepoint 当前“证据可靠性优先”的阶段。
- 大型 monorepo 工具链不适合直接迁入 Thepoint。
- Thepoint 不是 Notion/Miro 替代品，短期不应重写编辑器内核。

### 适配优先级

后续借鉴。短期只吸收 schema registry、blob/index 分层和工程边界思想。

## AppFlowy

### 定位与技术栈

AppFlowy 是 Dart/Flutter + Rust 的本地优先协作 workspace。对 Thepoint 价值最大的是 Rust AI plugin 结构、事件注册方式、文件聊天限制、embedding indexer、SQLite retriever 和 local AI model selection。

### 代码证据

| 路径 | 观察 |
|---|---|
| `frontend/rust-lib/flowy-ai/src/lib.rs` | AI plugin 统一注册 chat/completion/local AI/model/prompt config 事件 |
| `frontend/rust-lib/flowy-ai/src/event_handler.rs` | handler 层做 payload 校验，文件聊天限制 pdf/md/txt 和 10MB |
| `frontend/rust-lib/flowy-ai/src/embeddings/indexer.rs` | `IndexerProvider` 与 embedding model 枚举 |
| `frontend/rust-lib/flowy-ai/src/local_ai/chat/retriever/sqlite_retriever.rs` | SQLite retriever 接 LangChain Rust `VectorStore`，支持 RAG id filters |

### 核心特点

AppFlowy 的 AI 不只是一个“调用 LLM 的工具函数”，而是 plugin/event-driven 子系统。它将事件、模型选择、本地 AI、prompt database config、embedding indexer 拆开，允许前端通过稳定事件调用不同 AI 能力。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| AI command 注册 | Thepoint 可把 Point/Investigation/Fact check/Image/Related/Review AI 调用集中到 Rust `ai_commands` registry |
| 输入限制 | 对文件聊天、网页导入、图片解析设置明确大小/类型限制，错误信息可解释 |
| 模型选择 | 聊天、搜索、图片、embedding 后续都应有 model profile，而不是全局一个模型 |
| SQLite retriever | 后续做 embedding 时先用 SQLite/本地向量扩展或可替换 retriever，不急引外部向量库 |
| 本地 AI | Ollama/本地模型要作为 model provider，不应污染业务逻辑 |

### Thepoint 落地建议

短期可以做一个 Rust 侧 AI orchestration 层：

| 模块 | 责任 |
|---|---|
| `ai/providers.rs` | OpenAI-compatible、Ollama provider trait |
| `ai/tasks.rs` | point extraction、investigation、fact check、commentary、framework read 等 task 类型 |
| `ai/limits.rs` | 输入长度、文件大小、图片大小、超时、重试 |
| `ai/model_profiles.rs` | chat/search/image/future_embedding 配置读取 |
| `commands/ai.rs` | 只暴露 typed Tauri command |

### 不适合直接照搬

- Flutter/Dart UI 不适合 Thepoint。
- LangChain Rust 可以参考，但当前阶段不建议引入完整 RAG 依赖链。
- AppFlowy 的协同 workspace 和云能力超出当前目标。

### 适配优先级

立即借鉴 AI command 边界和输入限制；embedding retriever 后置。

## anything-llm

### 定位与技术栈

anything-llm 是面向本地/自托管的完整 RAG 与 Agent 系统，包含 workspace、document ingestion、vector DB、chat memory、slash command、agent invocation、scheduled jobs、collector extensions。它对 Thepoint 的价值主要在“RAG 系统拆层”和“后台任务治理”，不是直接迁入其服务端架构。

### 代码证据

| 路径 | 观察 |
|---|---|
| `server/prisma/schema.prisma` | workspace、documents、vectors、chats、agent、memory、scheduled jobs、routers 等完整数据模型 |
| `server/models/documents.js` | document 元数据与 workspace 关系 |
| `server/models/workspace.js` | workspace 级配置与隔离 |
| `server/models/vectors.js` | vector metadata 与 provider 对接 |
| `server/jobs/embedding-worker.js` | child process embedding queue、progress IPC、cancel/remove |
| `server/utils/chats/index.js` | slash command、history、memory injection、source de-dupe |
| `server/utils/vectorDbProviders/base.js` | 多 vector DB provider interface |
| `collector/extensions/index.js` | repo、YouTube、website-depth、Confluence、Obsidian、Paperless 等 signed extensions |

### 核心特点

anything-llm 的成熟点在完整 ingestion-to-chat 数据流：

1. 文档进入 workspace。
2. 分块、向量化、写 provider。
3. Chat 时取 history、memory、workspace config、retrieved sources。
4. Slash command 和 Agent tools 参与扩展。
5. Worker 负责进度、取消、删除、重建。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| Workspace 隔离 | Thepoint 的 Investigation scope 可借鉴 workspace boundary，避免跨项目污染 |
| Worker 状态 | Indexed Folders / Mirror rebuild / relation discovery 应有 job state、progress、cancel |
| Source 去重 | Investigation 输出 citation 时对同一 source/quote 去重 |
| Provider interface | 未来 embedding/vector provider 做 trait/interface，不绑定单一实现 |
| Collector 思路 | 网页、GitHub repo、Obsidian vault、Paperless 等可作为后续 import adapters |
| Memory injection | Journal 可参与上下文，但必须标为“记忆线索”而非证据 |

### Thepoint 落地建议

当前不引入服务端 worker。可以把 anything-llm 的 worker 思路转成 Tauri command + SQLite job 表：

| 表 | 字段 |
|---|---|
| `background_jobs` | `id, kind, target_kind, target_id, status, progress, message, started_at, finished_at, cancel_requested` |
| `indexing_runs` | `id, folder_id, started_at, finished_at, file_count, changed_count, error_count` |
| `mirror_runs` | `id, root_path, status, exported_count, pruned_count, error_json` |

### 不适合直接照搬

- 独立 Node server、Prisma、外部 vector DB 与 Thepoint 当前 Tauri/Rust 边界冲突。
- Agent scheduling、router、多用户 workspace 对本地单用户桌面应用过重。
- RAG 功能如果早于 citation reliability，会放大幻觉风险。

### 适配优先级

后续借鉴 RAG/worker/provider；立即借鉴 source de-dupe、job state、collector adapter 思路。

## Foam

### 定位与技术栈

Foam 是 VS Code 上的 Markdown personal knowledge management 系统。它的价值在“文件即知识库”：用 Markdown parser 解析 wikilink、tag、alias、section、block anchor、footnote，再构建 graph。它适合 Thepoint 的 Indexed Folders 和 Related Assets。

### 代码证据

| 路径 | 观察 |
|---|---|
| `packages/foam-core/src/model/foam.ts` | bootstrap workspace、graph、tags、watcher |
| `packages/foam-core/src/services/datastore.ts` | `IDataStore` 抽象 list/read/write/delete/move/exists/watchers |
| `packages/foam-core/src/services/markdown-parser.ts` | unified/remark parser，抽取 wikilinks/tags/aliases/sections/block anchors/footnotes |
| `packages/foam-core/src/services/graph-data-builder.ts` | 构建 graph，保留 placeholder nodes |
| `packages/foam-vscode/src/vscode/features/ai/related-notes.ts` | embedding related notes panel，按阈值筛选 |

### 核心特点

Foam 不要求用户迁移到专有数据库；它扫描文件夹并从 Markdown 中恢复结构。其 graph builder 对不存在但被引用的页面创建 placeholder node，这对保持链接完整很重要。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| Indexed Folders | Thepoint 应抽象 `IndexedDataStore`，而不是每个命令直接读文件 |
| Markdown 元数据 | 抽取 tags、aliases、headings、sections、block anchors，生成 Source metadata |
| Placeholder assets | Related Assets 中引用到不存在或未导入的文件时保留 placeholder |
| Graph data builder | 从 Source links、Point citations、Journal co-occurrence 构建图谱 |
| Related notes | 后续 embedding related 可作为 Related Assets 的一个 source_kind |

### Thepoint 落地建议

短期增强 Indexed Folders：

| 功能 | 实现建议 |
|---|---|
| Markdown metadata extraction | Rust 或前端无关 parser，保存 `indexed_files.metadata_json` |
| Wikilink/link relations | 写入 `asset_relations(relation='links_to')` |
| Heading anchors | Source location 支持 `heading + line range` |
| Placeholder relation | `to_kind='external_placeholder'` 或 `asset_relations.meta_json` |
| Watch refresh | 先手动 rescan，后续再 filesystem watcher |

### 不适合直接照搬

- VS Code extension 生命周期与 UI 不适合。
- Foam 的文件优先理念不能替代 Thepoint 的 SQLite 资产库，因为 Thepoint 需要 AI 生成记录、证据、报告、复习状态和画廊。

### 适配优先级

立即借鉴 Markdown metadata、folder abstraction、placeholder graph。

## Foliole

### 定位与技术栈

Foliole 是增量阅读和复习工具，虽然 star 少，但与 Thepoint 当前 Research Workspace 极接近：阅读材料、导入、复习队列、外部文件夹、Open Data Mirror、附件、LAN companion sync、agent-control、测试覆盖都非常贴近。

### 代码证据

| 路径 | 观察 |
|---|---|
| `src/store/reviewQueuePlanner.ts` | FSRS review + reading queue + priority inheritance + material dispersion |
| `lib/core/sync/syncSessionService.ts` | pull/push session orchestration |
| `lib/core/sync/syncPackManifest.ts` | sync pack manifest |
| `lib/core/sync/syncPack*Executor.ts` | state rows、node apply、object payload、review log、attachment/content blobs 等拆分执行器 |
| `electron/database/externalSearch*.ts` | external folder search、cache、preview、mirror availability |
| `electron/mirror/*.ts` | mirror output、attachment link rewrite、stable naming、prune |
| `electron/agentControl/*.ts` | 本地 agent-control server、materials projection、audit、virtual folders |
| `electron/attachments/*.ts` | local/remote/clipboard attachment import、protocol/cache/guards |
| `tests/desktop/*.spec.ts` | review、mirror、external folder、anchors、import、settings 等 e2e |

### 核心特点

Foliole 的强项是“阅读工作流的完整闭环”。它不是只存一篇文章，而是管理导入来源、阅读进度、复习队列、附件、镜像导出、外部文件夹、同步诊断。尤其 `reviewQueuePlanner.ts` 证明复习不只是 spaced repetition，也要考虑阅读材料分散、优先级继承、shelved ancestor、reading active state。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| Review Queue | Thepoint 现有简单间隔可升级为 priority + due + available + inherited priority |
| Reading dispersion | 避免复习队列连续塞同一 Source 的相邻材料 |
| Mirror | 稳定文件名、附件链接重写、manifest、prune、current article export |
| External Search Cache | Indexed Folder 搜索结果可预览、缓存、增量刷新 |
| Attachment pipeline | 本地图片、远程图片、剪贴板图片分入口，统一 attachment asset |
| Sync diagnostics | 即便不做同步，也可为 mirror/index/review 做 diagnostics snapshot |
| Agent-control | 后续可把 Thepoint 材料投影成只读 agent materials，而不是让 agent 直接操作 DB |

### Thepoint 落地建议

短期最值得吸收：

| Feature | Thepoint 版本 |
|---|---|
| `review_items.priority` | 加入 priority 继承和 filtering |
| `review_items.available_at` | 区分 due 和 available，避免刚导入全部涌入 |
| `review_queue_plan` command | 返回候选数、队列数、overflow、reason |
| `mirror_manifest.json` | 每个导出文件记录 asset kind/id/source hash/exported_at |
| `mirror_prune` | 删除已不存在资产的旧 mirror 文件，需用户确认 |
| `external_search_cache` | 对 indexed folders 做 preview cache，避免每次全量扫 |

### 不适合直接照搬

- Foliole 是 Electron/Capacitor 多端结构；Thepoint 不应引入 Electron 或 companion LAN sync。
- Agent-control HTTP-ish 接口当前不适合 Thepoint，但其 materials projection 和 audit 概念可后置。
- FSRS 可后续替换，不应第一步复杂化已有 Review Queue。

### 适配优先级

立即借鉴 Review Queue planner、Mirror、External Search Cache；sync/agent-control 后续。

## Joplin

### 定位与技术栈

Joplin 是跨平台、本地优先、可同步、可加密的笔记应用。对 Thepoint 的价值在于成熟 model 层、同步器、搜索引擎和 E2EE。它证明大型本地应用需要稳定 BaseModel、事务、mutex、迁移和兼容策略。

### 代码证据

| 路径 | 观察 |
|---|---|
| `packages/lib/BaseModel.ts` | 基础 model enum、table abstraction、save/delete、diff、mutex、SQL helper |
| `packages/lib/models/BaseItem.ts` | 可同步 item 的共有行为 |
| `packages/lib/Synchronizer.ts` | 同步主流程、状态处理、冲突/远端目标抽象 |
| `packages/lib/services/search/SearchEngine.ts` | 搜索服务层 |
| `packages/lib/services/e2ee/EncryptionService.ts` | 多版本加密、AES-256-GCM/PBKDF2、chunked file encryption |

### 核心特点

Joplin 最大的工程启示是：本地优先不是“只要 SQLite”。真正难的是长期演化：模型兼容、同步状态、加密版本、锁、迁移、搜索重建、跨端行为一致。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| BaseModel | Thepoint 的 Source/Point/Evidence/Report/Journal 可抽取共同 CRUD/metadata/soft delete 模式 |
| Save mutex | 避免同一 asset 并发保存导致索引/关系状态错乱 |
| Search engine service | 搜索不应散落在页面 command 中，应有 Rust service |
| E2EE 思想 | API Key 和后续导出备份可借鉴 key derivation/versioned encryption |
| Sync-ready fields | 即便不做同步，也可预留 `updated_at/deleted_at/version` |

### Thepoint 落地建议

短期把“工程模型层”补强：

| 建议 | 说明 |
|---|---|
| 统一 metadata columns | `created_at, updated_at, deleted_at, version` |
| mutation helpers | Rust DB helpers 统一更新时间、soft delete、FTS refresh |
| search service | `search_assets(query, filters)` command 返回统一类型 |
| encryption versioning | 本地 API key 或备份导出记录算法版本 |
| migration tests | 每次新增表都要有 migration smoke |

### 不适合直接照搬

- Joplin 的多端同步协议和 E2EE 全量实现对当前 Thepoint 过重。
- React Native/CLI/Desktop 多客户端结构不适合迁入。

### 适配优先级

立即借鉴 BaseModel/搜索/迁移质量思想；同步/E2EE 完整实现后置。

## Khoj

### 定位与技术栈

Khoj 是 self-hostable AI second brain，重点是 agents、chat、web/docs 检索、automations、model configs。它的价值在于 Agent 数据模型、隐私/安全 prompt 检查、streaming/non-streaming chat、ProcessLock，以及“记忆不是证据”的上下文组织。

### 代码证据

| 路径 | 观察 |
|---|---|
| `src/khoj/database/models/__init__.py` | Django models，包含 chat context、Agent、ProcessLock、search/model configs、web scrapers |
| `src/khoj/processor/embeddings.py` | embedding pipeline |
| `src/khoj/search_type/text_search.py` | text search |
| `src/khoj/processor/conversation/utils.py` | conversation utilities |
| `src/khoj/processor/conversation/prompts.py` | prompt templates |
| `src/khoj/routers/api_chat.py` | streaming/non-streaming chat |
| `src/khoj/routers/api_agents.py` | agent persona、input tools、output modes、privacy、safe prompt checks |

### 核心特点

Khoj 把 Agent 当成持久对象，而不是一次 prompt：persona、tools、model、privacy、输出模式、web scraper/search configs 都有数据模型。这对 Thepoint 后续“研究助手”很重要，但当前不应直接开放复杂 Agent。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| Agent as config | Thepoint 的评论员/框架/调查助手可统一成 `assistant_profiles` |
| ProcessLock | 长任务如 folder scan、mirror rebuild、relation discovery 防重入 |
| Privacy flags | 每次联网搜索/模型调用明确是否允许发送内容 |
| Chat contexts | Investigation 可保存 prompt context manifest，便于复查 |
| Safe prompt checks | 用户自定义 agent/prompt 需校验危险设置 |

### Thepoint 落地建议

短期可把现有“评论员”和“框架解读”升级为 profile：

| 表 | 作用 |
|---|---|
| `assistant_profiles(id, kind, name, system_prompt, model_profile_id, privacy_level, enabled)` | 统一评论员、框架、调查助手 |
| `ai_invocations(id, task_kind, profile_id, input_refs_json, output_ref, privacy_level, created_at)` | 审计 AI 调用 |
| `process_locks(lock_key, owner, acquired_at, expires_at)` | 防止重复扫描/导出 |

### 不适合直接照搬

- Django/web server/automations 与 Thepoint 当前桌面架构冲突。
- Agent privacy 复杂度要在 UI 能解释后再开放。

### 适配优先级

后续借鉴 Agent profile；立即借鉴 process lock 和 privacy metadata。

## Kotaemon

### 定位与技术栈

Kotaemon 是文档 RAG/QA 系统，重点是 Document/RetrievedDocument 抽象、citation QA、多 evidence mode、GraphRAG/LightRAG/NanoGraphRAG、引用高亮。对 Thepoint 的 Investigation 和 Evidence 价值很高。

### 代码证据

| 路径 | 观察 |
|---|---|
| `libs/kotaemon/kotaemon/base/schema.py` | `Document` 接收任意 content，带 source/channel；`RetrievedDocument` 带 score 和 retrieval_metadata |
| `libs/kotaemon/kotaemon/indices/qa/citation_qa.py` | answer + citation pipeline、text/table/figure/chatbot evidence mode、streaming、citation/mindmap 并行线程 |
| `libs/kotaemon/kotaemon/indices/qa/citation.py` | citation extraction |
| `libs/kotaemon/kotaemon/indices/qa/format_context.py` | evidence mode formatting |
| `libs/ktem/ktem/index/file/graph/*` | GraphRAG 等图谱检索管线 |

### 核心特点

Kotaemon 把 evidence mode 当作一等输入。文本、表格、图像、预制 chatbot scenario 的 prompt 和渲染方式不同。它还在回答后做 citation matching，把模型引用的 evidence quote 匹配回 docs，并生成 highlight spans。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| Evidence mode | Thepoint 的 Evidence 应区分 text/table/image/web/pdf-snippet/generated |
| Channel | 检索结果可分 chat/info/index/debug，Thepoint 可分 answer/source/debug/citation |
| Citation span matching | 保存 quote 后尝试在 source/highlight 中定位 start/end |
| QA score | 如果模型返回 logprob 或置信信号，记录为辅助，不当事实 |
| 引用可视化 | Investigation 查看页高亮被引用原文段落 |
| Mindmap 后置 | 后续可基于 citations 生成调查图谱，不作为第一阶段 |

### Thepoint 落地建议

短期为 `DigestCitation` 增加定位字段：

| 字段 | 说明 |
|---|---|
| `quote` | 当前已有/应保留 |
| `source_text_hash` | 引用时源文本 hash |
| `span_start` / `span_end` | 能定位时保存 |
| `locator_status` | `located/multiple/not_found/stale` |
| `evidence_mode` | `text/table/image/pdf/web/generated` |
| `citation_confidence` | 可选，默认 null |

### 不适合直接照搬

- Python pipeline、LlamaIndex/LangChain 依赖不适合当前 Rust-only core。
- GraphRAG 需要稳定 chunk/entity/relation 基础，当前后置。

### 适配优先级

立即借鉴 citation span matching 和 evidence mode；RAG/GraphRAG 后续。

## Logseq

### 定位与技术栈

Logseq 是 block-based outliner 和 knowledge graph。它对 Thepoint 的核心价值在 DataScript/Datalog 思维：每个 block 是可查询事实，页面、引用、属性、任务、标签都是图中的关系。

### 代码证据

| 路径 | 观察 |
|---|---|
| `deps/db/src/logseq/db.cljs` | DataScript transaction pipeline、validation、batch tx、page/block helpers |
| `deps/outliner/src/logseq/outliner/datascript.cljs` | outliner 与 DataScript 更新 |
| `deps/outliner/src/logseq/outliner/page.cljs` | page 层逻辑 |
| `cli/lib/block.ml` | CLI block model |
| `cli/lib/query.ml` | Datalog query DSL rules，parent/class-extends/refs/properties/tags/task/priority |

### 核心特点

Logseq 的方法论是 block graph。用户看的是大纲，系统存的是实体-属性-关系。查询能力强，因为每个属性都结构化进入图谱。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| Asset relation rules | Thepoint 的 Related Assets 可从 SQL joins 升级为规则集合 |
| Properties | Source/Point/Evidence/Journal 支持结构化 properties，而不只是 tags_json |
| Task/Review | Review Queue 可被视作一种 asset property |
| Datalog 思路 | 不必引入 DataScript，但可建立可解释 relation discovery rules |
| Outliner UX | Point 子块和 Evidence 子块适合 tree/outliner 快捷编辑 |

### Thepoint 落地建议

短期新增 relation discovery rules 配置，而不是硬编码：

| Rule | SQL 来源 |
|---|---|
| same_source | Point/Evidence 引用同一 Source |
| cites_same_quote | citation quote/hash 相同 |
| journal_cooccurs | 同一 Journal 引用多个 assets |
| review_cooccurs | 同一 review session 出现 |
| report_contains | Report citation includes asset |

### 不适合直接照搬

- DataScript/Clojure 技术栈不适合 Thepoint。
- 全量 block graph 重构会推翻现有 SQLite schema，不应作为第二阶段。

### 适配优先级

后续借鉴查询规则；立即借鉴 relation rules 和 properties 思路。

## Marginalia

### 定位与技术栈

Marginalia 是 library-science-inspired PKM with LLM agents。它 star 不高，但与 Thepoint 的“研究材料 + AI + citation”贴近。最值得看的是 Agent runtime 和 e2e 测试如何把 metadata、catalog、tag、recall、file read 串起来。

### 代码证据

| 路径 | 观察 |
|---|---|
| `src/marginalia/agent/runtime.py` | plan-execute runtime、`NO_PLAN` fast path、budget tiers、tool-call dedup、doom-loop guard、structured truncation、multimodal fallback |
| `src/marginalia/agent/tools/recall_knowledge.py` | recall knowledge tool |
| `src/marginalia/citations.py` | citation helpers |
| `src/marginalia/api/routes_agent.py` | agent API |
| `tests/test_agent_tools_e2e.py` | seed/test 覆盖 catalogs、tags/aliases、materialized views、search_metadata、recall_knowledge、read_entries_metadata、read_files、compression |

### 核心特点

Marginalia 不是把 Agent 做成无限自由的聊天框，而是围绕知识库工具构建运行时：计划、预算、去重、截断、防循环。测试里预置真实 metadata 和 tools，保证 agent 能检索、读元数据、读文件、压缩上下文。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| Agent budget | Thepoint 后续 Investigation agent 每次最多 N 次工具调用 |
| Tool-call dedup | 相同 search/read 参数重复调用直接复用或阻止 |
| Structured truncation | 超长 Source/Journal 进入模型前有可解释裁剪 |
| Materialized views | 为 agent/read tools 建只读 view，而非开放全 DB |
| E2E tool tests | Thepoint 可为 investigation scope builder 写端到端 fixture |

### Thepoint 落地建议

即使不做 Agent，也可先用 Marginalia 方法改进 Investigation：

| 能力 | 说明 |
|---|---|
| scope manifest | 生成前保存本次调查使用了哪些 source/point/evidence/journal |
| context budget report | UI 显示哪些材料被裁剪、为什么 |
| deduped context | 同一 quote/source 不重复塞入模型 |
| recall vs evidence | Journal recall 与 final evidence 分通道 |
| e2e fixture | 构造一个小知识库测试 investigation citation coverage |

### 不适合直接照搬

- Python/FastAPI runtime 与 Thepoint 当前架构不合。
- Agent 自动工具执行需等权限和确认模型成熟。

### 适配优先级

立即借鉴 Investigation context budgeting 和 e2e tests；Agent runtime 后续。

## Memos

### 定位与技术栈

Memos 是轻量自托管 memo/quick capture。它对 Thepoint 的价值在 Go store 层、动态过滤、Markdown metadata、轻量 API/MCP、visibility/payload 模型。它不是复杂研究工具，但捕获和过滤做得干净。

### 代码证据

| 路径 | 观察 |
|---|---|
| `store/memo.go` | Memo model、visibility、payload、CRUD、delete cleanup relations/attachments |
| `store/db/sqlite/memo.go` | dynamic filters、ordering、joins、payload protojson |
| `internal/filter/parser.go` | CEL-like filter condition builder、schema validation、`now` frozen |
| `internal/markdown/markdown.go` | goldmark service，抽取 tags/mentions/properties/snippets、server render、tag rename |
| `server/router/mcp/service.go` | OpenAPI-driven MCP endpoint using in-process API adapter、curated tools、origin checks |

### 核心特点

Memos 的关键是“简单捕获 + 强过滤”。它通过 Markdown 解析抽取 tag/mention/property/snippet，通过 filter parser 构造受控查询，而不是把所有高级搜索交给自由 SQL。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| Quick capture | Thepoint 可以有快速 Journal/Point capture，不必每次走完整 Explore |
| Filter parser | Review/Source/Journal 列表支持受控 filter DSL |
| Markdown properties | Source notes 和 Journal 支持 frontmatter/properties |
| Delete cleanup | 删除 Source/Point 时清理 relation/attachment/review/mirror state |
| MCP 思路 | 当前不做 MCP，但可学习“curated tools + origin checks + in-process adapter” |

### Thepoint 落地建议

短期适合做一个 query filter grammar：

| 示例 | 含义 |
|---|---|
| `kind == "source" and tag == "ai"` | 查 AI 相关 Source |
| `due <= now and priority >= 2` | 查到期复习 |
| `citation_status == "unsupported"` | 查无引用结论 |
| `source_kind in ["indexed_folder","web"]` | 查来源类型 |

### 不适合直接照搬

- Web/self-hosted 架构不适合。
- MCP 当前被 Research Workspace 明确暂缓。

### 适配优先级

立即借鉴 filter DSL、Markdown metadata、quick capture。

## Quivr

### 定位与技术栈

Quivr 是 opinionated RAG 库/应用，核心价值在配置化 RAG workflow、LangChain/LangGraph、history filtering、question rewrite、retrieval、compression、cited answer、streaming metadata final chunk。

### 代码证据

| 路径 | 观察 |
|---|---|
| `core/quivr_core/rag/quivr_rag.py` | LangChain RAG chain、contextual compression、history filtering、standalone question、cited answer tool binding、streaming metadata final chunk |
| `core/quivr_core/rag/quivr_rag_langgraph.py` | LangGraph workflow、task splitting、task completion、tools、final answer model |
| `core/quivr_core/rag/entities/config.py` | RetrievalConfig、WorkflowConfig、NodeConfig、reranker config、默认 workflow |
| `core/quivr_core/processor/registry.py` | 文件扩展名 lazy processor registry、priority fallback |
| `core/tests/test_quivr_rag.py` | streaming metadata assertions |

### 核心特点

Quivr 把 RAG 视为 workflow，而不是一个函数。默认链路 start→filter_history→rewrite→retrieve→generate 可以配置节点；streaming 时最后一块携带 metadata，适合 UI 在回答结束后展示 sources。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| Workflow config | Thepoint Investigation 可把 gather→rank→generate→verify→save 拆为可测试步骤 |
| Final metadata chunk | AI 流式输出结束时返回 citation coverage、used sources、warnings |
| Processor registry | Indexed Folders 按扩展名注册 processor，并有 fallback |
| History filtering | Journal/previous reports 进入上下文前过滤 |
| Task splitting | 后续 deep research 可把复杂问题拆子任务 |

### Thepoint 落地建议

短期可把 Investigation command 输出结构化为：

| 字段 | 说明 |
|---|---|
| `markdown` | 生成正文 |
| `citations` | 引用数组 |
| `coverage` | cited/inferred/unsupported counts |
| `context_manifest` | 输入材料 id 与裁剪状态 |
| `warnings` | 无引用、材料过长、来源过旧等 |

### 不适合直接照搬

- LangChain/LangGraph Python 依赖不适合当前 Rust core。
- Reranker/vectorstore 后置。

### 适配优先级

立即借鉴 workflow metadata 和 processor registry；RAG implementation 后续。

## SilverBullet

### 定位与技术栈

SilverBullet 是 Markdown personal productivity platform，以 Lua 插件/脚本和文件 space 为核心。它对 Thepoint 的价值在 Markdown space abstraction、KV datastore、命令合并、Lua query、Rust disk safety。

### 代码证据

| 路径 | 观察 |
|---|---|
| `client/data/datastore.ts` | KV wrapper，batch get/set/delete、prefix delete、query、Lua query |
| `client/space.ts` | file/page abstraction、refs、anchors、header slicing、watch/poll、dedup file list |
| `client/plugos/hooks/command.ts` | command hook 合并 built-ins、plug commands、Lua script commands；read-only filtering；throttled rebuild |
| `client/markdown_parser/parser.ts` | 扩展 Markdown，wikilinks、anchors、tags、task list、table、footnotes、Lua/custom syntax |
| `server-common/src/space/disk.rs` | Rust disk space primitives、安全 path、gitignore、symlink policy、metadata、tests |

### 核心特点

SilverBullet 把 workspace 看作 space，页面和文件是统一对象。命令系统可以合并内置命令、插件命令和脚本命令，并根据 read-only 状态过滤。Rust disk layer 对路径安全和 symlink 很谨慎。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| Space abstraction | Thepoint Indexed Folder 可称为 external space，并有统一 list/read/search |
| Command registry | 内部 command palette 合并 app commands、asset actions、review actions |
| Read-only filtering | 外部 indexed 文件默认 read-only，避免误写 |
| Path safety | Rust 侧所有 external path 做 canonicalize、root containment、symlink 策略 |
| Markdown parser extensions | Wikilink、task、table、footnote 都可进入 metadata |

### Thepoint 落地建议

短期做 action registry：

| Action | 来源 |
|---|---|
| `asset.open` | Source/Point/Evidence/Report/Gallery |
| `asset.add_to_review` | Review Queue |
| `asset.export_mirror` | Open Data Mirror |
| `asset.find_related` | Related Assets |
| `indexed_file.import_as_source` | Indexed Folders |
| `citation.locate_quote` | Citation Contract |

### 不适合直接照搬

- Lua runtime 和用户脚本会引入安全/兼容成本，当前不做。
- SilverBullet 的 Markdown-first 存储不能替代 Thepoint 的 SQLite asset graph。

### 适配优先级

立即借鉴 path safety、space/action registry；Lua 插件后置或不做。

## SiYuan

### 定位与技术栈

SiYuan 是成熟块级 PKM，Go kernel + TypeScript frontend。对 Thepoint 最有价值的是 block SQL/FTS、插件 API、Agent prompt/工具安全、SSE streaming。

### 代码证据

| 路径 | 观察 |
|---|---|
| `kernel/agent/agent.go` | 详细 system prompt、领域概念、工具规则、防捏造、tool output untrusted、doom-loop guard、confirm/question channels、editor context、plugin actions、SSE events |
| `kernel/sql/database.go` | SQL database layer |
| `kernel/sql/block.go` | `Block` model、FTS update ordering、`NodeStaticContent`、asset OCR text inclusion、cache invalidation |
| `app/src/plugin/API.ts` | plugin API surface |
| `app/src/plugin/EventBus.ts` | plugin/event bus |
| `app/src/plugin/loader.ts` | 动态 plugin JS loading、dock/topbar/layout integration |
| `app/src/layout/dock/agent/AgentChat.ts` | Agent chat UI |
| `app/src/layout/dock/agent/agentSSE.ts` | streaming agent frontend protocol |

### 核心特点

SiYuan 的 Agent prompt 是工程资产，不是临时字符串。它明确区分工具输出和用户输入，规定无法确认时提问，敏感动作确认，防止 doom loop。SQL block 更新时也注意 FTS update ordering 和 cache invalidation。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| Agent prompt as spec | Thepoint 后续 Agent system prompt 应进入源码/文档并测试 |
| Tool untrusted wrapper | 搜索/读取结果不能变成模型可执行指令 |
| Confirm/question channel | Agent 或 AI flow 遇到删除/覆盖/联网/缺资料要走确认 |
| SSE protocol | Tauri 可用 event streaming 或 command progress，消息类型要结构化 |
| FTS ordering | DB mutation 后索引更新顺序必须稳定 |
| Plugin API surface | 后续内部 API 先明确哪些能力可扩展 |

### Thepoint 落地建议

即使不做 Agent，也应规范 AI prompt 文件：

| 文件 | 作用 |
|---|---|
| `src-tauri/src/ai/prompts/investigation.md` | 调查报告生成规则、引用要求 |
| `src-tauri/src/ai/prompts/fact_check.md` | 事实审查规则 |
| `src-tauri/src/ai/prompts/journal_recall.md` | Journal 只能作为线索 |
| `src-tauri/src/ai/prompts/tool_safety.md` | 后续工具输出规则 |

### 不适合直接照搬

- 插件系统复杂，当前不宜开放。
- SiYuan 的块编辑器/内核体量巨大，不适合 Thepoint 重构。

### 适配优先级

立即借鉴 prompt safety、FTS/cache ordering；插件和 Agent 后续。

## Zettlr

### 定位与技术栈

Zettlr 是学术写作工作台。它对 Thepoint 的价值非常直接：文件系统抽象 FSAL、打开文档版本管理、远程变更处理、布尔全文搜索、citeproc 引用数据库 watcher。

### 代码证据

| 路径 | 观察 |
|---|---|
| `source/app/service-providers/documents/index.ts` | DocumentManager 管理打开文档、CodeMirror collab updates、版本历史、autosave、远程文件变更、split leaf/tab state |
| `source/app/service-providers/fsal/index.ts` | FSAL descriptor cache、watcher、workspace reindex、safe delete、recursive read、supported file loader |
| `source/app/service-providers/search/index.ts` | Boolean full-text search queue、progress IPC、cancel |
| `source/app/service-providers/citeproc/index.ts` | citeproc-js engine、CSL/BibTeX/BibLaTeX watcher、citation/bibliography rendering、attachment lookup |

### 核心特点

Zettlr 把文件系统访问包在 service provider 中。DocumentManager 不直接随意读写文件，而是维护 document version、lastSavedContent、updates、save timeout、remote change dialog、watch path sync。Citeproc provider 监听 citation database 变化，失败时降级并广播更新。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| FSAL descriptor | Indexed Folders 应保存 descriptor，不只是 path |
| Reindex progress | 文件夹扫描返回总数、进度、错误 |
| Remote changes | 外部文件变化后标记 stale/missing，而不是静默覆盖 |
| Boolean search | 对本地文件提供可取消搜索和 progress |
| Citation DB watcher | 后续 Zotero/BibTeX 导入可 watch citation file |
| Open document state | Thepoint 未来编辑 Source/Journal 时需处理未保存/外部变更 |

### Thepoint 落地建议

短期做 `indexed_file_descriptors`：

| 字段 | 说明 |
|---|---|
| `path` | absolute/canonical path |
| `name` / `extension` | 展示与 processor registry |
| `size_bytes` / `modified_at` | stale detection |
| `content_hash` | 可选，变更判断 |
| `descriptor_kind` | text/code/markdown/html/json/csv/binary/unsupported |
| `read_status` | ok/permission_denied/missing/too_large/unsupported |
| `metadata_json` | headings/tags/aliases/frontmatter |

### 不适合直接照搬

- Electron service provider/IPC 结构不适合 Tauri。
- CodeMirror collab updates 当前不是 Thepoint 核心。

### 适配优先级

立即借鉴 FSAL/search/citation watcher 思路。

## Zotero

### 定位与技术栈

Zotero 是文献管理和引用生态的标杆。对 Thepoint 的核心价值在附件生命周期、全文索引、引用数据库、PDF/EPUB/text 处理、插件生命周期和 storage sync 进度。Thepoint 不会变成 Zotero，但应学习其“来源资产严谨性”。

### 代码证据

| 路径 | 观察 |
|---|---|
| `chrome/content/zotero/xpcom/attachments.js` | import/link attachment、snapshot、embedded image、relative base path、storage directory、post-process indexing |
| `chrome/content/zotero/xpcom/fulltext.js` | PDF/EPUB/text extraction、cache file、semantic splitter、index state、sync state、processor queue |
| `chrome/content/zotero/xpcom/storage.js` | storage sync progress、compression tracker、download percentage、sync errors |
| `chrome/content/zotero/xpcom/plugins.js` | plugin sandbox、bootstrap lifecycle、locale aggregation、blocklist、observer hooks |
| `reader/`、`note-editor/`、`translators/`、`styles/` | 阅读器、笔记、导入转换、CSL 样式生态 |

### 核心特点

Zotero 最重要的是 attachment model。文件可以是 imported file、imported URL、linked file、linked URL、embedded image；路径可以是 storage 内部路径或 base attachment path 相对路径；导入后会 post-process 进入全文索引。Fulltext 模块区分 unavailable/unindexed/partial/indexed/queued，PDF/EPUB/text 各有处理和 cache 文件。

### 可借鉴点

| 方向 | 可借鉴能力 |
|---|---|
| Attachment link modes | Thepoint Source 附件/图片应区分 imported/linked/indexed/embedded |
| Relative base path | Mirror/Indexed Folder 可用相对路径增强迁移性 |
| Fulltext cache | 对 PDF/EPUB/HTML 后续抽取文本时保存 cache，不每次重抽 |
| Index state | `unindexed/partial/indexed/queued/missing` 状态比 boolean 更可靠 |
| Semantic splitter | CJK/英文分词差异要考虑，不能只按空格 |
| Plugin lifecycle caution | 插件需要 blocklist/version/l10n/lifecycle，说明当前不宜做 |

### Thepoint 落地建议

短期将 attachment/source 状态做细：

| 表/字段 | 说明 |
|---|---|
| `source_files.link_mode` | imported_file/linked_file/indexed_file/web_snapshot/embedded_image |
| `source_files.base_path_kind` | absolute/library_relative/mirror_relative |
| `source_index_state` | unavailable/unindexed/partial/indexed/queued/stale/missing |
| `source_text_cache` | extracted_text_path 或 DB text cache |
| `source_file_stats` | indexed_chars/total_chars/indexed_pages/total_pages |

### 不适合直接照搬

- XPCOM/Firefox extension runtime 不适合。
- Zotero 全文索引和插件生态非常大，Thepoint 只吸收概念和状态机。

### 适配优先级

立即借鉴 source/attachment lifecycle 与 index state；PDF/EPUB 深处理后续。

## 总体优先级矩阵

| 能力 | 参考项目 | 价值 | 难度 | 建议阶段 |
|---|---|---:|---:|---|
| Citation locator status | Kotaemon、Zotero、Zettlr | 高 | 中 | 立即 |
| Indexed file descriptor cache | Zettlr、Foam、SilverBullet | 高 | 中 | 立即 |
| Mirror manifest/prune | Foliole、Zotero | 高 | 中 | 立即 |
| Review priority/filter | Foliole、Memos | 高 | 低-中 | 立即 |
| Filter DSL lite | Memos、Zettlr、Logseq | 中-高 | 中 | 立即 |
| Investigation context manifest | Marginalia、Quivr | 高 | 中 | 立即 |
| AI invocation audit | Khoj、SiYuan | 中-高 | 中 | 立即 |
| Background job state | anything-llm、Zettlr、Foliole | 高 | 中 | 立即 |
| Action registry / command palette | SilverBullet、SiYuan | 中 | 中 | 后续近端 |
| Processor registry | Quivr、Zettlr | 中 | 中 | 后续近端 |
| Attachment link modes | Zotero、Foliole | 高 | 中-高 | 后续近端 |
| Embedding related assets | Foam、AppFlowy、Khoj | 中 | 高 | 后续 |
| RAG workflow | Quivr、Kotaemon、anything-llm | 高 | 高 | 后续 |
| Agent runtime guardrails | SiYuan、Marginalia、Khoj | 高 | 高 | 后续 |
| Plugin runtime | Zotero、SiYuan、SilverBullet | 中 | 很高 | 暂缓 |
| LAN/device sync | Foliole、Joplin、AFFiNE | 中 | 很高 | 暂缓 |
| Full block editor | AFFiNE、Logseq、SiYuan | 不确定 | 很高 | 不建议当前做 |

## 对 Thepoint 的最关键启发

Thepoint 的独特方向不是复刻任何一个项目，而是把它们的优点压缩成本地优先研究闭环：

1. 从 Zotero/Zettlr 学“来源严谨”：来源、附件、引用、全文索引要有状态机。
2. 从 Kotaemon/Quivr 学“答案必须可审计”：AI 输出不只是一段 Markdown，还要有 citation coverage 和 context manifest。
3. 从 Foliole 学“知识要复习和导出”：Review Queue 与 Open Data Mirror 是个人知识资产可持续使用的关键。
4. 从 Foam/Logseq 学“关系是可计算的”：Related Assets 应从明确规则开始，而不是完全依赖 embedding。
5. 从 Marginalia/SiYuan 学“Agent 要被约束”：先做工具安全、预算、确认、引用，再谈自动化。
6. 从 Joplin/AFFiNE 学“工程边界决定寿命”：模型层、迁移、索引、测试、同步-ready 字段比 UI 功能堆叠更重要。
