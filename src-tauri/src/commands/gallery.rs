use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};
use tauri::{Manager, Wry};

use crate::db::{self, GalleryItem, GallerySourcePoint, StoredPoint};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GalleryPromptPreview {
    pub prompt: String,
    pub point_ids: Vec<String>,
    pub source_points: Vec<GallerySourcePoint>,
    pub mode: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GalleryKnowledgeContext {
    pub source_name: String,
    pub source_url: Option<String>,
    pub original_text: String,
    pub chunk_cards: Vec<GalleryKnowledgeChunk>,
    pub starred_points: Vec<GalleryKnowledgeStar>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GalleryKnowledgeChunk {
    pub index: usize,
    pub text: String,
    pub summary: String,
    pub hot_take: String,
    pub labels: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GalleryKnowledgeStar {
    pub id: String,
    pub content: String,
    pub tag_type: Option<String>,
    pub source_excerpt: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GalleryFileDiagnostic {
    pub file_path: String,
    pub exists: bool,
    pub size_bytes: Option<u64>,
    pub image_width: Option<u32>,
    pub image_height: Option<u32>,
    pub error: Option<String>,
}

pub fn gallery_dir(app: &tauri::AppHandle<Wry>) -> anyhow::Result<PathBuf> {
    let dir = app.path().app_data_dir()?.join("gallery");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Save base64 PNG bytes to disk and generate 300x169 webp thumbnail.
fn save_image_files(dir: &PathBuf, id: &str, b64: &str) -> anyhow::Result<(String, String)> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64)?;
    let img_path = dir.join(format!("{}.png", id));
    fs::write(&img_path, &bytes)?;

    // thumbnail: resize to 300×169 (16:9), save as webp
    let img = image::load_from_memory(&bytes)?;
    let (width, height) = (img.width(), img.height());
    let thumb = img.resize_to_fill(300, 169, image::imageops::FilterType::Lanczos3);
    let thumb_path = dir.join(format!("{}_thumb.webp", id));
    thumb.save(&thumb_path)?;
    println!(
        "[Gallery] saved image id={} bytes={} size={}x{} file={} thumb={}",
        id,
        bytes.len(),
        width,
        height,
        img_path.to_string_lossy(),
        thumb_path.to_string_lossy()
    );

    Ok((
        img_path.to_string_lossy().into_owned(),
        thumb_path.to_string_lossy().into_owned(),
    ))
}

/// Call LLM to build an image prompt from starred point contents.
async fn build_image_prompt(config: &crate::commands::config::AppConfig, contents: &[String]) -> anyhow::Result<String> {
    #[derive(Deserialize)] struct Resp { choices: Vec<Choice> }
    #[derive(Deserialize)] struct Choice { message: Msg }
    #[derive(Deserialize)] struct Msg { content: String }

    let joined = contents.join("\n- ");
    let endpoint = crate::commands::config::completions_endpoint(
        &config.openai_base_url, &config.provider_key, &config.custom_endpoint,
    );
    let body = serde_json::json!({
        "model": config.openai_model,
        "messages": [
            {"role":"system","content":"你是图像描述专家，将以下知识点融合为一段适合AI绘图的中文描述，风格：数字水彩，构图感强，100字以内，直接输出描述文字，不要解释。"},
            {"role":"user","content": format!("- {}", joined)}
        ],
        "temperature": 0.7
    });
    let resp = reqwest::Client::new()
        .post(&endpoint)
        .bearer_auth(&config.openai_api_key)
        .json(&body)
        .send().await?;
    let status = resp.status();
    let raw = resp.text().await?;
    if !status.is_success() {
        anyhow::bail!("图片提示词生成失败 ({status}): {raw}");
    }
    let parsed: Resp = serde_json::from_str(&raw)?;
    Ok(parsed.choices.into_iter().next().map(|c| c.message.content).unwrap_or_default())
}

async fn build_knowledge_image_prompt(
    config: &crate::commands::config::AppConfig,
    contexts: &[GalleryKnowledgeContext],
    starred: &[StoredPoint],
) -> anyhow::Result<String> {
    #[derive(Deserialize)]
    struct Resp {
        choices: Vec<Choice>,
    }
    #[derive(Deserialize)]
    struct Choice {
        message: Msg,
    }
    #[derive(Deserialize)]
    struct Msg {
        content: String,
    }

    let user = knowledge_prompt_input(contexts, starred);
    let style_prompt = if config.image_knowledge_style_prompt.trim().is_empty() {
        crate::commands::config::DEFAULT_IMAGE_KNOWLEDGE_STYLE_PROMPT
    } else {
        config.image_knowledge_style_prompt.trim()
    };
    let endpoint = crate::commands::config::completions_endpoint(
        &config.openai_base_url,
        &config.provider_key,
        &config.custom_endpoint,
    );
    let body = serde_json::json!({
        "model": config.openai_model,
        "messages": [
            { "role": "system", "content": style_prompt },
            { "role": "user", "content": user }
        ],
        "temperature": 0.35
    });
    let mut builder = reqwest::Client::new()
        .post(&endpoint)
        .bearer_auth(&config.openai_api_key)
        .json(&body);
    if let Ok(map) =
        serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&config.extra_headers)
    {
        for (key, value) in &map {
            if let Some(value) = value.as_str() {
                builder = builder.header(key.as_str(), value);
            }
        }
    }

    let resp = builder.send().await?;
    let status = resp.status();
    let raw = resp.text().await?;
    if !status.is_success() {
        anyhow::bail!("知识图谱图片提示词生成失败 ({status}): {raw}");
    }
    let parsed: Resp = serde_json::from_str(&raw)?;
    Ok(parsed
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content.trim().to_string())
        .unwrap_or_default())
}

fn knowledge_prompt_input(contexts: &[GalleryKnowledgeContext], starred: &[StoredPoint]) -> String {
    let mut out = String::new();
    out.push_str("请基于以下材料生成一张知识性图片的最终图片模型 prompt。\n");
    out.push_str("要求梳理原文、解析卡牌和 star 的关系，优先表现核心议题、概念、论据、反驳、数据、案例、引用和跨块关联。\n\n");

    for (source_index, context) in contexts.iter().take(6).enumerate() {
        out.push_str(&format!("## 来源 {}：{}\n", source_index + 1, context.source_name));
        if let Some(url) = context.source_url.as_deref().filter(|value| !value.trim().is_empty()) {
            out.push_str(&format!("URL：{}\n", url));
        }
        out.push_str("### 原文节选\n");
        out.push_str(&clip_chars(&context.original_text, 1800));
        out.push_str("\n\n### 解析卡牌\n");
        for card in context.chunk_cards.iter().take(18) {
            let labels = if card.labels.is_empty() {
                String::new()
            } else {
                format!("｜标签：{}", card.labels.join(" / "))
            };
            out.push_str(&format!(
                "- [{}] 摘要：{}｜尖锐观点：{}{}\n  原文：{}\n",
                card.index + 1,
                clip_chars(&card.summary, 180),
                clip_chars(&card.hot_take, 160),
                labels,
                clip_chars(&card.text, 260)
            ));
        }
        out.push_str("\n### 本来源已采集 star\n");
        for star in context.starred_points.iter().take(16) {
            out.push_str(&format!(
                "- {}{}：{}\n  原文依据：{}\n",
                star.id,
                star.tag_type.as_deref().map(|tag| format!(" / {tag}")).unwrap_or_default(),
                clip_chars(&star.content, 180),
                clip_chars(star.source_excerpt.as_deref().unwrap_or(""), 220)
            ));
        }
        out.push('\n');
    }

    out.push_str("## 全部采集 star 索引\n");
    for (index, point) in starred.iter().take(80).enumerate() {
        out.push_str(&format!(
            "[S{}] 来源：{}｜类型：{}｜内容：{}｜原文：{}\n",
            index + 1,
            point.source_doc_name.as_deref().unwrap_or("未命名来源"),
            point.tag_type.as_deref().unwrap_or("未分类"),
            clip_chars(&point.content, 160),
            clip_chars(point.source_excerpt.as_deref().unwrap_or(""), 180)
        ));
    }
    out
}

fn clip_chars(value: &str, limit: usize) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut out = normalized.chars().take(limit).collect::<String>();
    if normalized.chars().count() > limit {
        out.push('…');
    }
    out
}

