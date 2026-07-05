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
    pub source_excerpt: Option<String>,
    pub created_at: String,
    pub archived: bool,
    pub starred: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SourceDocumentRecord {
    pub id: String,
    pub kind: String,
    pub title: Option<String>,
    pub canonical_uri: String,
    pub metadata_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PointSourceLink {
    pub point_id: String,
    pub source_id: String,
    pub chunk_index: i64,
    pub anchor_text: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SourceChunkRecord {
    pub id: String,
    pub source_id: String,
    pub chunk_index: i64,
    pub heading_path: Option<String>,
    pub text: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SourceSummaryRecord {
    pub id: String,
    pub kind: String,
    pub title: Option<String>,
    pub canonical_uri: String,
    pub metadata_json: String,
    pub created_at: String,
    pub updated_at: String,
    pub chunk_count: i64,
    pub point_count: i64,
    pub star_count: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SourceWorkspaceRecord {
    pub source: SourceSummaryRecord,
    pub chunks: Vec<SourceChunkRecord>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PointSourceContext {
    pub point_id: String,
    pub source: SourceSummaryRecord,
    pub chunk_index: i64,
    pub anchor_text: Option<String>,
    pub chunks: Vec<SourceChunkRecord>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchResult {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceSourceRecord {
    pub id: String,
    pub evidence_id: String,
    pub title: Option<String>,
    pub url: String,
    pub snippet: Option<String>,
    pub stance: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceRecord {
    pub id: String,
    pub claim: String,
    pub verdict: String,
    pub answer: String,
    pub reasoning: Option<String>,
    pub context: Option<String>,
    pub point_id: Option<String>,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
    pub checked_at: String,
    pub created_at: String,
    pub sources: Vec<EvidenceSourceRecord>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveEvidenceSourceInput {
    pub title: Option<String>,
    pub url: String,
    pub snippet: Option<String>,
    pub stance: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveEvidenceInput {
    pub claim: String,
    pub verdict: String,
    pub answer: String,
    pub reasoning: Option<String>,
    pub context: Option<String>,
    pub point_id: Option<String>,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
    pub checked_at: Option<String>,
    pub sources: Vec<SaveEvidenceSourceInput>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReportRecord {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub source_name: Option<String>,
    pub body_md: String,
    pub summary: String,
    pub citations_json: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveReportInput {
    pub title: String,
    pub kind: String,
    pub source_name: Option<String>,
    pub body_md: String,
    pub summary: String,
    pub citations_json: String,
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
            source_excerpt  TEXT,
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

    if !column_exists(conn, "points", "source_excerpt")? {
        conn.execute("ALTER TABLE points ADD COLUMN source_excerpt TEXT", [])
            .context("failed to add source_excerpt column")?;
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

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS source_documents (
            id             TEXT PRIMARY KEY,
            kind           TEXT NOT NULL,
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
        CREATE TABLE IF NOT EXISTS point_source_links (
            point_id      TEXT PRIMARY KEY,
            source_id     TEXT NOT NULL,
            chunk_index   INTEGER NOT NULL,
            anchor_text   TEXT,
            created_at    TEXT NOT NULL,
            FOREIGN KEY(point_id) REFERENCES points(id),
            FOREIGN KEY(source_id) REFERENCES source_documents(id)
        );
        CREATE INDEX IF NOT EXISTS idx_point_source_links_source
            ON point_source_links(source_id, chunk_index);",
    )
    .context("failed to create source tables")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS evidence_records (
            id             TEXT PRIMARY KEY,
            claim          TEXT NOT NULL,
            verdict        TEXT NOT NULL CHECK (verdict IN ('supported', 'contradicted', 'mixed', 'uncertain')),
            answer         TEXT NOT NULL,
            reasoning      TEXT,
            context        TEXT,
            point_id       TEXT,
            source_id      TEXT,
            chunk_index    INTEGER,
            checked_at     TEXT NOT NULL,
            created_at     TEXT NOT NULL,
            FOREIGN KEY(point_id) REFERENCES points(id) ON DELETE SET NULL,
            FOREIGN KEY(source_id) REFERENCES source_documents(id)
        );
        CREATE INDEX IF NOT EXISTS idx_evidence_records_point
            ON evidence_records(point_id);
        CREATE INDEX IF NOT EXISTS idx_evidence_records_source
            ON evidence_records(source_id, chunk_index);
        CREATE INDEX IF NOT EXISTS idx_evidence_records_checked_at
            ON evidence_records(checked_at DESC);
        CREATE TABLE IF NOT EXISTS evidence_sources (
            id             TEXT PRIMARY KEY,
            evidence_id    TEXT NOT NULL,
            title          TEXT,
            url            TEXT NOT NULL,
            snippet        TEXT,
            stance         TEXT NOT NULL CHECK (stance IN ('support', 'contradict', 'context', 'unknown')),
            created_at     TEXT NOT NULL,
            FOREIGN KEY(evidence_id) REFERENCES evidence_records(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_evidence_sources_evidence
            ON evidence_sources(evidence_id);",
    )
    .context("failed to create evidence tables")?;

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
            point_ids       TEXT NOT NULL DEFAULT '[]',
            source_points   TEXT NOT NULL DEFAULT '[]'
        );",
    )
    .context("failed to create gallery table")?;

    if !column_exists(conn, "gallery", "source_points")? {
        conn.execute("ALTER TABLE gallery ADD COLUMN source_points TEXT NOT NULL DEFAULT '[]'", [])
            .context("failed to add source_points column to gallery")?;
    }

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

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS reports (
            id              TEXT PRIMARY KEY,
            title           TEXT NOT NULL,
            kind            TEXT NOT NULL CHECK (kind IN ('digest', 'synthesis')),
            source_name     TEXT,
            body_md         TEXT NOT NULL,
            summary         TEXT NOT NULL,
            citations_json  TEXT NOT NULL,
            created_at      TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reports_kind
            ON reports(kind);
        CREATE INDEX IF NOT EXISTS idx_reports_created_at
            ON reports(created_at DESC);",
    )
    .context("failed to create reports table")?;

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

pub fn upsert_source_document(
    conn: &Connection,
    kind: &str,
    canonical_uri: &str,
    title: Option<&str>,
    metadata_json: &str,
) -> Result<SourceDocumentRecord> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut existing = conn.prepare(
        "SELECT id, kind, title, canonical_uri, metadata_json, created_at, updated_at
         FROM source_documents
         WHERE kind = ?1 AND canonical_uri = ?2",
    )?;
    let mut rows = existing.query(params![kind, canonical_uri])?;
    if let Some(row) = rows.next()? {
        let id: String = row.get(0)?;
        let created_at: String = row.get(5)?;
        conn.execute(
            "UPDATE source_documents
             SET title = ?1, metadata_json = ?2, updated_at = ?3
             WHERE id = ?4",
            params![title, metadata_json, now, id],
        )?;
        return Ok(SourceDocumentRecord {
            id,
            kind: kind.to_string(),
            title: title.map(str::to_string),
            canonical_uri: canonical_uri.to_string(),
            metadata_json: metadata_json.to_string(),
            created_at,
            updated_at: now,
        });
    }

    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO source_documents (id, kind, title, canonical_uri, metadata_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, kind, title, canonical_uri, metadata_json, now, now],
    )?;

    Ok(SourceDocumentRecord {
        id,
        kind: kind.to_string(),
        title: title.map(str::to_string),
        canonical_uri: canonical_uri.to_string(),
        metadata_json: metadata_json.to_string(),
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn replace_source_chunks(conn: &mut Connection, source_id: &str, chunks: &[String]) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM source_chunks WHERE source_id = ?1", params![source_id])?;
    for (index, chunk) in chunks.iter().enumerate() {
        tx.execute(
            "INSERT INTO source_chunks (id, source_id, chunk_index, heading_path, text, created_at)
             VALUES (?1, ?2, ?3, NULL, ?4, ?5)",
            params![uuid::Uuid::new_v4().to_string(), source_id, index as i64, chunk, now],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub fn insert_point_source_link(
    conn: &Connection,
    point_id: &str,
    source_id: &str,
    chunk_index: i64,
    anchor_text: Option<&str>,
) -> Result<PointSourceLink> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM source_documents WHERE id = ?1)",
        params![source_id],
        |row| row.get(0),
    )?;
    if !exists {
        anyhow::bail!("source document not found: {source_id}");
    }

    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO point_source_links (point_id, source_id, chunk_index, anchor_text, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![point_id, source_id, chunk_index, anchor_text, now],
    )?;

    Ok(PointSourceLink {
        point_id: point_id.to_string(),
        source_id: source_id.to_string(),
        chunk_index,
        anchor_text: anchor_text.map(str::to_string),
        created_at: now,
    })
}

fn source_summary_by_id(conn: &Connection, source_id: &str) -> Result<Option<SourceSummaryRecord>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.kind, s.title, s.canonical_uri, s.metadata_json, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM source_chunks c WHERE c.source_id = s.id) AS chunk_count,
                (SELECT COUNT(*) FROM point_source_links l WHERE l.source_id = s.id) AS point_count,
                (SELECT COUNT(*)
                 FROM point_source_links l
                 JOIN points p ON p.id = l.point_id
                 WHERE l.source_id = s.id AND p.starred = 1) AS star_count
         FROM source_documents s
         WHERE s.id = ?1",
    )?;
    let mut rows = stmt.query(params![source_id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(map_source_summary_row(row)?))
    } else {
        Ok(None)
    }
}

fn list_source_chunks(conn: &Connection, source_id: &str) -> Result<Vec<SourceChunkRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, source_id, chunk_index, heading_path, text, created_at
         FROM source_chunks
         WHERE source_id = ?1
         ORDER BY chunk_index",
    )?;
    let rows = stmt.query_map(params![source_id], map_source_chunk_row)?;
    let mut chunks = Vec::new();
    for row in rows {
        chunks.push(row?);
    }
    Ok(chunks)
}

pub fn get_source_workspace(conn: &Connection, source_id: &str) -> Result<Option<SourceWorkspaceRecord>> {
    let Some(source) = source_summary_by_id(conn, source_id)? else {
        return Ok(None);
    };
    let chunks = list_source_chunks(conn, source_id)?;
    Ok(Some(SourceWorkspaceRecord { source, chunks }))
}

pub fn get_source_workspace_summary(conn: &Connection, source_id: &str) -> Result<Option<SourceSummaryRecord>> {
    source_summary_by_id(conn, source_id)
}

pub fn list_recent_sources(conn: &Connection, limit: usize) -> Result<Vec<SourceSummaryRecord>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.kind, s.title, s.canonical_uri, s.metadata_json, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM source_chunks c WHERE c.source_id = s.id) AS chunk_count,
                (SELECT COUNT(*) FROM point_source_links l WHERE l.source_id = s.id) AS point_count,
                (SELECT COUNT(*)
                 FROM point_source_links l
                 JOIN points p ON p.id = l.point_id
                 WHERE l.source_id = s.id AND p.starred = 1) AS star_count
         FROM source_documents s
         ORDER BY s.updated_at DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit as i64], map_source_summary_row)?;
    let mut sources = Vec::new();
    for row in rows {
        sources.push(row?);
    }
    Ok(sources)
}

pub fn get_point_source_context(conn: &Connection, point_id: &str) -> Result<Option<PointSourceContext>> {
    let mut stmt = conn.prepare(
        "SELECT source_id, chunk_index, anchor_text
         FROM point_source_links
         WHERE point_id = ?1",
    )?;
    let mut rows = stmt.query(params![point_id])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };

    let source_id: String = row.get(0)?;
    let chunk_index: i64 = row.get(1)?;
    let anchor_text: Option<String> = row.get(2)?;
    let Some(source) = source_summary_by_id(conn, &source_id)? else {
        return Ok(None);
    };
    let chunks = list_source_chunks(conn, &source_id)?;

    Ok(Some(PointSourceContext {
        point_id: point_id.to_string(),
        source,
        chunk_index,
        anchor_text,
        chunks,
    }))
}

fn point_source_location(conn: &Connection, point_id: &str) -> Result<Option<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT source_id, chunk_index
         FROM point_source_links
         WHERE point_id = ?1",
    )?;
    let mut rows = stmt.query(params![point_id])?;
    if let Some(row) = rows.next()? {
        Ok(Some((row.get(0)?, row.get(1)?)))
    } else {
        Ok(None)
    }
}

pub fn search_workspace(conn: &Connection, query: &str, limit: usize) -> Result<Vec<WorkspaceSearchResult>> {
    let trimmed = query.trim();
    if trimmed.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    let pattern = format!("%{}%", escape_like(trimmed));
    let source_limit = (limit / 2).max(5);
    let point_limit = limit.saturating_sub(source_limit).max(5);
    let mut results = Vec::new();

    let mut source_stmt = conn.prepare(
        "SELECT s.id, s.title, s.canonical_uri
         FROM source_documents s
         WHERE s.title LIKE ?1 ESCAPE '\\'
            OR s.canonical_uri LIKE ?1 ESCAPE '\\'
            OR s.metadata_json LIKE ?1 ESCAPE '\\'
         ORDER BY s.updated_at DESC
         LIMIT ?2",
    )?;
    let source_rows = source_stmt.query_map(params![pattern, source_limit as i64], |row| {
        let id: String = row.get(0)?;
        let title: Option<String> = row.get(1)?;
        let canonical_uri: String = row.get(2)?;
        Ok(WorkspaceSearchResult {
            kind: "source".to_string(),
            id,
            title: title.filter(|value| !value.trim().is_empty()).unwrap_or_else(|| canonical_uri.clone()),
            snippet: canonical_uri,
            source_id: None,
            chunk_index: None,
        })
    })?;
    for row in source_rows {
        results.push(row?);
    }

    for point in search_points(conn, trimmed, point_limit)? {
        let location = point_source_location(conn, &point.id)?;
        results.push(WorkspaceSearchResult {
            kind: "point".to_string(),
            id: point.id,
            title: point.source_doc_name.unwrap_or_else(|| point.tag_type.unwrap_or_else(|| "观点".to_string())),
            snippet: point.content,
            source_id: location.as_ref().map(|(source_id, _)| source_id.clone()),
            chunk_index: location.map(|(_, chunk_index)| chunk_index),
        });
    }

    results.truncate(limit);
    Ok(results)
}

// Staged DB API for the next command/UI slice; this data-layer task does not wire callers yet.
#[allow(dead_code)]
pub fn save_evidence(conn: &mut Connection, input: SaveEvidenceInput) -> Result<EvidenceRecord> {
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let claim = required_trimmed("claim", &input.claim)?.to_string();
    let verdict = input.verdict.trim().to_string();
    validate_evidence_verdict(&verdict)?;
    let answer = required_trimmed("answer", &input.answer)?.to_string();
    let reasoning = optional_trimmed(input.reasoning.as_deref());
    let context = optional_trimmed(input.context.as_deref());
    let point_id = optional_trimmed(input.point_id.as_deref());
    let source_id = optional_trimmed(input.source_id.as_deref());
    let checked_at = optional_trimmed(input.checked_at.as_deref()).unwrap_or_else(|| now.clone());
    let chunk_index = input.chunk_index;

    let mut sources = Vec::with_capacity(input.sources.len());
    for source in input.sources {
        let url = required_trimmed("source url", &source.url)?.to_string();
        let stance = source.stance.trim().to_string();
        validate_evidence_stance(&stance)?;
        sources.push((
            optional_trimmed(source.title.as_deref()),
            url,
            optional_trimmed(source.snippet.as_deref()),
            stance,
        ));
    }

    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO evidence_records
            (id, claim, verdict, answer, reasoning, context, point_id, source_id, chunk_index, checked_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![id, claim, verdict, answer, reasoning, context, point_id, source_id, chunk_index, checked_at, now],
    )?;

    for (title, url, snippet, stance) in sources {
        tx.execute(
            "INSERT INTO evidence_sources (id, evidence_id, title, url, snippet, stance, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![uuid::Uuid::new_v4().to_string(), id, title, url, snippet, stance, now],
        )?;
    }

    tx.commit()?;
    get_evidence(conn, &id)?.ok_or_else(|| anyhow::anyhow!("saved evidence not found: {id}"))
}

#[allow(dead_code)]
pub fn get_evidence(conn: &Connection, evidence_id: &str) -> Result<Option<EvidenceRecord>> {
    if evidence_id.trim().is_empty() {
        return Ok(None);
    }

    let mut stmt = conn.prepare(
        "SELECT id, claim, verdict, answer, reasoning, context, point_id, source_id, chunk_index, checked_at, created_at
         FROM evidence_records
         WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![evidence_id])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };

    let mut record = map_evidence_row(row)?;
    record.sources = list_evidence_sources(conn, &record.id)?;
    Ok(Some(record))
}

