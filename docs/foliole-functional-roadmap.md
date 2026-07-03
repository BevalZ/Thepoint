# 参考 Foliole 的功能优化执行版路线图 —— Deep Explorer

> 目标：把“参考 `foliole` 优化功能”的中期方向，收缩成现在就能开工的执行计划。
>
> 原则：先做最小闭环，拒绝在第一阶段同时改数据层、页面架构、搜索系统和长期工作区。
>
> 更新：2026-07-03

---

## 一、执行原则

这份执行版路线图遵守三条约束：

1. 每个阶段只解决一个核心问题
2. 每个阶段都必须能独立验证
3. 不引入当前用不上的新框架、新同步层、新通用平台抽象

对应到当前代码库：

- 后端继续沿用 [src-tauri/src/db/mod.rs](../src-tauri/src/db/mod.rs) 的 inline schema init / lazy migration 方式
- 前端优先在现有 [frontend/src/pages/Explore.tsx](../frontend/src/pages/Explore.tsx) 和 [frontend/src/store/exploreStore.ts](../frontend/src/store/exploreStore.ts) 上增量演进
- 第一阶段不重写 Explore 页面，不重做知识库，不做全局搜索框架

---

## 二、先定的前置决策

这些问题不需要开会讨论很久，但必须先定，不然第一阶段会反复返工。

### 1. 什么算“同一来源”

执行版先采用最保守规则：

- 文件：绝对路径相同，即视为同一来源
- 网页：规范化后的最终 URL 相同，即视为同一来源
- 粘贴文本：每次粘贴都视为新来源，不做去重

理由：

- 实现简单
- 行为清晰
- 避免第一阶段就陷入“内容哈希去重是否误伤”的争议

后续如有必要，再把“文件移动后仍识别为同一来源”升级为内容哈希策略。

### 2. 第一阶段的定位精度

执行版先采用 `chunk` 级定位，不追求字符级精确定位。

含义：

- Point 先只关联到来源块 `chunk`
- 从知识库回跳时，滚动到对应块并高亮该块
- 不要求第一阶段精确高亮 chunk 中的某一小段 claim

理由：

- 当前系统本来就有 chunk card 作为稳定中间层
- 这样可以先把“可回去”做出来，再做“回得更准”

### 3. 第一阶段支持的来源类型

第一批只保证：

- `file`
- `webpage`

`paste` 先记录为独立来源，但不要求来源工作区体验完整一致。

---

## 三、真正的阶段划分

旧版路线图里的 `P0` 过大。执行版改成 4 个切片：

1. `Slice A`：来源持久化最小版
2. `Slice B`：Point 到来源块回跳
3. `Slice C`：来源工作区最小版
4. `Slice D`：工作台搜索最小版

建议排期：

- `P0` = Slice A + Slice B
- `P1` = Slice C
- `P2` = Slice D + 后续增强

---

## 四、Slice A：来源持久化最小版

### 目标

让导入的文件/网页不再只是一次性 Explore 状态，而是成为可复用的来源记录。

### 本阶段只做什么

- 新增 `source_documents`
- 新增 `source_chunks`
- 导入文件/网页后保存来源与 chunk
- Explore 历史项开始保存 `sourceId`

### 本阶段明确不做什么

- 不做 `source_revisions`
- 不做 diff
- 不做来源资产面板
- 不做统一搜索
- 不追补旧历史数据

### 建议表结构

```sql
CREATE TABLE IF NOT EXISTS source_documents (
    id             TEXT PRIMARY KEY,
    kind           TEXT NOT NULL,    -- file | webpage | paste
    title          TEXT,
    canonical_uri  TEXT NOT NULL,
    metadata_json  TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_documents_kind_uri
    ON source_documents(kind, canonical_uri);

CREATE TABLE IF NOT EXISTS source_chunks (
    id             TEXT PRIMARY KEY,
    source_id      TEXT NOT NULL,
    chunk_index    INTEGER NOT NULL,
    heading_path   TEXT,
    text           TEXT NOT NULL,
    created_at     TEXT NOT NULL,
    FOREIGN KEY(source_id) REFERENCES source_documents(id)
);

CREATE INDEX IF NOT EXISTS idx_source_chunks_source
    ON source_chunks(source_id, chunk_index);
```

### 为什么先不上 `source_revisions`

因为你当前最缺的是“来源存在”，不是“版本历史完整”。

先把来源与 chunk 稳定下来，已经能支撑：

- 同一来源复用
- Point 回跳
- 以后再挂 revision

### 需要改的文件

