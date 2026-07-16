use std::{net::IpAddr, sync::LazyLock, time::Duration};

use anyhow::{Context, Result};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::Wry;

use crate::ai::chat_response::extract_chat_text;

const TRANSLATION_TIMEOUT_SECONDS: u64 = 45;
const TRANSLATION_MAX_CHARS: usize = 12_000;
const TRANSLATION_MAX_RESPONSE_BYTES: usize = 1024 * 1024;
const TRANSLATION_MAX_ERROR_CHARS: usize = 600;
const DEFAULT_DEEPLX_BASE_URL: &str = "http://127.0.0.1:1188";
static TRANSLATION_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(reqwest::Client::new);
static TRANSLATION_LIMIT: LazyLock<tokio::sync::Semaphore> =
    LazyLock::new(|| tokio::sync::Semaphore::new(3));

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationInput {
    pub text: String,
    pub source_language: Option<String>,
    pub target_language: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationResult {
    pub text: String,
    pub source_language: Option<String>,
    pub target_language: String,
    pub provider: String,
}

#[tauri::command]
pub async fn translate_text(
    app: tauri::AppHandle<Wry>,
    input: TranslationInput,
) -> Result<TranslationResult, String> {
    let text = input.text.trim().to_string();
    if text.is_empty() {
        return Err("翻译文本不能为空".to_string());
    }
    if text.chars().count() > TRANSLATION_MAX_CHARS {
        return Err(format!("单个翻译块不能超过 {TRANSLATION_MAX_CHARS} 个字符"));
    }

    let _permit = TRANSLATION_LIMIT
        .acquire()
        .await
        .map_err(|_| "翻译服务并发控制已关闭，请重启应用后重试".to_string())?;
    let config = crate::commands::config::get_config(app)?;
    let target_language = normalize_target_language(
        input
            .target_language
            .as_deref()
            .unwrap_or(&config.translation_target_language),
    )
    .map_err(|error| error.to_string())?;
    let source_language = normalize_source_language(
        input
            .source_language
            .as_deref()
            .unwrap_or(&config.translation_source_language),
    )
    .map_err(|error| error.to_string())?;
    let provider = config.translation_provider.trim().to_ascii_lowercase();
    let client = &*TRANSLATION_CLIENT;

    let result = match provider.as_str() {
        "ai" => translate_with_ai(client, &config, &text, source_language, target_language).await,
        "deeplx" => {
            translate_with_deeplx(client, &config, &text, source_language, target_language).await
        }
        _ => return Err("不支持的翻译服务，请在设置中选择 AI API 或 DeepLX / DLX".to_string()),
    };
    result.map_err(|error| {
        sanitize_translation_error(&error.to_string(), &config.translation_api_key)
    })
}

async fn translate_with_ai(
    client: &reqwest::Client,
    config: &crate::commands::config::AppConfig,
    text: &str,
    source_language: &str,
    target_language: &str,
) -> Result<TranslationResult> {
    if config.translation_api_key.trim().is_empty() {
        anyhow::bail!("AI 翻译 API Key 未配置，请前往设置 → AI 配置 → 翻译");
    }
    if config.translation_model.trim().is_empty() {
        anyhow::bail!("AI 翻译模型未配置，请前往设置 → AI 配置 → 翻译");
    }
    let endpoint = ai_translation_endpoint(&config.translation_base_url)?;
    validate_endpoint_transport(&endpoint, true)?;
    let target_name = target_language_name(target_language);
    let source_instruction = if source_language == "AUTO" {
        format!("Auto-detect the source language, then translate into {target_name}.")
    } else {
        format!(
            "The source language is {}. Translate from {} into {target_name}.",
            target_language_name(source_language),
            target_language_name(source_language),
        )
    };
    let body = json!({
        "model": config.translation_model.trim(),
        "temperature": 0,
        "messages": [
            {
                "role": "system",
                "content": format!(
                    "You are a professional translation engine. {source_instruction} Preserve meaning, paragraph breaks, Markdown syntax, names, numbers, and citations. Return only the translation with no commentary."
                )
            },
            { "role": "user", "content": text }
        ]
    });

    let response = client
        .post(endpoint)
        .timeout(Duration::from_secs(TRANSLATION_TIMEOUT_SECONDS))
        .bearer_auth(config.translation_api_key.trim())
        .json(&body)
        .send()
        .await
        .map_err(|error| network_error("AI 翻译", &error))?;
    let (status, raw) = read_bounded_response(response, "AI 翻译").await?;
    ensure_success(status, &raw, "AI 翻译")?;
    let translated = extract_chat_text(&raw).context("解析 AI 翻译响应失败")?;

    Ok(TranslationResult {
        text: translated,
        source_language: if source_language == "AUTO" {
            None
        } else {
            Some(source_language.to_string())
        },
        target_language: target_language.to_string(),
        provider: "ai".to_string(),
    })
}

async fn translate_with_deeplx(
    client: &reqwest::Client,
    config: &crate::commands::config::AppConfig,
    text: &str,
    source_language: &str,
    target_language: &str,
) -> Result<TranslationResult> {
    let endpoint = deeplx_translation_endpoint(&config.translation_base_url)?;
    validate_endpoint_transport(&endpoint, !config.translation_api_key.trim().is_empty())?;
    let mut request = client
        .post(endpoint)
        .timeout(Duration::from_secs(TRANSLATION_TIMEOUT_SECONDS))
        .json(&json!({
            "text": text,
            "source_lang": source_language,
            "target_lang": target_language,
            "tag_handling": ""
        }));
    if !config.translation_api_key.trim().is_empty() {
        request = request.bearer_auth(config.translation_api_key.trim());
    }

    let response = request
        .send()
        .await
        .map_err(|error| network_error("DeepLX / DLX", &error))?;
    let (status, raw) = read_bounded_response(response, "DeepLX / DLX").await?;
    ensure_success(status, &raw, "DeepLX / DLX")?;
    let parsed = parse_deeplx_response(&raw)?;

    Ok(TranslationResult {
        text: parsed.text,
        source_language: parsed.source_language,
        target_language: target_language.to_string(),
        provider: "deeplx".to_string(),
    })
}

fn normalize_target_language(value: &str) -> Result<&'static str> {
    match value.trim().to_ascii_uppercase().as_str() {
        "ZH" | "ZH-CN" => Ok("ZH"),
        "EN" => Ok("EN"),
        "JA" => Ok("JA"),
        "KO" => Ok("KO"),
        "DE" => Ok("DE"),
        "FR" => Ok("FR"),
        "ES" => Ok("ES"),
        _ => anyhow::bail!("不支持的翻译目标语言"),
    }
}

