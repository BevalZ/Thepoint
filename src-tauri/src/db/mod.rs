use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Wry};

const DB_FILE: &str = "deep_explorer.db";

/// A point persisted in the local SQLite library, returned to the frontend.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StoredPoint {
    pub id: String,
    pub content: String,
    pub tag_type: Option<String>,
    pub parent_id: Option<String>,
    pub source_doc_name: Option<String>,
    pub created_at: String,
    pub archived: bool,
    pub starred: bool,
}

/// Resolve the SQLite file path inside the app data dir, creating the dir if needed.
pub fn db_path(app: &AppHandle<Wry>) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .context("failed to resolve app data dir")?;
    fs::create_dir_all(&dir).context("failed to create app data dir")?;
    Ok(dir.join(DB_FILE))
}

/// Open a connection to the library DB and ensure the schema is up to date.
pub fn open_db(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path).context("failed to open library DB")?;
    init_db(&conn)?;
    Ok(conn)
}

/// Create / migrate the MVP schema (idempotent).
///
/// Sticks with Step 6's inline-init pattern (no migrations framework). For older
/// DBs the `parent_id` column is added lazily via `ALTER TABLE`, guarded by a
/// `PRAGMA table_info` check so the call stays idempotent.
pub fn init_db(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS points (
            id              TEXT PRIMARY KEY,
            content         TEXT NOT NULL,
            tag_type        TEXT,
            parent_id       TEXT,
            source_doc_name TEXT,
            created_at      TEXT NOT NULL
        )",
        [],
    )
    .context("failed to create points table")?;

    if !column_exists(conn, "points", "parent_id")? {
        conn.execute("ALTER TABLE points ADD COLUMN parent_id TEXT", [])
            .context("failed to add parent_id column")?;
    }

    if !column_exists(conn, "points", "archived")? {
        conn.execute("ALTER TABLE points ADD COLUMN archived INTEGER NOT NULL DEFAULT 0", [])
            .context("failed to add archived column")?;
    }

    if !column_exists(conn, "points", "starred")? {
        conn.execute("ALTER TABLE points ADD COLUMN starred INTEGER NOT NULL DEFAULT 0", [])
            .context("failed to add starred column")?;
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS explore_actions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            point_id     TEXT NOT NULL,
            action_type  TEXT NOT NULL,
            detail       TEXT,
            created_at   TEXT NOT NULL
        )",
        [],
    )
    .context("failed to create explore_actions table")?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_points_parent ON points(parent_id)",
        [],
    )
    .context("failed to create parent index")?;

    // FTS5 virtual table for full-text search over point content
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS points_fts
             USING fts5(id UNINDEXED, content, tokenize='trigram');

         -- Keep FTS in sync with the main table
         CREATE TRIGGER IF NOT EXISTS points_fts_insert
             AFTER INSERT ON points BEGIN
                 INSERT INTO points_fts(id, content) VALUES (new.id, new.content);
             END;
         CREATE TRIGGER IF NOT EXISTS points_fts_update
             AFTER UPDATE ON points BEGIN
                 UPDATE points_fts SET content = new.content WHERE id = old.id;
             END;
         CREATE TRIGGER IF NOT EXISTS points_fts_delete
             AFTER DELETE ON points BEGIN
                 DELETE FROM points_fts WHERE id = old.id;
             END;",
    )
    .context("failed to create FTS5 table/triggers")?;

    // Backfill FTS for rows that pre-date the virtual table
    conn.execute(
        "INSERT OR IGNORE INTO points_fts(id, content)
         SELECT id, content FROM points
         WHERE id NOT IN (SELECT id FROM points_fts)",
        [],
    )
    .context("failed to backfill FTS5")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS gallery (
            id              TEXT PRIMARY KEY,
            file_path       TEXT NOT NULL,
            thumbnail_path  TEXT NOT NULL,
            prompt          TEXT NOT NULL,
            generated_at    TEXT NOT NULL,
            download_status TEXT NOT NULL DEFAULT 'ok',
            point_ids       TEXT NOT NULL DEFAULT '[]'
        );",
    )
    .context("failed to create gallery table")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS suggestions (
            id          TEXT PRIMARY KEY,
            date        TEXT NOT NULL,
            body_md     TEXT NOT NULL,
            summary     TEXT NOT NULL,
            created_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_suggestions_date ON suggestions(date);
        CREATE INDEX IF NOT EXISTS idx_suggestions_created_at ON suggestions(created_at DESC);",
    )
    .context("failed to create suggestions table")?;

    Ok(())
}

