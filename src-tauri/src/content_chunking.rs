use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContentUnitKind {
    Heading,
    Paragraph,
    ListItem,
    Blockquote,
    Code,
    Table,
    Image,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContentUnit {
    pub index: usize,
    pub kind: ContentUnitKind,
    pub text: String,
    #[serde(default)]
    pub heading_path: Vec<String>,
    pub heading_level: Option<u8>,
    pub media_url: Option<String>,
    pub caption: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ChunkSplitReason {
    NaturalParagraph,
    MergedParagraphs,
    HeadingBoundary,
    ImageBoundary,
    StructuralBoundary,
    OversizedParagraph,
    HardLimit,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalChunk {
    pub id: String,
    pub index: usize,
    pub unit_start: usize,
    pub unit_end: usize,
    #[serde(default)]
    pub heading_path: Vec<String>,
    pub text: String,
    pub estimated_tokens: usize,
    pub split_reason: ChunkSplitReason,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContentPlan {
    pub units: Vec<ContentUnit>,
    pub chunks: Vec<CanonicalChunk>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ChunkPolicy {
    pub preferred_min_tokens: usize,
    pub preferred_max_tokens: usize,
    pub soft_ceiling_tokens: usize,
    pub hard_ceiling_tokens: usize,
}

impl Default for ChunkPolicy {
    fn default() -> Self {
        Self {
            preferred_min_tokens: 280,
            preferred_max_tokens: 650,
            soft_ceiling_tokens: 850,
            hard_ceiling_tokens: 1_400,
        }
    }
}

#[derive(Clone, Debug)]
struct DraftChunk {
    unit_start: usize,
    unit_end: usize,
    heading_path: Vec<String>,
    text: String,
    reason: ChunkSplitReason,
}

pub fn plan_text(text: &str, source_scope: Option<&str>) -> ContentPlan {
    let units = units_from_plain_text(text);
    plan_units(units, source_scope, ChunkPolicy::default())
}

pub fn plan_html(html: &str, fallback_text: &str, source_scope: Option<&str>) -> ContentPlan {
    let units = units_from_html(html);
    if units.iter().any(|unit| unit.kind != ContentUnitKind::Image) {
        plan_units(units, source_scope, ChunkPolicy::default())
    } else {
        plan_text(fallback_text, source_scope)
    }
}

pub fn units_from_html(html: &str) -> Vec<ContentUnit> {
    use scraper::{Html, Selector};

    let document = Html::parse_fragment(html);
    let Ok(selector) = Selector::parse("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,table,figure,img")
    else {
        return Vec::new();
    };
    let image_selector = Selector::parse("img").ok();
    let caption_selector = Selector::parse("figcaption").ok();
    let mut units = Vec::new();
    let mut heading_path: Vec<String> = Vec::new();
    let mut seen_images = std::collections::HashSet::new();

    for element in document.select(&selector) {
        let tag = element.value().name();
        if tag != "figure" && has_ancestor_tag(&element, "figure") {
            continue;
        }
        if tag != "table" && has_ancestor_tag(&element, "table") {
            continue;
        }
        if matches!(tag, "p" | "blockquote" | "pre") && has_text_block_ancestor(&element) {
            continue;
        }

        if matches!(tag, "figure" | "img") {
            let image = if tag == "figure" {
                image_selector
                    .as_ref()
                    .and_then(|selector| element.select(selector).next())
            } else {
                Some(element)
            };
            let Some(image) = image else { continue };
            let Some(media_url) = image_source(&image) else {
                continue;
            };
            let key = normalize_media_key(&media_url);
            if key.is_empty() || !seen_images.insert(key) {
                continue;
            }
            let alt = normalize_inline(image.value().attr("alt").unwrap_or(""));
            let caption = if tag == "figure" {
                caption_selector
                    .as_ref()
                    .and_then(|selector| element.select(selector).next())
                    .map(|caption| normalize_inline(&caption.text().collect::<String>()))
                    .filter(|caption| !caption.is_empty())
            } else {
                None
            };
            units.push(ContentUnit {
                index: units.len(),
                kind: ContentUnitKind::Image,
                text: if alt.is_empty() {
                    caption.clone().unwrap_or_default()
                } else {
                    alt
                },
                heading_path: heading_path.clone(),
                heading_level: None,
                media_url: Some(media_url),
                caption,
            });
            continue;
        }

        let text = normalize_inline(&element.text().collect::<String>());
        if text.is_empty() {
            continue;
        }
        let (kind, heading_level) = match tag {
            "h1" => (ContentUnitKind::Heading, Some(1_u8)),
            "h2" => (ContentUnitKind::Heading, Some(2_u8)),
            "h3" => (ContentUnitKind::Heading, Some(3_u8)),
            "h4" => (ContentUnitKind::Heading, Some(4_u8)),
            "h5" => (ContentUnitKind::Heading, Some(5_u8)),
            "h6" => (ContentUnitKind::Heading, Some(6_u8)),
            "li" => (ContentUnitKind::ListItem, None),
            "blockquote" => (ContentUnitKind::Blockquote, None),
            "pre" => (ContentUnitKind::Code, None),
            "table" => (ContentUnitKind::Table, None),
            _ => (ContentUnitKind::Paragraph, None),
        };
        if let Some(level) = heading_level {
            heading_path.truncate(level.saturating_sub(1) as usize);
            heading_path.push(text.clone());
        }
        units.push(ContentUnit {
            index: units.len(),
            kind,
            text,
            heading_path: heading_path.clone(),
            heading_level,
            media_url: None,
            caption: None,
        });
    }

    remove_adjacent_exact_duplicates(units)
}

pub fn plan_units(
    mut units: Vec<ContentUnit>,
    source_scope: Option<&str>,
    policy: ChunkPolicy,
) -> ContentPlan {
    for (index, unit) in units.iter_mut().enumerate() {
        unit.index = index;
    }
    let mut drafts = Vec::new();
    let mut current: Option<DraftChunk> = None;
    let mut pending_heading: Option<(usize, String, Vec<String>)> = None;
    let mut last_boundary = ChunkSplitReason::NaturalParagraph;

    for unit in &units {
        match unit.kind {
            ContentUnitKind::Heading => {
                flush_draft(&mut current, &mut drafts);
                pending_heading = Some((unit.index, unit.text.clone(), unit.heading_path.clone()));
                last_boundary = ChunkSplitReason::HeadingBoundary;
            }
            ContentUnitKind::Image => {
                flush_draft(&mut current, &mut drafts);
                pending_heading = None;
                last_boundary = ChunkSplitReason::ImageBoundary;
            }
            ContentUnitKind::Code | ContentUnitKind::Table => {
                flush_draft(&mut current, &mut drafts);
                append_structural_unit(
                    unit,
                    pending_heading.take(),
                    &mut drafts,
                    policy,
                    ChunkSplitReason::StructuralBoundary,
                );
                last_boundary = ChunkSplitReason::StructuralBoundary;
            }
            ContentUnitKind::Blockquote => {
                flush_draft(&mut current, &mut drafts);
                append_text_unit(
                    unit,
                    pending_heading.take(),
                    &mut current,
                    &mut drafts,
                    policy,
                    ChunkSplitReason::StructuralBoundary,
                    false,
                );
                flush_draft(&mut current, &mut drafts);
                last_boundary = ChunkSplitReason::StructuralBoundary;
            }
            ContentUnitKind::Paragraph | ContentUnitKind::ListItem => {
                let allow_merge = matches!(unit.kind, ContentUnitKind::Paragraph)
                    || current
                        .as_ref()
                        .map(|draft| draft.reason == ChunkSplitReason::StructuralBoundary)
                        .unwrap_or(true);
                let reason = if pending_heading.is_some() {
                    ChunkSplitReason::HeadingBoundary
                } else if matches!(unit.kind, ContentUnitKind::ListItem) {
                    ChunkSplitReason::StructuralBoundary
                } else {
                    last_boundary.clone()
                };
                append_text_unit(
                    unit,
                    pending_heading.take(),
                    &mut current,
                    &mut drafts,
                    policy,
                    reason,
                    allow_merge,
                );
                last_boundary = ChunkSplitReason::NaturalParagraph;
            }
        }
    }

    if let Some((unit_start, heading, heading_path)) = pending_heading {
        drafts.push(DraftChunk {
            unit_start,
            unit_end: unit_start,
            heading_path,
            text: heading,
            reason: ChunkSplitReason::HeadingBoundary,
        });
    }
    flush_draft(&mut current, &mut drafts);
    back_merge_tiny_tail(&mut drafts, policy);

    let document_fingerprint = content_hash(
        &units
            .iter()
            .map(|unit| format!("{:?}\u{1f}{}", unit.kind, unit.text))
            .collect::<Vec<_>>()
            .join("\u{1e}"),
    );
    let scope = source_scope
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&document_fingerprint);
    let chunks = drafts
        .into_iter()
        .enumerate()
        .filter_map(|(index, draft)| {
            let text = draft.text.trim().to_string();
            if text.is_empty() {
                return None;
            }
            let id = content_hash(&format!(
                "{scope}\u{1f}{index}\u{1f}{}\u{1f}{text}",
                draft.heading_path.join("\u{1e}")
            ));
            Some(CanonicalChunk {
                id: format!("chunk-{id}"),
                index,
                unit_start: draft.unit_start,
                unit_end: draft.unit_end,
                heading_path: draft.heading_path,
                estimated_tokens: estimate_tokens(&text),
                text,
                split_reason: draft.reason,
            })
        })
        .collect();

    ContentPlan { units, chunks }
}

pub fn units_from_plain_text(text: &str) -> Vec<ContentUnit> {
    let normalized = normalize_document_text(text);
    if normalized.is_empty() {
        return Vec::new();
    }

    let logical_blocks = logical_blocks_from_plain_text(&normalized);
    let mut units = Vec::new();
    let mut heading_path = Vec::new();

    for block in logical_blocks {
        match block {
            PlainBlock::Heading { level, text } => {
                heading_path.truncate(level.saturating_sub(1) as usize);
                heading_path.push(text.clone());
                units.push(ContentUnit {
                    index: units.len(),
                    kind: ContentUnitKind::Heading,
                    text,
                    heading_path: heading_path.clone(),
                    heading_level: Some(level),
                    media_url: None,
                    caption: None,
                });
            }
            PlainBlock::Text { kind, lines } => {
                let text = match kind {
                    ContentUnitKind::Code | ContentUnitKind::Table => lines.join("\n"),
                    ContentUnitKind::Blockquote => repair_hard_wrapped_lines(
                        &lines.iter().map(String::as_str).collect::<Vec<_>>(),
                    ),
                    _ => repair_hard_wrapped_lines(
                        &lines.iter().map(String::as_str).collect::<Vec<_>>(),
                    ),
                };
                if !text.trim().is_empty() {
                    units.push(new_text_unit(units.len(), kind, text, &heading_path));
                }
            }
        }
    }

    merge_orphan_number_headings(remove_adjacent_exact_duplicates(units))
}

pub fn normalize_document_text(text: &str) -> String {
    let mut output = Vec::new();
    let mut previous_blank = false;
    for line in text.replace("\r\n", "\n").replace('\r', "\n").lines() {
        let trimmed_end = line.trim_end();
        let blank = trimmed_end.trim().is_empty();
        if blank {
            if !previous_blank && !output.is_empty() {
                output.push(String::new());
            }
        } else {
            output.push(trimmed_end.to_string());
        }
        previous_blank = blank;
    }
    while output.last().map(|line| line.is_empty()).unwrap_or(false) {
        output.pop();
    }
    output.join("\n")
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum PlainBlock {
    Heading {
        level: u8,
        text: String,
    },
    Text {
        kind: ContentUnitKind,
        lines: Vec<String>,
    },
}

fn logical_blocks_from_plain_text(text: &str) -> Vec<PlainBlock> {
    let lines = text.lines().collect::<Vec<_>>();
    let mut blocks = Vec::new();
    let mut paragraph_lines: Vec<String> = Vec::new();
    let mut line_index = 0usize;

    while line_index < lines.len() {
        let line = lines[line_index];
        let trimmed = line.trim();

        if trimmed.is_empty() {
            flush_plain_paragraph(&mut paragraph_lines, &mut blocks);
            line_index += 1;
            continue;
        }

        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            flush_plain_paragraph(&mut paragraph_lines, &mut blocks);
            let fence = &trimmed[..3];
            let mut code = vec![line.trim_end().to_string()];
            line_index += 1;
            while line_index < lines.len() {
                let current = lines[line_index];
                code.push(current.trim_end().to_string());
                line_index += 1;
                if current.trim().starts_with(fence) {
                    break;
                }
            }
            blocks.push(PlainBlock::Text {
                kind: ContentUnitKind::Code,
                lines: code,
            });
            continue;
        }

        if let Some((level, heading)) =
            markdown_heading(trimmed).or_else(|| implicit_plain_heading(trimmed))
        {
            flush_plain_paragraph(&mut paragraph_lines, &mut blocks);
            blocks.push(PlainBlock::Heading {
                level,
                text: heading.to_string(),
            });
            line_index += 1;
            continue;
        }

        if is_table_line(trimmed) {
            flush_plain_paragraph(&mut paragraph_lines, &mut blocks);
            let mut table = Vec::new();
            while line_index < lines.len() && is_table_line(lines[line_index].trim()) {
                table.push(lines[line_index].trim_end().to_string());
                line_index += 1;
            }
            blocks.push(PlainBlock::Text {
                kind: ContentUnitKind::Table,
                lines: table,
            });
            continue;
        }

        if is_list_item(trimmed) {
            flush_plain_paragraph(&mut paragraph_lines, &mut blocks);
            while line_index < lines.len() && is_list_item(lines[line_index].trim()) {
                blocks.push(PlainBlock::Text {
                    kind: ContentUnitKind::ListItem,
                    lines: vec![lines[line_index].trim().to_string()],
                });
                line_index += 1;
            }
            continue;
        }

        if trimmed.starts_with('>') {
            flush_plain_paragraph(&mut paragraph_lines, &mut blocks);
            let mut quote = Vec::new();
            while line_index < lines.len() && lines[line_index].trim().starts_with('>') {
                quote.push(
                    lines[line_index]
                        .trim()
                        .trim_start_matches('>')
                        .trim_start()
                        .to_string(),
                );
                line_index += 1;
            }
            blocks.push(PlainBlock::Text {
                kind: ContentUnitKind::Blockquote,
                lines: quote,
            });
            continue;
        }

        paragraph_lines.push(line.to_string());
        line_index += 1;
    }

    flush_plain_paragraph(&mut paragraph_lines, &mut blocks);
    blocks
}

fn flush_plain_paragraph(lines: &mut Vec<String>, blocks: &mut Vec<PlainBlock>) {
    if lines.is_empty() {
        return;
    }
    let mut current = Vec::new();
    for line in lines.drain(..) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !current.is_empty() && should_start_new_natural_paragraph(&current, trimmed) {
            blocks.push(PlainBlock::Text {
                kind: ContentUnitKind::Paragraph,
                lines: std::mem::take(&mut current),
            });
        }
        current.push(trimmed.to_string());
    }
    if !current.is_empty() {
        blocks.push(PlainBlock::Text {
            kind: ContentUnitKind::Paragraph,
            lines: current,
        });
    }
}

fn should_start_new_natural_paragraph(current: &[String], next: &str) -> bool {
    if current.is_empty() {
        return false;
    }
    let previous = current.last().map(|value| value.trim()).unwrap_or("");
    if is_orphan_number_marker(next) || is_orphan_number_marker(previous) {
        return false;
    }
    if implicit_plain_heading(next).is_some() {
        return true;
    }
    let current_tokens = estimate_tokens(&current.join(" "));
    if current_tokens >= ChunkPolicy::default().preferred_max_tokens {
        return true;
    }
    sentence_like_end(previous) && starts_discourse_boundary(next) && current_tokens >= 80
}

fn sentence_like_end(value: &str) -> bool {
    value
        .chars()
        .rev()
        .find(|ch| !ch.is_whitespace())
        .map(|ch| {
            matches!(
                ch,
                '。' | '！' | '？' | '.' | '!' | '?' | ';' | '；' | '”' | '"' | ')' | '）'
            )
        })
        .unwrap_or(false)
}

fn starts_discourse_boundary(value: &str) -> bool {
    let trimmed = value.trim_start();
    const PREFIXES: &[&str] = &[
        "但是",
        "然而",
        "不过",
        "与此同时",
        "另一方面",
        "因此",
        "所以",
        "总之",
        "换句话说",
        "公开的报道",
        "从这个角度",
        "首先",
        "其次",
        "最后",
        "In ",
        "However",
        "Therefore",
        "Meanwhile",
        "First",
        "Second",
        "Finally",
        "Overall",
    ];
    PREFIXES.iter().any(|prefix| trimmed.starts_with(prefix))
}

fn implicit_plain_heading(line: &str) -> Option<(u8, &str)> {
    let trimmed = line.trim();
    if is_orphan_number_marker(trimmed) {
        return Some((2, trimmed));
    }
    if trimmed.chars().count() > 80 || sentence_like_end(trimmed) {
        return None;
    }
    let has_number_prefix = trimmed.chars().take(4).any(|ch| ch.is_ascii_digit())
        && trimmed
            .chars()
            .take(6)
            .any(|ch| matches!(ch, '.' | '、' | ')' | '）' | ' '));
    let has_cjk_section_prefix = [
        "一、", "二、", "三、", "四、", "五、", "六、", "七、", "八、", "九、", "十、",
    ]
    .iter()
    .any(|prefix| trimmed.starts_with(prefix));
    (has_number_prefix || has_cjk_section_prefix).then_some((2, trimmed))
}

fn is_orphan_number_marker(line: &str) -> bool {
    let trimmed = line.trim();
    let without_dot = trimmed
        .strip_suffix('.')
        .or_else(|| trimmed.strip_suffix('、'))
        .unwrap_or(trimmed);
    !without_dot.is_empty()
        && without_dot.chars().all(|ch| ch.is_ascii_digit())
        && without_dot.chars().count() <= 3
}

fn merge_orphan_number_headings(units: Vec<ContentUnit>) -> Vec<ContentUnit> {
    let mut output: Vec<ContentUnit> = Vec::new();
    let mut pending: Option<ContentUnit> = None;
    for mut unit in units {
        if let Some(number) = pending.take() {
            unit.text = format!("{}\n\n{}", number.text, unit.text);
            unit.heading_path = number.heading_path;
            unit.heading_level = number.heading_level;
            output.push(unit);
        } else if unit.kind == ContentUnitKind::Heading && is_orphan_number_marker(&unit.text) {
            pending = Some(unit);
        } else {
            output.push(unit);
        }
    }
    if let Some(number) = pending {
        output.push(number);
    }
    for (index, unit) in output.iter_mut().enumerate() {
        unit.index = index;
    }
    output
}
pub fn estimate_tokens(text: &str) -> usize {
    let mut total = 0usize;
    let mut ascii_word = 0usize;
    let flush_ascii = |total: &mut usize, ascii_word: &mut usize| {
        if *ascii_word > 0 {
            *total += (*ascii_word + 3) / 4;
            *ascii_word = 0;
        }
    };
    for ch in text.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            ascii_word += 1;
        } else {
            flush_ascii(&mut total, &mut ascii_word);
            if !ch.is_whitespace() {
                total += 1;
            }
        }
    }
    flush_ascii(&mut total, &mut ascii_word);
    total
}

fn append_text_unit(
    unit: &ContentUnit,
    pending_heading: Option<(usize, String, Vec<String>)>,
    current: &mut Option<DraftChunk>,
    drafts: &mut Vec<DraftChunk>,
    policy: ChunkPolicy,
    reason: ChunkSplitReason,
    allow_merge: bool,
) {
    let unit_tokens = estimate_tokens(&unit.text);
    if unit_tokens > policy.hard_ceiling_tokens {
        flush_draft(current, drafts);
        let parts = split_oversized_text(&unit.text, policy, true);
        for (part_index, part) in parts.into_iter().enumerate() {
            let heading = if part_index == 0 {
                pending_heading.as_ref()
            } else {
                None
            };
            let text = heading
                .map(|(_, value, _)| format!("{value}\n\n{part}"))
                .unwrap_or(part);
            drafts.push(DraftChunk {
                unit_start: pending_heading
                    .as_ref()
                    .map(|value| value.0)
                    .unwrap_or(unit.index),
                unit_end: unit.index,
                heading_path: unit.heading_path.clone(),
                text,
                reason: ChunkSplitReason::OversizedParagraph,
            });
        }
        return;
    }

    let heading_prefix = pending_heading
        .as_ref()
        .map(|(_, heading, _)| format!("{heading}\n\n"))
        .unwrap_or_default();
    let candidate_text = format!("{heading_prefix}{}", unit.text);
    let candidate_tokens = estimate_tokens(&candidate_text);

    if let Some(existing) = current.as_mut() {
        let combined = format!("{}\n\n{}", existing.text, candidate_text);
        let combined_tokens = estimate_tokens(&combined);
        let current_tokens = estimate_tokens(&existing.text);
        if allow_merge
            && combined_tokens <= policy.soft_ceiling_tokens
            && (current_tokens < policy.preferred_min_tokens
                || combined_tokens <= policy.preferred_max_tokens)
            && existing.heading_path == unit.heading_path
            && pending_heading.is_none()
        {
            existing.text = combined;
            existing.unit_end = unit.index;
            existing.reason = ChunkSplitReason::MergedParagraphs;
            return;
        }
        flush_draft(current, drafts);
    }

    *current = Some(DraftChunk {
        unit_start: pending_heading
            .as_ref()
            .map(|value| value.0)
            .unwrap_or(unit.index),
        unit_end: unit.index,
        heading_path: pending_heading
            .map(|(_, _, path)| path)
            .unwrap_or_else(|| unit.heading_path.clone()),
        text: candidate_text,
        reason: if candidate_tokens > policy.soft_ceiling_tokens {
            ChunkSplitReason::NaturalParagraph
        } else {
            reason
        },
    });
}

fn append_structural_unit(
    unit: &ContentUnit,
    pending_heading: Option<(usize, String, Vec<String>)>,
    drafts: &mut Vec<DraftChunk>,
    policy: ChunkPolicy,
    reason: ChunkSplitReason,
) {
    let parts = if estimate_tokens(&unit.text) > policy.hard_ceiling_tokens {
        split_oversized_text(&unit.text, policy, false)
    } else {
        vec![unit.text.clone()]
    };
    for (part_index, part) in parts.into_iter().enumerate() {
        let heading = if part_index == 0 {
            pending_heading.as_ref()
        } else {
            None
        };
        drafts.push(DraftChunk {
            unit_start: pending_heading
                .as_ref()
                .map(|value| value.0)
                .unwrap_or(unit.index),
            unit_end: unit.index,
            heading_path: unit.heading_path.clone(),
            text: heading
                .map(|(_, value, _)| format!("{value}\n\n{part}"))
                .unwrap_or(part),
            reason: if part_index == 0 {
                reason.clone()
            } else {
                ChunkSplitReason::HardLimit
            },
        });
    }
}

fn split_oversized_text(text: &str, policy: ChunkPolicy, sentence_aware: bool) -> Vec<String> {
    let chars = text.chars().collect::<Vec<_>>();
    let mut parts = Vec::new();
    let mut start = 0usize;
    while start < chars.len() {
        let remaining = chars[start..].iter().collect::<String>();
        if estimate_tokens(&remaining) <= policy.hard_ceiling_tokens {
            parts.push(remaining.trim().to_string());
            break;
        }

        let mut hard_end = start;
        while hard_end < chars.len()
            && estimate_tokens(&chars[start..=hard_end].iter().collect::<String>())
                <= policy.soft_ceiling_tokens
        {
            hard_end += 1;
        }
        hard_end = hard_end.max(start + 1).min(chars.len());
        let target = find_target_index(&chars, start, hard_end, policy.preferred_max_tokens);
        let split = if sentence_aware {
            safe_sentence_split(&chars, start, target, hard_end)
        } else {
            safe_whitespace_split(&chars, start, target, hard_end)
        };
        let split = split.max(start + 1).min(chars.len());
        let part = chars[start..split]
            .iter()
            .collect::<String>()
            .trim()
            .to_string();
        if !part.is_empty() {
            parts.push(part);
        }
        start = split;
        while start < chars.len() && chars[start].is_whitespace() {
            start += 1;
        }
    }
    parts
}

fn find_target_index(chars: &[char], start: usize, hard_end: usize, target_tokens: usize) -> usize {
    let mut end = start;
    while end < hard_end
        && estimate_tokens(&chars[start..=end].iter().collect::<String>()) <= target_tokens
    {
        end += 1;
    }
    end.max(start + 1).min(hard_end)
}

fn safe_sentence_split(chars: &[char], start: usize, target: usize, hard_end: usize) -> usize {
    let lower = start + (target.saturating_sub(start) / 2);
    for index in (lower..target).rev() {
        if is_sentence_break_at(chars, index) {
            return index + 1;
        }
    }
    for index in target..hard_end {
        if is_sentence_break_at(chars, index) {
            return index + 1;
        }
    }
    safe_whitespace_split(chars, start, target, hard_end)
}

fn safe_whitespace_split(chars: &[char], start: usize, target: usize, hard_end: usize) -> usize {
    let lower = start + (target.saturating_sub(start) / 2);
    for index in (lower..target).rev() {
        if chars[index].is_whitespace() || is_soft_punctuation(chars[index]) {
            return index + 1;
        }
    }
    for index in target..hard_end {
        if chars[index].is_whitespace() || is_soft_punctuation(chars[index]) {
            return index + 1;
        }
    }
    hard_end
}

fn is_sentence_break_at(chars: &[char], index: usize) -> bool {
    let ch = chars[index];
    if matches!(ch, '。' | '！' | '？' | '!' | '?' | ';' | '；') {
        return true;
    }
    if ch != '.' {
        return false;
    }
    if index > 0
        && index + 1 < chars.len()
        && chars[index - 1].is_ascii_digit()
        && chars[index + 1].is_ascii_digit()
    {
        return false;
    }
    if is_url_or_domain_period(chars, index) || is_protected_english_period(chars, index) {
        return false;
    }
    chars
        .get(index + 1)
        .map(|next| next.is_whitespace() || matches!(next, '"' | '\'' | ')' | ']' | '}'))
        .unwrap_or(true)
}

fn is_protected_english_period(chars: &[char], index: usize) -> bool {
    let before = chars[..=index]
        .iter()
        .collect::<String>()
        .to_ascii_lowercase();
    const SUFFIXES: &[&str] = &[
        "i.", "i.e.", "e.", "e.g.", "et al.", "etc.", "vs.", "fig.", "dr.", "mr.", "mrs.", "prof.",
    ];
    if SUFFIXES.iter().any(|suffix| before.ends_with(suffix)) {
        return true;
    }
    let word = word_before(chars, index);
    if word.chars().count() == 1 && word.chars().all(|ch| ch.is_ascii_alphabetic()) {
        return true;
    }
    ends_with_compact_initialism(&before)
}

fn is_url_or_domain_period(chars: &[char], index: usize) -> bool {
    let left = chars[..index]
        .iter()
        .rev()
        .take_while(|ch| !ch.is_whitespace())
        .collect::<String>();
    let right = chars[index + 1..]
        .iter()
        .take_while(|ch| !ch.is_whitespace())
        .collect::<String>();
    if left.chars().rev().collect::<String>().contains("://") {
        return true;
    }
    let left_has_alnum = left.chars().any(|ch| ch.is_ascii_alphanumeric());
    let right_label = right
        .chars()
        .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '-')
        .collect::<String>();
    left_has_alnum && !right_label.is_empty() && right_label.len() <= 24
}

