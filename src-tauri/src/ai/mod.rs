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
