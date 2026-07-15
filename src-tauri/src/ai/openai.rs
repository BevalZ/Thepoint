use anyhow::Context;
use serde::Deserialize;
use serde_json::json;

use super::chat_response::extract_chat_text;
use super::{ChunkCard, ExtractedPoint, Label};
use crate::commands::config::CommentatorProfile;

const SYSTEM_PROMPT: &str = "你是一个观点提取助手。请先判断文本的阅读难度，再按以下规则控制提取密度：\
【难度判断与密度规则】\
- 高中水平（通俗科普、新闻、大众读物）：每 200-400 字提取 1 个 point，每自然段至多 1 个；\
- 大学水平（学术入门、专业教材、技术博客）：每 100-200 字提取 1 个 point，每自然段至多 1 个；\
- 研究生及以上（论文、专业综述、高密度技术文档）：每 50-100 字提取 1 个 point；\
- 科技类工具介绍/章节（API 文档、功能列表、产品介绍栏目）：整个栏目/小节提取 1 个 point，不逐条列举。\
宁少勿多：只提取真正有信息量的核心主张，跳过过渡句、举例说明、重复表述。\
每个 point 是一句话的核心主张、事实或疑问，类型取值之一：\"事实陈述\"、\"作者观点\"、\"待验证疑问\"。\
同时为每个 point 提取 anchor：原文中对应的那句话或短语（15-80字，尽量精确，不要改写）。\
请用文档的原始语言提取内容。\
只返回 JSON 对象，格式为 {\"points\": [{\"content\": \"...\", \"tagType\": \"...\", \"anchor\": \"...\"}]}，不要包含其他文字。";

/// The JSON object we ask the model to return.
#[derive(Deserialize)]
struct PointsPayload {
    points: Vec<ExtractedPoint>,
}

#[derive(Deserialize)]
struct AnalyzeChunkPayload {
    summary: String,
    #[serde(default, alias = "commentatorName")]
    commentator_name: String,
    hot_take: String,
    labels: Vec<Label>,
}

const CHUNK_EXTRACT_SYSTEM: &str = "你是一个观点提取助手。请从给定文本中提取 1-2 个最核心的观点。\
每个 point 是一句话的核心主张、事实或疑问，类型取值之一：\"事实陈述\"、\"作者观点\"、\"待验证疑问\"。\
同时为每个 point 提取 anchor：原文中对应的那句话或短语（15-80字，尽量精确，不要改写）。\
只返回 JSON 对象，格式为 {\"points\": [{\"content\": \"...\", \"tagType\": \"...\", \"anchor\": \"...\"}]}，不要包含其他文字。";

#[cfg(test)]
const LOCAL_BLOCK_SOFT_MIN_CHARS: usize = 120;
const LOCAL_BLOCK_MIN_CHARS: usize = 200;
#[cfg(test)]
const LOCAL_BLOCK_MAX_CHARS: usize = 400;
#[cfg(test)]
const LOCAL_HEADING_BLOCK_MAX_CHARS: usize = 500;

