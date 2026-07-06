use std::collections::HashSet;

use tauri::Wry;

use crate::db::{
    EvidenceRecord, PointSourceContext, SaveInvestigationContextItemInput, SourceWorkspaceRecord,
    StoredPoint,
};

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

const INVESTIGATION_SYSTEM: &str = "你是一位本地优先的个人研究调查员。用户会提供一个调查问题和一组带稳定标签的本地知识资产。\
请生成一份 Investigation 调查报告，必须包含：\
1. 调查问题\
2. 结论摘要\
3. 支持证据\
4. 反对证据 / 冲突点\
5. 不确定点\
6. 引用清单\
7. 后续问题\
关键要求：每个关键结论必须使用输入标签引用来源，例如 [S1]、[P1]、[E1]；Journal 只能作为调查记忆线索，不能作为最终事实依据；没有足够 Source / Point / Evidence 引用的内容必须显式标记为推断或不确定。\
输出为 Markdown 格式。";

const MAX_SYNTHESIS_SOURCE_CHUNKS: usize = 8;
const MAX_SYNTHESIS_EVIDENCE: usize = 24;
const MAX_SYNTHESIS_POINTS: usize = 40;
const MAX_INVESTIGATION_SEARCH_RESULTS: usize = 12;
const MAX_INVESTIGATION_JOURNAL: usize = 8;
const MAX_INVESTIGATION_RELATED: usize = 20;
const INVESTIGATION_PROMPT_VERSION: &str = "investigation.v1";

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

#[derive(serde::Deserialize, serde::Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InvestigationScope {
    pub source_ids: Vec<String>,
    pub point_ids: Vec<String>,
    pub evidence_ids: Vec<String>,
    pub report_ids: Vec<String>,
    pub include_library_search: bool,
    pub include_journal: bool,
}

#[derive(serde::Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InvestigationInput {
    pub query: String,
    pub scope: InvestigationScope,
    pub mode: String,
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
    pub quote: Option<String>,
    pub reason: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DigestResult {
    pub content: String,
    pub citations: Vec<DigestCitation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invocation_id: Option<String>,
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

    Ok(DigestResult {
        content: digest,
        citations,
        invocation_id: None,
    })
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

    Ok(DigestResult {
        content,
        citations,
        invocation_id: None,
    })
}

