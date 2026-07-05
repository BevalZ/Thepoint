use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Context;
use tauri::Wry;

use crate::ai::ExtractedPoint;
use crate::commands::extract::FactCheckResult;
use crate::db::{self, StoredPoint};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PointSourceLinkInput {
    pub source_id: String,
    pub chunk_index: i64,
    pub anchor_text: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveEvidenceCommandInput {
    pub result: FactCheckResult,
    pub point_id: Option<String>,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveReportCommandInput {
    pub title: String,
    pub kind: String,
    pub source_name: Option<String>,
    pub body_md: String,
    pub summary: String,
    pub citations_json: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorExportResult {
    pub root_path: String,
    pub files_written: usize,
    pub sources: usize,
    pub evidence: usize,
    pub reports: usize,
    pub investigations: usize,
    pub journal: usize,
    pub gallery: usize,
}

/// Persist a batch of extracted points into the local library. Returns generated IDs.
#[tauri::command]
pub async fn save_points(
    app: tauri::AppHandle<Wry>,
    points: Vec<ExtractedPoint>,
    source_doc_name: Option<String>,
    source_excerpt: Option<String>,
    source_link: Option<PointSourceLinkInput>,
) -> Result<Vec<String>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;

    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<String>> {
        let mut conn = Connection::open(&path)?;
        db::init_db(&conn)?;

        let tx = conn.transaction()?;
        let now = chrono::Utc::now().to_rfc3339();
        let mut ids = Vec::with_capacity(points.len());
        for point in &points {
            let id = uuid::Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO points (id, content, tag_type, parent_id, source_doc_name, source_excerpt, created_at)
                 VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6)",
                rusqlite::params![id, point.content, point.tag_type, source_doc_name, source_excerpt, now],
            )?;
            if let Some(link) = source_link.as_ref() {
                db::insert_point_source_link(
                    &tx,
                    &id,
                    &link.source_id,
                    link.chunk_index,
                    link.anchor_text.as_deref(),
                )?;
            }
            ids.push(id);
        }
        tx.commit()?;
        Ok(ids)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_manual_point(
    app: tauri::AppHandle<Wry>,
    parent_id: String,
    content: String,
) -> Result<Vec<StoredPoint>, String> {
    let trimmed = content.trim().to_string();
    if trimmed.is_empty() {
        return Err("想法内容不能为空".to_string());
    }

    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<StoredPoint>> {
        let mut conn = db::open_db(&path)?;
        db::save_child_points(
            &mut conn,
            Some(parent_id.as_str()),
            "manual_thought",
            None,
            &[(trimmed, "我的想法".to_string())],
        )
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_fact_check_point(
    app: tauri::AppHandle<Wry>,
    parent_id: String,
    content: String,
) -> Result<Vec<StoredPoint>, String> {
    let trimmed = content.trim().to_string();
    if trimmed.is_empty() {
        return Err("事实审查内容不能为空".to_string());
    }

    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<StoredPoint>> {
        let mut conn = db::open_db(&path)?;
        db::save_child_points(
            &mut conn,
            Some(parent_id.as_str()),
            "fact_check",
            None,
            &[(trimmed, "事实审查".to_string())],
        )
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_evidence(
    app: tauri::AppHandle<Wry>,
    input: SaveEvidenceCommandInput,
) -> Result<db::EvidenceRecord, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<db::EvidenceRecord> {
        let mut conn = db::open_db(&path)?;
        db::save_evidence(&mut conn, fact_check_result_to_evidence(input))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_evidence_for_point(
    app: tauri::AppHandle<Wry>,
    point_id: String,
) -> Result<Vec<db::EvidenceRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<db::EvidenceRecord>> {
        let conn = db::open_db(&path)?;
        db::list_evidence_for_point(&conn, &point_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_evidence_for_source(
    app: tauri::AppHandle<Wry>,
    source_id: String,
) -> Result<Vec<db::EvidenceRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<db::EvidenceRecord>> {
        let conn = db::open_db(&path)?;
        db::list_evidence_for_source(&conn, &source_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_source_assets(
    app: tauri::AppHandle<Wry>,
    source_id: String,
) -> Result<Option<db::SourceAssetsRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Option<db::SourceAssetsRecord>> {
        let conn = db::open_db(&path)?;
        db::get_source_assets(&conn, &source_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_recent_evidence(
    app: tauri::AppHandle<Wry>,
) -> Result<Vec<db::EvidenceRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<db::EvidenceRecord>> {
        let conn = db::open_db(&path)?;
        db::list_recent_evidence(&conn, 120)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_evidence(
    app: tauri::AppHandle<Wry>,
    evidence_id: String,
) -> Result<Option<db::EvidenceRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Option<db::EvidenceRecord>> {
        let conn = db::open_db(&path)?;
        db::get_evidence(&conn, &evidence_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_evidence(
    app: tauri::AppHandle<Wry>,
    query: String,
) -> Result<Vec<db::EvidenceRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<db::EvidenceRecord>> {
        let conn = db::open_db(&path)?;
        db::search_evidence(&conn, &query, 40)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_report(
    app: tauri::AppHandle<Wry>,
    input: SaveReportCommandInput,
) -> Result<db::ReportRecord, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<db::ReportRecord> {
        let conn = db::open_db(&path)?;
        let report = db::save_report(&conn, report_command_input_to_db(input))?;
        if report.kind == "investigation" {
            let (source_ids, point_ids, evidence_ids) = citation_asset_ids_for_journal(&report.citations_json);
            let query = report.source_name.clone().unwrap_or_else(|| report.title.clone());
            db::save_journal_entry(&conn, db::SaveJournalEntryInput {
                query,
                note: report.summary.clone(),
                tags: vec!["investigation".to_string()],
                source_ids,
                point_ids,
                evidence_ids,
                report_ids: vec![report.id.clone()],
                created_report_id: Some(report.id.clone()),
                source_kind: "investigation".to_string(),
            })?;
        }
        Ok(report)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_recent_reports(
    app: tauri::AppHandle<Wry>,
) -> Result<Vec<db::ReportRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<db::ReportRecord>> {
        let conn = db::open_db(&path)?;
        db::list_recent_reports(&conn, 120)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_report(
    app: tauri::AppHandle<Wry>,
    report_id: String,
) -> Result<Option<db::ReportRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Option<db::ReportRecord>> {
        let conn = db::open_db(&path)?;
        db::get_report(&conn, &report_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_reports(
    app: tauri::AppHandle<Wry>,
    query: String,
) -> Result<Vec<db::ReportRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<db::ReportRecord>> {
        let conn = db::open_db(&path)?;
        db::search_reports(&conn, &query, 40)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_report(app: tauri::AppHandle<Wry>, report_id: String) -> Result<(), String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let conn = db::open_db(&path)?;
        db::delete_report(&conn, &report_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_journal_entry(
    app: tauri::AppHandle<Wry>,
    input: db::SaveJournalEntryInput,
) -> Result<db::JournalEntry, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<db::JournalEntry> {
        let conn = db::open_db(&path)?;
        db::save_journal_entry(&conn, input)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_recent_journal_entries(
    app: tauri::AppHandle<Wry>,
) -> Result<Vec<db::JournalEntry>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<db::JournalEntry>> {
        let conn = db::open_db(&path)?;
        db::list_recent_journal_entries(&conn, 120)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_journal_entries(
    app: tauri::AppHandle<Wry>,
    query: String,
) -> Result<Vec<db::JournalEntry>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<db::JournalEntry>> {
        let conn = db::open_db(&path)?;
        db::search_journal_entries(&conn, &query, 40)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn invalidate_journal_entry(
    app: tauri::AppHandle<Wry>,
    id: String,
    reason: String,
) -> Result<(), String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let conn = db::open_db(&path)?;
        db::invalidate_journal_entry(&conn, &id, &reason)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn discover_related_assets(
    app: tauri::AppHandle<Wry>,
    kind: String,
    id: String,
) -> Result<Vec<db::AssetRelationRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<db::AssetRelationRecord>> {
        let conn = db::open_db(&path)?;
        db::discover_related_assets(&conn, &kind, &id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rebuild_asset_relations(app: tauri::AppHandle<Wry>) -> Result<usize, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<usize> {
        let conn = db::open_db(&path)?;
        db::rebuild_asset_relations(&conn)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_review_item(
    app: tauri::AppHandle<Wry>,
    input: db::AddReviewItemInput,
) -> Result<db::ReviewItem, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<db::ReviewItem> {
        let conn = db::open_db(&path)?;
        db::add_review_item(&conn, input)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_due_review_items(app: tauri::AppHandle<Wry>) -> Result<Vec<db::ReviewItem>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<db::ReviewItem>> {
        let conn = db::open_db(&path)?;
        db::list_due_review_items(&conn)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_all_review_items(app: tauri::AppHandle<Wry>) -> Result<Vec<db::ReviewItem>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<db::ReviewItem>> {
        let conn = db::open_db(&path)?;
        db::list_all_review_items(&conn)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn complete_review_item(
    app: tauri::AppHandle<Wry>,
    id: String,
    rating: String,
) -> Result<db::ReviewItem, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<db::ReviewItem> {
        let conn = db::open_db(&path)?;
        db::complete_review_item(&conn, &id, &rating)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn snooze_review_item(
    app: tauri::AppHandle<Wry>,
    id: String,
    days: i64,
) -> Result<db::ReviewItem, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<db::ReviewItem> {
        let conn = db::open_db(&path)?;
        db::snooze_review_item(&conn, &id, days)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn dismiss_review_item(app: tauri::AppHandle<Wry>, id: String) -> Result<(), String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let conn = db::open_db(&path)?;
        db::dismiss_review_item(&conn, &id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_open_data_mirror_config(
    app: tauri::AppHandle<Wry>,
) -> Result<db::OpenDataMirrorConfig, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<db::OpenDataMirrorConfig> {
        let conn = db::open_db(&path)?;
        db::get_open_data_mirror_config(&conn)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_open_data_mirror_config(
    app: tauri::AppHandle<Wry>,
    config: db::OpenDataMirrorConfig,
) -> Result<(), String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let conn = db::open_db(&path)?;
        db::set_open_data_mirror_config(&conn, config)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_open_data_mirror(app: tauri::AppHandle<Wry>) -> Result<MirrorExportResult, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || export_open_data_mirror_blocking(path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_indexed_folder(
    app: tauri::AppHandle<Wry>,
    path: String,
) -> Result<db::IndexedFolder, String> {
    let db_path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<db::IndexedFolder> {
        let conn = db::open_db(&db_path)?;
        db::add_indexed_folder(&conn, &path)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_indexed_folders(app: tauri::AppHandle<Wry>) -> Result<Vec<db::IndexedFolder>, String> {
    let db_path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<db::IndexedFolder>> {
        let conn = db::open_db(&db_path)?;
        db::list_indexed_folders(&conn)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn scan_indexed_folder(
    app: tauri::AppHandle<Wry>,
    folder_id: String,
) -> Result<db::IndexedFolderScanResult, String> {
    let db_path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || scan_indexed_folder_blocking(db_path, folder_id))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_indexed_folder(app: tauri::AppHandle<Wry>, folder_id: String) -> Result<(), String> {
    let db_path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let conn = db::open_db(&db_path)?;
        db::remove_indexed_folder(&conn, &folder_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

fn report_command_input_to_db(input: SaveReportCommandInput) -> db::SaveReportInput {
    db::SaveReportInput {
        title: input.title,
        kind: input.kind,
        source_name: input.source_name,
        body_md: input.body_md,
        summary: input.summary,
        citations_json: input.citations_json,
    }
}

fn citation_asset_ids_for_journal(citations_json: &str) -> (Vec<String>, Vec<String>, Vec<String>) {
    let Ok(serde_json::Value::Array(citations)) = serde_json::from_str::<serde_json::Value>(citations_json) else {
        return (Vec::new(), Vec::new(), Vec::new());
    };
    let mut source_ids = Vec::new();
    let mut point_ids = Vec::new();
    let mut evidence_ids = Vec::new();
    for citation in citations {
        let Some(object) = citation.as_object() else {
            continue;
        };
        let Some(kind) = object.get("kind").and_then(serde_json::Value::as_str) else {
            continue;
        };
        let Some(id) = object.get("id").and_then(serde_json::Value::as_str) else {
            continue;
        };
        match kind {
            "source" => push_unique(&mut source_ids, id),
            "point" => push_unique(&mut point_ids, id),
            "evidence" => push_unique(&mut evidence_ids, id),
            _ => {}
        }
        if let Some(source_id) = object
            .get("sourceId")
            .or_else(|| object.get("source_id"))
            .and_then(serde_json::Value::as_str)
        {
            push_unique(&mut source_ids, source_id);
        }
    }
    (source_ids, point_ids, evidence_ids)
}

fn push_unique(values: &mut Vec<String>, value: &str) {
    let trimmed = value.trim();
    if !trimmed.is_empty() && !values.iter().any(|existing| existing == trimmed) {
        values.push(trimmed.to_string());
    }
}

fn fact_check_result_to_evidence(input: SaveEvidenceCommandInput) -> db::SaveEvidenceInput {
    let verdict = infer_fact_check_verdict(&input.result.answer).to_string();
    let sources = input
        .result
        .sources
        .into_iter()
        .map(|source| db::SaveEvidenceSourceInput {
            title: Some(source.title).filter(|value| !value.trim().is_empty()),
            url: source.url,
            snippet: Some(source.snippet).filter(|value| !value.trim().is_empty()),
            stance: "unknown".to_string(),
        })
        .collect();

    db::SaveEvidenceInput {
        claim: input.result.claim,
        verdict,
        answer: input.result.answer,
        reasoning: if input.result.extra.is_empty() {
            None
        } else {
            Some(input.result.extra.join("\n"))
        },
        context: Some(input.result.context).filter(|value| !value.trim().is_empty()),
        point_id: input.point_id,
        source_id: input.source_id,
        chunk_index: input.chunk_index,
        checked_at: None,
        sources,
    }
}

fn infer_fact_check_verdict(answer: &str) -> &'static str {
    let normalized = answer.to_lowercase();
    let has_any = |tokens: &[&str]| tokens.iter().any(|token| normalized.contains(token));

    if has_any(&["mixed", "partly", "partially", "部分", "一部分", "有真有假", "喜忧参半"]) {
        return "mixed";
    }
    if has_any(&[
        "contradicted",
        "refuted",
        "false",
        "incorrect",
        "not true",
        "不实",
        "虚假",
        "错误",
        "不正确",
        "与事实不符",
        "相矛盾",
    ]) {
        return "contradicted";
    }
    if has_any(&[
        "supported",
        "confirmed",
        "true",
        "accurate",
        "correct",
        "可靠",
        "属实",
        "正确",
        "证实",
        "支持",
        "吻合",
    ]) && !has_any(&["无法证实", "不能证实", "未证实", "not confirmed", "unconfirmed"]) {
        return "supported";
    }

    "uncertain"
}

fn export_open_data_mirror_blocking(db_path: PathBuf) -> anyhow::Result<MirrorExportResult> {
    let conn = db::open_db(&db_path)?;
    let config = db::get_open_data_mirror_config(&conn)?;
    if !config.enabled {
        anyhow::bail!("Open Data Mirror is disabled");
    }
    let root_path = config
        .root_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow::anyhow!("Open Data Mirror root path is required"))?;
    let root = PathBuf::from(root_path);
    fs::create_dir_all(&root).context("failed to create mirror root")?;

    let mut result = MirrorExportResult {
        root_path: root.to_string_lossy().to_string(),
        files_written: 0,
        sources: 0,
        evidence: 0,
        reports: 0,
        investigations: 0,
        journal: 0,
        gallery: 0,
    };

    let sources = db::list_recent_sources(&conn, usize::MAX)?;
    if config.export_sources {
        let dir = root.join("sources");
        fs::create_dir_all(&dir)?;
        for source in &sources {
            write_text_file(&dir.join(format!("{}.md", safe_file_stem(&source.id, source.title.as_deref()))), &source_markdown(source))?;
            result.files_written += 1;
        }
        result.sources = sources.len();
    }

    let evidence = db::list_recent_evidence(&conn, usize::MAX)?;
    if config.export_evidence {
        let dir = root.join("evidence");
        fs::create_dir_all(&dir)?;
        for item in &evidence {
            write_text_file(&dir.join(format!("{}.md", safe_file_stem(&item.id, Some(&item.claim)))), &evidence_markdown(item))?;
            result.files_written += 1;
        }
        result.evidence = evidence.len();
    }

    let reports = db::list_recent_reports(&conn, usize::MAX)?;
    if config.export_reports {
        let report_dir = root.join("reports");
        let investigation_dir = root.join("investigations");
        fs::create_dir_all(&report_dir)?;
        fs::create_dir_all(&investigation_dir)?;
        for report in &reports {
            let dir = if report.kind == "investigation" { &investigation_dir } else { &report_dir };
            write_text_file(&dir.join(format!("{}.md", safe_file_stem(&report.id, Some(&report.title)))), &report_markdown(report))?;
            result.files_written += 1;
            if report.kind == "investigation" {
                result.investigations += 1;
            } else {
                result.reports += 1;
            }
        }
    }

    let journal = db::list_recent_journal_entries(&conn, usize::MAX)?;
    if config.export_journal {
        let dir = root.join("journal");
        fs::create_dir_all(&dir)?;
        for entry in &journal {
            write_text_file(&dir.join(format!("{}.md", safe_file_stem(&entry.id, Some(&entry.query)))), &journal_markdown(entry))?;
            result.files_written += 1;
        }
        result.journal = journal.len();
    }

    let gallery = db::list_gallery(&conn)?;
    if config.export_gallery_index {
        let dir = root.join("gallery");
        fs::create_dir_all(&dir)?;
        write_text_file(&dir.join("index.md"), &gallery_index_markdown(&gallery))?;
        result.files_written += 1;
        result.gallery = gallery.len();
    }

    let manifest = serde_json::json!({
        "version": 1,
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "counts": {
            "sources": result.sources,
            "evidence": result.evidence,
            "reports": result.reports,
            "investigations": result.investigations,
            "journal": result.journal,
            "gallery": result.gallery
        }
    });
    write_text_file(&root.join("manifest.json"), &serde_json::to_string_pretty(&manifest)?)?;
    write_text_file(&root.join("index.md"), &mirror_index_markdown(&result))?;
    result.files_written += 2;
    Ok(result)
}

fn scan_indexed_folder_blocking(db_path: PathBuf, folder_id: String) -> anyhow::Result<db::IndexedFolderScanResult> {
    let mut conn = db::open_db(&db_path)?;
    let folder = db::get_indexed_folder(&conn, &folder_id)?
        .ok_or_else(|| anyhow::anyhow!("indexed folder not found: {folder_id}"))?;
    let root = PathBuf::from(&folder.path);
    if !root.is_dir() {
        anyhow::bail!("indexed folder path is not a directory: {}", folder.path);
    }

    let mut files = Vec::new();
    let mut indexed_count = 0;
    let mut metadata_only_count = 0;
    for path in collect_folder_files(&root)? {
        let metadata = fs::metadata(&path)?;
        if !metadata.is_file() {
            continue;
        }
        let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("file").to_string();
        let extension = path.extension().and_then(|value| value.to_str()).map(|value| value.to_lowercase());
        let modified_at = metadata.modified().ok().map(system_time_to_rfc3339);
        let canonical_uri = path.to_string_lossy().to_string();
        let mut source_id = None;

        if extension.as_deref().is_some_and(is_text_index_extension) {
            if let Ok(text) = read_indexable_text_file(&path, extension.as_deref()) {
                let source = db::upsert_source_document(
                    &conn,
                    "indexed_file",
                    &canonical_uri,
                    Some(&name),
                    &serde_json::to_string(&serde_json::json!({
                        "kind": "indexed_file",
                        "path": canonical_uri,
                        "sizeBytes": metadata.len(),
                        "modifiedAt": modified_at
                    }))?,
                )?;
                let chunks = chunk_indexed_text(&text);
                db::replace_source_chunks(&mut conn, &source.id, &chunks)?;
                source_id = Some(source.id);
                indexed_count += 1;
            } else {
                metadata_only_count += 1;
            }
        } else {
            metadata_only_count += 1;
        }

        files.push(db::upsert_indexed_file(
            &conn,
            &folder.id,
            &canonical_uri,
            &name,
            extension.as_deref(),
            Some(metadata.len().min(i64::MAX as u64) as i64),
            modified_at.as_deref(),
            source_id.as_deref(),
        )?);
    }

    let scanned_at = chrono::Utc::now().to_rfc3339();
    db::mark_indexed_folder_scanned(&conn, &folder.id, &scanned_at)?;
    let folder = db::get_indexed_folder(&conn, &folder.id)?.unwrap_or(folder);
    Ok(db::IndexedFolderScanResult {
        folder,
        files,
        indexed_count,
        metadata_only_count,
    })
}

fn collect_folder_files(root: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let mut stack = vec![root.to_path_buf()];
    let mut files = Vec::new();
    while let Some(path) = stack.pop() {
        for entry in fs::read_dir(&path)? {
            let entry = entry?;
            let entry_path = entry.path();
            if entry_path.is_dir() {
                stack.push(entry_path);
            } else {
                files.push(entry_path);
            }
        }
    }
    Ok(files)
}

fn is_text_index_extension(extension: &str) -> bool {
    matches!(
        extension,
        "txt" | "md" | "markdown" | "rst" | "csv" | "json" | "html" | "htm" | "rs" | "ts" | "tsx"
            | "js" | "jsx" | "py" | "go" | "java" | "cs" | "cpp" | "c" | "h" | "css" | "toml" | "yaml" | "yml"
    )
}

fn read_indexable_text_file(path: &Path, extension: Option<&str>) -> anyhow::Result<String> {
    match extension {
        Some("txt" | "md" | "markdown" | "rst" | "csv" | "html" | "htm") => crate::parsers::parse_document(path),
        Some(
            "json" | "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "java" | "cs" | "cpp" | "c" | "h"
            | "css" | "toml" | "yaml" | "yml",
        ) => fs::read_to_string(path).with_context(|| format!("failed to read indexed text file {}", path.display())),
        _ => anyhow::bail!("not an indexable text file"),
    }
}

fn chunk_indexed_text(text: &str) -> Vec<String> {
    const CHUNK_CHARS: usize = 3200;
    let mut chunks = Vec::new();
    let mut current = String::new();
    for line in text.lines() {
        if current.len() + line.len() + 1 > CHUNK_CHARS && !current.trim().is_empty() {
            chunks.push(current.trim().to_string());
            current.clear();
        }
        current.push_str(line);
        current.push('\n');
    }
    if !current.trim().is_empty() {
        chunks.push(current.trim().to_string());
    }
    if chunks.is_empty() {
        chunks.push(text.trim().to_string());
    }
    chunks
}

fn system_time_to_rfc3339(time: std::time::SystemTime) -> String {
    let datetime: chrono::DateTime<chrono::Utc> = time.into();
    datetime.to_rfc3339()
}

fn write_text_file(path: &Path, content: &str) -> anyhow::Result<()> {
    fs::write(path, content).with_context(|| format!("failed to write {}", path.display()))
}

fn safe_file_stem(id: &str, title: Option<&str>) -> String {
    let base = title
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(id);
    let cleaned = base
        .chars()
        .map(|ch| match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            ch if ch.is_control() => '-',
            ch => ch,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();
    let stem = if cleaned.is_empty() { id.to_string() } else { cleaned };
    format!("{}-{}", id.chars().take(8).collect::<String>(), stem)
}

fn source_markdown(source: &db::SourceSummaryRecord) -> String {
    format!(
        "# {}\n\n- ID: {}\n- Kind: {}\n- URI: {}\n- Created: {}\n- Updated: {}\n- Chunks: {}\n- Points: {}\n- Stars: {}\n",
        source.title.as_deref().unwrap_or(&source.canonical_uri),
        source.id,
        source.kind,
        source.canonical_uri,
        source.created_at,
        source.updated_at,
        source.chunk_count,
        source.point_count,
        source.star_count
    )
}

fn evidence_markdown(record: &db::EvidenceRecord) -> String {
    let mut out = format!(
        "# {}\n\n- ID: {}\n- Verdict: {}\n- Point ID: {}\n- Source ID: {}\n- Chunk: {}\n- Checked: {}\n\n## Answer\n\n{}\n",
        record.claim,
        record.id,
        record.verdict,
        record.point_id.as_deref().unwrap_or("none"),
        record.source_id.as_deref().unwrap_or("none"),
        record.chunk_index.map(|value| value.to_string()).unwrap_or_else(|| "none".to_string()),
        record.checked_at,
        record.answer
    );
    if let Some(reasoning) = record.reasoning.as_deref() {
        out.push_str(&format!("\n## Reasoning\n\n{reasoning}\n"));
    }
    if record.sources.is_empty() {
        out.push_str("\n## Sources\n\nNo external sources recorded.\n");
    } else {
        out.push_str("\n## Sources\n");
        for source in &record.sources {
            out.push_str(&format!("\n- [{}]({}) - {}\n", source.title.as_deref().unwrap_or("Source"), source.url, source.stance));
        }
    }
    out
}

fn report_markdown(report: &db::ReportRecord) -> String {
    format!(
        "# {}\n\n- ID: {}\n- Kind: {}\n- Source: {}\n- Created: {}\n\n{}\n\n## Citation JSON\n\n```json\n{}\n```\n",
        report.title,
        report.id,
        report.kind,
        report.source_name.as_deref().unwrap_or("none"),
        report.created_at,
        report.body_md,
        report.citations_json
    )
}

fn journal_markdown(entry: &db::JournalEntry) -> String {
    format!(
        "# {}\n\n- ID: {}\n- Source kind: {}\n- Created report: {}\n- Created: {}\n- Invalidated: {}\n\n{}\n\n## Asset IDs\n\n- Sources: {}\n- Points: {}\n- Evidence: {}\n- Reports: {}\n",
        entry.query,
        entry.id,
        entry.source_kind,
        entry.created_report_id.as_deref().unwrap_or("none"),
        entry.created_at,
        entry.invalidated_at.as_deref().unwrap_or("no"),
        entry.note,
        entry.source_ids_json,
        entry.point_ids_json,
        entry.evidence_ids_json,
        entry.report_ids_json
    )
}

fn gallery_index_markdown(items: &[db::GalleryItem]) -> String {
    let mut out = String::from("# Gallery Index\n");
    for item in items {
        out.push_str(&format!("\n- {} `{}`\n  - File: {}\n", item.generated_at, item.id, item.file_path));
    }
    out
}

fn mirror_index_markdown(result: &MirrorExportResult) -> String {
    format!(
        "# Thepoint Mirror\n\n- Sources: {}\n- Evidence: {}\n- Reports: {}\n- Investigations: {}\n- Journal: {}\n- Gallery: {}\n",
        result.sources,
        result.evidence,
        result.reports,
        result.investigations,
        result.journal,
        result.gallery
    )
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

#[tauri::command]
pub async fn get_point_source_context(
    app: tauri::AppHandle<Wry>,
    point_id: String,
) -> Result<Option<db::PointSourceContext>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Option<db::PointSourceContext>> {
        let conn = db::open_db(&path)?;
        db::get_point_source_context(&conn, &point_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_source_workspace(
    app: tauri::AppHandle<Wry>,
    source_id: String,
) -> Result<Option<db::SourceWorkspaceRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Option<db::SourceWorkspaceRecord>> {
        let conn = db::open_db(&path)?;
        db::get_source_workspace(&conn, &source_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_recent_sources(
    app: tauri::AppHandle<Wry>,
) -> Result<Vec<db::SourceSummaryRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<db::SourceSummaryRecord>> {
        let conn = db::open_db(&path)?;
        db::list_recent_sources(&conn, 24)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_source_workspace_summary(
    app: tauri::AppHandle<Wry>,
    source_id: String,
) -> Result<Option<db::SourceSummaryRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Option<db::SourceSummaryRecord>> {
        let conn = db::open_db(&path)?;
        db::get_source_workspace_summary(&conn, &source_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_workspace(
    app: tauri::AppHandle<Wry>,
    query: String,
) -> Result<Vec<db::WorkspaceSearchResult>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<db::WorkspaceSearchResult>> {
        let conn = db::open_db(&path)?;
        db::search_workspace(&conn, &query, 40)
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

/// Star a point; returns new global starred count.
#[tauri::command]
pub async fn star_point(app: tauri::AppHandle<Wry>, point_id: String) -> Result<u32, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<u32> {
        let conn = db::open_db(&path)?;
        db::set_starred(&conn, &point_id, true)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Unstar a point; returns new global starred count.
#[tauri::command]
pub async fn unstar_point(app: tauri::AppHandle<Wry>, point_id: String) -> Result<u32, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<u32> {
        let conn = db::open_db(&path)?;
        db::set_starred(&conn, &point_id, false)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Return total starred count (for initializing the ring on startup).
#[tauri::command]
pub async fn get_starred_count(app: tauri::AppHandle<Wry>) -> Result<u32, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<u32> {
        let conn = db::open_db(&path)?;
        db::starred_count(&conn)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Return current starred points for the global collection ring.
#[tauri::command]
pub async fn list_starred_points(app: tauri::AppHandle<Wry>) -> Result<Vec<StoredPoint>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<StoredPoint>> {
        let conn = db::open_db(&path)?;
        db::list_starred_points(&conn)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::extract::FactCheckSource;

    fn command_input(answer: &str) -> SaveEvidenceCommandInput {
        SaveEvidenceCommandInput {
            result: FactCheckResult {
                claim: "AI investment increased in 2026".to_string(),
                answer: answer.to_string(),
                context: "market report context".to_string(),
                extra: vec!["extra note".to_string()],
                sources: vec![FactCheckSource {
                    title: "Report".to_string(),
                    url: "https://example.com/report".to_string(),
                    snippet: "reported figure".to_string(),
                }],
            },
            point_id: Some("point-1".to_string()),
            source_id: Some("source-1".to_string()),
            chunk_index: Some(3),
        }
    }

    #[test]
    fn infer_fact_check_verdict_is_conservative() {
        assert_eq!(infer_fact_check_verdict("公开数据支持该说法，结论基本属实。"), "supported");
        assert_eq!(infer_fact_check_verdict("该说法与事实不符，关键数据是错误的。"), "contradicted");
        assert_eq!(infer_fact_check_verdict("该说法部分准确，但一部分缺少背景。"), "mixed");
        assert_eq!(infer_fact_check_verdict("目前无法证实该说法，需要更多来源。"), "uncertain");
    }

    #[test]
    fn fact_check_result_to_evidence_preserves_context_and_sources() {
        let input = command_input("The claim is supported by the report.");
        let evidence = fact_check_result_to_evidence(input);

        assert_eq!(evidence.claim, "AI investment increased in 2026");
        assert_eq!(evidence.verdict, "supported");
        assert_eq!(evidence.reasoning.as_deref(), Some("extra note"));
        assert_eq!(evidence.context.as_deref(), Some("market report context"));
        assert_eq!(evidence.point_id.as_deref(), Some("point-1"));
        assert_eq!(evidence.source_id.as_deref(), Some("source-1"));
        assert_eq!(evidence.chunk_index, Some(3));
        assert_eq!(evidence.sources.len(), 1);
        assert_eq!(evidence.sources[0].stance, "unknown");
        assert_eq!(evidence.sources[0].url, "https://example.com/report");
    }

    #[test]
    fn report_command_input_to_db_preserves_fields() {
        let input = SaveReportCommandInput {
            title: "Digest Title".to_string(),
            kind: "digest".to_string(),
            source_name: Some("知识研报".to_string()),
            body_md: "# Digest Title".to_string(),
            summary: "Digest summary".to_string(),
            citations_json: "[]".to_string(),
        };

        let report = report_command_input_to_db(input);

        assert_eq!(report.title, "Digest Title");
        assert_eq!(report.kind, "digest");
        assert_eq!(report.source_name.as_deref(), Some("知识研报"));
        assert_eq!(report.body_md, "# Digest Title");
        assert_eq!(report.summary, "Digest summary");
        assert_eq!(report.citations_json, "[]");
    }
}
