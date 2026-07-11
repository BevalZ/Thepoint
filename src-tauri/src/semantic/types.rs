use serde::{Deserialize, Serialize};

pub const LOCAL_MODEL_KEY: &str = "fastembed:multilingual-e5-small";
pub const LOCAL_MODEL_DIMENSION: usize = 384;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingProviderConfig {
    pub kind: String,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub model: Option<String>,
}

impl Default for EmbeddingProviderConfig {
    fn default() -> Self {
        Self {
            kind: "local".to_string(),
            base_url: None,
            api_key: None,
            model: None,
        }
    }
}

impl EmbeddingProviderConfig {
    pub fn model_key(&self) -> String {
        if self.kind == "remote" {
            format!(
                "openai-compatible:{}",
                self.model.as_deref().unwrap_or("text-embedding-3-small")
            )
        } else {
            LOCAL_MODEL_KEY.to_string()
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SemanticIndexStatus {
    pub model_key: String,
    pub phase: String,
    pub total: i64,
    pub ready: i64,
    pub pending: i64,
    pub stale: i64,
    pub failed: i64,
    pub processed: i64,
    pub cancellable: bool,
    pub model_cached: bool,
    pub last_error: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebuildSemanticIndexInput {
    #[serde(default)]
    pub provider: EmbeddingProviderConfig,
    pub source_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HybridSearchInput {
    pub query: String,
    pub source_id: Option<String>,
    pub limit: Option<usize>,
    #[serde(default)]
    pub provider: EmbeddingProviderConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HybridSearchHit {
    pub id: String,
    pub source_id: String,
    pub source_title: String,
    pub chunk_index: i64,
    pub heading_path: Option<String>,
    pub text: String,
    pub score: f64,
    pub keyword_rank: Option<usize>,
    pub semantic_rank: Option<usize>,
    pub semantic_score: Option<f64>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroundedAnswerInput {
    pub query: String,
    pub hits: Vec<HybridSearchHit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroundedCitation {
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroundedAnswerResult {
    pub content: String,
    pub citations: Vec<GroundedCitation>,
    pub invocation_id: Option<String>,
    pub refused: bool,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveGroundedAnswerReportInput {
    pub query: String,
    pub answer: GroundedAnswerResult,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseSafetyStatus {
    pub database_path: String,
    pub integrity: String,
    pub latest_backup_path: Option<String>,
    pub checked_at: String,
}
