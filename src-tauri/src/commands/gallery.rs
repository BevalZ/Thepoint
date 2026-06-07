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
    let thumb = img.resize_to_fill(300, 169, image::imageops::FilterType::Lanczos3);
    let thumb_path = dir.join(format!("{}_thumb.webp", id));
    thumb.save(&thumb_path)?;

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

async fn starred_prompt_preview(app: &tauri::AppHandle<Wry>) -> Result<GalleryPromptPreview, String> {
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
    let prompt = build_image_prompt(&config, &contents).await.map_err(|e| e.to_string())?;
    Ok(GalleryPromptPreview {
        prompt,
        point_ids,
        source_points: source_points_from_starred(&starred),
    })
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

/// Call image API (OpenAI-compat or Gemini) and return base64 PNG.
async fn call_image_api(config: &crate::commands::config::AppConfig, prompt: &str) -> anyhow::Result<String> {
    use serde::Deserialize;
    let base_url = if config.image_base_url.is_empty() { &config.openai_base_url } else { &config.image_base_url };
    let api_key  = if config.image_api_key.is_empty()  { &config.openai_api_key  } else { &config.image_api_key  };
    let model    = if config.image_model.is_empty()    { "gpt-image-1"            } else { &config.image_model   };
    if api_key.trim().is_empty() {
        anyhow::bail!("尚未配置图片模型 API Key");
    }

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
            "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "16:9"}}
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
            .map(|d| d.data)
            .ok_or_else(|| anyhow::anyhow!("Gemini returned no image data"))
    } else {
        // OpenAI-compat format — supports both b64_json and url response formats
        #[derive(Deserialize)] struct OaiResp { data: Vec<OaiImg> }
        #[derive(Deserialize)] struct OaiImg { b64_json: Option<String>, url: Option<String> }

        let base = base_url.trim().trim_end_matches('/');
        let base = if base.is_empty() { "https://api.openai.com" } else { base };
        let endpoint = format!("{}/v1/images/generations", base);
        let body = serde_json::json!({
            "model": model, "prompt": prompt, "n": 1,
            "size": "1792x1024", "response_format": "b64_json"
        });
        let fallback_body = serde_json::json!({
            "model": model, "prompt": prompt, "n": 1,
            "size": "1792x1024"
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
            Ok(b64)
        } else if let Some(img_url) = img.url {
            // download the URL and encode as base64
            let bytes = reqwest::get(&img_url).await?.bytes().await?;
            use base64::Engine as _;
            Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
        } else {
            Err(anyhow::anyhow!("response contains neither b64_json nor url"))
        }
    }
}

#[tauri::command]
pub async fn generate_image(app: tauri::AppHandle<Wry>) -> Result<GalleryItem, String> {
    let preview = starred_prompt_preview(&app).await?;
    save_generated_image(&app, preview.prompt, preview.point_ids, preview.source_points).await
}

#[tauri::command]
pub async fn prepare_gallery_image_prompt(app: tauri::AppHandle<Wry>) -> Result<GalleryPromptPreview, String> {
    starred_prompt_preview(&app).await
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
