use anyhow::{Context, Result};
use serde_json::Value;

pub fn extract_chat_text(raw: &str) -> Result<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        anyhow::bail!("模型响应未包含文本内容");
    }

    let text = if trimmed.lines().any(|line| line.trim_start().starts_with("data:")) {
        extract_sse_text(trimmed)?
    } else {
        let value: Value = serde_json::from_str(trimmed).context("解析模型响应 JSON 失败")?;
        if let Some(message) = provider_error_message(&value) {
            anyhow::bail!("模型返回错误: {message}");
        }
        extract_final_text(&value)
            .or_else(|| extract_reasoning_text(&value))
            .unwrap_or_default()
    };

    let text = text.trim().to_string();
    if text.is_empty() {
        anyhow::bail!("模型响应未包含文本内容");
    }
    Ok(text)
}

fn extract_sse_text(raw: &str) -> Result<String> {
    let mut content = String::new();
    let mut reasoning = String::new();

    for line in raw.lines() {
        let line = line.trim();
        let Some(data) = line.strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            continue;
        }

        let value: Value = serde_json::from_str(data).context("解析模型 SSE 事件失败")?;
        if let Some(message) = provider_error_message(&value) {
            anyhow::bail!("模型返回错误事件: {message}");
        }
        if let Some(text) = extract_final_text(&value) {
            content.push_str(&text);
        } else if let Some(text) = extract_reasoning_text(&value) {
            reasoning.push_str(&text);
        }
    }

    Ok(if content.trim().is_empty() {
        reasoning
    } else {
        content
    })
}

fn extract_final_text(value: &Value) -> Option<String> {
    let choice = value.get("choices")?.as_array()?.first()?;
    for container in [choice.get("message"), choice.get("delta")]
        .into_iter()
        .flatten()
    {
        if let Some(text) = value_as_text(container.get("content")) {
            if !text.trim().is_empty() {
                return Some(text);
            }
        }
    }
    value_as_text(choice.get("text"))
        .filter(|text| !text.trim().is_empty())
        .or_else(|| value_as_text(value.get("output_text")))
        .or_else(|| value_as_text(value.get("output")))
}

fn extract_reasoning_text(value: &Value) -> Option<String> {
    let choice = value.get("choices")?.as_array()?.first()?;
    for container in [choice.get("message"), choice.get("delta")]
        .into_iter()
        .flatten()
    {
        for key in ["reasoning_content", "reasoningContent", "reasoning"] {
            if let Some(text) = value_as_text(container.get(key)) {
                if !text.trim().is_empty() {
                    return Some(text);
                }
            }
        }
    }
    None
}

fn value_as_text(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::String(text) => Some(text.clone()),
        Value::Array(parts) => {
            let text = parts
                .iter()
                .filter_map(|part| match part {
                    Value::String(text) => Some(text.clone()),
                    Value::Object(object) => value_as_text(
                        object
                            .get("text")
                            .or_else(|| object.get("content"))
                            .or_else(|| object.get("output_text")),
                    ),
                    _ => None,
                })
                .collect::<String>();
            (!text.is_empty()).then_some(text)
        }
        Value::Object(object) => value_as_text(
            object
                .get("text")
                .or_else(|| object.get("content"))
                .or_else(|| object.get("output_text")),
        ),
        _ => None,
    }
}

fn provider_error_message(value: &Value) -> Option<String> {
    let error = value.get("error")?;
    value_as_text(error.get("message"))
        .or_else(|| value_as_text(Some(error)))
        .filter(|message| !message.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_standard_json_message_content() {
        let raw = r#"{"choices":[{"message":{"content":"plain text"}}]}"#;
        assert_eq!(extract_chat_text(raw).unwrap(), "plain text");
    }

    #[test]
    fn extracts_content_parts_and_reasoning_fallback() {
        let parts = r#"{"choices":[{"message":{"content":[{"type":"text","text":"part one"},{"type":"text","text":" part two"}]}}]}"#;
        assert_eq!(extract_chat_text(parts).unwrap(), "part one part two");

        let reasoning = r#"{"choices":[{"message":{"content":null,"reasoning_content":"reasoning fallback"}}]}"#;
        assert_eq!(extract_chat_text(reasoning).unwrap(), "reasoning fallback");
    }

    #[test]
    fn assembles_thin_mint_sse_delta_content() {
        let raw = concat!(
            "data: {\"id\":\"chat-1\",\"choices\":[{\"delta\":{\"role\":\"assistant\",\"content\":\"hel\"}}]}\n\n",
            "data: {\"id\":\"chat-1\",\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n",
            "data: [DONE]\n\n"
        );
        assert_eq!(extract_chat_text(raw).unwrap(), "hello");
    }

    #[test]
    fn rejects_empty_and_sse_error_responses() {
        let empty = r#"{"choices":[{"message":{"content":""}}]}"#;
        assert!(extract_chat_text(empty).unwrap_err().to_string().contains("文本"));

        let error = "data: {\"error\":{\"message\":\"capacity exhausted\"}}\n\n";
        assert!(extract_chat_text(error)
            .unwrap_err()
            .to_string()
            .contains("capacity exhausted"));
    }
}