- [src-tauri/src/db/mod.rs](../src-tauri/src/db/mod.rs)
- [src-tauri/src/commands/extract.rs](../src-tauri/src/commands/extract.rs)
- [frontend/src/api/types.ts](../frontend/src/api/types.ts)
- [frontend/src/store/exploreStore.ts](../frontend/src/store/exploreStore.ts)

### 后端最小接口

- `upsert_source_document`
- `replace_source_chunks`
- `get_source_by_canonical_uri`

不需要先暴露成完整前端 command，也可以先在导入命令内部调用。

### 验收标准

- 同一路径文件二次导入时，复用同一个 `source_document`
- 同一 URL 二次抓取时，复用同一个 `source_document`
- 新导入来源后，chunk 被持久化到 `source_chunks`
- Explore history item 保存 `sourceId`

### 验证方式

- DB 层新增 focused tests
- 手工导入同一文件两次，检查数据库只存在一条来源记录

---

## 五、Slice B：Point 到来源块回跳

### 目标

让知识库中的 Point 能回到其来源块，而不只是显示摘录文本。

### 本阶段只做什么

- 新增 `point_source_links`
- 在生成 / 保存 Point 时记录它关联的 `source_id + chunk_index`
- 从知识库点击 Point 时，恢复对应来源并滚动到 chunk

### 本阶段明确不做什么

- 不做字符级 offset
- 不做 fact-check 精确 claim 高亮
- 不做 digest 引用回跳

### 建议表结构

```sql
CREATE TABLE IF NOT EXISTS point_source_links (
    point_id      TEXT PRIMARY KEY,
    source_id     TEXT NOT NULL,
    chunk_index   INTEGER NOT NULL,
    anchor_text   TEXT,
    created_at    TEXT NOT NULL,
    FOREIGN KEY(point_id) REFERENCES points(id),
    FOREIGN KEY(source_id) REFERENCES source_documents(id)
);
```

### 需要补的前端状态

`ExploreStore` 需要具备：

- `sourceId`
- `focusChunkIndex`
- `openSourceById(sourceId, focusChunkIndex?)`

当前 [frontend/src/store/exploreStore.ts](../frontend/src/store/exploreStore.ts) 只管理一次性 text/html/chunkCards 状态，还没有“按来源恢复”的概念。

### 需要改的文件

- [src-tauri/src/db/mod.rs](../src-tauri/src/db/mod.rs)
- [src-tauri/src/commands/library.rs](../src-tauri/src/commands/library.rs)
- [src-tauri/src/commands/extract.rs](../src-tauri/src/commands/extract.rs)
- [frontend/src/store/exploreStore.ts](../frontend/src/store/exploreStore.ts)
- [frontend/src/pages/Library.tsx](../frontend/src/pages/Library.tsx)
- [frontend/src/pages/Explore.tsx](../frontend/src/pages/Explore.tsx)

### 新增前后端接口

- `get_point_source_context(pointId)`
- `open_source_workspace(sourceId)`

### 验收标准

- 从知识库点击某个 Point，可打开其来源
- Explore 页会滚动到对应 chunk
- 对应 chunk 有可见高亮反馈
- 没有关联来源的旧 Point 不会报错，只显示“无来源定位”

### 验证方式

- 增加一条 DB test：保存 point 后能查到 point_source_link
- 手工流程验证：
  1. 导入文件
  2. 生成 Point
  3. 保存到知识库
  4. 从知识库点击该 Point
  5. 返回 Explore 并定位到对应块

---

## 六、Slice C：来源工作区最小版

### 目标

把 Explore 从“一次性分析现场”提升为“来源工作区的最小雏形”。

### 本阶段只做什么

- 最近来源列表
- 当前来源头部信息
- 当前来源关联 Point / star 数量

### 本阶段明确不做什么

- 不做完整右侧资产面板
- 不做 fact-check / digest / gallery 聚合视图
- 不拆新页面

### UI 只做三处

1. Explore 左上增加“最近来源”
2. 当前来源头部显示：
   - 标题
   - 类型
   - 更新时间
   - chunk 数
   - point 数
   - star 数
3. 支持在最近来源之间切换

### 需要改的文件

- [frontend/src/pages/Explore.tsx](../frontend/src/pages/Explore.tsx)
- [frontend/src/store/exploreStore.ts](../frontend/src/store/exploreStore.ts)
- 可新增 `frontend/src/store/sourceWorkspaceStore.ts`

### 后端接口

- `list_recent_sources`
- `get_source_workspace_summary(sourceId)`

### 验收标准

- 用户可在最近来源列表中重新打开历史来源
- 打开后不重新生成匿名 history 项
- 来源头部能展示基础统计信息

