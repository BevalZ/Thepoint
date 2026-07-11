# Tauri Command 接口文档 —— Deep Explorer

> 前端通过 `frontend/src/api` typed wrappers 调用 | 更新：2026-07-11

所有 command 返回 `Promise<T>`，错误时 reject 一个 `string`。

---

## Semantic Retrieval / Research Q&A

| Command | Purpose |
|---|---|
| `get_semantic_index_status` | 返回模型、缓存和 ready/pending/stale/failed 计数 |
| `rebuild_semantic_index` | 下载/加载 embedding 模型并可恢复地索引 Source chunks |
| `cancel_semantic_index_rebuild` | 请求在批次边界取消索引任务 |
| `hybrid_semantic_search` | 关键词 + exact cosine + RRF 的 Source/Chunk 结果 |
| `generate_grounded_answer` | 仅基于选择的 hits 生成带 `[S#]` 引用的回答 |
| `save_grounded_answer_report` | 保存 Investigation report 并链接 invocation audit |
| `check_database_integrity` / `backup_database` / `restore_database_backup` | 本地数据库安全操作 |
| `store_semantic_api_key` | 将远程 embedding key 写入 OS credential store |

Rust 注册、TypeScript command map 和 API wrapper 名称由 `npm run check:commands` 强制保持一致。浏览器预览为只读状态类命令提供显式 unavailable/empty fallback，不会下载模型。

## 类型定义

```typescript
// frontend/src/api/types.ts

interface Point {
  id: string;
  content: string;
  parentId: string | null;
  sessionId: string;
  projectId: string | null;
  tagType: string;             // "事实陈述" | "作者观点" | "待验证疑问" | ...
  customTags: string[];
  sourceDocName: string | null;
  sourceLocation: string | null;
  highlight: string | null;
  createdAt: string;
}

interface Session {
  id: string;
  name: string;
  startDate: string;
  lastActiveDate: string;
  isArchived: boolean;
  archivedDate: string | null;
  wakeLog: WakeEvent[];
}

interface WakeEvent {
  wakeDate: string;
  originalArchiveDate: string;
}

interface StatsResult {
  depthIndex: number;
  breadthIndex: number;
  evidencePreference: number;
  counterRate: number;
  searchRate: number;
  totalPoints: number;
  totalActions: number;
  savedToLibrary: number;
}
```

---

## extract

### `extract_text`
```typescript
invoke<Point[]>('extract_text', {
  text: string,
  sessionId: string,
  mode: 'auto' | 'semi',
  preferenceTags?: string[],
})
```

### `extract_file`
```typescript
invoke<Point[]>('extract_file', {
  filePath: string,   // 绝对路径，由 Tauri dialog 获取
  sessionId: string,
  mode: 'auto' | 'semi',
})
```

---

## points

### `get_point_tree` — 获取某会话下完整 Point 树
```typescript
invoke<Point[]>('get_point_tree', { sessionId: string })
```

### `create_point` — 手动创建
```typescript
invoke<Point>('create_point', { content: string, parentId?: string, sessionId: string, tagType: string })
```

### `update_point`
```typescript
invoke<void>('update_point', { id: string, content?: string, customTags?: string[] })
```

### `delete_point` — 级联删除子 Point
```typescript
invoke<void>('delete_point', { id: string })
```

### `bulk_add_to_library`
```typescript
invoke<void>('bulk_add_to_library', {
  pointIds: string[],
  libraryType: 'total' | 'session' | 'project',
  libraryId?: string,
  labelOnAdd?: string,
})
```

---

## sessions

### `create_session` / `list_sessions` / `get_session`
### `end_session` — 触发总结生成
### `archive_session` / `wake_session`

---

## actions（深挖动作）

### `action_explain`
```typescript
invoke<Point>('action_explain', { pointId: string, mountAsChild: boolean })
```

### `action_counter` — 反方观点（实时生成）
```typescript
invoke<Point>('action_counter', { pointId: string })
```

### `action_followup` — 生成追问列表
```typescript
invoke<string[]>('action_followup', { pointId: string })
```

### `action_similar` — 总库相似 Point
```typescript
invoke<Point[]>('action_similar', { pointId: string, limit?: number })
```

---

## search

### `search_internal`
```typescript
invoke<Point[]>('search_internal', { query: string, limit?: number })
```

### `search_web`
```typescript
invoke<SearchResult[]>('search_web', { query: string })
```

### `search_academic`
```typescript
invoke<SearchResult[]>('search_academic', {
  query: string,
  sources: Array<'arxiv' | 'pubmed' | 'crossref' | 'google_scholar' | 'baidu_xueshu'>,
})
```

### `convert_search_result`
```typescript
invoke<Point>('convert_search_result', {
  result: SearchResult,
  parentPointId: string,
  sessionId: string,
})
```

---

## stats

### `get_session_stats`
```typescript
invoke<StatsResult>('get_session_stats', { sessionId: string })
```

### `get_stats_history`
```typescript
invoke<Array<StatsResult & { sessionId: string; date: string }>>('get_stats_history')
```

---

## config

### `get_config` / `set_config`
### `detect_ollama` — 检测本地 Ollama 服务
```typescript
invoke<{ running: boolean; models: string[] }>('detect_ollama')
```
