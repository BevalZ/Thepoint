use rusqlite::Connection;
use tauri::Wry;

use crate::ai::ExtractedPoint;
use crate::db::{self, StoredPoint};

/// Persist a batch of extracted points into the local library. Returns rows written.
#[tauri::command]
pub async fn save_points(
    app: tauri::AppHandle<Wry>,
    points: Vec<ExtractedPoint>,
    source_doc_name: Option<String>,
) -> Result<usize, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;

    tokio::task::spawn_blocking(move || -> anyhow::Result<usize> {
        let mut conn = Connection::open(&path)?;
        db::init_db(&conn)?;

        let tx = conn.transaction()?;
        let now = chrono::Utc::now().to_rfc3339();
        let mut written = 0usize;
        for point in &points {
            let id = uuid::Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO points (id, content, tag_type, source_doc_name, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![
                    id,
                    point.content,
                    point.tag_type,
                    source_doc_name,
                    now,
                ],
            )?;
            written += 1;
        }
        tx.commit()?;
        Ok(written)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Load all stored points, newest first.
#[tauri::command]
pub async fn list_points(app: tauri::AppHandle<Wry>) -> Result<Vec<StoredPoint>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;

    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<StoredPoint>> {
        let conn = Connection::open(&path)?;
        db::init_db(&conn)?;

        let mut stmt = conn.prepare(
            "SELECT id, content, tag_type, source_doc_name, created_at
             FROM points
             ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(StoredPoint {
                id: row.get(0)?,
                content: row.get(1)?,
                tag_type: row.get(2)?,
                source_doc_name: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;

        let mut points = Vec::new();
        for row in rows {
            points.push(row?);
        }
        Ok(points)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}
