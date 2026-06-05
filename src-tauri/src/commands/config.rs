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
const KEY_PROVIDER_KEY: &str = "provider_key";
const KEY_CUSTOM_ENDPOINT: &str = "custom_endpoint";
const KEY_CUSTOM_PROVIDER_NAME: &str = "custom_provider_name";
const KEY_EXTRA_HEADERS: &str = "extra_headers";
const KEY_SEARCH_ENABLED: &str = "search_enabled";
const KEY_SEARCH_API_KEY: &str = "search_api_key";
const KEY_SEARCH_MODEL: &str = "search_model";
const KEY_SEARCH_BASE_URL: &str = "search_base_url";
const KEY_SEARCH_PROVIDER_KEY: &str = "search_provider_key";
const KEY_SEARCH_CUSTOM_ENDPOINT: &str = "search_custom_endpoint";
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
    pub provider_key: String,
    pub custom_endpoint: String,
    pub custom_provider_name: String,
    pub extra_headers: String,
    pub search_enabled: bool,
    pub search_api_key: String,
    pub search_model: String,
    pub search_base_url: String,
    pub search_provider_key: String,
    pub search_custom_endpoint: String,
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

/// Normalise base URL + provider_key → chat completions endpoint.
pub fn completions_endpoint(base_url: &str, provider_key: &str, custom_endpoint: &str) -> String {
    if provider_key == "custom" {
        if custom_endpoint.trim().is_empty() {
            // fallback: append openai suffix to base_url
            let base = base_url.trim().trim_end_matches('/');
            let base = if base.is_empty() { "https://api.openai.com" } else { base };
            return format!("{}/v1/chat/completions", base);
        }
        return custom_endpoint.to_string();
    }
    let base = base_url.trim().trim_end_matches('/');
    let base = if base.is_empty() { "https://api.openai.com" } else { base };
    let suffix = if provider_key == "anthropic-compat" {
        "/v1/messages"
    } else {
        "/v1/chat/completions"
    };
    format!("{}{}", base, suffix)
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
        provider_key: store.get(KEY_PROVIDER_KEY)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "openai-compat".to_string()),
        custom_endpoint: store.get(KEY_CUSTOM_ENDPOINT)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        custom_provider_name: store.get(KEY_CUSTOM_PROVIDER_NAME)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        extra_headers: store.get(KEY_EXTRA_HEADERS)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "{}".to_string()),
        search_enabled: store.get(KEY_SEARCH_ENABLED)
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        search_api_key: store.get(KEY_SEARCH_API_KEY)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        search_model: store.get(KEY_SEARCH_MODEL)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        search_base_url: store.get(KEY_SEARCH_BASE_URL)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default(),
        search_provider_key: store.get(KEY_SEARCH_PROVIDER_KEY)
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_else(|| "openai-compat".to_string()),
        search_custom_endpoint: store.get(KEY_SEARCH_CUSTOM_ENDPOINT)
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
    store.set(KEY_PROVIDER_KEY, config.provider_key.as_str());
    store.set(KEY_CUSTOM_ENDPOINT, config.custom_endpoint.as_str());
    store.set(KEY_CUSTOM_PROVIDER_NAME, config.custom_provider_name.as_str());
    store.set(KEY_EXTRA_HEADERS, config.extra_headers.as_str());
    store.set(KEY_SEARCH_ENABLED, config.search_enabled);
    store.set(KEY_SEARCH_API_KEY, config.search_api_key.as_str());
    store.set(KEY_SEARCH_MODEL, config.search_model.as_str());
    store.set(KEY_SEARCH_BASE_URL, config.search_base_url.as_str());
    store.set(KEY_SEARCH_PROVIDER_KEY, config.search_provider_key.as_str());
    store.set(KEY_SEARCH_CUSTOM_ENDPOINT, config.search_custom_endpoint.as_str());
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
