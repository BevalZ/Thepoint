# 进一步炼化：Thepoint 下一批可从 `炼化/` 吸收的功能

> 日期：2026-07-06  
> 输入：上一轮 `炼化/` 16 项目代码检视、Thepoint 当前代码核对、已实现 Indexed Folder diagnostics 与 Citation Audit  
> 目标：把剩余可借鉴能力压缩成下一批高收益、低架构破坏、可测试的实施切片。

## 结论先行

Thepoint 现在最值得继续吸收的不是“更多 AI 聊天能力”，而是把当前本地研究工作台补成一个可靠闭环：

```text
输入资料可诊断
→ 搜索/关系可解释
→ Investigation 上下文可审计
→ Report claims/citations 可落库复查
→ Review Queue 有计划和节奏
→ Mirror 导出可追踪、可清理、可恢复
```

建议下一批优先级：

1. **Investigation Context Manifest + AI Invocation Audit**：让每次 AI 生成可追溯。
2. **Persisted Report Claims/Citations + Save-time Coverage Gate**：让报告结论可审计，而不只是引用列表可审计。
3. **Open Data Mirror v2 Plan/Manifest/Prune**：让导出成为可重复、可诊断的知识快照。
4. **Review Queue Planner v2**：让复习队列从“到期列表”升级成“可解释计划”。
5. **Unified Search + Filter DSL + Preview**：把 Source/Point/Evidence/Report/Journal/Gallery/Indexed File 搜索统一。
6. **Related Rule Registry + Relation Diagnostics**：把 Related 从黑盒结果变成可解释规则系统。
7. **Citation Jump/Highlight UI**：基于已实现 locator span，完成从 Report 引用跳回原文。
8. **Indexed Folder Import Preview + Processor Registry**：把外部文件从“可扫描”推进到“可安全导入/分类型处理”。

后续再考虑 Semantic Retrieval/RAG、Guarded Agent、Plugin/MCP、Sync。原因是这些能力如果先做，会放大当前审计、上下文、引用、导出还不够完整的问题。

---

## 1. Investigation Context Manifest + AI Invocation Audit

### 借鉴来源

- **Marginalia**：把模型使用的材料、记忆、裁剪过程当作可审计对象，而不是临时 prompt 字符串。
- **Quivr**：RAG/workflow 输出应包含 metadata、sources、warnings。
- **Khoj**：模型调用、搜索配置、隐私边界需要可追踪。
- **SiYuan**：AI 行为要带上下文边界和工具安全意识。

### Thepoint 当前状态

当前 `generate_investigation` 会：

- 收集显式 Source/Point/Evidence/Report。
- 可选搜索 Journal 和 Library。
- 拉入 Related Assets。
- 拼成 prompt 后调用模型。
- 返回 `DigestResult { content, citations }`。

短板：

- 没有记录这次模型调用的 durable invocation。
- 用户保存 Report 后，看不到当时到底用了哪些上下文、哪些被截断、哪些只是 recall clue。
- prompt 文本常量在代码里，没有 prompt version。
- 没有 token usage、warnings、model profile、privacy level 的历史记录。

### 可添加功能

新增持久表：

```sql
ai_invocations(
  id TEXT PRIMARY KEY,
  task_kind TEXT NOT NULL,
  model_profile_id TEXT,
  model_name TEXT,
  prompt_version TEXT NOT NULL,
  input_query TEXT,
  input_refs_json TEXT NOT NULL,
  context_manifest_json TEXT NOT NULL,
  output_ref_kind TEXT,
  output_ref_id TEXT,
  token_usage_json TEXT,
  warnings_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

investigation_context_items(
  id TEXT PRIMARY KEY,
  invocation_id TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  label TEXT,
  role TEXT NOT NULL,
  included INTEGER NOT NULL,
  truncated INTEGER NOT NULL,
  reason TEXT,
  char_count INTEGER,
  source_text_hash TEXT,
  created_at TEXT NOT NULL
);
```

新增 commands：

```text
load_ai_invocation(invocation_id)
list_report_invocations(report_id)
load_investigation_context_manifest(report_id)
```

改造 `generate_investigation`：

