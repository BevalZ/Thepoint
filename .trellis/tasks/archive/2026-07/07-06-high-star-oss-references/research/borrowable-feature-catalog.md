# 可借鉴功能与方法清单

> 日期：2026-07-06  
> 来源：`炼化/` 下 16 个参考项目代码检视  
> 用途：把逐项目分析转成 Thepoint 可拆解的功能库。

## 阅读方式

本清单按功能类别整理。每一项都包含：

- **参考项目**：主要代码启发来源。
- **可借鉴点**：项目中已经证明有效的产品/架构/实现方式。
- **Thepoint 加法**：可落到 Thepoint 的具体功能或工程改造。
- **阶段**：立即、近期、后续、暂缓。

## 1. 本地资料与 Source 生命周期

| 功能 | 参考项目 | 可借鉴点 | Thepoint 加法 | 阶段 |
|---|---|---|---|---|
| Source link mode | Zotero、Foliole、Zettlr | 区分 imported file、linked file、URL snapshot、embedded image、indexed-only | 为 Source/附件增加 `link_mode`，不要把所有来源都当成同一种本地记录 | 近期 |
| External file descriptor | Zettlr、Foam、SilverBullet | 文件 descriptor 记录类型、mtime、size、可读性、缓存状态 | `indexed_file_descriptors`，用于 Indexed Folders 稳定扫描和预览 | 立即 |
| Stale/missing 状态 | Zotero、Zettlr、Foliole | 外部文件可能被删除、移动、权限变化，不应静默失败 | Indexed Folder 和 Source 文件显示 `stale/missing/permission_denied` | 立即 |
| Read-only external space | SilverBullet、Foam | 外部文件默认只读，编辑要显式进入导入/写回流程 | Indexed Folder 默认 preview，不直接改原文件 | 立即 |
| Safe path policy | SilverBullet、Zettlr | canonicalize、root containment、symlink 策略、ignore 规则 | Rust 侧所有文件访问统一路径守卫 | 立即 |
| Content cache | Zotero、Zettlr | PDF/HTML/EPUB/text 抽取后缓存，避免重复解析 | `indexed_file_text_cache` 或 Source text cache | 近期 |
| Attachment storage | Zotero、Foliole | 附件与主记录分离，按 item/id 管理目录和资源 | Gallery、Evidence image、网页截图、PDF cache 统一走 attachment/blob 表 | 近期 |
| Relative base paths | Zotero、Foliole | 相对路径提高迁移性，mirror/attachment 可跨机器 | Mirror 和外部库路径支持 base dir relative | 近期 |

## 2. Indexed Folders 与外部搜索

| 功能 | 参考项目 | 可借鉴点 | Thepoint 加法 | 阶段 |
|---|---|---|---|---|
| Folder scan job | Zettlr、anything-llm、Foliole | 扫描是长任务，需要进度、取消、错误汇总 | `background_jobs` + `scan_indexed_folder` 返回 job id | 立即 |
| Incremental rescan | Zettlr、Foliole | mtime/size/hash 决定是否重读 | 对 unchanged 文件跳过重建 preview/FTS | 立即 |
| Processor registry | Quivr、Zettlr | 按扩展名注册 parser/processor，有 fallback | `markdown/text/html/json/csv/code` 初版 processor registry | 近期 |
| Markdown metadata | Foam、Memos、SilverBullet | tags、aliases、wikilinks、headings、frontmatter、tasks | Indexed Markdown 自动生成 metadata 和 relations | 立即 |
| Search preview cache | Foliole、Zettlr | 搜索结果有 preview，不需要每次读文件 | `external_search_cache` 或 `indexed_file_text_cache.preview_text` | 立即 |
| Boolean search | Zettlr | AND/OR/phrase/case-sensitive 的可解释全文搜索 | Indexed Folders 和统一搜索支持轻量布尔查询 | 近期 |
| Search cancellation | Zettlr、anything-llm | 长搜索要可取消，不阻塞 UI | 搜索 command 支持 job/cancel 或分页 | 近期 |
| Unsupported file policy | Zotero、Zettlr | Unsupported 也记录元数据，不强行解析 | PDF/EPUB/DOCX 先记录 metadata，深处理后置 | 立即 |

## 3. 引用、证据与可信度

