# 炼化参考项目代码检视索引

> 日期：2026-07-06  
> 范围：`炼化/` 下 16 个本地克隆项目  
> 目标：为 Thepoint 的本地优先研究工作台、证据/引用、检索、复习、开放镜像、插件/Agent 能力提供可落地参考。

## 检视方法

这次不是 README 摘要，而是按下面三层做代码检视：

1. **全量索引**：扫描每个仓库的文件数量、代码扩展名分布、顶层目录、超大源码/生成文件，建立项目规模和技术栈轮廓。
2. **核心路径深读**：优先阅读与 Thepoint 相关的存储、索引、同步、引用、插件、RAG、文档解析、复习队列、Agent Runtime、命令边界、测试契约等文件。
3. **关键实现抽样验证**：对每个项目至少选取能代表架构决策的源码路径，核对数据结构、边界处理、异步/队列/同步/引用逻辑，而不是只看产品介绍。

边界说明：`炼化/` 当前包含数万文件，其中很多是生成物、图标、语言包、锁文件、构建产物或第三方 vendored 代码。本报告基于全量索引和核心路径阅读，不声称逐行人工阅读每一个文件。对 Thepoint 的建议只引入与现有 **Tauri 2 + Rust + SQLite/rusqlite + React/Vite/Tailwind + typed Tauri command API** 匹配的模式；当前阶段不建议引入 HTTP sidecar、MCP、embedding/rerank 或复杂云同步。

## 当前 Thepoint 约束

- 后端是 Tauri 内 Rust Core，不是独立 HTTP 服务。
- 前端不能直接散落 `invoke()`，必须走 `frontend/src/api/` typed command 边界。
- 持久层是本地 SQLite，优先保证 Source / Point / Evidence / Report / Journal / Related / Review / Mirror / Indexed Folders 的可靠结构。
- `docs/research-workspace.md` 已明确暂缓 Python sidecar、MCP、embedding/rerank、OCR、多模态深处理、复杂同步服务器。
- 因此，本报告中的“可立即借鉴”主要指本地 SQLite 表、Rust/Tauri command、前端状态/UX、可审计引用格式、轻量索引和测试方法；“后续借鉴”才包括语义检索、RAG、插件运行时、LAN 同步等。

## 项目清单与规模

GitHub 元数据来自 `.trellis/tasks/07-06-high-star-oss-references/research/github-metadata.json`，本地规模来自 2026-07-06 对 `炼化/` 的扫描。

| 项目 | GitHub | Stars | 主语言 | 本地文件 | code-like 文件 | 相关性 |
|---|---:|---:|---|---:|---:|---|
| AFFiNE | toeverything/AFFiNE | 70,098 | TypeScript | 10,037 | 8,797 | 块编辑、白板、数据库、同步、local-first 工作台 |
| AppFlowy | AppFlowy-IO/AppFlowy | 73,328 | Dart/Rust | 4,592 | 3,145 | Notion 式 workspace、Rust plugin、AI/embedding、本地数据 |
| anything-llm | Mintplex-Labs/anything-llm | 62,621 | JavaScript | 1,405 | 1,226 | 本地/自托管 RAG、文档向量、Agent、扩展采集器 |
| memos | usememos/memos | 61,334 | Go/TypeScript | 1,026 | 1,001 | 轻量捕获、Markdown 解析、可组合过滤、MCP/OpenAPI |
| joplin | laurent22/joplin | 55,445 | TypeScript | 8,416 | 5,976 | 本地笔记、跨端同步、E2EE、搜索、模型层 |
| siyuan | siyuan-note/siyuan | 44,929 | TypeScript/Go | 2,361 | 1,589 | 块级知识库、SQLite/FTS、插件、Agent prompt、安全边界 |
| logseq | logseq/logseq | 43,692 | Clojure/ClojureScript | 2,100 | 1,652 | DataScript 块图谱、Datalog 查询、outliner 方法学 |
| quivr | QuivrHQ/quivr | 39,185 | Python | 228 | 171 | RAG chain、LangGraph workflow、引用答案、流式元数据 |
| khoj | khoj-ai/khoj | 35,484 | Python | 699 | 502 | AI second brain、agents、Django models、文本/语义检索 |
| kotaemon | Cinnamon/kotaemon | 25,518 | Python | 414 | 337 | 文档 QA、citation pipeline、GraphRAG、证据高亮 |
| foam | foambubble/foam | 17,270 | TypeScript | 651 | 564 | Markdown 知识图谱、wikilink、tag、VS Code 体验 |
| zotero | zotero/zotero | 14,638 | JavaScript | 3,478 | 1,071 | 文献管理、附件、全文索引、引用、插件生态 |
| Zettlr | Zettlr/Zettlr | 13,236 | TypeScript/Vue | 964 | 703 | 学术写作、FSAL、citeproc、布尔搜索、文档窗口 |
| silverbullet | silverbulletmd/silverbullet | 5,597 | TypeScript/Rust | 924 | 866 | Markdown space、Lua 插件/命令、文件抽象、安全路径 |
| marginalia | shenmintao/marginalia | 201 | Python/TS | 463 | 415 | Library-science PKM、agent runtime、citation/metadata 工具 |
| foliole | campfirium/foliole | 73 | TypeScript | 4,856 | 4,694 | 增量阅读、复习队列、镜像导出、LAN companion sync、agent-control |

