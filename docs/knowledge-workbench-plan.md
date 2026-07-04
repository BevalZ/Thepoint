# 来源可追溯知识工作台规划

> 更新：2026-07-04
>
> 目标：在现有 Source Workspace 基础上，把 Deep Explorer 从“AI 阅读与总结工具”推进到“本地优先的个人知识审查工作台”。

---

## 一、核心判断

Deep Explorer 后续不应继续横向堆叠零散 AI 按钮，而应围绕一条主线收敛：

> 任意材料进入系统后，都能被拆解、追问、核查、引用，并最终沉淀为可复用的知识资产。

因此后续功能的优先级不按“看起来强不强”排序，而按以下四个问题判断：

1. 是否增强从结论回到原始来源的可追溯性？
2. 是否让用户更容易验证事实，而不是只相信 AI 口吻？
3. 是否提升知识复用，而不是生成一次性文本？
4. 是否能沿用当前 Tauri + SQLite + React 架构简单落地？

如果一个功能不能明确回答“是”，先不进入近期路线图。

---

## 二、当前基线

从当前代码和文档看，`docs/foliole-functional-roadmap.md` 中的来源最小闭环已经基本落地，后续规划应基于这个现实，而不是重复规划。

### 已有能力

- 后端已有 `source_documents`、`source_chunks`、`point_source_links`。
- 后端已有 `upsert_source_document`、`open_source_workspace`、`get_point_source_context`、`list_recent_sources`、`search_workspace`。
- 前端已有 `sourceId`、`sourceSummary`、`focusChunkIndex`、`openSourceById`。
- 知识库搜索已经能混合返回 source 和 point，并能回跳到来源块。
- 事实审查已有临时结构 `FactCheckResult`，包含 `claim`、`answer`、`context`、`extra`、`sources`。

### 主要缺口

- 事实审查结果目前更像一次性回答，尚未成为独立、可查询、可引用的证据记录。
- `save_fact_check_point` 会把审查结果保存为 Point 子块，但缺少结构化 verdict、证据来源、审查时间、关联 claim、证据级引用。
- Digest 可以生成知识研报，但还没有稳定的引用模型来指向 Source、Chunk、Point、Evidence。
- 多来源综合尚未形成明确的数据流和 UI 入口。

---

## 三、目标对象模型

后续不要引入抽象平台，先把当前对象关系补完整。

| 对象 | 当前状态 | 目标职责 |
|---|---|---|
| `Source` | 已有 | 原始材料，一切知识资产的根 |
| `Chunk` | 已有 | Source 的稳定分块，第一阶段定位粒度 |
| `Point` | 已有 | 从 Chunk 抽出的观点、事实、疑问 |
| `Evidence` | 已完成 MVP | 对某个 claim 的结构化事实审查记录 |
| `Star / Collection` | 已有 Star | 用户主动采集的一组 Point，可作为综合输入 |
| `Digest` | 已支持结构化引用 | 多个 Point / Evidence / Source 生成的最终沉淀物 |

核心约束：

- AI 生成的关键结论必须能回到 `Source -> Chunk`。
- 事实审查必须能回到 `claim -> Evidence -> evidence source`。
- 综合研报必须能回到 `Digest section -> cited Point/Evidence -> Source/Chunk`。

---

## 四、阶段规划

### Phase 0：收紧来源基线

目标：确认已有 Source Workspace 能作为后续 Evidence 和 Synthesis 的稳定地基。

本阶段只做：

- 对照 `docs/foliole-functional-roadmap.md` 标记已完成、部分完成、未完成项。
- 检查 file、webpage、paste 三类来源在 `sourceId`、chunk、point link 上的行为差异。
- 梳理当前 `search_workspace` 是否只搜索 source 和 point，避免后续把 evidence 搜索硬塞进去。
- 明确旧 Point 没有关联来源时的降级展示方式。

不做：

- 不重写 Explore 页面。
- 不重做数据层迁移体系。
- 不补语义搜索。
- 不做字符级高亮。

验收标准：

- 新导入 file/webpage 后，Source、Chunk、Point link 数据链路稳定。
- 从知识库打开 Point 能回到来源块。
- 无来源旧 Point 不报错，有明确空状态。
- 文档能准确描述当前已实现边界。

建议验证：

- 运行 `cargo test` 覆盖 db 层 source 相关测试。
- 运行 `npm run typecheck` 和 `npm run check:boundaries`。
- 手工导入同一文件、同一 URL、粘贴文本各一次，验证回跳行为。

---

### Phase 1：Evidence Ledger MVP

目标：把事实审查从“一次性 AI 回答”升级为“可保存、可搜索、可引用、可复查的证据账本”。

#### 最小数据结构

建议新增两类记录。