| 功能 | 参考项目 | 可借鉴点 | Thepoint 加法 | 阶段 |
|---|---|---|---|---|
| Citation locator | Kotaemon、Zotero | quote 能匹配回原文时保存 span | `locator_status + span_start/span_end + source_text_hash` | 立即 |
| Claim status | Quivr、Kotaemon、Marginalia | 回答中区分 cited、inferred、unsupported | `report_claims.claim_status`，保存前提示无引用结论 | 立即 |
| Evidence mode | Kotaemon | text/table/figure/chatbot prompt 与展示不同 | `evidence_mode = text/table/image/pdf/web/generated` | 立即 |
| Citation audit panel | Zotero、Zettlr、Quivr | 用户能复查来源、引用、参考文献 | Report/Investigation 页面显示 citation coverage | 立即 |
| Journal as recall only | Marginalia、Khoj | 记忆可召回但不能当最终事实 | Journal 进入 context_manifest，但 final citation 不能只指向 Journal | 立即 |
| Stale citation recheck | Zotero、Zettlr | 来源变化后索引/引用状态要更新 | `validate_report_citations` 标记 stale/not_found | 立即 |
| Bibliography/citeproc bridge | Zettlr、Zotero | CSL/BibTeX 文件 watch 与引用渲染 | 后续支持导入 BibTeX/CSL，为 Source 增加文献信息 | 后续 |
| Evidence highlight UI | Kotaemon、Zotero reader | 引用来源在原文里高亮 | Citation hover/jump to source span | 近期 |

## 4. Investigation 与 AI 工作流

| 功能 | 参考项目 | 可借鉴点 | Thepoint 加法 | 阶段 |
|---|---|---|---|---|
| Context manifest | Marginalia、Quivr | 保存进入模型的材料、裁剪原因、角色 | `investigation_context_items` | 近期 |
| Output metadata chunk | Quivr | 流式输出最后返回 sources/metadata/warnings | Investigation 返回 `markdown + citations + coverage + warnings` | 近期 |
| Context budget | Marginalia | 超长材料结构化截断，而非任意截断 | UI 展示 included/truncated/excluded | 近期 |
| Source de-dupe | anything-llm、Marginalia | 同一 source/quote 不重复进入上下文 | Investigation scope builder 去重 | 近期 |
| Prompt versioning | SiYuan、Khoj | prompt 是工程资产，需版本化 | `prompt_version` 写入 `ai_invocations` | 近期 |
| AI invocation audit | Khoj、Marginalia | 模型、输入、输出、warnings 可追溯 | `ai_invocations` 表 | 近期 |
| Privacy flags | Khoj | 标记是否允许联网/发送原文 | 模型调用前记录 `privacy_level`，UI 展示 | 近期 |
| Workflow steps | Quivr | filter_history→rewrite→retrieve→generate 这类 workflow 可测试 | Investigation 拆 gather→rank→generate→validate→save | 后续 |

## 5. Review Queue 与学习节奏

| 功能 | 参考项目 | 可借鉴点 | Thepoint 加法 | 阶段 |
|---|---|---|---|---|
| Priority | Foliole、Memos | 队列排序不只看 due，也看 priority | `review_items.priority` | 立即 |
| Available vs due | Foliole | 可出现时间与到期时间分离 | `available_at` 防止刚导入全涌入队列 | 立即 |
| Queue plan stats | Foliole | 返回候选数、overflow、最终队列 | `build_review_queue_plan` 返回 counts/reasons | 立即 |
| Material dispersion | Foliole | 避免同一来源连续出现 | 同 Source Evidence 默认分散 | 立即 |
| Filter review queue | Memos、Foliole | 按 kind/tag/priority/due 过滤 | Review 页面 filter DSL | 近期 |
| Review session record | Foliole、Joplin | 记录本次复习序列和 grade | `review_sessions` + `review_session_items` | 近期 |
| FSRS scheduler | Foliole | 基于记忆曲线调度 | 保留 `scheduler_state_json`，后续替换简单间隔 | 后续 |
| Review diagnostics | Foliole | 缺附件、缺原文、同步状态影响复习 | Review item 显示 target missing/stale 状态 | 近期 |

## 6. Open Data Mirror 与导出

| 功能 | 参考项目 | 可借鉴点 | Thepoint 加法 | 阶段 |
|---|---|---|---|---|
| Stable filenames | Foliole、Zotero | 文件名安全、稳定、可覆盖 | `id_prefix + safe_title` 命名 | 立即 |
| Manifest | Foliole | 记录导出资产、hash、路径、错误 | `manifest.json` v2 | 立即 |
| Export plan | Foliole、Joplin | 导出前计算 add/update/delete | `build_open_data_mirror_plan` | 立即 |
| Prune old files | Foliole | 清理失效镜像，但要确认 | `prune_open_data_mirror` | 近期 |
| Attachment link rewrite | Foliole、Zotero | Markdown 中附件链接重写为相对路径 | Gallery/attachment 导出路径稳定 | 近期 |
| Current asset export | Foliole | 单篇文章/资产即时导出 | Source/Report 页面 `export current` | 近期 |
| Mirror diagnostics | Foliole | 记录缺附件、写入失败、路径冲突 | Settings Mirror 页面显示 errors/warnings | 近期 |
| Bibliography export | Zettlr、Zotero | 报告可附参考文献 | Investigation 导出可附 citations/bibliography | 后续 |

