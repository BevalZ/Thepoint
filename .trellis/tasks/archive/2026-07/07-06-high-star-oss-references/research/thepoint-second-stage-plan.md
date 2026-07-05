# Thepoint 第二阶段开发路线图

> 日期：2026-07-06  
> 输入：`code-inspection-index.md`、`oss-reference-analysis.md`、Thepoint 当前 `docs/research-workspace.md`  
> 原则：先把来源、引用、索引、复习、镜像做可靠，再引入语义检索、RAG、Agent 或插件。

## 总策略

Thepoint 不应该复刻 AFFiNE、Logseq、Zotero、anything-llm 中任何一个完整系统。更合理的路线是把这些项目拆成可组合能力，按 Thepoint 当前边界逐步吸收：

| 阶段 | 目标 | 借鉴项目 | 当前适配度 |
|---|---|---|---|
| 1 | Source / Indexed Folder 可靠化 | Zettlr、Zotero、Foam、SilverBullet | 立即 |
| 2 | Citation Contract 强化 | Kotaemon、Zotero、Zettlr、Quivr | 立即 |
| 3 | Mirror / Review Queue v2 | Foliole、Memos、Joplin | 立即 |
| 4 | Search / Filter / Related v2 | Memos、Logseq、Foam、Zettlr | 近期 |
| 5 | AI invocation audit / Investigation workflow | Marginalia、Quivr、Khoj、SiYuan | 近期 |
| 6 | Semantic retrieval / RAG | anything-llm、Khoj、Kotaemon、Quivr、AppFlowy | 后续 |
| 7 | Agent / Plugin / LAN Sync | SiYuan、Marginalia、Zotero、SilverBullet、Foliole | 暂缓 |

核心判断：第二阶段的护城河不是“更像聊天机器人”，而是“每个 AI 结论都能被追溯、复查、复习、导出、重新索引”。

## 立即阶段 1：Source 与 Indexed Folder 可靠化

### 背景

当前 `docs/research-workspace.md` 已有 Indexed Folders，但仍偏“记录路径/基础索引”。Zettlr、Zotero、Foam、SilverBullet 都显示：本地文件夹索引必须有 descriptor、状态机、缓存、路径安全和变更检测。

### 目标

把 Indexed Folder 从“扫文件生成 Source”升级为“外部资料空间”：

- 能区分 text/code/markdown/html/json/csv/binary/unsupported。
- 能记录 missing、permission denied、too large、stale、indexed、partial。
- 能保存 mtime/size/hash，避免重复重建。
- 能抽取 Markdown metadata：heading、tag、alias、wikilink、frontmatter。
- 能以只读 preview 打开，不强制导入 Source。
- 所有外部路径通过 Rust canonicalization 和 root containment 校验。

### 数据模型建议

新增或扩展：

```sql
indexed_file_descriptors(
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  path TEXT NOT NULL,
  canonical_path TEXT NOT NULL,
  name TEXT NOT NULL,
  extension TEXT,
  descriptor_kind TEXT NOT NULL,
  size_bytes INTEGER,
  modified_at TEXT,
  content_hash TEXT,
  read_status TEXT NOT NULL,
  index_status TEXT NOT NULL,
  metadata_json TEXT,
  last_error TEXT,
  indexed_at TEXT,
  updated_at TEXT
);

indexed_file_text_cache(
  file_id TEXT PRIMARY KEY,
  text_hash TEXT,
  preview_text TEXT,
  extracted_chars INTEGER,
  total_chars INTEGER,
  updated_at TEXT
);
```

`descriptor_kind` 建议值：

```text
markdown | text | html | json | csv | code | pdf | epub | docx | image | binary | unsupported
```

`read_status/index_status` 建议值：

```text
ok | missing | permission_denied | too_large | unsupported | stale | queued | indexing | indexed | partial | failed
```

### Rust/Tauri commands

| Command | 作用 |
|---|---|
| `scan_indexed_folder` | 扫描目录，生成/更新 descriptor，返回 job id |
| `load_indexed_file_preview` | 读取 preview，不导入 Source |
| `import_indexed_file_as_source` | 用户确认后导入 Source |
| `refresh_indexed_file_descriptor` | 单文件刷新状态 |
| `search_indexed_files` | 基于 FTS/LIKE/metadata 的本地搜索 |

