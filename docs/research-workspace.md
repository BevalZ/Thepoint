# Research Workspace

> 更新：2026-07-06 | 范围：Investigation、Journal、Related、Review、Open Data Mirror、Indexed Folders

Thepoint 的知识工作台现在从“可追溯 Source / Point / Evidence / Report”扩展为本地优先的个人研究与复习工作台。目标是让材料进入系统后，可以被调查、引用、关联、复习、导出，并沉淀为后续调查可召回的记忆。

## 功能说明

| 能力 | 说明 |
|---|---|
| Investigation | 新的 Report 类型，用一个调查问题聚合显式选择的资产、Journal、库内搜索、Evidence、Reports 和 Related assets，生成带引用 Markdown |
| Journal | 保存 Investigation 产生的调查记忆。Journal 可作为后续召回线索，但不能作为最终事实依据 |
| Citation Contract | `DigestCitation` 支持 `source`、`point`、`evidence`，并保留 `quote`、`reason`。关键结论必须引用 Source / Point / Evidence，或显式标记为推断 / 不确定 |
| Related Assets | 基于共同引用、同 Source、Journal 共现、Gallery-Point 链接、Review Queue 共现生成轻量关系 |
| Review Queue | Source / Point / Evidence / Report / Journal 可加入复习队列，使用简单间隔：again 1 天、hard 3 天、good 7 天、easy 14 天 |
| Open Data Mirror | 把知识资产导出为可读 Markdown 快照，包含 `index.md` 和 `manifest.json`。这是单向导出，不是双向同步 |
| Indexed Folders | 索引外部本地文件夹。文本、Markdown、HTML、JSON、CSV 和常见代码/配置文件进入 Source Workspace；PDF / EPUB / DOCX 等先只记录元数据 |

## 数据模型

Investigation 不单独建主表，统一保存在 `reports`：

```sql
reports.kind IN ('digest', 'synthesis', 'investigation')
```

新增持久对象：

```sql
journal_entries(
  id, query, note, tags_json,
  source_ids_json, point_ids_json, evidence_ids_json, report_ids_json,
  created_report_id, source_kind, created_at,
  invalidated_at, invalidated_reason
)

asset_relations(
  id, from_kind, from_id, to_kind, to_id,
  relation, reason, score, source_kind, created_at, vetted_at
)

review_items(
  id, target_kind, target_id, title, note,
  status, priority, due_at, last_reviewed_at,
  review_count, ease, interval_days, created_at, updated_at
)

open_data_mirror_config(
  id, enabled, root_path,
  export_sources, export_evidence, export_reports,
  export_journal, export_gallery_index, updated_at
)

indexed_folders(id, path, name, enabled, last_scanned_at, created_at)
indexed_files(id, folder_id, path, name, extension, size_bytes, modified_at, source_id, indexed_at)
```

## Mirror 目录

```text
Thepoint Mirror/
  sources/
  evidence/
  reports/
  investigations/
  journal/
  gallery/
  index.md
  manifest.json
```

文件名由资产 id 前缀和安全标题组成，避免 Windows 非法字符。重复导出会覆盖同一资产的稳定文件名，而不是生成无意义副本。

## 调查闭环

1. 用户从 Library 或 Explore 发起 Investigation。
2. 调查范围按顺序收集：显式资产、Journal、workspace search、Evidence search、Report search、Related assets。
3. 模型输出 Markdown Investigation。
4. 用户保存为 `reports.kind = investigation`。
5. 保存命令自动创建 Journal entry。
6. 用户可 rebuild/discover Related assets。
7. 用户可把关键资产加入 Review Queue。
8. Settings 中可导出 Open Data Mirror，或扫描 Indexed Folder 继续扩充 Source Workspace。

## 暂缓能力

以下能力刻意不在当前实现中引入：

- 完整 FSRS 调度算法：当前只保留 `ease`、`interval_days` 扩展字段，调度函数后续可替换。
- Python sidecar / FastAPI / HTTP API / MCP / CLI：当前桌面应用内部通信只使用 Tauri commands。
- Electron / Capacitor / 后台 worker 队列：保持现有 Tauri + Rust + SQLite 架构。
- OCR、多模态 PDF 深处理、EPUB / DOCX 深索引：工程量大，先以元数据记录。
- Embedding / rerank：先保证结构化召回、引用和 Journal 可靠，再接可选语义层。