## GitHub URL 与本地 clone 状态

| 项目 | URL | Stars | 本地路径 | 状态 |
|---|---|---:|---|---|
| AFFiNE | https://github.com/toeverything/AFFiNE | 70,098 | `炼化/AFFiNE` | 已 clone，已索引 |
| anything-llm | https://github.com/Mintplex-Labs/anything-llm | 62,621 | `炼化/anything-llm` | 已 clone，已索引 |
| AppFlowy | https://github.com/AppFlowy-IO/AppFlowy | 73,328 | `炼化/AppFlowy` | 已 clone，已索引 |
| foam | https://github.com/foambubble/foam | 17,270 | `炼化/foam` | 已 clone，已索引 |
| foliole | https://github.com/campfirium/foliole | 73 | `炼化/foliole` | 已存在，重新纳入分析 |
| joplin | https://github.com/laurent22/joplin | 55,445 | `炼化/joplin` | 已 clone，已索引 |
| khoj | https://github.com/khoj-ai/khoj | 35,484 | `炼化/khoj` | 已 clone，已索引 |
| kotaemon | https://github.com/Cinnamon/kotaemon | 25,518 | `炼化/kotaemon` | 已 clone，已索引 |
| logseq | https://github.com/logseq/logseq | 43,692 | `炼化/logseq` | 已 clone，已索引 |
| marginalia | https://github.com/shenmintao/marginalia | 201 | `炼化/marginalia` | 已存在，重新纳入分析 |
| memos | https://github.com/usememos/memos | 61,334 | `炼化/memos` | 已 clone，已索引 |
| quivr | https://github.com/QuivrHQ/quivr | 39,185 | `炼化/quivr` | 已 clone，已索引 |
| silverbullet | https://github.com/silverbulletmd/silverbullet | 5,597 | `炼化/silverbullet` | 已 clone，已索引 |
| siyuan | https://github.com/siyuan-note/siyuan | 44,929 | `炼化/siyuan` | 已 clone，已索引 |
| Zettlr | https://github.com/Zettlr/Zettlr | 13,236 | `炼化/Zettlr` | 已 clone，已索引 |
| zotero | https://github.com/zotero/zotero | 14,638 | `炼化/zotero` | 已 clone，已索引 |

## 顶层技术轮廓