fn normalize_source_language(value: &str) -> Result<&'static str> {
    match value.trim().to_ascii_uppercase().as_str() {
        "" | "AUTO" => Ok("AUTO"),
        "ZH" | "ZH-CN" => Ok("ZH"),
        "EN" => Ok("EN"),
        "JA" => Ok("JA"),
        "KO" => Ok("KO"),
        "DE" => Ok("DE"),
        "FR" => Ok("FR"),
        "ES" => Ok("ES"),
        _ => anyhow::bail!("不支持的翻译源语言"),
    }
}

fn target_language_name(value: &str) -> &'static str {
    match value {
        "ZH" => "Simplified Chinese",
        "EN" => "English",
        "JA" => "Japanese",
        "KO" => "Korean",
        "DE" => "German",
        "FR" => "French",
        "ES" => "Spanish",
        _ => "the requested language",
    }
}

fn ai_translation_endpoint(base_url: &str) -> Result<reqwest::Url> {
    let base = base_url.trim();
    if base.is_empty() {
        anyhow::bail!("AI 翻译 Base URL 未配置，请前往设置 → AI 配置 → 翻译");
    }
    let mut endpoint = parse_translation_url(base, "AI 翻译")?;
    let path = endpoint.path().trim_end_matches('/');
    let next_path = if path.ends_with("/chat/completions") {
        path.to_string()
    } else if path.ends_with("/v1") {
        format!("{path}/chat/completions")
    } else {
        format!("{path}/v1/chat/completions")
    };
    endpoint.set_path(&next_path);
    Ok(endpoint)
}

fn deeplx_translation_endpoint(base_url: &str) -> Result<reqwest::Url> {
    let base = if base_url.trim().is_empty() {
        DEFAULT_DEEPLX_BASE_URL
    } else {
        base_url.trim()
    };
    let mut endpoint = parse_translation_url(base, "DeepLX / DLX")?;
    let path = endpoint.path().trim_end_matches('/');
    let next_path = if path.ends_with("/translate") {
        path.to_string()
    } else {
        format!("{path}/translate")
    };
    endpoint.set_path(&next_path);
    Ok(endpoint)
}