#[allow(dead_code)]
pub fn list_evidence_for_point(conn: &Connection, point_id: &str) -> Result<Vec<EvidenceRecord>> {
    if point_id.trim().is_empty() {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT id, claim, verdict, answer, reasoning, context, point_id, source_id, chunk_index, checked_at, created_at
         FROM evidence_records
         WHERE point_id = ?1
         ORDER BY checked_at DESC, created_at DESC",
    )?;
    let rows = stmt.query_map(params![point_id], map_evidence_row)?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    hydrate_evidence_records(conn, records)
}

#[allow(dead_code)]
pub fn list_evidence_for_source(conn: &Connection, source_id: &str) -> Result<Vec<EvidenceRecord>> {
    if source_id.trim().is_empty() {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT id, claim, verdict, answer, reasoning, context, point_id, source_id, chunk_index, checked_at, created_at
         FROM evidence_records
         WHERE source_id = ?1
         ORDER BY checked_at DESC, created_at DESC",
    )?;
    let rows = stmt.query_map(params![source_id], map_evidence_row)?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    hydrate_evidence_records(conn, records)
}

#[allow(dead_code)]
pub fn list_recent_evidence(conn: &Connection, limit: usize) -> Result<Vec<EvidenceRecord>> {
    if limit == 0 {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT id, claim, verdict, answer, reasoning, context, point_id, source_id, chunk_index, checked_at, created_at
         FROM evidence_records
         ORDER BY checked_at DESC, created_at DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit as i64], map_evidence_row)?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    hydrate_evidence_records(conn, records)
}

