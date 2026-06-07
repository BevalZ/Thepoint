// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
mod parsers;
mod ai;
mod search;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::config::get_config,
            commands::config::set_config,
            commands::config::fetch_models,
            commands::config::get_profiles,
            commands::config::set_profiles,
            commands::extract::parse_document,
            commands::extract::get_file_metadata,
            commands::extract::extract_text,
            commands::extract::extract_text_streaming,
            commands::extract::fetch_url,
            commands::extract::describe_image,
            commands::extract::analyze_text_streaming,
            commands::library::save_points,
            commands::library::list_points,
            commands::library::search_points,
            commands::library::delete_point,
            commands::library::archive_point,
            commands::library::unarchive_point,
            commands::library::list_archived_points,
            commands::library::star_point,
            commands::library::unstar_point,
            commands::library::get_starred_count,
            commands::explore::list_mental_models,
            commands::explore::recommend_frameworks,
            commands::explore::deepen_point,
            commands::explore::find_similar,
            commands::digest::generate_digest,
            commands::gallery::generate_image,
            commands::gallery::list_gallery,
            commands::gallery::delete_gallery_item,
            commands::gallery::retry_download,
            commands::analytics::get_analytics,
            commands::analytics::get_explore_suggestions,
            commands::suggestions::generate_suggestion,
            commands::suggestions::save_suggestion,
            commands::suggestions::list_suggestions_by_date,
            commands::suggestions::get_suggestion,
            commands::suggestions::list_marked_dates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
