use rusqlite::Connection;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};

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
    pub invocation_id: Option<String>,
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
    pub plan: OpenDataMirrorPlan,
    pub manifest: OpenDataMirrorManifest,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct MirrorManifestCounts {
    pub sources: usize,
    pub evidence: usize,
    pub reports: usize,
    pub investigations: usize,
    pub journal: usize,
    pub gallery: usize,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MirrorPlanItem {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub path: String,
    pub content_hash: Option<String>,
    pub previous_hash: Option<String>,
    pub action: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MirrorPlanError {
    pub kind: Option<String>,
    pub id: Option<String>,
    pub path: Option<String>,
    pub message: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OpenDataMirrorPlan {
    pub root_path: String,
    pub generated_at: String,
    pub counts: MirrorManifestCounts,
    pub to_write: Vec<MirrorPlanItem>,
    pub unchanged: Vec<MirrorPlanItem>,
    pub stale: Vec<MirrorPlanItem>,
    pub to_prune: Vec<MirrorPlanItem>,
    pub errors: Vec<MirrorPlanError>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MirrorManifestAsset {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub path: String,
    pub content_hash: String,
    pub exported_at: String,
    #[serde(default)]
    pub attachments: Vec<serde_json::Value>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OpenDataMirrorManifest {
    pub version: i64,
    #[serde(default)]
    pub generated_at: Option<String>,
    #[serde(default)]
    pub assets: Vec<MirrorManifestAsset>,
    #[serde(default)]
    pub errors: Vec<MirrorPlanError>,
    #[serde(default)]
    pub pruned: Vec<MirrorPlanItem>,
    #[serde(default)]
    pub stale: Vec<MirrorPlanItem>,
    #[serde(default)]
    pub counts: Option<MirrorManifestCounts>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OpenDataMirrorPruneResult {
    pub root_path: String,
    pub files_deleted: usize,
    pub pruned: Vec<MirrorPlanItem>,
    pub errors: Vec<MirrorPlanError>,
    pub manifest: Option<OpenDataMirrorManifest>,
}

#[derive(serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CitationLocatorInput {
    pub kind: String,
    pub id: String,
    pub quote: Option<String>,
    pub excerpt: Option<String>,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
    pub source_text_hash: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CitationLocation {
    pub start: i64,
    pub end: i64,
    pub snippet: String,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CitationLocatorResult {
    pub status: String,
    pub target_kind: String,
    pub target_id: String,
    pub target_title: Option<String>,
    pub quote: Option<String>,
    pub match_count: i64,
    pub locations: Vec<CitationLocation>,
    pub source_text_hash: Option<String>,
    pub message: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReportCitationAuditItem {
    pub citation_index: i64,
    pub kind: String,
    pub id: String,
    pub label: String,
    pub title: String,
    pub quote: Option<String>,
    pub excerpt: Option<String>,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
    pub locator: CitationLocatorResult,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReportCitationAudit {
    pub report_id: String,
    pub total: i64,
    pub located_count: i64,
    pub multiple_matches_count: i64,
    pub not_found_count: i64,
    pub stale_count: i64,
    pub target_missing_count: i64,
    pub not_applicable_count: i64,
    pub citations: Vec<ReportCitationAuditItem>,
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
        let mut conn = db::open_db(&path)?;
        let invocation_id = input.invocation_id.clone();
        let tx = conn.transaction()?;
        let report = db::save_report(&tx, report_command_input_to_db(input))?;
        save_persisted_report_audit(&tx, &report)?;
        if let Some(invocation_id) = invocation_id.as_deref() {
            db::link_ai_invocation_output(&tx, invocation_id, "report", &report.id)?;
        }
        if report.kind == "investigation" {
            let (source_ids, point_ids, evidence_ids) =
                citation_asset_ids_for_journal(&report.citations_json);
            let query = report
                .source_name
                .clone()
                .unwrap_or_else(|| report.title.clone());
            db::save_journal_entry(
                &tx,
                db::SaveJournalEntryInput {
                    query,
                    note: report.summary.clone(),
                    tags: vec!["investigation".to_string()],
                    source_ids,
                    point_ids,
                    evidence_ids,
                    report_ids: vec![report.id.clone()],
                    created_report_id: Some(report.id.clone()),
                    source_kind: "investigation".to_string(),
                },
            )?;
        }
        tx.commit()?;
        Ok(report)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_report_invocation_audit(
    app: tauri::AppHandle<Wry>,
    report_id: String,
) -> Result<Option<db::ReportInvocationAudit>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Option<db::ReportInvocationAudit>> {
        let conn = db::open_db(&path)?;
        db::load_report_invocation_audit(&conn, &report_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_report_audit(
    app: tauri::AppHandle<Wry>,
    report_id: String,
) -> Result<Option<db::ReportAuditRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Option<db::ReportAuditRecord>> {
        let conn = db::open_db(&path)?;
        db::load_report_audit(&conn, &report_id)
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
pub async fn locate_citation_quote(
    app: tauri::AppHandle<Wry>,
    input: CitationLocatorInput,
) -> Result<CitationLocatorResult, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<CitationLocatorResult> {
        let conn = db::open_db(&path)?;
        locate_citation_quote_in_db(&conn, &input)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_report_citation_audit(
    app: tauri::AppHandle<Wry>,
    report_id: String,
) -> Result<Option<ReportCitationAudit>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Option<ReportCitationAudit>> {
        let conn = db::open_db(&path)?;
        let Some(report) = db::get_report(&conn, &report_id)? else {
            return Ok(None);
        };
        build_report_citation_audit(&conn, &report).map(Some)
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
pub async fn list_due_review_items(
    app: tauri::AppHandle<Wry>,
) -> Result<Vec<db::ReviewItem>, String> {
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
pub async fn list_all_review_items(
    app: tauri::AppHandle<Wry>,
) -> Result<Vec<db::ReviewItem>, String> {
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
pub async fn build_open_data_mirror_plan(
    app: tauri::AppHandle<Wry>,
) -> Result<OpenDataMirrorPlan, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || build_open_data_mirror_plan_blocking(path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_open_data_mirror(
    app: tauri::AppHandle<Wry>,
) -> Result<MirrorExportResult, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || export_open_data_mirror_blocking(path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_open_data_mirror_manifest(
    app: tauri::AppHandle<Wry>,
) -> Result<Option<OpenDataMirrorManifest>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || load_open_data_mirror_manifest_blocking(path))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn prune_open_data_mirror(
    app: tauri::AppHandle<Wry>,
) -> Result<OpenDataMirrorPruneResult, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || prune_open_data_mirror_blocking(path))
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
pub async fn list_indexed_folders(
    app: tauri::AppHandle<Wry>,
) -> Result<Vec<db::IndexedFolder>, String> {
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
pub async fn list_indexed_files_for_folder(
    app: tauri::AppHandle<Wry>,
    folder_id: String,
) -> Result<Vec<db::IndexedFile>, String> {
    let db_path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<db::IndexedFile>> {
        let conn = db::open_db(&db_path)?;
        db::list_indexed_files_for_folder(&conn, &folder_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_indexed_file_preview(
    app: tauri::AppHandle<Wry>,
    file_id: String,
) -> Result<Option<db::IndexedFile>, String> {
    let db_path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Option<db::IndexedFile>> {
        let conn = db::open_db(&db_path)?;
        db::get_indexed_file(&conn, &file_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_indexed_folder(
    app: tauri::AppHandle<Wry>,
    folder_id: String,
) -> Result<(), String> {
    let db_path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let conn = db::open_db(&db_path)?;
        db::remove_indexed_folder(&conn, &folder_id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

struct CitationTarget {
    kind: String,
    id: String,
    title: Option<String>,
    text: String,
}

fn locate_citation_quote_in_db(
    conn: &Connection,
    input: &CitationLocatorInput,
) -> anyhow::Result<CitationLocatorResult> {
    let target_kind = input.kind.trim().to_string();
    let target_id = input.id.trim().to_string();
    let quote = citation_quote(input);
    if quote.is_none() {
        return Ok(citation_locator_result(
            "not_applicable",
            target_kind,
            target_id,
            None,
            None,
            Vec::new(),
            None,
            Some("citation has no quote or excerpt".to_string()),
        ));
    }
    let quote = quote.unwrap_or_default();
    let Some(target) = citation_target(conn, input)? else {
        return Ok(citation_locator_result(
            "target_missing",
            target_kind,
            target_id,
            None,
            Some(quote),
            Vec::new(),
            None,
            Some("citation target was not found".to_string()),
        ));
    };

    let current_hash = stable_text_hash(&target.text);
    let locations = locate_quote_spans(&target.text, &quote);
    let mut status = match locations.len() {
        0 => "not_found",
        1 => "located",
        _ => "multiple_matches",
    };
    if input
        .source_text_hash
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some_and(|expected| expected != current_hash)
    {
        status = "stale";
    }

    Ok(citation_locator_result(
        status,
        target.kind,
        target.id,
        target.title,
        Some(quote),
        locations,
        Some(current_hash),
        None,
    ))
}

fn citation_target(
    conn: &Connection,
    input: &CitationLocatorInput,
) -> anyhow::Result<Option<CitationTarget>> {
    let kind = input.kind.trim();
    let id = input.id.trim();
    if kind.is_empty() || id.is_empty() {
        return Ok(None);
    }
    match kind {
        "source" => source_citation_target(conn, id, input.chunk_index),
        "point" => point_citation_target(conn, id),
        "evidence" => evidence_citation_target(conn, id),
        _ => Ok(None),
    }
}

fn source_citation_target(
    conn: &Connection,
    source_id: &str,
    chunk_index: Option<i64>,
) -> anyhow::Result<Option<CitationTarget>> {
    let Some(workspace) = db::get_source_workspace(conn, source_id)? else {
        return Ok(None);
    };
    let title = workspace
        .source
        .title
        .clone()
        .or_else(|| Some(workspace.source.canonical_uri.clone()));
    let chunks = if let Some(chunk_index) = chunk_index {
        workspace
            .chunks
            .iter()
            .filter(|chunk| chunk.chunk_index == chunk_index)
            .map(|chunk| chunk.text.as_str())
            .collect::<Vec<_>>()
    } else {
        workspace
            .chunks
            .iter()
            .map(|chunk| chunk.text.as_str())
            .collect::<Vec<_>>()
    };
    let text = chunks.join("\n\n");
    Ok(Some(CitationTarget {
        kind: "source".to_string(),
        id: source_id.to_string(),
        title,
        text,
    }))
}

fn point_citation_target(
    conn: &Connection,
    point_id: &str,
) -> anyhow::Result<Option<CitationTarget>> {
    let Some(point) = db::get_point(conn, point_id)? else {
        return Ok(None);
    };
    let mut parts = vec![point.content.clone()];
    if let Some(excerpt) = point
        .source_excerpt
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        parts.push(excerpt.to_string());
    }
    Ok(Some(CitationTarget {
        kind: "point".to_string(),
        id: point.id,
        title: point.source_doc_name.or_else(|| Some("Point".to_string())),
        text: parts.join("\n\n"),
    }))
}

fn evidence_citation_target(
    conn: &Connection,
    evidence_id: &str,
) -> anyhow::Result<Option<CitationTarget>> {
    let Some(evidence) = db::get_evidence(conn, evidence_id)? else {
        return Ok(None);
    };
    let mut parts = vec![evidence.claim.clone(), evidence.answer.clone()];
    if let Some(reasoning) = evidence
        .reasoning
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        parts.push(reasoning.to_string());
    }
    if let Some(context) = evidence
        .context
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        parts.push(context.to_string());
    }
    for source in &evidence.sources {
        if let Some(snippet) = source
            .snippet
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            parts.push(snippet.to_string());
        }
    }
    Ok(Some(CitationTarget {
        kind: "evidence".to_string(),
        id: evidence.id,
        title: Some(evidence.claim),
        text: parts.join("\n\n"),
    }))
}

fn citation_quote(input: &CitationLocatorInput) -> Option<String> {
    input
        .quote
        .as_deref()
        .or(input.excerpt.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn locate_quote_spans(text: &str, quote: &str) -> Vec<CitationLocation> {
    if quote.is_empty() {
        return Vec::new();
    }
    let mut locations = Vec::new();
    let mut offset = 0;
    while offset <= text.len() {
        let Some(relative) = text[offset..].find(quote) else {
            break;
        };
        let byte_start = offset + relative;
        let byte_end = byte_start + quote.len();
        let char_start = text[..byte_start].chars().count();
        let char_end = char_start + quote.chars().count();
        locations.push(CitationLocation {
            start: char_start.min(i64::MAX as usize) as i64,
            end: char_end.min(i64::MAX as usize) as i64,
            snippet: citation_location_snippet(text, char_start, char_end),
        });
        offset = byte_end;
    }
    locations
}

fn citation_location_snippet(text: &str, start: usize, end: usize) -> String {
    let context_start = start.saturating_sub(40);
    let context_end = end.saturating_add(40);
    text.chars()
        .skip(context_start)
        .take(context_end.saturating_sub(context_start))
        .collect::<String>()
}

fn citation_locator_result(
    status: &str,
    target_kind: String,
    target_id: String,
    target_title: Option<String>,
    quote: Option<String>,
    locations: Vec<CitationLocation>,
    source_text_hash: Option<String>,
    message: Option<String>,
) -> CitationLocatorResult {
    CitationLocatorResult {
        status: status.to_string(),
        target_kind,
        target_id,
        target_title,
        quote,
        match_count: locations.len().min(i64::MAX as usize) as i64,
        locations,
        source_text_hash,
        message,
    }
}

fn build_report_citation_audit(
    conn: &Connection,
    report: &db::ReportRecord,
) -> anyhow::Result<ReportCitationAudit> {
    let citations = report_citations_for_audit(&report.citations_json);
    let mut items = Vec::new();
    for (index, citation) in citations.into_iter().enumerate() {
        let locator = locate_citation_quote_in_db(conn, &citation.input)?;
        items.push(ReportCitationAuditItem {
            citation_index: index.min(i64::MAX as usize) as i64,
            kind: citation.kind,
            id: citation.id,
            label: citation.label,
            title: citation.title,
            quote: citation.input.quote,
            excerpt: citation.input.excerpt,
            source_id: citation.input.source_id,
            chunk_index: citation.input.chunk_index,
            locator,
        });
    }
    let mut audit = ReportCitationAudit {
        report_id: report.id.clone(),
        total: items.len().min(i64::MAX as usize) as i64,
        located_count: 0,
        multiple_matches_count: 0,
        not_found_count: 0,
        stale_count: 0,
        target_missing_count: 0,
        not_applicable_count: 0,
        citations: items,
    };
    for item in &audit.citations {
        match item.locator.status.as_str() {
            "located" => audit.located_count += 1,
            "multiple_matches" => audit.multiple_matches_count += 1,
            "not_found" => audit.not_found_count += 1,
            "stale" => audit.stale_count += 1,
            "target_missing" => audit.target_missing_count += 1,
            "not_applicable" => audit.not_applicable_count += 1,
            _ => {}
        }
    }
    Ok(audit)
}

fn save_persisted_report_audit(
    conn: &Connection,
    report: &db::ReportRecord,
) -> anyhow::Result<db::ReportAuditRecord> {
    let claims = db::extract_report_claims_for_report(report);
    let mut persisted_citations = Vec::new();
    for (index, citation) in report_citations_for_audit(&report.citations_json)
        .into_iter()
        .enumerate()
    {
        if !matches!(citation.kind.as_str(), "source" | "point" | "evidence") {
            continue;
        }
        let locator = locate_citation_quote_in_db(conn, &citation.input)?;
        let first_location = locator.locations.first();
        persisted_citations.push(db::SaveReportCitationInput {
            citation_index: index.min(i64::MAX as usize) as i64,
            target_kind: citation.kind,
            target_id: citation.id,
            label: non_empty_string(citation.label),
            title: non_empty_string(citation.title),
            quote: citation.input.quote,
            excerpt: citation.input.excerpt,
            reason: citation.reason,
            source_id: citation.input.source_id,
            chunk_index: citation.input.chunk_index,
            source_text_hash: locator.source_text_hash,
            span_start: first_location.map(|location| location.start),
            span_end: first_location.map(|location| location.end),
            locator_status: locator.status,
            match_count: locator.match_count,
        });
    }
    db::replace_report_audit_rows(conn, &report.id, claims, persisted_citations)
}

struct AuditCitationInput {
    kind: String,
    id: String,
    label: String,
    title: String,
    reason: Option<String>,
    input: CitationLocatorInput,
}

fn report_citations_for_audit(citations_json: &str) -> Vec<AuditCitationInput> {
    let Ok(serde_json::Value::Array(citations)) =
        serde_json::from_str::<serde_json::Value>(citations_json)
    else {
        return Vec::new();
    };
    citations
        .into_iter()
        .filter_map(|value| {
            let object = value.as_object()?;
            let kind = object.get("kind")?.as_str()?.trim().to_string();
            let id = object.get("id")?.as_str()?.trim().to_string();
            if kind.is_empty() || id.is_empty() {
                return None;
            }
            let label = object
                .get("label")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("")
                .to_string();
            let title = object
                .get("title")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("")
                .to_string();
            let quote = json_string_field(object, "quote", "quote");
            let excerpt = json_string_field(object, "excerpt", "excerpt");
            let reason = json_string_field(object, "reason", "reason");
            let source_id = json_string_field(object, "sourceId", "source_id");
            let source_text_hash = json_string_field(object, "sourceTextHash", "source_text_hash");
            let chunk_index = object
                .get("chunkIndex")
                .or_else(|| object.get("chunk_index"))
                .and_then(serde_json::Value::as_i64);
            Some(AuditCitationInput {
                kind: kind.clone(),
                id: id.clone(),
                label,
                title,
                reason,
                input: CitationLocatorInput {
                    kind,
                    id,
                    quote,
                    excerpt,
                    source_id,
                    chunk_index,
                    source_text_hash,
                },
            })
        })
        .collect()
}

fn json_string_field(
    object: &serde_json::Map<String, serde_json::Value>,
    camel: &str,
    snake: &str,
) -> Option<String> {
    object
        .get(camel)
        .or_else(|| object.get(snake))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn non_empty_string(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
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
    let Ok(serde_json::Value::Array(citations)) =
        serde_json::from_str::<serde_json::Value>(citations_json)
    else {
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

    if has_any(&[
        "mixed",
        "partly",
        "partially",
        "部分",
        "一部分",
        "有真有假",
        "喜忧参半",
    ]) {
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
    ]) && !has_any(&[
        "无法证实",
        "不能证实",
        "未证实",
        "not confirmed",
        "unconfirmed",
    ]) {
        return "supported";
    }

    "uncertain"
}

fn build_open_data_mirror_plan_blocking(db_path: PathBuf) -> anyhow::Result<OpenDataMirrorPlan> {
    let conn = db::open_db(&db_path)?;
    let config = db::get_open_data_mirror_config(&conn)?;
    let root = mirror_root_from_config(&config)?;
    Ok(build_open_data_mirror_plan_data(&conn, &config, &root)?.plan)
}

fn export_open_data_mirror_blocking(db_path: PathBuf) -> anyhow::Result<MirrorExportResult> {
    let conn = db::open_db(&db_path)?;
    let config = db::get_open_data_mirror_config(&conn)?;
    let root = mirror_root_from_config(&config)?;
    fs::create_dir_all(&root).context("failed to create mirror root")?;

    let build = build_open_data_mirror_plan_data(&conn, &config, &root)?;
    let mut action_by_path = HashMap::new();
    for item in &build.plan.to_write {
        action_by_path.insert(item.path.clone(), item.action.clone());
    }
    for item in &build.plan.stale {
        action_by_path.insert(item.path.clone(), item.action.clone());
    }

    let mut files_written = 0;
    for asset in &build.assets {
        if action_by_path
            .get(&asset.relative_path)
            .is_some_and(|action| action == "write" || action == "overwrite")
        {
            write_mirror_relative_file(&root, &asset.relative_path, &asset.content)?;
            files_written += 1;
        }
    }

    let generated_at = chrono::Utc::now().to_rfc3339();
    let manifest = OpenDataMirrorManifest {
        version: 2,
        generated_at: Some(generated_at.clone()),
        assets: build
            .assets
            .iter()
            .map(|asset| MirrorManifestAsset {
                kind: asset.kind.clone(),
                id: asset.id.clone(),
                title: asset.title.clone(),
                path: asset.relative_path.clone(),
                content_hash: asset.content_hash.clone(),
                exported_at: generated_at.clone(),
                attachments: Vec::new(),
                warnings: Vec::new(),
            })
            .collect(),
        errors: build.plan.errors.clone(),
        pruned: Vec::new(),
        stale: build.plan.to_prune.clone(),
        counts: Some(build.plan.counts.clone()),
    };

    write_text_file(
        &root.join("manifest.json"),
        &serde_json::to_string_pretty(&manifest)?,
    )?;
    write_text_file(&root.join("index.md"), &mirror_index_markdown(&build.plan.counts))?;
    files_written += 2;

    Ok(MirrorExportResult {
        root_path: root.to_string_lossy().to_string(),
        files_written,
        sources: build.plan.counts.sources,
        evidence: build.plan.counts.evidence,
        reports: build.plan.counts.reports,
        investigations: build.plan.counts.investigations,
        journal: build.plan.counts.journal,
        gallery: build.plan.counts.gallery,
        plan: build.plan,
        manifest,
    })
}

fn load_open_data_mirror_manifest_blocking(
    db_path: PathBuf,
) -> anyhow::Result<Option<OpenDataMirrorManifest>> {
    let conn = db::open_db(&db_path)?;
    let config = db::get_open_data_mirror_config(&conn)?;
    let root = mirror_root_path_from_config(&config)?;
    read_open_data_mirror_manifest(&root)
}

fn prune_open_data_mirror_blocking(db_path: PathBuf) -> anyhow::Result<OpenDataMirrorPruneResult> {
    let conn = db::open_db(&db_path)?;
    let config = db::get_open_data_mirror_config(&conn)?;
    let root = mirror_root_from_config(&config)?;
    let build = build_open_data_mirror_plan_data(&conn, &config, &root)?;
    let mut pruned = Vec::new();
    let mut errors = Vec::new();
    let mut files_deleted = 0;

    for item in &build.plan.to_prune {
        match delete_mirror_relative_file(&root, &item.path) {
            Ok(deleted) => {
                if deleted {
                    files_deleted += 1;
                }
                pruned.push(item.clone());
            }
            Err(error) => errors.push(MirrorPlanError {
                kind: Some(item.kind.clone()),
                id: Some(item.id.clone()),
                path: Some(item.path.clone()),
                message: error.to_string(),
            }),
        }
    }

    let mut manifest = read_open_data_mirror_manifest(&root)?;
    if let Some(current) = manifest.as_mut() {
        let pruned_paths = pruned
            .iter()
            .map(|item| item.path.as_str())
            .collect::<HashSet<_>>();
        current
            .assets
            .retain(|asset| !pruned_paths.contains(asset.path.as_str()));
        current
            .stale
            .retain(|item| !pruned_paths.contains(item.path.as_str()));
        current.pruned = pruned.clone();
        current.errors = errors.clone();
        write_text_file(
            &root.join("manifest.json"),
            &serde_json::to_string_pretty(current)?,
        )?;
    }

    Ok(OpenDataMirrorPruneResult {
        root_path: root.to_string_lossy().to_string(),
        files_deleted,
        pruned,
        errors,
        manifest,
    })
}

struct MirrorExportAsset {
    kind: String,
    id: String,
    title: String,
    relative_path: String,
    content: String,
    content_hash: String,
}

struct MirrorPlanBuild {
    plan: OpenDataMirrorPlan,
    assets: Vec<MirrorExportAsset>,
}

fn mirror_root_from_config(config: &db::OpenDataMirrorConfig) -> anyhow::Result<PathBuf> {
    if !config.enabled {
        anyhow::bail!("Open Data Mirror is disabled");
    }
    mirror_root_path_from_config(config)
}

fn mirror_root_path_from_config(config: &db::OpenDataMirrorConfig) -> anyhow::Result<PathBuf> {
    let root_path = config
        .root_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow::anyhow!("Open Data Mirror root path is required"))?;
    Ok(PathBuf::from(root_path))
}

fn build_open_data_mirror_plan_data(
    conn: &Connection,
    config: &db::OpenDataMirrorConfig,
    root: &Path,
) -> anyhow::Result<MirrorPlanBuild> {
    let generated_at = chrono::Utc::now().to_rfc3339();
    let mut counts = MirrorManifestCounts::default();
    let mut assets = Vec::new();
    let sources = db::list_recent_sources(&conn, usize::MAX)?;
    if config.export_sources {
        for source in &sources {
            assets.push(mirror_export_asset(
                "source",
                &source.id,
                source.title.as_deref().unwrap_or(&source.canonical_uri),
                "sources",
                &safe_file_stem(&source.id, source.title.as_deref()),
                source_markdown(source),
            ));
        }
        counts.sources = sources.len();
    }

    let evidence = db::list_recent_evidence(&conn, usize::MAX)?;
    if config.export_evidence {
        for item in &evidence {
            assets.push(mirror_export_asset(
                "evidence",
                &item.id,
                &item.claim,
                "evidence",
                &safe_file_stem(&item.id, Some(&item.claim)),
                evidence_markdown(item),
            ));
        }
        counts.evidence = evidence.len();
    }

    let reports = db::list_recent_reports(&conn, usize::MAX)?;
    if config.export_reports {
        for report in &reports {
            let (kind, dir) = if report.kind == "investigation" {
                counts.investigations += 1;
                ("investigation", "investigations")
            } else {
                counts.reports += 1;
                ("report", "reports")
            };
            assets.push(mirror_export_asset(
                kind,
                &report.id,
                &report.title,
                dir,
                &safe_file_stem(&report.id, Some(&report.title)),
                report_markdown(report),
            ));
        }
    }

    let journal = db::list_recent_journal_entries(&conn, usize::MAX)?;
    if config.export_journal {
        for entry in &journal {
            assets.push(mirror_export_asset(
                "journal",
                &entry.id,
                &entry.query,
                "journal",
                &safe_file_stem(&entry.id, Some(&entry.query)),
                journal_markdown(entry),
            ));
        }
        counts.journal = journal.len();
    }

    let gallery = db::list_gallery(&conn)?;
    if config.export_gallery_index {
        assets.push(mirror_export_asset(
            "gallery",
            "gallery-index",
            "Gallery Index",
            "gallery",
            "index",
            gallery_index_markdown(&gallery),
        ));
        counts.gallery = gallery.len();
    }

    let manifest = read_open_data_mirror_manifest(root)?;
    let plan = classify_open_data_mirror_plan(root, generated_at, counts, &assets, manifest)?;
    Ok(MirrorPlanBuild { plan, assets })
}

fn mirror_export_asset(
    kind: &str,
    id: &str,
    title: &str,
    dir: &str,
    stem: &str,
    content: String,
) -> MirrorExportAsset {
    let relative_path = format!("{dir}/{stem}.md");
    let content_hash = stable_text_hash(&content);
    MirrorExportAsset {
        kind: kind.to_string(),
        id: id.to_string(),
        title: title.to_string(),
        relative_path,
        content,
        content_hash,
    }
}

fn classify_open_data_mirror_plan(
    root: &Path,
    generated_at: String,
    counts: MirrorManifestCounts,
    assets: &[MirrorExportAsset],
    manifest: Option<OpenDataMirrorManifest>,
) -> anyhow::Result<OpenDataMirrorPlan> {
    let mut previous_by_key: HashMap<String, MirrorManifestAsset> = HashMap::new();
    let mut prune_candidates: Vec<MirrorPlanItem> = Vec::new();
    if let Some(manifest) = manifest {
        for asset in manifest.assets {
            previous_by_key.insert(mirror_asset_key(&asset.kind, &asset.id), asset);
        }
        prune_candidates.extend(manifest.stale);
    }

    let mut current_keys = HashSet::new();
    let mut current_paths = HashSet::new();
    let mut to_write = Vec::new();
    let mut unchanged = Vec::new();
    let mut stale = Vec::new();
    let mut errors = Vec::new();

    for asset in assets {
        let key = mirror_asset_key(&asset.kind, &asset.id);
        current_keys.insert(key.clone());
        current_paths.insert(asset.relative_path.clone());
        let previous = previous_by_key.get(&key);
        let previous_hash = previous.map(|item| item.content_hash.clone());
        let item = MirrorPlanItem {
            kind: asset.kind.clone(),
            id: asset.id.clone(),
            title: asset.title.clone(),
            path: asset.relative_path.clone(),
            content_hash: Some(asset.content_hash.clone()),
            previous_hash,
            action: String::new(),
        };

        match read_mirror_file_hash(root, &asset.relative_path) {
            Ok(Some(file_hash)) if file_hash == asset.content_hash => {
                let mut item = item;
                item.action = "skip".to_string();
                unchanged.push(item);
            }
            Ok(Some(_)) => {
                let mut item = item;
                item.action = "overwrite".to_string();
                stale.push(item);
            }
            Ok(None) => {
                let mut item = item;
                item.action = "write".to_string();
                to_write.push(item);
            }
            Err(error) => {
                let mut item = item;
                item.action = "write".to_string();
                errors.push(MirrorPlanError {
                    kind: Some(item.kind.clone()),
                    id: Some(item.id.clone()),
                    path: Some(item.path.clone()),
                    message: error.to_string(),
                });
                to_write.push(item);
            }
        }

        if let Some(previous) = previous {
            if previous.path != asset.relative_path {
                prune_candidates.push(MirrorPlanItem {
                    kind: previous.kind.clone(),
                    id: previous.id.clone(),
                    title: previous.title.clone(),
                    path: previous.path.clone(),
                    content_hash: Some(previous.content_hash.clone()),
                    previous_hash: Some(previous.content_hash.clone()),
                    action: "prune".to_string(),
                });
            }
        }
    }

    for (key, previous) in previous_by_key {
        if current_keys.contains(&key) || current_paths.contains(&previous.path) {
            continue;
        }
        prune_candidates.push(MirrorPlanItem {
            kind: previous.kind.clone(),
            id: previous.id.clone(),
            title: previous.title.clone(),
            path: previous.path.clone(),
            content_hash: Some(previous.content_hash.clone()),
            previous_hash: Some(previous.content_hash.clone()),
            action: "prune".to_string(),
        });
    }

    let mut seen_prune_paths = HashSet::new();
    let to_prune = prune_candidates
        .into_iter()
        .filter(|item| !current_paths.contains(&item.path))
        .filter(|item| seen_prune_paths.insert(item.path.clone()))
        .map(|mut item| {
            item.action = "prune".to_string();
            item
        })
        .collect();

    Ok(OpenDataMirrorPlan {
        root_path: root.to_string_lossy().to_string(),
        generated_at,
        counts,
        to_write,
        unchanged,
        stale,
        to_prune,
        errors,
    })
}

fn mirror_asset_key(kind: &str, id: &str) -> String {
    format!("{kind}:{id}")
}

fn read_mirror_file_hash(root: &Path, relative_path: &str) -> anyhow::Result<Option<String>> {
    let path = mirror_relative_path(root, relative_path)?;
    if !path.exists() {
        return Ok(None);
    }
    if !path.is_file() {
        anyhow::bail!("mirror path is not a file: {}", relative_path);
    }
    let content =
        fs::read_to_string(&path).with_context(|| format!("failed to read {}", path.display()))?;
    Ok(Some(stable_text_hash(&content)))
}

fn write_mirror_relative_file(root: &Path, relative_path: &str, content: &str) -> anyhow::Result<()> {
    let path = mirror_relative_path(root, relative_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create mirror directory {}", parent.display()))?;
    }
    write_text_file(&path, content)
}

fn delete_mirror_relative_file(root: &Path, relative_path: &str) -> anyhow::Result<bool> {
    let path = mirror_relative_path(root, relative_path)?;
    if !path.exists() {
        return Ok(false);
    }
    if !path.is_file() {
        anyhow::bail!("mirror prune path is not a file: {}", relative_path);
    }
    let root_canonical = root
        .canonicalize()
        .with_context(|| format!("failed to resolve mirror root {}", root.display()))?;
    let parent = path
        .parent()
        .ok_or_else(|| anyhow::anyhow!("mirror prune path has no parent: {relative_path}"))?;
    let parent_canonical = parent
        .canonicalize()
        .with_context(|| format!("failed to resolve mirror path parent {}", parent.display()))?;
    if !parent_canonical.starts_with(&root_canonical) {
        anyhow::bail!("mirror prune path escapes root: {}", relative_path);
    }
    fs::remove_file(&path).with_context(|| format!("failed to delete {}", path.display()))?;
    Ok(true)
}

fn mirror_relative_path(root: &Path, relative_path: &str) -> anyhow::Result<PathBuf> {
    let relative = Path::new(relative_path);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::Prefix(_) | Component::RootDir | Component::ParentDir
            )
        })
    {
        anyhow::bail!("mirror path must stay relative: {}", relative_path);
    }
    Ok(root.join(relative))
}

fn read_open_data_mirror_manifest(root: &Path) -> anyhow::Result<Option<OpenDataMirrorManifest>> {
    let path = root.join("manifest.json");
    if !path.exists() {
        return Ok(None);
    }
    let text =
        fs::read_to_string(&path).with_context(|| format!("failed to read {}", path.display()))?;
    let value: serde_json::Value = serde_json::from_str(&text)
        .with_context(|| format!("failed to parse {}", path.display()))?;
    parse_open_data_mirror_manifest(value).map(Some)
}

fn parse_open_data_mirror_manifest(
    value: serde_json::Value,
) -> anyhow::Result<OpenDataMirrorManifest> {
    let version = value.get("version").and_then(|item| item.as_i64()).unwrap_or(1);
    if version >= 2 {
        let mut manifest: OpenDataMirrorManifest = serde_json::from_value(value)?;
        manifest.version = version;
        return Ok(manifest);
    }

    let counts = value.get("counts").map(parse_mirror_manifest_counts);
    let generated_at = json_string_field_from_value(&value, "generatedAt")
        .or_else(|| json_string_field_from_value(&value, "generated_at"))
        .or_else(|| json_string_field_from_value(&value, "exportedAt"))
        .or_else(|| json_string_field_from_value(&value, "exported_at"));
    Ok(OpenDataMirrorManifest {
        version,
        generated_at,
        assets: Vec::new(),
        errors: Vec::new(),
        pruned: Vec::new(),
        stale: Vec::new(),
        counts,
    })
}

fn parse_mirror_manifest_counts(value: &serde_json::Value) -> MirrorManifestCounts {
    MirrorManifestCounts {
        sources: json_usize_field(value, "sources"),
        evidence: json_usize_field(value, "evidence"),
        reports: json_usize_field(value, "reports"),
        investigations: json_usize_field(value, "investigations"),
        journal: json_usize_field(value, "journal"),
        gallery: json_usize_field(value, "gallery"),
    }
}

fn json_usize_field(value: &serde_json::Value, key: &str) -> usize {
    value
        .get(key)
        .and_then(|item| item.as_u64())
        .map(|item| item as usize)
        .unwrap_or_default()
}

fn json_string_field_from_value(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|item| item.as_str())
        .map(str::to_string)
}

fn scan_indexed_folder_blocking(
    db_path: PathBuf,
    folder_id: String,
) -> anyhow::Result<db::IndexedFolderScanResult> {
    let mut conn = db::open_db(&db_path)?;
    let folder = db::get_indexed_folder(&conn, &folder_id)?
        .ok_or_else(|| anyhow::anyhow!("indexed folder not found: {folder_id}"))?;
    let root = PathBuf::from(&folder.path)
        .canonicalize()
        .with_context(|| format!("failed to resolve indexed folder path: {}", folder.path))?;
    if !root.is_dir() {
        anyhow::bail!("indexed folder path is not a directory: {}", folder.path);
    }

    let mut seen_paths = HashSet::new();
    let mut files = Vec::new();
    for path in collect_folder_files(&root)? {
        let input = describe_indexed_file(&mut conn, &folder.id, &root, &path)?;
        seen_paths.insert(input.path.clone());
        files.push(db::upsert_indexed_file(&conn, input)?);
    }
    files.extend(db::mark_missing_indexed_files(
        &conn,
        &folder.id,
        &seen_paths,
    )?);

    let scanned_at = chrono::Utc::now().to_rfc3339();
    db::mark_indexed_folder_scanned(&conn, &folder.id, &scanned_at)?;
    let folder = db::get_indexed_folder(&conn, &folder.id)?.unwrap_or(folder);
    let indexed_count = files
        .iter()
        .filter(|file| file.index_status == "indexed")
        .count() as i64;
    let metadata_only_count = files.len() as i64 - indexed_count;
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
        let Ok(entries) = fs::read_dir(&path) else {
            continue;
        };
        for entry in entries {
            let Ok(entry) = entry else {
                continue;
            };
            let entry_path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                files.push(entry_path);
                continue;
            };
            if file_type.is_dir() && !file_type.is_symlink() {
                stack.push(entry_path);
            } else {
                files.push(entry_path);
            }
        }
    }
    Ok(files)
}

fn describe_indexed_file(
    conn: &mut Connection,
    folder_id: &str,
    root: &Path,
    path: &Path,
) -> anyhow::Result<db::UpsertIndexedFileInput> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("file")
        .to_string();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase());
    let descriptor_kind = descriptor_kind_for_extension(extension.as_deref()).to_string();
    let raw_path = path.to_string_lossy().to_string();
    let canonical = match path.canonicalize() {
        Ok(value) => value,
        Err(error) => {
            return Ok(indexed_file_input(
                folder_id,
                raw_path,
                None,
                name,
                extension,
                None,
                None,
                None,
                &descriptor_kind,
                io_read_status(&error),
                "failed",
                None,
                Some(error.to_string()),
            )?);
        }
    };
    let canonical_path = canonical.to_string_lossy().to_string();
    if !canonical.starts_with(root) {
        return Ok(indexed_file_input(
            folder_id,
            canonical_path.clone(),
            Some(canonical_path),
            name,
            extension,
            None,
            None,
            None,
            &descriptor_kind,
            "failed",
            "failed",
            None,
            Some("path escapes indexed folder root".to_string()),
        )?);
    }

    let metadata = match fs::metadata(&canonical) {
        Ok(value) => value,
        Err(error) => {
            return Ok(indexed_file_input(
                folder_id,
                canonical_path.clone(),
                Some(canonical_path),
                name,
                extension,
                None,
                None,
                None,
                &descriptor_kind,
                io_read_status(&error),
                "failed",
                None,
                Some(error.to_string()),
            )?);
        }
    };
    let size_bytes = Some(metadata.len().min(i64::MAX as u64) as i64);
    let modified_at = metadata.modified().ok().map(system_time_to_rfc3339);
    if !metadata.is_file() {
        return indexed_file_input(
            folder_id,
            canonical_path.clone(),
            Some(canonical_path),
            name,
            extension,
            size_bytes,
            modified_at,
            None,
            &descriptor_kind,
            "unsupported",
            "metadata_only",
            None,
            Some("not a regular file".to_string()),
        );
    }
    if !extension.as_deref().is_some_and(is_text_index_extension) {
        return indexed_file_input(
            folder_id,
            canonical_path.clone(),
            Some(canonical_path),
            name,
            extension,
            size_bytes,
            modified_at,
            None,
            &descriptor_kind,
            "unsupported",
            "metadata_only",
            None,
            None,
        );
    }
    if metadata.len() > MAX_INDEXED_TEXT_BYTES {
        return indexed_file_input(
            folder_id,
            canonical_path.clone(),
            Some(canonical_path),
            name,
            extension,
            size_bytes,
            modified_at,
            None,
            &descriptor_kind,
            "too_large",
            "metadata_only",
            None,
            Some(format!("file exceeds {} bytes", MAX_INDEXED_TEXT_BYTES)),
        );
    }

    match read_indexable_text_file(&canonical, extension.as_deref()) {
        Ok(text) => {
            let text_hash = stable_text_hash(&text);
            let source = db::upsert_source_document(
                conn,
                "indexed_file",
                &canonical_path,
                Some(&name),
                &metadata_json_for_indexed_file(
                    &canonical_path,
                    extension.as_deref(),
                    &descriptor_kind,
                    size_bytes,
                    modified_at.as_deref(),
                    "ok",
                    "indexed",
                    Some(&text_hash),
                    Some(&text),
                )?,
            )?;
            let chunks = chunk_indexed_text(&text);
            db::replace_source_chunks(conn, &source.id, &chunks)?;
            indexed_file_input(
                folder_id,
                canonical_path.clone(),
                Some(canonical_path),
                name,
                extension,
                size_bytes,
                modified_at,
                Some(source.id),
                &descriptor_kind,
                "ok",
                "indexed",
                Some(text),
                None,
            )
        }
        Err(error) => indexed_file_input(
            folder_id,
            canonical_path.clone(),
            Some(canonical_path),
            name,
            extension,
            size_bytes,
            modified_at,
            None,
            &descriptor_kind,
            error
                .downcast_ref::<std::io::Error>()
                .map(io_read_status)
                .unwrap_or("failed"),
            "partial",
            None,
            Some(error.to_string()),
        ),
    }
}

const MAX_INDEXED_TEXT_BYTES: u64 = 2 * 1024 * 1024;
const INDEXED_FILE_PREVIEW_CHARS: usize = 4000;

fn indexed_file_input(
    folder_id: &str,
    path: String,
    canonical_path: Option<String>,
    name: String,
    extension: Option<String>,
    size_bytes: Option<i64>,
    modified_at: Option<String>,
    source_id: Option<String>,
    descriptor_kind: &str,
    read_status: &str,
    index_status: &str,
    text: Option<String>,
    last_error: Option<String>,
) -> anyhow::Result<db::UpsertIndexedFileInput> {
    let text_hash = text.as_deref().map(stable_text_hash);
    let preview_text = text.as_deref().map(indexed_file_preview);
    let extracted_chars = preview_text
        .as_ref()
        .map(|value| value.chars().count().min(i64::MAX as usize) as i64);
    let total_chars = text
        .as_ref()
        .map(|value| value.chars().count().min(i64::MAX as usize) as i64);
    Ok(db::UpsertIndexedFileInput {
        folder_id: folder_id.to_string(),
        path: path.clone(),
        canonical_path,
        name,
        extension: extension.clone(),
        size_bytes,
        modified_at: modified_at.clone(),
        source_id,
        descriptor_kind: descriptor_kind.to_string(),
        read_status: read_status.to_string(),
        index_status: index_status.to_string(),
        metadata_json: metadata_json_for_indexed_file(
            &path,
            extension.as_deref(),
            descriptor_kind,
            size_bytes,
            modified_at.as_deref(),
            read_status,
            index_status,
            text_hash.as_deref(),
            text.as_deref(),
        )?,
        preview_text,
        text_hash,
        extracted_chars,
        total_chars,
        last_error,
    })
}

fn metadata_json_for_indexed_file(
    path: &str,
    extension: Option<&str>,
    descriptor_kind: &str,
    size_bytes: Option<i64>,
    modified_at: Option<&str>,
    read_status: &str,
    index_status: &str,
    text_hash: Option<&str>,
    text: Option<&str>,
) -> anyhow::Result<String> {
    let markdown = if matches!(extension, Some("md" | "markdown")) {
        text.map(markdown_metadata)
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    Ok(serde_json::to_string(&serde_json::json!({
        "kind": "indexed_file",
        "path": path,
        "extension": extension,
        "descriptorKind": descriptor_kind,
        "sizeBytes": size_bytes,
        "modifiedAt": modified_at,
        "readStatus": read_status,
        "indexStatus": index_status,
        "textHash": text_hash,
        "markdown": markdown
    }))?)
}

fn markdown_metadata(text: &str) -> serde_json::Value {
    let mut headings = Vec::new();
    let mut tags = Vec::new();
    let mut wikilinks = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if headings.len() < 40 && trimmed.starts_with('#') {
            let level = trimmed.chars().take_while(|ch| *ch == '#').count();
            if (1..=6).contains(&level) {
                let title = trimmed[level..].trim();
                if !title.is_empty() {
                    headings.push(serde_json::json!({ "level": level, "title": title }));
                }
            }
        }
        collect_markdown_tags(trimmed, &mut tags);
        collect_wikilinks(trimmed, &mut wikilinks);
    }
    serde_json::json!({
        "headings": headings,
        "tags": tags,
        "wikilinks": wikilinks
    })
}

fn collect_markdown_tags(line: &str, tags: &mut Vec<String>) {
    for token in line.split_whitespace() {
        let tag = token
            .trim_matches(|ch: char| {
                ch == ',' || ch == '.' || ch == ';' || ch == ':' || ch == ')' || ch == ']'
            })
            .strip_prefix('#');
        let Some(tag) = tag else {
            continue;
        };
        if tag.is_empty()
            || tag.chars().all(|ch| ch == '#')
            || tag.chars().next().is_some_and(|ch| ch.is_ascii_digit())
        {
            continue;
        }
        if !tags.iter().any(|existing| existing == tag) {
            tags.push(tag.to_string());
        }
    }
}

fn collect_wikilinks(line: &str, links: &mut Vec<String>) {
    let mut rest = line;
    while let Some(start) = rest.find("[[") {
        let after_start = &rest[start + 2..];
        let Some(end) = after_start.find("]]") else {
            break;
        };
        let link = after_start[..end].trim();
        if !link.is_empty() && !links.iter().any(|existing| existing == link) {
            links.push(link.to_string());
        }
        rest = &after_start[end + 2..];
    }
}

fn indexed_file_preview(text: &str) -> String {
    text.chars().take(INDEXED_FILE_PREVIEW_CHARS).collect()
}

fn stable_text_hash(text: &str) -> String {
    db::stable_text_hash(text)
}

fn descriptor_kind_for_extension(extension: Option<&str>) -> &'static str {
    match extension.unwrap_or_default() {
        "md" | "markdown" => "markdown",
        "txt" | "rst" => "text",
        "html" | "htm" => "html",
        "json" => "json",
        "csv" => "csv",
        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "java" | "cs" | "cpp" | "c" | "h"
        | "css" | "toml" | "yaml" | "yml" => "code",
        "pdf" => "pdf",
        "epub" => "epub",
        "docx" | "doc" | "odt" => "docx",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" => "image",
        "zip" | "gz" | "tar" | "7z" | "exe" | "dll" | "bin" => "binary",
        _ => "unsupported",
    }
}

fn io_read_status(error: &std::io::Error) -> &'static str {
    match error.kind() {
        std::io::ErrorKind::NotFound => "missing",
        std::io::ErrorKind::PermissionDenied => "permission_denied",
        _ => "failed",
    }
}

fn is_text_index_extension(extension: &str) -> bool {
    matches!(
        extension,
        "txt"
            | "md"
            | "markdown"
            | "rst"
            | "csv"
            | "json"
            | "html"
            | "htm"
            | "rs"
            | "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "py"
            | "go"
            | "java"
            | "cs"
            | "cpp"
            | "c"
            | "h"
            | "css"
            | "toml"
            | "yaml"
            | "yml"
    )
}

fn read_indexable_text_file(path: &Path, extension: Option<&str>) -> anyhow::Result<String> {
    match extension {
        Some("txt" | "md" | "markdown" | "rst" | "csv" | "html" | "htm") => {
            crate::parsers::parse_document(path)
        }
        Some(
            "json" | "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "java" | "cs" | "cpp" | "c"
            | "h" | "css" | "toml" | "yaml" | "yml",
        ) => fs::read_to_string(path)
            .with_context(|| format!("failed to read indexed text file {}", path.display())),
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
    let stem = if cleaned.is_empty() {
        id.to_string()
    } else {
        cleaned
    };
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
            out.push_str(&format!(
                "\n- [{}]({}) - {}\n",
                source.title.as_deref().unwrap_or("Source"),
                source.url,
                source.stance
            ));
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
        out.push_str(&format!(
            "\n- {} `{}`\n  - File: {}\n",
            item.generated_at, item.id, item.file_path
        ));
    }
    out
}

fn mirror_index_markdown(counts: &MirrorManifestCounts) -> String {
    format!(
        "# Thepoint Mirror\n\n- Sources: {}\n- Evidence: {}\n- Reports: {}\n- Investigations: {}\n- Journal: {}\n- Gallery: {}\n",
        counts.sources,
        counts.evidence,
        counts.reports,
        counts.investigations,
        counts.journal,
        counts.gallery
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
pub async fn search_points(
    app: tauri::AppHandle<Wry>,
    query: String,
) -> Result<Vec<StoredPoint>, String> {
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
    tokio::task::spawn_blocking(
        move || -> anyhow::Result<Option<db::SourceWorkspaceRecord>> {
            let conn = db::open_db(&path)?;
            db::get_source_workspace(&conn, &source_id)
        },
    )
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
    use std::io::Write;

    struct TempFixture {
        path: PathBuf,
    }

    impl TempFixture {
        fn new(prefix: &str) -> Self {
            let mut path = std::env::temp_dir();
            path.push(format!("{prefix}-{}", uuid::Uuid::new_v4()));
            fs::create_dir_all(&path).unwrap();
            Self { path }
        }

        fn join(&self, name: &str) -> PathBuf {
            self.path.join(name)
        }
    }

    impl Drop for TempFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

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
        assert_eq!(
            infer_fact_check_verdict("公开数据支持该说法，结论基本属实。"),
            "supported"
        );
        assert_eq!(
            infer_fact_check_verdict("该说法与事实不符，关键数据是错误的。"),
            "contradicted"
        );
        assert_eq!(
            infer_fact_check_verdict("该说法部分准确，但一部分缺少背景。"),
            "mixed"
        );
        assert_eq!(
            infer_fact_check_verdict("目前无法证实该说法，需要更多来源。"),
            "uncertain"
        );
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
            invocation_id: Some("invocation-1".to_string()),
        };

        let report = report_command_input_to_db(input);

        assert_eq!(report.title, "Digest Title");
        assert_eq!(report.kind, "digest");
        assert_eq!(report.source_name.as_deref(), Some("知识研报"));
        assert_eq!(report.body_md, "# Digest Title");
        assert_eq!(report.summary, "Digest summary");
        assert_eq!(report.citations_json, "[]");
    }

    fn citation_input(kind: &str, id: &str, quote: Option<&str>) -> CitationLocatorInput {
        CitationLocatorInput {
            kind: kind.to_string(),
            id: id.to_string(),
            quote: quote.map(str::to_string),
            excerpt: None,
            source_id: None,
            chunk_index: None,
            source_text_hash: None,
        }
    }

    fn source_with_chunks(
        conn: &mut Connection,
        title: &str,
        chunks: &[&str],
    ) -> db::SourceDocumentRecord {
        let source = db::upsert_source_document(
            conn,
            "test",
            &format!("test://{}", title.replace(' ', "-").to_lowercase()),
            Some(title),
            r#"{"kind":"test"}"#,
        )
        .unwrap();
        let chunks = chunks
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>();
        db::replace_source_chunks(conn, &source.id, &chunks).unwrap();
        source
    }

    fn point_with_content(conn: &mut Connection, content: &str) -> StoredPoint {
        db::save_child_points(
            conn,
            None,
            "citation_test",
            None,
            &[(content.to_string(), "测试观点".to_string())],
        )
        .unwrap()
        .remove(0)
    }

    fn evidence_with_text(conn: &mut Connection, claim: &str) -> db::EvidenceRecord {
        db::save_evidence(
            conn,
            db::SaveEvidenceInput {
                claim: claim.to_string(),
                verdict: "supported".to_string(),
                answer: "Evidence answer contains audit quote.".to_string(),
                reasoning: Some("Evidence reasoning gives context.".to_string()),
                context: Some("Evidence context has background.".to_string()),
                point_id: None,
                source_id: None,
                chunk_index: None,
                checked_at: Some("2026-07-06T00:00:00Z".to_string()),
                sources: vec![db::SaveEvidenceSourceInput {
                    title: Some("Evidence source".to_string()),
                    url: "https://example.com/evidence".to_string(),
                    snippet: Some("External source snippet includes audit quote.".to_string()),
                    stance: "support".to_string(),
                }],
            },
        )
        .unwrap()
    }

    #[test]
    fn locate_citation_quote_finds_single_source_span_and_hash() {
        let db_dir = TempFixture::new("thepoint-citation-source");
        let db_path = db_dir.join("library.db");
        let mut conn = db::open_db(&db_path).unwrap();
        let source = source_with_chunks(&mut conn, "Source One", &["alpha unique quote beta"]);

        let mut input = citation_input("source", &source.id, Some("unique quote"));
        input.chunk_index = Some(0);
        let result = locate_citation_quote_in_db(&conn, &input).unwrap();

        assert_eq!(result.status, "located");
        assert_eq!(result.target_kind, "source");
        assert_eq!(result.target_id, source.id);
        assert_eq!(result.target_title.as_deref(), Some("Source One"));
        assert_eq!(result.match_count, 1);
        assert_eq!(result.locations[0].start, 6);
        assert_eq!(result.locations[0].end, 18);
        assert_eq!(
            result.source_text_hash.as_deref(),
            Some(stable_text_hash("alpha unique quote beta").as_str())
        );
    }

    #[test]
    fn locate_citation_quote_reports_multiple_point_matches() {
        let db_dir = TempFixture::new("thepoint-citation-point");
        let db_path = db_dir.join("library.db");
        let mut conn = db::open_db(&db_path).unwrap();
        let point = point_with_content(
            &mut conn,
            "repeat quote appears, then repeat quote appears again.",
        );

        let result = locate_citation_quote_in_db(
            &conn,
            &citation_input("point", &point.id, Some("repeat quote")),
        )
        .unwrap();

        assert_eq!(result.status, "multiple_matches");
        assert_eq!(result.target_kind, "point");
        assert_eq!(result.target_id, point.id);
        assert_eq!(result.match_count, 2);
        assert_eq!(result.locations.len(), 2);
    }

    #[test]
    fn locate_citation_quote_reports_not_found_stale_missing_and_not_applicable() {
        let db_dir = TempFixture::new("thepoint-citation-statuses");
        let db_path = db_dir.join("library.db");
        let mut conn = db::open_db(&db_path).unwrap();
        let source = source_with_chunks(
            &mut conn,
            "Status Source",
            &["current source text with stable quote"],
        );

        let not_found = locate_citation_quote_in_db(
            &conn,
            &citation_input("source", &source.id, Some("absent quote")),
        )
        .unwrap();
        assert_eq!(not_found.status, "not_found");
        assert_eq!(not_found.match_count, 0);

        let mut stale_input = citation_input("source", &source.id, Some("stable quote"));
        stale_input.source_text_hash = Some("fnv1a64:0000000000000000".to_string());
        let stale = locate_citation_quote_in_db(&conn, &stale_input).unwrap();
        assert_eq!(stale.status, "stale");
        assert_eq!(stale.match_count, 1);
        assert_ne!(
            stale.source_text_hash.as_deref(),
            Some("fnv1a64:0000000000000000")
        );

        let missing = locate_citation_quote_in_db(
            &conn,
            &citation_input("source", "missing-source", Some("quote")),
        )
        .unwrap();
        assert_eq!(missing.status, "target_missing");
        assert_eq!(missing.match_count, 0);

        let not_applicable =
            locate_citation_quote_in_db(&conn, &citation_input("source", &source.id, None))
                .unwrap();
        assert_eq!(not_applicable.status, "not_applicable");
        assert_eq!(not_applicable.match_count, 0);
    }

    #[test]
    fn locate_citation_quote_falls_back_to_excerpt_and_scans_evidence_text() {
        let db_dir = TempFixture::new("thepoint-citation-evidence");
        let db_path = db_dir.join("library.db");
        let mut conn = db::open_db(&db_path).unwrap();
        let evidence = evidence_with_text(&mut conn, "Evidence claim");
        let mut input = citation_input("evidence", &evidence.id, None);
        input.excerpt = Some("audit quote".to_string());

        let result = locate_citation_quote_in_db(&conn, &input).unwrap();

        assert_eq!(result.status, "multiple_matches");
        assert_eq!(result.target_kind, "evidence");
        assert_eq!(result.target_title.as_deref(), Some("Evidence claim"));
        assert_eq!(result.match_count, 2);
    }

    #[test]
    fn report_citation_audit_counts_locator_statuses_for_saved_report() {
        let db_dir = TempFixture::new("thepoint-citation-audit");
        let db_path = db_dir.join("library.db");
        let mut conn = db::open_db(&db_path).unwrap();
        let source = source_with_chunks(
            &mut conn,
            "Audit Source",
            &["unique audit quote", "stale audit quote"],
        );
        let point = point_with_content(
            &mut conn,
            "repeat audit appears and repeat audit appears again",
        );
        let evidence = evidence_with_text(&mut conn, "Audit evidence claim");
        let citations_json = serde_json::to_string(&serde_json::json!([
            {
                "kind": "source",
                "label": "S1",
                "id": source.id,
                "title": "Audit Source",
                "excerpt": "unique audit quote",
                "sourceId": source.id,
                "chunkIndex": 0
            },
            {
                "kind": "point",
                "label": "P1",
                "id": point.id,
                "title": "Audit Point",
                "quote": "repeat audit"
            },
            {
                "kind": "evidence",
                "label": "E1",
                "id": evidence.id,
                "title": "Audit Evidence",
                "quote": "absent evidence quote"
            },
            {
                "kind": "source",
                "label": "S2",
                "id": source.id,
                "title": "Stale Source",
                "quote": "stale audit quote",
                "sourceTextHash": "fnv1a64:0000000000000000"
            },
            {
                "kind": "source",
                "label": "S3",
                "id": "missing-source",
                "title": "Missing Source",
                "quote": "missing quote"
            },
            {
                "kind": "source",
                "label": "S4",
                "id": source.id,
                "title": "No Quote"
            }
        ]))
        .unwrap();
        let report = db::save_report(
            &conn,
            db::SaveReportInput {
                title: "Audit Report".to_string(),
                kind: "digest".to_string(),
                source_name: Some("Audit".to_string()),
                body_md: "# Audit Report".to_string(),
                summary: "Audit summary".to_string(),
                citations_json,
            },
        )
        .unwrap();

        let audit = build_report_citation_audit(&conn, &report).unwrap();

        assert_eq!(audit.report_id, report.id);
        assert_eq!(audit.total, 6);
        assert_eq!(audit.located_count, 1);
        assert_eq!(audit.multiple_matches_count, 1);
        assert_eq!(audit.not_found_count, 1);
        assert_eq!(audit.stale_count, 1);
        assert_eq!(audit.target_missing_count, 1);
        assert_eq!(audit.not_applicable_count, 1);
        assert_eq!(audit.citations[0].locator.status, "located");
        assert_eq!(audit.citations[1].locator.status, "multiple_matches");
        assert_eq!(audit.citations[2].locator.status, "not_found");
        assert_eq!(audit.citations[3].locator.status, "stale");
        assert_eq!(audit.citations[4].locator.status, "target_missing");
        assert_eq!(audit.citations[5].locator.status, "not_applicable");
    }

    #[test]
    fn persisted_report_audit_saves_locator_rows_and_claim_shells() {
        let db_dir = TempFixture::new("thepoint-persisted-report-audit");
        let db_path = db_dir.join("library.db");
        let mut conn = db::open_db(&db_path).unwrap();
        let source = source_with_chunks(
            &mut conn,
            "Persisted Source",
            &["alpha persisted quote beta"],
        );
        let point = point_with_content(&mut conn, "repeat persisted appears twice: repeat persisted.");
        let citations_json = serde_json::to_string(&serde_json::json!([
            {
                "kind": "source",
                "label": "S1",
                "id": source.id,
                "title": "Persisted Source",
                "quote": "persisted quote",
                "reason": "source supports the claim",
                "sourceId": source.id,
                "chunkIndex": 0
            },
            {
                "kind": "point",
                "label": "P1",
                "id": point.id,
                "title": "Persisted Point",
                "quote": "repeat persisted"
            }
        ]))
        .unwrap();
        let report = db::save_report(
            &conn,
            db::SaveReportInput {
                title: "Persisted Audit Report".to_string(),
                kind: "digest".to_string(),
                source_name: Some("Audit".to_string()),
                body_md: "# Persisted Audit\n\nThe source claim is durable [S1].\n\nThe point repeats [P1].\n\nThis inferred claim has no label.".to_string(),
                summary: "Audit summary".to_string(),
                citations_json,
            },
        )
        .unwrap();

        let audit = save_persisted_report_audit(&conn, &report).unwrap();

        assert_eq!(audit.report_id, report.id);
        assert_eq!(audit.claims.len(), 3);
        assert_eq!(audit.claims[0].claim_status, "cited");
        assert_eq!(audit.claims[0].citation_labels, vec!["S1"]);
        assert_eq!(audit.claims[2].claim_status, "inferred");
        assert_eq!(audit.citations.len(), 2);
        assert_eq!(audit.citations[0].locator_status, "located");
        assert_eq!(audit.citations[0].span_start, Some(6));
        assert_eq!(audit.citations[0].span_end, Some(21));
        assert_eq!(
            audit.citations[0].source_text_hash.as_deref(),
            Some(stable_text_hash("alpha persisted quote beta").as_str())
        );
        assert_eq!(
            audit.citations[0].reason.as_deref(),
            Some("source supports the claim")
        );
        assert_eq!(audit.citations[1].locator_status, "multiple_matches");
        assert_eq!(audit.citations[1].match_count, 2);
        assert_eq!(audit.coverage.total_claims, 3);
        assert_eq!(audit.coverage.cited_claims, 2);
        assert_eq!(audit.coverage.inferred_claims, 1);
        assert_eq!(audit.coverage.total_citations, 2);
        assert_eq!(audit.coverage.located_citations, 1);
        assert_eq!(audit.coverage.warning_citations, 1);

        let loaded = db::load_report_audit(&conn, &report.id).unwrap().unwrap();
        assert_eq!(loaded.citations[0].locator_status, "located");
        assert_eq!(loaded.claims[1].citation_labels, vec!["P1"]);
    }

    fn source_only_mirror_config(root: &Path) -> db::OpenDataMirrorConfig {
        db::OpenDataMirrorConfig {
            enabled: true,
            root_path: Some(root.to_string_lossy().to_string()),
            export_sources: true,
            export_evidence: false,
            export_reports: false,
            export_journal: false,
            export_gallery_index: false,
        }
    }

    #[test]
    fn open_data_mirror_plan_export_and_prune_lifecycle() {
        let db_dir = TempFixture::new("thepoint-mirror-db");
        let mirror = TempFixture::new("thepoint-mirror-root");
        let db_path = db_dir.join("library.db");
        let conn = db::open_db(&db_path).unwrap();
        db::set_open_data_mirror_config(&conn, source_only_mirror_config(&mirror.path)).unwrap();
        let source = db::upsert_source_document(
            &conn,
            "test",
            "test://mirror-source",
            Some("Mirror Source"),
            r#"{}"#,
        )
        .unwrap();

        let first_plan = build_open_data_mirror_plan_blocking(db_path.clone()).unwrap();
        assert_eq!(first_plan.counts.sources, 1);
        assert_eq!(first_plan.to_write.len(), 1);
        assert_eq!(first_plan.to_write[0].action, "write");
        assert!(first_plan.unchanged.is_empty());
        assert!(first_plan.stale.is_empty());
        assert!(first_plan.to_prune.is_empty());

        let first_path = first_plan.to_write[0].path.clone();
        let export = export_open_data_mirror_blocking(db_path.clone()).unwrap();
        assert_eq!(export.files_written, 3);
        assert_eq!(export.manifest.version, 2);
        assert_eq!(export.manifest.assets.len(), 1);
        assert!(mirror.join(&first_path).exists());

        let unchanged = build_open_data_mirror_plan_blocking(db_path.clone()).unwrap();
        assert_eq!(unchanged.unchanged.len(), 1);
        assert_eq!(unchanged.unchanged[0].path, first_path);
        assert!(unchanged.to_write.is_empty());
        assert!(unchanged.stale.is_empty());
        assert!(unchanged.to_prune.is_empty());

        let renamed = db::upsert_source_document(
            &conn,
            "test",
            "test://mirror-source",
            Some("Renamed Source"),
            r#"{}"#,
        )
        .unwrap();
        assert_eq!(renamed.id, source.id);

        let rename_plan = build_open_data_mirror_plan_blocking(db_path.clone()).unwrap();
        assert_eq!(rename_plan.to_write.len(), 1);
        assert_eq!(rename_plan.to_prune.len(), 1);
        assert_eq!(rename_plan.to_prune[0].path, first_path);
        assert!(mirror.join(&first_path).exists());

        let renamed_export = export_open_data_mirror_blocking(db_path.clone()).unwrap();
        assert_eq!(renamed_export.manifest.assets.len(), 1);
        assert_eq!(renamed_export.manifest.stale.len(), 1);
        let renamed_path = renamed_export.manifest.assets[0].path.clone();
        assert_ne!(renamed_path, first_path);
        assert!(mirror.join(&renamed_path).exists());
        assert!(mirror.join(&first_path).exists());

        let prune = prune_open_data_mirror_blocking(db_path).unwrap();
        assert_eq!(prune.files_deleted, 1);
        assert_eq!(prune.pruned.len(), 1);
        assert_eq!(prune.pruned[0].path, first_path);
        assert!(!mirror.join(&first_path).exists());
        let manifest = prune.manifest.unwrap();
        assert!(manifest.stale.is_empty());
        assert_eq!(manifest.assets.len(), 1);
        assert_eq!(manifest.assets[0].path, renamed_path);
    }

    #[test]
    fn open_data_mirror_plan_marks_disabled_manifest_assets_for_prune() {
        let db_dir = TempFixture::new("thepoint-mirror-disabled-db");
        let mirror = TempFixture::new("thepoint-mirror-disabled-root");
        let db_path = db_dir.join("library.db");
        let conn = db::open_db(&db_path).unwrap();
        let mut config = source_only_mirror_config(&mirror.path);
        db::set_open_data_mirror_config(&conn, config.clone()).unwrap();
        db::upsert_source_document(
            &conn,
            "test",
            "test://disabled-source",
            Some("Disabled Source"),
            r#"{}"#,
        )
        .unwrap();
        let export = export_open_data_mirror_blocking(db_path.clone()).unwrap();
        let exported_path = export.manifest.assets[0].path.clone();

        config.export_sources = false;
        db::set_open_data_mirror_config(&conn, config).unwrap();
        let plan = build_open_data_mirror_plan_blocking(db_path).unwrap();
        assert_eq!(plan.counts.sources, 0);
        assert!(plan.to_write.is_empty());
        assert_eq!(plan.to_prune.len(), 1);
        assert_eq!(plan.to_prune[0].path, exported_path);
        assert_eq!(plan.to_prune[0].action, "prune");
    }

    #[test]
    fn open_data_mirror_manifest_v1_loads_counts_without_assets() {
        let db_dir = TempFixture::new("thepoint-mirror-v1-db");
        let mirror = TempFixture::new("thepoint-mirror-v1-root");
        fs::write(
            mirror.join("manifest.json"),
            r#"{
              "version": 1,
              "exportedAt": "2026-07-06T00:00:00Z",
              "counts": {
                "sources": 2,
                "evidence": 1,
                "reports": 3,
                "investigations": 4,
                "journal": 5,
                "gallery": 6
              }
            }"#,
        )
        .unwrap();
        let db_path = db_dir.join("library.db");
        let conn = db::open_db(&db_path).unwrap();
        db::set_open_data_mirror_config(&conn, source_only_mirror_config(&mirror.path)).unwrap();

        let manifest = load_open_data_mirror_manifest_blocking(db_path)
            .unwrap()
            .unwrap();

        assert_eq!(manifest.version, 1);
        assert_eq!(
            manifest.generated_at.as_deref(),
            Some("2026-07-06T00:00:00Z")
        );
        assert!(manifest.assets.is_empty());
        let counts = manifest.counts.unwrap();
        assert_eq!(counts.sources, 2);
        assert_eq!(counts.evidence, 1);
        assert_eq!(counts.reports, 3);
        assert_eq!(counts.investigations, 4);
        assert_eq!(counts.journal, 5);
        assert_eq!(counts.gallery, 6);
    }

    #[test]
    fn scan_indexed_folder_records_descriptor_preview_partial_unsupported_and_missing() {
        let db_dir = TempFixture::new("thepoint-index-db");
        let root = TempFixture::new("thepoint-index-root");
        fs::write(
            root.join("note.md"),
            "# Heading\n\nBody with #tag and [[Link]].",
        )
        .unwrap();
        fs::write(root.join("image.png"), [1_u8, 2, 3, 4]).unwrap();
        let mut invalid = fs::File::create(root.join("bad.txt")).unwrap();
        invalid.write_all(&[0xff, 0xfe, 0xfd]).unwrap();

        let db_path = db_dir.join("library.db");
        let conn = db::open_db(&db_path).unwrap();
        let folder = db::add_indexed_folder(&conn, root.path.to_str().unwrap()).unwrap();
        drop(conn);

        let result = scan_indexed_folder_blocking(db_path.clone(), folder.id.clone()).unwrap();
        assert_eq!(result.indexed_count, 1);
        assert_eq!(result.metadata_only_count, 2);

        let markdown = result
            .files
            .iter()
            .find(|file| file.name == "note.md")
            .unwrap();
        assert_eq!(markdown.descriptor_kind, "markdown");
        assert_eq!(markdown.read_status, "ok");
        assert_eq!(markdown.index_status, "indexed");
        assert!(markdown
            .preview_text
            .as_deref()
            .unwrap()
            .contains("Body with #tag"));
        assert!(markdown
            .text_hash
            .as_deref()
            .unwrap()
            .starts_with("fnv1a64:"));
        assert!(markdown.metadata_json.contains("\"title\":\"Heading\""));
        assert!(markdown.metadata_json.contains("\"tags\":[\"tag\"]"));
        assert!(markdown.metadata_json.contains("\"wikilinks\":[\"Link\"]"));

        let unsupported = result
            .files
            .iter()
            .find(|file| file.name == "image.png")
            .unwrap();
        assert_eq!(unsupported.descriptor_kind, "image");
        assert_eq!(unsupported.read_status, "unsupported");
        assert_eq!(unsupported.index_status, "metadata_only");
        assert!(unsupported.preview_text.is_none());

        let partial = result
            .files
            .iter()
            .find(|file| file.name == "bad.txt")
            .unwrap();
        assert_eq!(partial.descriptor_kind, "text");
        assert_eq!(partial.index_status, "partial");
        assert!(partial
            .last_error
            .as_deref()
            .is_some_and(|value| !value.is_empty()));

        fs::remove_file(root.join("note.md")).unwrap();
        let second = scan_indexed_folder_blocking(db_path, folder.id).unwrap();
        let missing = second
            .files
            .iter()
            .find(|file| file.name == "note.md")
            .unwrap();
        assert_eq!(missing.read_status, "missing");
        assert_eq!(missing.index_status, "stale");
        assert!(missing.last_error.as_deref().unwrap().contains("missing"));
    }
}