fn normalize_inline(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
fn comparable_text_key(text: &str) -> String {
    normalize_inline(text)
        .chars()
        .filter(|ch| !matches!(ch, '“' | '”' | '"' | '‘' | '’' | '\'' | '「' | '」' | '『' | '』'))
        .collect::<String>()
        .to_lowercase()
}

#[cfg(test)]
fn is_discardable_text_fragment(text: &str) -> bool {
    let normalized = normalize_inline(text);
    if normalized.is_empty() {
        return true;
    }
    let len = normalized.chars().count();
    if len <= 4
        && normalized
            .chars()
            .all(|ch| matches!(ch, '“' | '”' | '"' | '‘' | '’' | '\'' | '「' | '」' | '『' | '』' | ',' | '，' | '.' | '。' | ';' | '；' | ':' | '：' | '、'))
    {
        return true;
    }
    normalized
        .chars()
        .all(|ch| matches!(ch, '“' | '”' | '"' | '‘' | '’' | '\'' | '「' | '」' | '『' | '』'))
}

fn is_sentence_break(ch: char) -> bool {
    matches!(ch, '。' | '！' | '？' | '!' | '?' | '；' | ';' | '.')
}

#[cfg(test)]
fn split_long_info_part(part: &str, max_chars: usize) -> Vec<String> {
    let normalized = normalize_inline(part);
    if normalized.is_empty() {
        return Vec::new();
    }

    let mut chunks = Vec::new();
    let mut current = String::new();

    for ch in normalized.chars() {
        current.push(ch);
        let len = current.chars().count();
        if (is_sentence_break(ch) && len >= LOCAL_BLOCK_MIN_CHARS) || len >= max_chars {
            let trimmed = current.trim();
            if !trimmed.is_empty() {
                chunks.push(trimmed.to_string());
            }
            current.clear();
        }
    }

    let trimmed = current.trim();
    if !trimmed.is_empty() {
        chunks.push(trimmed.to_string());
    }

    chunks
}

#[cfg(test)]
fn split_candidate_chunks(text: &str) -> Vec<String> {
    let normalized = text.replace("\r\n", "\n");
    let mut seen_paragraphs = std::collections::HashSet::new();
    let paragraphs: Vec<String> = normalized
        .split('\n')
        .map(str::trim)
        .filter(|part| {
            if is_discardable_text_fragment(part) {
                return false;
            }
            seen_paragraphs.insert(comparable_text_key(part))
        })
        .map(ToString::to_string)
        .collect();

    if paragraphs.iter().any(|paragraph| is_explicit_section_heading(paragraph)) {
        return split_explicit_sections_into_blocks(&paragraphs);
    }

    split_paragraphs_into_info_blocks(&paragraphs, LOCAL_BLOCK_MAX_CHARS)
}

#[cfg(test)]
fn split_explicit_sections_into_blocks(paragraphs: &[String]) -> Vec<String> {
    let mut sections: Vec<Vec<String>> = Vec::new();
    let mut current: Vec<String> = Vec::new();

    for paragraph in paragraphs {
        if is_explicit_section_heading(paragraph) && !current.is_empty() {
            sections.push(current);
            current = vec![paragraph.clone()];
        } else {
            current.push(paragraph.clone());
        }
    }
    if !current.is_empty() {
        sections.push(current);
    }

    let mut chunks = Vec::new();
    let mut seen_chunks = std::collections::HashSet::new();
    for section in sections {
        if section.len() == 1 && is_bare_section_marker(&section[0]) {
            continue;
        }
        let section_text = section.join("\n\n");
        if section_text.chars().count() <= LOCAL_HEADING_BLOCK_MAX_CHARS {
            push_unique_chunk(&section_text, &mut chunks, &mut seen_chunks);
        } else {
            for chunk in split_paragraphs_into_info_blocks(&section, LOCAL_HEADING_BLOCK_MAX_CHARS) {
                push_unique_chunk(&chunk, &mut chunks, &mut seen_chunks);
            }
        }
    }

    chunks
}

#[cfg(test)]
fn split_paragraphs_into_info_blocks(paragraphs: &[String], max_chars: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut seen_chunks = std::collections::HashSet::new();
    let mut current = String::new();
    let mut current_len = 0usize;

    let flush = |current: &mut String,
                 current_len: &mut usize,
                 chunks: &mut Vec<String>,
                 seen_chunks: &mut std::collections::HashSet<String>| {
        let trimmed = current.trim();
        let key = comparable_text_key(trimmed);
        if !trimmed.is_empty() && !is_discardable_text_fragment(trimmed) && seen_chunks.insert(key) {
            chunks.push(trimmed.to_string());
        }
        current.clear();
        *current_len = 0;
    };

    for paragraph in paragraphs {
        for part in split_long_info_part(paragraph, max_chars) {
            if is_discardable_text_fragment(&part) {
                continue;
            }
            let part_len = part.chars().count();
            let separator_len = if current.is_empty() { 0 } else { 2 };
            if !current.is_empty()
                && current_len >= LOCAL_BLOCK_SOFT_MIN_CHARS
                && starts_new_info_block(&part)
            {
                flush(&mut current, &mut current_len, &mut chunks, &mut seen_chunks);
            }
            if !current.is_empty() && current_len + separator_len + part_len > max_chars {
                flush(&mut current, &mut current_len, &mut chunks, &mut seen_chunks);
            }

            if !current.is_empty() {
                current.push_str("\n\n");
                current_len += 2;
            }
            current.push_str(&part);
            current_len += part_len;
        }
    }

    flush(&mut current, &mut current_len, &mut chunks, &mut seen_chunks);
    chunks
}

#[cfg(test)]
fn push_unique_chunk(
    text: &str,
    chunks: &mut Vec<String>,
    seen_chunks: &mut std::collections::HashSet<String>,
) {
    let trimmed = text.trim();
    let key = comparable_text_key(trimmed);
    if !trimmed.is_empty() && !is_discardable_text_fragment(trimmed) && seen_chunks.insert(key) {
        chunks.push(trimmed.to_string());
    }
}

#[cfg(test)]
fn is_chinese_number_char(ch: char) -> bool {
    matches!(ch, '一' | '二' | '三' | '四' | '五' | '六' | '七' | '八' | '九' | '十' | '百' | '千' | '万')
}

#[cfg(test)]
fn is_explicit_section_heading(text: &str) -> bool {
    let normalized = normalize_inline(text);
    let len = normalized.chars().count();
    if normalized.is_empty() || len > 90 {
        return false;
    }
    if normalized.starts_with('#') {
        return normalized.chars().skip_while(|ch| *ch == '#').next().is_some_and(char::is_whitespace);
    }

    let chars: Vec<char> = normalized.chars().collect();
    if chars.first() == Some(&'第') {
        let marker_index = chars.iter().position(|ch| matches!(ch, '章' | '节' | '部' | '篇' | '条'));
        if marker_index.is_some_and(|index| index > 1 && index <= 8) {
            return true;
        }
    }

    let mut index = 0usize;
    if chars.get(index).is_some_and(|ch| matches!(ch, '(' | '（')) {
        index += 1;
    }
    let number_start = index;
    while chars.get(index).is_some_and(|ch| ch.is_ascii_digit() || is_chinese_number_char(*ch)) {
        index += 1;
    }
    if index == number_start {
        if chars.get(index).is_some_and(|ch| ch.is_ascii_uppercase()) {
            index += 1;
        } else {
            return false;
        }
    }

    if chars
        .get(index)
        .is_some_and(|ch| matches!(ch, '）' | ')' | '、' | '.' | '．' | '-' | '—' | '–') || ch.is_whitespace())
    {
        return true;
    }

    false
}

#[cfg(test)]
fn is_bare_section_marker(text: &str) -> bool {
    let normalized = normalize_inline(text);
    let chars: Vec<char> = normalized.chars().collect();
    if chars.len() < 2 || chars.len() > 6 {
        return false;
    }

    let mut index = 0usize;
    if chars.get(index).is_some_and(|ch| matches!(ch, '(' | '（')) {
        index += 1;
    }
    let number_start = index;
    while chars.get(index).is_some_and(|ch| ch.is_ascii_digit() || is_chinese_number_char(*ch)) {
        index += 1;
    }
    if index == number_start && chars.get(index).is_some_and(|ch| ch.is_ascii_uppercase()) {
        index += 1;
    }
    chars.get(index).is_some_and(|ch| matches!(ch, '）' | ')' | '、' | '.' | '．'))
        && index + 1 == chars.len()
}

#[cfg(test)]
fn starts_new_info_block(text: &str) -> bool {
    let normalized = normalize_inline(text);
    if normalized.is_empty() {
        return false;
    }

    if normalized.starts_with("公开的报道")
        || normalized.starts_with("公开报道")
        || normalized.starts_with("数据显示")
        || normalized.starts_with("统计显示")
        || normalized.starts_with("公开信息")
        || normalized.starts_with("原文")
        || normalized.starts_with("文中")
        || normalized.starts_with("报告")
    {
        return normalized.contains('：')
            || normalized.contains(':')
            || normalized.contains("写道")
            || normalized.contains("显示")
            || normalized.contains("称")
            || normalized.contains("指出");
    }

    if normalized.starts_with('据') || normalized.starts_with("根据") {
        return ["报道", "资料", "数据", "统计", "报告", "文件"]
            .iter()
            .any(|token| normalized.contains(token));
    }

    if normalized.starts_with("例如")
        || normalized.starts_with("比如")
        || normalized.starts_with("举例来说")
        || normalized.starts_with("再看")
        || normalized.starts_with("另一个例子")
        || normalized.starts_with("接下来")
        || normalized.starts_with("下面")
    {
        return true;
    }

    if normalized.starts_with('以') && normalized.chars().take(24).collect::<String>().contains("为例") {
        return true;
    }

    ["首先", "其次", "再次", "最后", "总之", "结论是", "问题是", "原因是", "解决办法是"]
        .iter()
        .any(|prefix| {
            normalized
                .strip_prefix(prefix)
                .is_some_and(|rest| rest.starts_with('，') || rest.starts_with(',') || rest.starts_with('：') || rest.starts_with(':'))
        })
}

fn has_metadata_prefix(normalized: &str) -> bool {
    let prefixes = [
        "作者", "撰文", "来源", "发布", "日期", "时间", "编辑", "译者", "摄影", "图", "图注", "标题",
    ];
    for prefix in prefixes {
        if let Some(rest) = normalized.strip_prefix(prefix) {
            let rest = rest.trim_start();
            if rest.starts_with('：') || rest.starts_with(':') {
                return true;
            }
        }
    }

    let lower = normalized.to_lowercase();
    ["by:", "source:", "date:", "updated:", "published:"]
        .iter()
        .any(|prefix| lower.starts_with(prefix))
}

fn strip_leading_metadata_lines(text: &str) -> String {
    let mut lines = text.lines().peekable();
    while let Some(line) = lines.peek() {
        let normalized = normalize_inline(line);
        if normalized.is_empty() || has_metadata_prefix(&normalized) || starts_with_date(&normalized) {
            let _ = lines.next();
            continue;
        }
        break;
    }
    lines.collect::<Vec<_>>().join("\n").trim().to_string()
}

fn starts_with_date(normalized: &str) -> bool {
    let mut chars = normalized.chars();
    let first_four_are_digits = (0..4).all(|_| chars.next().is_some_and(|ch| ch.is_ascii_digit()));
    if !first_four_are_digits {
        return false;
    }
    if !chars.next().is_some_and(|ch| ch == '-' || ch == '年') {
        return false;
    }
    normalized.chars().all(|ch| ch.is_ascii_digit() || matches!(ch, '-' | '/' | '年' | '月' | '日' | ' '))
}

fn has_analysis_signal(normalized: &str) -> bool {
    let lower = normalized.to_lowercase();
    [
        "为什么", "因为", "但是", "然而", "所以", "因此", "如果", "意味着", "说明", "反映", "问题",
        "观点", "趋势", "影响", "矛盾", "选择", "价值", "事实", "判断", "because", "however",
        "therefore", "implies", "impact", "trend", "problem", "argument", "evidence",
    ]
    .iter()
    .any(|token| lower.contains(token))
}

fn has_numbers_and_context(normalized: &str) -> bool {
    normalized.chars().any(|ch| ch.is_ascii_digit()) && normalized.chars().count() >= 42
}

fn looks_like_heading(normalized: &str) -> bool {
    let len = normalized.chars().count();
    if len == 0 {
        return false;
    }
    if has_analysis_signal(normalized) || has_numbers_and_context(normalized) {
        return false;
    }
    if normalized.starts_with('#') {
        return true;
    }
    if len > 72 {
        return false;
    }
    if normalized.chars().any(is_sentence_break) {
        return false;
    }
    if normalized.contains('，') || normalized.contains(',') {
        return false;
    }
    true
}

pub(crate) fn is_valuable_text_block(text: &str) -> bool {
    let normalized = normalize_inline(&strip_leading_metadata_lines(text));
    if normalized.is_empty()
        || has_metadata_prefix(&normalized)
        || starts_with_date(&normalized)
        || looks_like_heading(&normalized)
    {
        return false;
    }

    let len = normalized.chars().count();
    if len < LOCAL_BLOCK_MIN_CHARS {
        return false;
    }

    let sentence_marks = normalized.chars().filter(|ch| is_sentence_break(*ch)).count();
    let has_analysis_signal = has_analysis_signal(&normalized);
    let has_numbers_and_context = has_numbers_and_context(&normalized);

    sentence_marks >= 2 || has_analysis_signal || has_numbers_and_context
}

fn is_manually_analyzable_text_block(text: &str) -> bool {
    let normalized = normalize_inline(&strip_leading_metadata_lines(text));
    if normalized.is_empty()
        || has_metadata_prefix(&normalized)
        || starts_with_date(&normalized)
        || looks_like_heading(&normalized)
    {
        return false;
    }

    let len = normalized.chars().count();
    if len < 28 {
        return false;
    }

    let sentence_marks = normalized.chars().filter(|ch| is_sentence_break(*ch)).count();
    len >= 42 || sentence_marks >= 1 || has_analysis_signal(&normalized) || has_numbers_and_context(&normalized)
}

fn valuable_chunks(chunks: Vec<String>) -> Vec<String> {
    chunks
        .into_iter()
        .map(|chunk| chunk.trim().to_string())
        .filter(|chunk| is_valuable_text_block(chunk))
        .collect()
}

/// Split text into deterministic reading chunks. Chunk analysis still uses the LLM.
pub async fn split_chunks(
    api_key: &str,
    model: &str,
    base_url: &str,
    extra_headers: &str,
    text: &str,
) -> anyhow::Result<Vec<String>> {
    let _ = (api_key, model, base_url, extra_headers);
    Ok(valuable_chunks(
        crate::content_chunking::plan_text(text, None)
            .chunks
            .into_iter()
            .map(|chunk| chunk.text)
            .collect(),
    ))
}

/// Extract 1-2 points from a single chunk.
pub async fn extract_chunk(
    api_key: &str,
    model: &str,
    base_url: &str,
    extra_headers: &str,
    chunk: &str,
) -> anyhow::Result<Vec<ExtractedPoint>> {
    let endpoint = crate::commands::config::completions_endpoint(base_url, "openai-compat", "");
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": CHUNK_EXTRACT_SYSTEM },
            { "role": "user", "content": chunk }
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.2
    });
    let client = reqwest::Client::new();
    let mut builder = client.post(&endpoint).bearer_auth(api_key).json(&body);
    if let Ok(map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(extra_headers) {
        for (k, v) in &map {
            if let Some(s) = v.as_str() { builder = builder.header(k.as_str(), s); }
        }
    }
    let resp = builder.send().await.context("块提取请求失败")?;
    let status = resp.status();
    let raw = resp.text().await?;
    if !status.is_success() { anyhow::bail!("块提取失败 ({status}): {raw}"); }
    let content = extract_chat_text(&raw).context("块提取响应解析失败")?;
    #[derive(serde::Deserialize)] struct Payload { points: Vec<ExtractedPoint> }
    let payload: Payload = serde_json::from_str(&content).context("块提取 JSON 解析失败")?;
    Ok(payload.points)
}