fn ends_with_compact_initialism(value: &str) -> bool {
    let tail = value.split_whitespace().last().unwrap_or(value);
    let mut letters = 0usize;
    let mut periods = 0usize;
    for ch in tail.chars().rev() {
        if ch == '.' {
            periods += 1;
        } else if ch.is_ascii_alphabetic() {
            letters += 1;
        } else {
            break;
        }
    }
    periods >= 2 && letters == periods
}

fn word_before(chars: &[char], index: usize) -> String {
    let mut start = index;
    while start > 0 && chars[start - 1].is_ascii_alphabetic() {
        start -= 1;
    }
    chars[start..index].iter().collect()
}

fn is_soft_punctuation(ch: char) -> bool {
    matches!(ch, ',' | '，' | ':' | '：' | '、' | ')' | '）')
}

fn flush_draft(current: &mut Option<DraftChunk>, drafts: &mut Vec<DraftChunk>) {
    if let Some(draft) = current.take() {
        if !draft.text.trim().is_empty() {
            drafts.push(draft);
        }
    }
}

fn back_merge_tiny_tail(drafts: &mut Vec<DraftChunk>, policy: ChunkPolicy) {
    if drafts.len() < 2 {
        return;
    }
    let tail_tokens =
        estimate_tokens(&drafts.last().map(|draft| draft.text.as_str()).unwrap_or(""));
    if tail_tokens >= policy.preferred_min_tokens {
        return;
    }
    let tail = drafts.pop().expect("length checked");
    let previous = drafts.last_mut().expect("length checked");
    let combined = format!("{}\n\n{}", previous.text, tail.text);
    if previous.heading_path == tail.heading_path
        && estimate_tokens(&combined) <= policy.soft_ceiling_tokens
        && !matches!(
            tail.reason,
            ChunkSplitReason::HeadingBoundary | ChunkSplitReason::ImageBoundary
        )
    {
        previous.text = combined;
        previous.unit_end = tail.unit_end;
        previous.reason = ChunkSplitReason::MergedParagraphs;
    } else {
        drafts.push(tail);
    }
}

