use std::path::PathBuf;
use tauri::Wry;
use serde::{Deserialize, Serialize};

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

    let final_url = resp.url().clone();
    let raw = resp.text().await.map_err(|e| e.to_string())?;
    Ok(extract_page_content(&raw, &final_url))
}

fn extract_page_content(raw: &str, base_url: &reqwest::Url) -> FetchedPage {
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
    let img_sel = Selector::parse("img").expect("valid");
    let caption_sel = Selector::parse("figcaption").expect("valid");

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
        if tag != "figure" && has_ancestor_tag(&el, "figure") {
            continue;
        }
        if tag == "figure" {
            if let Some(img) = el.select(&img_sel).next() {
                if let Some(src) = image_src(&img) {
                    let src = absolutize_src(&src, base_url);
                    let alt = img.value().attr("alt").unwrap_or("");
                    let caption = el.select(&caption_sel).next()
                        .map(|c| c.text().collect::<String>().trim().to_string())
                        .filter(|s| !s.is_empty());
                    html_parts.push(image_html(&src, alt, caption.as_deref()));
                }
            }
        } else if tag == "img" {
            if let Some(src) = image_src(&el) {
                let src = absolutize_src(&src, base_url);
                let alt = el.value().attr("alt").unwrap_or("");
                html_parts.push(image_html(&src, alt, None));
            }
        } else {
            let text: String = el.text().collect::<String>();
            let text = text.trim().to_string();
            if text.is_empty() { continue; }
            html_parts.push(format!("<{tag}>{}</{tag}>", escape_html_text(&text)));
            text_lines.push(text);
        }
    }

    FetchedPage {
        html: html_parts.join("\n"),
        text: text_lines.join("\n"),
        title,
    }
}

fn has_ancestor_tag(el: &scraper::ElementRef<'_>, tag_name: &str) -> bool {
    el.ancestors().skip(1).any(|ancestor| {
        ancestor
            .value()
            .as_element()
            .map_or(false, |value| value.name() == tag_name)
    })
}

fn image_src(el: &scraper::ElementRef<'_>) -> Option<String> {
    ["src", "data-src", "data-original", "data-lazy-src"]
        .iter()
        .find_map(|name| el.value().attr(name))
        .map(str::trim)
        .filter(|src| !src.is_empty())
        .map(ToString::to_string)
}

fn absolutize_src(src: &str, base_url: &reqwest::Url) -> String {
    if src.starts_with("data:") {
        return src.to_string();
    }
    base_url
        .join(src)
        .map(|url| url.to_string())
        .unwrap_or_else(|_| src.to_string())
}

fn image_html(src: &str, alt: &str, caption: Option<&str>) -> String {
    let src = escape_html_attr(src);
    let alt = escape_html_attr(alt);
    match caption.map(str::trim).filter(|s| !s.is_empty()) {
        Some(caption) => format!(
            r#"<figure><img src="{src}" alt="{alt}" /><figcaption>{}</figcaption></figure>"#,
            escape_html_text(caption)
        ),
        None => format!(r#"<img src="{src}" alt="{alt}" />"#),
    }
}

fn escape_html_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_html_attr(value: &str) -> String {
    escape_html_text(value)
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[tauri::command]
pub async fn describe_image(app: tauri::AppHandle<Wry>, image_url: String) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Resp { choices: Vec<Choice> }
    #[derive(Deserialize)]
    struct Choice { message: Msg }
    #[derive(Deserialize)]
    struct Msg { content: String }

    let config = crate::commands::config::get_config(app)?;
    if config.openai_api_key.is_empty() {
        return Err("尚未配置 API Key".to_string());
    }
    if image_url.trim().is_empty() {
        return Err("图片地址为空".to_string());
    }

    let endpoint = crate::commands::config::completions_endpoint(
        &config.openai_base_url,
        "openai-compat",
        "",
    );
    let body = serde_json::json!({
        "model": config.openai_model,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "请用中文用一到两句话描述这张图。只描述可见内容和它可能承载的信息，不要编造图中没有的文字或结论。直接输出图像说明。"
                },
                {
                    "type": "image_url",
                    "image_url": { "url": image_url }
                }
            ]
        }],
        "temperature": 0.2
    });

    let client = reqwest::Client::new();
    let mut builder = client
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

    let resp = builder.send().await.map_err(|e| format!("图像说明请求失败: {e}"))?;
    let status = resp.status();
    let raw = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("图像说明失败 ({status}): {raw}"));
    }
    let parsed: Resp = serde_json::from_str(&raw)
        .map_err(|e| format!("图像说明响应解析失败: {e}"))?;
    Ok(parsed
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content.trim().to_string())
        .unwrap_or_default())
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
    for (index, chunk) in chunks.into_iter().enumerate() {
        let (api_key, model, base_url, headers, name, style) = (
            config.openai_api_key.clone(), config.openai_model.clone(),
            config.openai_base_url.clone(), config.extra_headers.clone(),
            config.commentator_name.clone(), config.commentator_style.clone(),
        );
        let app = app.clone();
        handles.push(tokio::spawn(async move {
            if let Ok(mut card) = openai::analyze_chunk(&api_key, &model, &base_url, &headers, &chunk, &name, &style).await {
                card.index = index;
                let _ = app.emit("chunk_card", &card);
            }
        }));
    }
    for h in handles { let _ = h.await; }
    let _ = app.emit("chunk_cards_done", ());
    Ok(())
}