/// Whether a column already exists on a table (used for idempotent migration).
fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Read every non-archived point (newest first) including its parent link.
pub fn list_points(conn: &Connection) -> Result<Vec<StoredPoint>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, tag_type, parent_id, source_doc_name, created_at, archived, starred
         FROM points
         WHERE archived = 0
         ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], map_point_row)?;

    let mut points = Vec::new();
    for row in rows {
        points.push(row?);
    }
    Ok(points)
}

/// Insert a batch of child points under `parent_id` (NULL parent = root) and
/// record one `explore_actions` row, all in a single transaction. Returns the
/// freshly written rows so the frontend can splice them into the tree.
pub fn save_child_points(
    conn: &mut Connection,
    parent_id: Option<&str>,
    action_type: &str,
    detail: Option<&str>,
    points: &[(String, String)],
) -> Result<Vec<StoredPoint>> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.transaction()?;
    let mut written = Vec::with_capacity(points.len());

    for (content, tag_type) in points {
        let id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO points (id, content, tag_type, parent_id, source_doc_name, created_at)
             VALUES (?1, ?2, ?3, ?4, NULL, ?5)",
            params![id, content, tag_type, parent_id, now],
        )?;
        written.push(StoredPoint {
            id,
            content: content.clone(),
            tag_type: Some(tag_type.clone()),
            parent_id: parent_id.map(str::to_string),
            source_doc_name: None,
            created_at: now.clone(),
            archived: false,
            starred: false,
        });
    }

    // Record behaviour for later stats. `point_id` is the parent when present,
    // otherwise the first new point (root deep-dive).
    let action_point = parent_id
        .map(str::to_string)
        .or_else(|| written.first().map(|p| p.id.clone()))
        .unwrap_or_default();
    tx.execute(
        "INSERT INTO explore_actions (point_id, action_type, detail, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![action_point, action_type, detail, now],
    )?;

    tx.commit()?;
    Ok(written)
}

/// FTS5-powered similarity search over `content`, excluding the point itself
/// and all of its descendants. Falls back gracefully to an empty result if the
/// query string is blank.
pub fn find_similar_points(
    conn: &Connection,
    point_id: &str,
    keywords: &[String],
    limit: usize,
) -> Result<Vec<StoredPoint>> {
    if keywords.is_empty() {
        return Ok(Vec::new());
    }

    // Build an OR query for FTS5: each keyword as a quoted phrase so special
    // chars are treated literally.
    let fts_query = keywords
        .iter()
        .map(|kw| format!("\"{}\"", kw.replace('"', " ")))
        .collect::<Vec<_>>()
        .join(" OR ");

    let sql = "WITH RECURSIVE descendants(id) AS (
            SELECT ?1
            UNION ALL
            SELECT p.id FROM points p JOIN descendants d ON p.parent_id = d.id
        )
        SELECT p.id, p.content, p.tag_type, p.parent_id, p.source_doc_name, p.created_at, p.archived, p.starred
        FROM points_fts f
        JOIN points p ON p.id = f.id
        WHERE points_fts MATCH ?2
          AND p.id NOT IN (SELECT id FROM descendants)
        ORDER BY rank
        LIMIT ?3";

    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![point_id, fts_query, limit as i64], map_point_row)?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// FTS5 keyword search over all points. Empty query returns empty vec.
pub fn search_points(conn: &Connection, query: &str, limit: usize) -> Result<Vec<StoredPoint>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let fts_query = query
        .split_whitespace()
        .map(|t| format!("\"{}\"", t.replace('"', " ")))
        .collect::<Vec<_>>()
        .join(" OR ");

    let sql = "SELECT p.id, p.content, p.tag_type, p.parent_id, p.source_doc_name, p.created_at, p.archived, p.starred
               FROM points_fts f
               JOIN points p ON p.id = f.id
               WHERE points_fts MATCH ?1
               ORDER BY rank
               LIMIT ?2";

    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![fts_query, limit as i64], map_point_row)?;
    let mut out = Vec::new();
    for row in rows { out.push(row?); }
    Ok(out)
}