#[allow(dead_code)]
pub fn search_evidence(conn: &Connection, query: &str, limit: usize) -> Result<Vec<EvidenceRecord>> {
    let trimmed = query.trim();
    if trimmed.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    let pattern = format!("%{}%", escape_like(trimmed));
    let mut stmt = conn.prepare(
        "SELECT DISTINCT e.id, e.claim, e.verdict, e.answer, e.reasoning, e.context,
                e.point_id, e.source_id, e.chunk_index, e.checked_at, e.created_at
         FROM evidence_records e
         LEFT JOIN evidence_sources s ON s.evidence_id = e.id
         WHERE e.claim LIKE ?1 ESCAPE '\\'
            OR e.answer LIKE ?1 ESCAPE '\\'
            OR e.reasoning LIKE ?1 ESCAPE '\\'
            OR e.context LIKE ?1 ESCAPE '\\'
            OR s.title LIKE ?1 ESCAPE '\\'
            OR s.url LIKE ?1 ESCAPE '\\'
            OR s.snippet LIKE ?1 ESCAPE '\\'
            OR s.stance LIKE ?1 ESCAPE '\\'
         ORDER BY e.checked_at DESC, e.created_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![pattern, limit as i64], map_evidence_row)?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    hydrate_evidence_records(conn, records)
}

#[allow(dead_code)]
fn hydrate_evidence_records(conn: &Connection, mut records: Vec<EvidenceRecord>) -> Result<Vec<EvidenceRecord>> {
    for record in &mut records {
        record.sources = list_evidence_sources(conn, &record.id)?;
    }
    Ok(records)
}

#[allow(dead_code)]
fn list_evidence_sources(conn: &Connection, evidence_id: &str) -> Result<Vec<EvidenceSourceRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, evidence_id, title, url, snippet, stance, created_at
         FROM evidence_sources
         WHERE evidence_id = ?1
         ORDER BY created_at, id",
    )?;
    let rows = stmt.query_map(params![evidence_id], map_evidence_source_row)?;
    let mut sources = Vec::new();
    for row in rows {
        sources.push(row?);
    }
    Ok(sources)
}

pub fn save_report(conn: &Connection, input: SaveReportInput) -> Result<ReportRecord> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let title = required_trimmed("report title", &input.title)?.to_string();
    let kind = input.kind.trim().to_string();
    validate_report_kind(&kind)?;
    let source_name = optional_trimmed(input.source_name.as_deref());
    let body_md = required_trimmed("report body", &input.body_md)?.to_string();
    let summary = required_trimmed("report summary", &input.summary)?.to_string();
    let citations_json = normalize_report_citations_json(&input.citations_json)?;

    conn.execute(
        "INSERT INTO reports (id, title, kind, source_name, body_md, summary, citations_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, title, kind, source_name, body_md, summary, citations_json, now],
    )?;

    get_report(conn, &id)?.ok_or_else(|| anyhow::anyhow!("saved report not found: {id}"))
}

