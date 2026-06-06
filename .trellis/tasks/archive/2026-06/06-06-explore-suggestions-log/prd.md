# PRD: 探索建议日志体系（认知归档 + Markdown + 飞星交互）

## 背景

当前 `Analytics.tsx` 底部的探索建议是「一次性 LLM 调用 + 纯文本展示」，无任何历史。本任务将其升级为带历史归档的认知日志体系：

- 每次"已阅"归档为带摘要的条目，绑定到当天
- 历次摘要被注入下一次生成的 prompt，做趋势对比
- 「已阅」触发飞星动画飞向热力图当天格子
- 热力图当天格子有星点标记，可点开查看原文

**前置依赖**：`06-06-analytics-heatmap-rework`（需要其 `data-date` 属性、`markedDates` prop、`onCellClick` 回调三个契约）。

---

## 核心决策（已确认）

### 归档生命周期

| 动作 | 行为 |
|---|---|
| 点「生成」 | 显示为"未读"卡片，**不写库** |
| 点「已阅」 | 写库归档 + 播放飞星动画飞向热力图当天 |
| 点「重新生成」 | 丢弃当前未读、不写库 |
| 关闭页/切页/离开 Analytics | 静默归档（写库但不播动画） |

### 存储

新表：
```sql
CREATE TABLE IF NOT EXISTS suggestions (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,         -- YYYY-MM-DD，归档当天的本地日期
  body_md     TEXT NOT NULL,         -- 完整 markdown 正文
  summary     TEXT NOT NULL,         -- 1~2 句摘要（由同一次 LLM 调用产出）
  created_at  TEXT NOT NULL          -- RFC3339 timestamp
);
CREATE INDEX IF NOT EXISTS idx_suggestions_date ON suggestions(date);
CREATE INDEX IF NOT EXISTS idx_suggestions_created_at ON suggestions(created_at DESC);
```

走 `init_db` 的 `CREATE TABLE IF NOT EXISTS` 模式（与现有 points / explore_actions / gallery 一致）。

### Tauri 命令

新增 `src-tauri/src/commands/suggestions.rs`：

- `generate_suggestion() -> Result<{ body_md: String, summary: String }, String>` — 调 LLM，**不写库**。从 `list_recent_suggestion_summaries(15)` 拿历史摘要、`list_mental_models` 拿框架闭集，组装 prompt。
- `save_suggestion(body_md: String, summary: String) -> Result<String, String>` — 写 1 条，返回 id；date 用本地日期 `YYYY-MM-DD`。
- `list_suggestions_by_date(date: String) -> Result<Vec<SuggestionMeta>, String>` — 返回当天所有归档的元信息（id + summary + created_at），不含正文。
- `get_suggestion(id: String) -> Result<Suggestion, String>` — 取单条完整正文。
- `list_marked_dates() -> Result<Vec<String>, String>` — 返回所有有归档的日期（distinct date），供热力图标记。
- `list_recent_suggestion_summaries(limit: u32) -> Result<Vec<String>, String>` — 内部辅助，也开放给前端做趋势调试。

注册到 `lib.rs` 的 `invoke_handler`。

### LLM Prompt 结构

System：
```
你是认知能力提升教练。请按以下固定顺序输出一份认知反思简报：
1. 与过去几次的变化对比（若有历史摘要）
2. 当前认知偏好与习惯
3. 认知盲点
4. 深度与广度提升建议
5. 推荐思维框架（仅从下方列表中选 1~3 个，附简短理由）

输出格式：
SUMMARY: <一两句话总结本次建议的核心>

<以下用 markdown，章节用 ##，重要建议用 **加粗** 或 > 引用块强调>
```

User content 模板：
```
【最近 100 条深挖操作（动作类型 + 观点摘要）】
<现有 get_explore_suggestions 已有的拼接>

【历史建议摘要（最多 15 条，最新在后）】
- {created_at} · {summary}
- ...
（首次生成时此段输出"暂无历史"）

【可推荐的思维框架（闭集）】
- key: {key}; name: {name}; description: {description}
- ...
```

后端在收到 LLM 响应后，按首行 `SUMMARY: ...\n\n<body>` 哨兵切分；切分失败则用 `body_md.lines().next().take(80 chars)` 作为兜底摘要。

### 前端

#### Markdown 渲染

- 新依赖：`react-markdown ^9`、`remark-gfm ^4`（package.json）
- 新组件：`frontend/src/components/Markdown.tsx`
  ```tsx
  export function Markdown({ children, className }: { children: string; className?: string }) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        className={cn('prose prose-sm prose-invert max-w-none', className)}
        components={{
          // 重要内容样式增强
          strong: ({node, ...p}) => <strong className="text-accent font-semibold" {...p} />,
          blockquote: ({node, ...p}) => <blockquote className="border-l-2 border-accent/60 bg-accent/5 pl-3 py-1 my-2 italic" {...p} />,
          h2: ({node, ...p}) => <h2 className="text-sm font-semibold text-fg mt-3 mb-1.5" {...p} />,
          ul: ({node, ...p}) => <ul className="list-disc list-inside space-y-1" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    )
  }
  ```
- 替换 `DigestModal.tsx:85` 的 `<pre>` 为 `<Markdown>{content}</Markdown>`。

#### 探索建议面板