fn repair_hard_wrapped_lines(lines: &[&str]) -> String {
    let mut output = String::new();
    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if output.is_empty() {
            output.push_str(trimmed);
            continue;
        }
        let join_without_space = output.ends_with('-')
            && trimmed
                .chars()
                .next()
                .map(|ch| ch.is_ascii_lowercase())
                .unwrap_or(false);
        if join_without_space {
            output.pop();
        } else if !needs_no_space(output.chars().last(), trimmed.chars().next()) {
            output.push(' ');
        }
        output.push_str(trimmed);
    }
    output
}

fn needs_no_space(previous: Option<char>, next: Option<char>) -> bool {
    previous
        .map(|ch| is_cjk(ch) || is_cjk_closing_punctuation(ch))
        .unwrap_or(false)
        && next
            .map(|ch| is_cjk(ch) || is_cjk_opening_punctuation(ch))
            .unwrap_or(false)
}

fn is_cjk(ch: char) -> bool {
    matches!(ch as u32, 0x3400..=0x4dbf | 0x4e00..=0x9fff | 0xf900..=0xfaff)
}

fn is_cjk_closing_punctuation(ch: char) -> bool {
    matches!(
        ch,
        '，' | '。'
            | '！'
            | '？'
            | '；'
            | '：'
            | '、'
            | '）'
            | '》'
            | '】'
            | '」'
            | '』'
            | '”'
            | '’'
    )
}

