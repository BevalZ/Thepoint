mod docx;
mod html;
mod odt;
mod pdf;
mod plaintext;

use std::path::Path;

/// Parse a document to plain text, dispatching by file extension.
///
/// Supported: txt, md, markdown, rst, csv, docx, odt, html, htm.
/// PDF is not yet supported — planned via MinerU → Markdown conversion.
pub fn parse_document(path: &Path) -> anyhow::Result<String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "pdf" => anyhow::bail!(
            "PDF 暂不支持直接解析，计划通过 MinerU 转换为 Markdown 后导入。"
        ),
        "txt" | "md" | "markdown" | "rst" | "csv" => plaintext::parse(path),
        "docx" => docx::parse(path),
        "doc" => anyhow::bail!(
            ".doc 格式（旧版 Word）暂不支持，请另存为 .docx 后导入。"
        ),
        "odt" => odt::parse(path),
        "html" | "htm" => html::parse(path),
        other => anyhow::bail!("不支持的文件格式：.{other}"),
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
    fn rejects_pdf_with_message() {
        let p = std::path::Path::new("foo.pdf");
        let err = parse_document(p).unwrap_err().to_string();
        assert!(err.contains("MinerU"));
    }

    #[test]
    fn rejects_doc_with_message() {
        let p = std::path::Path::new("foo.doc");
        let err = parse_document(p).unwrap_err().to_string();
        assert!(err.contains(".docx"));
    }

    #[test]
    fn rejects_unsupported() {
        let p = std::path::Path::new("foo.xyz");
        assert!(parse_document(p).is_err());
    }
}
