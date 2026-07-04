use std::collections::HashSet;

use tauri::Wry;

use crate::db::{EvidenceRecord, PointSourceContext, StoredPoint};

const DIGEST_SYSTEM: &str = "你是一位专业的知识分析师。用户会提供一组带稳定标签的 Point 与 Evidence。\
请根据这些输入生成一份详细的研究简报（digest），要求：\
1. 先写一个执行摘要（100字以内）\
2. 按主题归类，分析各观点与证据之间的联系\
3. 指出核心洞见、证据强弱和潜在启示\
4. 给出 2-3 条行动建议或延伸阅读方向\
5. 每个关键结论后使用输入标签引用来源，例如 [P1]、[E2]，不要编造未提供的标签\
输出为 Markdown 格式，结构清晰，语言与原始输入保持一致。";

#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GenerateDigestInput {
    pub evidence_ids: Vec<String>,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DigestCitation {
    pub kind: String,
    pub label: String,
    pub id: String,
    pub title: String,
    pub excerpt: String,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
    pub url: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DigestResult {
    pub content: String,
    pub citations: Vec<DigestCitation>,
}

#[tauri::command]
pub async fn generate_digest(
    app: tauri::AppHandle<Wry>,
    input: GenerateDigestInput,
) -> Result<DigestResult, String> {
    let config = crate::commands::config::get_config(app.clone())?;
    if config.openai_api_key.is_empty() {
        return Err("尚未配置 API Key".to_string());
    }

    let evidence_ids = normalized_unique_ids(input.evidence_ids);
    let db_path = crate::db::db_path(&app).map_err(|e| e.to_string())?;
    let (starred, point_contexts, evidence) = tokio::task::spawn_blocking(move || {
        let conn = crate::db::open_db(&db_path)?;
        let starred = crate::db::list_starred_points(&conn)?;
        let point_contexts = starred
            .iter()
            .map(|point| crate::db::get_point_source_context(&conn, &point.id))
            .collect::<anyhow::Result<Vec<_>>>()?;
        let mut evidence = Vec::new();
        for id in evidence_ids {
            if let Some(record) = crate::db::get_evidence(&conn, &id)? {
                evidence.push(record);
            }
        }
        anyhow::Ok((starred, point_contexts, evidence))
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    if starred.is_empty() && evidence.is_empty() {
        return Err("还没有采集任何 point 或选择 Evidence".to_string());
    }

    let input_text = digest_input_text(&starred, &evidence);
    let citations = build_digest_citations(&starred, &point_contexts, &evidence);

    let endpoint = crate::commands::config::completions_endpoint(
        &config.openai_base_url, &config.provider_key, &config.custom_endpoint,
    );
    let body = serde_json::json!({
        "model": config.openai_model,
        "messages": [
            { "role": "system", "content": DIGEST_SYSTEM },
            { "role": "user", "content": format!("以下是我选择的 {} 个输入，请生成知识研报并按标签引用：\n\n{}", citations.len(), input_text) }
        ],
        "temperature": 0.6
    });

    let mut builder = reqwest::Client::new()
        .post(&endpoint)
        .bearer_auth(&config.openai_api_key)
        .json(&body);
    if let Ok(map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&config.extra_headers) {
        for (k, v) in &map {
            if let Some(s) = v.as_str() { builder = builder.header(k.as_str(), s); }
        }
    }

    let resp = builder.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let raw = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("AI 返回错误 ({status}): {raw}"));
    }

    #[derive(serde::Deserialize)]
    struct Resp { choices: Vec<Choice> }
    #[derive(serde::Deserialize)]
    struct Choice { message: Msg }
    #[derive(serde::Deserialize)]
    struct Msg { content: String }

    let parsed: Resp = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let digest = parsed.choices.into_iter().next()
        .map(|c| c.message.content)
        .ok_or_else(|| "模型未返回内容".to_string())?;

    let clear_path = crate::db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        let conn = crate::db::open_db(&clear_path)?;
        crate::db::clear_starred_points(&conn)
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    Ok(DigestResult { content: digest, citations })
}

fn normalized_unique_ids(ids: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    ids.into_iter()
        .filter_map(|id| {
            let trimmed = id.trim().to_string();
            if trimmed.is_empty() || !seen.insert(trimmed.clone()) {
                None
            } else {
                Some(trimmed)
            }
        })
        .collect()
}

fn digest_input_text(points: &[StoredPoint], evidence: &[EvidenceRecord]) -> String {
    let mut sections = Vec::new();

    if !points.is_empty() {
        let lines = points
            .iter()
            .enumerate()
            .map(|(index, point)| {
                format!(
                    "[P{}] [{}] {}\n来源: {}\n摘录: {}",
                    index + 1,
                    point.tag_type.as_deref().unwrap_or("观点"),
                    point.content,
                    point.source_doc_name.as_deref().unwrap_or("无来源"),
                    point.source_excerpt.as_deref().unwrap_or("无原文摘录"),
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n");
        sections.push(format!("## Points\n{lines}"));
    }

    if !evidence.is_empty() {
        let lines = evidence
            .iter()
            .enumerate()
            .map(|(index, record)| {
                let sources = record.sources.iter()
                    .take(4)
                    .map(|source| {
                        let title = source.title.as_deref().unwrap_or("未命名来源");
                        let snippet = source.snippet.as_deref().unwrap_or("");
                        format!("- {}: {} {}", title, source.url, snippet)
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                format!(
                    "[E{}] [{}]\nClaim: {}\nAnswer: {}\nReasoning: {}\nSources:\n{}",
                    index + 1,
                    record.verdict,
                    record.claim,
                    record.answer,
                    record.reasoning.as_deref().unwrap_or("无"),
                    if sources.is_empty() { "- 无外部链接".to_string() } else { sources },
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n");
        sections.push(format!("## Evidence\n{lines}"));
    }

    sections.join("\n\n")
}

fn build_digest_citations(
    points: &[StoredPoint],
    point_contexts: &[Option<PointSourceContext>],
    evidence: &[EvidenceRecord],
) -> Vec<DigestCitation> {
    let mut citations = Vec::with_capacity(points.len() + evidence.len());

    for (index, point) in points.iter().enumerate() {
        let context = point_contexts.get(index).and_then(Option::as_ref);
        citations.push(DigestCitation {
            kind: "point".to_string(),
            label: format!("P{}", index + 1),
            id: point.id.clone(),
            title: point.tag_type.clone().unwrap_or_else(|| "Point".to_string()),
            excerpt: point.content.clone(),
            source_id: context.map(|ctx| ctx.source.id.clone()),
            chunk_index: context.map(|ctx| ctx.chunk_index),
            url: None,
        });
    }

    for (index, record) in evidence.iter().enumerate() {
        citations.push(DigestCitation {
            kind: "evidence".to_string(),
            label: format!("E{}", index + 1),
            id: record.id.clone(),
            title: record.claim.clone(),
            excerpt: record.answer.clone(),
            source_id: record.source_id.clone(),
            chunk_index: record.chunk_index,
            url: record.sources.first().map(|source| source.url.clone()),
        });
    }

    citations
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn stored_point(id: &str) -> StoredPoint {
        StoredPoint {
            id: id.to_string(),
            content: "AI investment increased after model costs fell.".to_string(),
            tag_type: Some("事实陈述".to_string()),
            parent_id: None,
            source_doc_name: Some("Market Memo".to_string()),
            source_excerpt: Some("Investment increased in the second half.".to_string()),
            created_at: "2026-07-05T00:00:00Z".to_string(),
            archived: false,
            starred: true,
        }
    }

    fn evidence_record(id: &str) -> EvidenceRecord {
        EvidenceRecord {
            id: id.to_string(),
            claim: "The market grew 20%.".to_string(),
            verdict: "supported".to_string(),
            answer: "The claim is supported by the cited report.".to_string(),
            reasoning: Some("Report numbers match the claim.".to_string()),
            context: None,
            point_id: Some("point-1".to_string()),
            source_id: Some("source-1".to_string()),
            chunk_index: Some(4),
            checked_at: "2026-07-05T00:00:00Z".to_string(),
            created_at: "2026-07-05T00:00:00Z".to_string(),
            sources: vec![db::EvidenceSourceRecord {
                id: "source-ref-1".to_string(),
                evidence_id: id.to_string(),
                title: Some("Report".to_string()),
                url: "https://example.com/report".to_string(),
                snippet: Some("20% growth".to_string()),
                stance: "support".to_string(),
                created_at: "2026-07-05T00:00:00Z".to_string(),
            }],
        }
    }

    fn point_context() -> PointSourceContext {
        PointSourceContext {
            point_id: "point-1".to_string(),
            source: db::SourceSummaryRecord {
                id: "source-point".to_string(),
                kind: "webpage".to_string(),
                title: Some("Market Memo".to_string()),
                canonical_uri: "https://example.com/memo".to_string(),
                metadata_json: "{}".to_string(),
                created_at: "2026-07-05T00:00:00Z".to_string(),
                updated_at: "2026-07-05T00:00:00Z".to_string(),
                chunk_count: 3,
                point_count: 1,
                star_count: 1,
            },
            chunk_index: 2,
            anchor_text: None,
            chunks: Vec::new(),
        }
    }

    #[test]
    fn digest_input_text_labels_points_and_evidence() {
        let text = digest_input_text(&[stored_point("point-1")], &[evidence_record("evidence-1")]);

        assert!(text.contains("[P1]"));
        assert!(text.contains("[E1]"));
        assert!(text.contains("Market Memo"));
        assert!(text.contains("https://example.com/report"));
    }

    #[test]
    fn build_digest_citations_preserves_point_and_evidence_locations() {
        let citations = build_digest_citations(
            &[stored_point("point-1")],
            &[Some(point_context())],
            &[evidence_record("evidence-1")],
        );

        assert_eq!(citations.len(), 2);
        assert_eq!(citations[0].kind, "point");
        assert_eq!(citations[0].label, "P1");
        assert_eq!(citations[0].source_id.as_deref(), Some("source-point"));
        assert_eq!(citations[0].chunk_index, Some(2));
        assert_eq!(citations[1].kind, "evidence");
        assert_eq!(citations[1].label, "E1");
        assert_eq!(citations[1].source_id.as_deref(), Some("source-1"));
        assert_eq!(citations[1].url.as_deref(), Some("https://example.com/report"));
    }

    #[test]
    fn normalized_unique_ids_trims_and_deduplicates() {
        let ids = normalized_unique_ids(vec![
            " evidence-1 ".to_string(),
            "".to_string(),
            "evidence-1".to_string(),
            "evidence-2".to_string(),
        ]);

        assert_eq!(ids, vec!["evidence-1".to_string(), "evidence-2".to_string()]);
    }
}