/// Delete a point and all its descendants (recursive CTE), plus their explore_actions rows.
pub fn delete_point(conn: &Connection, point_id: &str) -> Result<()> {
    conn.execute_batch(&format!(
        "WITH RECURSIVE descendants(id) AS (
             SELECT '{pid}'
             UNION ALL
             SELECT p.id FROM points p JOIN descendants d ON p.parent_id = d.id
         )
         DELETE FROM explore_actions WHERE point_id IN (SELECT id FROM descendants);
         WITH RECURSIVE descendants(id) AS (
             SELECT '{pid}'
             UNION ALL
             SELECT p.id FROM points p JOIN descendants d ON p.parent_id = d.id
         )
         DELETE FROM points WHERE id IN (SELECT id FROM descendants);",
        pid = point_id.replace('\'', "''")
    ))
    .context("failed to delete point and descendants")
}

/// Record a standalone explore action (used when no rows are written, e.g. similar search).
pub fn record_explore_action(
    conn: &Connection,
    point_id: &str,
    action_type: &str,
    detail: Option<&str>,
) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO explore_actions (point_id, action_type, detail, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![point_id, action_type, detail, now],
    )?;
    Ok(())
}

/// Derive rough keywords from a point's content: CJK character bigrams plus
/// latin word tokens. Deliberately simple — this feeds LIKE matching only.
pub fn extract_keywords(content: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let is_sep = |c: char| {
        c.is_whitespace()
            || c.is_ascii_punctuation()
            || "，。、；：！？“”‘’（）《》【】…—·".contains(c)
    };

    for token in content.split(is_sep) {
        let chars: Vec<char> = token.chars().collect();
        if chars.is_empty() {
            continue;
        }
        let is_cjk = chars
            .iter()
            .any(|c| ('\u{4E00}'..='\u{9FFF}').contains(c));
        if is_cjk {
            for window in chars.windows(2) {
                let bigram: String = window.iter().collect();
                if seen.insert(bigram.clone()) {
                    out.push(bigram);
                }
            }
        } else if chars.len() >= 2 {
            let word: String = chars.iter().collect::<String>().to_lowercase();
            if seen.insert(word.clone()) {
                out.push(word);
            }
        }
    }

    out.truncate(10);
    out
}

/// Read every archived point (newest first).
pub fn list_archived_points(conn: &Connection) -> Result<Vec<StoredPoint>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, tag_type, parent_id, source_doc_name, created_at, archived, starred
         FROM points
         WHERE archived = 1
         ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], map_point_row)?;
    let mut points = Vec::new();
    for row in rows { points.push(row?); }
    Ok(points)
}

/// Set the `archived` flag on a point (1 = archived, 0 = active).
pub fn set_archived(conn: &Connection, point_id: &str, archived: bool) -> Result<()> {
    conn.execute(
        "UPDATE points SET archived = ?1 WHERE id = ?2",
        params![archived as i64, point_id],
    )?;
    Ok(())
}

fn map_point_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredPoint> {
    Ok(StoredPoint {
        id: row.get(0)?,
        content: row.get(1)?,
        tag_type: row.get(2)?,
        parent_id: row.get(3)?,
        source_doc_name: row.get(4)?,
        created_at: row.get(5)?,
        archived: row.get::<_, i64>(6).unwrap_or(0) != 0,
        starred: row.get::<_, i64>(7).unwrap_or(0) != 0,
    })
}

/// Toggle starred on a point; returns new total starred count.
pub fn set_starred(conn: &Connection, point_id: &str, starred: bool) -> Result<u32> {
    conn.execute(
        "UPDATE points SET starred = ?1 WHERE id = ?2",
        params![starred as i64, point_id],
    )?;
    let count: u32 = conn.query_row(
        "SELECT COUNT(*) FROM points WHERE starred = 1",
        [],
        |row| row.get(0),
    )?;
    Ok(count)
}

/// Return total starred count.
pub fn starred_count(conn: &Connection) -> Result<u32> {
    let count: u32 = conn.query_row(
        "SELECT COUNT(*) FROM points WHERE starred = 1",
        [],
        |row| row.get(0),
    )?;
    Ok(count)
}

/// List all starred points (content only), for image prompt generation.
pub fn list_starred_points(conn: &Connection) -> Result<Vec<StoredPoint>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, tag_type, parent_id, source_doc_name, created_at, archived, starred
         FROM points WHERE starred = 1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], map_point_row)?;
    let mut out = Vec::new();
    for row in rows { out.push(row?); }
    Ok(out)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GalleryItem {
    pub id: String,
    pub file_path: String,
    pub thumbnail_path: String,
    pub prompt: String,
    pub generated_at: String,
    pub download_status: String,
    pub point_ids: Vec<String>,
}

