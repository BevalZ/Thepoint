use std::path::PathBuf;
use tauri::Wry;
use serde::Serialize;

use crate::ai::{openai, ExtractedPoint};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedPage {
    pub html: String,
    pub text: String,
    pub title: Option<String>,
}

/// Fetch a URL and extract readable content (rich HTML + plain text + title).
#[tauri::command]
pub async fn fetch_url(url: String) -> Result<FetchedPage, String> {
    let resp = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (compatible; DeepExplorer/1.0)")
        .build()
        .map_err(|e| e.to_string())?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {e}"))?;

    let raw = resp.text().await.map_err(|e| e.to_string())?;
    Ok(extract_page_content(&raw))
}

fn extract_page_content(raw: &str) -> FetchedPage {
    use scraper::{Html, Selector};

    let doc = Html::parse_document(raw);

    // title
    let title = Selector::parse("title").ok()
        .and_then(|s| doc.select(&s).next())
        .map(|el| el.text().collect::<String>().trim().to_string())
        .filter(|s| !s.is_empty());

    // noise tags to strip
    let noise_sel = Selector::parse("script,style,nav,footer,aside,header,noscript,iframe,form,button")
        .expect("valid");
    let noise_ids: std::collections::HashSet<_> = doc.select(&noise_sel).map(|e| e.id()).collect();

    // prefer <article> or <main>, fall back to <body>
    let root_sel = Selector::parse("article,main,body").expect("valid");
    let root = doc.select(&root_sel).next();

    // rebuild clean HTML: walk content elements, keep img tags
    let content_sel = Selector::parse("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,img,figure,table,td,th")
        .expect("valid");

    let mut html_parts: Vec<String> = Vec::new();
    let mut text_lines: Vec<String> = Vec::new();

    let elements: Vec<_> = match root {
        Some(r) => r.select(&content_sel).collect(),
        None => doc.select(&content_sel).collect(),
    };

    for el in elements {
        if el.ancestors().any(|a| a.value().as_element().map_or(false, |_| noise_ids.contains(&a.id()))) {
            continue;
        }
        let tag = el.value().name();
        if tag == "img" {
            if let Some(src) = el.value().attr("src") {
                let alt = el.value().attr("alt").unwrap_or("");
                html_parts.push(format!(r#"<img src="{src}" alt="{alt}" />"#));
            }
        } else {
            let text: String = el.text().collect::<String>();
            let text = text.trim().to_string();
            if text.is_empty() { continue; }
            html_parts.push(format!("<{tag}>{text}</{tag}>"));
            text_lines.push(text);
        }
    }

    FetchedPage {
        html: html_parts.join("\n"),
        text: text_lines.join("\n"),
        title,
    }
}

/// Extract points in streaming mode: splits text into chunks, emits each chunk's points as they complete.
/// Emits "points_chunk" events with Vec<ExtractedPoint> payloads.
#[tauri::command]
pub async fn extract_text_streaming(
    app: tauri::AppHandle<Wry>,
    text: String,
) -> Result<(), String> {
    use tauri::Emitter;
    let config = crate::commands::config::get_config(app.clone())?;
    let api_key = config.openai_api_key.clone();
    let model = config.openai_model.clone();
    let base_url = config.openai_base_url.clone();
    let headers = config.extra_headers.clone();

    // Step 1: split into thematic chunks
    let chunks = openai::split_chunks(&api_key, &model, &base_url, &headers, &text)
        .await
        .map_err(|e| e.to_string())?;

    // Step 2: extract each chunk concurrently, emit as completed
    let mut handles = Vec::new();
    for chunk in chunks {
        let api_key = api_key.clone();
        let model = model.clone();
        let base_url = base_url.clone();
        let headers = headers.clone();
        let app = app.clone();
        handles.push(tokio::spawn(async move {
            match openai::extract_chunk(&api_key, &model, &base_url, &headers, &chunk).await {
                Ok(points) if !points.is_empty() => {
                    let _ = app.emit("points_chunk", &points);
                }
                _ => {}
            }
        }));
    }
    for h in handles { let _ = h.await; }
    let _ = app.emit("points_done", ());
    Ok(())
}


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

/// Analyze text streaming: split → per-chunk analyze → emit "chunk_card", then "chunk_cards_done".
#[tauri::command]
pub async fn analyze_text_streaming(
    app: tauri::AppHandle<Wry>,
    text: String,
) -> Result<(), String> {
    use tauri::Emitter;
    let config = crate::commands::config::get_config(app.clone())?;
    let chunks = openai::split_chunks(
        &config.openai_api_key, &config.openai_model,
        &config.openai_base_url, &config.extra_headers, &text,
    ).await.map_err(|e| e.to_string())?;

    let mut handles = Vec::new();
    for chunk in chunks {
        let (api_key, model, base_url, headers, name, style) = (
            config.openai_api_key.clone(), config.openai_model.clone(),
            config.openai_base_url.clone(), config.extra_headers.clone(),
            config.commentator_name.clone(), config.commentator_style.clone(),
        );
        let app = app.clone();
        handles.push(tokio::spawn(async move {
            if let Ok(card) = openai::analyze_chunk(&api_key, &model, &base_url, &headers, &chunk, &name, &style).await {
                let _ = app.emit("chunk_card", &card);
            }
        }));
    }
    for h in handles { let _ = h.await; }
    let _ = app.emit("chunk_cards_done", ());
    Ok(())
}
