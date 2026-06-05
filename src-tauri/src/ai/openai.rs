use anyhow::Context;
use serde::Deserialize;
use serde_json::json;

use super::ExtractedPoint;


const SYSTEM_PROMPT: &str = "你是一个观点提取助手。请把用户提供的文档文本拆解为段落级的关键要点（Point）。\
每个要点是一句话的核心主张、事实或疑问。请判断每个要点的类型，取值之一：\
\"事实陈述\"、\"作者观点\"、\"待验证疑问\"。\
请用文档的原始语言提取内容。\
只返回 JSON 对象，格式为 {\"points\": [{\"content\": \"...\", \"tagType\": \"...\"}]}，不要包含其他文字。";

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