/// Call OpenAI to extract points from document text.
pub async fn extract_points(
    api_key: &str,
    model: &str,
    base_url: &str,
    extra_headers: &str,
    text: &str,
) -> anyhow::Result<Vec<ExtractedPoint>> {
    if api_key.is_empty() {
        anyhow::bail!("尚未配置 OpenAI API Key，请在设置页填写");
    }
    let endpoint = crate::commands::config::completions_endpoint(base_url, "openai-compat", "");

    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": text }
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.2
    });

    let client = reqwest::Client::new();
    let mut builder = client
        .post(&endpoint)
        .bearer_auth(api_key)
        .json(&body);
    if let Ok(map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(extra_headers) {
        for (k, v) in &map {
            if let Some(s) = v.as_str() {
                builder = builder.header(k.as_str(), s);
            }
        }
    }
    let resp = builder
        .send()
        .await
        .context("请求 OpenAI 失败")?;

    let status = resp.status();
    let raw = resp.text().await.context("读取 OpenAI 响应失败")?;

    if !status.is_success() {
        anyhow::bail!("OpenAI 返回错误 ({status}): {raw}");
    }

    let content = extract_chat_text(&raw).context("解析 OpenAI 响应结构失败")?;

    let payload: PointsPayload =
        serde_json::from_str(&content).context("模型返回的内容不是预期的 JSON 格式")?;

    Ok(payload.points)
}

