use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
};
use tauri::Wry;

use crate::ai::{openai, ExtractedPoint};
use crate::db::SourceDocumentRecord;

const EDGE_REVIEW_CHARS: usize = 220;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedPage {
    pub html: String,
    pub text: String,
    pub title: Option<String>,
    pub url: String,
    pub author: Option<String>,
    pub published_at: Option<String>,
    pub reading_time: Option<String>,
}

struct PagePart {
    html: String,
    text: Option<String>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq)]
struct EdgeTrim {
    head: usize,
    tail: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub file_path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertSourceDocumentInput {
    pub kind: String,
    pub canonical_uri: String,
    pub title: Option<String>,
    pub metadata: serde_json::Value,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactCheckSource {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub snippet: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactCheckResult {
    #[serde(default)]
    pub claim: String,
    #[serde(default)]
    pub answer: String,
    #[serde(default)]
    pub context: String,
    #[serde(default)]
    pub extra: Vec<String>,
    #[serde(default)]
    pub sources: Vec<FactCheckSource>,
}

fn parse_fact_check_content(content: &str, claim: &str, context: &str) -> FactCheckResult {
    let trimmed = content.trim();
    let json_text = if trimmed.starts_with('{') {
        Some(trimmed)
    } else {
        let start = trimmed.find('{');
        let end = trimmed.rfind('}');
        match (start, end) {
            (Some(start), Some(end)) if start < end => Some(&trimmed[start..=end]),
            _ => None,
        }
    };

    if let Some(json_text) = json_text {
        if let Ok(mut result) = serde_json::from_str::<FactCheckResult>(json_text) {
            if result.claim.trim().is_empty() {
                result.claim = claim.to_string();
            }
            if result.context.trim().is_empty() {
                result.context = context.chars().take(220).collect();
            }
            result.sources.retain(|source| !source.url.trim().is_empty());
            result.sources.truncate(4);
            result.extra.truncate(4);
            return result;
        }
    }

    FactCheckResult {
        claim: claim.to_string(),
        answer: trimmed.to_string(),
        context: context.chars().take(220).collect(),
        extra: Vec::new(),
        sources: Vec::new(),
    }
}

/// Fetch a URL and extract readable content (rich HTML + plain text + title).
#[tauri::command]
pub async fn fetch_url(app: tauri::AppHandle<Wry>, url: String) -> Result<FetchedPage, String> {
    let config = crate::commands::config::get_config(app.clone())?;
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
    let page = extract_page_content(&raw, &final_url);
    Ok(clean_page_edges_with_ai(&config, page).await)
}

#[tauri::command]
pub async fn get_file_metadata(file_path: String) -> Result<FileMetadata, String> {
    tokio::task::spawn_blocking(move || {
        let path = PathBuf::from(&file_path);
        let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .map_or_else(|| file_path.clone(), ToString::to_string);

        Ok(FileMetadata {
            file_path,
            file_name,
            size_bytes: metadata.len(),
            created_at: metadata.created().ok().map(system_time_to_rfc3339),
            modified_at: metadata.modified().ok().map(system_time_to_rfc3339),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn upsert_source_document(
    app: tauri::AppHandle<Wry>,
    input: UpsertSourceDocumentInput,
) -> Result<SourceDocumentRecord, String> {
    let path = crate::db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        let conn = crate::db::open_db(&path)?;
        let metadata_json = serde_json::to_string(&input.metadata)?;
        crate::db::upsert_source_document(
            &conn,
            &input.kind,
            &input.canonical_uri,
            input.title.as_deref(),
            &metadata_json,
        )
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}

fn system_time_to_rfc3339(time: std::time::SystemTime) -> String {
    let datetime: chrono::DateTime<chrono::Utc> = time.into();
    datetime.to_rfc3339()
}

fn extract_page_content(raw: &str, base_url: &reqwest::Url) -> FetchedPage {
    use scraper::{Html, Selector};

    let doc = Html::parse_document(raw);

    // title
    let title = Selector::parse("title")
        .ok()
        .and_then(|s| doc.select(&s).next())
        .map(|el| el.text().collect::<String>().trim().to_string())
        .filter(|s| !s.is_empty());
    let mut author = meta_value(&doc, &["author", "article:author", "byl"]);
    let mut published_at = meta_value(&doc, &[
        "article:published_time",
        "published_time",
        "publishdate",
        "date",
        "datePublished",
        "pubdate",
    ]);
    let mut reading_time = meta_value(&doc, &["twitter:data1", "reading_time", "readtime"]);

    // noise tags to strip
    let noise_ids: HashSet<_> =
        Selector::parse("script,style,nav,footer,aside,header,noscript,iframe,form,button")
            .ok()
            .map(|selector| doc.select(&selector).map(|e| node_id_key(e.id())).collect())
            .unwrap_or_default();

    // rebuild clean HTML: walk content elements, keep img tags
    let content_sel =
        match Selector::parse("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,img,figure,table,td,th") {
            Ok(selector) => selector,
            Err(_) => {
                return FetchedPage {
                    html: String::new(),
                    text: String::new(),
                    title,
                    url: base_url.to_string(),
                    author,
                    published_at,
                    reading_time,
                };
            }
        };
    let link_sel = Selector::parse("a").ok();
    let candidate_sel = Selector::parse(
        "article,main,[role=main],#content,#main,.content,.post,.entry,.article,.post-content,.entry-content,.article-content,.markdown-body",
    )
    .ok();
    let body_sel = Selector::parse("body").ok();
    let root = select_article_root(
        &doc,
        candidate_sel.as_ref(),
        body_sel.as_ref(),
        &content_sel,
        link_sel.as_ref(),
        &noise_ids,
    );
    let img_sel = Selector::parse("img").ok();
    let caption_sel = Selector::parse("figcaption").ok();

    let mut parts: Vec<PagePart> = Vec::new();
    let mut text_lines: Vec<String> = Vec::new();
    let mut seen_images: HashMap<String, SeenImage> = HashMap::new();

    let elements: Vec<_> = match root {
        Some(r) => r.select(&content_sel).collect(),
        None => doc.select(&content_sel).collect(),
    };

    for el in elements {
        if el.ancestors().any(|a| {
            a.value()
                .as_element()
                .map_or(false, |_| noise_ids.contains(&node_id_key(a.id())))
        }) {
            continue;
        }
        let tag = el.value().name();
        if tag != "figure" && has_ancestor_tag(&el, "figure") {
            continue;
        }
        if tag == "figure" {
            if let Some(img) = img_sel
                .as_ref()
                .and_then(|selector| el.select(selector).next())
            {
                if let Some(src) = image_src(&img) {
                    let src = absolutize_src(&src, base_url);
                    let alt = img.value().attr("alt").unwrap_or("");
                    let caption = caption_sel
                        .as_ref()
                        .and_then(|selector| el.select(selector).next())
                        .map(|c| c.text().collect::<String>().trim().to_string())
                        .filter(|s| !s.is_empty());
                    push_image_html(
                        &mut parts,
                        &mut seen_images,
                        &src,
                        alt,
                        caption.as_deref(),
                    );
                }
            }
        } else if tag == "img" {
            if let Some(src) = image_src(&el) {
                let src = absolutize_src(&src, base_url);
                let alt = el.value().attr("alt").unwrap_or("");
                push_image_html(&mut parts, &mut seen_images, &src, alt, None);
            }
        } else {
            let text: String = el.text().collect::<String>();
            let text = text.trim().to_string();
            if text.is_empty() {
                continue;
            }
            if is_page_chrome_text(&text) {
                continue;
            }
            if is_initial_article_metadata(
                &text,
                title.as_deref(),
                &mut author,
                &mut published_at,
                &mut reading_time,
                text_lines.is_empty(),
            ) {
                continue;
            }
            parts.push(PagePart {
                html: format!("<{tag}>{}</{tag}>", escape_html_text(&text)),
                text: Some(text.clone()),
            });
            text_lines.push(text);
        }
    }

    apply_deterministic_edge_trim(&mut parts, &mut text_lines);

    FetchedPage {
        html: parts.into_iter().map(|part| part.html).collect::<Vec<_>>().join("\n"),
        text: text_lines.join("\n"),
        title,
        url: base_url.to_string(),
        author,
        published_at,
        reading_time,
    }
}

fn select_article_root<'a>(
    doc: &'a Html,
    candidate_sel: Option<&Selector>,
    body_sel: Option<&Selector>,
    content_sel: &Selector,
    link_sel: Option<&Selector>,
    noise_ids: &HashSet<String>,
) -> Option<scraper::ElementRef<'a>> {
    let mut best: Option<(scraper::ElementRef<'a>, i64)> = None;
    if let Some(selector) = candidate_sel {
        for candidate in doc.select(selector) {
            if candidate.ancestors().any(|a| {
                a.value()
                    .as_element()
                    .map_or(false, |_| noise_ids.contains(&node_id_key(a.id())))
            }) {
                continue;
            }
            let score = article_candidate_score(&candidate, content_sel, link_sel, noise_ids);
            if score > best.as_ref().map_or(i64::MIN, |(_, value)| *value) {
                best = Some((candidate, score));
            }
        }
    }

    if let Some((candidate, score)) = best {
        if score > 0 {
            return Some(candidate);
        }
    }

    body_sel.and_then(|selector| doc.select(selector).next())
}

fn apply_deterministic_edge_trim(parts: &mut Vec<PagePart>, text_lines: &mut Vec<String>) {
    let trim = deterministic_edge_trim(text_lines);
    apply_edge_trim(parts, text_lines, trim);
}

fn deterministic_edge_trim(text_lines: &[String]) -> EdgeTrim {
    let head = text_lines
        .iter()
        .take_while(|line| is_edge_noise_text(line))
        .count();
    let tail = text_lines
        .iter()
        .rev()
        .take_while(|line| is_edge_noise_text(line))
        .count();
    EdgeTrim { head, tail }
}

fn apply_edge_trim(parts: &mut Vec<PagePart>, text_lines: &mut Vec<String>, trim: EdgeTrim) {
    if text_lines.is_empty() {
        return;
    }
    let max_trim = text_lines.len().saturating_sub(1);
    let head = trim.head.min(max_trim);
    let tail = trim.tail.min(max_trim.saturating_sub(head));
    if head == 0 && tail == 0 {
        return;
    }

    let keep_start = head;
    let keep_end = text_lines.len().saturating_sub(tail);
    let mut text_index = 0_usize;
    parts.retain(|part| {
        if part.text.is_none() {
            return text_index >= keep_start && text_index < keep_end;
        }
        let keep = text_index >= keep_start && text_index < keep_end;
        text_index += 1;
        keep
    });
    *text_lines = text_lines[keep_start..keep_end].to_vec();
}

fn trim_fetched_page_edges(mut page: FetchedPage, trim: EdgeTrim) -> FetchedPage {
    if trim.head == 0 && trim.tail == 0 {
        return page;
    }
    let mut parts = page
        .html
        .lines()
        .map(|html| PagePart {
            html: html.to_string(),
            text: html_text_line(html),
        })
        .collect::<Vec<_>>();
    let mut text_lines = page
        .text
        .lines()
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    apply_edge_trim(&mut parts, &mut text_lines, trim);
    page.html = parts.into_iter().map(|part| part.html).collect::<Vec<_>>().join("\n");
    page.text = text_lines.join("\n");
    page
}

fn html_text_line(html: &str) -> Option<String> {
    let trimmed = html.trim();
    if trimmed.starts_with("<img") || trimmed.starts_with("<figure") {
        return None;
    }
    let mut out = String::new();
    let mut in_tag = false;
    for ch in trimmed.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    let text = out
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .trim()
        .to_string();
    (!text.is_empty()).then_some(text)
}

fn is_edge_noise_text(text: &str) -> bool {
    let normalized = normalize_inline(text);
    let lower = normalized.to_lowercase();
    let len = normalized.chars().count();
    if normalized.is_empty() {
        return true;
    }
    if len <= 2 && normalized.chars().all(|ch| matches!(ch, '←' | '→' | '↑' | '↓' | '<' | '>' | '›' | '‹')) {
        return true;
    }
    if len <= 18 && matches!(
        normalized.as_str(),
        "分类" | "分类:" | "分类：" | "上一篇" | "下一篇" | "最近内容" | "推荐" | "相关阅读" | "周刊"
    ) {
        return true;
    }
    let edge_patterns = [
        "上一篇",
        "下一篇",
        "最近内容",
        "相关文章",
        "相关阅读",
        "返回首页",
        "rss符号",
        "rss 图标",
        "rss图标",
        "订阅源",
        "获取网站内容的更新",
    ];
    edge_patterns.iter().any(|pattern| lower.contains(pattern))
}

async fn clean_page_edges_with_ai(
    config: &crate::commands::config::AppConfig,
    page: FetchedPage,
) -> FetchedPage {
    if config.openai_api_key.trim().is_empty() || page.text.chars().count() < 240 {
        return page;
    }
    match suggest_edge_trim(config, &page.text).await {
        Ok(trim) => trim_fetched_page_edges(page, trim),
        Err(error) => {
            println!("[Extract] edge cleanup skipped: {error}");
            page
        }
    }
}

async fn suggest_edge_trim(
    config: &crate::commands::config::AppConfig,
    text: &str,
) -> anyhow::Result<EdgeTrim> {
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

    let lines = text
        .lines()
        .map(normalize_inline)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    if lines.len() < 4 {
        return Ok(EdgeTrim::default());
    }

    let head = edge_review_lines(lines.iter(), EDGE_REVIEW_CHARS);
    let tail = edge_review_lines(lines.iter().rev(), EDGE_REVIEW_CHARS);
    let max_head = head.len();
    let max_tail = tail.len();
    let user = format!(
        "请判断网页正文抽取结果的开头和结尾是否仍混入无意义页眉/页脚/导航噪音。只允许裁剪连续的首部行和连续的尾部行，不要裁剪正文。返回 JSON：{{\"head\":数字,\"tail\":数字}}。\n\n开头候选：\n{}\n\n结尾候选：\n{}",
        numbered_lines(&head),
        numbered_lines(&tail.into_iter().rev().collect::<Vec<_>>())
    );
    let endpoint = crate::commands::config::completions_endpoint(
        &config.openai_base_url,
        &config.provider_key,
        &config.custom_endpoint,
    );
    let body = serde_json::json!({
        "model": config.openai_model,
        "messages": [
            {
                "role": "system",
                "content": "你是网页正文边界清理器。噪音包括：RSS说明、上一篇/下一篇、分类、推荐、最近内容、导航箭头、站点菜单、广告和无意义图标说明。正文包括文章标题之后的真实段落、论点、叙述、数据和引用。只能返回 JSON，不要解释。"
            },
            { "role": "user", "content": user }
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.0
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
        anyhow::bail!("AI edge trim failed ({status}): {raw}");
    }
    let parsed: Resp = serde_json::from_str(&raw)?;
    let content = parsed
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content)
        .unwrap_or_default();
    parse_edge_trim(&content, max_head, max_tail)
}

fn edge_review_lines<'a, I>(lines: I, char_limit: usize) -> Vec<String>
where
    I: Iterator<Item = &'a String>,
{
    let mut out = Vec::new();
    let mut chars = 0_usize;
    for line in lines {
        let len = line.chars().count();
        if !out.is_empty() && chars + len > char_limit {
            break;
        }
        chars += len;
        out.push(line.clone());
        if out.len() >= 8 {
            break;
        }
    }
    out
}

fn numbered_lines(lines: &[String]) -> String {
    lines
        .iter()
        .enumerate()
        .map(|(index, line)| format!("{}: {}", index + 1, line))
        .collect::<Vec<_>>()
        .join("\n")
}

fn parse_edge_trim(content: &str, max_head: usize, max_tail: usize) -> anyhow::Result<EdgeTrim> {
    #[derive(Deserialize)]
    struct Payload {
        #[serde(default)]
        head: usize,
        #[serde(default)]
        tail: usize,
    }

    let trimmed = content.trim();
    let json_text = if trimmed.starts_with('{') {
        trimmed
    } else {
        let start = trimmed
            .find('{')
            .ok_or_else(|| anyhow::anyhow!("missing edge trim json"))?;
        let end = trimmed
            .rfind('}')
            .ok_or_else(|| anyhow::anyhow!("missing edge trim json"))?;
        &trimmed[start..=end]
    };
    let payload: Payload = serde_json::from_str(json_text)?;
    Ok(EdgeTrim {
        head: payload.head.min(max_head),
        tail: payload.tail.min(max_tail),
    })
}

fn article_candidate_score(
    candidate: &scraper::ElementRef<'_>,
    content_sel: &Selector,
    link_sel: Option<&Selector>,
    noise_ids: &HashSet<String>,
) -> i64 {
    let mut text_len = 0_i64;
    let mut paragraph_count = 0_i64;
    let mut heading_count = 0_i64;
    let mut noise_line_count = 0_i64;
    let mut image_count = 0_i64;

    for el in candidate.select(content_sel) {
        if el.ancestors().any(|a| {
            a.value()
                .as_element()
                .map_or(false, |_| noise_ids.contains(&node_id_key(a.id())))
        }) {
            continue;
        }
        let tag = el.value().name();
        if tag == "img" || tag == "figure" {
            image_count += 1;
            continue;
        }
        let text = normalize_inline(&el.text().collect::<String>());
        if text.is_empty() {
            continue;
        }
        let len = text.chars().count() as i64;
        text_len += len;
        if matches!(tag, "p" | "blockquote" | "li") && len >= 18 && !is_page_chrome_text(&text) {
            paragraph_count += 1;
        }
        if matches!(tag, "h1" | "h2" | "h3") {
            heading_count += 1;
        }
        if is_page_chrome_text(&text) {
            noise_line_count += 1;
        }
    }

    let link_text_len = link_sel
        .map(|selector| {
            candidate
                .select(selector)
                .map(|link| normalize_inline(&link.text().collect::<String>()).chars().count() as i64)
                .sum::<i64>()
        })
        .unwrap_or(0);
    let link_penalty = if text_len > 0 {
        (link_text_len * 100 / text_len).min(100)
    } else {
        100
    };

    text_len + paragraph_count * 90 + heading_count * 20 - link_penalty * 8 - noise_line_count * 140 - image_count * 18
}

fn node_id_key<T: std::fmt::Debug>(id: T) -> String {
    format!("{id:?}")
}

fn is_page_chrome_text(text: &str) -> bool {
    let normalized = normalize_inline(text);
    let lower = normalized.to_lowercase();
    let len = normalized.chars().count();
    if normalized.is_empty() {
        return true;
    }
    if len <= 2 && normalized.chars().all(|ch| matches!(ch, '←' | '→' | '↑' | '↓' | '<' | '>' | '›' | '‹')) {
        return true;
    }
    if len <= 12 && matches!(normalized.as_str(), "分类" | "分类:" | "分类：" | "上一篇" | "下一篇" | "最近内容" | "推荐" | "相关阅读") {
        return true;
    }
    let noise_patterns = [
        "上一篇",
        "下一篇",
        "最近内容",
        "相关文章",
        "相关阅读",
        "返回首页",
        "rss符号",
        "rss 图标",
        "rss图标",
        "订阅",
        "分享",
    ];
    noise_patterns.iter().any(|pattern| lower.contains(pattern))
}

fn meta_value(doc: &Html, keys: &[&str]) -> Option<String> {
    let selector = Selector::parse("meta").ok()?;
    doc.select(&selector).find_map(|el| {
        let value = el
            .value()
            .attr("name")
            .or_else(|| el.value().attr("property"))
            .or_else(|| el.value().attr("itemprop"))?;
        if !keys.iter().any(|key| value.eq_ignore_ascii_case(key)) {
            return None;
        }
        el.value()
            .attr("content")
            .map(str::trim)
            .filter(|content| !content.is_empty())
            .map(ToString::to_string)
    })
}

fn is_initial_article_metadata(
    text: &str,
    title: Option<&str>,
    author: &mut Option<String>,
    published_at: &mut Option<String>,
    reading_time: &mut Option<String>,
    before_body_text: bool,
) -> bool {
    let normalized = normalize_inline(text);
    if normalized.is_empty() {
        return true;
    }

    if before_body_text && title.is_some_and(|value| title_matches_heading(&normalized, value)) {
        return true;
    }

    if capture_prefixed_metadata(&normalized, author, published_at, reading_time) {
        return true;
    }

    if before_body_text && is_date_only(&normalized) {
        if published_at.is_none() {
            *published_at = Some(normalized);
        }
        return true;
    }

    if before_body_text && looks_like_reading_time(&normalized) {
        if reading_time.is_none() {
            *reading_time = Some(normalized);
        }
        return true;
    }

    false
}

fn capture_prefixed_metadata(
    normalized: &str,
    author: &mut Option<String>,
    published_at: &mut Option<String>,
    reading_time: &mut Option<String>,
) -> bool {
    if let Some(value) = strip_metadata_prefix(
        normalized,
        &["作者", "撰文", "文", "编辑", "译者", "by", "author"],
    ) {
        if author.is_none() {
            *author = Some(value);
        }
        return true;
    }

    if let Some(value) = strip_metadata_prefix(
        normalized,
        &[
            "发布时间",
            "发表于",
            "发布日期",
            "发布",
            "日期",
            "时间",
            "更新时间",
            "更新",
            "published",
            "date",
        ],
    ) {
        if published_at.is_none() {
            *published_at = Some(value);
        }
        return true;
    }

    if let Some(value) = strip_metadata_prefix(
        normalized,
        &["阅读时间", "阅读时长", "预计阅读", "读完需要", "reading time", "read time"],
    ) {
        if reading_time.is_none() {
            *reading_time = Some(value);
        }
        return true;
    }

    false
}

fn strip_metadata_prefix(normalized: &str, prefixes: &[&str]) -> Option<String> {
    let lower = normalized.to_lowercase();
    for prefix in prefixes {
        let prefix_lower = prefix.to_lowercase();
        if !lower.starts_with(&prefix_lower) {
            continue;
        }
        let rest = normalized
            .chars()
            .skip(prefix.chars().count())
            .collect::<String>()
            .trim_start_matches(['：', ':', ' ', '　', '-', '—'])
            .trim()
            .to_string();
        if !rest.is_empty() {
            return Some(rest);
        }
    }
    None
}

fn title_matches_heading(heading: &str, title: &str) -> bool {
    let heading_key = comparable_text_key(heading);
    let title_key = comparable_text_key(title);
    !heading_key.is_empty()
        && (heading_key == title_key
            || title_key.starts_with(&heading_key)
            || heading_key.starts_with(&title_key))
}

fn normalize_inline(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn comparable_text_key(text: &str) -> String {
    normalize_inline(text)
        .chars()
        .filter(|ch| {
            !matches!(
                ch,
                '“' | '”' | '"' | '‘' | '’' | '\'' | '「' | '」' | '『' | '』' | '-' | '—' | '_' | ' '
            )
        })
        .collect::<String>()
        .to_lowercase()
}

fn is_date_only(normalized: &str) -> bool {
    let has_date_marker =
        normalized.contains('年') || normalized.contains('-') || normalized.contains('/');
    has_date_marker
        && normalized.chars().count() <= 32
        && normalized.chars().all(|ch| {
            ch.is_ascii_digit()
                || matches!(ch, '年' | '月' | '日' | '-' | '/' | ':' | '：' | ' ' | '　')
        })
}

fn looks_like_reading_time(normalized: &str) -> bool {
    normalized.chars().count() <= 32
        && (normalized.contains("阅读") || normalized.to_lowercase().contains("read"))
        && (normalized.contains("分钟") || normalized.to_lowercase().contains("min"))
}

#[derive(Clone)]
struct SeenImage {
    part_index: usize,
    src: String,
    alt: String,
    caption: Option<String>,
}

fn push_image_html(
    parts: &mut Vec<PagePart>,
    seen_images: &mut HashMap<String, SeenImage>,
    src: &str,
    alt: &str,
    caption: Option<&str>,
) {
    if is_noise_image(src, alt, caption) {
        return;
    }

    let key = normalize_image_src_key(src);
    if key.is_empty() {
        return;
    }

    let alt = alt.trim();
    let caption = caption.map(str::trim).filter(|value| !value.is_empty());

    if let Some(existing) = seen_images.get_mut(&key) {
        let mut changed = false;
        if existing.alt.is_empty() && !alt.is_empty() {
            existing.alt = alt.to_string();
            changed = true;
        }
        if existing.caption.is_none() {
            if let Some(caption) = caption {
                existing.caption = Some(caption.to_string());
                changed = true;
            }
        }
        if changed {
            parts[existing.part_index].html =
                image_html(&existing.src, &existing.alt, existing.caption.as_deref());
        }
        return;
    }

    let part_index = parts.len();
    parts.push(PagePart {
        html: image_html(src, alt, caption),
        text: None,
    });
    seen_images.insert(
        key,
        SeenImage {
            part_index,
            src: src.to_string(),
            alt: alt.to_string(),
            caption: caption.map(ToString::to_string),
        },
    );
}

fn is_noise_image(src: &str, alt: &str, caption: Option<&str>) -> bool {
    let joined = [src, alt, caption.unwrap_or("")]
        .join(" ")
        .to_lowercase();
    if [
        "rss",
        "subscribe",
        "订阅源",
        "订阅",
    ]
    .iter()
    .any(|needle| joined.contains(needle)) {
        return true;
    }

    let alt_caption_len = format!("{}{}", alt.trim(), caption.unwrap_or("").trim())
        .chars()
        .count();
    alt_caption_len <= 20 && ["logo", "icon", "favicon"].iter().any(|needle| joined.contains(needle))
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

fn normalize_image_src_key(src: &str) -> String {
    let trimmed = src.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.starts_with("data:") {
        return trimmed.to_string();
    }
    match reqwest::Url::parse(trimmed) {
        Ok(mut url) => {
            url.set_fragment(None);
            url.to_string()
        }
        Err(_) => trimmed.split_once('#').map_or_else(
            || trimmed.to_string(),
            |(without_hash, _)| without_hash.to_string(),
        ),
    }
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
pub async fn describe_image(
    app: tauri::AppHandle<Wry>,
    image_url: String,
) -> Result<String, String> {
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

    let config = crate::commands::config::get_config(app)?;
    if config.openai_api_key.is_empty() {
        return Err("尚未配置 API Key".to_string());
    }
    if image_url.trim().is_empty() {
        return Err("图片地址为空".to_string());
    }

    let endpoint =
        crate::commands::config::completions_endpoint(&config.openai_base_url, "openai-compat", "");
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
    if let Ok(map) =
        serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&config.extra_headers)
    {
        for (k, v) in &map {
            if let Some(s) = v.as_str() {
                builder = builder.header(k.as_str(), s);
            }
        }
    }

    let resp = builder
        .send()
        .await
        .map_err(|e| format!("图像说明请求失败: {e}"))?;
    let status = resp.status();
    let raw = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("图像说明失败 ({status}): {raw}"));
    }
    let parsed: Resp =
        serde_json::from_str(&raw).map_err(|e| format!("图像说明响应解析失败: {e}"))?;
    Ok(parsed
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content.trim().to_string())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn fact_check_claim(
    app: tauri::AppHandle<Wry>,
    claim: String,
    context: String,
) -> Result<FactCheckResult, String> {
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

    let config = crate::commands::config::get_config(app)?;
    if !config.search_enabled || config.search_api_key.trim().is_empty() {
        return Err("尚未启用搜索模型或未配置搜索模型 API Key".to_string());
    }
    if claim.trim().is_empty() {
        return Err("查询内容为空".to_string());
    }

    let endpoint = crate::commands::config::completions_endpoint(
        &config.search_base_url,
        &config.search_provider_key,
        &config.search_custom_endpoint,
    );
    let language = if config.fact_check_language.trim().is_empty() {
        "中文"
    } else {
        config.fact_check_language.trim()
    };
    let system = format!("你是事实查询助手。请针对用户给出的事实、数据、新闻报道或引文进行核查。默认使用 {language} 输出 answer、context、extra 和 snippet。必须严格只返回一个合法 JSON 对象，不要 Markdown，不要代码块，不要前后解释文字。返回格式固定为：{{\"claim\":\"待核查原句\",\"answer\":\"核查结论，说明是否可靠/不确定及理由\",\"context\":\"与核查有关的前后文摘要\",\"extra\":[\"额外数据或判断1\",\"额外数据或判断2\"],\"sources\":[{{\"title\":\"来源标题\",\"url\":\"https://完整链接\",\"snippet\":\"来源中的相关摘要\"}}]}}。extra 可为空数组；sources 必须是数组，最多 4 条；url 必须是完整链接；如果无法确定，要在 answer 中明确说明不确定，不要编造来源。");
    let user = format!("【待查询内容】\n{}\n\n【原文前后文】\n{}", claim.trim(), context.trim());
    let body = serde_json::json!({
        "model": config.search_model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.2
    });

    let resp = reqwest::Client::new()
        .post(&endpoint)
        .bearer_auth(&config.search_api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("事实查询请求失败: {e}"))?;
    let status = resp.status();
    let raw = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("事实查询失败 ({status}): {raw}"));
    }

    let parsed: Resp =
        serde_json::from_str(&raw).map_err(|e| format!("事实查询响应解析失败: {e}"))?;
    let content = parsed
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message.content)
        .ok_or_else(|| "事实查询响应为空".to_string())?;
    Ok(parse_fact_check_content(&content, claim.trim(), context.trim()))
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
    for h in handles {
        let _ = h.await;
    }
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
    openai::extract_points(
        &config.openai_api_key,
        &config.openai_model,
        &config.openai_base_url,
        &config.extra_headers,
        &text,
    )
    .await
    .map_err(|e| e.to_string())
}

/// Analyze text streaming: split → per-chunk analyze → emit "chunk_card", then "chunk_cards_done".
#[tauri::command]
pub async fn analyze_text_streaming(
    app: tauri::AppHandle<Wry>,
    text: String,
    source_id: Option<String>,
) -> Result<(), String> {
    use tauri::Emitter;
    let config = crate::commands::config::get_config(app.clone())?;
    let chunks = openai::split_chunks(
        &config.openai_api_key,
        &config.openai_model,
        &config.openai_base_url,
        &config.extra_headers,
        &text,
    )
    .await
    .map_err(|e| e.to_string())?;

    if let Some(source_id) = source_id {
        let path = crate::db::db_path(&app).map_err(|e| e.to_string())?;
        let chunk_texts = chunks.clone();
        tokio::task::spawn_blocking(move || {
            let mut conn = crate::db::open_db(&path)?;
            crate::db::replace_source_chunks(&mut conn, &source_id, &chunk_texts)
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())?;
    }

    let mut handles = Vec::new();
    for (index, chunk) in chunks.into_iter().enumerate() {
        let (api_key, model, base_url, headers, name, style, emoji, profiles) = (
            config.openai_api_key.clone(),
            config.openai_model.clone(),
            config.openai_base_url.clone(),
            config.extra_headers.clone(),
            config.commentator_name.clone(),
            config.commentator_style.clone(),
            config.commentator_emoji.clone(),
            config.commentator_profiles.clone(),
        );
        let app = app.clone();
        handles.push(tokio::spawn(async move {
            if let Ok(mut card) =
                openai::analyze_chunk(&api_key, &model, &base_url, &headers, &chunk, &name, &style, &emoji, &profiles)
                    .await
            {
                card.index = index;
                let _ = app.emit("chunk_card", &card);
            }
        }));
    }
    for h in handles {
        let _ = h.await;
    }
    let _ = app.emit("chunk_cards_done", ());
    Ok(())
}

/// Analyze a single visible block on demand.
#[tauri::command]
pub async fn analyze_text_block(
    app: tauri::AppHandle<Wry>,
    text: String,
    index: usize,
) -> Result<crate::ai::ChunkCard, String> {
    let config = crate::commands::config::get_config(app)?;
    let mut card = openai::analyze_chunk_on_demand(
        &config.openai_api_key,
        &config.openai_model,
        &config.openai_base_url,
        &config.extra_headers,
        &text,
        &config.commentator_name,
        &config.commentator_style,
        &config.commentator_emoji,
        &config.commentator_profiles,
    )
    .await
    .map_err(|e| e.to_string())?;
    card.index = index;
    Ok(card)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_page_content_deduplicates_images_by_normalized_src() {
        let base_url =
            reqwest::Url::parse("https://example.com/articles/story/").expect("valid test url");
        let raw = r#"
            <html>
                <body>
                    <main>
                        <p>Opening paragraph with useful text.</p>
                        <img src="../assets/tree.webp#hero" alt="">
                        <figure>
                            <img src="https://example.com/articles/assets/tree.webp" alt="Tree worker">
                            <figcaption>Worker in a tree</figcaption>
                        </figure>
                        <p>Closing paragraph with useful text.</p>
                    </main>
                </body>
            </html>
        "#;

        let page = extract_page_content(raw, &base_url);

        assert_eq!(page.html.matches("<img ").count(), 1);
        assert!(page
            .html
            .contains(r#"src="https://example.com/articles/assets/tree.webp#hero""#));
        assert!(page.html.contains(r#"alt="Tree worker""#));
        assert!(page
            .html
            .contains("<figcaption>Worker in a tree</figcaption>"));
    }

    #[test]
    fn extract_page_content_moves_initial_article_metadata_out_of_body() {
        let base_url =
            reqwest::Url::parse("https://example.com/articles/story/").expect("valid test url");
        let raw = r#"
            <html>
                <head>
                    <title>你的命运不是一头骡子 - 未来世界的幸存者</title>
                </head>
                <body>
                    <main>
                        <h1>你的命运不是一头骡子</h1>
                        <p>作者：阮一峰</p>
                        <p>阅读时间：5 分钟</p>
                        <p>2024年6月1日</p>
                        <p>我在杭州工作，周末通常去爬山。</p>
                        <p>2016年9月，这里将举办盛大的 G20 峰会。</p>
                    </main>
                </body>
            </html>
        "#;

        let page = extract_page_content(raw, &base_url);

        assert_eq!(page.author.as_deref(), Some("阮一峰"));
        assert_eq!(page.reading_time.as_deref(), Some("5 分钟"));
        assert_eq!(page.published_at.as_deref(), Some("2024年6月1日"));
        assert!(!page.text.contains("你的命运不是一头骡子"));
        assert!(!page.text.contains("作者：阮一峰"));
        assert!(page.text.contains("我在杭州工作"));
        assert!(page.html.contains("<p>我在杭州工作"));
    }

    #[test]
    fn extract_page_content_prefers_dense_article_container_over_page_chrome() {
        let base_url =
            reqwest::Url::parse("https://example.com/blog/2026/05/story.html").expect("valid test url");
        let raw = r#"
            <html>
                <body>
                    <main>
                        <section class="site-subscribe">
                            <img src="/rss.png" alt="RSS">
                            <p>这是一张橙色方形图标，边角圆润，内部是白色的RSS符号。</p>
                        </section>
                        <article class="post-content">
                            <p>我以前总以为，工作制度只是工资、合同和考勤的组合。</p>
                            <p>后来我发现，真正消耗人的，是它把人的时间切碎以后，还要求你保持完整的热情。</p>
                            <p>这种制度性疲惫不是个人懒惰，而是组织把风险和成本不断转嫁给劳动者的结果。</p>
                        </article>
                        <section class="post-nav">
                            <p>上一篇：科技爱好者周刊（第 3 期）</p>
                            <p>分类：</p>
                            <p>周刊</p>
                            <p>←</p>
                            <p>→</p>
                        </section>
                    </main>
                </body>
            </html>
        "#;

        let page = extract_page_content(raw, &base_url);

        assert!(page.text.contains("工作制度只是工资"));
        assert!(page.text.contains("制度性疲惫"));
        assert!(!page.text.contains("RSS符号"));
        assert!(!page.html.contains("rss.png"));
        assert!(!page.text.contains("上一篇"));
        assert!(!page.text.contains("分类"));
        assert!(!page.text.contains("←"));
    }

    #[test]
    fn trim_fetched_page_edges_keeps_html_and_text_in_sync() {
        let page = FetchedPage {
            html: [
                r#"<img src="https://example.com/rss.png" alt="RSS" />"#,
                "<p>站点订阅源说明</p>",
                "<p>真正的第一段正文，提出了核心问题。</p>",
                "<p>真正的第二段正文，补充了论证。</p>",
                "<p>上一篇：科技爱好者周刊</p>",
            ]
            .join("\n"),
            text: [
                "站点订阅源说明",
                "真正的第一段正文，提出了核心问题。",
                "真正的第二段正文，补充了论证。",
                "上一篇：科技爱好者周刊",
            ]
            .join("\n"),
            title: None,
            url: "https://example.com/story".to_string(),
            author: None,
            published_at: None,
            reading_time: None,
        };

        let cleaned = trim_fetched_page_edges(page, EdgeTrim { head: 1, tail: 1 });

        assert!(!cleaned.html.contains("rss.png"));
        assert!(!cleaned.text.contains("订阅源"));
        assert!(!cleaned.text.contains("上一篇"));
        assert!(cleaned.html.contains("真正的第一段正文"));
        assert!(cleaned.text.starts_with("真正的第一段正文"));
    }

    #[test]
    fn parse_edge_trim_extracts_json_and_clamps() {
        let trim = parse_edge_trim("```json\n{\"head\":3,\"tail\":9}\n```", 2, 4).unwrap();

        assert_eq!(trim, EdgeTrim { head: 2, tail: 4 });
    }
}
