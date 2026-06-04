mod pdf;
mod plaintext;

use std::path::Path;

/// Parse a document to plain text, dispatching by file extension.
/// Supported: pdf, txt, md, markdown.
pub fn parse_document(path: &Path) -> anyhow::Result<String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "pdf" => pdf::parse(path),
        "txt" | "md" | "markdown" => plaintext::parse(path),
        other => anyhow::bail!("unsupported file format: .{other}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_file(name: &str, content: &str) -> std::path::PathBuf {
        let mut path = std::env::temp_dir();
        path.push(name);
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(content.as_bytes()).unwrap();
        path
    }

    #[test]
    fn parses_txt() {
        let p = temp_file("de_test.txt", "hello world");
        assert_eq!(parse_document(&p).unwrap(), "hello world");
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn parses_markdown() {
        let p = temp_file("de_test.md", "# title\n\ntext");
        assert_eq!(parse_document(&p).unwrap(), "# title\n\ntext");
        std::fs::remove_file(&p).ok();
    }

    #[test]
    fn rejects_unsupported_format() {
        let p = Path::new("foo.docx");
        let err = parse_document(p).unwrap_err().to_string();
        assert!(err.contains("unsupported"));
    }

    #[test]
    fn rejects_no_extension() {
        let p = Path::new("foo");
        assert!(parse_document(p).is_err());
    }
}
