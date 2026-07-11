use std::path::Path;

use anyhow::{bail, Context, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

use super::types::{SemanticIndexStatus, LOCAL_MODEL_KEY};

#[derive(Debug, Clone)]
pub struct PendingChunk {
    pub id: String,
    pub source_id: String,
    pub text: String,
    pub text_hash: String,
}

#[derive(Debug, Clone)]
pub struct StoredVector {
    pub chunk_id: String,
    pub source_id: String,
    pub chunk_index: i64,
    pub heading_path: Option<String>,
    pub source_title: String,
    pub text: String,
    pub vector: Vec<f32>,
}

pub fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS semantic_index_meta (
            model_key TEXT PRIMARY KEY,
            provider_kind TEXT NOT NULL,
            dimension INTEGER NOT NULL,
            status TEXT NOT NULL,
            last_error TEXT,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS chunk_embeddings (
            chunk_id TEXT NOT NULL,
            model_key TEXT NOT NULL,
            source_id TEXT NOT NULL,
            text_hash TEXT NOT NULL,
            dimension INTEGER NOT NULL,
            vector BLOB,
            status TEXT NOT NULL CHECK(status IN ('ready','failed')),
            error TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(chunk_id, model_key),
            FOREIGN KEY(chunk_id) REFERENCES source_chunks(id) ON DELETE CASCADE,
            FOREIGN KEY(source_id) REFERENCES source_documents(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_model_status
            ON chunk_embeddings(model_key, status);
        CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_source
            ON chunk_embeddings(source_id, model_key);",
    )
    .context("failed to create semantic index tables")?;
    Ok(())
}

pub fn text_hash(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn encode_vector(vector: &[f32]) -> Vec<u8> {
    vector
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect()
}

pub fn decode_vector(bytes: &[u8], dimension: usize) -> Result<Vec<f32>> {
    if bytes.len() != dimension * 4 {
        bail!(
            "embedding byte length {} does not match dimension {}",
            bytes.len(),
            dimension
        );
    }
    Ok(bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect())
}

pub fn normalize_vector(vector: &mut [f32]) -> Result<()> {
    let norm = vector
        .iter()
        .map(|value| (*value as f64) * (*value as f64))
        .sum::<f64>()
        .sqrt();
    if !norm.is_finite() || norm <= f64::EPSILON {
        bail!("embedding has zero or invalid norm");
    }
    for value in vector {
        *value = (*value as f64 / norm) as f32;
    }
    Ok(())
}

pub fn pending_chunks(
    conn: &Connection,
    model_key: &str,
    source_id: Option<&str>,
) -> Result<Vec<PendingChunk>> {
    let mut stmt = conn.prepare(
        "SELECT c.id, c.source_id, c.chunk_index, c.heading_path, c.text,
                e.text_hash
         FROM source_chunks c
         LEFT JOIN chunk_embeddings e ON e.chunk_id = c.id AND e.model_key = ?1
         WHERE (?2 IS NULL OR c.source_id = ?2)
         ORDER BY c.source_id, c.chunk_index",
    )?;
    let rows = stmt.query_map(params![model_key, source_id], |row| {
        let text: String = row.get(4)?;
        let hash = text_hash(&text);
        Ok(PendingChunk {
            id: row.get(0)?,
            source_id: row.get(1)?,
            text,
            text_hash: hash,
        })
    })?;
    let mut pending = Vec::new();
    for row in rows {
        let chunk = row?;
        let ready = conn
            .query_row(
                "SELECT status = 'ready' AND text_hash = ?3 FROM chunk_embeddings
                 WHERE chunk_id = ?1 AND model_key = ?2",
                params![chunk.id, model_key, chunk.text_hash],
                |row| row.get::<_, bool>(0),
            )
            .optional()?;
        if ready != Some(true) {
            pending.push(chunk);
        }
    }
    Ok(pending)
}

pub fn save_embedding(
    conn: &Connection,
    chunk: &PendingChunk,
    model_key: &str,
    vector: &[f32],
) -> Result<()> {
    conn.execute(
        "INSERT INTO chunk_embeddings
         (chunk_id, model_key, source_id, text_hash, dimension, vector, status, error, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'ready', NULL, ?7)
         ON CONFLICT(chunk_id, model_key) DO UPDATE SET
           source_id=excluded.source_id, text_hash=excluded.text_hash,
           dimension=excluded.dimension, vector=excluded.vector,
           status='ready', error=NULL, updated_at=excluded.updated_at",
        params![
            chunk.id,
            model_key,
            chunk.source_id,
            chunk.text_hash,
            vector.len() as i64,
            encode_vector(vector),
            Utc::now().to_rfc3339()
        ],
    )?;
    Ok(())
}

pub fn save_embedding_failure(
    conn: &Connection,
    chunk: &PendingChunk,
    model_key: &str,
    error: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO chunk_embeddings
         (chunk_id, model_key, source_id, text_hash, dimension, vector, status, error, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, NULL, 'failed', ?5, ?6)
         ON CONFLICT(chunk_id, model_key) DO UPDATE SET
           source_id=excluded.source_id, text_hash=excluded.text_hash,
           dimension=0, vector=NULL, status='failed', error=excluded.error,
           updated_at=excluded.updated_at",
        params![
            chunk.id,
            model_key,
            chunk.source_id,
            chunk.text_hash,
            error,
            Utc::now().to_rfc3339()
        ],
    )?;
    Ok(())
}

pub fn save_meta(
    conn: &Connection,
    model_key: &str,
    provider_kind: &str,
    dimension: usize,
    status: &str,
    error: Option<&str>,
) -> Result<()> {
    conn.execute(
        "INSERT INTO semantic_index_meta
         (model_key, provider_kind, dimension, status, last_error, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(model_key) DO UPDATE SET provider_kind=excluded.provider_kind,
           dimension=excluded.dimension, status=excluded.status,
           last_error=excluded.last_error, updated_at=excluded.updated_at",
        params![
            model_key,
            provider_kind,
            dimension as i64,
            status,
            error,
            Utc::now().to_rfc3339()
        ],
    )?;
    Ok(())
}

pub fn index_status(conn: &Connection, model_key: &str) -> Result<SemanticIndexStatus> {
    let total: i64 = conn.query_row("SELECT COUNT(*) FROM source_chunks", [], |row| row.get(0))?;
    let mut ready = 0;
    let mut stale = 0;
    let mut failed = 0;
    let mut stmt = conn.prepare(
        "SELECT c.text, e.text_hash, e.status
         FROM source_chunks c
         LEFT JOIN chunk_embeddings e ON e.chunk_id=c.id AND e.model_key=?1",
    )?;
    let rows = stmt.query_map(params![model_key], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;
    for row in rows {
        let (text, hash, status) = row?;
        if hash
            .as_deref()
            .is_some_and(|value| value != text_hash(&text))
        {
            stale += 1;
        } else if status.as_deref() == Some("ready") {
            ready += 1;
        } else if status.as_deref() == Some("failed") {
            failed += 1;
        }
    }
    let meta = conn
        .query_row(
            "SELECT status, last_error, updated_at FROM semantic_index_meta WHERE model_key=?1",
            params![model_key],
            |row| Ok((row.get::<_, String>(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?;
    let (phase, last_error, updated_at) = meta.unwrap_or_else(|| ("idle".into(), None, None));
    Ok(SemanticIndexStatus {
        model_key: model_key.to_string(),
        phase,
        total,
        ready,
        pending: total - ready - failed,
        stale,
        failed,
        processed: ready + failed,
        cancellable: false,
        model_cached: model_key != LOCAL_MODEL_KEY,
        last_error,
        updated_at,
    })
}

pub fn load_vectors(
    conn: &Connection,
    model_key: &str,
    source_id: Option<&str>,
) -> Result<Vec<StoredVector>> {
    // SQLite cannot hash text; load candidates and discard stale rows below.
    let mut fallback = conn.prepare(
        "SELECT c.id, c.source_id, c.chunk_index, c.heading_path,
                COALESCE(s.title, s.canonical_uri), c.text, e.text_hash, e.dimension, e.vector
         FROM chunk_embeddings e
         JOIN source_chunks c ON c.id=e.chunk_id
         JOIN source_documents s ON s.id=c.source_id
         WHERE e.model_key=?1 AND e.status='ready'
           AND (?2 IS NULL OR c.source_id=?2)",
    )?;
    let rows = fallback.query_map(params![model_key, source_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, i64>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, i64>(7)?,
            row.get::<_, Vec<u8>>(8)?,
        ))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (
            chunk_id,
            source_id,
            chunk_index,
            heading_path,
            source_title,
            text,
            hash,
            dimension,
            bytes,
        ) = row?;
        if hash != text_hash(&text) {
            continue;
        }
        out.push(StoredVector {
            chunk_id,
            source_id,
            chunk_index,
            heading_path,
            source_title,
            text,
            vector: decode_vector(&bytes, dimension as usize)?,
        });
    }
    Ok(out)
}

pub fn validate_database(path: &Path) -> Result<String> {
    let conn = Connection::open(path).context("failed to open database for validation")?;
    let result: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if result != "ok" {
        bail!("database integrity check failed: {result}");
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vector_bytes_round_trip_and_validate_dimension() {
        let values = vec![0.25, -1.5, 3.0];
        let bytes = encode_vector(&values);
        assert_eq!(decode_vector(&bytes, 3).unwrap(), values);
        assert!(decode_vector(&bytes, 4).is_err());
    }

    #[test]
    fn text_hash_changes_with_chunk_content() {
        assert_ne!(text_hash("alpha"), text_hash("beta"));
        assert_eq!(text_hash("alpha"), text_hash("alpha"));
    }

    #[test]
    fn normalization_produces_unit_vector() {
        let mut vector = vec![3.0, 4.0];
        normalize_vector(&mut vector).unwrap();
        assert!((vector.iter().map(|v| v * v).sum::<f32>() - 1.0).abs() < 1e-6);
    }

    #[test]
    fn schema_and_hash_invalidation_mark_changed_chunks_pending() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE source_documents (id TEXT PRIMARY KEY, title TEXT, canonical_uri TEXT NOT NULL); CREATE TABLE source_chunks (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, heading_path TEXT, text TEXT NOT NULL);").unwrap();
        init_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO source_documents VALUES ('s1', 'Source', 'file://source')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO source_chunks VALUES ('c1', 's1', 0, NULL, 'alpha')",
            [],
        )
        .unwrap();
        let chunk = pending_chunks(&conn, LOCAL_MODEL_KEY, None)
            .unwrap()
            .remove(0);
        save_embedding(&conn, &chunk, LOCAL_MODEL_KEY, &[1.0, 0.0]).unwrap();
        assert!(pending_chunks(&conn, LOCAL_MODEL_KEY, None)
            .unwrap()
            .is_empty());
        conn.execute("UPDATE source_chunks SET text='beta' WHERE id='c1'", [])
            .unwrap();
        assert_eq!(
            pending_chunks(&conn, LOCAL_MODEL_KEY, None).unwrap().len(),
            1
        );
    }
}
