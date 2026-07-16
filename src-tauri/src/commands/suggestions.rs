use tauri::Wry;

const SUGGESTION_SYSTEM: &str = "\
你是认知能力提升教练。请按以下固定顺序输出一份认知反思简报：

1. 与过去几次的变化对比（若有历史摘要则分析趋势变化，若首次则说明\"目前是首次生成\"）
2. 当前认知偏好与习惯
3. 认知盲点
4. 深度与广度提升建议
5. 推荐思维框架（仅从下方列表中选 1~3 个，附简短选择理由）

输出格式：
首行必须是 SUMMARY: <一两句话总结本次建议的核心>

然后空一行，后面用 Markdown 写详细正文。章节用 ##，重要建议用 **加粗** 或 > 引用块强调。
";

/// Generate a suggestion (does NOT save). Returns { body_md, summary }.
#[tauri::command]
pub async fn generate_suggestion(app: tauri::AppHandle<Wry>) -> Result<serde_json::Value, String> {
    let config = crate::commands::config::get_config(app.clone())?;
    if config.openai_api_key.is_empty() {
        return Err("尚未配置 API Key，无法生成建议".to_string());
    }

    // Pull history and mental models (blocking)
    let path = crate::db::db_path(&app).map_err(|e| e.to_string())?;
    let (recent_actions, recent_summaries) = tokio::task::spawn_blocking(move || -> anyhow::Result<(String, Vec<String>)> {
        let conn = crate::db::open_db(&path)?;

        // Last 100 actions
        let mut stmt = conn.prepare(
            "SELECT ea.action_type, p.content
             FROM explore_actions ea
             LEFT JOIN points p ON p.id = ea.point_id
             ORDER BY ea.id DESC
             LIMIT 100",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?.unwrap_or_default()))
        })?;
        let mut lines = Vec::new();
        for row in rows {
            let (action, content) = row?;
            let preview = content.chars().take(60).collect::<String>();
            lines.push(format!("[{action}] {preview}"));
        }
        let actions_text = lines.join("\n");

        // Recent summaries (latest 15)
        let summaries = crate::db::list_recent_suggestion_summaries(&conn, 15)?;

        Ok((actions_text, summaries))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    if recent_actions.trim().is_empty() {
        return Err("暂无操作记录，使用深挖功能后再来获取建议".to_string());
    }

    // Build models block
    let models = crate::ai::models::all();
    let models_block = models.iter()
        .map(|m| format!("- key: {}; name: {}; description: {}", m.key, m.name, m.description))
        .collect::<Vec<_>>()
        .join("\n");

    // Build history block
    let history_block = if recent_summaries.is_empty() {
        "暂无历史".to_string()
    } else {
        recent_summaries.iter().rev()
            .map(|s| format!("- {}", s))
            .collect::<Vec<_>>()
            .join("\n")
    };

    let user = format!(
        "【最近 100 条深挖操作（动作类型 + 观点摘要）】\n\n{}\n\n【历史建议摘要（最多 15 条）】\n\n{}\n\n【可推荐的思维框架（闭集）】\n\n{}",
        recent_actions, history_block, models_block,
    );

    let endpoint = crate::commands::config::completions_endpoint(
        &config.openai_base_url, &config.provider_key, &config.custom_endpoint,
    );
    let body = serde_json::json!({
        "model": config.openai_model,
        "messages": [
            { "role": "system", "content": SUGGESTION_SYSTEM },
            { "role": "user", "content": user }
        ],
        "temperature": 0.7
    });

    let mut builder = crate::http::client()
        .post(&endpoint)
        .bearer_auth(&config.openai_api_key)
        .json(&body);
    if let Ok(map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&config.extra_headers) {
        for (k, v) in &map {
            if let Some(s) = v.as_str() {
                builder = builder.header(k.as_str(), s);
            }
        }
    }

    let resp = builder.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let raw = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("LLM 返回错误 ({status}): {raw}"));
    }

    let full = crate::ai::chat_response::extract_chat_text(&raw).map_err(|e| e.to_string())?;

    // Parse SUMMARY: prefix
    let (summary, body_md) = if let Some(rest) = full.strip_prefix("SUMMARY:") {
        if let Some(nl) = rest.find('\n') {
            let s = rest[..nl].trim().to_string();
            let b = rest[nl..].trim().to_string();
            (s, b)
        } else {
            (rest.trim().to_string(), String::new())
        }
    } else {
        let fallback = full.lines().next().map(|l| l.chars().take(80).collect()).unwrap_or_default();
        (fallback, full)
    };

    Ok(serde_json::json!({ "bodyMd": body_md, "summary": summary }))
}

/// Persist a suggestion row; returns the assigned id.
#[tauri::command]
pub async fn save_suggestion(
    app: tauri::AppHandle<Wry>,
    body_md: String,
    summary: String,
) -> Result<String, String> {
    let path = crate::db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<String> {
        let conn = crate::db::open_db(&path)?;
        let id = uuid::Uuid::new_v4().to_string();
        // Local date YYYY-MM-DD
        let now = chrono::Utc::now();
        let date = now.format("%Y-%m-%d").to_string();
        let created_at = now.to_rfc3339();
        crate::db::save_suggestion(&conn, &id, &date, &body_md, &summary, &created_at)?;
        Ok(id)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionMetaOut {
    pub id: String,
    pub summary: String,
    pub created_at: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionOut {
    pub id: String,
    pub date: String,
    pub body_md: String,
    pub summary: String,
    pub created_at: String,
}

#[tauri::command]
pub async fn list_suggestions_by_date(
    app: tauri::AppHandle<Wry>,
    date: String,
) -> Result<Vec<SuggestionMetaOut>, String> {
    let path = crate::db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<SuggestionMetaOut>> {
        let conn = crate::db::open_db(&path)?;
        let items = crate::db::list_suggestions_by_date(&conn, &date)?;
        Ok(items.into_iter().map(|m| SuggestionMetaOut {
            id: m.id,
            summary: m.summary,
            created_at: m.created_at,
        }).collect())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_suggestion(
    app: tauri::AppHandle<Wry>,
    id: String,
) -> Result<Option<SuggestionOut>, String> {
    let path = crate::db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Option<SuggestionOut>> {
        let conn = crate::db::open_db(&path)?;
        Ok(crate::db::get_suggestion(&conn, &id)?.map(|s| SuggestionOut {
            id: s.id,
            date: s.date,
            body_md: s.body_md,
            summary: s.summary,
            created_at: s.created_at,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_suggestion(
    app: tauri::AppHandle<Wry>,
    id: String,
) -> Result<(), String> {
    let path = crate::db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let conn = crate::db::open_db(&path)?;
        crate::db::delete_suggestion(&conn, &id)?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_marked_dates(app: tauri::AppHandle<Wry>) -> Result<Vec<String>, String> {
    let path = crate::db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<String>> {
        let conn = crate::db::open_db(&path)?;
        crate::db::list_marked_dates(&conn)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}