- 生成 `invocation_id`。
- 给每个上下文项分配 role：`evidence`、`source`、`point`、`prior_report`、`journal_recall`、`related_clue`。
- 记录 included/truncated/excluded reason。
- 返回 `DigestResult` 时附带 `invocationId`、`warnings`、`coverage`。
- 保存 Report 后把 `ai_invocations.output_ref_id` 回填为 report id。

### 用户价值

- 以后用户问“这份 Investigation 为什么这么写”，可以看到当时输入了哪些材料。
- Journal recall 不会混同为事实证据。
- 后续支持重跑、比较不同 prompt/model、调试幻觉更容易。
- 这是 RAG/Agent 前置地基。

### 验收标准

- 生成 Investigation 后，即使不保存 Report，也能看到本次 invocation 的上下文清单。
- 保存 Report 后，ReportModal 能显示“生成上下文”：included/truncated/excluded counts。
- Journal 项显示为 recall clue，不计入 final evidence coverage。
- prompt_version 写入记录，后续改 prompt 不影响旧报告可解释性。
- 失败调用也能记录错误/warnings，但不写 output_ref_id。

### 实施复杂度

中等。跨 Rust DB、digest command、frontend API、ReportModal/Library UI，但不需要新外部依赖。

---

## 2. Persisted Report Claims/Citations + Save-time Coverage Gate

### 借鉴来源

- **Kotaemon**：答案引用需要回到 evidence span。
- **Quivr**：最终输出应该带 sources metadata 和 warning。
- **Zotero/Zettlr**：引用是长期资产，不能只在文本里出现。
- **Marginalia**：区分 recall、inference、evidence-backed conclusion。

### Thepoint 当前状态

已实现：

- `locate_citation_quote`
- `load_report_citation_audit`
- status：`located`、`multiple_matches`、`not_found`、`stale`、`target_missing`、`not_applicable`
- ReportModal 显示 citation audit。

短板：

- Audit 仍从 `reports.citations_json` 运行时计算。
- 没有 `report_claims`，无法知道哪些结论 unsupported。
- 保存时没有 coverage gate。
- citation span 未持久化。

### 可添加功能

新增表：

```sql
report_claims(
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  claim_status TEXT NOT NULL,
  citation_ids_json TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

report_citations(
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  label TEXT,
  quote TEXT,
  excerpt TEXT,
  reason TEXT,
  evidence_mode TEXT,
  source_text_hash TEXT,
  span_start INTEGER,
  span_end INTEGER,
  locator_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

新增/改造 commands：

```text
save_report_with_audit(input)
load_report_claims(report_id)
load_report_citations(report_id)
validate_report_citations(report_id)
```

前端新增：

- 保存 Investigation 时显示 coverage summary。
- 如果 unsupported/uncertain claims > 0，给出确认。
- ReportModal 显示 claim 列表，每条 claim 旁边显示 cited/inferred/unsupported。
- citation audit 可从持久表加载；如果旧报告没有表记录，再 fallback 到 `citations_json` 动态计算。

### 用户价值

- 报告不是“漂亮 Markdown”，而是可验证知识资产。
- 保存前就能知道哪些结论没证据。
- Source 变化后能批量重查历史报告可靠性。

### 验收标准

- 保存新 Report 时生成 `report_citations` rows，并持久保存 span/hash/status。
- 保存新 Investigation 时至少能生成 claim shell：`cited` / `inferred` / `unsupported`。
- `validate_report_citations` 能更新 stale/not_found。
- 旧报告仍能打开，不因缺少新表数据失败。
- ReportModal 能按 claim/citation 两个视角查看可靠性。

### 实施复杂度

中高。需要定义 claim extraction 策略。MVP 可以先不让模型输出严格 JSON，而是从 citation labels 和段落做保守抽取；后续再让模型输出结构化 claims。

---

## 3. Open Data Mirror v2 Plan/Manifest/Prune

### 借鉴来源

- **Foliole**：导出前先 build plan，导出后 manifest 记录 hash/path/error。
- **Zotero**：附件、路径、导出资产需要稳定引用。
- **Joplin**：导出/同步类能力必须可重复、可诊断。

### Thepoint 当前状态

已有：

- `open_data_mirror_config`
- `export_open_data_mirror`
- `manifest.json` version 1
- stable-ish filename：`safe_file_stem(id, title)`

短板：

- 没有导出前 plan。
- manifest 只有 counts，没有 per-asset path/hash。
- 没有 prune plan，删除旧镜像文件只能靠用户手动清。
- 没有 export errors 明细。
- 没有 link rewrite/attachment manifest。

### 可添加功能

新增 DTO：

```ts
interface OpenDataMirrorPlan {
  rootPath: string
  generatedAt: string
  toWrite: MirrorPlanItem[]
  unchanged: MirrorPlanItem[]
  stale: MirrorPlanItem[]
  toPrune: MirrorPlanItem[]
  errors: MirrorPlanError[]
}