| 项目 | 主要目录/技术信号 |
|---|---|
| AFFiNE | `blocksuite/`、`packages/`、`tests/`，Yarn 4 monorepo；大量 TypeScript/Swift/Rust/SQL；BlockSuite schema、SQLite nbstore、sync pipeline |
| AppFlowy | `frontend/`、`frontend/rust-lib/`，Dart + Rust；AI plugin、embedding indexer、SQLite retriever |
| anything-llm | `server/`、`frontend/`、`collector/`，Prisma/SQLite、Express-ish server、embedding worker、vector DB provider |
| foam | `packages/foam-core/`、`packages/foam-vscode/`，TypeScript workspace graph、remark parser、VS Code integration |
| foliole | `electron/`、`lib/core/`、`src/`、`tests/`，Electron + SQLite + React，sync pack、mirror、review、agent-control |
| joplin | `packages/lib/`、`packages/app-*`，TypeScript monorepo；BaseModel、sync、E2EE、search |
| khoj | `src/khoj/`、`tests/`，Django/FastAPI-style routers、models、agents、processor/search |
| kotaemon | `libs/kotaemon/`、`libs/ktem/`，pipeline components、retrieval/citation/GraphRAG |
| logseq | `deps/db/`、`deps/outliner/`、`cli/`，DataScript、Datalog、OCaml CLI |
| marginalia | `src/marginalia/`、`tests/`，SQLite/Postgres-style metadata, agent runtime, citations |
| memos | `store/`、`internal/`、`server/`、`web/`，Go store/router + React frontend；memo model、filter parser、markdown service、MCP |
| quivr | `core/quivr_core/rag/`，LangChain/LangGraph RAG，config-driven workflow |
| silverbullet | `client/`、`server-common/`、`plug-api/`，Markdown parser、KV datastore、Lua command hooks、Rust disk space |
| siyuan | `kernel/`、`app/src/`，Go kernel + TS frontend；SQL block index、plugin API、Agent SSE |
| Zettlr | `source/app/service-providers/`、`source/common/`，Electron service providers、FSAL、citeproc、search |
| zotero | `chrome/content/zotero/xpcom/`、`reader/`、`note-editor/`、`translators/`，Firefox/XPCOM app、attachments/fulltext/plugins |

## 深读证据路径

### AFFiNE

- `package.json`：Yarn 4 monorepo、lint/type/test 脚本和工程治理。
- `blocksuite/affine/all/src/schemas.ts`：内置 block schema 列表，覆盖 paragraph、list、note、divider、image、surface、bookmark、frame、database、embed、table、callout 等。
- `packages/common/nbstore/src/index.ts`
- `packages/common/nbstore/src/impls/sqlite/v1/db.ts`
- `packages/common/nbstore/src/sync/index.ts`：`Sync` 组合 doc/blob/awareness/indexer sync，并区分 local/remotes。

### AppFlowy

- `frontend/rust-lib/flowy-ai/src/lib.rs`：Rust plugin event map，集中注册 chat、completion、local AI、model selection、custom prompt DB config。
- `frontend/rust-lib/flowy-ai/src/event_handler.rs`：命令 handler 校验 payload；`chat_file_handler` 限制 pdf/md/txt，最大 10MB。
- `frontend/rust-lib/flowy-ai/src/embeddings/indexer.rs`：`IndexerProvider`、`EmbeddingModel::NomicEmbedText`、document indexer。
- `frontend/rust-lib/flowy-ai/src/local_ai/chat/retriever/sqlite_retriever.rs`：LangChain Rust `VectorStore` retriever 和 RAG id filters。

### anything-llm

- `server/prisma/schema.prisma`：workspace、documents、vectors、chats、agent invocations、memory、scheduled jobs、routers 等 SQLite/Prisma schema。
- `server/models/documents.js`
- `server/models/workspace.js`
- `server/models/vectors.js`
- `server/jobs/embedding-worker.js`：child process queue、progress IPC、vectorize docs、cancel/remove handling。
- `server/utils/chats/index.js`：slash command expansion、prompt history、memory injection、source de-dupe。
- `server/utils/vectorDbProviders/base.js`：多 vector DB provider 接口。
- `collector/extensions/index.js`：签名扩展端点，覆盖 repo、YouTube、website-depth、Confluence、Obsidian、Paperless。

### foam

- `packages/foam-core/src/model/foam.ts`：workspace/bootstrap、graph、tags、watcher。
- `packages/foam-core/src/services/datastore.ts`：`IDataStore` list/read/write/delete/move/exists/watchers 抽象。
- `packages/foam-core/src/services/markdown-parser.ts`：unified/remark parser，wikilinks、tags、aliases、sections、block anchors、footnotes、cache。
- `packages/foam-core/src/services/graph-data-builder.ts`：graph data builder 和 placeholder nodes。
- `packages/foam-vscode/src/vscode/features/ai/related-notes.ts`：embedding related notes panel，阈值约 0.6。

### foliole

