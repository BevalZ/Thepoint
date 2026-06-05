# PRD — 知识库归档 + 多视图切换

## 目标

1. 知识库 Points 支持归档，归档后不在主列表展示，但可通过切换"已归档"视图检索
2. 知识库支持 4 种视图模式：折叠栏（现有默认）、列表、表格、看板，可点击切换

---

## 功能一：归档

### 数据库

`points` 表新增字段：
```sql
ALTER TABLE points ADD COLUMN archived INTEGER NOT NULL DEFAULT 0
```
在 `db/mod.rs` 的 `init_db` 中用 `column_exists` 守护添加。

### 后端 commands

在 `commands/library.rs` 新增：
```rust
pub async fn archive_point(app, id: String) -> Result<(), String>
pub async fn unarchive_point(app, id: String) -> Result<(), String>
```

`list_points` 默认加 `WHERE archived = 0`（不变更函数签名，已有调用不受影响）。  
新增 `list_archived_points` 返回 `archived = 1` 的 Points。

注册到 `lib.rs` `generate_handler![]`。

### 前端

`StoredPoint` 类型新增 `archived: boolean`（可选，`false` 为默认）。

`useLibraryStore` 新增：
- `archivePoint(id: string)` — 调用 Tauri command，本地 filter 掉该 point
- `fetchArchived()` / `archivedPoints: StoredPoint[]` — 用于归档视图

`Library.tsx` 中每个 Point 卡片操作菜单新增"归档"按钮（确认后调用 store action）。

顶部新增"已归档"toggle，切换后展示 `archivedPoints`，并可点击"恢复"。

---

## 功能二：多视图切换

### 视图类型

| 视图 | 描述 |
|------|------|
| 折叠栏（默认） | 按 sourceDoc 分组，可展开/收起（现有实现） |
| 列表 | 所有 root points 平铺，无分组，紧凑行高 |
| 表格 | 类电子表格：列=字段（内容/来源/标签/时间），支持列排序 |
| 看板 | 按 `tagType` 分列（事实陈述/作者观点/待验证疑问/无标签） |

### 前端实现

在 `Library.tsx` 顶部右侧新增视图切换按钮组（4 个图标按钮，使用 lucide-react 图标）。

当前视图保存在 `localStorage`（`lib-view-mode`），刷新后保持。

不同视图复用同一份 `points` 数据，仅渲染方式不同，不新增后端接口。

各视图组件新建为独立组件文件：
- `components/library/ListView.tsx`
- `components/library/TableView.tsx`
- `components/library/KanbanView.tsx`
- 现有折叠栏逻辑提取为 `components/library/GroupedView.tsx`

---

## 不在本任务内

- 归档批量操作
- 视图内搜索差异化（统一复用现有 searchPoints）
- 表格视图内联编辑
