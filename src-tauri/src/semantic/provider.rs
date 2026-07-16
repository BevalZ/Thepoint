use anyhow::{bail, Context, Result};
use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};
use serde::{Deserialize, Serialize};

use super::{
    storage::normalize_vector,
    types::{EmbeddingProviderConfig, LOCAL_MODEL_DIMENSION},
};

pub fn embed_local(texts: Vec<String>, cache_dir: std::path::PathBuf) -> Result<Vec<Vec<f32>>> {
    let options = InitOptions::new(EmbeddingModel::MultilingualE5Small)
        .with_cache_dir(cache_dir)
        .with_show_download_progress(false);
    let mut model = TextEmbedding::try_new(options)
        .context("failed to download or initialize multilingual E5-small")?;
    let mut embeddings = model
        .embed(texts, Some(32))
        .context("local embedding failed")?;
    if embeddings
        .iter()
        .any(|embedding| embedding.len() != LOCAL_MODEL_DIMENSION)
    {
        bail!("local embedding model returned an unexpected dimension");
    }
    for embedding in &mut embeddings {
        normalize_vector(embedding)?;
    }
    Ok(embeddings)
}

#[derive(Serialize)]
struct RemoteEmbeddingRequest<'a> {
    model: &'a str,
    input: &'a [String],
}

#[derive(Deserialize)]
struct RemoteEmbeddingResponse {
    data: Vec<RemoteEmbeddingItem>,
}

#[derive(Deserialize)]
struct RemoteEmbeddingItem {
    index: usize,
    embedding: Vec<f32>,
}

fn parse_remote_response(raw: &str, expected_count: usize) -> Result<Vec<Vec<f32>>> {
    let mut parsed: RemoteEmbeddingResponse =
        serde_json::from_str(raw).context("remote embedding response is not valid JSON")?;
    parsed.data.sort_by_key(|item| item.index);
    if parsed.data.len() != expected_count {
        bail!("remote embedding response count mismatch");
    }
    if parsed
        .data
        .iter()
        .enumerate()
        .any(|(expected, item)| item.index != expected)
    {
        bail!("remote embedding response indexes are incomplete or duplicated");
    }
    let mut embeddings = parsed
        .data
        .into_iter()
        .map(|item| item.embedding)
        .collect::<Vec<_>>();
    let dimension = embeddings.first().map(Vec::len).unwrap_or_default();
    if dimension == 0 || embeddings.iter().any(|vector| vector.len() != dimension) {
        bail!("remote embedding response has invalid dimensions");
    }
    for embedding in &mut embeddings {
        normalize_vector(embedding)?;
    }
    Ok(embeddings)
}

pub async fn embed_remote(
    config: &EmbeddingProviderConfig,
    texts: Vec<String>,
) -> Result<Vec<Vec<f32>>> {
    let base = config
        .base_url
        .as_deref()
        .unwrap_or("https://api.openai.com")
        .trim_end_matches('/');
    let endpoint = if base.ends_with("/v1/embeddings") {
        base.to_string()
    } else {
        format!("{base}/v1/embeddings")
    };
    let api_key = config.api_key.as_deref().unwrap_or_default();
    if api_key.trim().is_empty() {
        bail!("remote embedding API key is missing");
    }
    let model = config.model.as_deref().unwrap_or("text-embedding-3-small");
    let response = crate::http::client()
        .post(endpoint)
        .bearer_auth(api_key)
        .json(&RemoteEmbeddingRequest {
            model,
            input: &texts,
        })
        .send()
        .await
        .context("remote embedding request failed")?;
    let status = response.status();
    let raw = response
        .text()
        .await
        .context("failed to read remote embedding response")?;
    if !status.is_success() {
        bail!("remote embedding API returned {status}: {raw}");
    }
    parse_remote_response(&raw, texts.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_model_key_is_stable() {
        let config = EmbeddingProviderConfig {
            kind: "remote".into(),
            base_url: None,
            api_key: None,
            model: Some("embed-v1".into()),
        };
        assert_eq!(config.model_key(), "openai-compatible:embed-v1");
    }

    #[test]
    fn remote_response_is_sorted_and_normalized() {
        let raw =
            r#"{"data":[{"index":1,"embedding":[0.0,2.0]},{"index":0,"embedding":[3.0,4.0]}]}"#;
        let vectors = parse_remote_response(raw, 2).unwrap();
        assert!((vectors[0][0] - 0.6).abs() < 1e-6);
        assert_eq!(vectors[1], vec![0.0, 1.0]);
    }

    #[test]
    fn remote_response_rejects_count_index_and_dimension_errors() {
        assert!(parse_remote_response(r#"{"data":[]}"#, 1).is_err());
        assert!(parse_remote_response(r#"{"data":[{"index":1,"embedding":[1.0]}]}"#, 1).is_err());
        assert!(parse_remote_response(r#"{"data":[{"index":0,"embedding":[]}] }"#, 1).is_err());
        assert!(parse_remote_response(
            r#"{"data":[{"index":0,"embedding":[1.0]},{"index":1,"embedding":[1.0,2.0]}]}"#,
            2
        )
        .is_err());
    }

    #[test]
    #[ignore = "downloads the local embedding model; run explicitly for release verification"]
    fn local_multilingual_e5_smoke() {
        let cache = std::env::temp_dir().join("thepoint-fastembed-smoke");
        let vectors = embed_local(
            vec![
                "query: 可重复性危机".into(),
                "passage: reproducibility crisis".into(),
            ],
            cache,
        )
        .unwrap();
        assert_eq!(vectors.len(), 2);
        assert!(vectors
            .iter()
            .all(|vector| vector.len() == LOCAL_MODEL_DIMENSION));
        assert!(vectors.iter().all(|vector| {
            (vector.iter().map(|value| value * value).sum::<f32>() - 1.0).abs() < 1e-4
        }));
    }
}
