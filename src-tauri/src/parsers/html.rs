use std::path::Path;

use scraper::{Html, Selector};

/// Extract readable plain text from an HTML file.
pub fn parse(path: &Path) -> anyhow::Result<String> {
    let raw = std::fs::read_to_string(path)?;
    Ok(html_to_text(&raw))
}

/// Strip noise tags and extract text from an HTML string.
/// Used both for file parsing and for paste-from-clipboard in the frontend (via a Tauri command).
pub fn html_to_text(html: &str) -> String {
    let doc = Html::parse_document(html);

    // Remove noise elements first by collecting selectors to skip
    let noise: Selector = Selector::parse("script,style,nav,footer,aside,header,noscript")
        .expect("valid selector");
    let noise_ids: std::collections::HashSet<_> = doc
        .select(&noise)
        .map(|e| e.id())
        .collect();

    let body_sel = Selector::parse("body").expect("valid selector");
    let _root = doc.select(&body_sel).next();

    // Walk all text nodes not under noise elements
    let text_sel = Selector::parse("h1,h2,h3,h4,h5,h6,p,li,blockquote,td,th,pre")
        .expect("valid selector");
    let mut lines: Vec<String> = Vec::new();
    for el in doc.select(&text_sel) {
        // skip if ancestor is a noise element
        if el.ancestors().any(|a| {
            a.value().as_element().map_or(false, |_| noise_ids.contains(&a.id()))
        }) {
            continue;
        }
        let line = el.text().collect::<String>();
        let line = line.trim().to_string();
        if !line.is_empty() {
            lines.push(line);
        }
    }
    lines.join("\n")
}
