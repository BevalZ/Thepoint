use tauri::Wry;

const DIGEST_SYSTEM: &str = "你是一位专业的知识分析师。用户给你提供了一系列他们认为重要的观点（已采集的星星 points）。\
请根据这些观点生成一份详细的研究简报（digest），要求：\
1. 先写一个执行摘要（100字以内）\
2. 按主题归类，分析各观点之间的联系与规律\
3. 指出核心洞见和潜在启示\
4. 给出 2-3 条行动建议或延伸阅读方向\
输出为 Markdown 格式，结构清晰，语言与原始观点保持一致。";

#[tauri::command]
pub async fn generate_digest(app: tauri::AppHandle<Wry>) -> Result<String, String> {
    let config = crate::commands::config::get_config(app.clone())?;
    if config.openai_api_key.is_empty() {
        return Err("尚未配置 API Key".to_string());
    }

    let db_path = crate::db::db_path(&app).map_err(|e| e.to_string())?;
    let starred = tokio::task::spawn_blocking(move || {
        let c = crate::db::open_db(&db_path)?;
        crate::db::list_starred_points(&c)
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    if starred.is_empty() {
        return Err("还没有采集任何 point".to_string());
    }

    let points_text = starred.iter().enumerate()
        .map(|(i, p)| format!("{}. [{}] {}", i + 1, p.tag_type.as_deref().unwrap_or("观点"), p.content))
        .collect::<Vec<_>>()
        .join("\n");

    let endpoint = crate::commands::config::completions_endpoint(
        &config.openai_base_url, &config.provider_key, &config.custom_endpoint,
    );
    let body = serde_json::json!({
        "model": config.openai_model,
        "messages": [
            { "role": "system", "content": DIGEST_SYSTEM },
            { "role": "user", "content": format!("以下是我采集的 {} 个观点：\n\n{}", starred.len(), points_text) }
        ],
        "temperature": 0.6
    });

    let mut builder = reqwest::Client::new()
        .post(&endpoint)
        .bearer_auth(&config.openai_api_key)
        .json(&body);
    if let Ok(map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&config.extra_headers) {
        for (k, v) in &map {
            if let Some(s) = v.as_str() { builder = builder.header(k.as_str(), s); }
        }
    }

    let resp = builder.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let raw = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("AI 返回错误 ({status}): {raw}"));
    }

    #[derive(serde::Deserialize)]
    struct Resp { choices: Vec<Choice> }
    #[derive(serde::Deserialize)]
    struct Choice { message: Msg }
    #[derive(serde::Deserialize)]
    struct Msg { content: String }

    let parsed: Resp = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let digest = parsed.choices.into_iter().next()
        .map(|c| c.message.content)
        .ok_or_else(|| "模型未返回内容".to_string())?;

    let clear_path = crate::db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        let c = crate::db::open_db(&clear_path)?;
        crate::db::clear_starred_points(&c)
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    Ok(digest)
}