pub fn get_report(conn: &Connection, report_id: &str) -> Result<Option<ReportRecord>> {
    if report_id.trim().is_empty() {
        return Ok(None);
    }

    let mut stmt = conn.prepare(
        "SELECT id, title, kind, source_name, body_md, summary, citations_json, created_at
         FROM reports
         WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![report_id])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };

    Ok(Some(map_report_row(row)?))
}

pub fn list_recent_reports(conn: &Connection, limit: usize) -> Result<Vec<ReportRecord>> {
    if limit == 0 {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT id, title, kind, source_name, body_md, summary, citations_json, created_at
         FROM reports
         ORDER BY created_at DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit as i64], map_report_row)?;
    let mut reports = Vec::new();
    for row in rows {
        reports.push(row?);
    }
    Ok(reports)
}

pub fn search_reports(conn: &Connection, query: &str, limit: usize) -> Result<Vec<ReportRecord>> {
    let trimmed = query.trim();
    if trimmed.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    let pattern = format!("%{}%", escape_like(trimmed));
    let mut stmt = conn.prepare(
        "SELECT id, title, kind, source_name, body_md, summary, citations_json, created_at
         FROM reports
         WHERE title LIKE ?1 ESCAPE '\\'
            OR kind LIKE ?1 ESCAPE '\\'
            OR source_name LIKE ?1 ESCAPE '\\'
            OR body_md LIKE ?1 ESCAPE '\\'
            OR summary LIKE ?1 ESCAPE '\\'
            OR citations_json LIKE ?1 ESCAPE '\\'
         ORDER BY created_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![pattern, limit as i64], map_report_row)?;
    let mut reports = Vec::new();
    for row in rows {
        reports.push(row?);
    }
    Ok(reports)
}

/// Read every non-archived point (newest first) including its parent link.
pub fn list_points(conn: &Connection) -> Result<Vec<StoredPoint>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, tag_type, parent_id, source_doc_name, source_excerpt, created_at, archived, starred
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
            "INSERT INTO points (id, content, tag_type, parent_id, source_doc_name, source_excerpt, created_at)
             VALUES (?1, ?2, ?3, ?4, NULL, NULL, ?5)",
            params![id, content, tag_type, parent_id, now],
        )?;
        written.push(StoredPoint {
            id,
            content: content.clone(),
            tag_type: Some(tag_type.clone()),
            parent_id: parent_id.map(str::to_string),
            source_doc_name: None,
            source_excerpt: None,
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
    if keywords.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    // FTS5 uses the trigram tokenizer here; two-character CJK terms cannot
    // produce stable MATCH results, so keep those for the local fallback.
    let fts_keywords = keywords
        .iter()
        .filter(|kw| kw.chars().count() >= 3)
        .collect::<Vec<_>>();

    let mut out = if fts_keywords.is_empty() {
        Vec::new()
    } else {
        // Build an OR query for FTS5: each keyword as a quoted phrase so special
        // chars are treated literally.
        let fts_query = fts_keywords
            .iter()
            .map(|kw| format!("\"{}\"", kw.replace('"', " ")))
            .collect::<Vec<_>>()
            .join(" OR ");

        let sql = "WITH RECURSIVE descendants(id) AS (
                SELECT ?1
                UNION ALL
                SELECT p.id FROM points p JOIN descendants d ON p.parent_id = d.id
            )
            SELECT p.id, p.content, p.tag_type, p.parent_id, p.source_doc_name, p.source_excerpt, p.created_at, p.archived, p.starred
            FROM points_fts f
            JOIN points p ON p.id = f.id
            WHERE points_fts MATCH ?2
              AND p.archived = 0
              AND p.id NOT IN (SELECT id FROM descendants)
            ORDER BY rank
            LIMIT ?3";

        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![point_id, fts_query, limit as i64], map_point_row)?;

        let mut rows_out = Vec::new();
        for row in rows {
            rows_out.push(row?);
        }
        rows_out
    };

    if out.len() < limit {
        let seen = out.iter().map(|point| point.id.clone()).collect::<HashSet<_>>();
        let mut fallback = find_similar_points_by_keyword_overlap(
            conn,
            point_id,
            keywords,
            limit - out.len(),
            &seen,
        )?;
        out.append(&mut fallback);
    }

    Ok(out)
}

fn find_similar_points_by_keyword_overlap(
    conn: &Connection,
    point_id: &str,
    keywords: &[String],
    limit: usize,
    seen: &HashSet<String>,
) -> Result<Vec<StoredPoint>> {
    if limit == 0 {
        return Ok(Vec::new());
    }

    let like_terms = keywords
        .iter()
        .filter(|kw| kw.chars().count() >= 2)
        .take(12)
        .map(|kw| format!("%{}%", escape_like(kw)))
        .collect::<Vec<_>>();

    if like_terms.is_empty() {
        return Ok(Vec::new());
    }

    let mut sql = String::from(
        "WITH RECURSIVE descendants(id) AS (
            SELECT ?
            UNION ALL
            SELECT p.id FROM points p JOIN descendants d ON p.parent_id = d.id
        )
        SELECT p.id, p.content, p.tag_type, p.parent_id, p.source_doc_name, p.source_excerpt, p.created_at, p.archived, p.starred
        FROM points p
        WHERE p.archived = 0
          AND p.id NOT IN (SELECT id FROM descendants)",
    );

    let mut values = vec![point_id.to_string()];
    if !seen.is_empty() {
        let placeholders = std::iter::repeat("?")
            .take(seen.len())
            .collect::<Vec<_>>()
            .join(", ");
        sql.push_str(&format!(" AND p.id NOT IN ({placeholders})"));
        values.extend(seen.iter().cloned());
    }

    let like_clause = std::iter::repeat("p.content LIKE ? ESCAPE '\\'")
        .take(like_terms.len())
        .collect::<Vec<_>>()
        .join(" OR ");
    sql.push_str(&format!(" AND ({like_clause}) ORDER BY p.created_at DESC LIMIT 250"));
    values.extend(like_terms);

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(values.iter()), map_point_row)?;
    let mut scored = Vec::new();
    for row in rows {
        let point = row?;
        let score = keyword_overlap_score(&point.content, keywords);
        if score > 0 {
            scored.push((score, point));
        }
    }

    scored.sort_by(|(left_score, left), (right_score, right)| {
        right_score
            .cmp(left_score)
            .then_with(|| right.created_at.cmp(&left.created_at))
    });

    Ok(scored
        .into_iter()
        .take(limit)
        .map(|(_, point)| point)
        .collect())
}