interface MirrorPlanItem {
  kind: AssetKind
  id: string
  title: string
  path: string
  contentHash: string
  previousHash: string | null
  action: 'write' | 'skip' | 'overwrite' | 'prune'
}
```

新增 commands：

```text
build_open_data_mirror_plan
export_open_data_mirror_plan
load_open_data_mirror_manifest
prune_open_data_mirror
```

manifest v2：

```json
{
  "version": 2,
  "generatedAt": "...",
  "assets": [
    {
      "kind": "report",
      "id": "...",
      "title": "...",
      "path": "reports/...",
      "contentHash": "sha256:...",
      "exportedAt": "...",
      "attachments": [],
      "warnings": []
    }
  ],
  "errors": [],
  "pruned": []
}
```

### 用户价值

- 导出前知道会覆盖什么、删除什么、跳过什么。
- Mirror 可作为可审计知识快照，而不是一次性 dump。
- 后续备份/恢复、Git 管理 Mirror 都更可靠。

### 验收标准

- 重复 build plan 时 unchanged 项稳定。
- 修改某个 Report 后 plan 只显示该 Report stale/overwrite。
- 删除资产后 plan 显示 toPrune，但不自动删除。
- 用户确认后 prune 才删除镜像旧文件。
- manifest v1 可兼容读取；v2 写入 per-asset 明细。

### 实施复杂度

中等。大部分在 Rust 文件生成逻辑，前端 Settings 增加 plan table。

---

## 4. Review Queue Planner v2

### 借鉴来源

- **Foliole**：review queue planner 返回候选、溢出、分散策略，而不是只查 due。
- **Memos**：轻量 filter 让用户快速聚焦。
- **Joplin**：状态变化和复习历史要可诊断。

### Thepoint 当前状态

已有：

- `review_items`
- priority：`low | normal | high`
- due_at
- complete/snooze/dismiss
- 简单 again/hard/good/easy 间隔。

短板：

- priority 是字符串且排序 `DESC` 语义可疑，`normal`/`low`/`high` 字典序不等于优先级。
- 没有 `available_at`，新导入/新加入内容可能立即拥入队列。
- `list_due_review_items` 只是列表，没有 plan stats。
- 没有同 Source 分散。
- 没有 review session record。

### 可添加功能

DB 扩展：

```sql
ALTER TABLE review_items ADD COLUMN available_at TEXT;
ALTER TABLE review_items ADD COLUMN source_kind TEXT;
ALTER TABLE review_items ADD COLUMN source_id TEXT;
ALTER TABLE review_items ADD COLUMN scheduler_kind TEXT DEFAULT 'simple_interval';
ALTER TABLE review_items ADD COLUMN scheduler_state_json TEXT;

review_sessions(
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  mode TEXT,
  item_count INTEGER NOT NULL
);

