use std::collections::HashSet;

use tauri::Wry;

use crate::db::{EvidenceRecord, PointSourceContext, SourceWorkspaceRecord, StoredPoint};

const DIGEST_SYSTEM: &str = "你是一位专业的知识分析师。用户会提供一组带稳定标签的 Point 与 Evidence。\
请根据这些输入生成一份详细的研究简报（digest），要求：\
1. 先写一个执行摘要（100字以内）\
2. 按主题归类，分析各观点与证据之间的联系\
3. 指出核心洞见、证据强弱和潜在启示\
4. 给出 2-3 条行动建议或延伸阅读方向\
5. 每个关键结论后使用输入标签引用来源，例如 [P1]、[E2]，不要编造未提供的标签\
输出为 Markdown 格式，结构清晰，语言与原始输入保持一致。";

const SYNTHESIS_SYSTEM: &str = "你是一位专业的多来源研究分析师。用户会提供多个 Source、Evidence 和可选 Point，所有输入都带稳定标签。\
请生成一份多来源综合报告，必须包含：\
1. 共同主题\
2. 一致观点\
3. 冲突观点\
4. 证据强弱\
5. 未解决问题\
6. 后续建议\
7. 引用清单\
关键要求：冲突观点必须显式展示，不能静默融合；每个关键结论后使用 [S1]、[P1]、[E1] 等输入标签引用来源；没有足够引用的结论要标记为推断或不确定。\
输出为 Markdown 格式。";

const MAX_SYNTHESIS_SOURCE_CHUNKS: usize = 8;
const MAX_SYNTHESIS_EVIDENCE: usize = 24;
const MAX_SYNTHESIS_POINTS: usize = 40;

#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GenerateDigestInput {
    pub evidence_ids: Vec<String>,
}

#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GenerateSynthesisInput {
    pub source_ids: Vec<String>,
    pub include_starred: bool,
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