fn keyword_overlap_score(content: &str, keywords: &[String]) -> usize {
    keywords
        .iter()
        .filter(|kw| kw.chars().count() >= 2 && content.contains(kw.as_str()))
        .map(|kw| kw.chars().count().min(6))
        .sum()
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
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

    let sql = "SELECT p.id, p.content, p.tag_type, p.parent_id, p.source_doc_name, p.source_excerpt, p.created_at, p.archived, p.starred
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
         UPDATE evidence_records SET point_id = NULL WHERE point_id IN (SELECT id FROM descendants);
         WITH RECURSIVE descendants(id) AS (
             SELECT '{pid}'
             UNION ALL
             SELECT p.id FROM points p JOIN descendants d ON p.parent_id = d.id
         )
         DELETE FROM point_source_links WHERE point_id IN (SELECT id FROM descendants);
         WITH RECURSIVE descendants(id) AS (
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

/// Derive rough keywords from a point's content: CJK trigrams/bigrams plus
/// latin word tokens. Deliberately simple — this feeds local similarity search.
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
            for window in chars.windows(3) {
                let trigram: String = window.iter().collect();
                if seen.insert(trigram.clone()) {
                    out.push(trigram);
                }
            }
            for window in chars.windows(2) {
                let bigram: String = window.iter().collect();
                if seen.insert(bigram.clone()) {
                    out.push(bigram);
                }
            }
        } else if chars.len() >= 3 {
            let word: String = chars.iter().collect::<String>().to_lowercase();
            if seen.insert(word.clone()) {
                out.push(word);
            }
        }
    }

    out.truncate(18);
    out
}

/// Read every archived point (newest first).
pub fn list_archived_points(conn: &Connection) -> Result<Vec<StoredPoint>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, tag_type, parent_id, source_doc_name, source_excerpt, created_at, archived, starred
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
        source_excerpt: row.get(5)?,
        created_at: row.get(6)?,
        archived: row.get::<_, i64>(7).unwrap_or(0) != 0,
        starred: row.get::<_, i64>(8).unwrap_or(0) != 0,
    })
}

fn map_source_summary_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SourceSummaryRecord> {
    Ok(SourceSummaryRecord {
        id: row.get(0)?,
        kind: row.get(1)?,
        title: row.get(2)?,
        canonical_uri: row.get(3)?,
        metadata_json: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        chunk_count: row.get(7)?,
        point_count: row.get(8)?,
        star_count: row.get(9)?,
    })
}

fn map_source_chunk_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SourceChunkRecord> {
    Ok(SourceChunkRecord {
        id: row.get(0)?,
        source_id: row.get(1)?,
        chunk_index: row.get(2)?,
        heading_path: row.get(3)?,
        text: row.get(4)?,
        created_at: row.get(5)?,
    })
}

fn map_evidence_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<EvidenceRecord> {
    Ok(EvidenceRecord {
        id: row.get(0)?,
        claim: row.get(1)?,
        verdict: row.get(2)?,
        answer: row.get(3)?,
        reasoning: row.get(4)?,
        context: row.get(5)?,
        point_id: row.get(6)?,
        source_id: row.get(7)?,
        chunk_index: row.get(8)?,
        checked_at: row.get(9)?,
        created_at: row.get(10)?,
        sources: Vec::new(),
    })
}

fn map_evidence_source_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<EvidenceSourceRecord> {
    Ok(EvidenceSourceRecord {
        id: row.get(0)?,
        evidence_id: row.get(1)?,
        title: row.get(2)?,
        url: row.get(3)?,
        snippet: row.get(4)?,
        stance: row.get(5)?,
        created_at: row.get(6)?,
    })
}

fn map_report_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReportRecord> {
    Ok(ReportRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        kind: row.get(2)?,
        source_name: row.get(3)?,
        body_md: row.get(4)?,
        summary: row.get(5)?,
        citations_json: row.get(6)?,
        created_at: row.get(7)?,
    })
}

fn required_trimmed<'a>(field: &str, value: &'a str) -> Result<&'a str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        anyhow::bail!("{field} is required");
    }
    Ok(trimmed)
}

fn optional_trimmed(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|trimmed| !trimmed.is_empty())
        .map(str::to_string)
}

fn validate_evidence_verdict(verdict: &str) -> Result<()> {
    match verdict {
        "supported" | "contradicted" | "mixed" | "uncertain" => Ok(()),
        _ => anyhow::bail!("invalid evidence verdict: {verdict}"),
    }
}

fn validate_evidence_stance(stance: &str) -> Result<()> {
    match stance {
        "support" | "contradict" | "context" | "unknown" => Ok(()),
        _ => anyhow::bail!("invalid evidence source stance: {stance}"),
    }
}

fn validate_report_kind(kind: &str) -> Result<()> {
    match kind {
        "digest" | "synthesis" => Ok(()),
        _ => anyhow::bail!("invalid report kind: {kind}"),
    }
}

fn normalize_report_citations_json(value: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        anyhow::bail!("report citations json is required");
    }
    let parsed: serde_json::Value = serde_json::from_str(trimmed)
        .context("report citations json must be valid JSON")?;
    if !parsed.is_array() {
        anyhow::bail!("report citations json must be an array");
    }
    Ok(parsed.to_string())
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
        "SELECT id, content, tag_type, parent_id, source_doc_name, source_excerpt, created_at, archived, starred
         FROM points WHERE starred = 1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], map_point_row)?;
    let mut out = Vec::new();
    for row in rows { out.push(row?); }
    Ok(out)
}

/// Clear the current starred collection after a digest has been generated.
pub fn clear_starred_points(conn: &Connection) -> Result<u32> {
    conn.execute("UPDATE points SET starred = 0 WHERE starred = 1", [])?;
    starred_count(conn)
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
    pub source_points: Vec<GallerySourcePoint>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GallerySourcePoint {
    pub id: String,
    pub content: String,
    pub source_doc_name: Option<String>,
}

pub fn insert_gallery_item(conn: &Connection, item: &GalleryItem) -> Result<()> {
    let point_ids = serde_json::to_string(&item.point_ids)?;
    let source_points = serde_json::to_string(&item.source_points)?;
    conn.execute(
        "INSERT INTO gallery (id, file_path, thumbnail_path, prompt, generated_at, download_status, point_ids, source_points)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![item.id, item.file_path, item.thumbnail_path, item.prompt,
                item.generated_at, item.download_status, point_ids, source_points],
    )?;
    Ok(())
}

pub fn list_gallery(conn: &Connection) -> Result<Vec<GalleryItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, file_path, thumbnail_path, prompt, generated_at, download_status, point_ids, source_points
         FROM gallery ORDER BY generated_at DESC",
    )?;
    let rows = stmt.query_map([], map_gallery_row)?;
    let mut out = Vec::new();
    for row in rows { out.push(row?); }
    Ok(out)
}