## 7. Search、Filter 与 Related Assets

| 功能 | 参考项目 | 可借鉴点 | Thepoint 加法 | 阶段 |
|---|---|---|---|---|
| Unified search | Joplin、Zettlr、SiYuan | 搜索服务层，而不是页面拼查询 | `search_assets` 覆盖多资产 | 近期 |
| Filter DSL | Memos | 受控表达式转 SQL，schema validation | `kind/tag/due/priority/source_kind/citation_status` | 近期 |
| Relation rules | Logseq、Foam | 图谱关系来自明确规则 | Related rebuild 使用 rule registry | 近期 |
| Placeholder nodes | Foam | 被引用但未导入的节点仍可显示 | External placeholder asset/relation | 后续 |
| Co-citation graph | Logseq、Kotaemon | 同一报告/证据共引形成关系 | `report_cocitation` relation | 近期 |
| Journal cooccurrence | Marginalia、Logseq | 记忆共现可召回 | `journal_cooccurrence` relation | 近期 |
| Review cooccurrence | Foliole | 同一次复习出现可形成弱关系 | `review_session_cooccurrence` | 后续 |
| Embedding related | Foam、Khoj、AppFlowy | 语义相似作为一个 relation source | `relation.source_kind='embedding'` 后置 | 后续 |

## 8. Agent 与工具安全

| 功能 | 参考项目 | 可借鉴点 | Thepoint 加法 | 阶段 |
|---|---|---|---|---|
| Tool output untrusted | SiYuan | 工具结果不能被模型当用户指令 | 后续 agent tool wrapper | 后续 |
| Budget tiers | Marginalia | 限制工具调用和上下文预算 | `max_tool_calls/max_context_chars` | 后续 |
| Doom-loop guard | SiYuan、Marginalia | 重复失败/重复调用停止 | tool-call dedup + loop detector | 后续 |
| Confirmation channel | SiYuan | 删除/覆盖/联网必须确认 | Agent action requires confirmation | 后续 |
| Read-only tools first | Marginalia、Khoj | 先开放 search/read，不开放写/删 | 第一版 agent 只读 | 后续 |
| Materials projection | Foliole、Marginalia | 给 agent 只读视图，不开放 DB | `agent_materials_view` | 后续 |
| Agent profiles | Khoj | persona/tools/privacy/model 是配置 | `assistant_profiles` | 后续 |
| Agent audit | Marginalia、Foliole | 记录工具调用、材料、结果 | `agent_runs` / `agent_tool_calls` | 后续 |

## 9. 插件、命令与扩展

| 功能 | 参考项目 | 可借鉴点 | Thepoint 加法 | 阶段 |
|---|---|---|---|---|
| Internal action registry | SilverBullet、SiYuan | 命令集中注册，UI 统一消费 | `asset.open/add_to_review/export/find_related` | 近期 |
| Command palette | SilverBullet、Zettlr | 全局入口触发命令 | Thepoint command palette | 近期 |
| Read-only command filtering | SilverBullet | 根据上下文过滤危险动作 | 外部文件/只读资产不显示编辑动作 | 近期 |
| Plugin API surface | SiYuan、Zotero | 插件要有明确生命周期/API/权限 | 当前只设计内部 API surface，不开放第三方 | 暂缓 |
| Plugin sandbox/blocklist | Zotero | 插件需要沙箱、blocklist、版本管理 | 若未来开放插件，先做安全设计 | 暂缓 |
| Lua/script commands | SilverBullet | 用户脚本强大但风险高 | 不建议当前做 | 暂缓 |
| MCP bridge | Memos | 可从 OpenAPI 生成工具，但需 origin/权限 | 当前暂缓，先内部 action registry | 暂缓 |

## 10. 同步、备份与迁移

