use rusqlite::Connection;
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
}
