# PRD — 探索建议（基于使用习惯的 AI 评价）

## 目标

在统计页下方新增"探索建议"区块，基于用户操作记录，调用 LLM 生成对用户认知习惯的评价和提升建议，帮助用户更高效地使用深挖功能。

## 功能范围

### 后端 — 操作日志记录

在 `db/mod.rs` 新增 `action_logs` 表：
```sql
CREATE TABLE IF NOT EXISTS action_logs (
    id          TEXT PRIMARY KEY,
    point_id    TEXT NOT NULL,
    action      TEXT NOT NULL,  -- explain/counter/followup/framework/similar
    created_at  TEXT NOT NULL
)
```

在 `commands/explore.rs` 的 `deepen_point` / `find_similar` 调用成功后，写入一条 `action_log`。

### 后端 — 新 Tauri command `get_explore_suggestions`

```rust
// commands/analytics.rs 中新增
pub async fn get_explore_suggestions(app: AppHandle) -> Result<String, String>
```

逻辑：
1. 查询最近 100 条 `action_logs`（含 point content），汇总成结构化摘要
2. 调用 LLM（使用 chat 模型配置），prompt 要求：
   - 分析用户偏好的深挖类型（如偏重反方/偏重追问）
   - 指出认知盲点（如从未使用框架思维）
   - 给出 2-3 条具体建议，目标是提升认知深度
3. 返回 LLM 生成的 markdown 文本（200-400字）

### 前端 — 统计页新增建议区块

在 `Analytics.tsx` 底部新增 `ExploreSuggestions` 组件：
- 默认不自动加载，用户点击"生成建议"按钮触发
- 加载中显示 spinner
- 渲染 LLM 返回的 markdown（用 `<pre>` 或简单 markdown 渲染）
- 每次点击重新生成

## 数据结构

新增 Tauri command（注册到 `lib.rs`）：`get_explore_suggestions`

不新增前端 store，在 `Analytics.tsx` 用局部 `useState` 管理（符合 state-management.md 的 page-scoped read-only 规则）。

## 不在本任务内

- 建议历史保存
- 自动定时生成
- 基于 action_logs 的其他统计图表
