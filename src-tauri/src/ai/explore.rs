use anyhow::Context;
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::chat_response::extract_chat_text;
use super::models;
use super::ExtractedPoint;

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

#[derive(Deserialize)]
struct PolishPayload {
    text: String,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RelatedCandidateInput {
    pub id: String,
    pub content: String,
    pub tag_type: Option<String>,
    pub source_doc_name: Option<String>,
}

#[derive(Deserialize)]
struct RelatedPayload {
    items: Vec<RelatedClassification>,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RelatedClassification {
    pub id: String,
    pub relation: String,
    pub reason: String,
    pub confidence: f32,
}

/// A framework recommendation returned to the frontend (name resolved from the library).
#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FrameworkRecommendation {
    pub key: String,
    pub name: String,
    pub reason: String,
}

/// Shared OpenAI chat (plain text) call. Returns the model's raw content string.
async fn chat_text(api_key: &str, model: &str, base_url: &str, provider_key: &str, custom_endpoint: &str, system: &str, user: &str) -> anyhow::Result<String> {
    if api_key.is_empty() {
        anyhow::bail!("搜索模型未配置 API Key");
    }
    let endpoint = crate::commands::config::completions_endpoint(base_url, provider_key, custom_endpoint);
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ],
        "temperature": 0.3
    });
    let resp = reqwest::Client::new()
        .post(&endpoint)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .context("请求搜索模型失败")?;
    let status = resp.status();
    let raw = resp.text().await.context("读取搜索模型响应失败")?;
    if !status.is_success() {
        anyhow::bail!("搜索模型返回错误 ({status}): {raw}");
    }
    extract_chat_text(&raw).context("解析搜索模型响应结构失败")
}

/// Fetch a short search context for a point using the search model.
/// Returns empty string if search is disabled or fails non-fatally.
pub async fn fetch_search_context(config: &crate::commands::config::AppConfig, point_content: &str) -> String {
    if !config.search_enabled || config.search_api_key.is_empty() {
        return String::new();
    }
    let system = "请针对以下观点，检索并返回最新的相关信息摘要（200字以内，纯文本，不含 JSON）：";
    match chat_text(
        &config.search_api_key,
        &config.search_model,
        &config.search_base_url,
        &config.search_provider_key,
        &config.search_custom_endpoint,
        system,
        point_content,
    ).await {
        Ok(s) => s,
        Err(_) => String::new(), // non-fatal: search failure should not block deepen
    }
}
async fn chat_json(api_key: &str, model: &str, base_url: &str, extra_headers: &str, system: &str, user: &str) -> anyhow::Result<String> {
    if api_key.is_empty() {
        anyhow::bail!("尚未配置 OpenAI API Key，请在设置页填写");
    }
    let endpoint = crate::commands::config::completions_endpoint(base_url, "openai-compat", "");

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

    extract_chat_text(&raw).context("解析 OpenAI 响应结构失败")
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
    extra_headers: &str,
    action: &str,
    point_content: &str,
    search_context: &str,
) -> anyhow::Result<Vec<ExtractedPoint>> {
    let system = deepen_system_prompt(action)?;
    let user = if search_context.is_empty() {
        point_content.to_string()
    } else {
        format!("【参考信息】\n{search_context}\n\n【观点】\n{point_content}")
    };
    let content = chat_json(api_key, model, base_url, extra_headers, system, &user).await?;
    let payload: PointsPayload =
        serde_json::from_str(&content).context("模型返回的内容不是预期的 JSON 格式")?;
    Ok(payload.points)
}

