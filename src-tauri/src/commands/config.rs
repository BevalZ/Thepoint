use serde::{Deserialize, Serialize};
use tauri::Wry;
use tauri_plugin_store::StoreExt;


const STORE_FILE: &str = "config.json";
const KEY_API: &str = "openai_api_key";
const KEY_MODEL: &str = "openai_model";
const KEY_BASE_URL: &str = "openai_base_url";
const KEY_IMAGE_BASE_URL: &str = "image_base_url";
const KEY_IMAGE_API_KEY: &str = "image_api_key";
const KEY_IMAGE_MODEL: &str = "image_model";
const KEY_PROFILES: &str = "config_profiles";
const DEFAULT_MODEL: &str = "gpt-4o-mini";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub openai_api_key: String,
    pub openai_model: String,
    pub openai_base_url: String,
    pub image_base_url: String,
    pub image_api_key: String,
    pub image_model: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConfigProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub image_base_url: Option<String>,
    pub image_api_key: Option<String>,
    pub image_model: Option<String>,
}

/// Normalise base URL → chat completions endpoint.
pub fn completions_endpoint(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    let base = if base.is_empty() { "https://api.openai.com" } else { base };
    format!("{}/v1/chat/completions", base)
}

fn models_endpoint(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    let base = if base.is_empty() { "https://api.openai.com" } else { base };
    format!("{}/v1/models", base)
}

#[tauri::command]
pub fn get_config(app: tauri::AppHandle<Wry>) -> Result<AppConfig, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    Ok(AppConfig {
        openai_api_key: store.get(KEY_API)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        openai_model: store.get(KEY_MODEL)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| DEFAULT_MODEL.to_string()),
        openai_base_url: store.get(KEY_BASE_URL)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        image_base_url: store.get(KEY_IMAGE_BASE_URL)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        image_api_key: store.get(KEY_IMAGE_API_KEY)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        image_model: store.get(KEY_IMAGE_MODEL)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
    })
}

#[tauri::command]
pub fn set_config(app: tauri::AppHandle<Wry>, config: AppConfig) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(KEY_API, config.openai_api_key.as_str());
    store.set(KEY_MODEL, config.openai_model.as_str());
    store.set(KEY_BASE_URL, config.openai_base_url.as_str());
    store.set(KEY_IMAGE_BASE_URL, config.image_base_url.as_str());
    store.set(KEY_IMAGE_API_KEY, config.image_api_key.as_str());
    store.set(KEY_IMAGE_MODEL, config.image_model.as_str());
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_profiles(app: tauri::AppHandle<Wry>) -> Result<Vec<ConfigProfile>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    match store.get(KEY_PROFILES) {
        None => Ok(vec![]),
        Some(v) => serde_json::from_value(v).map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub fn set_profiles(app: tauri::AppHandle<Wry>, profiles: Vec<ConfigProfile>) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let val = serde_json::to_value(&profiles).map_err(|e| e.to_string())?;
    store.set(KEY_PROFILES, val);
    store.save().map_err(|e| e.to_string())
}

/// Fetch available models from /v1/models.
#[tauri::command]
pub async fn fetch_models(api_key: String, base_url: String) -> Result<Vec<String>, String> {
    if api_key.is_empty() {
        return Err("尚未配置 API Key".to_string());
    }
    #[derive(Deserialize)]
    struct ModelItem { id: String }
    #[derive(Deserialize)]
    struct ModelsResp { data: Vec<ModelItem> }

    let resp = reqwest::Client::new()
        .get(models_endpoint(&base_url))
        .bearer_auth(&api_key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let raw = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("获取模型列表失败 ({status}): {raw}"));
    }
    let parsed: ModelsResp = serde_json::from_str(&raw)
        .map_err(|e| format!("解析模型列表失败: {e}"))?;
    let mut ids: Vec<String> = parsed.data.into_iter().map(|m| m.id).collect();
    ids.sort();
    Ok(ids)
}