fn source_points_from_starred(starred: &[StoredPoint]) -> Vec<GallerySourcePoint> {
    starred
        .iter()
        .map(|point| GallerySourcePoint {
            id: point.id.clone(),
            content: point.content.chars().take(220).collect(),
            source_doc_name: point.source_doc_name.clone(),
        })
        .collect()
}

async fn starred_prompt_preview(
    app: &tauri::AppHandle<Wry>,
    mode: Option<String>,
    knowledge_contexts: Option<Vec<GalleryKnowledgeContext>>,
) -> Result<GalleryPromptPreview, String> {
    let config = crate::commands::config::get_config(app.clone())?;
    if config.openai_api_key.trim().is_empty() {
        return Err("尚未配置聊天模型 API Key，无法生成图片 Prompt".to_string());
    }

    let db_path = db::db_path(app).map_err(|e| e.to_string())?;
    let starred = tokio::task::spawn_blocking({
        let p = db_path.clone();
        move || { let c = db::open_db(&p)?; db::list_starred_points(&c) }
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    if starred.len() < 10 {
        return Err(format!("至少采集 10 个 point 才可生成，当前仅 {} 个", starred.len()));
    }

    let point_ids = starred.iter().map(|p| p.id.clone()).collect::<Vec<_>>();
    let contents = starred.iter().map(|p| p.content.clone()).collect::<Vec<_>>();
    let mode = normalize_gallery_mode(mode.as_deref());
    let prompt = if mode == "knowledge" {
        let contexts = knowledge_contexts.unwrap_or_default();
        if contexts.is_empty() {
            return Err("知识性生图需要当前文章原文和解析卡牌上下文".to_string());
        }
        build_knowledge_image_prompt(&config, &contexts, &starred)
            .await
            .map_err(|e| e.to_string())?
    } else {
        build_image_prompt(&config, &contents).await.map_err(|e| e.to_string())?
    };
    Ok(GalleryPromptPreview {
        prompt,
        point_ids,
        source_points: source_points_from_starred(&starred),
        mode: mode.to_string(),
    })
}

fn normalize_gallery_mode(mode: Option<&str>) -> &'static str {
    match mode.map(str::trim) {
        Some("knowledge") => "knowledge",
        _ => "artwork",
    }
}

async fn save_generated_image(
    app: &tauri::AppHandle<Wry>,
    prompt: String,
    point_ids: Vec<String>,
    source_points: Vec<GallerySourcePoint>,
) -> Result<GalleryItem, String> {
    let config = crate::commands::config::get_config(app.clone())?;
    if prompt.trim().is_empty() {
        return Err("图片 Prompt 不能为空".to_string());
    }

    let b64 = call_image_api(&config, prompt.trim()).await.map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let dir = gallery_dir(app).map_err(|e| e.to_string())?;
    let (file_path, thumbnail_path) = save_image_files(&dir, &id, &b64).map_err(|e| e.to_string())?;

    let item = GalleryItem {
        id: id.clone(),
        file_path,
        thumbnail_path,
        prompt: prompt.trim().to_string(),
        generated_at: chrono::Utc::now().to_rfc3339(),
        download_status: "ok".to_string(),
        point_ids,
        source_points,
    };
    let db_path = db::db_path(app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking({
        let item2 = item.clone();
        let p = db_path.clone();
        move || { let c = db::open_db(&p)?; db::insert_gallery_item(&c, &item2) }
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    Ok(item)
}

fn normalize_image_size(size: &str) -> &'static str {
    match size.trim() {
        "1024x1024" | "1:1" | "square" => "1024x1024",
        "1536x864" | "1344x768" | "1792x1024" | "16:9" | "landscape" => "1536x864",
        "864x1536" | "768x1344" | "1024x1792" | "9:16" | "portrait" => "864x1536",
        "1024x768" | "4:3" => "1024x768",
        "768x1024" | "3:4" => "768x1024",
        _ => "1024x1024",
    }
}

fn image_aspect_ratio(size: &str) -> &'static str {
    match normalize_image_size(size) {
        "1536x864" => "16:9",
        "864x1536" => "9:16",
        "1024x768" => "4:3",
        "768x1024" => "3:4",
        _ => "1:1",
    }
}

fn image_generation_endpoint(base_url: &str, custom_endpoint: &str) -> String {
    let custom = custom_endpoint.trim();
    if custom.starts_with("http://") || custom.starts_with("https://") {
        return custom.to_string();
    }
    let base = base_url.trim().trim_end_matches('/');
    let base = if base.is_empty() { "https://api.openai.com" } else { base };
    if custom.is_empty() {
        format!("{base}/v1/images/generations")
    } else {
        format!("{base}/{}", custom.trim_start_matches('/'))
    }
}

fn endpoint_uses_chat_completions(endpoint: &str) -> bool {
    endpoint.trim_end_matches('/').ends_with("/chat/completions")
}

fn data_url_to_b64(value: &str) -> Option<String> {
    let value = value.trim();
    let marker = ";base64,";
    if !value.starts_with("data:image/") {
        return None;
    }
    value.find(marker).map(|index| value[index + marker.len()..].trim().to_string())
}

fn looks_like_image_b64(value: &str) -> Option<String> {
    use base64::Engine as _;
    let candidate = value.trim();
    if candidate.len() < 120 {
        return None;
    }
    if !candidate.chars().all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '/' | '=' | '-' | '_')) {
        return None;
    }
    let normalized = candidate.replace('-', "+").replace('_', "/");
    let bytes = base64::engine::general_purpose::STANDARD.decode(normalized.as_bytes()).ok()?;
    image::load_from_memory(&bytes).ok()?;
    Some(base64::engine::general_purpose::STANDARD.encode(bytes))
}

