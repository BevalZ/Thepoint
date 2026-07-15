use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex, OnceLock,
    },
};

use anyhow::{bail, Context, Result};
use chrono::Utc;
use tauri::{AppHandle, Manager, Wry};

use crate::db;

use super::{
    provider::{embed_local, embed_remote},
    retrieval::{keyword_search, reciprocal_rank_fusion, semantic_search},
    storage::{self, normalize_vector},
    types::*,
};

const PROMPT_VERSION: &str = "grounded-research-qa.v1";
const MIN_CONTEXT_CHARS: usize = 80;
static CANCEL_REBUILD: AtomicBool = AtomicBool::new(false);
static REBUILD_ACTIVE: AtomicBool = AtomicBool::new(false);
static LIVE_STATUS: OnceLock<Mutex<Option<SemanticIndexStatus>>> = OnceLock::new();

fn live_status() -> &'static Mutex<Option<SemanticIndexStatus>> {
    LIVE_STATUS.get_or_init(|| Mutex::new(None))
}

struct RebuildGuard;

impl RebuildGuard {
    fn acquire() -> Result<Self> {
        REBUILD_ACTIVE
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map(|_| Self)
            .map_err(|_| anyhow::anyhow!("semantic index rebuild is already running"))
    }
}

impl Drop for RebuildGuard {
    fn drop(&mut self) {
        REBUILD_ACTIVE.store(false, Ordering::SeqCst);
        if let Ok(mut live) = live_status().lock() {
            if let Some(status) = live.as_mut().filter(|status| status.cancellable) {
                status.phase = "failed".to_string();
                status.cancellable = false;
                status
                    .last_error
                    .get_or_insert_with(|| "semantic index rebuild aborted".to_string());
                status.updated_at = Some(Utc::now().to_rfc3339());
            }
        }
    }
}

fn cache_dir(app: &AppHandle<Wry>) -> Result<PathBuf> {
    let path = app.path().app_data_dir()?.join("models").join("fastembed");
    fs::create_dir_all(&path)?;
    Ok(path)
}

fn model_cached(path: &Path) -> bool {
    fn contains_file(root: &Path, name: &str, minimum_bytes: u64) -> bool {
        let Ok(entries) = fs::read_dir(root) else {
            return false;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && contains_file(&path, name, minimum_bytes) {
                return true;
            }
            if path.file_name().and_then(|value| value.to_str()) == Some(name)
                && entry
                    .metadata()
                    .map(|meta| meta.len() >= minimum_bytes)
                    .unwrap_or(false)
            {
                return true;
            }
        }
        false
    }
    contains_file(path, "model.onnx", 1_000_000) && contains_file(path, "tokenizer.json", 1_000)
}

fn embedding_error_message(error: &anyhow::Error) -> String {
    let details = format!("{error:#}");
    let normalized = details.to_ascii_lowercase();
    if normalized.contains("connection refused")
        || normalized.contains("timed out")
        || normalized.contains("dns")
        || normalized.contains("offline")
    {
        format!("无法访问 embedding 模型服务；请检查网络/代理后重试。详情：{details}")
    } else {
        details
    }
}