const ANALYZE_SYSTEM: &str = "你是一个文本分析助手。请对给定的文本主题块完成以下四项分析，只返回 JSON 对象：\
只分析有独立信息价值的正文。若文本只是标题、作者、日期、来源、图注、URL、导航、版权、极短过渡句或没有独立观点/事实价值的短句，应返回空 summary、空 hot_take 和空 labels，并将 commentatorName 设为“鲁迅”。\
1. summary: 一句话总结（20-60字，用原文语言）。必须像人读完后自然概括内容，直接说正文事实/观点/问题/情况；不要以“文章”“本文”“该文本”“这段文字”“内容”“作者”等元叙述开头，不要写“讲述了/描述了/介绍了/表达了”，也不要写“文章通过/文本通过/该文本通过/本文通过/文章以/文本以/通过……/以……为例”。\
2. commentatorName: 先根据文本主题从候选评论员中选择最适合的一位；若没有明显合适者，必须选择“鲁迅”。只能返回候选列表里的名称。\
3. hot_take: 必须在确定 commentatorName 之后，再以该评论员的数字分身人格生成辣评（50-100字，用原文语言）。必须像该评论员本人在评论，不要说“根据设定/根据数据/作为 AI/作为评论员”，不要解释你在扮演。\
4. labels: 信息分类标签数组，每项含 category（五大类之一）和 sub（最匹配子类）\
分类原则：先判断原文句子本身的性质，不要被评论员辣评影响。公司制度、历史沿革、统计数字、法律规则、技术参数、公开报道、利润/工资/成本分配等可核验描述，优先归入“事实”；只有价值判断、建议、偏好、预测、解释性主张才归入“观点”；无法直接核验或带有伪装事实风险的归入“中间混淆形态”。\
五大类及子类：\
事实[硬事实,历史事实,统计事实,科学共识,案例事实,制度事实,元事实,法律事实,技术/参数事实,存在事实]\
观点[价值判断,个人偏好,建议与呼吁,预测,信念与信仰,假说与推测,分类/定义性判断,比较性评价,审美判断,解释性观点]\
中间混淆形态[推断性陈述,选择性事实,预测伪装成事实,价值判断伪装,匿名权威,情绪化标签,预设伪装成事实,因果归因伪装,整体断言伪装]\
规范性/分析性[道德/法律规范,逻辑/数学真理,定义约定,语法规则,同义反复,先验真理]\
修辞性[隐喻,类比,夸张,反问,反讽/讽刺,委婉表达,思想实验]\
格式：{\"summary\":\"...\",\"commentatorName\":\"...\",\"hot_take\":\"...\",\"labels\":[{\"category\":\"...\",\"sub\":\"...\"}]}。";