#[tauri::command]
pub async fn generate_synthesis(
    app: tauri::AppHandle<Wry>,
    input: GenerateSynthesisInput,
) -> Result<DigestResult, String> {
    let config = crate::commands::config::get_config(app.clone())?;
    if config.openai_api_key.is_empty() {
        return Err("尚未配置 API Key".to_string());
    }

    let source_ids = normalized_unique_ids(input.source_ids);
    let include_starred = input.include_starred;
    let db_path = crate::db::db_path(&app).map_err(|e| e.to_string())?;
    let (sources, evidence, starred, point_contexts) = tokio::task::spawn_blocking(move || {
        let conn = crate::db::open_db(&db_path)?;

        let mut sources = Vec::new();
        for id in source_ids {
            if let Some(source) = crate::db::get_source_workspace(&conn, &id)? {
                sources.push(source);
            }
        }

        let mut evidence = Vec::new();
        for source in &sources {
            evidence.extend(crate::db::list_evidence_for_source(&conn, &source.source.id)?);
        }
        evidence.truncate(MAX_SYNTHESIS_EVIDENCE);

        let mut starred = if include_starred {
            crate::db::list_starred_points(&conn)?
        } else {
            Vec::new()
        };
        starred.truncate(MAX_SYNTHESIS_POINTS);

        let point_contexts = starred
            .iter()
            .map(|point| crate::db::get_point_source_context(&conn, &point.id))
            .collect::<anyhow::Result<Vec<_>>>()?;

        anyhow::Ok((sources, evidence, starred, point_contexts))
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    if sources.is_empty() && starred.is_empty() {
        return Err("请选择至少一个 Source，或包含当前 Star 集合".to_string());
    }

    let input_text = synthesis_input_text(&sources, &evidence, &starred);
    let citations = build_synthesis_citations(&sources, &evidence, &starred, &point_contexts);

    let endpoint = crate::commands::config::completions_endpoint(
        &config.openai_base_url, &config.provider_key, &config.custom_endpoint,
    );
    let body = serde_json::json!({
        "model": config.openai_model,
        "messages": [
            { "role": "system", "content": SYNTHESIS_SYSTEM },
            { "role": "user", "content": format!("以下是我选择的 {} 个综合输入，请生成多来源综合报告并按标签引用：\n\n{}", citations.len(), input_text) }
        ],
        "temperature": 0.5
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
    let content = parsed.choices.into_iter().next()
        .map(|c| c.message.content)
        .ok_or_else(|| "模型未返回内容".to_string())?;

    Ok(DigestResult { content, citations })
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

fn synthesis_input_text(
    sources: &[SourceWorkspaceRecord],
    evidence: &[EvidenceRecord],
    points: &[StoredPoint],
) -> String {
    let mut sections = Vec::new();

    if !sources.is_empty() {
        let lines = sources.iter().enumerate().map(|(index, workspace)| {
            let source = &workspace.source;
            let chunks = workspace.chunks.iter()
                .take(MAX_SYNTHESIS_SOURCE_CHUNKS)
                .map(|chunk| format!("- Chunk {}: {}", chunk.chunk_index, truncate_chars(&chunk.text, 520)))
                .collect::<Vec<_>>()
                .join("\n");
            format!(
                "[S{}] {}\nURI: {}\nChunks:\n{}",
                index + 1,
                source.title.as_deref().unwrap_or("未命名来源"),
                source.canonical_uri,
                if chunks.is_empty() { "- 无分块内容".to_string() } else { chunks },
            )
        }).collect::<Vec<_>>().join("\n\n");
        sections.push(format!("## Sources\n{lines}"));
    }

    if !evidence.is_empty() {
        let lines = evidence.iter().enumerate().map(|(index, record)| {
            format!(
                "[E{}] [{}]\nClaim: {}\nAnswer: {}\nSource location: {} / {:?}",
                index + 1,
                record.verdict,
                record.claim,
                truncate_chars(&record.answer, 420),
                record.source_id.as_deref().unwrap_or("none"),
                record.chunk_index,
            )
        }).collect::<Vec<_>>().join("\n\n");
        sections.push(format!("## Evidence\n{lines}"));
    }

    if !points.is_empty() {
        let lines = points.iter().enumerate().map(|(index, point)| {
            format!(
                "[P{}] [{}] {}\n来源: {}",
                index + 1,
                point.tag_type.as_deref().unwrap_or("观点"),
                truncate_chars(&point.content, 420),
                point.source_doc_name.as_deref().unwrap_or("无来源"),
            )
        }).collect::<Vec<_>>().join("\n\n");
        sections.push(format!("## Starred Points\n{lines}"));
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

fn build_synthesis_citations(
    sources: &[SourceWorkspaceRecord],
    evidence: &[EvidenceRecord],
    points: &[StoredPoint],
    point_contexts: &[Option<PointSourceContext>],
) -> Vec<DigestCitation> {
    let mut citations = Vec::with_capacity(sources.len() + evidence.len() + points.len());

    for (index, workspace) in sources.iter().enumerate() {
        let first_chunk = workspace.chunks.first();
        citations.push(DigestCitation {
            kind: "source".to_string(),
            label: format!("S{}", index + 1),
            id: workspace.source.id.clone(),
            title: workspace.source.title.clone().unwrap_or_else(|| "Source".to_string()),
            excerpt: first_chunk
                .map(|chunk| truncate_chars(&chunk.text, 260))
                .unwrap_or_else(|| workspace.source.canonical_uri.clone()),
            source_id: Some(workspace.source.id.clone()),
            chunk_index: first_chunk.map(|chunk| chunk.chunk_index),
            url: Some(workspace.source.canonical_uri.clone()),
        });
    }

    for (index, record) in evidence.iter().enumerate() {
        citations.push(DigestCitation {
            kind: "evidence".to_string(),
            label: format!("E{}", index + 1),
            id: record.id.clone(),
            title: record.claim.clone(),
            excerpt: truncate_chars(&record.answer, 260),
            source_id: record.source_id.clone(),
            chunk_index: record.chunk_index,
            url: record.sources.first().map(|source| source.url.clone()),
        });
    }

    for (index, point) in points.iter().enumerate() {
        let context = point_contexts.get(index).and_then(Option::as_ref);
        citations.push(DigestCitation {
            kind: "point".to_string(),
            label: format!("P{}", index + 1),
            id: point.id.clone(),
            title: point.tag_type.clone().unwrap_or_else(|| "Point".to_string()),
            excerpt: truncate_chars(&point.content, 260),
            source_id: context.map(|ctx| ctx.source.id.clone()),
            chunk_index: context.map(|ctx| ctx.chunk_index),
            url: None,
        });
    }

    citations
}

fn truncate_chars(value: &str, limit: usize) -> String {
    let mut out = value.chars().take(limit).collect::<String>();
    if value.chars().count() > limit {
        out.push('…');
    }
    out
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

    fn source_workspace() -> SourceWorkspaceRecord {
        SourceWorkspaceRecord {
            source: db::SourceSummaryRecord {
                id: "source-1".to_string(),
                kind: "webpage".to_string(),
                title: Some("Strategy Memo".to_string()),
                canonical_uri: "https://example.com/strategy".to_string(),
                metadata_json: "{}".to_string(),
                created_at: "2026-07-05T00:00:00Z".to_string(),
                updated_at: "2026-07-05T00:00:00Z".to_string(),
                chunk_count: 1,
                point_count: 1,
                star_count: 0,
            },
            chunks: vec![db::SourceChunkRecord {
                id: "chunk-1".to_string(),
                source_id: "source-1".to_string(),
                chunk_index: 0,
                heading_path: None,
                text: "The strategy emphasizes measurable evidence and conflicting viewpoints.".to_string(),
                created_at: "2026-07-05T00:00:00Z".to_string(),
            }],
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

    #[test]
    fn synthesis_input_text_labels_sources_evidence_and_points() {
        let text = synthesis_input_text(
            &[source_workspace()],
            &[evidence_record("evidence-1")],
            &[stored_point("point-1")],
        );

        assert!(text.contains("[S1]"));
        assert!(text.contains("[E1]"));
        assert!(text.contains("[P1]"));
        assert!(text.contains("conflicting viewpoints"));
    }

    #[test]
    fn build_synthesis_citations_includes_source_point_and_evidence() {
        let citations = build_synthesis_citations(
            &[source_workspace()],
            &[evidence_record("evidence-1")],
            &[stored_point("point-1")],
            &[Some(point_context())],
        );

        assert_eq!(citations.len(), 3);
        assert_eq!(citations[0].kind, "source");
        assert_eq!(citations[0].label, "S1");
        assert_eq!(citations[0].source_id.as_deref(), Some("source-1"));
        assert_eq!(citations[0].chunk_index, Some(0));
        assert_eq!(citations[1].kind, "evidence");
        assert_eq!(citations[1].label, "E1");
        assert_eq!(citations[2].kind, "point");
        assert_eq!(citations[2].label, "P1");
        assert_eq!(citations[2].source_id.as_deref(), Some("source-point"));
    }
}