### 验证方式

- 手工导入两个来源，关闭再打开应用，最近来源仍可恢复

---

## 七、Slice D：工作台搜索最小版

### 目标

先做“来源 + Point”双类型搜索，不一步到位搞全工作台搜索。

### 本阶段只做什么

- 搜来源标题 / URL
- 搜 Point 内容
- 结果分两组显示

### 本阶段明确不做什么

- 不搜 fact-check
- 不搜 digest
- 不搜 gallery
- 不做搜索结果跨类型排序算法

### 建议结果结构

```ts
type WorkspaceSearchResult =
  | { kind: 'source'; id: string; title: string; snippet: string }
  | { kind: 'point'; id: string; title: string; snippet: string; sourceId?: string }
```

### 需要改的文件

- [src-tauri/src/db/mod.rs](../src-tauri/src/db/mod.rs)
- [src-tauri/src/commands/library.rs](../src-tauri/src/commands/library.rs)
- [frontend/src/api/types.ts](../frontend/src/api/types.ts)
- [frontend/src/api/index.ts](../frontend/src/api/index.ts)
- [frontend/src/App.tsx](../frontend/src/App.tsx)

### 后端接口

- `search_workspace(query)`

内部组合：

- `search_points`
- `search_sources`

### 验收标准

- 搜来源标题可命中来源
- 搜 Point 内容可命中 Point
- 点击 source 结果能打开来源
- 点击 point 结果能打开来源并定位到块

### 验证方式

- DB test：source / point 各自能返回结果
- 手工验证结果跳转

---

## 八、P1 / P2 再做的内容

这些不删，但不进入第一轮排期。

### 延后到 `P1`

- `source_revisions`
- 来源更新 diff
- 来源资产面板
- 关系面板

### 延后到 `P2`

- Open Data / Markdown Mirror 导出
- 轻量回顾队列
- 来源健康状态与失效提醒

---

## 九、按 Issue 拆分的真实开工顺序

### Issue 1：来源持久化最小版

范围：

- `source_documents`
- `source_chunks`
- 导入即持久化

完成定义：

- 新导入 file/url 后写入来源和 chunk
- 同一来源重复导入时复用来源 id

### Issue 2：Point 记录来源块

范围：

- `point_source_links`
- 保存 Point 时写入来源关联

完成定义：

- 新生成并保存的 Point 都带来源块关联

### Issue 3：从知识库回跳来源

范围：

- `get_point_source_context`
- Library -> Explore 回跳

完成定义：

- 从知识库点 Point，能打开来源并滚动定位

### Issue 4：最近来源与来源头部

范围：

- 最近来源列表
- 来源基础统计头部

完成定义：

- Explore 成为最小来源工作区

### Issue 5：工作台搜索最小版

范围：

- source + point 双类型搜索

完成定义：

- 可以通过一个入口查来源和 Point

---

## 十、每个 Issue 的默认验证方法

### DB 层

- 优先在 [src-tauri/src/db/mod.rs](../src-tauri/src/db/mod.rs) 增加 focused unit tests

### 命令层

- 对新增 command 做最小 happy-path 测试

### 前端

- 优先做手工验证脚本，不强推先补完整自动化

### 手工验证模板

1. 导入来源
2. 生成 Point
3. 保存 Point
4. 关闭当前视图
5. 从知识库或最近来源重新打开
6. 验证是否回到预期来源 / 预期 chunk

---

## 十一、当前代码库中最值得优先改的文件

### 第一批

- [src-tauri/src/db/mod.rs](../src-tauri/src/db/mod.rs)
- [src-tauri/src/commands/extract.rs](../src-tauri/src/commands/extract.rs)
- [frontend/src/store/exploreStore.ts](../frontend/src/store/exploreStore.ts)

### 第二批

- [src-tauri/src/commands/library.rs](../src-tauri/src/commands/library.rs)
- [frontend/src/pages/Library.tsx](../frontend/src/pages/Library.tsx)
- [frontend/src/pages/Explore.tsx](../frontend/src/pages/Explore.tsx)

### 第三批

- [frontend/src/App.tsx](../frontend/src/App.tsx)
- [frontend/src/api/types.ts](../frontend/src/api/types.ts)
- [frontend/src/api/index.ts](../frontend/src/api/index.ts)

---

## 十二、一句话结论

现在真正能开工的版本，不是“先做完整来源工作区 + 统一搜索”，而是：

先把来源存下来，再把 Point 连回来源块，再把这个回跳能力接到知识库里。

如果下一步立刻开工，应从 **Issue 1：来源持久化最小版** 开始。
