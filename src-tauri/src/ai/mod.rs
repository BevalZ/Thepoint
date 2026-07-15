pub mod chat_response;
pub mod explore;
pub mod models;
pub mod openai;

use serde::{Deserialize, Serialize};

/// A single extracted point. MVP: flat list, no id/parent (assigned on save).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedPoint {
    pub content: String,
    pub tag_type: String,
    #[serde(default)]
    pub anchor: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Label {
    pub category: String,
    pub sub: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChunkCard {
    pub index: usize,
    pub text: String,
    pub summary: String,
    pub hot_take: String,
    #[serde(default)]
    pub commentator_name: Option<String>,
    #[serde(default)]
    pub commentator_emoji: Option<String>,
    pub labels: Vec<Label>,
}