pub fn insert_gallery_item(conn: &Connection, item: &GalleryItem) -> Result<()> {
    let point_ids = serde_json::to_string(&item.point_ids)?;
    conn.execute(
        "INSERT INTO gallery (id, file_path, thumbnail_path, prompt, generated_at, download_status, point_ids)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![item.id, item.file_path, item.thumbnail_path, item.prompt,
                item.generated_at, item.download_status, point_ids],
    )?;
    Ok(())
}

pub fn list_gallery(conn: &Connection) -> Result<Vec<GalleryItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, file_path, thumbnail_path, prompt, generated_at, download_status, point_ids
         FROM gallery ORDER BY generated_at DESC",
    )?;
    let rows = stmt.query_map([], map_gallery_row)?;
    let mut out = Vec::new();
    for row in rows { out.push(row?); }
    Ok(out)
}

pub fn get_gallery_item(conn: &Connection, id: &str) -> Result<Option<GalleryItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, file_path, thumbnail_path, prompt, generated_at, download_status, point_ids
         FROM gallery WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(map_gallery_row(row)?))
    } else {
        Ok(None)
    }
}

pub fn delete_gallery_item(conn: &Connection, id: &str) -> Result<(String, String)> {
    let item = get_gallery_item(conn, id)?.ok_or_else(|| anyhow::anyhow!("item not found"))?;
    conn.execute("DELETE FROM gallery WHERE id = ?1", params![id])?;
    Ok((item.file_path, item.thumbnail_path))
}

pub fn update_gallery_status(conn: &Connection, id: &str, file_path: &str, thumb_path: &str, status: &str) -> Result<()> {
    conn.execute(
        "UPDATE gallery SET file_path=?1, thumbnail_path=?2, download_status=?3 WHERE id=?4",
        params![file_path, thumb_path, status, id],
    )?;
    Ok(())
}

fn map_gallery_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<GalleryItem> {
    let point_ids_str: String = row.get(6)?;
    let point_ids: Vec<String> = serde_json::from_str(&point_ids_str).unwrap_or_default();
    Ok(GalleryItem {
        id: row.get(0)?,
        file_path: row.get(1)?,
        thumbnail_path: row.get(2)?,
        prompt: row.get(3)?,
        generated_at: row.get(4)?,
        download_status: row.get(5)?,
        point_ids,
    })
}

// ── Suggestions ─────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub id: String,
    pub date: String,
    pub body_md: String,
    pub summary: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionMeta {
    pub id: String,
    pub summary: String,
    pub created_at: String,
}

pub fn save_suggestion(conn: &Connection, id: &str, date: &str, body_md: &str, summary: &str, created_at: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO suggestions (id, date, body_md, summary, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, date, body_md, summary, created_at],
    )?;
    Ok(())
}

pub fn list_suggestions_by_date(conn: &Connection, date: &str) -> Result<Vec<SuggestionMeta>> {
    let mut stmt = conn.prepare(
        "SELECT id, summary, created_at FROM suggestions WHERE date = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![date], |r| {
        Ok(SuggestionMeta {
            id: r.get(0)?,
            summary: r.get(1)?,
            created_at: r.get(2)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows { out.push(row?); }
    Ok(out)
}

pub fn get_suggestion(conn: &Connection, id: &str) -> Result<Option<Suggestion>> {
    let mut stmt = conn.prepare(
        "SELECT id, date, body_md, summary, created_at FROM suggestions WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Suggestion {
            id: row.get(0)?,
            date: row.get(1)?,
            body_md: row.get(2)?,
            summary: row.get(3)?,
            created_at: row.get(4)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn list_marked_dates(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT date FROM suggestions ORDER BY date DESC")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    let mut out = Vec::new();
    for row in rows { out.push(row?); }
    Ok(out)
}

pub fn list_recent_suggestion_summaries(conn: &Connection, limit: u32) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT summary FROM suggestions ORDER BY created_at DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit], |r| r.get::<_, String>(0))?;
    let mut out = Vec::new();
    for row in rows { out.push(row?); }
    Ok(out)
}