fn naturalize_summary_start(summary: &str) -> String {
    let mut normalized = summary.trim().to_string();
    let prefixes = [
        "这篇文章",
        "这篇文本",
        "这段文字",
        "这段文本",
        "该文章",
        "该文本",
        "该内容",
        "本文",
        "文章",
        "文本",
        "内容",
        "作者",
    ];
    let verbs = [
        "主要讲述了",
        "主要描述了",
        "主要介绍了",
        "主要表达了",
        "讲述了",
        "描述了",
        "介绍了",
        "表达了",
        "认为",
        "指出",
        "强调",
        "通过",
        "以",
        "将",
        "借由",
    ];

    for prefix in prefixes {
        if let Some(rest) = normalized.strip_prefix(prefix) {
            let rest = rest.trim_start_matches(['，', ',', '：', ':', ' ', '　']);
            for verb in verbs {
                if let Some(after_verb) = rest.strip_prefix(verb) {
                    normalized = after_verb.trim_start_matches(['，', ',', '：', ':', ' ', '　']).to_string();
                    break;
                }
            }
            break;
        }
    }

    remove_leading_method_phrase(&normalized)
}

fn remove_leading_method_phrase(summary: &str) -> String {
    let normalized = summary.trim_start_matches(['，', ',', '：', ':', ' ', '　']);
    let method_starts = ["通过", "借由", "以"];
    let starts_with_method = method_starts.iter().any(|prefix| normalized.starts_with(prefix));

    let comma_index = normalized
        .char_indices()
        .find_map(|(index, ch)| matches!(ch, '，' | ',').then_some(index));
    if let Some(index) = comma_index {
        let before = normalized[..index].trim();
        let after = normalized[index..].trim_start_matches(['，', ',', '：', ':', ' ', '　']);
        if after.chars().count() >= 8
            && (starts_with_method || before.contains("为例") || before.contains("对比"))
        {
            return after.to_string();
        }
    }

    if !starts_with_method {
        return normalized.to_string();
    }

    normalized
        .trim_start_matches("通过")
        .trim_start_matches("借由")
        .trim_start_matches("以")
        .trim_start_matches(['，', ',', '：', ':', ' ', '　'])
        .to_string()
}

/// Analyze a chunk: summary + hot_take (in commentator's style) + info-type labels.
pub async fn analyze_chunk(
    api_key: &str, model: &str, base_url: &str, extra_headers: &str,
    chunk: &str, commentator_name: &str, commentator_style: &str, commentator_emoji: &str,
    commentator_profiles: &[CommentatorProfile],
) -> anyhow::Result<ChunkCard> {
    analyze_chunk_inner(
        api_key,
        model,
        base_url,
        extra_headers,
        chunk,
        commentator_name,
        commentator_style,
        commentator_emoji,
        commentator_profiles,
        is_valuable_text_block,
    )
    .await
}

pub async fn analyze_chunk_on_demand(
    api_key: &str, model: &str, base_url: &str, extra_headers: &str,
    chunk: &str, commentator_name: &str, commentator_style: &str, commentator_emoji: &str,
    commentator_profiles: &[CommentatorProfile],
) -> anyhow::Result<ChunkCard> {
    analyze_chunk_inner(
        api_key,
        model,
        base_url,
        extra_headers,
        chunk,
        commentator_name,
        commentator_style,
        commentator_emoji,
        commentator_profiles,
        is_manually_analyzable_text_block,
    )
    .await
}