### 前端界面

- Indexed Folder 详情页显示：总数、indexed、partial、failed、missing、stale。
- 搜索结果右侧 preview panel，明确显示“外部文件，未入库”。
- 导入 Source 时显示路径、hash、修改时间、metadata。
- 对 missing/stale 文件提供“刷新/移除索引/重新导入”。

### 验收标准

- 扫描包含 Markdown、txt、json、csv、html、unsupported binary 的目录后，descriptor 状态正确。
- 改动文件 mtime 后重新扫描能标记 stale 或更新 hash。
- 删除文件后状态变为 missing，不崩溃、不删除已导入 Source。
- 路径越界、symlink 越界、权限失败有明确错误。
- 组件层不直接调用 `invoke()`，全部走 typed API。

## 立即阶段 2：Citation Contract 强化

### 背景

Thepoint 已有 `DigestCitation` 和 Investigation，但 Kotaemon、Zotero、Zettlr、Quivr 显示：引用必须有定位状态、证据模式、coverage report、保存后可复查。

### 目标

让 Investigation/Report 保存时不只是保存 Markdown，而是保存引用审计结果：

- 每条关键结论标记 cited/inferred/unsupported。
- 每条 citation 尝试 quote locator。
- 显示 citation coverage。
- Journal recall 不可作为最终事实依据。
- 保存后可重新验证引用是否 stale。

### 数据模型建议

新增或扩展 citation 记录：

```sql
report_citations(
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  quote TEXT,
  reason TEXT,
  evidence_mode TEXT,
  source_text_hash TEXT,
  span_start INTEGER,
  span_end INTEGER,
  locator_status TEXT NOT NULL,
  claim_status TEXT NOT NULL,
  created_at TEXT
);

report_claims(
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  claim_status TEXT NOT NULL,
  citation_ids_json TEXT,
  reason TEXT,
  created_at TEXT
);
```

`locator_status` 建议值：

```text
located | multiple_matches | not_found | stale | target_missing | not_applicable
```

`claim_status` 建议值：

```text
cited | inferred | unsupported | uncertain
```

### Rust/Tauri commands

| Command | 作用 |
|---|---|
| `locate_citation_quote` | 在 Source/Point/Evidence 文本中定位 quote |
| `validate_report_citations` | 对 report citations 重新计算 locator_status |
| `save_investigation_with_citations` | 保存 Markdown + claims + citations + coverage |
| `load_report_citation_audit` | 返回 coverage、unsupported claims、stale citations |

### 前端界面

- Investigation 生成结果旁边显示“引用覆盖率”。
- 每个 unsupported/inferred claim 用弱警示样式标记。
- Citation hover 显示 target、quote、reason、locator status。
- 保存前若 unsupported claims > 0，需要用户确认。

### 验收标准

- 引用 quote 能定位时保存 span。
- quote 改动或 Source 文本 hash 改变后，重新验证能标记 stale/not_found。
- Journal 被用作上下文时，最终 citation 不能只指向 Journal，除非 claim_status 是 inferred/uncertain。
- 保存后的 Report 可加载完整 citation audit。

## 立即阶段 3：Open Data Mirror v2

### 背景

当前 Mirror 是单向导出。Foliole 和 Zotero 的经验说明，Mirror 要可重复、可追踪、可清理、可处理附件链接。

### 目标

把 Mirror 从“导出一组 Markdown”升级为“可审计快照”：

- 每个导出文件稳定命名。
- `manifest.json` 记录 asset kind/id/hash/exported_at/path。
- 附件、图片、Gallery 链接可重写为相对路径。
- 支持 prune 旧文件，但必须用户确认。
- Mirror 页面显示上次导出状态和错误列表。

### Manifest 建议

```json
{
  "version": 2,
  "generated_at": "2026-07-06T00:00:00Z",
  "assets": [
    {
      "kind": "source",
      "id": "src_...",
      "title": "Example",
      "content_hash": "sha256...",
      "path": "sources/src_Example.md",
      "exported_at": "2026-07-06T00:00:00Z",
      "attachments": []
    }
  ],
  "pruned": [],
  "errors": []
}
```

### Rust/Tauri commands

