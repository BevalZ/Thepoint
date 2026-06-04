# Step 6: SQLite 持久化 + 知识库列表

## 目标
让提取出的 Point 能**存下来**：保存到本地 SQLite，并在「知识库」页浏览全部已存 Point。
做完即为完整可用的 MVP（提取 → 保存 → 浏览闭环）。

## 背景
- `src-tauri/src/db/mod.rs` 当前是 `// TODO: implement` 空 stub。
- `docs/database-schema.md` 有完整 schema（多表 + FTS5）。**本步只实现 `points` 表的 MVP 子集**，其余表留给后续。
- Step 5 探索页已能提取出 `ExtractedPoint[]`（content + tagType），存于 `useExploreStore`。
- Cargo 依赖已含 rusqlite（bundled）、uuid、chrono。

## MVP 数据库范围
只建 `points` 表的精简列（够 MVP 用，列名与完整 schema 对齐，便于将来扩展）：

```sql
CREATE TABLE IF NOT EXISTS points (
    id              TEXT PRIMARY KEY,   -- uuid v4
    content         TEXT NOT NULL,
    tag_type        TEXT,
    source_doc_name TEXT,               -- 来源文件名（探索页 sourceName，可空）
    created_at      TEXT NOT NULL       -- RFC3339 时间戳
);
```
- 暂不做 FTS5、parent_id、session/project、link 表、explore_actions。
- 数据库文件放 app data 目录（用 tauri 的 `app.path().app_data_dir()`），文件名如 `deep_explorer.db`。建库时确保目录存在 + `CREATE TABLE IF NOT EXISTS`（幂等）。

## 后端需求（Rust）
1. `db/mod.rs`：
   - 连接获取函数（每次命令打开连接即可，MVP 不必做连接池）。需要 `AppHandle` 来解析 app_data_dir。
   - `init_db(conn)`：执行建表 SQL（幂等）。
   - 一个内部 `StoredPoint` 结构（id/content/tagType/sourceDocName/createdAt，camelCase serde），用于返回前端。注意与 `ai::ExtractedPoint` 区分。
2. 新增命令（在 `commands/` 下，建议 `commands/library.rs`）：
   - `save_points(app, points: Vec<ExtractedPoint>, source_doc_name: Option<String>) -> Result<usize, String>`：为每个 point 生成 uuid + 当前时间，批量插入，返回写入条数。用事务。
   - `list_points(app) -> Result<Vec<StoredPoint>, String>`：按 created_at 倒序返回全部。
   - rusqlite 操作放 `spawn_blocking`（CPU/IO 阻塞），命令 async。
3. `commands/mod.rs` 注册新模块；`lib.rs` invoke_handler 注册两个新命令。
4. 命令返回 `Result<T, String>`，内部用 anyhow，`.map_err(|e| e.to_string())` 转换。无 panic/unwrap（除非确定不会失败并注释）。

## 前端需求
1. `api/types.ts`：新增 `StoredPoint { id; content; tagType; sourceDocName: string | null; createdAt }`。
2. `api/index.ts`：新增 `savePoints(points, sourceDocName?)`、`listPoints()` 包装。
3. 探索页 `Explore.tsx`：提取出 Point 后显示「保存到知识库」按钮，调 `savePoints(points, sourceName)`；成功后给反馈（如「已保存 N 条」），可清理当前列表或保留。
4. 新增「知识库」页 `pages/Library.tsx`：进入时 `listPoints()` 拉全部，列表展示（复用 `PointCard`，附 sourceDocName + createdAt）。空态引导。可选简单按 tagType 筛选。
5. `App.tsx`：导航加「知识库」入口（lucide 图标，如 `Library`/`BookMarked`），渲染 `<Library />`。
6. store：可在 `store/index.ts` 加 `useLibraryStore` 切片（points/loading/error/fetch），与现有切片风格一致。

## 验收标准
- `cargo check` 通过（MSVC 环境：`cmd /c "vcvars64.bat && cd /d D:\Github_repos\Thepoint\src-tauri && cargo check"`）。
- `npx tsc --noEmit` 通过，无 `any`。
- 运行 app：探索页提取 → 点「保存到知识库」→ 切到知识库页看到这些 Point；重启 app 后仍在（持久化生效）。
- 所有自定义 invoke 经 `api/index.ts`；类型在 `api/types.ts`；`StoredPoint` 前后端 camelCase 对齐；用 `cn()`；暗色风格与 Settings/Explore 一致。

## 非目标（本步不做）
- FTS5 全文搜索、层级 Point、会话/项目库、深挖动作、行为统计、Point 编辑/删除。