fn is_cjk_opening_punctuation(ch: char) -> bool {
    matches!(ch, '（' | '《' | '【' | '「' | '『' | '“' | '‘')
}

fn markdown_heading(line: &str) -> Option<(u8, &str)> {
    let hashes = line.chars().take_while(|ch| *ch == '#').count();
    if !(1..=6).contains(&hashes)
        || !line
            .chars()
            .nth(hashes)
            .map(|ch| ch.is_whitespace())
            .unwrap_or(false)
    {
        return None;
    }
    let heading = line[hashes..].trim();
    (!heading.is_empty()).then_some((hashes as u8, heading))
}

fn is_list_item(line: &str) -> bool {
    if line.starts_with("- ") || line.starts_with("* ") || line.starts_with("+ ") {
        return true;
    }
    let marker_len = line.chars().take_while(|ch| ch.is_ascii_digit()).count();
    marker_len > 0
        && line[marker_len..]
            .strip_prefix(['.', ')'])
            .map(|rest| rest.starts_with(char::is_whitespace))
            .unwrap_or(false)
}

fn is_table_line(line: &str) -> bool {
    let pipes = line.chars().filter(|ch| *ch == '|').count();
    pipes >= 2 && line.len() > pipes
}

fn new_text_unit(
    index: usize,
    kind: ContentUnitKind,
    text: String,
    heading_path: &[String],
) -> ContentUnit {
    ContentUnit {
        index,
        kind,
        text,
        heading_path: heading_path.to_vec(),
        heading_level: None,
        media_url: None,
        caption: None,
    }
}

