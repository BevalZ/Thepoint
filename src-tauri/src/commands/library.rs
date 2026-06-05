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
                "INSERT INTO points (id, content, tag_type, parent_id, source_doc_name, created_at)
                 VALUES (?1, ?2, ?3, NULL, ?4, ?5)",
                rusqlite::params![id, point.content, point.tag_type, source_doc_name, now],
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

/// Delete a point and all its descendants.
#[tauri::command]
pub async fn delete_point(app: tauri::AppHandle<Wry>, point_id: String) -> Result<(), String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let conn = db::open_db(&path)?;
        db::delete_point(&conn, &point_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Search points by keyword using FTS5.
#[tauri::command]
pub async fn search_points(app: tauri::AppHandle<Wry>, query: String) -> Result<Vec<StoredPoint>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<StoredPoint>> {
        let conn = db::open_db(&path)?;
        db::search_points(&conn, &query, 50)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Archive a point (hide from main library view).
#[tauri::command]
pub async fn archive_point(app: tauri::AppHandle<Wry>, point_id: String) -> Result<(), String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let conn = db::open_db(&path)?;
        db::set_archived(&conn, &point_id, true)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Restore an archived point back to the main library.
#[tauri::command]
pub async fn unarchive_point(app: tauri::AppHandle<Wry>, point_id: String) -> Result<(), String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let conn = db::open_db(&path)?;
        db::set_archived(&conn, &point_id, false)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Load all archived points, newest first.
#[tauri::command]
pub async fn list_archived_points(app: tauri::AppHandle<Wry>) -> Result<Vec<StoredPoint>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<StoredPoint>> {
        let conn = db::open_db(&path)?;
        db::list_archived_points(&conn)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Load all stored points (non-archived), newest first.
#[tauri::command]
pub async fn list_points(app: tauri::AppHandle<Wry>) -> Result<Vec<StoredPoint>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;

    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<StoredPoint>> {
        let conn = db::open_db(&path)?;
        db::list_points(&conn)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}
