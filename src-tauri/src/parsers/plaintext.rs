use std::fs;
use std::path::Path;

/// Read a plain text or Markdown file as UTF-8 text.
pub fn parse(path: &Path) -> anyhow::Result<String> {
    let text = fs::read_to_string(path)?;
    Ok(text)
}