fn parse_translation_url(value: &str, provider: &str) -> Result<reqwest::Url> {
    let endpoint =
        reqwest::Url::parse(value).with_context(|| format!("{provider} Base URL 格式无效"))?;
    if !matches!(endpoint.scheme(), "http" | "https") {
        anyhow::bail!("{provider} Base URL 仅支持 http:// 或 https://");
    }
    if !endpoint.username().is_empty() || endpoint.password().is_some() {
        anyhow::bail!("{provider} Base URL 不得包含用户名或密码");
    }
    if endpoint.fragment().is_some() {
        anyhow::bail!("{provider} Base URL 不得包含 URL fragment");
    }
    Ok(endpoint)
}

fn validate_endpoint_transport(endpoint: &reqwest::Url, sends_secret: bool) -> Result<()> {
    if endpoint.scheme() != "http" || !sends_secret {
        return Ok(());
    }
    let host = endpoint.host_str().unwrap_or_default();
    let loopback = host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<IpAddr>()
            .map(|address| address.is_loopback())
            .unwrap_or(false);
    if !loopback {
        anyhow::bail!("带密钥的远程翻译服务必须使用 https://；http:// 仅允许本机地址");
    }
    Ok(())
}

fn ensure_success(status: StatusCode, raw: &str, provider: &str) -> Result<()> {
    if status.is_success() {
        return Ok(());
    }
    let message = provider_error_message(raw).unwrap_or_else(|| "服务未返回错误详情".to_string());
    anyhow::bail!("{provider} 返回 HTTP {}: {message}", status.as_u16())
}

async fn read_bounded_response(
    mut response: reqwest::Response,
    provider: &str,
) -> Result<(StatusCode, String)> {
    let status = response.status();
    if response
        .content_length()
        .is_some_and(|length| length > TRANSLATION_MAX_RESPONSE_BYTES as u64)
    {
        anyhow::bail!("{provider} 响应超过 1 MiB 限制");
    }

    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| network_error(provider, &error))?
    {
        if body.len().saturating_add(chunk.len()) > TRANSLATION_MAX_RESPONSE_BYTES {
            anyhow::bail!("{provider} 响应超过 1 MiB 限制");
        }
        body.extend_from_slice(&chunk);
    }
    let text = String::from_utf8(body).context("翻译服务响应不是有效 UTF-8")?;
    Ok((status, text))
}

fn network_error(provider: &str, error: &reqwest::Error) -> anyhow::Error {
    if error.is_timeout() {
        anyhow::anyhow!("{provider} 请求在 {TRANSLATION_TIMEOUT_SECONDS} 秒后超时")
    } else if error.is_connect() {
        anyhow::anyhow!("{provider} 连接失败，请检查 Base URL 和服务是否已启动")
    } else if error.is_redirect() {
        anyhow::anyhow!("{provider} 重定向失败，请检查 Base URL")
    } else {
        anyhow::anyhow!("{provider} 网络请求失败")
    }
}

fn sanitize_translation_error(message: &str, secret: &str) -> String {
    let redacted = if secret.trim().is_empty() {
        message.to_string()
    } else {
        message.replace(secret.trim(), "[REDACTED]")
    };
    let cleaned = redacted
        .chars()
        .filter(|character| !character.is_control() || *character == '\n' || *character == '\t')
        .take(TRANSLATION_MAX_ERROR_CHARS)
        .collect::<String>();
    if cleaned.trim().is_empty() {
        "翻译失败，服务未返回可用错误信息".to_string()
    } else {
        cleaned
    }
}

