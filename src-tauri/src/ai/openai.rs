use anyhow::Context;
use serde::Deserialize;
use serde_json::json;

use super::{ChunkCard, ExtractedPoint, Label};

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

/// OpenAI chat completion response (minimal shape we care about).
#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: Message,
}

#[derive(Deserialize)]
struct Message {
    content: String,
}

/// The JSON object we ask the model to return.
#[derive(Deserialize)]
struct PointsPayload {
    points: Vec<ExtractedPoint>,
}

const CHUNK_SYSTEM: &str = "你是一个文本分块助手。请将用户提供的文本按主题边界分割为若干块，每块约 1000 字。\
只保留信息密度足够、值得分析的正文块；跳过标题、作者、日期、来源、版权、导航、图注、URL、极短过渡句、重复说明和没有独立观点/事实价值的短句。\
如果没有值得分析的块，返回空数组。只返回 JSON 对象，格式为 {\"chunks\": [\"块1文本\", \"块2文本\", ...]}，不要包含其他文字。";

const CHUNK_EXTRACT_SYSTEM: &str = "你是一个观点提取助手。请从给定文本中提取 1-2 个最核心的观点。\
每个 point 是一句话的核心主张、事实或疑问，类型取值之一：\"事实陈述\"、\"作者观点\"、\"待验证疑问\"。\
同时为每个 point 提取 anchor：原文中对应的那句话或短语（15-80字，尽量精确，不要改写）。\
只返回 JSON 对象，格式为 {\"points\": [{\"content\": \"...\", \"tagType\": \"...\", \"anchor\": \"...\"}]}，不要包含其他文字。";

const LOCAL_BLOCK_LIMIT: usize = 320;

