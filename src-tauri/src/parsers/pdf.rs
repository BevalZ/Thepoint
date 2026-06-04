use std::path::Path;

/// Extract text from a PDF using lopdf.
pub fn parse(path: &Path) -> anyhow::Result<String> {
    let doc = lopdf::Document::load(path)?;

    let mut pages: Vec<u32> = doc.get_pages().keys().copied().collect();
    pages.sort_unstable();

    let mut out = String::new();
    for page_num in pages {
        if let Ok(text) = doc.extract_text(&[page_num]) {
            out.push_str(&text);
            out.push('\n');
        }
    }

    Ok(out)
}