review_session_items(
  session_id TEXT NOT NULL,
  review_item_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  grade TEXT,
  reviewed_at TEXT
);
```

新增 command：

```text
build_review_queue_plan(input)
start_review_session(input)
finish_review_session(session_id)
load_review_filters
postpone_review_item
```

Queue plan 返回：

```ts
interface ReviewQueuePlan {
  now: string
  mode: 'due' | 'catchup' | 'new' | 'mixed'
  limit: number
  candidateCount: number
  dueCount: number
  overdueCount: number
  overflowCount: number
  items: ReviewQueuePlanItem[]
  excluded: ReviewQueueExclusion[]
}
```

### 用户价值

- 用户看到“为什么今天复习这些”。
- 高优先级更容易进入队列，但不会长期饿死低优先级。
- 同一来源内容分散，复习体验更像真实学习节奏。

### 验收标准

- due、available、priority、limit 都影响 plan。
- 同一 Source 的多个 Evidence 默认不连续。
- `again/hard/good/easy` 仍兼容当前简单调度。
- plan 返回 candidate/overflow/excluded reason。
- Review 页面可显示“今日计划”和原因。

### 实施复杂度

中等偏低。可以先纯 Rust planner + tests，再接 UI。

---

## 5. Unified Search + Filter DSL + Preview

### 借鉴来源

- **Memos**：受控 filter DSL，不暴露任意 SQL。
- **Zettlr**：Boolean/phrase search 与 preview 是知识库核心体验。
- **Joplin**：统一搜索入口覆盖多类资产。
- **Foam/Logseq**：搜索和关系应该联动，结果要能跳转到上下文。

### Thepoint 当前状态

已有：

- `search_workspace` 覆盖 Source/Point。
- 独立 `search_evidence`、`search_reports`、`search_journal_entries`。
- Indexed Folder 有 preview cache。

短板：

- Library 搜索仍分散在多个函数/页面逻辑。
- 不支持 filter DSL。
- 不统一返回 preview/reason/source_kind/citation_status。
- Indexed files 没有进入统一 search。

### 可添加功能

新增 unified command：

```text
search_assets(input)
```

输入：

```ts
interface SearchAssetsInput {
  query: string
  filter?: string | null
  kinds?: AssetKind[]
  limit?: number
}
```

支持的 filter 初版：

```text
kind == "source"
tag == "ai"
priority == "high"
due <= now
source_kind == "indexed_folder"
citation_status in ["stale", "not_found"]
created_at >= "2026-07-01"
```

返回：

```ts
interface SearchAssetResult {
  kind: AssetKind | 'indexed_file'
  id: string
  title: string
  snippet: string
  preview: string | null
  reason: string
  score: number
  sourceId: string | null
  chunkIndex: number | null
  metadata: Record<string, unknown>
}
```

### 用户价值

- 一个搜索框找 Source、Point、Evidence、Report、Journal、Gallery、Indexed File。
- 用户可以问“找所有 citation stale 的 report”。
- 搜索结果旁边有 preview，减少来回打开。

### 验收标准

- filter parser 不拼接任意 SQL，只允许白名单字段/operator。
- 语法错误返回结构化错误。
- Indexed files 可搜 title/path/metadata/preview。
- Report citation status 可作为 filter。
- Frontend 只走 typed API。

### 实施复杂度

中高。建议先做 parser + backend command + Library search result model，再逐步替换页面搜索。

---

## 6. Related Rule Registry + Relation Diagnostics

### 借鉴来源

- **Logseq/Foam**：关系来自可解释规则，而不是 AI 黑盒。
- **Kotaemon**：co-citation 是强关系来源。
- **Foliole**：review/session 共现是弱关系来源。
- **Marginalia**：journal cooccurrence 可以作为 recall clue。

### Thepoint 当前状态

已有：

- `asset_relations`
- `rebuild_asset_relations`
- 自动生成 report co-citation、evidence/source、journal、gallery、review 关系。

短板：

- 规则写在多个函数里，难以显示“哪些规则启用、生成多少”。
- rebuild 只有总数，不返回 per-rule diagnostics。
- 没有 relation confidence 分层或 reason template 统一。
- 用户无法禁用某类弱关系。

### 可添加功能

定义内部 rule registry：

```rust
struct RelationRule {
    id: &'static str,
    label: &'static str,
    source_kind: &'static str,
    default_score: f64,
    rebuild: fn(&Connection) -> Result<RelationRuleResult>,
}
```

新增 command：

```text
list_relation_rules
rebuild_asset_relations_with_diagnostics
load_relation_diagnostics(asset_kind, asset_id)
```

返回：

```ts
interface RelationRebuildResult {
  totalCreated: number
  rules: {
    id: string
    label: string
    created: number
    skipped: number
    errors: string[]
  }[]
}
```

### 用户价值

- Related 面板能说清楚“为什么相关”。
- 调试关系图时知道哪条规则贡献过多/过少。
- 后续 embedding relation 可以作为新 rule 插入，不破坏现有逻辑。

### 验收标准

- 每条 rule 可单测。
- rebuild 返回 per-rule counts。
- UI 显示 relation reason 和 source rule。
- 重复 rebuild 不产生重复关系。

### 实施复杂度

中等偏低。重构现有函数为 registry，风险可控。

---

## 7. Citation Jump/Highlight UI

### 借鉴来源

- **Zotero reader**：引用能跳到原文位置。
- **Kotaemon**：回答中的 source citation 可定位证据片段。
- **Zettlr**：引用与文档上下文联动。

### Thepoint 当前状态

已有：

- Citation locator 返回 `locations.start/end/snippet`。
- ReportModal 显示 first matched snippet。
- `onOpenSource(sourceId, chunkIndex)` 能打开来源 chunk。

短板：

- 只打开 source/chunk，不高亮 quote span。
- Point/Evidence citation 没有统一 jump target。
- span 是 synthesized target text 的 char offset，还未映射到具体 UI selection。

### 可添加功能

- 扩展 `onOpenSource(sourceId, chunkIndex, highlightQuote?)`。
- Source Workspace 加 `highlight` 参数，短暂高亮 quote/snippet。
- Point/Evidence 打开对应 asset card 并滚动到位置。
- ReportModal citation hover 显示更多 locator details。

### 用户价值

- Citation audit 从“知道有匹配”升级为“立刻看到原文在哪里”。
- 用户复核报告会快很多。

### 验收标准

- 点击 located citation 能打开 Source 并高亮 quote。
- multiple_matches 时允许选择具体 match。
- stale/not_found 不跳转，显示复查原因。
- 对旧 citation 没有 locator 时 graceful fallback。

### 实施复杂度

中等。主要是前端状态/滚动/高亮，backend 只需保持 locator result。

---

## 8. Indexed Folder Import Preview + Processor Registry

### 借鉴来源

- **Zettlr**：按扩展名/文件类型 processor。
- **SilverBullet/Foam**：Markdown metadata、wikilinks、frontmatter 是关系来源。
- **Zotero**：unsupported 文件也要记录 metadata，不强行解析。
- **anything-llm**：处理长任务要有 progress/cancel。

### Thepoint 当前状态

已有：

- descriptor kind/read/index status。
- Markdown headings/tags/wikilinks。
- preview cache。
- list files / load preview。

短板：

- 没有“导入为 Source 前预览变化”。
- Processor 分类逻辑仍偏函数式，不是 registry。
- scan 不是 background job，没有 progress/cancel。
- Indexed Markdown wikilinks 尚未进入 Related relations。

### 可添加功能

新增 command：

```text
build_indexed_file_import_preview(file_id)
import_indexed_file_as_source(file_id, options)
list_indexed_file_processors
```

Processor registry：

```text
markdown
text
html
json
csv
code
metadata_only
unsupported
```

Import preview 展示：

- 将创建/更新的 Source title/canonical_uri。
- chunk count。
- metadata tags/headings/wikilinks。
- 是否已有同 path/source。
- 导入后会建立的 relations。

### 用户价值

- 外部文件默认只读安全，但用户可明确导入。
- 导入前知道会发生什么，避免污染资料库。
- Markdown 笔记库可转成 Thepoint Source/Related 网络。

### 验收标准

- preview 不写 DB。
- import 明确写 Source，并保留 indexed file/source link。
- 重复 import 不生成重复 Source。
- unsupported 文件不能导入全文，只显示 metadata-only。

### 实施复杂度

中等。建议先做 import preview，不立刻做 background job。

---

## 9. Source Link Mode + Attachment/Blob Registry

### 借鉴来源

- **Zotero**：item 与 attachment 分离，linked/imported/snapshot 语义不同。
- **Foliole**：附件和导出路径要稳定。
- **Zettlr**：linked files 应保持用户原目录所有权。

### Thepoint 当前状态

当前 Source 主要由 document/chunks 表表达；Indexed File 有 `source_id` 但没有统一 source lifecycle/link mode。

### 可添加功能

Source 增加：

```sql
link_mode TEXT DEFAULT 'imported'
origin_kind TEXT
origin_path TEXT
origin_hash TEXT
```

新增 attachments：

```sql
asset_attachments(
  id TEXT PRIMARY KEY,
  owner_kind TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  attachment_kind TEXT NOT NULL,
  path TEXT,
  content_hash TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TEXT NOT NULL
)
```

### 用户价值

- 区分外部只读文件、导入快照、网页、图片、报告附件。
- Mirror v2 和 future backup 可以统一处理附件。

### 实施复杂度

中高。建议放在 Mirror v2 或 Indexed import 后做。

---

## 10. Action Registry + Command Palette

### 借鉴来源

- **SilverBullet**：内部 action registry 是命令面板、快捷键、插件化之前的核心。
- **SiYuan/Zettlr**：命令集中管理，UI 根据上下文过滤。

### Thepoint 当前状态

各页面里散落“打开 Source、加入 Review、导出、发起 Investigation、查看 Related”等动作。

### 可添加功能

前端内部 registry：

```ts
type ActionId =
  | 'asset.open'
  | 'asset.addToReview'
  | 'asset.discoverRelated'
  | 'asset.startInvestigation'
  | 'asset.exportCurrent'
  | 'report.loadCitationAudit'
  | 'source.showIndexedDiagnostics'