| Command | 作用 |
|---|---|
| `build_open_data_mirror_plan` | 计算将导出/覆盖/删除哪些文件 |
| `export_open_data_mirror` | 执行导出 |
| `load_open_data_mirror_manifest` | 读取 manifest |
| `prune_open_data_mirror` | 删除已失效镜像文件，需确认 |

### 验收标准

- 同一资产重复导出覆盖同一路径，不生成重复文件。
- 删除/归档资产后，plan 能显示待 prune 文件。
- Windows 非法字符、重复标题、超长标题有稳定安全文件名。
- Markdown 内部链接和附件链接相对路径可打开。

## 立即阶段 4：Review Queue v2

### 背景

当前 Review Queue 用简单间隔。Foliole 的 `reviewQueuePlanner.ts` 提供了很好的中间形态：不必立刻引入完整 FSRS，也能增加 due/available、priority、阅读材料分散、候选统计。

### 目标

- Review target 支持 priority。
- 区分 due_at 与 available_at。
- Queue plan 返回候选数、overflow、reason。
- 支持 Review filters：due、overdue、kind、priority、source。
- 避免同一 Source 的材料连续刷屏。

### 数据模型建议

扩展 `review_items`：

```sql
ALTER TABLE review_items ADD COLUMN available_at TEXT;
ALTER TABLE review_items ADD COLUMN priority INTEGER DEFAULT 0;
ALTER TABLE review_items ADD COLUMN source_kind TEXT;
ALTER TABLE review_items ADD COLUMN source_id TEXT;
ALTER TABLE review_items ADD COLUMN scheduler_kind TEXT DEFAULT 'simple_interval';
ALTER TABLE review_items ADD COLUMN scheduler_state_json TEXT;
```

新增可选记录：

```sql
review_sessions(
  id TEXT PRIMARY KEY,
  started_at TEXT,
  ended_at TEXT,
  mode TEXT,
  item_count INTEGER
);

review_session_items(
  session_id TEXT,
  review_item_id TEXT,
  position INTEGER,
  grade TEXT,
  reviewed_at TEXT
);
```

### Commands

| Command | 作用 |
|---|---|
| `build_review_queue_plan` | 根据 mode/filter/limit 生成队列 |
| `grade_review_item` | again/hard/good/easy 更新 due/available |
| `load_review_filters` | 返回可用 kind/priority/status 统计 |
| `postpone_review_item` | 延后单项 |

### 验收标准

- `build_review_queue_plan(limit=20)` 返回候选数、最终队列、overflow。
- priority 高的项目更容易进入队列，但不会完全饿死低优先级。
- 同一 Source 的多个 Evidence 默认分散。
- again/hard/good/easy 仍兼容当前简单间隔。

## 近期阶段 5：Search / Filter / Related v2

### 背景

Memos 的 filter parser、Zettlr 的 Boolean search、Logseq 的 relation rules、Foam 的 graph builder 都说明：可解释关系和过滤，比一上来 embedding 更稳。

### 目标

- 建立统一 `search_assets`，覆盖 Source/Point/Evidence/Report/Journal/Gallery。
- 支持轻量 filter DSL。
- Related Assets 从硬编码变成规则集合。
- Search result 支持 preview、target kind、reason。

### Filter DSL 初版

优先支持有限表达式：

```text
kind == "source"
tag == "ai"
priority >= 2
due <= now
source_kind in ["indexed_folder", "web"]
citation_status == "unsupported"
created_at >= "2026-07-01"
```

不支持任意 SQL，不支持函数扩展，不支持用户自定义执行代码。

### Related rules

| Rule | 说明 |
|---|---|
| `same_source` | 多个 assets 指向同一 Source |
| `same_quote` | citations quote/hash 相同 |
| `journal_cooccurrence` | 同一 Journal 引用多个 assets |
| `report_cocitation` | 同一 Report 引用多个 assets |
| `review_session_cooccurrence` | 同一 Review session 出现 |
| `wikilink` | Indexed Markdown 中的 wikilink/frontmatter link |

### 验收标准

- filter 语法错误返回结构化错误，不拼 SQL。
- Related rebuild 可重复执行，不生成重复关系。
- 每条 relation 保存 reason/source_kind/score。
- UI 能解释“为什么相关”。

## 近期阶段 6：AI Invocation Audit 与 Investigation Workflow