/// Ask the LLM to recommend 3 mental models from the library for this point.
pub async fn recommend_models(
    api_key: &str,
    model: &str,
    base_url: &str,
    extra_headers: &str,
    library: &[models::MentalModel],
    point_content: &str,
) -> anyhow::Result<Vec<FrameworkRecommendation>> {
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

    let content = chat_json(api_key, model, base_url, extra_headers, &system, point_content).await?;
    let payload: RecPayload =
        serde_json::from_str(&content).context("模型返回的推荐不是预期的 JSON 格式")?;

    let recs = payload
        .recommendations
        .into_iter()
        .filter_map(|item| {
            library.iter().find(|model| model.key == item.key).map(|m| FrameworkRecommendation {
                key: m.key.clone(),
                name: m.name.clone(),
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
    extra_headers: &str,
    library: &[models::MentalModel],
    model_key: &str,
    point_content: &str,
) -> anyhow::Result<Vec<ExtractedPoint>> {
    let mental = library.iter().find(|model| model.key == model_key).context("未知的思维模型")?;
    let system = format!(
        "你是一个用思维框架深度解读观点的助手。{}\n\
请基于上述视角输出 1 到 3 条解读要点。\
只返回 JSON 对象 {{\"points\": [{{\"content\": \"...\", \"tagType\": \"作者观点\"}}]}}，\
1-3 条，用观点的原始语言，不要其他文字。",
        mental.prompt_lens
    );

    let content = chat_json(api_key, model, base_url, extra_headers, &system, point_content).await?;
    let payload: PointsPayload =
        serde_json::from_str(&content).context("模型返回的内容不是预期的 JSON 格式")?;
    Ok(payload.points)
}

pub async fn polish_manual_thought(
    api_key: &str,
    model: &str,
    base_url: &str,
    extra_headers: &str,
    parent_content: &str,
    thought: &str,
) -> anyhow::Result<String> {
    let system = "你是一个中文写作润色助手。请保留用户原意和第一人称视角，把输入整理成更清楚、自然、有力量的一段观点。不要扩写成总结，不要加入“文章/文本/作者”等表述。只返回 JSON 对象 {\"text\":\"润色后的正文\"}。";
    let user = format!("【关联观点】\n{parent_content}\n\n【我的想法】\n{thought}");
    let content = chat_json(api_key, model, base_url, extra_headers, system, &user).await?;
    let payload: PolishPayload =
        serde_json::from_str(&content).context("模型返回的润色内容不是预期的 JSON 格式")?;
    Ok(payload.text.trim().to_string())
}

pub async fn classify_related(
    api_key: &str,
    model: &str,
    base_url: &str,
    extra_headers: &str,
    point_content: &str,
    candidates: &[RelatedCandidateInput],
) -> anyhow::Result<Vec<RelatedClassification>> {
    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    let compact_candidates = candidates
        .iter()
        .take(8)
        .map(|candidate| {
            let excerpt = candidate.content.chars().take(180).collect::<String>();
            format!(
                "id: {}\nsource: {}\ntag: {}\ntext: {}",
                candidate.id,
                candidate.source_doc_name.as_deref().unwrap_or("未知来源"),
                candidate.tag_type.as_deref().unwrap_or("未标注"),
                excerpt
            )
        })
        .collect::<Vec<_>>()
        .join("\n---\n");

    let current = point_content.chars().take(300).collect::<String>();
    let system = "你是低成本关系分类器。只对用户给出的候选内容分类，不要扩写，不要搜索。\
关系只能从 same_view、opposite_view、similar_case、evidence、duplicate 中选择。\
same_view=同类观点；opposite_view=相反观点或明显质疑；similar_case=结构相似案例；evidence=数据/报道/事实依据；duplicate=重复或近似重复。\
只返回 JSON 对象 {\"items\":[{\"id\":\"候选id\",\"relation\":\"枚举值\",\"reason\":\"40字以内中文理由\",\"confidence\":0.0}]}。\
不要返回候选之外的 id；reason 不要出现“文本通过/文章通过/该文本”等套话。";
    let user = format!("【当前块】\n{current}\n\n【候选】\n{compact_candidates}");
    let content = chat_json(api_key, model, base_url, extra_headers, system, &user).await?;
    let payload: RelatedPayload =
        serde_json::from_str(&content).context("模型返回的关联分类不是预期的 JSON 格式")?;
    let allowed_ids = candidates.iter().map(|candidate| candidate.id.as_str()).collect::<std::collections::HashSet<_>>();
    let allowed_relations = ["same_view", "opposite_view", "similar_case", "evidence", "duplicate"];

    Ok(payload.items
        .into_iter()
        .filter(|item| allowed_ids.contains(item.id.as_str()))
        .filter(|item| allowed_relations.contains(&item.relation.as_str()))
        .map(|mut item| {
            item.reason = item.reason.trim().chars().take(40).collect();
            item.confidence = item.confidence.clamp(0.0, 1.0);
            item
        })
        .collect())
}