`Analytics.tsx` 的 `ExploreSuggestions` 重写：

状态机：
```
idle ──生成→ loading ──ok→ unread ──已阅→ flying ──完成→ idle (+marker更新)
                                  │
                                  └─重新生成→ loading
                                  │
                                  └─卸载/切页→ 静默 save_suggestion
```

UI 三按钮（unread 状态下）：
- 重新生成 — 同当前
- 已阅 — 新增，触发 save + animation
- （关闭按钮无，关闭等于触发卸载逻辑）

页面卸载时（useEffect cleanup），若当前 unread，调 `save_suggestion` 静默归档（不播动画）。

#### 飞星动画

- 复用 `frontend/src/hooks/useStarFly.ts` 思路，但目标点改为热力图当天格子坐标
- 新 hook：`useFlyToHeatmapCell(date: string)`
  - 通过 `document.querySelector(\`[data-date="${date}"]\`)` 拿 DOMRect
  - 若返回 null 或 rect.top < 0 / rect.bottom > viewport：先 `el.scrollIntoView({ behavior: 'smooth', block: 'center' })`，等待约 400ms 再拿一次 rect
  - 卡片整体 scale 1 → 0.1，opacity 1 → 0，translate 到目标坐标，timing 600ms cubic-bezier(0.25, 0.46, 0.45, 0.94)
  - 完成后回调，由调用方触发"标记刷新"（重新拉 `list_marked_dates`）

#### 热力图标记

- `Analytics.tsx` 持有 `markedDates: Set<string>` 状态，挂载时 + 飞星完成时调 `list_marked_dates` 刷新，传给 `<HeatmapChart markedDates={markedDates} onCellClick={handleCellClick} />`
- `HeatmapChart`（已在前置任务暴露 prop）渲染 marker：被标记格子右下角 4×4px accent 色 dot
- tooltip 同时显示"M 条建议"

#### 当天文档列表 + 原文弹窗

- 点击格子 → `handleCellClick(date)` → 设置 `viewingDate` state
- 渲染 `<DayList date={viewingDate} onPick={id => setViewingId(id)} onClose={...}/>`：弹出居中浮卡，列出 `list_suggestions_by_date(date)` 的条目（每条显示 summary + 时间）
- 点条目 → 关闭列表 + 打开 `<SuggestionViewModal id={viewingId}>`：复用 `DigestModal` 的样式骨架（标题"探索建议存档" + 复制 / 下载 MD / 关闭三按钮，**不带"存入知识库"**），通过 `get_suggestion(id)` 拉正文用 `<Markdown>` 渲染

---

## 文件清单

新增：
- `src-tauri/src/commands/suggestions.rs`
- `frontend/src/components/Markdown.tsx`
- `frontend/src/components/SuggestionViewModal.tsx`
- `frontend/src/components/SuggestionDayList.tsx`
- `frontend/src/hooks/useFlyToHeatmapCell.ts`

修改：
- `src-tauri/src/db/mod.rs` — `init_db` 加 `suggestions` 表 + 两个索引；新增 `save_suggestion / list_suggestions_by_date / get_suggestion / list_marked_dates / list_recent_suggestion_summaries` DB 函数
- `src-tauri/src/commands/mod.rs` — `pub mod suggestions;`
- `src-tauri/src/lib.rs` — 注册命令
- `src-tauri/src/commands/analytics.rs` — 旧 `get_explore_suggestions` 删除（被 `suggestions::generate_suggestion` 取代）；其余分析数据保留
- `frontend/src/api/index.ts` — 新增 5 个 invoke 封装；删除 `getExploreSuggestions`
- `frontend/src/api/types.ts` — 新增 `Suggestion / SuggestionMeta` 类型
- `frontend/src/pages/Analytics.tsx` — 重写 `ExploreSuggestions`，加 `markedDates` / `viewingDate` / `viewingId` 状态与对应弹窗
- `frontend/src/components/DigestModal.tsx` — `<pre>` 换 `<Markdown>`
- `frontend/package.json` — 加依赖

---

## 验收

- [ ] 首次（无历史）生成 → "暂无历史"段落正确，prompt 不报错
- [ ] 第二次起，prompt 中能看到上一条 summary
- [ ] 点「已阅」：先保存（DB 多一行）+ 卡片飞向热力图当天格子 + 该格子出现 dot 标记
- [ ] 点「重新生成」：DB 不增、未读卡片被替换
- [ ] 切到 Settings 页再回 Analytics：DB 多一行（静默归档），无动画
- [ ] hover 有 dot 的格子：tooltip 多一行"N 条建议"
- [ ] 点击有 dot 的格子：弹出当天列表，点条目能开原文弹窗
- [ ] 原文弹窗能复制 + 下载（文件名 `suggestion-<date>-<short_id>.md`）
- [ ] Markdown 渲染：`**bold**` 用强调色、`>` 引用块有左边框背景、`##` 章节正确
- [ ] DigestModal 也被一并换用 Markdown
- [ ] `npx tsc` + `cargo check` 通过

---

## 不在本任务范围内

- 流式生成（未来若有 `generate_suggestion_streaming` 再开新任务）
- 思维框架推荐的跨页"一键应用"跳转（chip 仅展示）
- 删除已归档建议的 UI（暂无；DB 表设计已能支持，后续按需加）