### 背景

Marginalia、Quivr、Khoj、SiYuan 都表明 AI workflow 要可审计：上下文来源、裁剪、模型配置、工具/搜索结果、输出引用必须保存。

### 目标

- 每次 AI 调用都有 invocation record。
- Investigation 生成前生成 context manifest。
- 输出包含 markdown、citations、claims、coverage、warnings。
- Prompt 模板入库或源码化，并版本化。
- Journal recall 与 evidence context 分通道。

### 数据模型建议

```sql
ai_invocations(
  id TEXT PRIMARY KEY,
  task_kind TEXT NOT NULL,
  model_profile_id TEXT,
  prompt_version TEXT,
  input_refs_json TEXT,
  context_manifest_json TEXT,
  output_ref_kind TEXT,
  output_ref_id TEXT,
  token_usage_json TEXT,
  warnings_json TEXT,
  created_at TEXT
);

investigation_context_items(
  id TEXT PRIMARY KEY,
  invocation_id TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  role TEXT NOT NULL,
  included INTEGER NOT NULL,
  truncated INTEGER NOT NULL,
  reason TEXT,
  char_count INTEGER
);
```

### Prompt 文件建议

```text
src-tauri/src/ai/prompts/investigation.md
src-tauri/src/ai/prompts/fact_check.md
src-tauri/src/ai/prompts/journal_recall.md
src-tauri/src/ai/prompts/citation_validation.md
```

### 验收标准

- 任何保存的 Investigation 都能追溯到输入 assets。
- UI 能显示哪些上下文被裁剪。
- Journal context 不会被标记为 final evidence。
- prompt_version 改变后，旧报告仍能看到当时版本标识。

## 后续阶段 7：Semantic Retrieval / RAG

### 开启条件

只有当前面几项稳定后再做：

- Source descriptor/index state 稳定。
- Citation locator 与 coverage 已上线。
- Search/filter/relation 能解释。
- AI invocation audit 已存在。
- 用户确实需要“自然语言召回大库”。

### 技术路线

优先走本地可替换接口，不直接绑定外部向量库：

| 层 | 建议 |
|---|---|
| Chunking | 先按 Source/Evidence/heading/chunk 保存可回溯 locator |
| Embedding provider | OpenAI-compatible + Ollama，和 chat model profile 分离 |
| Vector storage | 优先 SQLite 可用方案或本地文件索引；外部 provider 后置 |
| Rerank | 先无 rerank，有足够数据后再加 |
| RAG output | 必须走 report citations，不允许只返回 source list |

### 参考项目

- anything-llm：worker/progress/cancel、source de-dupe、provider interface。
- Quivr：workflow config、final metadata chunk。
- Kotaemon：citation QA 和 evidence modes。
- Khoj：agent/search configs 和 privacy flags。
- AppFlowy：SQLite retriever 和 Rust AI plugin。

### 暂不做

- GraphRAG。
- 多用户 workspace RAG。
- 外部 vector DB 强依赖。
- 自动后台 embedding 所有用户文件。

## 后续阶段 8：Agent 与 Tool Runtime

### 开启条件

只有在 Investigation workflow 足够稳定后再做。Agent 第一版应是“受限研究助手”，不是自动操作系统。

### 必备护栏

| 护栏 | 来源 |
|---|---|
| tool output untrusted wrapper | SiYuan |
| budget tiers/max tool calls | Marginalia |
| duplicate tool-call dedup | Marginalia |
| doom-loop guard | SiYuan、Marginalia |
| destructive action confirmation | SiYuan |
| context manifest/citation coverage | Quivr、Kotaemon |
| privacy flags | Khoj |

### 第一版 Agent 工具范围

只读工具优先：

```text
search_assets
read_asset_summary
read_source_excerpt
load_related_assets
load_review_due_items
load_citation_audit
```

需要确认的工具：

```text
save_journal_entry
create_investigation_report
add_assets_to_review
export_open_data_mirror
```

禁用：

```text
delete_assets
modify_source_content
run_shell
read_arbitrary_file
network_fetch_without_confirmation
```

## 暂缓或不建议