fn normalize_inline(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_sentence_break(ch: char) -> bool {
    matches!(ch, '。' | '！' | '？' | '!' | '?' | '；' | ';' | '.')
}

fn split_long_info_part(part: &str) -> Vec<String> {
    let normalized = normalize_inline(part);
    if normalized.is_empty() {
        return Vec::new();
    }

    let mut chunks = Vec::new();
    let mut current = String::new();

    for ch in normalized.chars() {
        current.push(ch);
        let len = current.chars().count();
        if (is_sentence_break(ch) && len >= 40) || len >= LOCAL_BLOCK_LIMIT {
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

fn split_candidate_chunks(text: &str) -> Vec<String> {
    text.replace("\r\n", "\n")
        .split('\n')
        .flat_map(split_long_info_part)
        .collect()
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

fn starts_with_date(normalized: &str) -> bool {
    let mut chars = normalized.chars();
    let first_four_are_digits = (0..4).all(|_| chars.next().is_some_and(|ch| ch.is_ascii_digit()));
    if !first_four_are_digits {
        return false;
    }
    chars.next().is_some_and(|ch| ch == '-' || ch == '年')
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

fn is_valuable_text_block(text: &str) -> bool {
    let normalized = normalize_inline(text);
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
    let has_analysis_signal = has_analysis_signal(&normalized);
    let has_numbers_and_context = has_numbers_and_context(&normalized);

    len >= 80 || sentence_marks >= 2 || has_analysis_signal || has_numbers_and_context
}

fn valuable_chunks(chunks: Vec<String>) -> Vec<String> {
    chunks
        .into_iter()
        .map(|chunk| normalize_inline(&chunk))
        .filter(|chunk| is_valuable_text_block(chunk))
        .collect()
}

/// Split text into thematic chunks (~1000 chars each) via LLM.
pub async fn split_chunks(
    api_key: &str,
    model: &str,
    base_url: &str,
    extra_headers: &str,
    text: &str,
) -> anyhow::Result<Vec<String>> {
    #[derive(serde::Deserialize)]
    struct Payload { chunks: Vec<String> }

    let local_valuable_chunks = valuable_chunks(split_candidate_chunks(text));

    // If text is short enough, skip the split model call.
    if text.chars().count() <= 1200 {
        return Ok(local_valuable_chunks);
    }

    let endpoint = crate::commands::config::completions_endpoint(base_url, "openai-compat", "");
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": CHUNK_SYSTEM },
            { "role": "user", "content": text }
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.1
    });
    let client = reqwest::Client::new();
    let mut builder = client.post(&endpoint).bearer_auth(api_key).json(&body);
    if let Ok(map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(extra_headers) {
        for (k, v) in &map {
            if let Some(s) = v.as_str() { builder = builder.header(k.as_str(), s); }
        }
    }
    let resp = builder.send().await.context("分块请求失败")?;
    let raw = resp.text().await?;
    let parsed: ChatResponse = serde_json::from_str(&raw).context("分块响应解析失败")?;
    let content = parsed.choices.into_iter().next().map(|c| c.message.content).context("分块响应为空")?;
    let payload: Payload = serde_json::from_str(&content).context("分块 JSON 解析失败")?;
    let chunks = valuable_chunks(payload.chunks);
    if chunks.is_empty() {
        return Ok(local_valuable_chunks);
    }
    Ok(chunks)
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
    let parsed: ChatResponse = serde_json::from_str(&raw).context("块提取响应解析失败")?;
    let content = parsed.choices.into_iter().next().map(|c| c.message.content).context("块提取响应为空")?;
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

    let parsed: ChatResponse =
        serde_json::from_str(&raw).context("解析 OpenAI 响应结构失败")?;

    let content = parsed
        .choices
        .first()
        .map(|c| c.message.content.as_str())
        .context("OpenAI 响应不含任何结果")?;

    let payload: PointsPayload =
        serde_json::from_str(content).context("模型返回的内容不是预期的 JSON 格式")?;

    Ok(payload.points)
}

const ANALYZE_SYSTEM: &str = "你是一个文本分析助手。请对给定的文本主题块完成以下三项分析，只返回 JSON 对象：\
只分析有独立信息价值的正文。若文本只是标题、作者、日期、来源、图注、URL、导航、版权、极短过渡句或没有独立观点/事实价值的短句，应返回空 summary、空 hot_take 和空 labels。\
1. summary: 一句话总结（20-60字，用原文语言）\
2. hot_take: 以指定评论员风格生成的辣评（50-100字，用原文语言）\
3. labels: 信息分类标签数组，每项含 category（五大类之一）和 sub（最匹配子类）\
五大类及子类：\
事实[硬事实,历史事实,统计事实,科学共识,案例事实,制度事实,元事实,法律事实,技术/参数事实,存在事实]\
观点[价值判断,个人偏好,建议与呼吁,预测,信念与信仰,假说与推测,分类/定义性判断,比较性评价,审美判断,解释性观点]\
中间混淆形态[推断性陈述,选择性事实,预测伪装成事实,价值判断伪装,匿名权威,情绪化标签,预设伪装成事实,因果归因伪装,整体断言伪装]\
规范性/分析性[道德/法律规范,逻辑/数学真理,定义约定,语法规则,同义反复,先验真理]\
修辞性[隐喻,类比,夸张,反问,反讽/讽刺,委婉表达,思想实验]\
格式：{\"summary\":\"...\",\"hot_take\":\"...\",\"labels\":[{\"category\":\"...\",\"sub\":\"...\"}]}";

/// Analyze a chunk: summary + hot_take (in commentator's style) + info-type labels.
pub async fn analyze_chunk(
    api_key: &str, model: &str, base_url: &str, extra_headers: &str,
    chunk: &str, commentator_name: &str, commentator_style: &str,
) -> anyhow::Result<ChunkCard> {
    #[derive(Deserialize)] struct Payload { summary: String, hot_take: String, labels: Vec<Label> }

    if !is_valuable_text_block(chunk) {
        anyhow::bail!("文本块无足够分析价值");
    }

    let system = format!(
        "{}\n\n评论员：名称「{}」，风格「{}」。hot_take 必须完全符合该风格。",
        ANALYZE_SYSTEM, commentator_name, commentator_style
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
    let parsed: ChatResponse = serde_json::from_str(&raw).context("分析块响应解析失败")?;
    let content = parsed.choices.into_iter().next().map(|c| c.message.content).context("分析块响应为空")?;
    let p: Payload = serde_json::from_str(&content).context("分析块 JSON 解析失败")?;
    if p.summary.trim().is_empty() && p.hot_take.trim().is_empty() {
        anyhow::bail!("文本块无足够分析价值");
    }
    Ok(ChunkCard { index: 0, text: chunk.to_string(), summary: p.summary, hot_take: p.hot_take, labels: p.labels })
}