- `lib/core/sync/syncSessionService.ts`：pull/push session orchestration。
- `lib/core/sync/syncPullExecutor.ts`
- `lib/core/sync/syncPackManifest.ts`
- `lib/core/sync/syncPack*Executor.ts`：state rows、node apply、object payload、review log、attachment/content blobs 等 pack 维度。
- `src/store/reviewQueuePlanner.ts`：FSRS + reading queue + priority/inheritance + material dispersion。
- `electron/database/externalSearch*.ts`：外部文件夹索引、缓存、mirror availability、preview。
- `electron/mirror/*.ts`：Open Data Mirror 输出、附件链接重写、稳定命名、prune。
- `electron/agentControl/*.ts`：本地 agent-control server、materials projection、audit、虚拟文件夹。
- `electron/attachments/*.ts`：附件导入、远程图片 pipeline、protocol、cache、guard。

### joplin

- `packages/lib/BaseModel.ts`：基础 model enum、DB table abstraction、diff/save mutex、SQL helper。
- `packages/lib/models/BaseItem.ts`
- `packages/lib/Synchronizer.ts`
- `packages/lib/services/search/SearchEngine.ts`
- `packages/lib/services/e2ee/EncryptionService.ts`：旧 SJCL variants + 新 AES-256-GCM/PBKDF2 methods、chunked file encryption。

### khoj

- `src/khoj/database/models/__init__.py`：Django models，包含 Pydantic chat context、Agent、ProcessLock、search/model configs、web scrapers。
- `src/khoj/processor/embeddings.py`
- `src/khoj/search_type/text_search.py`
- `src/khoj/processor/conversation/utils.py`
- `src/khoj/processor/conversation/prompts.py`
- `src/khoj/routers/api_chat.py`：streaming/non-streaming chat。
- `src/khoj/routers/api_agents.py`：persona、input tools、output modes、privacy、safe prompt checks。

### kotaemon

- `libs/kotaemon/kotaemon/base/schema.py`：`Document`、`RetrievedDocument`、message abstractions。
- `libs/kotaemon/kotaemon/indices/vectorindex.py`
- `libs/kotaemon/kotaemon/indices/qa/citation_qa.py`：多 evidence mode、citation pipeline、mindmap、streaming answer、answer/source span matching。
- `libs/kotaemon/kotaemon/indices/qa/citation_qa_inline.py`
- `libs/kotaemon/kotaemon/indices/qa/citation.py`
- `libs/kotaemon/kotaemon/indices/qa/format_context.py`
- `libs/kotaemon/kotaemon/indices/ingests/files.py`
- `libs/ktem/ktem/index/file/graph/*`：GraphRAG/LightRAG/NanoGraphRAG 管线。
- `libs/kotaemon/tests/test_indexing_retrieval.py`
- `libs/kotaemon/tests/test_ingestor.py`

### logseq

- `deps/db/src/logseq/db.cljs`：DataScript transaction pipeline、validation、batch tx、page/block helpers。
- `deps/outliner/src/logseq/outliner/datascript.cljs`
- `deps/outliner/src/logseq/outliner/page.cljs`
- `cli/lib/block.ml`
- `cli/lib/query.ml`：Datalog query DSL rules，覆盖 parent/class-extends/refs/properties/tags/task/priority。

### marginalia

- `src/marginalia/agent/runtime.py`：plan-execute runtime、`NO_PLAN` fast path、budget tiers、tool-call dedup、doom-loop guard、structured truncation、multimodal fallback。
- `src/marginalia/agent/tools/recall_knowledge.py`
- `src/marginalia/citations.py`
- `src/marginalia/api/routes_agent.py`
- `tests/test_agent_tools_e2e.py`：seed/test 覆盖 catalogs、tags/aliases、materialized views、search_metadata、recall_knowledge、read_entries_metadata、read_files、compression。

### memos

- `store/memo.go`：Memo model、visibility、payload、CRUD、delete cleanup relations/attachments。
- `store/db/sqlite/memo.go`：dynamic filters、ordering、joins、payload protojson。
- `internal/filter/parser.go`：CEL-like filter condition builder、schema validation、`now` frozen。
- `internal/markdown/markdown.go`：goldmark service，抽取 tags/mentions/properties/snippets、server render、tag rename。
- `server/router/mcp/service.go`：OpenAPI-driven MCP endpoint using in-process API adapter、curated tools、origin checks。

### quivr

