use tauri::Wry;

use crate::ai::explore::{self, FrameworkRecommendation};
use crate::ai::models::{self, MentalModel};
use crate::db::{self, StoredPoint};

const MAX_SIMILAR: usize = 8;

/// Return the full mental-model library (sync constant) for the "其他" panel.
#[tauri::command]
pub fn list_mental_models() -> Vec<MentalModel> {
    models::all()
}

/// Ask the LLM to recommend 3 frameworks for a point.
#[tauri::command]
pub async fn recommend_frameworks(
    app: tauri::AppHandle<Wry>,
    point_content: String,
) -> Result<Vec<FrameworkRecommendation>, String> {
    let config = crate::commands::config::get_config(app)?;
    explore::recommend_models(&config.openai_api_key, &config.openai_model, &config.openai_base_url, &point_content)
        .await
        .map_err(|e| e.to_string())
}

/// Run a deep-dive action on a point, persist the resulting child points and an
/// `explore_actions` record, then return the freshly written rows.
///
/// `action_type` ∈ explain | counter | followup | framework. For framework a
/// `framework_key` is required and recorded as the action `detail`.
#[tauri::command]
pub async fn deepen_point(
    app: tauri::AppHandle<Wry>,
    parent_id: Option<String>,
    parent_content: String,
    action_type: String,
    framework_key: Option<String>,
) -> Result<Vec<StoredPoint>, String> {
    let config = crate::commands::config::get_config(app.clone())?;

    // OpenAI call (async reqwest) — must NOT go on spawn_blocking.
    let generated = match action_type.as_str() {
        "explain" | "counter" | "followup" => explore::deepen(
            &config.openai_api_key,
            &config.openai_model,
            &config.openai_base_url,
            &action_type,
            &parent_content,
        )
        .await
        .map_err(|e| e.to_string())?,
        "framework" => {
            let key = framework_key
                .clone()
                .ok_or_else(|| "框架解读需要指定思维模型".to_string())?;
            explore::apply_framework(
                &config.openai_api_key,
                &config.openai_model,
                &config.openai_base_url,
                &key,
                &parent_content,
            )
            .await
            .map_err(|e| e.to_string())?
        }
        other => return Err(format!("未知的深挖动作: {other}")),
    };

    if generated.is_empty() {
        return Err("模型没有返回任何结果，请重试".to_string());
    }

    let detail = framework_key.clone();
    let rows: Vec<(String, String)> = generated
        .into_iter()
        .map(|p| (p.content, p.tag_type))
        .collect();

    // DB write on spawn_blocking. Resolve the path in async, then move owned data in.
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<StoredPoint>> {
        let mut conn = db::open_db(&path)?;
        db::save_child_points(
            &mut conn,
            parent_id.as_deref(),
            &action_type,
            detail.as_deref(),
            &rows,
        )
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Keyword/LIKE similarity search in the local library. Records an action.
/// Matches are NOT auto-attached; the frontend decides whether to mount them.
#[tauri::command]
pub async fn find_similar(
    app: tauri::AppHandle<Wry>,
    point_id: String,
    content: String,
) -> Result<Vec<StoredPoint>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;

    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<StoredPoint>> {
        let conn = db::open_db(&path)?;
        let keywords = db::extract_keywords(&content);
        let similar = db::find_similar_points(&conn, &point_id, &keywords, MAX_SIMILAR)?;
        db::record_explore_action(&conn, &point_id, "similar", None)?;
        Ok(similar)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}