| 功能 | 参考项目 | 可借鉴点 | Thepoint 加法 | 阶段 |
|---|---|---|---|---|
| Versioned records | Joplin、Foliole | 即使不做同步，也保留版本/更新时间 | 关键表补 `updated_at/version/deleted_at` | 近期 |
| Mutation logs | Joplin、Foliole | 同步/审计依赖变更日志 | 对高价值资产可记录 mutation history | 后续 |
| Backup catalog | Foliole、Joplin | 备份要有 catalog、retention、restore tests | 本地 DB backup/restore | 后续 |
| Sync diagnostics | Foliole | 同步状态要可诊断 | 当前可借鉴给 index/mirror/review diagnostics | 近期 |
| LAN companion sync | Foliole | 配对、认证、pack/cursor、primary takeover 很复杂 | 暂不做 | 暂缓 |
| Cloud sync/E2EE | Joplin、AFFiNE | 加密、冲突、远端目标成本高 | 暂不做；先本地导入/导出 | 暂缓 |

## 11. UI/UX 工作台体验

| 功能 | 参考项目 | 可借鉴点 | Thepoint 加法 | 阶段 |
|---|---|---|---|---|
| Search preview panel | Foliole、Zettlr | 结果旁边显示上下文，减少跳转 | Unified search preview | 近期 |
| Citation hover/jump | Zotero、Kotaemon | 引用可跳原文/高亮 | Report citation hover + jump | 近期 |
| Review toolbar | Foliole | 当前阅读/复习状态常驻可见 | Bottom/right review controls | 近期 |
| Split panes/tabs | Zettlr、AFFiNE | 多材料并排阅读 | 后续 Source/Report 并排对照 | 后续 |
| Graph/related panel | Foam、Logseq | 关系视图帮助探索 | Related side panel with reasons | 近期 |
| Import preview dialog | Foliole、Memos | 导入前预览变化 | Indexed file import preview | 立即 |
| Diagnostics surface | Foliole、anything-llm | 长任务/索引/导出有状态面板 | Settings diagnostics | 近期 |
| Quick capture | Memos | 快速记录低摩擦 | Quick Journal/Point capture | 近期 |

## 12. 工程质量与测试

| 方法 | 参考项目 | 可借鉴点 | Thepoint 加法 | 阶段 |
|---|---|---|---|---|
| Boundary checks | AFFiNE、Foliole、Thepoint existing | 防止跨层依赖和 direct invoke | 继续强化 `check:boundaries` | 立即 |
| Migration tests | Joplin、Foliole | 本地 DB 长期演进必须测试 | 每次 schema 改动加 migration smoke | 立即 |
| File-system fixtures | Zettlr、SilverBullet、Foliole | 路径、权限、symlink、missing 都要测 | Indexed Folder tests | 立即 |
| Citation fixtures | Kotaemon、Zotero、Quivr | quote locating、stale、multiple match | Citation Locator tests | 立即 |
| Mirror tests | Foliole | stable naming、link rewrite、prune | Mirror tests | 立即 |
| Agent/tool e2e | Marginalia | 用小型知识库测工具链 | Investigation audit fixture | 近期 |
| Queue planner tests | Foliole | Review queue 是纯函数，容易测试 | `build_review_queue_plan` unit tests | 立即 |
| Search parser tests | Memos、Zettlr | filter/query parser 必须覆盖错误 | Filter DSL parser tests | 近期 |

## 13. 当前不应照搬的能力

| 能力 | 参考项目 | 不照搬原因 |
|---|---|---|
| 完整 BlockSuite/块编辑器 | AFFiNE | 工程量巨大，偏离 Thepoint 当前证据/研究可靠性目标 |
| DataScript/Datalog 全量重构 | Logseq | Thepoint 已是 SQLite/Rust，重构成本过高 |
| Electron/XPCOM runtime | Zettlr、Zotero、Foliole | Thepoint 是 Tauri，不应引入 Electron/Firefox 运行时 |
| 独立 Node/Python server | anything-llm、Khoj、Quivr、Marginalia | 当前架构明确 Tauri commands，不做 sidecar |
| 外部 vector DB | anything-llm、Quivr | 当前先保证引用可靠，语义层后置 |
| 第三方插件沙箱 | Zotero、SiYuan、SilverBullet | 生命周期/权限/兼容/安全成本高 |
| LAN/mobile companion sync | Foliole、Joplin | 需要认证、冲突、pack/cursor、诊断，当前超范围 |
| 全自动 Agent 写操作 | SiYuan、Marginalia、Khoj | 没有权限/确认/审计之前风险高 |

## 建议优先开发清单

按收益/复杂度排序：

1. Indexed Folder Descriptor + preview cache。
2. Citation Locator + citation audit panel。
3. Mirror manifest v2 + export plan。
4. Review Queue priority/available/queue plan。
5. Unified Search + Filter DSL lite。
6. Related Assets rule registry。
7. Investigation context manifest + AI invocation audit。
8. Action registry + command palette。
9. Attachment/source link modes。
10. Semantic retrieval/RAG。
11. Guarded Agent。
12. Plugin/MCP/LAN sync。