fn normalize_inline(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn has_ancestor_tag(element: &scraper::ElementRef<'_>, tag_name: &str) -> bool {
    element.ancestors().skip(1).any(|ancestor| {
        ancestor
            .value()
            .as_element()
            .is_some_and(|value| value.name() == tag_name)
    })
}

fn has_text_block_ancestor(element: &scraper::ElementRef<'_>) -> bool {
    element.ancestors().skip(1).any(|ancestor| {
        ancestor
            .value()
            .as_element()
            .is_some_and(|value| matches!(value.name(), "p" | "li" | "blockquote" | "pre"))
    })
}

fn image_source(element: &scraper::ElementRef<'_>) -> Option<String> {
    ["src", "data-src", "data-original", "data-lazy-src"]
        .iter()
        .find_map(|attribute| element.value().attr(attribute))
        .map(str::trim)
        .filter(|source| !source.is_empty())
        .map(ToString::to_string)
}

fn normalize_media_key(source: &str) -> String {
    source
        .trim()
        .split_once('#')
        .map_or(source.trim(), |(without_fragment, _)| without_fragment)
        .to_lowercase()
}

fn remove_adjacent_exact_duplicates(units: Vec<ContentUnit>) -> Vec<ContentUnit> {
    let mut output: Vec<ContentUnit> = Vec::new();
    for unit in units {
        let duplicate = output
            .last()
            .map(|previous| {
                previous.kind == unit.kind
                    && previous.text.split_whitespace().collect::<Vec<_>>()
                        == unit.text.split_whitespace().collect::<Vec<_>>()
            })
            .unwrap_or(false);
        if !duplicate {
            output.push(unit);
        }
    }
    for (index, unit) in output.iter_mut().enumerate() {
        unit.index = index;
    }
    output
}

fn content_hash(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    digest[..12]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repeated_sentences(sentence: &str, count: usize) -> String {
        std::iter::repeat_n(sentence, count)
            .collect::<Vec<_>>()
            .join(" ")
    }

    #[test]
    fn normal_paragraph_stays_intact_and_short_paragraphs_merge() {
        let text = "First natural paragraph stays coherent even with i.e. inside it.\n\nSecond short paragraph.\n\nThird short paragraph.";
        let plan = plan_text(text, Some("source-a"));
        assert_eq!(plan.chunks.len(), 1);
        assert_eq!(plan.chunks[0].text, text);
        assert_eq!(
            plan.chunks[0].split_reason,
            ChunkSplitReason::MergedParagraphs
        );
    }

    #[test]
    fn heading_attaches_to_following_content_and_starts_boundary() {
        let text = "# Introduction\n\nOpening paragraph.\n\n# Results\n\nResult paragraph.";
        let plan = plan_text(text, Some("source-a"));
        assert_eq!(plan.chunks.len(), 2);
        assert_eq!(plan.chunks[0].text, "Introduction\n\nOpening paragraph.");
        assert_eq!(plan.chunks[1].text, "Results\n\nResult paragraph.");
        assert_eq!(plan.chunks[1].heading_path, vec!["Results"]);
    }

    #[test]
    fn markdown_structures_remain_explicit_units() {
        let text = "# Section\n\n- first item\n- second item\n\n> quoted line\n> continues\n\n```rs\nlet x = 1;\n```\n\n| A | B |\n| - | - |";
        let units = units_from_plain_text(text);
        assert_eq!(
            units
                .iter()
                .filter(|unit| unit.kind == ContentUnitKind::ListItem)
                .count(),
            2
        );
        assert!(units
            .iter()
            .any(|unit| unit.kind == ContentUnitKind::Blockquote));
        assert!(units.iter().any(|unit| unit.kind == ContentUnitKind::Code));
        assert!(units.iter().any(|unit| unit.kind == ContentUnitKind::Table));
    }

    #[test]
    fn hard_wrapped_plain_text_is_repaired_without_crossing_blank_lines() {
        let text = "This PDF line was hard\nwrapped in the middle of a\nsentence.\n\nA separate paragraph.";
        let units = units_from_plain_text(text);
        assert_eq!(units.len(), 2);
        assert_eq!(
            units[0].text,
            "This PDF line was hard wrapped in the middle of a sentence."
        );
        assert_eq!(units[1].text, "A separate paragraph.");
    }

    #[test]
    fn oversized_paragraph_uses_safe_balanced_sentence_boundaries() {
        let sentence = "Mutation prompts (i.e. instructions to an LLM) improve safely, e.g. without splitting v1.2.3 or 3.5 values.";
        let text = repeated_sentences(sentence, 180);
        let policy = ChunkPolicy {
            preferred_min_tokens: 40,
            preferred_max_tokens: 60,
            soft_ceiling_tokens: 80,
            hard_ceiling_tokens: 100,
        };
        let plan = plan_units(units_from_plain_text(&text), Some("source-a"), policy);
        assert!(plan.chunks.len() > 2);
        assert!(plan
            .chunks
            .iter()
            .all(|chunk| chunk.estimated_tokens <= 100));
        assert!(plan
            .chunks
            .iter()
            .all(|chunk| !chunk.text.starts_with("e. instructions")));
        assert_eq!(
            plan.chunks
                .iter()
                .map(|chunk| chunk.text.as_str())
                .collect::<Vec<_>>()
                .join(" "),
            text
        );
    }

    #[test]
    fn protected_periods_are_not_sentence_boundaries() {
        let samples = [
            "i.e. instructions",
            "e.g. examples",
            "Fernando et al. 2023",
            "version v1.2.3 remains",
            "value 3.5 remains",
            "https://example.com/path remains",
            "J. R. Smith remains",
        ];
        for sample in samples {
            let chars = sample.chars().collect::<Vec<_>>();
            for (index, ch) in chars.iter().enumerate() {
                if *ch == '.' && index + 1 < chars.len() {
                    assert!(
                        !is_sentence_break_at(&chars, index),
                        "false boundary in {sample} at {index}"
                    );
                }
            }
        }
    }

    #[test]
    fn adjacent_duplicates_only_are_removed() {
        let units = units_from_plain_text("Repeated.\n\nRepeated.\n\nDifferent.\n\nRepeated.");
        assert_eq!(
            units
                .iter()
                .map(|unit| unit.text.as_str())
                .collect::<Vec<_>>(),
            vec!["Repeated.", "Different.", "Repeated."]
        );
    }

    #[test]
    fn stable_ids_are_deterministic_and_source_scoped() {
        let first = plan_text("A paragraph.", Some("source-a"));
        let second = plan_text("A paragraph.", Some("source-a"));
        let other = plan_text("A paragraph.", Some("source-b"));
        assert_eq!(first.chunks[0].id, second.chunks[0].id);
        assert_ne!(first.chunks[0].id, other.chunks[0].id);
    }

    #[test]
    fn single_newline_sentences_become_one_natural_paragraph() {
        let text = [
            "我在杭州工作，周末通常去爬山。",
            "2016年9月，这里将举办盛大的 G20 峰会。",
            "全城都在忙绿地筹备，山路上也不例外。",
            "距离西湖最近的一圈山头，都在安装照明设备，准备在夜间亮灯。",
        ]
        .join("\n");

        let units = units_from_plain_text(&text);

        assert_eq!(units.len(), 1);
        assert!(units[0].text.contains("G20 峰会。全城"));
    }

    #[test]
    fn implicit_numbered_headings_create_section_boundaries() {
        let text = "01 大萧条的回响\n\n这里是第一节内容，讨论需求不足和技术冲击。\n\n02 这一次，机器瞄准了脑\n\n这里是第二节内容，讨论认知劳动和社会分工。";

        let plan = plan_text(text, Some("source-a"));

        assert_eq!(plan.chunks.len(), 2);
        assert!(plan.chunks[0].text.starts_with("01 大萧条的回响"));
        assert!(plan.chunks[1].text.starts_with("02 这一次"));
    }

    #[test]
    fn orphan_number_marker_stays_with_following_paragraph() {
        let units = units_from_plain_text(
            "2.\n现在的人们把每天去公司上班，视为天经地义的事情。\n许多人认为人生只有一种模式。\n\n3.",
        );

        assert_eq!(
            units[0].text,
            "2.\n\n现在的人们把每天去公司上班，视为天经地义的事情。许多人认为人生只有一种模式。"
        );
        assert_eq!(units[1].text, "3.");
    }

    #[test]
    fn html_structure_preserves_images_and_text_chunk_indexes() {
        let html = r#"<h2>Overview</h2><p>First paragraph.</p><figure><img src="https://example.com/chart.png" alt="Chart"><figcaption>Results</figcaption></figure><p>Second paragraph.</p>"#;

        let plan = plan_html(html, "", Some("source-a"));

        assert_eq!(plan.units.len(), 4);
        assert_eq!(plan.units[2].kind, ContentUnitKind::Image);
        assert_eq!(
            plan.units[2].media_url.as_deref(),
            Some("https://example.com/chart.png")
        );
        assert_eq!(plan.chunks.len(), 2);
        assert_eq!(plan.chunks[0].index, 0);
        assert_eq!(plan.chunks[1].index, 1);
        assert_eq!(plan.chunks[0].text, "Overview\n\nFirst paragraph.");
        assert_eq!(plan.chunks[1].text, "Second paragraph.");
    }
}
