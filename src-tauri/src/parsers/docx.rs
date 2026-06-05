use std::io::Read;
use std::path::Path;

use anyhow::Context;
use quick_xml::events::Event;
use quick_xml::Reader;

/// Extract plain text from a .docx file (ZIP + word/document.xml).
pub fn parse(path: &Path) -> anyhow::Result<String> {
    let file = std::fs::File::open(path)?;
    let mut zip = zip::ZipArchive::new(file).context("not a valid zip/docx")?;
    let mut xml_data = String::new();
    zip.by_name("word/document.xml")
        .context("word/document.xml not found")?
        .read_to_string(&mut xml_data)?;
    xml_to_text(&xml_data)
}

fn xml_to_text(xml: &str) -> anyhow::Result<String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut out = String::new();
    let mut in_para = false;
    loop {
        match reader.read_event()? {
            Event::Start(e) => match e.local_name().as_ref() {
                b"p" => in_para = true,
                _ => {}
            },
            Event::End(e) => match e.local_name().as_ref() {
                b"p" => {
                    if in_para { out.push('\n'); in_para = false; }
                }
                _ => {}
            },
            Event::Text(e) => {
                out.push_str(&e.unescape()?);
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(out.trim().to_string())
}