fn provider_error_message(raw: &str) -> Option<String> {
    let value: Value = serde_json::from_str(raw).ok()?;
    value
        .get("message")
        .and_then(Value::as_str)
        .or_else(|| value.pointer("/error/message").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

#[derive(Debug)]
struct ParsedDeepLxResponse {
    text: String,
    source_language: Option<String>,
}

fn parse_deeplx_response(raw: &str) -> Result<ParsedDeepLxResponse> {
    let value: Value = serde_json::from_str(raw).context("解析 DeepLX / DLX 响应 JSON 失败")?;
    if let Some(code) = value.get("code").and_then(Value::as_i64) {
        if !(200..300).contains(&code) {
            let message = provider_error_message(raw).unwrap_or_else(|| "翻译失败".to_string());
            anyhow::bail!("DeepLX / DLX 返回错误 {code}: {message}");
        }
    }

    let native_text = value.get("data").and_then(Value::as_str);
    let compatible = value
        .get("translations")
        .and_then(Value::as_array)
        .and_then(|items| items.first());
    let text = native_text
        .or_else(|| {
            compatible
                .and_then(|item| item.get("text"))
                .and_then(Value::as_str)
        })
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .context("DeepLX / DLX 响应未包含翻译文本")?;
    let source_language = value
        .get("source_lang")
        .and_then(Value::as_str)
        .or_else(|| {
            compatible
                .and_then(|item| item.get("detected_source_language"))
                .and_then(Value::as_str)
        })
        .map(ToOwned::to_owned);

    Ok(ParsedDeepLxResponse {
        text: text.to_string(),
        source_language,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_ai_and_deeplx_endpoints_without_duplicate_suffixes() {
        assert_eq!(
            ai_translation_endpoint("https://api.example.com").unwrap(),
            reqwest::Url::parse("https://api.example.com/v1/chat/completions").unwrap()
        );
        assert_eq!(
            ai_translation_endpoint("https://api.example.com/v1/chat/completions/").unwrap(),
            reqwest::Url::parse("https://api.example.com/v1/chat/completions").unwrap()
        );
        assert_eq!(
            ai_translation_endpoint("https://api.example.com/v1/").unwrap(),
            reqwest::Url::parse("https://api.example.com/v1/chat/completions").unwrap()
        );
        assert_eq!(
            deeplx_translation_endpoint("http://127.0.0.1:1188").unwrap(),
            reqwest::Url::parse("http://127.0.0.1:1188/translate").unwrap()
        );
        assert_eq!(
            deeplx_translation_endpoint("https://translate.example.com/translate/").unwrap(),
            reqwest::Url::parse("https://translate.example.com/translate").unwrap()
        );
        assert_eq!(
            ai_translation_endpoint("https://api.example.com/v1?api-version=2026-01-01")
                .unwrap()
                .as_str(),
            "https://api.example.com/v1/chat/completions?api-version=2026-01-01"
        );
        assert!(ai_translation_endpoint("file:///tmp/translate").is_err());
        assert!(validate_endpoint_transport(
            &reqwest::Url::parse("http://api.example.com/v1/chat/completions").unwrap(),
            true,
        )
        .is_err());
        assert!(validate_endpoint_transport(
            &reqwest::Url::parse("http://127.0.0.1:1188/translate").unwrap(),
            true,
        )
        .is_ok());
    }

    #[test]
    fn parses_native_and_official_style_deeplx_responses() {
        let native = parse_deeplx_response(
            r#"{"code":200,"data":"你好","source_lang":"EN","target_lang":"ZH"}"#,
        )
        .unwrap();
        assert_eq!(native.text, "你好");
        assert_eq!(native.source_language.as_deref(), Some("EN"));

        let compatible = parse_deeplx_response(
            r#"{"translations":[{"detected_source_language":"EN","text":"世界"}]}"#,
        )
        .unwrap();
        assert_eq!(compatible.text, "世界");
        assert_eq!(compatible.source_language.as_deref(), Some("EN"));
    }

    #[test]
    fn deeplx_parser_and_language_validation_reject_invalid_payloads() {
        assert!(
            parse_deeplx_response(r#"{"code":401,"message":"Invalid access token"}"#)
                .unwrap_err()
                .to_string()
                .contains("Invalid access token")
        );
        assert!(parse_deeplx_response(r#"{"code":200,"data":""}"#)
            .unwrap_err()
            .to_string()
            .contains("翻译文本"));
        assert_eq!(normalize_target_language("zh-CN").unwrap(), "ZH");
        assert!(normalize_target_language("AUTO").is_err());
        assert_eq!(normalize_source_language("AUTO").unwrap(), "AUTO");
        assert_eq!(normalize_source_language("").unwrap(), "AUTO");
        assert_eq!(normalize_source_language("zh-CN").unwrap(), "ZH");
        assert!(normalize_source_language("PT").is_err());
    }

    #[test]
    fn translation_errors_are_redacted_and_bounded() {
        let secret = "secret-token";
        let message = format!("provider rejected {secret}\n{}", "x".repeat(900));
        let sanitized = sanitize_translation_error(&message, secret);

        assert!(!sanitized.contains(secret));
        assert!(sanitized.contains("[REDACTED]"));
        assert!(sanitized.chars().count() <= TRANSLATION_MAX_ERROR_CHARS);
    }
}