- `core/quivr_core/rag/quivr_rag.py`：LangChain RAG chain、contextual compression、history filtering、standalone question、cited answer tool binding、streaming metadata final chunk。
- `core/quivr_core/rag/quivr_rag_langgraph.py`：LangGraph workflow、task splitting、task completion、tools、final answer model。
- `core/quivr_core/rag/entities/config.py`：RetrievalConfig、WorkflowConfig、NodeConfig、reranker config、默认 workflow start→filter_history→rewrite→retrieve→generate。
- `core/quivr_core/processor/registry.py`：按扩展名 lazy processor registry、priority fallback。
- `core/tests/test_quivr_rag.py`：streaming metadata 断言。

### silverbullet

- `client/data/datastore.ts`：KV wrapper，batch get/set/delete、prefix delete、query、Lua query。
- `client/space.ts`：file/page abstraction、refs、anchors、header slicing、watch/poll、dedup file list。
- `client/plugos/hooks/command.ts`：command hook 合并 built-ins、plug commands、Lua script commands；read-only filtering；throttled command rebuild。
- `client/markdown_parser/parser.ts`：扩展 Markdown，wikilinks、anchors、tags、task list、table、footnotes、Lua/custom syntax。
- `server-common/src/space/disk.rs`：Rust disk space primitives、安全 path、gitignore、symlink policy、metadata、tests。

### siyuan

- `kernel/agent/agent.go`：系统 prompt、领域概念、工具规则、防捏造、untrusted tool output wrapper、doom-loop guard、confirm/question channels、editor context、plugin actions、SSE events。
- `kernel/sql/database.go`
- `kernel/sql/block.go`：`Block` model、FTS update ordering、`NodeStaticContent`、asset OCR text inclusion、cache invalidation。
- `app/src/plugin/API.ts`
- `app/src/plugin/EventBus.ts`
- `app/src/plugin/loader.ts`：plugin API surface、动态 JS loading、event bus、dock/topbar/layout integration。
- `app/src/layout/dock/agent/AgentChat.ts`
- `app/src/layout/dock/agent/agentSSE.ts`：streaming agent frontend protocol。

### Zettlr

- `source/app/service-providers/documents/index.ts`：DocumentManager、CodeMirror collab updates、版本历史、autosave、远程文件变更处理、split leaf/tab state。
- `source/app/service-providers/fsal/index.ts`：FSAL 文件系统抽象、descriptor cache、watcher、workspace reindex、safe delete、recursive read、supported file loader。
- `source/app/service-providers/search/index.ts`：Boolean full-text search provider、cancel/search queue、progress IPC。
- `source/app/service-providers/citeproc/index.ts`：citeproc-js engine、CSL/BibTeX/BibLaTeX database watcher、citation/bibliography rendering、attachment lookup。
- `test/` 下 database loader、graph、bibtex attachment、search terms、markdown AST 相关测试。

### zotero

- `chrome/content/zotero/xpcom/attachments.js`：import/link attachment、snapshot、embedded image、relative base path、storage directory、post-process indexing。
- `chrome/content/zotero/xpcom/fulltext.js`：PDF/EPUB/text full-text extraction、cache file、semantic splitter、index state、sync state、processor queue。
- `chrome/content/zotero/xpcom/storage.js`：storage sync progress、compression tracker、download percentages、sync error flow。
- `chrome/content/zotero/xpcom/plugins.js`：plugin sandbox、bootstrap lifecycle、locale aggregation、blocklist、observer hooks。
- 另有 `reader/`、`note-editor/`、`translators/`、`styles/`、`chrome/content/zotero/xpcom/citeproc.js` 等文献/引用生态核心。

## 解释优先级

下游分析按以下优先级解释参考价值：

1. **可直接转化为 Thepoint 数据模型或命令**：如 citation contract、review queue、indexed folders、mirror manifest、source relation。
2. **可转化为 Rust/Tauri 本地模块**：如 FSAL、安全路径、文件 watcher、FTS 索引、附件缓存、SQLite 队列。
3. **可转化为前端工作台体验**：如 split panes、related panel、search preview、review toolbar、command palette。
4. **需要后续架构阶段才适合**：如 RAG pipeline、embedding worker、GraphRAG、plugin runtime、LAN sync。
5. **当前不适合**：如 Electron/XPCOM runtime、全量 block editor 重写、云协同协议、独立 HTTP 服务。