fn first_image_url_in_text(text: &str) -> Option<String> {
    let start = text.find("https://").or_else(|| text.find("http://"))?;
    let tail = &text[start..];
    let end = tail
        .find(|ch: char| ch.is_whitespace() || matches!(ch, ')' | ']' | '"' | '\'' | '，' | '。' | '；'))
        .unwrap_or(tail.len());
    let url = tail[..end].trim_matches(|ch| matches!(ch, '"' | '\'' | ')' | ']' | '.' | ','));
    if url.is_empty() {
        None
    } else {
        Some(url.to_string())
    }
}

fn collect_image_strings(value: &serde_json::Value, out: &mut Vec<String>) {
    match value {
        serde_json::Value::String(text) => {
            if data_url_to_b64(text).is_some()
                || looks_like_image_b64(text).is_some()
                || first_image_url_in_text(text).is_some()
            {
                out.push(text.to_string());
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                collect_image_strings(item, out);
            }
        }
        serde_json::Value::Object(map) => {
            for value in map.values() {
                collect_image_strings(value, out);
            }
        }
        _ => {}
    }
}

async fn image_string_to_b64(value: &str) -> anyhow::Result<Option<String>> {
    use base64::Engine as _;
    if let Some(b64) = data_url_to_b64(value) {
        return Ok(Some(b64));
    }
    if let Some(b64) = looks_like_image_b64(value) {
        return Ok(Some(b64));
    }
    if let Some(url) = first_image_url_in_text(value) {
        let bytes = reqwest::get(&url).await?.bytes().await?;
        image::load_from_memory(&bytes)?;
        return Ok(Some(base64::engine::general_purpose::STANDARD.encode(&bytes)));
    }
    Ok(None)
}

