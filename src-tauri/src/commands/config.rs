use serde::{Deserialize, Serialize};
use tauri::Wry;
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "config.json";
const KEY_API: &str = "openai_api_key";
const KEY_MODEL: &str = "openai_model";
const DEFAULT_MODEL: &str = "gpt-4o-mini";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub openai_api_key: String,
    pub openai_model: String,
}

#[tauri::command]
pub fn get_config(app: tauri::AppHandle<Wry>) -> Result<AppConfig, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    let openai_api_key = store
        .get(KEY_API)
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_default();

    let openai_model = store
        .get(KEY_MODEL)
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| DEFAULT_MODEL.to_string());

    Ok(AppConfig {
        openai_api_key,
        openai_model,
    })
}

#[tauri::command]
pub fn set_config(app: tauri::AppHandle<Wry>, config: AppConfig) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;

    store.set(KEY_API, config.openai_api_key);
    store.set(KEY_MODEL, config.openai_model);
    store.save().map_err(|e| e.to_string())?;

    Ok(())
}