```

Command Palette：

- `Ctrl+K` 打开。
- 根据当前 selected asset/context 过滤动作。
- 初版只触发已有 typed API，不引入插件 API。

### 用户价值

- Thepoint 功能越来越多后，用户不必记每个按钮在哪。
- 为后续 guarded agent/tool runtime 提供内部 action surface。

### 实施复杂度

中等偏低。前端为主，但要保持 action 不绕过 typed API。

---

## 继续暂缓的能力

### Semantic Retrieval / RAG

可以借鉴 anything-llm、Quivr、Khoj、Kotaemon、AppFlowy，但还不应马上做。原因：

- Unified Search/Filter 尚未统一。
- AI Invocation Audit 尚未落库。
- Report Claims/Citations 尚未持久化。
- Source chunk 与 citation span 映射还不完整。

开启条件：

- citation coverage gate 已上线。
- context manifest 已上线。
- unified search 已上线。
- 用户明确需要自然语言检索大库。

### Guarded Agent

可以借鉴 SiYuan、Marginalia、Khoj，但目前只应设计只读工具，不应开放写操作。

第一版只读工具可以是：

```text
search_assets
read_asset_summary
load_related_assets
load_report_citation_audit
build_open_data_mirror_plan
build_review_queue_plan
```

暂不允许：

```text
delete_assets
modify_source_content
run_shell
read_arbitrary_file
network_fetch_without_confirmation
```

### Plugin/MCP/LAN Sync

继续暂缓。它们都需要权限、生命周期、版本兼容、冲突解决、审计日志。Thepoint 当前收益更高的是把本地研究闭环做稳。

---

## 推荐实施顺序

### 推荐路线 A：可靠性优先

```text
AI Invocation Audit
→ Persisted Claims/Citations
→ Citation Jump/Highlight
→ Mirror v2
→ Review Queue Planner
→ Unified Search/Filter
```

适合目标：把 Thepoint 做成“AI 研究结果可复查”的工具。

### 推荐路线 B：工作台效率优先

```text
Unified Search/Filter
→ Related Rule Registry
→ Command Palette
→ Review Queue Planner
→ Indexed Import Preview
→ Mirror v2
```

适合目标：先提升每天使用效率和资料探索速度。

### 推荐路线 C：开放数据/长期资产优先

```text
Mirror v2
→ Source Link Mode
→ Attachment Registry
→ Indexed Import Preview
→ Backup/Restore
→ Unified Search
```

适合目标：把 Thepoint 变成长期可迁移、可备份的个人知识资产库。

## 我的建议

下一步优先做 **路线 A 的前两个切片**：

1. **AI Invocation Audit**
2. **Persisted Report Claims/Citations**

理由：

- 上一轮刚做完 Citation Audit，继续做 claims/citations 持久化最顺。
- Investigation 已经是 Thepoint 的核心差异点，但当前缺少 durable audit trail。
- 这两个切片会直接提升可信度，并为后续 RAG/Agent 打地基。
- 它们不会改变项目架构，不需要外部服务，不会引入同步/插件复杂度。

如果想更快看到 UI 成果，则改为先做 **Citation Jump/Highlight UI**，它能复用上一轮 locator 成果，风险较低。