async fn call_chat_image_api(endpoint: &str, api_key: &str, model: &str, prompt: &str) -> anyhow::Result<String> {
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "user", "content": prompt }
        ],
        "temperature": 0.2
    });
    let resp = reqwest::Client::new()
        .post(endpoint)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await?;
    let status = resp.status();
    let raw = resp.text().await?;
    if !status.is_success() {
        anyhow::bail!("图片生成失败 ({status}): {raw}");
    }

    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|_| anyhow::anyhow!("聊天式生图响应解析失败: {}", &raw[..raw.len().min(400)]))?;
    let mut candidates = Vec::new();
    collect_image_strings(&parsed, &mut candidates);
    for candidate in candidates {
        if let Some(b64) = image_string_to_b64(&candidate).await? {
            println!("[Gallery] chat image response extracted_image_chars={}", b64.len());
            return Ok(b64);
        }
    }
    anyhow::bail!("聊天式生图响应中没有可用图片数据: {}", &raw[..raw.len().min(400)]);
}

/// Call image API (OpenAI-compat or Gemini) and return base64 PNG.
async fn call_image_api(config: &crate::commands::config::AppConfig, prompt: &str) -> anyhow::Result<String> {
    use serde::Deserialize;
    let base_url = if config.image_base_url.is_empty() { &config.openai_base_url } else { &config.image_base_url };
    let api_key  = if config.image_api_key.is_empty()  { &config.openai_api_key  } else { &config.image_api_key  };
    let model    = if config.image_model.is_empty()    { "gpt-image-1"            } else { &config.image_model   };
    let image_size = normalize_image_size(&config.image_size);
    let aspect_ratio = image_aspect_ratio(&config.image_size);
    if api_key.trim().is_empty() {
        anyhow::bail!("尚未配置图片模型 API Key");
    }
    println!(
        "[Gallery] image request provider={} model={} size={} aspect={} prompt_chars={}",
        config.image_provider_key,
        model,
        image_size,
        aspect_ratio,
        prompt.chars().count()
    );

    if config.image_provider_key == "gemini-image" {
        // Gemini Imagen format
        #[derive(Deserialize)] struct GemResp { candidates: Vec<GemCand> }
        #[derive(Deserialize)] struct GemCand { content: GemContent }
        #[derive(Deserialize)] struct GemContent { parts: Vec<GemPart> }
        #[derive(Deserialize)] struct GemPart {
            #[serde(rename = "inlineData")] inline_data: Option<InlineData>
        }
        #[derive(Deserialize)] struct InlineData { data: String }

        let base = base_url.trim().trim_end_matches('/');
        if base.is_empty() {
            anyhow::bail!("Gemini 图片模型需要配置 Image Base URL");
        }
        let url = format!("{}/v1beta/models/{}:generateContent?key={}", base, model, api_key);
        let body = serde_json::json!({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect_ratio}}
        });
        let resp = reqwest::Client::new().post(&url).json(&body).send().await?;
        let status = resp.status();
        let raw = resp.text().await?;
        if !status.is_success() {
            anyhow::bail!("Gemini 图片生成失败 ({status}): {raw}");
        }
        let resp: GemResp = serde_json::from_str(&raw)
            .map_err(|_| anyhow::anyhow!("Gemini parse error: {}", &raw[..raw.len().min(400)]))?;
        resp.candidates.into_iter().next()
            .and_then(|c| c.content.parts.into_iter().next())
            .and_then(|p| p.inline_data)
            .map(|d| {
                println!("[Gallery] Gemini image response type=inlineData b64_chars={}", d.data.len());
                d.data
            })
            .ok_or_else(|| anyhow::anyhow!("Gemini returned no image data"))
    } else {
        // OpenAI-compat format — supports both b64_json and url response formats
        #[derive(Deserialize)] struct OaiResp { data: Vec<OaiImg> }
        #[derive(Deserialize)] struct OaiImg { b64_json: Option<String>, url: Option<String> }

        let endpoint = image_generation_endpoint(base_url, &config.image_custom_endpoint);
        if endpoint_uses_chat_completions(&endpoint) {
            return call_chat_image_api(&endpoint, api_key, model, prompt).await;
        }
        let body = serde_json::json!({
            "model": model, "prompt": prompt, "n": 1,
            "size": image_size, "response_format": "b64_json"
        });
        let fallback_body = serde_json::json!({
            "model": model, "prompt": prompt, "n": 1,
            "size": image_size
        });
        let resp = reqwest::Client::new()
            .post(&endpoint).bearer_auth(api_key).json(&body)
            .send().await?;
        let status = resp.status();
        let mut raw = resp.text().await?;
        let mut final_status = status;
        if !status.is_success() && raw.contains("response_format") {
            let retry = reqwest::Client::new()
                .post(&endpoint).bearer_auth(api_key).json(&fallback_body)
                .send().await?;
            final_status = retry.status();
            raw = retry.text().await?;
        }
        if !final_status.is_success() {
            anyhow::bail!("图片生成失败 ({final_status}): {raw}");
        }
        let resp: OaiResp = serde_json::from_str(&raw)
            .map_err(|_| anyhow::anyhow!("OpenAI image parse error: {}", &raw[..raw.len().min(400)]))?;
        let img = resp.data.into_iter().next()
            .ok_or_else(|| anyhow::anyhow!("no image in response"))?;
        if let Some(b64) = img.b64_json {
            println!("[Gallery] OpenAI-compatible image response type=b64_json b64_chars={}", b64.len());
            Ok(b64)
        } else if let Some(img_url) = img.url {
            // download the URL and encode as base64
            let bytes = reqwest::get(&img_url).await?.bytes().await?;
            use base64::Engine as _;
            println!("[Gallery] OpenAI-compatible image response type=url downloaded_bytes={}", bytes.len());
            Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
        } else {
            Err(anyhow::anyhow!("response contains neither b64_json nor url"))
        }
    }
}