#[tauri::command]
pub async fn generate_investigation(
    app: tauri::AppHandle<Wry>,
    input: InvestigationInput,
) -> Result<DigestResult, String> {
    let query = input.query.trim().to_string();
    if query.is_empty() {
        return Err("调查问题不能为空".to_string());
    }

    let config = crate::commands::config::get_config(app.clone())?;
    if config.openai_api_key.is_empty() {
        return Err("尚未配置 API Key".to_string());
    }

    let mode = normalize_investigation_mode(&input.mode);
    let db_path = crate::db::db_path(&app).map_err(|e| e.to_string())?;
    let scope = input.scope.clone();
    let context = tokio::task::spawn_blocking({
        let db_path = db_path.clone();
        let query = query.clone();
        let scope = scope.clone();
        move || collect_investigation_context(&db_path, &query, scope)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    if context.sources.is_empty() && context.points.is_empty() && context.evidence.is_empty() {
        return Err("没有找到可用于调查的 Source、Point 或 Evidence 引用".to_string());
    }

    let input_text = investigation_input_text(&query, &mode, &context);
    let citations = build_investigation_citations(&context);
    let model_name = config.openai_model.clone();
    let endpoint = crate::commands::config::completions_endpoint(
        &config.openai_base_url,
        &config.provider_key,
        &config.custom_endpoint,
    );
    let body = serde_json::json!({
        "model": config.openai_model,
        "messages": [
            { "role": "system", "content": INVESTIGATION_SYSTEM },
            { "role": "user", "content": format!("调查深度：{mode}\n可引用资产数量：{}\n\n{}", citations.len(), input_text) }
        ],
        "temperature": match mode.as_str() {
            "quick" => 0.35,
            "deep" => 0.55,
            _ => 0.45,
        }
    });

    let mut builder = reqwest::Client::new()
        .post(&endpoint)
        .bearer_auth(&config.openai_api_key)
        .json(&body);
    if let Ok(map) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&config.extra_headers) {
        for (k, v) in &map {
            if let Some(s) = v.as_str() {
                builder = builder.header(k.as_str(), s);
            }
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

    let invocation_id = tokio::task::spawn_blocking({
        let db_path = db_path.clone();
        let query = query.clone();
        let mode = mode.clone();
        let scope = scope.clone();
        let citations = citations.clone();
        move || {
            save_investigation_invocation_audit(
                &db_path,
                &query,
                &mode,
                &model_name,
                &scope,
                &context,
                &citations,
            )
        }
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    Ok(DigestResult {
        content,
        citations,
        invocation_id: Some(invocation_id),
    })
}

#[derive(Default)]
struct InvestigationContext {
    sources: Vec<SourceWorkspaceRecord>,
    points: Vec<StoredPoint>,
    point_contexts: Vec<Option<PointSourceContext>>,
    evidence: Vec<EvidenceRecord>,
    reports: Vec<crate::db::ReportRecord>,
    journal: Vec<crate::db::JournalEntry>,
    related: Vec<crate::db::AssetRelationRecord>,
}

fn collect_investigation_context(
    db_path: &std::path::Path,
    query: &str,
    scope: InvestigationScope,
) -> anyhow::Result<InvestigationContext> {
    let conn = crate::db::open_db(db_path)?;
    let mut context = InvestigationContext::default();
    let mut seen_sources = HashSet::new();
    let mut seen_points = HashSet::new();
    let mut seen_evidence = HashSet::new();
    let mut seen_reports = HashSet::new();

    for id in normalized_unique_ids(scope.source_ids) {
        if let Some(source) = crate::db::get_source_workspace(&conn, &id)? {
            seen_sources.insert(source.source.id.clone());
            context.sources.push(source);
        }
    }
    for id in normalized_unique_ids(scope.point_ids) {
        if let Some(point) = crate::db::get_point(&conn, &id)? {
            seen_points.insert(point.id.clone());
            context.point_contexts.push(crate::db::get_point_source_context(&conn, &point.id)?);
            context.points.push(point);
        }
    }
    for id in normalized_unique_ids(scope.evidence_ids) {
        if let Some(record) = crate::db::get_evidence(&conn, &id)? {
            seen_evidence.insert(record.id.clone());
            context.evidence.push(record);
        }
    }
    for id in normalized_unique_ids(scope.report_ids) {
        if let Some(report) = crate::db::get_report(&conn, &id)? {
            seen_reports.insert(report.id.clone());
            context.reports.push(report);
        }
    }

    if scope.include_journal {
        context.journal = crate::db::search_journal_entries(&conn, query, MAX_INVESTIGATION_JOURNAL)?;
    }

    if scope.include_library_search {
        for result in crate::db::search_workspace(&conn, query, MAX_INVESTIGATION_SEARCH_RESULTS)? {
            match result.kind.as_str() {
                "source" if seen_sources.insert(result.id.clone()) => {
                    if let Some(source) = crate::db::get_source_workspace(&conn, &result.id)? {
                        context.sources.push(source);
                    }
                }
                "point" if seen_points.insert(result.id.clone()) => {
                    if let Some(point) = crate::db::get_point(&conn, &result.id)? {
                        context.point_contexts.push(crate::db::get_point_source_context(&conn, &point.id)?);
                        context.points.push(point);
                    }
                }
                _ => {}
            }
        }
        for record in crate::db::search_evidence(&conn, query, MAX_INVESTIGATION_SEARCH_RESULTS)? {
            if seen_evidence.insert(record.id.clone()) {
                context.evidence.push(record);
            }
        }
        for report in crate::db::search_reports(&conn, query, MAX_INVESTIGATION_SEARCH_RESULTS)? {
            if seen_reports.insert(report.id.clone()) {
                context.reports.push(report);
            }
        }
    }

    for (kind, id) in context_asset_ids(&context) {
        for relation in crate::db::discover_related_assets(&conn, &kind, &id)? {
            context.related.push(relation);
            if context.related.len() >= MAX_INVESTIGATION_RELATED {
                break;
            }
        }
        if context.related.len() >= MAX_INVESTIGATION_RELATED {
            break;
        }
    }

    Ok(context)
}

fn context_asset_ids(context: &InvestigationContext) -> Vec<(String, String)> {
    let mut out = Vec::new();
    out.extend(context.sources.iter().map(|source| ("source".to_string(), source.source.id.clone())));
    out.extend(context.points.iter().map(|point| ("point".to_string(), point.id.clone())));
    out.extend(context.evidence.iter().map(|record| ("evidence".to_string(), record.id.clone())));
    out.extend(context.reports.iter().map(|report| ("report".to_string(), report.id.clone())));
    out
}

fn save_investigation_invocation_audit(
    db_path: &std::path::Path,
    query: &str,
    mode: &str,
    model_name: &str,
    scope: &InvestigationScope,
    context: &InvestigationContext,
    citations: &[DigestCitation],
) -> anyhow::Result<String> {
    let conn = crate::db::open_db(db_path)?;
    let input_refs_json = serde_json::json!({
        "query": query,
        "mode": mode,
        "scope": scope,
        "citationLabels": citations.iter().map(|citation| citation.label.clone()).collect::<Vec<_>>(),
    })
    .to_string();
    let context_manifest_json = serde_json::json!({
        "promptVersion": INVESTIGATION_PROMPT_VERSION,
        "mode": mode,
        "counts": {
            "sources": context.sources.len(),
            "points": context.points.len(),
            "evidence": context.evidence.len(),
            "reports": context.reports.len(),
            "journal": context.journal.len(),
            "related": context.related.len(),
            "citations": citations.len(),
        },
        "roles": [
            "source",
            "point",
            "evidence",
            "prior_report",
            "journal_recall",
            "related_clue"
        ],
    })
    .to_string();
    let warnings = investigation_warnings(context);
    let invocation = crate::db::save_ai_invocation(
        &conn,
        crate::db::SaveAiInvocationInput {
            task_kind: "investigation".to_string(),
            model_profile_id: None,
            model_name: Some(model_name.to_string()),
            prompt_version: INVESTIGATION_PROMPT_VERSION.to_string(),
            input_query: Some(query.to_string()),
            input_refs_json,
            context_manifest_json,
            token_usage_json: None,
            warnings_json: serde_json::to_string(&warnings)?,
        },
    )?;
    let items = investigation_context_audit_items(&invocation.id, context);
    crate::db::save_investigation_context_items(&conn, items)?;
    Ok(invocation.id)
}

fn investigation_warnings(context: &InvestigationContext) -> Vec<String> {
    let mut warnings = Vec::new();
    if !context.journal.is_empty() {
        warnings.push("Journal entries were included as recall clues, not final evidence.".to_string());
    }
    if !context.reports.is_empty() {
        warnings.push("Prior reports were included as context only unless their citations are reused.".to_string());
    }
    if context.related.len() >= MAX_INVESTIGATION_RELATED {
        warnings.push("Related assets were capped by the investigation context limit.".to_string());
    }
    warnings
}

fn investigation_context_audit_items(
    invocation_id: &str,
    context: &InvestigationContext,
) -> Vec<SaveInvestigationContextItemInput> {
    let mut items = Vec::new();
    for (index, workspace) in context.sources.iter().enumerate() {
        let text = workspace
            .chunks
            .iter()
            .map(|chunk| chunk.text.as_str())
            .collect::<Vec<_>>()
            .join("\n\n");
        items.push(context_item(
            invocation_id,
            "source",
            &workspace.source.id,
            Some(format!("S{}", index + 1)),
            "source",
            &text,
            workspace.chunks.len() > MAX_SYNTHESIS_SOURCE_CHUNKS
                || workspace.chunks.iter().any(|chunk| chunk.text.chars().count() > 520),
            "Source chunks available to Investigation context",
        ));
    }
    for (index, point) in context.points.iter().enumerate() {
        let text = [Some(point.content.as_str()), point.source_excerpt.as_deref()]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join("\n\n");
        items.push(context_item(
            invocation_id,
            "point",
            &point.id,
            Some(format!("P{}", index + 1)),
            "point",
            &text,
            text.chars().count() > 480,
            "Point available to Investigation context",
        ));
    }
    for (index, record) in context.evidence.iter().enumerate() {
        let text = evidence_audit_text(record);
        items.push(context_item(
            invocation_id,
            "evidence",
            &record.id,
            Some(format!("E{}", index + 1)),
            "evidence",
            &text,
            text.chars().count() > 520,
            "Evidence available to Investigation context",
        ));
    }
    for (index, report) in context.reports.iter().enumerate() {
        let text = format!("{}\n\n{}\n\n{}", report.title, report.summary, report.body_md);
        items.push(context_item(
            invocation_id,
            "report",
            &report.id,
            Some(format!("R{}", index + 1)),
            "prior_report",
            &text,
            report.body_md.chars().count() > 520,
            "Prior report included as context only",
        ));
    }
    for (index, entry) in context.journal.iter().enumerate() {
        let text = format!("{}\n\n{}", entry.query, entry.note);
        items.push(context_item(
            invocation_id,
            "journal",
            &entry.id,
            Some(format!("J{}", index + 1)),
            "journal_recall",
            &text,
            entry.note.chars().count() > 420,
            "Journal memory included as recall clue",
        ));
    }
    for relation in context.related.iter().take(MAX_INVESTIGATION_RELATED) {
        let text = format!(
            "{}:{} -> {}:{} {} {}",
            relation.from_kind,
            relation.from_id,
            relation.to_kind,
            relation.to_id,
            relation.relation,
            relation.reason
        );
        items.push(context_item(
            invocation_id,
            "relation",
            &relation.id,
            None,
            "related_clue",
            &text,
            false,
            "Related asset used as discovery clue",
        ));
    }
    items
}

fn context_item(
    invocation_id: &str,
    target_kind: &str,
    target_id: &str,
    label: Option<String>,
    role: &str,
    text: &str,
    truncated: bool,
    reason: &str,
) -> SaveInvestigationContextItemInput {
    SaveInvestigationContextItemInput {
        invocation_id: invocation_id.to_string(),
        target_kind: target_kind.to_string(),
        target_id: target_id.to_string(),
        label,
        role: role.to_string(),
        included: true,
        truncated,
        reason: Some(reason.to_string()),
        char_count: Some(text.chars().count().min(i64::MAX as usize) as i64),
        source_text_hash: Some(crate::db::stable_text_hash(text)),
    }
}

fn evidence_audit_text(record: &EvidenceRecord) -> String {
    let mut parts = vec![record.claim.clone(), record.answer.clone()];
    if let Some(reasoning) = record.reasoning.as_deref() {
        parts.push(reasoning.to_string());
    }
    if let Some(context) = record.context.as_deref() {
        parts.push(context.to_string());
    }
    for source in &record.sources {
        if let Some(snippet) = source.snippet.as_deref() {
            parts.push(snippet.to_string());
        }
    }
    parts.join("\n\n")
}

fn normalize_investigation_mode(mode: &str) -> String {
    match mode.trim() {
        "quick" | "deep" => mode.trim().to_string(),
        _ => "standard".to_string(),
    }
}

fn investigation_input_text(query: &str, mode: &str, context: &InvestigationContext) -> String {
    let mut sections = vec![format!("## Investigation Query\n{query}\n\nMode: {mode}")];

    if !context.sources.is_empty() {
        let lines = context.sources.iter().enumerate().map(|(index, workspace)| {
            let chunks = workspace.chunks.iter()
                .take(MAX_SYNTHESIS_SOURCE_CHUNKS)
                .map(|chunk| format!("- Chunk {}: {}", chunk.chunk_index, truncate_chars(&chunk.text, 520)))
                .collect::<Vec<_>>()
                .join("\n");
            format!(
                "[S{}] {}\nURI: {}\nChunks:\n{}",
                index + 1,
                workspace.source.title.as_deref().unwrap_or("Untitled Source"),
                workspace.source.canonical_uri,
                if chunks.is_empty() { "- No chunks".to_string() } else { chunks },
            )
        }).collect::<Vec<_>>().join("\n\n");
        sections.push(format!("## Sources\n{lines}"));
    }

    if !context.points.is_empty() {
        let lines = context.points.iter().enumerate().map(|(index, point)| {
            format!(
                "[P{}] [{}] {}\nSource: {}\nExcerpt: {}",
                index + 1,
                point.tag_type.as_deref().unwrap_or("Point"),
                truncate_chars(&point.content, 480),
                point.source_doc_name.as_deref().unwrap_or("none"),
                point.source_excerpt.as_deref().unwrap_or("none"),
            )
        }).collect::<Vec<_>>().join("\n\n");
        sections.push(format!("## Points\n{lines}"));
    }

    if !context.evidence.is_empty() {
        let lines = context.evidence.iter().enumerate().map(|(index, record)| {
            format!(
                "[E{}] [{}]\nClaim: {}\nAnswer: {}\nReasoning: {}\nSource location: {} / {:?}",
                index + 1,
                record.verdict,
                record.claim,
                truncate_chars(&record.answer, 520),
                record.reasoning.as_deref().unwrap_or("none"),
                record.source_id.as_deref().unwrap_or("none"),
                record.chunk_index,
            )
        }).collect::<Vec<_>>().join("\n\n");
        sections.push(format!("## Evidence\n{lines}"));
    }

    if !context.reports.is_empty() {
        let lines = context.reports.iter().enumerate().map(|(index, report)| {
            format!(
                "[R{}] [{}] {}\nSummary: {}\nBody excerpt: {}",
                index + 1,
                report.kind,
                report.title,
                report.summary,
                truncate_chars(&report.body_md, 520),
            )
        }).collect::<Vec<_>>().join("\n\n");
        sections.push(format!("## Prior Reports (context only unless their citations are reused)\n{lines}"));
    }

    if !context.journal.is_empty() {
        let lines = context.journal.iter().enumerate().map(|(index, entry)| {
            format!(
                "[J{}] {}\nNote: {}\nAsset IDs: sources={}, points={}, evidence={}, reports={}",
                index + 1,
                entry.query,
                truncate_chars(&entry.note, 420),
                entry.source_ids_json,
                entry.point_ids_json,
                entry.evidence_ids_json,
                entry.report_ids_json,
            )
        }).collect::<Vec<_>>().join("\n\n");
        sections.push(format!("## Journal Memory (recall clues, not final evidence)\n{lines}"));
    }

    if !context.related.is_empty() {
        let lines = context.related.iter().take(MAX_INVESTIGATION_RELATED).map(|relation| {
            format!(
                "- {}:{} -> {}:{} ({}, score {:.2}) {}",
                relation.from_kind,
                relation.from_id,
                relation.to_kind,
                relation.to_id,
                relation.relation,
                relation.score,
                relation.reason,
            )
        }).collect::<Vec<_>>().join("\n");
        sections.push(format!("## Related Assets (discovery clues)\n{lines}"));
    }

    sections.join("\n\n")
}

fn build_investigation_citations(context: &InvestigationContext) -> Vec<DigestCitation> {
    let mut citations = Vec::new();

    for (index, workspace) in context.sources.iter().enumerate() {
        let first_chunk = workspace.chunks.first();
        let excerpt = first_chunk
            .map(|chunk| truncate_chars(&chunk.text, 260))
            .unwrap_or_else(|| workspace.source.canonical_uri.clone());
        citations.push(DigestCitation {
            kind: "source".to_string(),
            label: format!("S{}", index + 1),
            id: workspace.source.id.clone(),
            title: workspace.source.title.clone().unwrap_or_else(|| "Source".to_string()),
            excerpt: excerpt.clone(),
            source_id: Some(workspace.source.id.clone()),
            chunk_index: first_chunk.map(|chunk| chunk.chunk_index),
            url: Some(workspace.source.canonical_uri.clone()),
            quote: Some(excerpt),
            reason: Some("Source available in Investigation context".to_string()),
        });
    }

    for (index, point) in context.points.iter().enumerate() {
        let point_context = context.point_contexts.get(index).and_then(Option::as_ref);
        citations.push(DigestCitation {
            kind: "point".to_string(),
            label: format!("P{}", index + 1),
            id: point.id.clone(),
            title: point.tag_type.clone().unwrap_or_else(|| "Point".to_string()),
            excerpt: truncate_chars(&point.content, 260),
            source_id: point_context.map(|ctx| ctx.source.id.clone()),
            chunk_index: point_context.map(|ctx| ctx.chunk_index),
            url: None,
            quote: point.source_excerpt.clone(),
            reason: Some("Point available in Investigation context".to_string()),
        });
    }

    for (index, record) in context.evidence.iter().enumerate() {
        citations.push(DigestCitation {
            kind: "evidence".to_string(),
            label: format!("E{}", index + 1),
            id: record.id.clone(),
            title: record.claim.clone(),
            excerpt: truncate_chars(&record.answer, 260),
            source_id: record.source_id.clone(),
            chunk_index: record.chunk_index,
            url: record.sources.first().map(|source| source.url.clone()),
            quote: Some(truncate_chars(&record.answer, 260)),
            reason: Some("Evidence available in Investigation context".to_string()),
        });
    }

    citations
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
            quote: point.source_excerpt.clone(),
            reason: Some("Starred Point included in Digest input".to_string()),
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
            quote: Some(record.answer.clone()),
            reason: Some("Selected Evidence included in Digest input".to_string()),
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
            quote: first_chunk.map(|chunk| truncate_chars(&chunk.text, 260)),
            reason: Some("Selected Source included in Synthesis input".to_string()),
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
            quote: Some(truncate_chars(&record.answer, 260)),
            reason: Some("Evidence linked to selected Source".to_string()),
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
            quote: point.source_excerpt.clone(),
            reason: Some("Starred Point included in Synthesis input".to_string()),
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
