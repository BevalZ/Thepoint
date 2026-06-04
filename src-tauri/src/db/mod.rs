use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use rusqlite::{params, params_from_iter, Connection};
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

/// Read every stored point (newest first) including its parent link.
pub fn list_points(conn: &Connection) -> Result<Vec<StoredPoint>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, tag_type, parent_id, source_doc_name, created_at
         FROM points
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

/// Rough keyword/LIKE similarity search over `content`, excluding the point
/// itself and all of its descendants. MVP only — no embeddings.
pub fn find_similar_points(
    conn: &Connection,
    point_id: &str,
    keywords: &[String],
    limit: usize,
) -> Result<Vec<StoredPoint>> {
    if keywords.is_empty() {
        return Ok(Vec::new());
    }

    // ?1 = point_id, then one bind per keyword pattern, then the limit.
    let mut bind: Vec<String> = Vec::with_capacity(keywords.len() + 2);
    bind.push(point_id.to_string());
    let like_clauses: Vec<String> = keywords
        .iter()
        .enumerate()
        .map(|(i, kw)| {
            bind.push(format!("%{kw}%"));
            format!("content LIKE ?{}", i + 2)
        })
        .collect();
    bind.push(limit.to_string());
    let limit_idx = bind.len();

    let sql = format!(
        "WITH RECURSIVE descendants(id) AS (
            SELECT ?1
            UNION ALL
            SELECT p.id FROM points p JOIN descendants d ON p.parent_id = d.id
        )
        SELECT id, content, tag_type, parent_id, source_doc_name, created_at
        FROM points
        WHERE id NOT IN (SELECT id FROM descendants)
          AND ({})
        ORDER BY created_at DESC
        LIMIT ?{}",
        like_clauses.join(" OR "),
        limit_idx
    );

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(bind.iter()), map_point_row)?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
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

fn map_point_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredPoint> {
    Ok(StoredPoint {
        id: row.get(0)?,
        content: row.get(1)?,
        tag_type: row.get(2)?,
        parent_id: row.get(3)?,
        source_doc_name: row.get(4)?,
        created_at: row.get(5)?,
    })
}