#[tauri::command]
pub async fn generate_image(app: tauri::AppHandle<Wry>) -> Result<GalleryItem, String> {
    let preview = starred_prompt_preview(&app, None, None).await?;
    save_generated_image(&app, preview.prompt, preview.point_ids, preview.source_points).await
}

#[tauri::command]
pub async fn prepare_gallery_image_prompt(
    app: tauri::AppHandle<Wry>,
    mode: Option<String>,
    knowledge_contexts: Option<Vec<GalleryKnowledgeContext>>,
) -> Result<GalleryPromptPreview, String> {
    starred_prompt_preview(&app, mode, knowledge_contexts).await
}

#[tauri::command]
pub async fn generate_image_from_prompt(
    app: tauri::AppHandle<Wry>,
    prompt: String,
    point_ids: Vec<String>,
    source_points: Vec<GallerySourcePoint>,
) -> Result<GalleryItem, String> {
    save_generated_image(&app, prompt, point_ids, source_points).await
}

#[tauri::command]
pub async fn list_gallery(app: tauri::AppHandle<Wry>) -> Result<Vec<GalleryItem>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || { let c = db::open_db(&path)?; db::list_gallery(&c) })
        .await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_gallery_item(app: tauri::AppHandle<Wry>, id: String) -> Result<(), String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    let (fp, tp) = tokio::task::spawn_blocking(move || {
        let c = db::open_db(&path)?; db::delete_gallery_item(&c, &id)
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&fp);
    let _ = std::fs::remove_file(&tp);
    Ok(())
}

