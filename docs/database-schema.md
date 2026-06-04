# 数据库表结构 —— Deep Explorer

> SQLite + FTS5 | 更新：2026-06-03

---

## 表关系概览

```
config
api_credentials
        │
sessions ──────────────────────────┐
projects ──────────────────────────┤
        │                          │
      points ◄── point_library_link┘
        │
explore_actions
search_cache
```

---

## 建表 SQL

```sql
-- 全局配置
CREATE TABLE config (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- LLM / API 配置（API Key 由 electron-store 加密存储，此处仅存非敏感配置）
CREATE TABLE api_credentials (
    provider   TEXT PRIMARY KEY,  -- openai | anthropic | ollama
    endpoint   TEXT,
    model_name TEXT,
    max_tokens INTEGER DEFAULT 2000
);

-- 会话（单次探索）
CREATE TABLE sessions (
    id               TEXT PRIMARY KEY,
    name             TEXT,
    start_date       DATETIME NOT NULL,
    last_active_date DATETIME,
    is_archived      INTEGER DEFAULT 0,   -- 0=活跃 1=归档
    archived_date    DATETIME,
    wake_log         TEXT,                -- JSON: [{wake_date, original_archive_date}]
    summary          TEXT                 -- 结束时生成的总结文本
);

-- 项目库
CREATE TABLE projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  DATETIME,
    is_archived INTEGER DEFAULT 0,
    wake_log    TEXT                      -- JSON: [{wake_date, original_archive_date}]
);

-- 观点（Point）—— 核心表
CREATE TABLE points (
    id               TEXT PRIMARY KEY,
    content          TEXT NOT NULL,       -- 核心摘要（一句话）
    parent_id        TEXT,               -- 支持无限层级，NULL = 根 Point
    session_id       TEXT,               -- 来源会话
    project_id       TEXT,               -- 所属项目（可选）
    tag_type         TEXT,               -- 事实陈述|作者观点|待验证疑问|预测|数据引用|...
    custom_tags      TEXT,               -- JSON: ["重要","待查"]
    source_doc_name  TEXT,
    source_location  TEXT,               -- 页码 / 段落 / 时间戳
    highlight        TEXT,               -- 原文高亮片段
    created_at       DATETIME,
    updated_at       DATETIME,
    FOREIGN KEY(parent_id)  REFERENCES points(id),
    FOREIGN KEY(session_id) REFERENCES sessions(id),
    FOREIGN KEY(project_id) REFERENCES projects(id)
);

-- 跨库关联（Point ↔ 总库 / 会话 / 项目，多对多）
CREATE TABLE point_library_link (
    point_id       TEXT,
    library_type   TEXT,    -- total | session | project
    library_id     TEXT,    -- session_id 或 project_id；total 时为 NULL
    added_by_user  INTEGER DEFAULT 1,   -- 1=手动 0=自动
    label_on_add   TEXT,    -- 入库时打的额外标签
    added_at       DATETIME,
    FOREIGN KEY(point_id) REFERENCES points(id)
);

-- 深挖动作记录（用于行为统计）
CREATE TABLE explore_actions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    point_id     TEXT,
    action_type  TEXT,    -- explain|counter|search_internal|search_web|search_academic|more_followup|more_similar|more_export
    search_query TEXT,
    result_count INTEGER,
    created_at   DATETIME,
    FOREIGN KEY(point_id) REFERENCES points(id)
);

-- 搜索结果缓存（TTL 建议 24h，查询前检查 cached_at）
CREATE TABLE search_cache (
    query_hash   TEXT PRIMARY KEY,
    source       TEXT,    -- internal | web | arxiv | pubmed | crossref | google_scholar | baidu_xueshu
    results_json TEXT,
    cached_at    DATETIME
);

-- FTS5 全文检索虚拟表
CREATE VIRTUAL TABLE points_fts USING fts5(
    content,
    highlight,
    source_doc_name,
    content='points',
    content_rowid='rowid'
);

-- FTS5 同步触发器
CREATE TRIGGER points_fts_insert AFTER INSERT ON points BEGIN
    INSERT INTO points_fts(rowid, content, highlight, source_doc_name)
    VALUES (new.rowid, new.content, new.highlight, new.source_doc_name);
END;

CREATE TRIGGER points_fts_update AFTER UPDATE ON points BEGIN
    INSERT INTO points_fts(points_fts, rowid, content, highlight, source_doc_name)
    VALUES ('delete', old.rowid, old.content, old.highlight, old.source_doc_name);
    INSERT INTO points_fts(rowid, content, highlight, source_doc_name)
    VALUES (new.rowid, new.content, new.highlight, new.source_doc_name);
END;

CREATE TRIGGER points_fts_delete AFTER DELETE ON points BEGIN
    INSERT INTO points_fts(points_fts, rowid, content, highlight, source_doc_name)
    VALUES ('delete', old.rowid, old.content, old.highlight, old.source_doc_name);
END;

-- 索引
CREATE INDEX idx_points_parent   ON points(parent_id);
CREATE INDEX idx_points_session  ON points(session_id);
CREATE INDEX idx_points_project  ON points(project_id);
CREATE INDEX idx_sessions_status ON sessions(is_archived);
CREATE INDEX idx_actions_point   ON explore_actions(point_id);
CREATE INDEX idx_actions_time    ON explore_actions(created_at);
```

---

## 行为统计查询示例

```sql
-- 深度指数：某会话中平均每个根 Point 的子孙总数
WITH RECURSIVE tree AS (
    SELECT id, parent_id, session_id FROM points WHERE parent_id IS NULL AND session_id = ?
    UNION ALL
    SELECT p.id, p.parent_id, p.session_id FROM points p
    JOIN tree t ON p.parent_id = t.id
)
SELECT COUNT(*) * 1.0 / (SELECT COUNT(*) FROM points WHERE parent_id IS NULL AND session_id = ?) AS depth_index
FROM tree WHERE parent_id IS NOT NULL;

-- 反方观点使用率
SELECT
    SUM(action_type = 'counter') * 1.0 / COUNT(*) AS counter_rate
FROM explore_actions
WHERE point_id IN (SELECT id FROM points WHERE session_id = ?);
```
