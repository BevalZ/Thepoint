use std::io::Read;
use std::path::Path;

use anyhow::Context;
use quick_xml::events::Event;
use quick_xml::Reader;

/// Extract plain text from a .odt file (ZIP + content.xml).
pub fn parse(path: &Path) -> anyhow::Result<String> {
    let file = std::fs::File::open(path)?;
    let mut zip = zip::ZipArchive::new(file).context("not a valid zip/odt")?;
    let mut xml_data = String::new();
    zip.by_name("content.xml")
        .context("content.xml not found")?
        .read_to_string(&mut xml_data)?;

    let mut reader = Reader::from_str(&xml_data);
    reader.config_mut().trim_text(true);
    let mut out = String::new();
    loop {
        match reader.read_event()? {
            Event::Text(e) => out.push_str(&e.unescape()?),
            Event::End(e) if e.local_name().as_ref() == b"p" => out.push('\n'),
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(out.trim().to_string())
}
