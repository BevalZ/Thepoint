use anyhow::Context;
use serde::Deserialize;
use serde_json::json;

use super::models;
use super::ExtractedPoint;


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

#[derive(Deserialize)]
struct PointsPayload {
    points: Vec<ExtractedPoint>,
}

/// A single LLM framework recommendation: which model + why.
#[derive(Deserialize)]
struct RecPayload {
    recommendations: Vec<RecItem>,
}

#[derive(Deserialize)]
struct RecItem {
    key: String,
    reason: String,
}

/// A framework recommendation returned to the frontend (name resolved from the library).
#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FrameworkRecommendation {
    pub key: String,
    pub name: String,
    pub reason: String,
}

/// Shared OpenAI JSON-object call. Returns the model's raw content string.
async fn chat_json(api_key: &str, model: &str, base_url: &str, system: &str, user: &str) -> anyhow::Result<String> {
    if api_key.is_empty() {
        anyhow::bail!("尚未配置 OpenAI API Key，请在设置页填写");
    }
    let endpoint = crate::commands::config::completions_endpoint(base_url);

    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.4
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(&endpoint)
        .bearer_auth(api_key)
        .json(&body)
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
    parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .context("OpenAI 响应不含任何结果")
}

fn deepen_system_prompt(action: &str) -> anyhow::Result<&'static str> {
    let prompt = match action {
        "explain" => "你是一个深度思考助手。请把用户给出的观点讲得更深入透彻：补充背景、机制、含义或例证，帮助读者真正理解。\
只返回 JSON 对象 {\"points\": [{\"content\": \"...\", \"tagType\": \"作者观点\"}]}，只含 1 条 content，用观点的原始语言，不要其他文字。",
        "counter" => "你是一个批判性思考助手。请针对用户给出的观点，提出有力的对立或质疑视角：指出其潜在漏洞、反例或被忽略的角度。\
只返回 JSON 对象 {\"points\": [{\"content\": \"...\", \"tagType\": \"作者观点\"}]}，只含 1 条 content，用观点的原始语言，不要其他文字。",
        "followup" => "你是一个引导深度探索的助手。请针对用户给出的观点，提出 3 到 5 个有价值的延伸追问，每个问题应能推动更深入的思考。\
只返回 JSON 对象 {\"points\": [{\"content\": \"问题...\", \"tagType\": \"待验证疑问\"}, ...]}，3-5 条，用观点的原始语言，不要其他文字。",
        other => anyhow::bail!("未知的深挖动作: {other}"),
    };
    Ok(prompt)
}

/// Run a basic deep-dive action (explain / counter / followup) → child points.
pub async fn deepen(
    api_key: &str,
    model: &str,
    base_url: &str,
    action: &str,
    point_content: &str,
) -> anyhow::Result<Vec<ExtractedPoint>> {
    let system = deepen_system_prompt(action)?;
    let content = chat_json(api_key, model, base_url, system, point_content).await?;
    let payload: PointsPayload =
        serde_json::from_str(&content).context("模型返回的内容不是预期的 JSON 格式")?;
    Ok(payload.points)
}

/// Ask the LLM to recommend 3 mental models from the library for this point.
pub async fn recommend_models(
    api_key: &str,
    model: &str,
    base_url: &str,
    point_content: &str,
) -> anyhow::Result<Vec<FrameworkRecommendation>> {
    let library = models::all();
    let catalog: String = library
        .iter()
        .map(|m| format!("- {} ({}): {}", m.key, m.name, m.description))
        .collect::<Vec<_>>()
        .join("\n");

    let system = format!(
        "你是一个思维框架推荐助手。下面是可用的思维模型库（key: 名称: 说明）：\n{catalog}\n\n\
请针对用户给出的观点，从库中挑选 3 个最适合用来深入解读它的模型。\
只返回 JSON 对象 {{\"recommendations\": [{{\"key\": \"库中的key\", \"reason\": \"一句话推荐理由\"}}]}}，\
恰好 3 条，key 必须来自上面的库，reason 用观点的原始语言，不要其他文字。"
    );

    let content = chat_json(api_key, model, base_url, &system, point_content).await?;
    let payload: RecPayload =
        serde_json::from_str(&content).context("模型返回的推荐不是预期的 JSON 格式")?;

    let recs = payload
        .recommendations
        .into_iter()
        .filter_map(|item| {
            models::by_key(&item.key).map(|m| FrameworkRecommendation {
                key: m.key,
                name: m.name,
                reason: item.reason,
            })
        })
        .take(3)
        .collect();
    Ok(recs)
}

/// Apply a specific mental model's lens to the point → interpretation child points.
pub async fn apply_framework(
    api_key: &str,
    model: &str,
    base_url: &str,
    model_key: &str,
    point_content: &str,
) -> anyhow::Result<Vec<ExtractedPoint>> {
    let mental = models::by_key(model_key).context("未知的思维模型")?;
    let system = format!(
        "你是一个用思维框架深度解读观点的助手。{}\n\
请基于上述视角输出 1 到 3 条解读要点。\
只返回 JSON 对象 {{\"points\": [{{\"content\": \"...\", \"tagType\": \"作者观点\"}}]}}，\
1-3 条，用观点的原始语言，不要其他文字。",
        mental.prompt_lens
    );

    let content = chat_json(api_key, model, base_url, &system, point_content).await?;
    let payload: PointsPayload =
        serde_json::from_str(&content).context("模型返回的内容不是预期的 JSON 格式")?;
    Ok(payload.points)
}