pub fn get_gallery_item(conn: &Connection, id: &str) -> Result<Option<GalleryItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, file_path, thumbnail_path, prompt, generated_at, download_status, point_ids, source_points
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
    let source_points_str: String = row.get(7)?;
    let source_points: Vec<GallerySourcePoint> = serde_json::from_str(&source_points_str).unwrap_or_default();
    Ok(GalleryItem {
        id: row.get(0)?,
        file_path: row.get(1)?,
        thumbnail_path: row.get(2)?,
        prompt: row.get(3)?,
        generated_at: row.get(4)?,
        download_status: row.get(5)?,
        point_ids,
        source_points,
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

pub fn delete_suggestion(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM suggestions WHERE id = ?1", params![id])?;
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn
    }

    fn insert_point(
        conn: &Connection,
        id: &str,
        content: &str,
        parent_id: Option<&str>,
        created_at: &str,
    ) {
        conn.execute(
            "INSERT INTO points
                (id, content, tag_type, parent_id, source_doc_name, source_excerpt, created_at, archived, starred)
             VALUES (?1, ?2, '作者观点', ?3, '测试文档', NULL, ?4, 0, 0)",
            params![id, content, parent_id, created_at],
        )
        .unwrap();
    }

    fn evidence_input(
        claim: &str,
        point_id: Option<&str>,
        source_id: Option<&str>,
        checked_at: &str,
    ) -> SaveEvidenceInput {
        SaveEvidenceInput {
            claim: claim.to_string(),
            verdict: "supported".to_string(),
            answer: format!("Evidence answer for {claim}"),
            reasoning: Some("Evidence reasoning".to_string()),
            context: Some("Evidence context".to_string()),
            point_id: point_id.map(str::to_string),
            source_id: source_id.map(str::to_string),
            chunk_index: Some(0),
            checked_at: Some(checked_at.to_string()),
            sources: vec![SaveEvidenceSourceInput {
                title: Some(format!("{claim} source")),
                url: format!("https://example.com/evidence/{}", claim.replace(' ', "-").to_lowercase()),
                snippet: Some(format!("{claim} source snippet")),
                stance: "support".to_string(),
            }],
        }
    }

    fn report_input(title: &str, kind: &str, created_label: &str) -> SaveReportInput {
        SaveReportInput {
            title: title.to_string(),
            kind: kind.to_string(),
            source_name: Some(format!("{kind} source")),
            body_md: format!("# {title}\n\nReport body with {created_label}"),
            summary: format!("{title} summary"),
            citations_json: format!(
                r#"[{{"kind":"source","label":"S1","id":"source-{created_label}","title":"Source {created_label}","excerpt":"quoted evidence","sourceId":"source-{created_label}","chunkIndex":0,"url":"https://example.com/{created_label}"}}]"#
            ),
        }
    }

    #[test]
    fn upsert_source_document_reuses_existing_row() {
        let conn = memory_db();

        let first = upsert_source_document(
            &conn,
            "file",
            "D:/docs/test.md",
            Some("test.md"),
            r#"{"kind":"file"}"#,
        )
        .unwrap();
        let second = upsert_source_document(
            &conn,
            "file",
            "D:/docs/test.md",
            Some("test.md"),
            r#"{"kind":"file","updated":true}"#,
        )
        .unwrap();

        assert_eq!(first.id, second.id);
        assert_eq!(second.metadata_json, r#"{"kind":"file","updated":true}"#);

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM source_documents", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn replace_source_chunks_replaces_previous_rows() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "webpage",
            "https://example.com/story",
            Some("Story"),
            r#"{"kind":"webpage"}"#,
        )
        .unwrap();

        replace_source_chunks(&mut conn, &source.id, &["first".to_string(), "second".to_string()]).unwrap();
        replace_source_chunks(&mut conn, &source.id, &["updated".to_string()]).unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM source_chunks WHERE source_id = ?1", params![source.id], |row| row.get(0))
            .unwrap();
        let text: String = conn
            .query_row(
                "SELECT text FROM source_chunks WHERE source_id = ?1 ORDER BY chunk_index LIMIT 1",
                params![source.id],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(count, 1);
        assert_eq!(text, "updated");
    }

    #[test]
    fn insert_point_source_link_persists_chunk_location() {
        let conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "file",
            "D:/docs/source.md",
            Some("source.md"),
            r#"{"kind":"file"}"#,
        )
        .unwrap();
        insert_point(
            &conn,
            "point-1",
            "这是一条来自来源块的观点。",
            None,
            "2026-07-03T00:00:00Z",
        );

        let link = insert_point_source_link(
            &conn,
            "point-1",
            &source.id,
            2,
            Some("来源块原文"),
        )
        .unwrap();

        assert_eq!(link.point_id, "point-1");
        assert_eq!(link.source_id, source.id);
        assert_eq!(link.chunk_index, 2);

        let row: (String, i64, String) = conn
            .query_row(
                "SELECT source_id, chunk_index, anchor_text
                 FROM point_source_links
                 WHERE point_id = ?1",
                params!["point-1"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(row, (source.id, 2, "来源块原文".to_string()));
    }

    #[test]
    fn get_point_source_context_returns_source_and_chunks() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "webpage",
            "https://example.com/a",
            Some("Example A"),
            r#"{"kind":"webpage","name":"Example A"}"#,
        )
        .unwrap();
        replace_source_chunks(&mut conn, &source.id, &["alpha".to_string(), "beta".to_string()]).unwrap();
        insert_point(
            &conn,
            "point-context",
            "beta summary",
            None,
            "2026-07-03T00:00:00Z",
        );
        insert_point_source_link(&conn, "point-context", &source.id, 1, Some("beta")).unwrap();

        let context = get_point_source_context(&conn, "point-context").unwrap().unwrap();

        assert_eq!(context.point_id, "point-context");
        assert_eq!(context.source.id, source.id);
        assert_eq!(context.chunk_index, 1);
        assert_eq!(context.chunks.len(), 2);
        assert_eq!(context.chunks[1].text, "beta");
    }

    #[test]
    fn source_summary_counts_chunks_points_and_stars() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "file",
            "D:/docs/counts.md",
            Some("counts.md"),
            r#"{"kind":"file"}"#,
        )
        .unwrap();
        replace_source_chunks(&mut conn, &source.id, &["one".to_string(), "two".to_string()]).unwrap();
        insert_point(&conn, "point-a", "one summary", None, "2026-07-03T00:00:00Z");
        insert_point(&conn, "point-b", "two summary", None, "2026-07-03T00:01:00Z");
        insert_point_source_link(&conn, "point-a", &source.id, 0, None).unwrap();
        insert_point_source_link(&conn, "point-b", &source.id, 1, None).unwrap();
        set_starred(&conn, "point-b", true).unwrap();

        let summary = get_source_workspace_summary(&conn, &source.id).unwrap().unwrap();

        assert_eq!(summary.chunk_count, 2);
        assert_eq!(summary.point_count, 2);
        assert_eq!(summary.star_count, 1);
    }

    #[test]
    fn search_workspace_returns_sources_and_linked_points() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "webpage",
            "https://example.com/productivity",
            Some("Productivity Note"),
            r#"{"kind":"webpage"}"#,
        )
        .unwrap();
        replace_source_chunks(&mut conn, &source.id, &["deep work chunk".to_string()]).unwrap();
        insert_point(
            &conn,
            "point-search",
            "deep work improves focus",
            None,
            "2026-07-03T00:00:00Z",
        );
        insert_point_source_link(&conn, "point-search", &source.id, 0, None).unwrap();

        let results = search_workspace(&conn, "Productivity", 20).unwrap();
        assert!(results.iter().any(|result| result.kind == "source" && result.id == source.id));

        let point_results = search_workspace(&conn, "focus", 20).unwrap();
        assert!(point_results.iter().any(|result| {
            result.kind == "point"
                && result.id == "point-search"
                && result.source_id.as_deref() == Some(source.id.as_str())
                && result.chunk_index == Some(0)
        }));
    }

    #[test]
    fn save_evidence_persists_record_and_sources() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "webpage",
            "https://example.com/remote-work",
            Some("Remote Work Study"),
            r#"{"kind":"webpage"}"#,
        )
        .unwrap();
        insert_point(
            &conn,
            "point-evidence",
            "Remote work boosts productivity.",
            None,
            "2026-07-05T00:00:00Z",
        );

        let mut input = evidence_input(
            "  Remote work boosts productivity  ",
            Some("point-evidence"),
            Some(&source.id),
            "2026-07-05T00:10:00Z",
        );
        input.answer = "  Multiple studies support hybrid productivity gains.  ".to_string();
        input.sources[0].url = "  https://example.com/remote-work  ".to_string();
        let saved = save_evidence(&mut conn, input).unwrap();

        assert_eq!(saved.claim, "Remote work boosts productivity");
        assert_eq!(saved.verdict, "supported");
        assert_eq!(saved.answer, "Multiple studies support hybrid productivity gains.");
        assert_eq!(saved.point_id.as_deref(), Some("point-evidence"));
        assert_eq!(saved.source_id.as_deref(), Some(source.id.as_str()));
        assert_eq!(saved.chunk_index, Some(0));
        assert_eq!(saved.checked_at, "2026-07-05T00:10:00Z");
        assert_eq!(saved.sources.len(), 1);
        assert_eq!(saved.sources[0].url, "https://example.com/remote-work");
        assert_eq!(saved.sources[0].stance, "support");

        let fetched = get_evidence(&conn, &saved.id).unwrap().unwrap();
        assert_eq!(fetched.id, saved.id);
        assert_eq!(fetched.sources.len(), 1);
        assert_eq!(fetched.sources[0].evidence_id, saved.id);
    }

    #[test]
    fn list_evidence_for_point_returns_hydrated_sources() {
        let mut conn = memory_db();
        insert_point(&conn, "point-a", "first point", None, "2026-07-05T00:00:00Z");
        insert_point(&conn, "point-b", "second point", None, "2026-07-05T00:01:00Z");

        save_evidence(
            &mut conn,
            evidence_input("older evidence", Some("point-a"), None, "2026-07-05T00:02:00Z"),
        )
        .unwrap();
        save_evidence(
            &mut conn,
            evidence_input("newer evidence", Some("point-a"), None, "2026-07-05T00:03:00Z"),
        )
        .unwrap();
        save_evidence(
            &mut conn,
            evidence_input("other point evidence", Some("point-b"), None, "2026-07-05T00:04:00Z"),
        )
        .unwrap();

        let records = list_evidence_for_point(&conn, "point-a").unwrap();

        assert_eq!(records.len(), 2);
        assert_eq!(records[0].claim, "newer evidence");
        assert_eq!(records[1].claim, "older evidence");
        assert_eq!(records[0].sources.len(), 1);
        assert_eq!(records[0].sources[0].stance, "support");
    }

    #[test]
    fn list_evidence_for_source_returns_linked_records() {
        let mut conn = memory_db();
        let source_a = upsert_source_document(
            &conn,
            "file",
            "D:/docs/source-a.md",
            Some("source-a.md"),
            r#"{"kind":"file"}"#,
        )
        .unwrap();
        let source_b = upsert_source_document(
            &conn,
            "file",
            "D:/docs/source-b.md",
            Some("source-b.md"),
            r#"{"kind":"file"}"#,
        )
        .unwrap();

        save_evidence(
            &mut conn,
            evidence_input("source a older", None, Some(&source_a.id), "2026-07-05T00:02:00Z"),
        )
        .unwrap();
        save_evidence(
            &mut conn,
            evidence_input("source a newer", None, Some(&source_a.id), "2026-07-05T00:03:00Z"),
        )
        .unwrap();
        save_evidence(
            &mut conn,
            evidence_input("source b evidence", None, Some(&source_b.id), "2026-07-05T00:04:00Z"),
        )
        .unwrap();

        let records = list_evidence_for_source(&conn, &source_a.id).unwrap();

        assert_eq!(records.len(), 2);
        assert!(records.iter().all(|record| record.source_id.as_deref() == Some(source_a.id.as_str())));
        assert_eq!(records[0].claim, "source a newer");
    }

    #[test]
    fn list_recent_evidence_returns_newest_hydrated_records_with_limit() {
        let mut conn = memory_db();

        save_evidence(
            &mut conn,
            evidence_input("oldest evidence", None, None, "2026-07-05T00:01:00Z"),
        )
        .unwrap();
        save_evidence(
            &mut conn,
            evidence_input("newest evidence", None, None, "2026-07-05T00:03:00Z"),
        )
        .unwrap();
        save_evidence(
            &mut conn,
            evidence_input("middle evidence", None, None, "2026-07-05T00:02:00Z"),
        )
        .unwrap();

        let records = list_recent_evidence(&conn, 2).unwrap();

        assert_eq!(records.len(), 2);
        assert_eq!(records[0].claim, "newest evidence");
        assert_eq!(records[1].claim, "middle evidence");
        assert_eq!(records[0].sources.len(), 1);
        assert_eq!(records[0].sources[0].stance, "support");
        assert!(list_recent_evidence(&conn, 0).unwrap().is_empty());
    }

    #[test]
    fn search_evidence_matches_record_and_source_fields() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "webpage",
            "https://example.com/sleep",
            Some("Sleep Study"),
            r#"{"kind":"webpage"}"#,
        )
        .unwrap();

        let mut matching = evidence_input(
            "Sleep improves memory",
            None,
            Some(&source.id),
            "2026-07-05T00:02:00Z",
        );
        matching.answer = "Hippocampus consolidation is supported.".to_string();
        matching.reasoning = Some("Randomized trial synthesis".to_string());
        matching.context = Some("Nightly rest evidence review".to_string());
        matching.sources[0].title = Some("Neuroscience Digest".to_string());
        matching.sources[0].snippet = Some("hippocampus recall data".to_string());
        let saved = save_evidence(&mut conn, matching).unwrap();

        save_evidence(
            &mut conn,
            evidence_input("unrelated claim", None, None, "2026-07-05T00:03:00Z"),
        )
        .unwrap();

        for term in [
            "Sleep improves",
            "consolidation",
            "trial synthesis",
            "Nightly rest",
            "Neuroscience",
            "hippocampus recall",
        ] {
            let results = search_evidence(&conn, term, 10).unwrap();
            assert!(
                results.iter().any(|record| record.id == saved.id && record.sources.len() == 1),
                "expected search term {term} to return saved evidence"
            );
        }
    }

    #[test]
    fn delete_point_detaches_evidence_without_deleting_it() {
        let mut conn = memory_db();
        insert_point(&conn, "root", "root point", None, "2026-07-05T00:00:00Z");
        insert_point(&conn, "child", "child point", Some("root"), "2026-07-05T00:01:00Z");

        let saved = save_evidence(
            &mut conn,
            evidence_input("child evidence survives deletion", Some("child"), None, "2026-07-05T00:02:00Z"),
        )
        .unwrap();

        delete_point(&conn, "root").unwrap();

        let fetched = get_evidence(&conn, &saved.id).unwrap().unwrap();
        assert_eq!(fetched.point_id, None);
        assert_eq!(fetched.claim, "child evidence survives deletion");
        assert_eq!(fetched.sources.len(), 1);

        let point_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM points WHERE id IN ('root', 'child')", [], |row| row.get(0))
            .unwrap();
        assert_eq!(point_count, 0);
    }

    #[test]
    fn save_evidence_rejects_invalid_verdict_stance_and_empty_url() {
        let mut conn = memory_db();

        let mut invalid_verdict = evidence_input("invalid verdict evidence", None, None, "2026-07-05T00:00:00Z");
        invalid_verdict.verdict = "likely".to_string();
        assert!(save_evidence(&mut conn, invalid_verdict).is_err());

        let mut invalid_stance = evidence_input("invalid stance evidence", None, None, "2026-07-05T00:01:00Z");
        invalid_stance.sources[0].stance = "maybe".to_string();
        assert!(save_evidence(&mut conn, invalid_stance).is_err());

        let mut empty_url = evidence_input("empty url evidence", None, None, "2026-07-05T00:02:00Z");
        empty_url.sources[0].url = "   ".to_string();
        assert!(save_evidence(&mut conn, empty_url).is_err());
    }

    #[test]
    fn save_report_persists_and_reads_structured_citations() {
        let conn = memory_db();
        let mut input = report_input("  Strategy Digest  ", "digest", "digest-1");
        input.summary = "  A concise report summary.  ".to_string();

        let saved = save_report(&conn, input).unwrap();

        assert_eq!(saved.title, "Strategy Digest");
        assert_eq!(saved.kind, "digest");
        assert_eq!(saved.summary, "A concise report summary.");
        assert!(saved.citations_json.contains("\"label\":\"S1\""));

        let fetched = get_report(&conn, &saved.id).unwrap().unwrap();
        assert_eq!(fetched.id, saved.id);
        assert_eq!(fetched.source_name.as_deref(), Some("digest source"));
        assert_eq!(fetched.body_md, "#   Strategy Digest  \n\nReport body with digest-1");
    }

    #[test]
    fn list_recent_reports_returns_newest_with_limit() {
        let conn = memory_db();

        let first = save_report(&conn, report_input("First Report", "digest", "first")).unwrap();
        let second = save_report(&conn, report_input("Second Report", "synthesis", "second")).unwrap();
        let third = save_report(&conn, report_input("Third Report", "digest", "third")).unwrap();

        conn.execute(
            "UPDATE reports SET created_at = ?1 WHERE id = ?2",
            params!["2026-07-05T00:01:00Z", first.id],
        )
        .unwrap();
        conn.execute(
            "UPDATE reports SET created_at = ?1 WHERE id = ?2",
            params!["2026-07-05T00:03:00Z", second.id],
        )
        .unwrap();
        conn.execute(
            "UPDATE reports SET created_at = ?1 WHERE id = ?2",
            params!["2026-07-05T00:02:00Z", third.id],
        )
        .unwrap();

        let reports = list_recent_reports(&conn, 2).unwrap();

        assert_eq!(reports.len(), 2);
        assert_eq!(reports[0].title, "Second Report");
        assert_eq!(reports[1].title, "Third Report");
        assert!(list_recent_reports(&conn, 0).unwrap().is_empty());
    }

    #[test]
    fn search_reports_matches_body_summary_and_citations() {
        let conn = memory_db();
        let saved = save_report(&conn, report_input("Market Report", "synthesis", "alpha")).unwrap();
        save_report(&conn, report_input("Unrelated Report", "digest", "beta")).unwrap();

        for term in ["Market", "synthesis source", "Report body", "Source alpha", "https://example.com/alpha"] {
            let reports = search_reports(&conn, term, 10).unwrap();
            assert!(
                reports.iter().any(|report| report.id == saved.id),
                "expected search term {term} to return saved report"
            );
        }
    }

    #[test]
    fn save_report_rejects_invalid_kind_blank_body_and_invalid_citations() {
        let conn = memory_db();

        let invalid_kind = report_input("Invalid Kind", "memo", "invalid-kind");
        assert!(save_report(&conn, invalid_kind).is_err());

        let mut blank_body = report_input("Blank Body", "digest", "blank-body");
        blank_body.body_md = "   ".to_string();
        assert!(save_report(&conn, blank_body).is_err());

        let mut invalid_json = report_input("Invalid JSON", "digest", "invalid-json");
        invalid_json.citations_json = "{not-json".to_string();
        assert!(save_report(&conn, invalid_json).is_err());

        let mut non_array_json = report_input("Non Array JSON", "digest", "non-array");
        non_array_json.citations_json = r#"{"kind":"source"}"#.to_string();
        assert!(save_report(&conn, non_array_json).is_err());
    }

    #[test]
    fn extract_keywords_includes_cjk_trigrams_for_fts() {
        let keywords = extract_keywords("养老金改革影响年轻人，养老金制度需要调整。");

        assert!(keywords.iter().any(|keyword| keyword == "养老金"));
        assert!(keywords.iter().any(|keyword| keyword == "养老"));
    }

    #[test]
    fn find_similar_points_falls_back_to_keyword_overlap() {
        let conn = memory_db();
        insert_point(
            &conn,
            "current",
            "养老金不够了，需要提高缴费比例。",
            None,
            "2026-06-08T00:00:00Z",
        );
        insert_point(
            &conn,
            "related",
            "公开报道提到养老资金压力，各省会调整具体比例。",
            None,
            "2026-06-08T00:01:00Z",
        );
        insert_point(
            &conn,
            "child",
            "养老资金压力这个子节点不应返回。",
            Some("current"),
            "2026-06-08T00:02:00Z",
        );
        insert_point(
            &conn,
            "unrelated",
            "城市文旅消费正在恢复。",
            None,
            "2026-06-08T00:03:00Z",
        );

        let keywords = vec!["养老".to_string(), "比例".to_string()];
        let matches = find_similar_points(&conn, "current", &keywords, 8).unwrap();
        let ids = matches
            .into_iter()
            .map(|point| point.id)
            .collect::<Vec<_>>();

        assert_eq!(ids, vec!["related"]);
    }
}