```sql
CREATE TABLE IF NOT EXISTS evidence_records (
    id              TEXT PRIMARY KEY,
    claim           TEXT NOT NULL,
    verdict         TEXT NOT NULL,
    answer          TEXT NOT NULL,
    reasoning       TEXT,
    context         TEXT,
    point_id        TEXT,
    source_id       TEXT,
    chunk_index     INTEGER,
    checked_at      TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    FOREIGN KEY(point_id) REFERENCES points(id),
    FOREIGN KEY(source_id) REFERENCES source_documents(id)
);

CREATE TABLE IF NOT EXISTS evidence_sources (
    id              TEXT PRIMARY KEY,
    evidence_id     TEXT NOT NULL,
    title           TEXT,
    url             TEXT NOT NULL,
    snippet         TEXT,
    stance          TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    FOREIGN KEY(evidence_id) REFERENCES evidence_records(id)
);
```

`verdict` 第一版只允许：

- `supported`
- `contradicted`
- `mixed`
- `uncertain`

`stance` 第一版只允许：

- `support`
- `contradict`
- `context`
- `unknown`

#### 数据流

```text
用户选择 claim
  -> fact_check_claim 返回结构化结果
  -> 用户保存审查
  -> 写入 evidence_records + evidence_sources
  -> 可选生成/关联一个“事实审查”子 Point
  -> Evidence 可在 Source Workspace、Point 详情、Digest 引用中复用
```

#### UI 最小入口

- Explore 划词事实审查后，结果卡片增加“保存为证据”。
- Point 的事实审查区域展示已有 Evidence 列表。
- Source Workspace 显示该来源下 Evidence 数量和最近几条。
- Library 搜索暂不混入 Evidence，先在 Evidence 专区或 Source 内查看。

#### 本阶段不做

- 不做复杂可信度评分。
- 不做自动二次联网复查。
- 不做证据图谱。
- 不做跨 Evidence 冲突推理。
- 不做 claim 字符级 offset，继续使用 chunk 级定位。

#### 验收标准

- 保存事实审查后，重启应用仍能看到 Evidence。
- Evidence 能显示 verdict、claim、answer、sources、checked_at。
- Evidence 能回跳到关联 Source/Chunk 或 Point。
- 没有来源上下文的事实审查仍可保存，但明确显示“无来源定位”。
- 删除 Point 时，不应静默丢失 Evidence；第一版可保留 Evidence 并清空 `point_id`，或明确阻止删除并提示。

#### 建议改动范围

- `src-tauri/src/db/mod.rs`
- `src-tauri/src/commands/extract.rs`
- `src-tauri/src/commands/library.rs`
- `frontend/src/api/types.ts`
- `frontend/src/api/commandMap.ts`
- `frontend/src/api/index.ts`
- `frontend/src/pages/Explore.tsx`
- `frontend/src/components/DeepenActions.tsx`
- `frontend/src/pages/Library.tsx`

#### 建议验证

- DB test：保存 Evidence 后能读取 record + sources。
- DB test：关联 source/chunk 后能回跳。
- Command test 或手工验证：fact check -> save evidence -> restart -> open source。
- Frontend typecheck：确保 command map、api types、UI 调用一致。

---

### Phase 2：Evidence 可检索与可引用

目标：让 Evidence 从“保存记录”进入知识流转。

本阶段只做：

- Evidence 列表视图或 Source 内 Evidence 面板。
- 按 claim、answer、source url 搜索 Evidence。
- Digest 输入可以选择 Evidence。
- Digest 输出中标出引用来源类型：Point 或 Evidence。

不做：

- 不做全局语义搜索。
- 不做复杂排序算法。
- 不做自动引用格式 CSL/BibTeX。
- 不把 Evidence 混入所有 Point 列表，避免类型混乱。

建议最小接口：

- `save_evidence`
- `list_evidence_for_point`
- `list_evidence_for_source`
- `search_evidence`
- `get_evidence`

验收标准：

- 用户能查到之前做过的事实审查。
- 用户能把若干 Evidence 作为 Digest 输入。
- Digest 里的关键事实能回跳到 Evidence，再回跳到外部证据链接和 Source/Chunk。

---

### Phase 3：Multi-Source Synthesis MVP

目标：从“围绕一个来源探索”升级到“围绕一组来源综合判断”。

#### 输入范围

第一版只允许两类输入：

- 用户手动选择多个 Source。
- 用户使用 Star 集合作为输入。

不自动扫描全库，不做无限范围综合。

#### 输出结构

```text
综合标题
  - 共同主题
  - 一致观点
  - 冲突观点
  - 证据强弱
  - 未解决问题
  - 后续建议
  - 引用清单
```

#### 关键约束

- 冲突观点必须显式展示，不能被 AI 静默融合。
- 每个关键结论至少引用一个 Point 或 Evidence。
- 引用必须能回跳到 Source/Chunk。
- 没有足够引用的结论要标记为“推断”或“不确定”。