| 能力 | 不建议原因 | 参考项目 |
|---|---|---|
| 全量块编辑器重写 | 高复杂度，偏离证据/研究核心 | AFFiNE、Logseq、SiYuan |
| 第三方插件沙箱 | 权限/生命周期/兼容/安全成本高 | Zotero、SiYuan、SilverBullet |
| 独立 HTTP sidecar | 当前架构明确 Tauri command 内部通信 | anything-llm、Khoj、Marginalia |
| MCP server | 当前文档明确暂缓；可先做内部 action registry | Memos |
| LAN/移动端同步 | 高复杂度，需冲突解决/认证/诊断 | Foliole、Joplin |
| 云协同/awareness | 超出本地个人研究工作台目标 | AFFiNE |
| 全自动后台 RAG | 成本高，隐私/索引/引用可靠性未稳 | anything-llm、Quivr |

## 推荐实施切片

### Slice 1：Indexed Folder Descriptor v1

交付：

- DB migration：`indexed_file_descriptors`、`indexed_file_text_cache`。
- Rust scanner：递归扫描、ignore、descriptor kind、read/index status。
- API：`scan_indexed_folder`、`load_indexed_file_preview`。
- UI：Folder status dashboard + preview panel。
- Tests：路径安全、missing/stale、unsupported、Markdown metadata。

验收：

- 不导入 Source 也能搜索和预览 indexed file。
- 文件删除/权限失败不破坏已有 Source。

### Slice 2：Citation Locator v1

交付：

- DB migration：`report_citations` locator fields。
- Rust quote locator：exact match、multiple match、not found、stale hash。
- API：`locate_citation_quote`、`validate_report_citations`。
- UI：Report citation audit panel。

验收：

- 保存 Investigation 时生成 citation coverage。
- Source 变化后能重新标记 stale。

### Slice 3：Mirror Manifest v2

交付：

- `manifest.json` v2。
- stable filename builder。
- plan/export/prune commands。
- UI：导出计划和上次导出状态。

验收：

- 重复导出稳定覆盖。
- prune 不会无确认删除。

### Slice 4：Review Queue Planner v2

交付：

- DB migration：priority、available_at、scheduler_state_json。
- `build_review_queue_plan`。
- Review filter UI。
- Session record 可选。

验收：

- due/priority/filter/limit 行为可测试。
- 同 Source 材料默认分散。

### Slice 5：Unified Search + Filter DSL v1

交付：

- Filter parser。
- `search_assets` command。
- Related rules rebuild。
- Search preview + reason display。

验收：

- filter 不拼接任意 SQL。
- relation reason 可解释。

### Slice 6：Investigation Audit v1

交付：

- `ai_invocations`、`investigation_context_items`。
- prompt_version。
- context manifest。
- output warnings/coverage。

验收：

- 每份 Investigation 可复查输入上下文和裁剪原因。
- Journal 不被误当事实证据。

## 质量要求

每个切片都要遵守当前项目边界：

- Rust command 返回 `Result<T, String>`，内部使用 `anyhow::Result`。
- 前端只通过 `frontend/src/api/` 调用 Tauri command。
- SQLite migration 要有幂等和默认值策略。
- FTS/index/mirror/relation 等派生数据必须可重建。
- 对文件系统操作必须校验 canonical path 和 workspace/root containment。
- 大任务要有 progress/status，避免 UI 假死。

建议测试矩阵：

| 能力 | 最低测试 |
|---|---|
| Indexed Folder | Rust unit/integration：路径、状态、metadata、stale |
| Citation Locator | Rust unit：exact/multiple/not_found/stale |
| Mirror | Rust unit：filename、manifest、link rewrite、prune plan |
| Review | Frontend/Rust unit：queue ordering、priority、limit |
| Search Filter | Parser unit + SQL binding test |
| Investigation Audit | End-to-end fixture：Source/Point/Evidence/Journal 输入到 Report |

## 最终推荐

Thepoint 第二阶段应优先做这条主线：

```text
Indexed Folder Descriptor
→ Citation Locator
→ Mirror Manifest
→ Review Queue Planner
→ Unified Search/Filter/Related
→ Investigation Audit
→ Semantic Retrieval/RAG
→ Guarded Agent
```

这条路线最大化复用 16 个参考项目的优点，同时保持 Thepoint 当前架构清晰：本地优先、SQLite 可审计、Tauri command 边界稳定、AI 结论必须能回到证据。
