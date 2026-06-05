use tauri::Wry;
use serde::{Deserialize, Serialize};
use crate::db;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyActions {
    pub date: String,
    pub count: i64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsData {
    pub total_points: i64,
    pub total_actions: i64,
    pub explain_count: i64,
    pub counter_count: i64,
    pub followup_count: i64,
    pub similar_count: i64,
    pub framework_count: i64,
    pub total_child_points: i64,
    pub daily_actions: Vec<DailyActions>,
}

#[tauri::command]
pub async fn get_analytics(app: tauri::AppHandle<Wry>) -> Result<AnalyticsData, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<AnalyticsData> {
        let conn = db::open_db(&path)?;

        let (total_points, total_child_points): (i64, i64) = conn.query_row(
            "SELECT COUNT(*), SUM(CASE WHEN parent_id IS NOT NULL THEN 1 ELSE 0 END) FROM points",
            [],
            |r| Ok((r.get(0)?, r.get::<_, Option<i64>>(1)?.unwrap_or(0))),
        )?;

        let (total_actions, explain_count, counter_count, followup_count, similar_count, framework_count): (i64, i64, i64, i64, i64, i64) = conn.query_row(
            "SELECT COUNT(*),
                    SUM(CASE WHEN action_type='explain'   THEN 1 ELSE 0 END),
                    SUM(CASE WHEN action_type='counter'   THEN 1 ELSE 0 END),
                    SUM(CASE WHEN action_type='followup'  THEN 1 ELSE 0 END),
                    SUM(CASE WHEN action_type='similar'   THEN 1 ELSE 0 END),
                    SUM(CASE WHEN action_type='framework' THEN 1 ELSE 0 END)
             FROM explore_actions",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        )?;

        let mut stmt = conn.prepare(
            "SELECT substr(created_at, 1, 10) as date, COUNT(*) as count
             FROM explore_actions
             WHERE created_at >= date('now', '-365 days')
             GROUP BY date
             ORDER BY date ASC",
        )?;
        let daily_actions = stmt
            .query_map([], |r| Ok(DailyActions { date: r.get(0)?, count: r.get(1)? }))?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(AnalyticsData {
            total_points,
            total_actions,
            explain_count,
            counter_count,
            followup_count,
            similar_count,
            framework_count,
            total_child_points,
            daily_actions,
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

/// Return LLM-generated suggestions based on the user's recent explore behaviour.
#[tauri::command]
pub async fn get_explore_suggestions(app: tauri::AppHandle<Wry>) -> Result<String, String> {
    let config = crate::commands::config::get_config(app.clone())?;
    if config.openai_api_key.is_empty() {
        return Err("尚未配置 API Key，无法生成建议".to_string());
    }

    // Pull last 100 actions with point content from the DB (blocking)
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    let summary = tokio::task::spawn_blocking(move || -> anyhow::Result<String> {
        let conn = db::open_db(&path)?;
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
        Ok(lines.join("\n"))
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    if summary.trim().is_empty() {
        return Err("暂无操作记录，使用深挖功能后再来获取建议".to_string());
    }

    // LLM call (async)
    let endpoint = crate::commands::config::completions_endpoint(
        &config.openai_base_url,
        &config.provider_key,
        &config.custom_endpoint,
    );
    let system = "你是一位认知能力提升教练。根据用户的深挖操作记录，分析其认知习惯，指出偏好与盲点，给出 2-3 条具体可行的建议，目标是帮助用户提升认知深度和广度。用中文回答，200-400字，纯文本。";
    let user = format!("以下是用户最近的深挖操作记录（格式：[动作类型] 观点摘要）：\n\n{summary}");

    let body = serde_json::json!({
        "model": config.openai_model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ],
        "temperature": 0.7
    });

    let mut builder = reqwest::Client::new()
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

    #[derive(serde::Deserialize)]
    struct ChatResp { choices: Vec<ChatChoice> }
    #[derive(serde::Deserialize)]
    struct ChatChoice { message: ChatMsg }
    #[derive(serde::Deserialize)]
    struct ChatMsg { content: String }

    let parsed: ChatResp = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    parsed.choices.into_iter().next()
        .map(|c| c.message.content)
        .ok_or_else(|| "模型未返回内容".to_string())
}