#### 最小数据结构

第一版可以先复用现有 Digest 保存方式，但需要为引用留出结构化字段。若现有表不适合，再新增：

```sql
CREATE TABLE IF NOT EXISTS synthesis_reports (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    body_md         TEXT NOT NULL,
    input_json      TEXT NOT NULL,
    citations_json  TEXT NOT NULL,
    created_at      TEXT NOT NULL
);
```

`input_json` 记录输入 Source、Point、Evidence 的 id 列表。

`citations_json` 记录每条引用指向：

- `kind`: `source` | `point` | `evidence`
- `id`
- `source_id`
- `chunk_index`
- `label`

#### 验收标准

- 选择 3 个 Source 能生成一份综合报告。
- 报告中每个关键段落至少有一个引用。
- 点击引用能打开来源块、Point 或 Evidence。
- 多个来源有明显冲突时，报告必须出现“冲突观点”部分。

---

## 五、Issue 拆分顺序

### Issue 1：来源基线审计

状态：已完成。`docs/foliole-functional-roadmap.md` 已更新为 Source Workspace 基线说明和回归验收参考。

完成定义：

- 更新 `docs/foliole-functional-roadmap.md` 的完成状态。
- 明确 Source/Chunk/Point link 当前行为。
- 记录 paste 来源的降级策略。

### Issue 2：Evidence 数据层

状态：已完成。提交：`eb0d896 feat: add evidence ledger data layer`。

完成定义：

- 新增 Evidence 表结构和 Rust 数据类型。
- 新增保存、读取 Evidence 的 DB 函数。
- DB focused tests 通过。

### Issue 3：事实审查保存为 Evidence

状态：已完成。提交：`e3b2142 feat: persist fact checks as evidence`。

完成定义：

- `fact_check_claim` 的结果可保存为 Evidence。
- 保存时带上 point/source/chunk 上下文。
- 重启后可恢复。

### Issue 4：Evidence 展示与回跳

状态：已完成。提交：`14f1e79 feat: show evidence in point and source views`。

完成定义：

- Point 或 Source 中能看到 Evidence。
- Evidence 能回跳到 Source/Chunk。
- 无来源 Evidence 有清晰空状态。

### Issue 5：Evidence 搜索与 Digest 引用

状态：已完成。提交：`c9586fd feat: add evidence search and digest citations`。

完成定义：

- Evidence 可搜索。
- Digest 可选择 Evidence 作为输入。
- Digest 输出保留结构化引用。

### Issue 6：多来源综合 MVP

状态：已完成。提交：`432b992 feat: add multi-source synthesis`。

完成定义：

- 可选择多个 Source 或 Star 集合生成综合报告。
- 报告包含共同主题、冲突观点、证据引用。
- 引用能回跳。

---

## 六、暂缓功能

以下功能暂不进入近期执行计划：

- 云同步和团队协作。
- 通用聊天窗口。
- 浏览器扩展。
- 插件市场。
- 自动语义搜索和 embedding 管线。
- 复杂证据评分模型。
- 来源版本 diff。
- 字符级 claim 高亮。
- 大量新增数字分身或评论员玩法。

这些功能不是不重要，而是会分散当前主线：先把可追溯、可验证、可引用做扎实。

---

## 七、默认验证策略

每个阶段都必须有可验证出口，避免只完成 UI 观感。

### 数据层

- 优先在 `src-tauri/src/db/mod.rs` 增加 focused unit tests。
- 测试覆盖 null、无来源、重复保存、删除关联对象等边界。

### 命令层

- 所有新增 Tauri command 必须同步更新：
  - `frontend/src/api/types.ts`
  - `frontend/src/api/commandMap.ts`
  - `frontend/src/api/index.ts`
  - `src-tauri/src/lib.rs`

### 前端

- 先用现有页面和组件增量接入，避免新建大型页面框架。
- 运行 `npm run typecheck`。
- 运行 `npm run check:boundaries`，保持 Tauri invoke 只通过 API 层。

### 手工验收模板

1. 导入一个网页或文件。
2. 生成 Point。
3. 对一个事实 claim 执行事实审查。
4. 保存为 Evidence。
5. 关闭并重启应用。
6. 从 Source 或 Point 找回 Evidence。
7. 点击 Evidence 回到 Source/Chunk。
8. 用 Evidence 生成 Digest 或综合报告。
9. 点击报告引用回到原始来源。

---

## 八、一句话执行结论

当前最值得开工的不是新增聊天、同步或复杂图谱，而是：

> 先完成 Evidence Ledger，再让 Digest 和多来源综合建立在 Evidence 与 Source 引用之上。

当前路线中的 Issue 1-6 已完成；后续新增能力应在这个可追溯、可验证、可引用的基础上继续演进。
