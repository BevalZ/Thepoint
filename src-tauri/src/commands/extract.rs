use std::path::PathBuf;
use tauri::Wry;

use crate::ai::{openai, ExtractedPoint};

/// Parse a document file into plain text, dispatching by extension.
#[tauri::command]
pub async fn parse_document(file_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || crate::parsers::parse_document(&PathBuf::from(file_path)))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}

/// Extract points from raw text via the configured OpenAI model.
#[tauri::command]
pub async fn extract_text(
    app: tauri::AppHandle<Wry>,
    text: String,
) -> Result<Vec<ExtractedPoint>, String> {
    let config = crate::commands::config::get_config(app)?;
    openai::extract_points(&config.openai_api_key, &config.openai_model, &config.openai_base_url, &config.extra_headers, &text)
        .await
        .map_err(|e| e.to_string())
}