#[tauri::command]
pub async fn retry_download(app: tauri::AppHandle<Wry>, id: String) -> Result<GalleryItem, String> {
    let config = crate::commands::config::get_config(app.clone())?;
    let db_path = db::db_path(&app).map_err(|e| e.to_string())?;

    // get existing item for prompt + point_ids
    let item = tokio::task::spawn_blocking({
        let p = db_path.clone(); let id2 = id.clone();
        move || { let c = db::open_db(&p)?; db::get_gallery_item(&c, &id2) }
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?
    .ok_or("item not found")?;

    let b64 = call_image_api(&config, &item.prompt).await.map_err(|e| e.to_string())?;
    let dir = gallery_dir(&app).map_err(|e| e.to_string())?;
    let (file_path, thumb_path) = save_image_files(&dir, &id, &b64).map_err(|e| e.to_string())?;

    tokio::task::spawn_blocking({
        let p = db_path.clone(); let id2 = id.clone();
        let fp = file_path.clone(); let tp = thumb_path.clone();
        move || { let c = db::open_db(&p)?; db::update_gallery_status(&c, &id2, &fp, &tp, "ok") }
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    Ok(GalleryItem { file_path, thumbnail_path: thumb_path, download_status: "ok".to_string(), ..item })
}

#[tauri::command]
pub fn diagnose_gallery_file(file_path: String) -> GalleryFileDiagnostic {
    let path = PathBuf::from(&file_path);
    let metadata = match fs::metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) => {
            return GalleryFileDiagnostic {
                file_path,
                exists: false,
                size_bytes: None,
                image_width: None,
                image_height: None,
                error: Some(error.to_string()),
            };
        }
    };
    match image::image_dimensions(&path) {
        Ok((width, height)) => GalleryFileDiagnostic {
            file_path,
            exists: true,
            size_bytes: Some(metadata.len()),
            image_width: Some(width),
            image_height: Some(height),
            error: None,
        },
        Err(error) => GalleryFileDiagnostic {
            file_path,
            exists: true,
            size_bytes: Some(metadata.len()),
            image_width: None,
            image_height: None,
            error: Some(error.to_string()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_image_size_replaces_legacy_unsupported_size() {
        assert_eq!(normalize_image_size("1792x1024"), "1536x864");
        assert_eq!(image_aspect_ratio("1792x1024"), "16:9");
    }

    #[test]
    fn normalize_image_size_allows_supported_ratios() {
        assert_eq!(normalize_image_size("1024x1024"), "1024x1024");
        assert_eq!(normalize_image_size("1536x864"), "1536x864");
        assert_eq!(normalize_image_size("864x1536"), "864x1536");
        assert_eq!(normalize_image_size("1024x768"), "1024x768");
        assert_eq!(normalize_image_size("768x1024"), "768x1024");
        assert_eq!(normalize_image_size("bad-size"), "1024x1024");
    }

    #[test]
    fn normalize_gallery_mode_falls_back_to_artwork() {
        assert_eq!(normalize_gallery_mode(Some("knowledge")), "knowledge");
        assert_eq!(normalize_gallery_mode(Some("bad")), "artwork");
        assert_eq!(normalize_gallery_mode(None), "artwork");
    }

    #[test]
    fn knowledge_prompt_input_includes_sources_cards_and_stars() {
        let contexts = vec![GalleryKnowledgeContext {
            source_name: "测试文章".to_string(),
            source_url: Some("https://example.com/story".to_string()),
            original_text: "原文讨论养老金压力和缴费比例变化。".to_string(),
            chunk_cards: vec![GalleryKnowledgeChunk {
                index: 0,
                text: "第一段原文".to_string(),
                summary: "养老金压力上升".to_string(),
                hot_take: "制度成本正在转移".to_string(),
                labels: vec!["事实".to_string(), "观点".to_string()],
            }],
            starred_points: vec![GalleryKnowledgeStar {
                id: "star-1".to_string(),
                content: "已采集的 star 内容".to_string(),
                tag_type: Some("作者观点".to_string()),
                source_excerpt: Some("star 的原文依据".to_string()),
            }],
        }];
        let starred = vec![StoredPoint {
            id: "star-1".to_string(),
            content: "已采集的 star 内容".to_string(),
            tag_type: Some("作者观点".to_string()),
            parent_id: None,
            source_doc_name: Some("测试文章".to_string()),
            source_excerpt: Some("star 的原文依据".to_string()),
            created_at: "2026-06-08T00:00:00Z".to_string(),
            archived: false,
            starred: true,
        }];

        let prompt = knowledge_prompt_input(&contexts, &starred);

        assert!(prompt.contains("测试文章"));
        assert!(prompt.contains("养老金压力上升"));
        assert!(prompt.contains("制度成本正在转移"));
        assert!(prompt.contains("已采集的 star 内容"));
        assert!(prompt.contains("star 的原文依据"));
    }
}