#[tauri::command]
pub async fn get_semantic_index_status(
    app: AppHandle<Wry>,
    provider: Option<EmbeddingProviderConfig>,
) -> Result<SemanticIndexStatus, String> {
    if let Some(status) = live_status().lock().map_err(|e| e.to_string())?.clone() {
        if status.cancellable {
            return Ok(status);
        }
    }
    let provider = provider.unwrap_or_default();
    let model_key = provider.model_key();
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    let cached =
        provider.kind == "remote" || model_cached(&cache_dir(&app).map_err(|e| e.to_string())?);
    tokio::task::spawn_blocking(move || -> Result<SemanticIndexStatus> {
        let conn = db::open_db(&path)?;
        let mut status = storage::index_status(&conn, &model_key)?;
        status.model_cached = cached;
        Ok(status)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cancel_semantic_index_rebuild() -> bool {
    if REBUILD_ACTIVE.load(Ordering::SeqCst) {
        CANCEL_REBUILD.store(true, Ordering::SeqCst);
        true
    } else {
        false
    }
}

#[tauri::command]
pub async fn rebuild_semantic_index(
    app: AppHandle<Wry>,
    input: RebuildSemanticIndexInput,
) -> Result<SemanticIndexStatus, String> {
    let _guard = RebuildGuard::acquire().map_err(|e| e.to_string())?;
    CANCEL_REBUILD.store(false, Ordering::SeqCst);
    let model_key = input.provider.model_key();
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    let cache = cache_dir(&app).map_err(|e| e.to_string())?;
    let mut provider = input.provider.clone();
    if provider.kind == "remote" && provider.api_key.as_deref().unwrap_or_default().is_empty() {
        provider.api_key = get_secret("semantic_embedding_api_key");
    }
    let provider_kind = provider.kind.clone();
    let source_id = input.source_id.clone();
    let (pending, initial_status) = tokio::task::spawn_blocking({
        let path = path.clone();
        let model_key = model_key.clone();
        let provider_kind = provider_kind.clone();
        move || -> Result<(Vec<storage::PendingChunk>, SemanticIndexStatus)> {
            let conn = db::open_db(&path)?;
            storage::save_meta(&conn, &model_key, &provider_kind, 0, "preparing", None)?;
            Ok((
                storage::pending_chunks(&conn, &model_key, source_id.as_deref())?,
                storage::index_status(&conn, &model_key)?,
            ))
        }
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    let total_pending = pending.len() as i64;
    let mut progress = SemanticIndexStatus {
        model_key: model_key.clone(),
        phase: if provider.kind == "local" && !model_cached(&cache) {
            "downloading".into()
        } else {
            "indexing".into()
        },
        total: initial_status.total,
        ready: initial_status.ready,
        pending: total_pending,
        stale: initial_status.stale,
        failed: initial_status.failed,
        cancellable: true,
        model_cached: provider.kind == "remote" || model_cached(&cache),
        ..Default::default()
    };
    *live_status().lock().map_err(|e| e.to_string())? = Some(progress.clone());

    for batch in pending.chunks(32) {
        if CANCEL_REBUILD.load(Ordering::SeqCst) {
            progress.phase = "cancelled".into();
            progress.cancellable = false;
            *live_status().lock().map_err(|e| e.to_string())? = Some(progress.clone());
            return Ok(progress);
        }
        let texts = batch
            .iter()
            .map(|chunk| format!("passage: {}", chunk.text))
            .collect::<Vec<_>>();
        let embedded = if provider.kind == "remote" {
            embed_remote(&provider, texts).await
        } else {
            let cache = cache.clone();
            tokio::task::spawn_blocking(move || embed_local(texts, cache))
                .await
                .map_err(|e| e.to_string())?
        };
        match embedded {
            Ok(vectors) => {
                if vectors.len() != batch.len() {
                    return Err("embedding provider returned an unexpected vector count".into());
                }
                let path = path.clone();
                let model_key = model_key.clone();
                let batch = batch.to_vec();
                let batch_len = batch.len() as i64;
                let dimension = vectors.first().map(Vec::len).unwrap_or_default();
                let provider_kind = provider_kind.clone();
                tokio::task::spawn_blocking(move || -> Result<()> {
                    let conn = db::open_db(&path)?;
                    for (chunk, vector) in batch.iter().zip(vectors.iter()) {
                        storage::save_embedding(&conn, chunk, &model_key, vector)?;
                    }
                    storage::save_meta(
                        &conn,
                        &model_key,
                        &provider_kind,
                        dimension,
                        "indexing",
                        None,
                    )
                })
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?;
                progress.ready += batch_len;
            }
            Err(error) => {
                let message = embedding_error_message(&error);
                let path = path.clone();
                let model_key = model_key.clone();
                let batch = batch.to_vec();
                let batch_len = batch.len() as i64;
                let error_copy = message.clone();
                let provider_kind = provider_kind.clone();
                tokio::task::spawn_blocking(move || -> Result<()> {
                    let conn = db::open_db(&path)?;
                    for chunk in &batch {
                        storage::save_embedding_failure(&conn, chunk, &model_key, &error_copy)?;
                    }
                    storage::save_meta(
                        &conn,
                        &model_key,
                        &provider_kind,
                        0,
                        "failed",
                        Some(&error_copy),
                    )
                })
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?;
                progress.failed += batch_len;
                progress.last_error = Some(message);
            }
        }
        progress.processed += batch.len() as i64;
        progress.pending = total_pending - progress.processed;
        progress.phase = "indexing".into();
        progress.model_cached = provider.kind == "remote" || model_cached(&cache);
        *live_status().lock().map_err(|e| e.to_string())? = Some(progress.clone());
    }
    progress.phase = if progress.failed > 0 {
        "completed_with_errors".into()
    } else {
        "ready".into()
    };
    progress.cancellable = false;
    progress.updated_at = Some(Utc::now().to_rfc3339());
    let final_status = progress.clone();
    let provider_kind = provider_kind.clone();
    let mut persisted = tokio::task::spawn_blocking(move || -> Result<SemanticIndexStatus> {
        let conn = db::open_db(&path)?;
        storage::save_meta(
            &conn,
            &model_key,
            &provider_kind,
            0,
            &final_status.phase,
            final_status.last_error.as_deref(),
        )?;
        storage::index_status(&conn, &model_key)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    persisted.phase = progress.phase;
    persisted.cancellable = false;
    persisted.model_cached = provider.kind == "remote" || model_cached(&cache);
    *live_status().lock().map_err(|e| e.to_string())? = Some(persisted.clone());
    Ok(persisted)
}

#[tauri::command]
pub async fn hybrid_semantic_search(
    app: AppHandle<Wry>,
    mut input: HybridSearchInput,
) -> Result<Vec<HybridSearchHit>, String> {
    let query = input.query.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    if input.provider.kind == "remote"
        && input
            .provider
            .api_key
            .as_deref()
            .unwrap_or_default()
            .is_empty()
    {
        input.provider.api_key = get_secret("semantic_embedding_api_key");
    }
    let model_key = input.provider.model_key();
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    let source_id = input.source_id.clone();
    let (keyword, vectors) = tokio::task::spawn_blocking({
        let path = path.clone();
        let query = query.clone();
        let model_key = model_key.clone();
        let source_id = source_id.clone();
        move || -> Result<_> {
            let conn = db::open_db(&path)?;
            Ok((
                keyword_search(&conn, &query, source_id.as_deref())?,
                storage::load_vectors(&conn, &model_key, source_id.as_deref())?,
            ))
        }
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    let semantic = if vectors.is_empty() {
        Vec::new()
    } else {
        let text = vec![format!("query: {query}")];
        let mut embeddings = if input.provider.kind == "remote" {
            embed_remote(&input.provider, text)
                .await
                .map_err(|e| e.to_string())?
        } else {
            let cache = cache_dir(&app).map_err(|e| e.to_string())?;
            tokio::task::spawn_blocking(move || embed_local(text, cache))
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())?
        };
        let mut query_vector = embeddings
            .pop()
            .ok_or_else(|| "embedding provider returned no query vector".to_string())?;
        normalize_vector(&mut query_vector).map_err(|e| e.to_string())?;
        semantic_search(vectors, &query_vector)
    };
    Ok(reciprocal_rank_fusion(
        keyword,
        semantic,
        input.limit.unwrap_or(12),
    ))
}

fn citations_for_hits(hits: &[HybridSearchHit]) -> Vec<GroundedCitation> {
    hits.iter()
        .enumerate()
        .map(|(index, hit)| GroundedCitation {
            kind: "source".into(),
            label: format!("S{}", index + 1),
            id: hit.source_id.clone(),
            title: format!("{} · Chunk {}", hit.source_title, hit.chunk_index + 1),
            excerpt: hit.text.chars().take(500).collect(),
            source_id: Some(hit.source_id.clone()),
            chunk_index: Some(hit.chunk_index),
            url: None,
            quote: Some(hit.text.chars().take(240).collect()),
            reason: Some(hit.reason.clone()),
        })
        .collect()
}

fn has_sufficient_context(query: &str, hits: &[HybridSearchHit]) -> bool {
    !query.trim().is_empty()
        && !hits.is_empty()
        && hits
            .iter()
            .map(|hit| hit.text.chars().count())
            .sum::<usize>()
            >= MIN_CONTEXT_CHARS
}

fn cited_labels(content: &str) -> HashSet<String> {
    let mut labels = HashSet::new();
    let chars = content.chars().collect::<Vec<_>>();
    for start in 0..chars.len() {
        if chars[start] != '[' {
            continue;
        }
        if let Some(end) = chars[start + 1..].iter().position(|ch| *ch == ']') {
            let label = chars[start + 1..start + 1 + end].iter().collect::<String>();
            if label.starts_with('S') && label[1..].chars().all(|ch| ch.is_ascii_digit()) {
                labels.insert(label);
            }
        }
    }
    labels
}

#[tauri::command]
pub async fn generate_grounded_answer(
    app: AppHandle<Wry>,
    input: GroundedAnswerInput,
) -> Result<GroundedAnswerResult, String> {
    let query = input.query.trim();
    let citations = citations_for_hits(&input.hits);
    if !has_sufficient_context(query, &input.hits) {
        return Ok(GroundedAnswerResult {
            content:
                "现有检索证据不足，无法生成可靠回答。请扩大检索范围、重建语义索引或选择更多上下文。"
                    .into(),
            citations,
            invocation_id: None,
            refused: true,
            warnings: vec!["未调用聊天模型：所选上下文不足。".into()],
        });
    }
    let config = crate::commands::config::get_config(app.clone())?;
    if config.openai_api_key.trim().is_empty() {
        return Err("尚未配置聊天模型 API Key".into());
    }
    let context = input
        .hits
        .iter()
        .enumerate()
        .map(|(index, hit)| format!("[S{}] {}\n{}", index + 1, hit.source_title, hit.text))
        .collect::<Vec<_>>()
        .join("\n\n");
    let body = serde_json::json!({ "model": config.openai_model, "messages": [
        {"role":"system","content":"你是研究问答助手。只能使用给定上下文回答；每个事实性结论后必须引用 [S1] 形式标签。若证据冲突或不足，明确说明。禁止编造标签。"},
        {"role":"user","content":format!("问题：{query}\n\n可用证据：\n{context}")}
    ], "temperature": 0.2 });
    let endpoint = crate::commands::config::completions_endpoint(
        &config.openai_base_url,
        &config.provider_key,
        &config.custom_endpoint,
    );
    let response = reqwest::Client::new()
        .post(endpoint)
        .bearer_auth(&config.openai_api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = response.status();
    let raw = response.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("AI 返回错误 ({status}): {raw}"));
    }
    let content = crate::ai::chat_response::extract_chat_text(&raw)
        .map_err(|e| e.to_string())?;
    let allowed = citations
        .iter()
        .map(|citation| citation.label.clone())
        .collect::<HashSet<_>>();
    let used = cited_labels(&content);
    if used.is_empty() || !used.is_subset(&allowed) {
        return Err("模型回答缺少有效引用或包含未知引用，已拒绝该回答".into());
    }
    let db_path = db::db_path(&app).map_err(|e| e.to_string())?;
    let query_owned = query.to_string();
    let model = config.openai_model.clone();
    let hits = input.hits.clone();
    let warnings = Vec::<String>::new();
    let invocation_id = tokio::task::spawn_blocking(move || -> Result<String> {
        let conn = db::open_db(&db_path)?;
        let invocation = db::save_ai_invocation(
            &conn,
            db::SaveAiInvocationInput {
                task_kind: "investigation".into(),
                model_profile_id: None,
                model_name: Some(model),
                prompt_version: PROMPT_VERSION.into(),
                input_query: Some(query_owned.clone()),
                input_refs_json: serde_json::json!({"query":query_owned,"citationLabels":allowed})
                    .to_string(),
                context_manifest_json:
                    serde_json::json!({"sourceChunks":hits.len(),"selectedOnly":true}).to_string(),
                token_usage_json: None,
                warnings_json: serde_json::to_string(&warnings)?,
            },
        )?;
        let items = hits
            .iter()
            .enumerate()
            .map(|(index, hit)| db::SaveInvestigationContextItemInput {
                invocation_id: invocation.id.clone(),
                target_kind: "source".into(),
                target_id: hit.source_id.clone(),
                label: Some(format!("S{}", index + 1)),
                role: "source".into(),
                included: true,
                truncated: false,
                reason: Some(hit.reason.clone()),
                char_count: Some(hit.text.chars().count() as i64),
                source_text_hash: Some(storage::text_hash(&hit.text)),
            })
            .collect();
        db::save_investigation_context_items(&conn, items)?;
        Ok(invocation.id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    Ok(GroundedAnswerResult {
        content,
        citations,
        invocation_id: Some(invocation_id),
        refused: false,
        warnings: Vec::new(),
    })
}

#[tauri::command]
pub async fn save_grounded_answer_report(
    app: AppHandle<Wry>,
    input: SaveGroundedAnswerReportInput,
) -> Result<db::ReportRecord, String> {
    if input.answer.refused {
        return Err("拒绝回答不能保存为调查报告".into());
    }
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> Result<db::ReportRecord> {
        let conn = db::open_db(&path)?;
        let report = db::save_report(
            &conn,
            db::SaveReportInput {
                title: input.query.chars().take(80).collect(),
                kind: "investigation".into(),
                source_name: Some("Research Q&A".into()),
                body_md: input.answer.content.clone(),
                summary: input.answer.content.chars().take(180).collect(),
                citations_json: serde_json::to_string(&input.answer.citations)?,
            },
        )?;
        if let Some(invocation_id) = input.answer.invocation_id {
            db::link_ai_invocation_output(&conn, &invocation_id, "report", &report.id)?;
        }
        Ok(report)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

fn backups_dir(app: &AppHandle<Wry>) -> Result<PathBuf> {
    let path = app.path().app_data_dir()?.join("backups");
    fs::create_dir_all(&path)?;
    Ok(path)
}

fn restore_database_files(path: &Path, backup: &Path, safety: &Path) -> Result<()> {
    storage::validate_database(backup)
        .context("backup validation failed; database was not changed")?;
    if path.exists() {
        fs::copy(path, safety).context("failed to create pre-restore safety copy")?;
        storage::validate_database(safety).context("pre-restore safety copy failed validation")?;
    }
    let staged = path.with_extension(format!("restore-stage-{}.db", uuid::Uuid::new_v4()));
    fs::copy(backup, &staged).context("failed to stage database backup")?;
    storage::validate_database(&staged).context("staged database backup failed validation")?;
    let previous = path.with_extension(format!("restore-old-{}.db", uuid::Uuid::new_v4()));
    if path.exists() {
        fs::rename(path, &previous).context("failed to move live database for replacement")?;
    }
    if let Err(error) = fs::rename(&staged, path) {
        if previous.exists() {
            let _ = fs::rename(&previous, path);
        }
        let _ = fs::remove_file(&staged);
        return Err(error).context("failed to install validated database backup");
    }
    if let Err(error) = storage::validate_database(path) {
        let _ = fs::remove_file(path);
        if previous.exists() {
            let _ = fs::rename(&previous, path);
        }
        return Err(error).context("restored database failed validation; live database recovered");
    }
    if previous.exists() {
        fs::remove_file(previous).context("failed to remove restore swap file")?;
    }
    Ok(())
}

#[tauri::command]
pub async fn check_database_integrity(app: AppHandle<Wry>) -> Result<DatabaseSafetyStatus, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    let backup_dir = backups_dir(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> Result<DatabaseSafetyStatus> {
        let integrity = storage::validate_database(&path)?;
        let latest = fs::read_dir(backup_dir)
            .ok()
            .into_iter()
            .flatten()
            .filter_map(|entry| entry.ok())
            .max_by_key(|entry| entry.metadata().and_then(|m| m.modified()).ok())
            .map(|entry| entry.path().display().to_string());
        Ok(DatabaseSafetyStatus {
            database_path: path.display().to_string(),
            integrity,
            latest_backup_path: latest,
            checked_at: Utc::now().to_rfc3339(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn backup_database(app: AppHandle<Wry>) -> Result<DatabaseSafetyStatus, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    let backup_dir = backups_dir(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> Result<DatabaseSafetyStatus> {
        storage::validate_database(&path)?;
        let backup = backup_dir.join(format!(
            "deep_explorer-{}.db",
            Utc::now().format("%Y%m%d-%H%M%S")
        ));
        let conn = rusqlite::Connection::open(&path)?;
        let escaped = backup.display().to_string().replace('\'', "''");
        conn.execute_batch(&format!("VACUUM INTO '{escaped}'"))?;
        let integrity = storage::validate_database(&backup)?;
        Ok(DatabaseSafetyStatus {
            database_path: path.display().to_string(),
            integrity,
            latest_backup_path: Some(backup.display().to_string()),
            checked_at: Utc::now().to_rfc3339(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_database_backup(
    app: AppHandle<Wry>,
    backup_path: String,
) -> Result<DatabaseSafetyStatus, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    let backup = PathBuf::from(backup_path);
    let backup_dir = backups_dir(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> Result<DatabaseSafetyStatus> {
        let safety = backup_dir.join(format!(
            "pre-restore-{}.db",
            Utc::now().format("%Y%m%d-%H%M%S")
        ));
        restore_database_files(&path, &backup, &safety)?;
        let integrity = storage::validate_database(&path)?;
        Ok(DatabaseSafetyStatus {
            database_path: path.display().to_string(),
            integrity,
            latest_backup_path: Some(safety.display().to_string()),
            checked_at: Utc::now().to_rfc3339(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

pub fn set_secret(account: &str, value: &str) -> Result<()> {
    let entry = keyring::Entry::new("Thepoint", account)?;
    entry.set_password(value)?;
    if entry.get_password()? != value {
        bail!("credential verification failed");
    }
    Ok(())
}

pub fn get_secret(account: &str) -> Option<String> {
    keyring::Entry::new("Thepoint", account)
        .ok()?
        .get_password()
        .ok()
}

pub fn delete_secret(account: &str) -> Result<()> {
    let entry = keyring::Entry::new("Thepoint", account)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.into()),
    }
}

#[tauri::command]
pub fn store_semantic_api_key(api_key: String) -> Result<(), String> {
    set_secret("semantic_embedding_api_key", &api_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn semantic_api_key_status() -> bool {
    get_secret("semantic_embedding_api_key").is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn citation_parser_finds_only_source_labels() {
        let labels = cited_labels("Claim [S1], not [P2], and [S12].");
        assert_eq!(labels, HashSet::from(["S1".into(), "S12".into()]));
    }

    #[test]
    fn insufficient_context_refusal_threshold_is_nonzero() {
        assert!(MIN_CONTEXT_CHARS > 0);
    }

    #[test]
    fn insufficient_context_is_detected_before_model_call() {
        let mut hit = HybridSearchHit {
            id: "c1".into(),
            source_id: "s1".into(),
            source_title: "Source".into(),
            chunk_index: 0,
            heading_path: None,
            text: "short".into(),
            score: 1.0,
            keyword_rank: Some(1),
            semantic_rank: None,
            semantic_score: None,
            reason: "keyword".into(),
        };
        assert!(!has_sufficient_context("question", &[hit.clone()]));
        hit.text = "evidence ".repeat(20);
        assert!(has_sufficient_context("question", &[hit]));
    }

    #[test]
    fn rebuild_guard_rejects_concurrent_work_and_releases_on_drop() {
        let first = RebuildGuard::acquire().unwrap();
        assert!(RebuildGuard::acquire().is_err());
        drop(first);
        assert!(RebuildGuard::acquire().is_ok());
    }

    #[test]
    fn cancellation_reports_false_when_no_rebuild_is_active() {
        REBUILD_ACTIVE.store(false, Ordering::SeqCst);
        assert!(!cancel_semantic_index_rebuild());
    }

    #[test]
    fn restore_rejects_invalid_backup_without_changing_live_database() {
        let root =
            std::env::temp_dir().join(format!("thepoint-restore-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let live = root.join("live.db");
        let backup = root.join("bad.db");
        let safety = root.join("safety.db");
        let conn = rusqlite::Connection::open(&live).unwrap();
        conn.execute_batch("CREATE TABLE marker(value TEXT); INSERT INTO marker VALUES ('live');")
            .unwrap();
        drop(conn);
        fs::write(&backup, b"not sqlite").unwrap();
        assert!(restore_database_files(&live, &backup, &safety).is_err());
        let conn = rusqlite::Connection::open(&live).unwrap();
        let marker: String = conn
            .query_row("SELECT value FROM marker", [], |row| row.get(0))
            .unwrap();
        assert_eq!(marker, "live");
        drop(conn);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn restore_installs_valid_backup_and_keeps_safety_copy() {
        let root =
            std::env::temp_dir().join(format!("thepoint-restore-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let live = root.join("live.db");
        let backup = root.join("backup.db");
        let safety = root.join("safety.db");
        for (path, value) in [(&live, "live"), (&backup, "backup")] {
            let conn = rusqlite::Connection::open(path).unwrap();
            conn.execute_batch(&format!(
                "CREATE TABLE marker(value TEXT); INSERT INTO marker VALUES ('{value}');"
            ))
            .unwrap();
        }
        restore_database_files(&live, &backup, &safety).unwrap();
        for (path, expected) in [(&live, "backup"), (&safety, "live")] {
            let conn = rusqlite::Connection::open(path).unwrap();
            let marker: String = conn
                .query_row("SELECT value FROM marker", [], |row| row.get(0))
                .unwrap();
            assert_eq!(marker, expected);
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn incomplete_model_cache_is_not_reported_as_ready() {
        let root =
            std::env::temp_dir().join(format!("thepoint-cache-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("model.onnx"), vec![0_u8; 32]).unwrap();
        fs::write(root.join("tokenizer.json"), vec![0_u8; 2_000]).unwrap();
        assert!(!model_cached(&root));
        fs::write(root.join("model.onnx"), vec![0_u8; 1_000_000]).unwrap();
        assert!(model_cached(&root));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn network_embedding_errors_are_actionable() {
        let error = anyhow::anyhow!("request error: Connection refused");
        assert!(embedding_error_message(&error).contains("检查网络/代理"));
    }
}