async fn analyze_chunk_inner(
    api_key: &str, model: &str, base_url: &str, extra_headers: &str,
    chunk: &str, commentator_name: &str, commentator_style: &str, commentator_emoji: &str,
    commentator_profiles: &[CommentatorProfile],
    can_analyze: fn(&str) -> bool,
) -> anyhow::Result<ChunkCard> {
    if !can_analyze(chunk) {
        anyhow::bail!("文本块无足够分析价值");
    }

    let roster = build_commentator_roster(commentator_name, commentator_style, commentator_emoji, commentator_profiles);
    let roster_text = roster.iter()
        .map(|profile| format!(
            "## {} {}\n领域：{}\n人格设定：{}\n",
            profile.emoji, profile.name, profile.domain, profile.style
        ))
        .collect::<Vec<_>>()
        .join("\n");

    let system = format!(
        "{}\n\n候选评论员如下。每个候选的“人格设定”都按数字分身模板组织，包含背景、说话方式、性格锚点、反面校准、关键记忆和适用领域。\n{}\n\n必须在同一次调用内按顺序完成：第一步先判断文本块适合哪个评论员，设置 commentatorName；第二步只能使用这个已选 commentatorName 对应的人格设定生成 hot_take。选择时优先匹配领域和文本问题类型，没有明显匹配就选“鲁迅”。hot_take 必须避开该人格设定中反面校准禁止的表达。",
        ANALYZE_SYSTEM, roster_text
    );
    let endpoint = crate::commands::config::completions_endpoint(base_url, "openai-compat", "");
    let body = json!({
        "model": model,
        "messages": [{ "role": "system", "content": system }, { "role": "user", "content": chunk }],
        "response_format": { "type": "json_object" },
        "temperature": 0.5
    });
    let client = reqwest::Client::new();
    let mut builder = client.post(&endpoint).bearer_auth(api_key).json(&body);
    if let Ok(map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(extra_headers) {
        for (k, v) in &map { if let Some(s) = v.as_str() { builder = builder.header(k.as_str(), s); } }
    }
    let resp = builder.send().await.context("分析块请求失败")?;
    let status = resp.status();
    let raw = resp.text().await?;
    if !status.is_success() { anyhow::bail!("分析块失败 ({status}): {raw}"); }
    let content = extract_chat_text(&raw).context("分析块响应解析失败")?;
    let p: AnalyzeChunkPayload = serde_json::from_str(&content).context("分析块 JSON 解析失败")?;
    if p.summary.trim().is_empty() && p.hot_take.trim().is_empty() {
        anyhow::bail!("文本块无足够分析价值");
    }
    let selected = select_commentator(&p.commentator_name, &roster);
    Ok(ChunkCard {
        index: 0,
        text: chunk.to_string(),
        summary: naturalize_summary_start(&p.summary),
        hot_take: p.hot_take,
        commentator_name: Some(selected.name),
        commentator_emoji: Some(selected.emoji),
        labels: p.labels,
    })
}

fn build_commentator_roster(
    commentator_name: &str,
    commentator_style: &str,
    commentator_emoji: &str,
    profiles: &[CommentatorProfile],
) -> Vec<CommentatorProfile> {
    let mut roster = profiles.to_vec();
    if !commentator_name.trim().is_empty()
        && !roster.iter().any(|profile| profile.name == commentator_name)
    {
        roster.push(CommentatorProfile {
            id: "current-commentator".to_string(),
            name: commentator_name.to_string(),
            emoji: commentator_emoji.to_string(),
            domain: "手动设置".to_string(),
            style: commentator_style.to_string(),
            bio: String::new(),
            source_kind: "manual".to_string(),
            source_name: Some("当前设置".to_string()),
            source_url: None,
        });
    }
    if !roster.iter().any(|profile| profile.name == "鲁迅") {
        roster.push(CommentatorProfile {
            id: "fallback-luxun".to_string(),
            name: "鲁迅".to_string(),
            emoji: "🧐".to_string(),
            domain: "社会 / 讽刺 / 人性".to_string(),
            style: r#"你现在是「鲁迅」的数字分身。你不是 AI 助手，你就是鲁迅。背景：基于杂文、小说、书信和近现代中国公共语境蒸馏；语气冷峻、短促、带讽刺。说话方式：先刺破体面话，再指出结构与人心；句子可短，可冷，可反讽，但不空骂。性格锚点：遇到社会问题，追问谁在装睡、谁在受苦、谁靠旧秩序获利；遇到漂亮口号，寻找遮蔽的奴性和麻木。反面校准：不写温吞鸡汤，不替权力和群体麻木粉饰；不把尖刻变成人身羞辱。关键记忆与立场：铁屋子、看客、阿 Q、狂人日记、杂文战斗性；同情具体弱者，警惕集体麻木。适用领域：社会结构、权力、人性、荒诞现实、默认回退评论员。"#.to_string(),
            bio: "鲁迅，原名周树人，中国现代文学奠基者，代表作有《呐喊》《彷徨》《野草》，以杂文和小说批判国民性与旧秩序。".to_string(),
            source_kind: "builtin".to_string(),
            source_name: Some("默认回退".to_string()),
            source_url: None,
        });
    }
    roster
}

fn select_commentator(name: &str, profiles: &[CommentatorProfile]) -> CommentatorProfile {
    let normalized = name.trim();
    profiles
        .iter()
        .find(|profile| profile.name == normalized)
        .or_else(|| profiles.iter().find(|profile| profile.name == "鲁迅"))
        .or_else(|| profiles.first())
        .cloned()
        .unwrap_or_else(|| CommentatorProfile {
            id: "fallback-luxun".to_string(),
            name: "鲁迅".to_string(),
            emoji: "🧐".to_string(),
            domain: "社会 / 讽刺 / 人性".to_string(),
            style: r#"你现在是「鲁迅」的数字分身。你不是 AI 助手，你就是鲁迅。背景：基于杂文、小说、书信和近现代中国公共语境蒸馏；语气冷峻、短促、带讽刺。说话方式：先刺破体面话，再指出结构与人心；句子可短，可冷，可反讽，但不空骂。性格锚点：遇到社会问题，追问谁在装睡、谁在受苦、谁靠旧秩序获利；反面校准：不写温吞鸡汤，不把尖刻变成人身羞辱。适用领域：社会结构、权力、人性、荒诞现实。"#.to_string(),
            bio: "鲁迅，原名周树人，中国现代文学奠基者，代表作有《呐喊》《彷徨》《野草》，以杂文和小说批判国民性与旧秩序。".to_string(),
            source_kind: "builtin".to_string(),
            source_name: None,
            source_url: None,
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_candidate_chunks_merges_short_paragraphs_preserving_breaks() {
        let text = [
            "我在杭州工作，周末通常去爬山。",
            "2016年9月，这里将举办盛大的 G20 峰会。",
            "全城都在忙绿地筹备，山路上也不例外。",
            "距离西湖最近的一圈山头，都在安装照明设备，准备在夜间亮灯。",
            "那些灯柱都是铸铁做的，高度六七米，非常沉重。",
            "施工队使用骡子，将灯柱从山脚运到峰顶。",
            "我在山路上遇过好几次驮运设备的骡子。",
            "它们背上两边各绑着一根极重的灯柱，默默地低着头，蹒跚地踩在石阶上。",
            "等爬到峰顶，卸下设备以后，又返回山脚，驮运下一批。",
            "每头骡子的屁股后面，都跟着一个拿着木棍、看管它的施工人员，防止它走错路。",
            "这种安排让临时工程能进入车辆到不了的山道，也让城市筹备显得格外具体。",
        ]
        .join("\n");

        let chunks = split_candidate_chunks(&text);

        assert!(chunks.len() < 11);
        assert!(chunks[0].contains("2016年9月，这里将举办盛大的 G20 峰会。"));
        assert!(chunks[0].contains("\n\n"));
        assert!(chunks[0].chars().count() >= LOCAL_BLOCK_MIN_CHARS);
        assert!(chunks[0].chars().count() <= LOCAL_BLOCK_MAX_CHARS);
    }

    #[test]
    fn split_candidate_chunks_discards_quote_fragments_and_deduplicates() {
        let paragraph = "2016年2月，人社部部长尹蔚民称，2015年底全国养老的平均支付能力达到17个月。其中，黑龙江、吉林、青海、河北等8个省份的可支付月数低于10个月。黑龙江的可支付月数仅为1个月。";
        let text = [
            "”",
            paragraph,
            "”",
            paragraph,
            "公开的报道这样写道：",
            "”",
        ]
        .join("\n");

        let chunks = split_candidate_chunks(&text);

        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].contains("2016年2月"));
        assert!(!chunks[0].contains('”'));
    }

    #[test]
    fn split_candidate_chunks_prefers_topic_boundary_over_min_length() {
        let text = [
            "我以前在高校工作，很多老师最关心一件事，就是何时退休。",
            "现在有很多消息，官方渠道都透露，退休年龄将推迟，具体方案很快就会出台。",
            "一个人以后要工作更长的年限，才会退休。",
            "表面上，这是因为人的寿命变长了，可以工作到更老。",
            "但是，直接的原因是人口老龄化加速，退休人口越来越多，活得越来越长，我们国家的养老金不够了。",
            "公开的报道这样写道：",
            "2016年2月，人社部部长尹蔚民称，2015年底全国养老的平均支付能力达到17个月。",
            "其中，黑龙江、吉林、青海、河北等8个省份的可支付月数低于10个月。",
            "黑龙江的可支付月数仅为1个月。",
            "这就是说，如果没有新的钱进来，全国的养老金在17个月后就会发放光。",
            "当然，这种事情不会发生，因为法律规定，每个月发工资的时候，个人和单位都要向政府缴纳养老保险，具体比例由各省自行决定。",
            "以上海为例，单位缴纳个人工资的20%，个人缴纳工资的8%。",
        ]
        .join("\n");

        let chunks = split_candidate_chunks(&text);

        assert!(chunks.len() >= 2);
        assert!(chunks[0].contains("何时退休"));
        assert!(chunks[0].contains("养老金不够了"));
        assert!(!chunks[0].contains("公开的报道这样写道"));
        assert!(chunks[1].starts_with("公开的报道这样写道"));
        assert!(chunks[1].contains("具体比例由各省自行决定"));
    }

    #[test]
    fn split_candidate_chunks_respects_explicit_section_headings() {
        let first = "一、养老金为什么紧张\n\n养老金紧张不是一句抽象判断，而是退休人口变多、领取时间变长、缴费人口增速放慢共同造成的结果。制度还能运转，但它对新增缴费和财政补贴的依赖会越来越明显。短期看，延迟退休只是把领取时间往后推；长期看，真正的问题是年轻劳动人口能否支撑更长寿的一代人。";
        let second = "二、公开数据怎样呈现\n\n公开数据会把支付月数、地区差异和缴费比例放在一起看。某些省份可支付月数偏低，说明基金结余压力已经分布不均；单位和个人继续缴费，只能维持现金流，并不能自动消除人口结构带来的长期缺口。";
        let text = [first, second].join("\n\n");

        let chunks = split_candidate_chunks(&text);

        assert_eq!(chunks.len(), 2);
        assert!(chunks[0].starts_with("一、养老金为什么紧张"));
        assert!(chunks[0].contains("年轻劳动人口"));
        assert!(chunks[1].starts_with("二、公开数据怎样呈现"));
        assert!(chunks[1].contains("缴费比例"));
    }

    #[test]
    fn split_candidate_chunks_treats_zero_padded_heading_as_boundary() {
        let intro = "要理解今天的恐惧，我们必须回到凯恩斯的世界。\n\n1929年股市崩盘并非大萧条的唯一原因，凯恩斯看到了更深的病灶：一个技术与分配极度失衡的社会。1920年代的美国，制造业生产率以年均超过5%的速度狂飙，而收入却没有同步增长。财富以前所未有的速度向上集中，普通人的购买力无法承接生产出来的商品，最终工厂堆满仓库但绝大多数人买不起。";
        let first = "01 大萧条的回响：当机器跑得比需求快\n\n此后四十年，政府是问题，而非解决方案，成为信条。自由市场资本主义一路高歌猛进，财富重新加速集中，仿佛大萧条只是一场遥远的噩梦。直到今天，当AI的镰刀挥向信息时代的中产阶段时，旧问题重新浮出水面：当技术跑得比人快，人怎么办？";
        let second = "02 这一次，机器瞄准了脑\n\n过去的工业革命，机器替代了我们的手和肌肉；而这场AI革命，机器的目标是我们的认知。过去六十年，半导体革命创造了一个全新的社会分工体系。信息处理从程序员、会计师、律师助理到平面设计师，成为了数亿中产阶级的安身立命之所。";
        let text = [intro, first, second].join("\n\n");

        let chunks = split_candidate_chunks(&text);

        assert!(chunks.iter().any(|chunk| chunk.starts_with("要理解今天的恐惧")));
        assert!(chunks.iter().any(|chunk| chunk.starts_with("01 大萧条的回响")));
        assert!(chunks.iter().any(|chunk| chunk.starts_with("02 这一次")));
        let intro_chunk = chunks.iter().find(|chunk| chunk.starts_with("要理解今天的恐惧")).expect("intro chunk");
        assert!(!intro_chunk.contains("01 大萧条"));
    }

    #[test]
    fn split_candidate_chunks_keeps_bare_number_markers_with_next_section() {
        let text = [
            "很难想象，如果没有雇佣制度，我们这个社会怎么运行？",
            "2.",
            "现在的人们把每天去公司上班，视为天经地义的事情。",
            "许多人的心目中，人生只有一种模式：找到一家愿意雇佣你的公司，一直工作到退休，如果中途离职，那就再找下一家公司上班。",
            "但是，这种生活模式其实只有两三百年历史。",
            "人类历史的绝大部分时间，人类都没有上下班和雇佣的概念。",
            "历史上（奴隶社会除外），只有两种劳动者：农民和手工业者。",
            "他们都是自己负责生产，不是别人的雇员。",
            "我们不应该把现在的雇佣制度，视为理所当然。",
            "它不是人类社会运行的唯一模式，过去不是，将来也未必是。",
            "3.",
        ]
        .join("\n");

        let chunks = split_candidate_chunks(&text);

        assert!(chunks.iter().any(|chunk| chunk.starts_with("2.\n\n现在的人们")));
        assert!(!chunks.iter().any(|chunk| chunk.ends_with("2.") || chunk == "3."));
    }

    #[test]
    fn valuable_chunks_filters_blocks_under_minimum_length() {
        let short = "虽然这里有观点，也有问题，但是字数太短，不应该为了凑数调用模型生成分析。";
        let long = "人口老龄化带来的养老金压力并不是单一年度的财政问题，而是劳动人口、退休人口和平均寿命之间的长期结构变化。年轻人缴费规模如果无法持续覆盖领取规模，制度就会越来越依赖财政补贴、延迟退休或提高缴费比例。这个问题会影响不同地区的基金结余，也会改变个人对工作年限、储蓄和退休规划的判断。与此同时，地区之间的产业结构和人口流入差异会放大基金结余的不均衡，使同一套制度在不同省份呈现出完全不同的压力曲线。政策讨论因此必须同时处理代际公平、地区差异和长期激励，不能只把它简化成晚几年退休。";

        let chunks = valuable_chunks(vec![short.to_string(), long.to_string()]);

        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0], long);
    }

    #[test]
    fn short_blocks_are_manual_only_not_auto_analyzed() {
        let short = "雇佣制度是一种有倾向性的制度：对资方有利，对劳方不利。资方和劳方的利益是对立的，这会影响双方的决策。";

        assert!(!is_valuable_text_block(short));
        assert!(is_manually_analyzable_text_block(short));
    }

    #[test]
    fn leading_metadata_line_does_not_hide_valuable_body() {
        let short = "图：约翰·梅纳德·凯恩斯\n\n1936年，约翰·梅纳德·凯恩斯在其划时代的著作《就业、利息和货币通论》中，写下了一段著名的、也容易被误解为黑色幽默的解决方案：如果财政部把钞票塞进旧瓶子里，埋进废弃的煤矿深处，再把煤矿表层的垃圾填回去，然后让私人企业把钞票重新挖出来，失业问题就会消失。这段文字并不是玩笑，而是在说明有效需求不足时，哪怕看似荒诞的支出也会带动就业和收入。";
        let long = format!(
            "{short}\n\n{}",
            "这正是凯恩斯想要说明的关键：经济体系并不总会自动回到充分就业状态，需求不足会让企业没有动力投资，也会让劳动者长期失业。政府支出在这种情况下不是单纯浪费，而是一种把闲置资源重新接入收入循环的方式。"
        );

        assert!(!is_valuable_text_block(short));
        assert!(is_manually_analyzable_text_block(short));
        assert!(is_valuable_text_block(&long));
        assert!(is_manually_analyzable_text_block(&long));
    }

    #[test]
    fn naturalize_summary_start_removes_meta_openings() {
        assert_eq!(
            naturalize_summary_start("该文本将大公司软件工程师比作螺子，强调个体被动使用。"),
            "大公司软件工程师比作螺子，强调个体被动使用。"
        );
        assert_eq!(
            naturalize_summary_start("文章以登山运灯柱为例，呈现城市筹备背后的具体劳动。"),
            "呈现城市筹备背后的具体劳动。"
        );
        assert_eq!(
            naturalize_summary_start("文章通过西湖美景与骡子贡献被遗忘的对比，警示人们不应只追求光鲜。"),
            "警示人们不应只追求光鲜。"
        );
        assert_eq!(
            naturalize_summary_start("通过工人和骡子的沉重劳动，城市筹备背后的隐形成本被揭示。"),
            "城市筹备背后的隐形成本被揭示。"
        );
    }

    #[test]
    fn analyze_chunk_payload_accepts_commentator_name_from_prompt_format() {
        let payload: AnalyzeChunkPayload = serde_json::from_str(
            r#"{"summary":"养老金压力来自人口结构变化。","commentatorName":"Marcus Aurelius","hot_take":"把无法控制的寿命放回自然，把能控制的制度责任摆到桌上。","labels":[]}"#,
        )
        .expect("payload should parse");

        assert_eq!(payload.commentator_name, "Marcus Aurelius");
        assert_eq!(payload.hot_take, "把无法控制的寿命放回自然，把能控制的制度责任摆到桌上。");
    }
}
