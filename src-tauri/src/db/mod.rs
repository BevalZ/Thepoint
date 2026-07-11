use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Wry};

const DB_FILE: &str = "deep_explorer.db";
const REVIEW_QUEUE_DEFAULT_LIMIT: i64 = 12;
const REVIEW_QUEUE_MAX_LIMIT: i64 = 50;

/// A point persisted in the local SQLite library, returned to the frontend.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StoredPoint {
    pub id: String,
    pub content: String,
    pub tag_type: Option<String>,
    pub parent_id: Option<String>,
    pub source_doc_name: Option<String>,
    pub source_excerpt: Option<String>,
    pub created_at: String,
    pub archived: bool,
    pub starred: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SourceDocumentRecord {
    pub id: String,
    pub kind: String,
    pub title: Option<String>,
    pub canonical_uri: String,
    pub metadata_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PointSourceLink {
    pub point_id: String,
    pub source_id: String,
    pub chunk_index: i64,
    pub anchor_text: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SourceChunkRecord {
    pub id: String,
    pub source_id: String,
    pub chunk_index: i64,
    pub heading_path: Option<String>,
    pub text: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SourceSummaryRecord {
    pub id: String,
    pub kind: String,
    pub title: Option<String>,
    pub canonical_uri: String,
    pub metadata_json: String,
    pub created_at: String,
    pub updated_at: String,
    pub chunk_count: i64,
    pub point_count: i64,
    pub star_count: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SourceWorkspaceRecord {
    pub source: SourceSummaryRecord,
    pub chunks: Vec<SourceChunkRecord>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SourceAssetsRecord {
    pub source: SourceSummaryRecord,
    pub points: Vec<StoredPoint>,
    pub evidence: Vec<EvidenceRecord>,
    pub reports: Vec<ReportRecord>,
    pub gallery: Vec<GalleryItem>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PointSourceContext {
    pub point_id: String,
    pub source: SourceSummaryRecord,
    pub chunk_index: i64,
    pub anchor_text: Option<String>,
    pub chunks: Vec<SourceChunkRecord>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchResult {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchAssetsInput {
    pub query: String,
    pub kinds: Option<Vec<String>>,
    pub filter: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchAssetResult {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub preview: Option<String>,
    pub reason: String,
    pub score: f64,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
    pub metadata_json: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchRankingExplanationInput {
    pub query: String,
    pub kinds: Option<Vec<String>>,
    pub filter: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchRankingComponent {
    pub name: String,
    pub value: f64,
    pub weight: f64,
    pub contribution: f64,
    pub used_for_ranking: bool,
    pub reason: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchRankingItemExplanation {
    pub rank: i64,
    pub kind: String,
    pub id: String,
    pub title: String,
    pub score: f64,
    pub score_delta_from_top: f64,
    pub reason: String,
    pub matched_terms: Vec<String>,
    pub missing_terms: Vec<String>,
    pub matched_fields: Vec<String>,
    pub components: Vec<SearchRankingComponent>,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
    pub metadata_json: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchRankingExplanation {
    pub query: String,
    pub query_terms: Vec<String>,
    pub ranker: String,
    pub diagnostic_model: String,
    pub result_count: i64,
    pub analyzed_count: i64,
    pub max_score: Option<f64>,
    pub min_score: Option<f64>,
    pub items: Vec<SearchRankingItemExplanation>,
    pub warnings: Vec<String>,
    pub generated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BlockReferenceInput {
    pub kind: String,
    pub id: String,
    pub query: Option<String>,
    pub limit: Option<i64>,
    pub include_related: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BlockReferenceCard {
    pub index: i64,
    pub block_kind: String,
    pub asset_kind: String,
    pub asset_id: String,
    pub block_id: String,
    pub title: String,
    pub excerpt: String,
    pub locator: String,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
    pub matched_terms: Vec<String>,
    pub matched_fields: Vec<String>,
    pub reason: String,
    pub score: f64,
    pub command_name: String,
    pub wrapper_name: String,
    pub input_json: String,
    pub metadata_json: String,
    pub block_hash: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BlockReferenceManifest {
    pub root_kind: String,
    pub root_id: String,
    pub root_title: Option<String>,
    pub query: Option<String>,
    pub block_count: i64,
    pub cards: Vec<BlockReferenceCard>,
    pub warnings: Vec<String>,
    pub generated_at: String,
    pub source_inspiration: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BoardSnapshotInput {
    pub kind: String,
    pub id: String,
    pub query: Option<String>,
    pub limit: Option<i64>,
    pub include_related: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BoardSnapshotNode {
    pub index: i64,
    pub node_id: String,
    pub lane: String,
    pub x: i64,
    pub y: i64,
    pub asset_kind: String,
    pub asset_id: String,
    pub block_kind: String,
    pub block_id: String,
    pub title: String,
    pub excerpt: String,
    pub locator: String,
    pub command_name: String,
    pub wrapper_name: String,
    pub input_json: String,
    pub block_hash: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BoardSnapshotEdge {
    pub from_node_id: String,
    pub to_node_id: String,
    pub relation: String,
    pub reason: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BoardSnapshotExport {
    pub root_kind: String,
    pub root_id: String,
    pub title: String,
    pub node_count: i64,
    pub edge_count: i64,
    pub nodes: Vec<BoardSnapshotNode>,
    pub edges: Vec<BoardSnapshotEdge>,
    pub markdown: String,
    pub warnings: Vec<String>,
    pub generated_at: String,
    pub source_inspiration: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalContextInput {
    pub query: String,
    pub kinds: Option<Vec<String>>,
    pub filter: Option<String>,
    pub limit: Option<i64>,
    pub max_chars_per_item: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalContextItem {
    pub index: i64,
    pub kind: String,
    pub id: String,
    pub title: String,
    pub excerpt: String,
    pub reason: String,
    pub score: f64,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
    pub metadata_json: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalContext {
    pub query: String,
    pub item_count: i64,
    pub total_chars: i64,
    pub items: Vec<RetrievalContextItem>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkSuggestionInput {
    pub kind: String,
    pub id: String,
    pub limit: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkSuggestion {
    pub target_kind: String,
    pub target_id: String,
    pub candidate_kind: String,
    pub candidate_id: String,
    pub candidate_title: String,
    pub candidate_excerpt: String,
    pub relation: String,
    pub reason: String,
    pub score: f64,
    pub existing_relation: bool,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
    pub metadata_json: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveAssetSearchInput {
    pub name: String,
    pub query: String,
    pub kinds: Option<Vec<String>>,
    pub filter: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SavedAssetSearch {
    pub id: String,
    pub name: String,
    pub query: String,
    pub kinds: Vec<String>,
    pub filter: Option<String>,
    pub limit: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SavedAssetSearchPreview {
    pub search: SavedAssetSearch,
    pub result_count: i64,
    pub results: Vec<SearchAssetResult>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveRetrievalProfileInput {
    pub name: String,
    pub description: Option<String>,
    pub query: String,
    pub kinds: Option<Vec<String>>,
    pub filter: Option<String>,
    pub saved_search_id: Option<String>,
    pub limit: Option<i64>,
    pub max_chars_per_item: Option<i64>,
    pub min_score: Option<f64>,
    pub mode: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalProfile {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub query: String,
    pub kinds: Vec<String>,
    pub filter: Option<String>,
    pub saved_search_id: Option<String>,
    pub limit: i64,
    pub max_chars_per_item: i64,
    pub min_score: f64,
    pub mode: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRetrievalProfileInput {
    pub id: String,
    pub query_override: Option<String>,
    pub limit: Option<i64>,
    pub max_chars_per_item: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RetrievalProfilePreview {
    pub profile: RetrievalProfile,
    pub saved_search: Option<SavedAssetSearch>,
    pub effective_query: String,
    pub effective_kinds: Vec<String>,
    pub effective_filter: Option<String>,
    pub min_score: f64,
    pub context: RetrievalContext,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
enum SearchAssetFilter {
    Kind(String),
    ReportKind(String),
    SourceKind(String),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceSourceRecord {
    pub id: String,
    pub evidence_id: String,
    pub title: Option<String>,
    pub url: String,
    pub snippet: Option<String>,
    pub stance: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceRecord {
    pub id: String,
    pub claim: String,
    pub verdict: String,
    pub answer: String,
    pub reasoning: Option<String>,
    pub context: Option<String>,
    pub point_id: Option<String>,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
    pub checked_at: String,
    pub created_at: String,
    pub sources: Vec<EvidenceSourceRecord>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveEvidenceSourceInput {
    pub title: Option<String>,
    pub url: String,
    pub snippet: Option<String>,
    pub stance: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveEvidenceInput {
    pub claim: String,
    pub verdict: String,
    pub answer: String,
    pub reasoning: Option<String>,
    pub context: Option<String>,
    pub point_id: Option<String>,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
    pub checked_at: Option<String>,
    pub sources: Vec<SaveEvidenceSourceInput>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReportRecord {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub source_name: Option<String>,
    pub body_md: String,
    pub summary: String,
    pub citations_json: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveReportInput {
    pub title: String,
    pub kind: String,
    pub source_name: Option<String>,
    pub body_md: String,
    pub summary: String,
    pub citations_json: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReportStarterTemplate {
    pub id: String,
    pub name: String,
    pub category: String,
    pub kind: String,
    pub description: String,
    pub sections: Vec<String>,
    pub source_inspiration: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BuildReportStarterInput {
    pub template_id: String,
    pub query: String,
    pub source_ids: Vec<String>,
    pub point_ids: Vec<String>,
    pub evidence_ids: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReportStarterContextItem {
    pub kind: String,
    pub id: String,
    pub label: String,
    pub title: String,
    pub excerpt: String,
    pub reason: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReportStarterDraft {
    pub template: ReportStarterTemplate,
    pub save_input: SaveReportInput,
    pub context_items: Vec<ReportStarterContextItem>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReprocessQueueInput {
    pub kinds: Option<Vec<String>>,
    pub limit: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReprocessQueueItem {
    pub target_kind: String,
    pub target_id: String,
    pub title: String,
    pub severity: String,
    pub issue_kind: String,
    pub reason: String,
    pub suggested_action: String,
    pub source_id: Option<String>,
    pub folder_id: Option<String>,
    pub metadata_json: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReprocessQueue {
    pub generated_at: String,
    pub item_count: i64,
    pub critical_count: i64,
    pub warning_count: i64,
    pub items: Vec<ReprocessQueueItem>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateAssetInput {
    pub kinds: Option<Vec<String>>,
    pub limit: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateAssetCandidate {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub excerpt: String,
    pub fingerprint: String,
    pub metadata_json: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateAssetGroup {
    pub group_id: String,
    pub duplicate_key: String,
    pub match_kind: String,
    pub score: f64,
    pub reason: String,
    pub candidates: Vec<DuplicateAssetCandidate>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateAssetReport {
    pub generated_at: String,
    pub group_count: i64,
    pub candidate_count: i64,
    pub groups: Vec<DuplicateAssetGroup>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphNeighborhoodInput {
    pub kind: String,
    pub id: String,
    pub depth: Option<i64>,
    pub include_suggestions: Option<bool>,
    pub limit: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphNeighborhoodNode {
    pub kind: String,
    pub id: String,
    pub title: String,
    pub label: String,
    pub depth: i64,
    pub root: bool,
    pub asset_exists: bool,
    pub metadata_json: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphNeighborhoodEdge {
    pub from_kind: String,
    pub from_id: String,
    pub to_kind: String,
    pub to_id: String,
    pub relation: String,
    pub reason: String,
    pub score: f64,
    pub edge_kind: String,
    pub provenance: String,
    pub existing_relation: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphNeighborhoodPreview {
    pub generated_at: String,
    pub root_kind: String,
    pub root_id: String,
    pub depth: i64,
    pub node_count: i64,
    pub edge_count: i64,
    pub nodes: Vec<GraphNeighborhoodNode>,
    pub edges: Vec<GraphNeighborhoodEdge>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommandPaletteInput {
    pub query: Option<String>,
    pub category: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommandPaletteItem {
    pub id: String,
    pub title: String,
    pub category: String,
    pub description: String,
    pub keywords: Vec<String>,
    pub command_name: String,
    pub wrapper_name: String,
    pub execution_kind: String,
    pub required_input: Vec<String>,
    pub input_hint: String,
    pub risk: String,
    pub shortcut_hint: Option<String>,
    pub source_inspiration: String,
    pub priority: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommandPaletteManifest {
    pub generated_at: String,
    pub item_count: i64,
    pub categories: Vec<String>,
    pub items: Vec<CommandPaletteItem>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSuggestionInput {
    pub categories: Option<Vec<String>>,
    pub limit: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSuggestionItem {
    pub id: String,
    pub category: String,
    pub priority: String,
    pub priority_score: i64,
    pub subject: String,
    pub summary: String,
    pub reason: String,
    pub action_label: String,
    pub command_name: String,
    pub wrapper_name: String,
    pub input_json: String,
    pub target_kind: Option<String>,
    pub target_id: Option<String>,
    pub schedule_hint: String,
    pub source_inspiration: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AutomationSuggestionReport {
    pub generated_at: String,
    pub item_count: i64,
    pub critical_count: i64,
    pub high_count: i64,
    pub normal_count: i64,
    pub low_count: i64,
    pub items: Vec<AutomationSuggestionItem>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportDiagnosticsInput {
    pub folder_id: Option<String>,
    pub statuses: Option<Vec<String>>,
    pub include_ok: Option<bool>,
    pub limit: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportDiagnosticItem {
    pub id: String,
    pub folder_id: String,
    pub folder_name: String,
    pub folder_path: String,
    pub file_id: String,
    pub file_name: String,
    pub path: String,
    pub extension: Option<String>,
    pub descriptor_kind: String,
    pub read_status: String,
    pub index_status: String,
    pub severity: String,
    pub issue_kind: String,
    pub message: String,
    pub recovery_action: String,
    pub command_name: String,
    pub wrapper_name: String,
    pub input_json: String,
    pub source_id: Option<String>,
    pub indexed_at: String,
    pub last_error: Option<String>,
    pub metadata_json: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportFolderDiagnosticSummary {
    pub folder_id: String,
    pub folder_name: String,
    pub folder_path: String,
    pub last_scanned_at: Option<String>,
    pub total_files: i64,
    pub ok_count: i64,
    pub metadata_only_count: i64,
    pub partial_count: i64,
    pub failed_count: i64,
    pub missing_count: i64,
    pub stale_count: i64,
    pub warning_count: i64,
    pub critical_count: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportDiagnosticsLedger {
    pub generated_at: String,
    pub item_count: i64,
    pub folder_count: i64,
    pub ok_count: i64,
    pub warning_count: i64,
    pub critical_count: i64,
    pub folders: Vec<ImportFolderDiagnosticSummary>,
    pub items: Vec<ImportDiagnosticItem>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReportClaimRecord {
    pub id: String,
    pub report_id: String,
    pub claim_index: i64,
    pub claim_text: String,
    pub claim_status: String,
    pub citation_labels: Vec<String>,
    pub created_at: String,
}

#[derive(Clone, Debug)]
pub struct SaveReportClaimInput {
    pub claim_index: i64,
    pub claim_text: String,
    pub claim_status: String,
    pub citation_labels: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReportCitationRecord {
    pub id: String,
    pub report_id: String,
    pub citation_index: i64,
    pub target_kind: String,
    pub target_id: String,
    pub label: Option<String>,
    pub title: Option<String>,
    pub quote: Option<String>,
    pub excerpt: Option<String>,
    pub reason: Option<String>,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
    pub source_text_hash: Option<String>,
    pub span_start: Option<i64>,
    pub span_end: Option<i64>,
    pub locator_status: String,
    pub match_count: i64,
    pub created_at: String,
}

#[derive(Clone, Debug)]
pub struct SaveReportCitationInput {
    pub citation_index: i64,
    pub target_kind: String,
    pub target_id: String,
    pub label: Option<String>,
    pub title: Option<String>,
    pub quote: Option<String>,
    pub excerpt: Option<String>,
    pub reason: Option<String>,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
    pub source_text_hash: Option<String>,
    pub span_start: Option<i64>,
    pub span_end: Option<i64>,
    pub locator_status: String,
    pub match_count: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReportAuditCoverage {
    pub total_claims: i64,
    pub cited_claims: i64,
    pub inferred_claims: i64,
    pub unsupported_claims: i64,
    pub total_citations: i64,
    pub located_citations: i64,
    pub warning_citations: i64,
    pub missing_citations: i64,
    pub coverage_ratio: f64,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReportAuditRecord {
    pub report_id: String,
    pub claims: Vec<ReportClaimRecord>,
    pub citations: Vec<ReportCitationRecord>,
    pub coverage: ReportAuditCoverage,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InvestigationQaEvalInput {
    pub report_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InvestigationQaEvalCheck {
    pub name: String,
    pub status: String,
    pub score: f64,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InvestigationQaEvalCase {
    pub case_id: String,
    pub report_id: String,
    pub title: String,
    pub question: String,
    pub expected_citation_kinds: Vec<String>,
    pub unique_citation_targets: i64,
    pub status: String,
    pub score: f64,
    pub checks: Vec<InvestigationQaEvalCheck>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InvestigationQaEvalReport {
    pub generated_at: String,
    pub case_count: i64,
    pub pass_count: i64,
    pub warning_count: i64,
    pub fail_count: i64,
    pub average_score: f64,
    pub cases: Vec<InvestigationQaEvalCase>,
    pub warnings: Vec<String>,
    pub source_inspiration: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityScorecardItem {
    pub round: i64,
    pub source_inspiration: String,
    pub capability: String,
    pub status: String,
    pub boundary: String,
    pub impact_score: f64,
    pub risk_score: f64,
    pub readiness: String,
    pub command_names: Vec<String>,
    pub verification: String,
    pub next_step: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityScorecard {
    pub generated_at: String,
    pub item_count: i64,
    pub completed_count: i64,
    pub read_only_count: i64,
    pub write_count: i64,
    pub draft_count: i64,
    pub model_call_count: i64,
    pub average_impact_score: f64,
    pub average_risk_score: f64,
    pub items: Vec<CapabilityScorecardItem>,
    pub recommendations: Vec<String>,
    pub source_inspiration: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CitationQualityDashboard {
    pub generated_at: String,
    pub report_count: i64,
    pub audited_report_count: i64,
    pub total_claims: i64,
    pub cited_claims: i64,
    pub inferred_claims: i64,
    pub unsupported_claims: i64,
    pub total_citations: i64,
    pub located_citations: i64,
    pub warning_citations: i64,
    pub missing_citations: i64,
    pub stale_citations: i64,
    pub ambiguous_citations: i64,
    pub not_found_citations: i64,
    pub target_missing_citations: i64,
    pub not_applicable_citations: i64,
    pub coverage_ratio: f64,
    pub quality_score: f64,
    pub reports: Vec<CitationQualityReportRow>,
    pub problem_citations: Vec<CitationQualityProblemCitation>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CitationQualityReportRow {
    pub report_id: String,
    pub title: String,
    pub kind: String,
    pub created_at: String,
    pub total_claims: i64,
    pub cited_claims: i64,
    pub inferred_claims: i64,
    pub unsupported_claims: i64,
    pub total_citations: i64,
    pub located_citations: i64,
    pub warning_citations: i64,
    pub missing_citations: i64,
    pub coverage_ratio: f64,
    pub quality_score: f64,
    pub severity: String,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CitationQualityProblemCitation {
    pub report_id: String,
    pub report_title: String,
    pub citation_index: i64,
    pub label: Option<String>,
    pub title: Option<String>,
    pub target_kind: String,
    pub target_id: String,
    pub locator_status: String,
    pub reason: String,
    pub source_id: Option<String>,
    pub chunk_index: Option<i64>,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AiInvocationRecord {
    pub id: String,
    pub task_kind: String,
    pub model_profile_id: Option<String>,
    pub model_name: Option<String>,
    pub prompt_version: String,
    pub input_query: Option<String>,
    pub input_refs_json: String,
    pub context_manifest_json: String,
    pub output_ref_kind: Option<String>,
    pub output_ref_id: Option<String>,
    pub token_usage_json: Option<String>,
    pub warnings_json: String,
    pub created_at: String,
}

#[derive(Clone, Debug)]
pub struct SaveAiInvocationInput {
    pub task_kind: String,
    pub model_profile_id: Option<String>,
    pub model_name: Option<String>,
    pub prompt_version: String,
    pub input_query: Option<String>,
    pub input_refs_json: String,
    pub context_manifest_json: String,
    pub token_usage_json: Option<String>,
    pub warnings_json: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InvestigationContextItemRecord {
    pub id: String,
    pub invocation_id: String,
    pub target_kind: String,
    pub target_id: String,
    pub label: Option<String>,
    pub role: String,
    pub included: bool,
    pub truncated: bool,
    pub reason: Option<String>,
    pub char_count: Option<i64>,
    pub source_text_hash: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Debug)]
pub struct SaveInvestigationContextItemInput {
    pub invocation_id: String,
    pub target_kind: String,
    pub target_id: String,
    pub label: Option<String>,
    pub role: String,
    pub included: bool,
    pub truncated: bool,
    pub reason: Option<String>,
    pub char_count: Option<i64>,
    pub source_text_hash: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReportInvocationAudit {
    pub invocation: AiInvocationRecord,
    pub context_items: Vec<InvestigationContextItemRecord>,
    pub total: i64,
    pub included_count: i64,
    pub truncated_count: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub id: String,
    pub query: String,
    pub note: String,
    pub tags_json: String,
    pub source_ids_json: String,
    pub point_ids_json: String,
    pub evidence_ids_json: String,
    pub report_ids_json: String,
    pub created_report_id: Option<String>,
    pub source_kind: String,
    pub created_at: String,
    pub invalidated_at: Option<String>,
    pub invalidated_reason: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveJournalEntryInput {
    pub query: String,
    pub note: String,
    pub tags: Vec<String>,
    pub source_ids: Vec<String>,
    pub point_ids: Vec<String>,
    pub evidence_ids: Vec<String>,
    pub report_ids: Vec<String>,
    pub created_report_id: Option<String>,
    pub source_kind: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveQuickCaptureInput {
    pub content: String,
    pub tags: Vec<String>,
    pub source_kind: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ResolveQuickCaptureInput {
    pub id: String,
    pub target_kind: String,
    pub title: Option<String>,
    pub query: Option<String>,
    pub parent_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QuickCaptureItem {
    pub id: String,
    pub content: String,
    pub tags: Vec<String>,
    pub source_kind: String,
    pub status: String,
    pub resolved_kind: Option<String>,
    pub resolved_id: Option<String>,
    pub resolved_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QuickCaptureResolution {
    pub item: QuickCaptureItem,
    pub journal: Option<JournalEntry>,
    pub point: Option<StoredPoint>,
    pub source: Option<SourceDocumentRecord>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AssetRelationRecord {
    pub id: String,
    pub from_kind: String,
    pub from_id: String,
    pub to_kind: String,
    pub to_id: String,
    pub relation: String,
    pub reason: String,
    pub score: f64,
    pub source_kind: String,
    pub created_at: String,
    pub vetted_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveAssetRelationInput {
    pub from_kind: String,
    pub from_id: String,
    pub to_kind: String,
    pub to_id: String,
    pub relation: String,
    pub reason: String,
    pub score: f64,
    pub source_kind: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReviewItem {
    pub id: String,
    pub target_kind: String,
    pub target_id: String,
    pub title: String,
    pub note: Option<String>,
    pub status: String,
    pub priority: String,
    pub due_at: String,
    pub last_reviewed_at: Option<String>,
    pub review_count: i64,
    pub ease: Option<f64>,
    pub interval_days: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AddReviewItemInput {
    pub target_kind: String,
    pub target_id: String,
    pub title: String,
    pub note: Option<String>,
    pub priority: Option<String>,
    pub due_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReviewQueuePlanInput {
    pub mode: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReviewQueuePlan {
    pub now: String,
    pub mode: String,
    pub limit: i64,
    pub candidate_count: i64,
    pub due_count: i64,
    pub overdue_count: i64,
    pub future_count: i64,
    pub dismissed_count: i64,
    pub overflow_count: i64,
    pub items: Vec<ReviewQueuePlanItem>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReviewQueuePlanItem {
    pub item: ReviewItem,
    pub position: i64,
    pub priority_rank: i64,
    pub days_overdue: i64,
    pub reason: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OpenDataMirrorConfig {
    pub enabled: bool,
    pub root_path: Option<String>,
    pub export_sources: bool,
    pub export_evidence: bool,
    pub export_reports: bool,
    pub export_journal: bool,
    pub export_gallery_index: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IndexedFolder {
    pub id: String,
    pub path: String,
    pub name: String,
    pub enabled: bool,
    pub last_scanned_at: Option<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IndexedFile {
    pub id: String,
    pub folder_id: String,
    pub path: String,
    pub canonical_path: Option<String>,
    pub name: String,
    pub extension: Option<String>,
    pub size_bytes: Option<i64>,
    pub modified_at: Option<String>,
    pub source_id: Option<String>,
    pub indexed_at: String,
    pub descriptor_kind: String,
    pub read_status: String,
    pub index_status: String,
    pub metadata_json: String,
    pub preview_text: Option<String>,
    pub text_hash: Option<String>,
    pub extracted_chars: Option<i64>,
    pub total_chars: Option<i64>,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug)]
pub struct UpsertIndexedFileInput {
    pub folder_id: String,
    pub path: String,
    pub canonical_path: Option<String>,
    pub name: String,
    pub extension: Option<String>,
    pub size_bytes: Option<i64>,
    pub modified_at: Option<String>,
    pub source_id: Option<String>,
    pub descriptor_kind: String,
    pub read_status: String,
    pub index_status: String,
    pub metadata_json: String,
    pub preview_text: Option<String>,
    pub text_hash: Option<String>,
    pub extracted_chars: Option<i64>,
    pub total_chars: Option<i64>,
    pub last_error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IndexedFolderScanResult {
    pub folder: IndexedFolder,
    pub files: Vec<IndexedFile>,
    pub indexed_count: i64,
    pub metadata_only_count: i64,
}

/// Resolve the SQLite file path inside the app data dir, creating the dir if needed.
pub fn db_path(app: &AppHandle<Wry>) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .context("failed to resolve app data dir")?;
    fs::create_dir_all(&dir).context("failed to create app data dir")?;
    Ok(dir.join(DB_FILE))
}

/// Open a connection to the library DB and ensure the schema is up to date.
pub fn open_db(path: &Path) -> Result<Connection> {
    prepare_schema_migration_backup(path)?;
    let conn = Connection::open(path).context("failed to open library DB")?;
    init_db(&conn)?;
    conn.pragma_update(None, "user_version", 1_i64)
        .context("failed to record database schema version")?;
    Ok(conn)
}

fn prepare_schema_migration_backup(path: &Path) -> Result<()> {
    if !path.exists() || fs::metadata(path).map(|meta| meta.len()).unwrap_or_default() == 0 {
        return Ok(());
    }
    let conn = Connection::open(path).context("failed to inspect library DB before migration")?;
    let version: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    let integrity: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    drop(conn);
    if integrity != "ok" {
        anyhow::bail!("database integrity check failed before migration: {integrity}");
    }
    if version >= 1 {
        return Ok(());
    }
    let backup = path.with_extension("pre-semantic-v1.db");
    if !backup.exists() {
        fs::copy(path, &backup).context("failed to create pre-migration database backup")?;
        crate::semantic::storage::validate_database(&backup)
            .context("pre-migration database backup failed validation")?;
    }
    Ok(())
}

/// Create / migrate the MVP schema (idempotent).
///
/// Sticks with Step 6's inline-init pattern (no migrations framework). For older
/// DBs the `parent_id` column is added lazily via `ALTER TABLE`, guarded by a
/// `PRAGMA table_info` check so the call stays idempotent.
pub fn init_db(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS points (
            id              TEXT PRIMARY KEY,
            content         TEXT NOT NULL,
            tag_type        TEXT,
            parent_id       TEXT,
            source_doc_name TEXT,
            source_excerpt  TEXT,
            created_at      TEXT NOT NULL
        )",
        [],
    )
    .context("failed to create points table")?;

    crate::semantic::storage::init_schema(conn)?;

    if !column_exists(conn, "points", "parent_id")? {
        conn.execute("ALTER TABLE points ADD COLUMN parent_id TEXT", [])
            .context("failed to add parent_id column")?;
    }

    if !column_exists(conn, "points", "archived")? {
        conn.execute(
            "ALTER TABLE points ADD COLUMN archived INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .context("failed to add archived column")?;
    }

    if !column_exists(conn, "points", "starred")? {
        conn.execute(
            "ALTER TABLE points ADD COLUMN starred INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .context("failed to add starred column")?;
    }

    if !column_exists(conn, "points", "source_excerpt")? {
        conn.execute("ALTER TABLE points ADD COLUMN source_excerpt TEXT", [])
            .context("failed to add source_excerpt column")?;
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS explore_actions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            point_id     TEXT NOT NULL,
            action_type  TEXT NOT NULL,
            detail       TEXT,
            created_at   TEXT NOT NULL
        )",
        [],
    )
    .context("failed to create explore_actions table")?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_points_parent ON points(parent_id)",
        [],
    )
    .context("failed to create parent index")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS source_documents (
            id             TEXT PRIMARY KEY,
            kind           TEXT NOT NULL,
            title          TEXT,
            canonical_uri  TEXT NOT NULL,
            metadata_json  TEXT NOT NULL,
            created_at     TEXT NOT NULL,
            updated_at     TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_source_documents_kind_uri
            ON source_documents(kind, canonical_uri);
        CREATE TABLE IF NOT EXISTS source_chunks (
            id             TEXT PRIMARY KEY,
            source_id      TEXT NOT NULL,
            chunk_index    INTEGER NOT NULL,
            heading_path   TEXT,
            text           TEXT NOT NULL,
            created_at     TEXT NOT NULL,
            FOREIGN KEY(source_id) REFERENCES source_documents(id)
        );
        CREATE INDEX IF NOT EXISTS idx_source_chunks_source
            ON source_chunks(source_id, chunk_index);
        CREATE TABLE IF NOT EXISTS point_source_links (
            point_id      TEXT PRIMARY KEY,
            source_id     TEXT NOT NULL,
            chunk_index   INTEGER NOT NULL,
            anchor_text   TEXT,
            created_at    TEXT NOT NULL,
            FOREIGN KEY(point_id) REFERENCES points(id),
            FOREIGN KEY(source_id) REFERENCES source_documents(id)
        );
        CREATE INDEX IF NOT EXISTS idx_point_source_links_source
            ON point_source_links(source_id, chunk_index);",
    )
    .context("failed to create source tables")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS evidence_records (
            id             TEXT PRIMARY KEY,
            claim          TEXT NOT NULL,
            verdict        TEXT NOT NULL CHECK (verdict IN ('supported', 'contradicted', 'mixed', 'uncertain')),
            answer         TEXT NOT NULL,
            reasoning      TEXT,
            context        TEXT,
            point_id       TEXT,
            source_id      TEXT,
            chunk_index    INTEGER,
            checked_at     TEXT NOT NULL,
            created_at     TEXT NOT NULL,
            FOREIGN KEY(point_id) REFERENCES points(id) ON DELETE SET NULL,
            FOREIGN KEY(source_id) REFERENCES source_documents(id)
        );
        CREATE INDEX IF NOT EXISTS idx_evidence_records_point
            ON evidence_records(point_id);
        CREATE INDEX IF NOT EXISTS idx_evidence_records_source
            ON evidence_records(source_id, chunk_index);
        CREATE INDEX IF NOT EXISTS idx_evidence_records_checked_at
            ON evidence_records(checked_at DESC);
        CREATE TABLE IF NOT EXISTS evidence_sources (
            id             TEXT PRIMARY KEY,
            evidence_id    TEXT NOT NULL,
            title          TEXT,
            url            TEXT NOT NULL,
            snippet        TEXT,
            stance         TEXT NOT NULL CHECK (stance IN ('support', 'contradict', 'context', 'unknown')),
            created_at     TEXT NOT NULL,
            FOREIGN KEY(evidence_id) REFERENCES evidence_records(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_evidence_sources_evidence
            ON evidence_sources(evidence_id);",
    )
    .context("failed to create evidence tables")?;

    // FTS5 virtual table for full-text search over point content
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS points_fts
             USING fts5(id UNINDEXED, content, tokenize='trigram');

         -- Keep FTS in sync with the main table
         CREATE TRIGGER IF NOT EXISTS points_fts_insert
             AFTER INSERT ON points BEGIN
                 INSERT INTO points_fts(id, content) VALUES (new.id, new.content);
             END;
         CREATE TRIGGER IF NOT EXISTS points_fts_update
             AFTER UPDATE ON points BEGIN
                 UPDATE points_fts SET content = new.content WHERE id = old.id;
             END;
         CREATE TRIGGER IF NOT EXISTS points_fts_delete
             AFTER DELETE ON points BEGIN
                 DELETE FROM points_fts WHERE id = old.id;
             END;",
    )
    .context("failed to create FTS5 table/triggers")?;

    // Backfill FTS for rows that pre-date the virtual table
    conn.execute(
        "INSERT OR IGNORE INTO points_fts(id, content)
         SELECT id, content FROM points
         WHERE id NOT IN (SELECT id FROM points_fts)",
        [],
    )
    .context("failed to backfill FTS5")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS gallery (
            id              TEXT PRIMARY KEY,
            file_path       TEXT NOT NULL,
            thumbnail_path  TEXT NOT NULL,
            prompt          TEXT NOT NULL,
            generated_at    TEXT NOT NULL,
            download_status TEXT NOT NULL DEFAULT 'ok',
            point_ids       TEXT NOT NULL DEFAULT '[]',
            source_points   TEXT NOT NULL DEFAULT '[]'
        );",
    )
    .context("failed to create gallery table")?;

    if !column_exists(conn, "gallery", "source_points")? {
        conn.execute(
            "ALTER TABLE gallery ADD COLUMN source_points TEXT NOT NULL DEFAULT '[]'",
            [],
        )
        .context("failed to add source_points column to gallery")?;
    }

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS suggestions (
            id          TEXT PRIMARY KEY,
            date        TEXT NOT NULL,
            body_md     TEXT NOT NULL,
            summary     TEXT NOT NULL,
            created_at  TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_suggestions_date ON suggestions(date);
        CREATE INDEX IF NOT EXISTS idx_suggestions_created_at ON suggestions(created_at DESC);",
    )
    .context("failed to create suggestions table")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS reports (
            id              TEXT PRIMARY KEY,
            title           TEXT NOT NULL,
            kind            TEXT NOT NULL CHECK (kind IN ('digest', 'synthesis', 'investigation')),
            source_name     TEXT,
            body_md         TEXT NOT NULL,
            summary         TEXT NOT NULL,
            citations_json  TEXT NOT NULL,
            created_at      TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reports_kind
            ON reports(kind);
        CREATE INDEX IF NOT EXISTS idx_reports_created_at
            ON reports(created_at DESC);",
    )
    .context("failed to create reports table")?;
    migrate_reports_allow_investigation(conn)?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS saved_asset_searches (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL UNIQUE,
            query           TEXT NOT NULL,
            kinds_json      TEXT NOT NULL,
            filter          TEXT,
            limit_value     INTEGER NOT NULL,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_saved_asset_searches_updated_at
            ON saved_asset_searches(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_saved_asset_searches_name
            ON saved_asset_searches(name);",
    )
    .context("failed to create saved asset searches table")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS retrieval_profiles (
            id                  TEXT PRIMARY KEY,
            name                TEXT NOT NULL UNIQUE,
            description         TEXT,
            query               TEXT NOT NULL,
            kinds_json          TEXT NOT NULL,
            filter              TEXT,
            saved_search_id     TEXT,
            limit_value         INTEGER NOT NULL,
            max_chars_per_item  INTEGER NOT NULL,
            min_score           REAL NOT NULL DEFAULT 0.0,
            mode                TEXT NOT NULL CHECK (mode IN ('automatic', 'query', 'chat')),
            created_at          TEXT NOT NULL,
            updated_at          TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_retrieval_profiles_updated_at
            ON retrieval_profiles(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_retrieval_profiles_name
            ON retrieval_profiles(name);
        CREATE INDEX IF NOT EXISTS idx_retrieval_profiles_saved_search
            ON retrieval_profiles(saved_search_id);",
    )
    .context("failed to create retrieval profiles table")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS report_citations (
            id                  TEXT PRIMARY KEY,
            report_id           TEXT NOT NULL,
            citation_index      INTEGER NOT NULL,
            target_kind         TEXT NOT NULL CHECK (target_kind IN ('source', 'point', 'evidence')),
            target_id           TEXT NOT NULL,
            label               TEXT,
            title               TEXT,
            quote               TEXT,
            excerpt             TEXT,
            reason              TEXT,
            source_id           TEXT,
            chunk_index         INTEGER,
            source_text_hash    TEXT,
            span_start          INTEGER,
            span_end            INTEGER,
            locator_status      TEXT NOT NULL CHECK (locator_status IN ('located', 'multiple_matches', 'not_found', 'stale', 'target_missing', 'not_applicable')),
            match_count         INTEGER NOT NULL DEFAULT 0,
            created_at          TEXT NOT NULL,
            FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_report_citations_report
            ON report_citations(report_id, citation_index);
        CREATE INDEX IF NOT EXISTS idx_report_citations_target
            ON report_citations(target_kind, target_id);
        CREATE INDEX IF NOT EXISTS idx_report_citations_status
            ON report_citations(locator_status);
        CREATE TABLE IF NOT EXISTS report_claims (
            id                      TEXT PRIMARY KEY,
            report_id               TEXT NOT NULL,
            claim_index             INTEGER NOT NULL,
            claim_text              TEXT NOT NULL,
            claim_status            TEXT NOT NULL CHECK (claim_status IN ('cited', 'inferred', 'unsupported')),
            citation_labels_json    TEXT NOT NULL,
            created_at              TEXT NOT NULL,
            FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_report_claims_report
            ON report_claims(report_id, claim_index);
        CREATE INDEX IF NOT EXISTS idx_report_claims_status
            ON report_claims(claim_status);",
    )
    .context("failed to create report audit tables")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS ai_invocations (
            id                      TEXT PRIMARY KEY,
            task_kind               TEXT NOT NULL,
            model_profile_id        TEXT,
            model_name              TEXT,
            prompt_version          TEXT NOT NULL,
            input_query             TEXT,
            input_refs_json         TEXT NOT NULL,
            context_manifest_json   TEXT NOT NULL,
            output_ref_kind         TEXT,
            output_ref_id           TEXT,
            token_usage_json        TEXT,
            warnings_json           TEXT NOT NULL,
            created_at              TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ai_invocations_task_created
            ON ai_invocations(task_kind, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_invocations_output
            ON ai_invocations(output_ref_kind, output_ref_id);
        CREATE TABLE IF NOT EXISTS investigation_context_items (
            id                  TEXT PRIMARY KEY,
            invocation_id       TEXT NOT NULL,
            target_kind         TEXT NOT NULL,
            target_id           TEXT NOT NULL,
            label               TEXT,
            role                TEXT NOT NULL,
            included            INTEGER NOT NULL,
            truncated           INTEGER NOT NULL,
            reason              TEXT,
            char_count          INTEGER,
            source_text_hash    TEXT,
            created_at          TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_investigation_context_items_invocation
            ON investigation_context_items(invocation_id);
        CREATE INDEX IF NOT EXISTS idx_investigation_context_items_target
            ON investigation_context_items(target_kind, target_id);",
    )
    .context("failed to create AI invocation audit tables")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS journal_entries (
            id                  TEXT PRIMARY KEY,
            query               TEXT NOT NULL,
            note                TEXT NOT NULL,
            tags_json           TEXT NOT NULL,
            source_ids_json     TEXT NOT NULL,
            point_ids_json      TEXT NOT NULL,
            evidence_ids_json   TEXT NOT NULL,
            report_ids_json     TEXT NOT NULL,
            created_report_id   TEXT,
            source_kind         TEXT NOT NULL,
            created_at          TEXT NOT NULL,
            invalidated_at      TEXT,
            invalidated_reason  TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_journal_entries_created_at
            ON journal_entries(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_journal_entries_invalidated_at
            ON journal_entries(invalidated_at);",
    )
    .context("failed to create journal entries table")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS quick_capture_items (
            id              TEXT PRIMARY KEY,
            content         TEXT NOT NULL,
            tags_json       TEXT NOT NULL,
            source_kind     TEXT NOT NULL,
            status          TEXT NOT NULL CHECK (status IN ('inbox', 'resolved', 'dismissed')),
            resolved_kind   TEXT,
            resolved_id     TEXT,
            resolved_at     TEXT,
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_quick_capture_items_status_updated
            ON quick_capture_items(status, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_quick_capture_items_resolved
            ON quick_capture_items(resolved_kind, resolved_id);",
    )
    .context("failed to create quick capture items table")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS asset_relations (
            id              TEXT PRIMARY KEY,
            from_kind       TEXT NOT NULL,
            from_id         TEXT NOT NULL,
            to_kind         TEXT NOT NULL,
            to_id           TEXT NOT NULL,
            relation        TEXT NOT NULL,
            reason          TEXT NOT NULL,
            score           REAL NOT NULL,
            source_kind     TEXT NOT NULL,
            created_at      TEXT NOT NULL,
            vetted_at       TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_asset_relations_from
            ON asset_relations(from_kind, from_id);
        CREATE INDEX IF NOT EXISTS idx_asset_relations_to
            ON asset_relations(to_kind, to_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_relations_unique
            ON asset_relations(from_kind, from_id, to_kind, to_id, relation, source_kind);",
    )
    .context("failed to create asset relations table")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS review_items (
            id                  TEXT PRIMARY KEY,
            target_kind         TEXT NOT NULL,
            target_id           TEXT NOT NULL,
            title               TEXT NOT NULL,
            note                TEXT,
            status              TEXT NOT NULL,
            priority            TEXT NOT NULL,
            due_at              TEXT NOT NULL,
            last_reviewed_at    TEXT,
            review_count        INTEGER NOT NULL DEFAULT 0,
            ease                REAL,
            interval_days       INTEGER,
            created_at          TEXT NOT NULL,
            updated_at          TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_review_items_due
            ON review_items(status, due_at);
        CREATE INDEX IF NOT EXISTS idx_review_items_target
            ON review_items(target_kind, target_id);",
    )
    .context("failed to create review items table")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS open_data_mirror_config (
            id                      INTEGER PRIMARY KEY CHECK (id = 1),
            enabled                 INTEGER NOT NULL,
            root_path               TEXT,
            export_sources          INTEGER NOT NULL,
            export_evidence         INTEGER NOT NULL,
            export_reports          INTEGER NOT NULL,
            export_journal          INTEGER NOT NULL,
            export_gallery_index    INTEGER NOT NULL,
            updated_at              TEXT NOT NULL
        );",
    )
    .context("failed to create open data mirror config table")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS indexed_folders (
            id              TEXT PRIMARY KEY,
            path            TEXT NOT NULL UNIQUE,
            name            TEXT NOT NULL,
            enabled         INTEGER NOT NULL,
            last_scanned_at TEXT,
            created_at      TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS indexed_files (
            id              TEXT PRIMARY KEY,
            folder_id       TEXT NOT NULL,
            path            TEXT NOT NULL UNIQUE,
            name            TEXT NOT NULL,
            extension       TEXT,
            size_bytes      INTEGER,
            modified_at     TEXT,
            source_id       TEXT,
            indexed_at      TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_indexed_files_folder
            ON indexed_files(folder_id);",
    )
    .context("failed to create indexed folder tables")?;
    migrate_indexed_file_descriptor_columns(conn)?;

    Ok(())
}

fn migrate_indexed_file_descriptor_columns(conn: &Connection) -> Result<()> {
    let columns = [
        ("canonical_path", "TEXT"),
        ("descriptor_kind", "TEXT NOT NULL DEFAULT 'unsupported'"),
        ("read_status", "TEXT NOT NULL DEFAULT 'ok'"),
        ("index_status", "TEXT NOT NULL DEFAULT 'indexed'"),
        ("metadata_json", "TEXT NOT NULL DEFAULT '{}'"),
        ("preview_text", "TEXT"),
        ("text_hash", "TEXT"),
        ("extracted_chars", "INTEGER"),
        ("total_chars", "INTEGER"),
        ("last_error", "TEXT"),
    ];
    for (column, definition) in columns {
        if !column_exists(conn, "indexed_files", column)? {
            conn.execute(
                &format!("ALTER TABLE indexed_files ADD COLUMN {column} {definition}"),
                [],
            )
            .with_context(|| format!("failed to add indexed_files.{column}"))?;
        }
    }
    conn.execute(
        "UPDATE indexed_files
         SET index_status = 'metadata_only'
         WHERE source_id IS NULL AND index_status = 'indexed'",
        [],
    )
    .context("failed to backfill indexed file index status")?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_indexed_files_status
            ON indexed_files(folder_id, read_status, index_status)",
        [],
    )
    .context("failed to create indexed file status index")?;
    Ok(())
}

fn migrate_reports_allow_investigation(conn: &Connection) -> Result<()> {
    let sql: Option<String> = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reports'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    let Some(sql) = sql else {
        return Ok(());
    };
    if sql.contains("'investigation'") {
        return Ok(());
    }

    conn.execute_batch(
        "ALTER TABLE reports RENAME TO reports_old;
        CREATE TABLE reports (
            id              TEXT PRIMARY KEY,
            title           TEXT NOT NULL,
            kind            TEXT NOT NULL CHECK (kind IN ('digest', 'synthesis', 'investigation')),
            source_name     TEXT,
            body_md         TEXT NOT NULL,
            summary         TEXT NOT NULL,
            citations_json  TEXT NOT NULL,
            created_at      TEXT NOT NULL
        );
        INSERT INTO reports (id, title, kind, source_name, body_md, summary, citations_json, created_at)
            SELECT id, title, kind, source_name, body_md, summary, citations_json, created_at
            FROM reports_old;
        DROP TABLE reports_old;
        CREATE INDEX IF NOT EXISTS idx_reports_kind
            ON reports(kind);
        CREATE INDEX IF NOT EXISTS idx_reports_created_at
            ON reports(created_at DESC);",
    )
    .context("failed to migrate reports table for investigation kind")?;
    Ok(())
}

/// Whether a column already exists on a table (used for idempotent migration).
fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

pub fn upsert_source_document(
    conn: &Connection,
    kind: &str,
    canonical_uri: &str,
    title: Option<&str>,
    metadata_json: &str,
) -> Result<SourceDocumentRecord> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut existing = conn.prepare(
        "SELECT id, kind, title, canonical_uri, metadata_json, created_at, updated_at
         FROM source_documents
         WHERE kind = ?1 AND canonical_uri = ?2",
    )?;
    let mut rows = existing.query(params![kind, canonical_uri])?;
    if let Some(row) = rows.next()? {
        let id: String = row.get(0)?;
        let created_at: String = row.get(5)?;
        conn.execute(
            "UPDATE source_documents
             SET title = ?1, metadata_json = ?2, updated_at = ?3
             WHERE id = ?4",
            params![title, metadata_json, now, id],
        )?;
        return Ok(SourceDocumentRecord {
            id,
            kind: kind.to_string(),
            title: title.map(str::to_string),
            canonical_uri: canonical_uri.to_string(),
            metadata_json: metadata_json.to_string(),
            created_at,
            updated_at: now,
        });
    }

    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO source_documents (id, kind, title, canonical_uri, metadata_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, kind, title, canonical_uri, metadata_json, now, now],
    )?;

    Ok(SourceDocumentRecord {
        id,
        kind: kind.to_string(),
        title: title.map(str::to_string),
        canonical_uri: canonical_uri.to_string(),
        metadata_json: metadata_json.to_string(),
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn replace_source_chunks(
    conn: &mut Connection,
    source_id: &str,
    chunks: &[String],
) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.transaction()?;
    tx.execute(
        "DELETE FROM source_chunks WHERE source_id = ?1",
        params![source_id],
    )?;
    for (index, chunk) in chunks.iter().enumerate() {
        tx.execute(
            "INSERT INTO source_chunks (id, source_id, chunk_index, heading_path, text, created_at)
             VALUES (?1, ?2, ?3, NULL, ?4, ?5)",
            params![
                uuid::Uuid::new_v4().to_string(),
                source_id,
                index as i64,
                chunk,
                now
            ],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub fn insert_point_source_link(
    conn: &Connection,
    point_id: &str,
    source_id: &str,
    chunk_index: i64,
    anchor_text: Option<&str>,
) -> Result<PointSourceLink> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM source_documents WHERE id = ?1)",
        params![source_id],
        |row| row.get(0),
    )?;
    if !exists {
        anyhow::bail!("source document not found: {source_id}");
    }

    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO point_source_links (point_id, source_id, chunk_index, anchor_text, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![point_id, source_id, chunk_index, anchor_text, now],
    )?;

    Ok(PointSourceLink {
        point_id: point_id.to_string(),
        source_id: source_id.to_string(),
        chunk_index,
        anchor_text: anchor_text.map(str::to_string),
        created_at: now,
    })
}

fn source_summary_by_id(conn: &Connection, source_id: &str) -> Result<Option<SourceSummaryRecord>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.kind, s.title, s.canonical_uri, s.metadata_json, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM source_chunks c WHERE c.source_id = s.id) AS chunk_count,
                (SELECT COUNT(*) FROM point_source_links l WHERE l.source_id = s.id) AS point_count,
                (SELECT COUNT(*)
                 FROM point_source_links l
                 JOIN points p ON p.id = l.point_id
                 WHERE l.source_id = s.id AND p.starred = 1) AS star_count
         FROM source_documents s
         WHERE s.id = ?1",
    )?;
    let mut rows = stmt.query(params![source_id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(map_source_summary_row(row)?))
    } else {
        Ok(None)
    }
}

fn list_source_chunks(conn: &Connection, source_id: &str) -> Result<Vec<SourceChunkRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, source_id, chunk_index, heading_path, text, created_at
         FROM source_chunks
         WHERE source_id = ?1
         ORDER BY chunk_index",
    )?;
    let rows = stmt.query_map(params![source_id], map_source_chunk_row)?;
    let mut chunks = Vec::new();
    for row in rows {
        chunks.push(row?);
    }
    Ok(chunks)
}

pub fn get_source_workspace(
    conn: &Connection,
    source_id: &str,
) -> Result<Option<SourceWorkspaceRecord>> {
    let Some(source) = source_summary_by_id(conn, source_id)? else {
        return Ok(None);
    };
    let chunks = list_source_chunks(conn, source_id)?;
    Ok(Some(SourceWorkspaceRecord { source, chunks }))
}

pub fn get_source_assets(conn: &Connection, source_id: &str) -> Result<Option<SourceAssetsRecord>> {
    let Some(source) = source_summary_by_id(conn, source_id)? else {
        return Ok(None);
    };
    Ok(Some(SourceAssetsRecord {
        points: list_points_for_source(conn, source_id, 80)?,
        evidence: list_evidence_for_source(conn, source_id)?,
        reports: list_reports_for_source(conn, source_id, 80)?,
        gallery: list_gallery_for_source(conn, source_id, 80)?,
        source,
    }))
}

pub fn get_source_workspace_summary(
    conn: &Connection,
    source_id: &str,
) -> Result<Option<SourceSummaryRecord>> {
    source_summary_by_id(conn, source_id)
}

pub fn list_recent_sources(conn: &Connection, limit: usize) -> Result<Vec<SourceSummaryRecord>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.kind, s.title, s.canonical_uri, s.metadata_json, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM source_chunks c WHERE c.source_id = s.id) AS chunk_count,
                (SELECT COUNT(*) FROM point_source_links l WHERE l.source_id = s.id) AS point_count,
                (SELECT COUNT(*)
                 FROM point_source_links l
                 JOIN points p ON p.id = l.point_id
                 WHERE l.source_id = s.id AND p.starred = 1) AS star_count
         FROM source_documents s
         ORDER BY s.updated_at DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit as i64], map_source_summary_row)?;
    let mut sources = Vec::new();
    for row in rows {
        sources.push(row?);
    }
    Ok(sources)
}

pub fn get_point_source_context(
    conn: &Connection,
    point_id: &str,
) -> Result<Option<PointSourceContext>> {
    let mut stmt = conn.prepare(
        "SELECT source_id, chunk_index, anchor_text
         FROM point_source_links
         WHERE point_id = ?1",
    )?;
    let mut rows = stmt.query(params![point_id])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };

    let source_id: String = row.get(0)?;
    let chunk_index: i64 = row.get(1)?;
    let anchor_text: Option<String> = row.get(2)?;
    let Some(source) = source_summary_by_id(conn, &source_id)? else {
        return Ok(None);
    };
    let chunks = list_source_chunks(conn, &source_id)?;

    Ok(Some(PointSourceContext {
        point_id: point_id.to_string(),
        source,
        chunk_index,
        anchor_text,
        chunks,
    }))
}

fn point_source_location(conn: &Connection, point_id: &str) -> Result<Option<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT source_id, chunk_index
         FROM point_source_links
         WHERE point_id = ?1",
    )?;
    let mut rows = stmt.query(params![point_id])?;
    if let Some(row) = rows.next()? {
        Ok(Some((row.get(0)?, row.get(1)?)))
    } else {
        Ok(None)
    }
}

pub fn search_workspace(
    conn: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<WorkspaceSearchResult>> {
    let trimmed = query.trim();
    if trimmed.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    let pattern = format!("%{}%", escape_like(trimmed));
    let source_limit = (limit / 2).max(5);
    let point_limit = limit.saturating_sub(source_limit).max(5);
    let mut results = Vec::new();

    let mut source_stmt = conn.prepare(
        "SELECT s.id, s.title, s.canonical_uri
         FROM source_documents s
         WHERE s.title LIKE ?1 ESCAPE '\\'
            OR s.canonical_uri LIKE ?1 ESCAPE '\\'
            OR s.metadata_json LIKE ?1 ESCAPE '\\'
         ORDER BY s.updated_at DESC
         LIMIT ?2",
    )?;
    let source_rows = source_stmt.query_map(params![pattern, source_limit as i64], |row| {
        let id: String = row.get(0)?;
        let title: Option<String> = row.get(1)?;
        let canonical_uri: String = row.get(2)?;
        Ok(WorkspaceSearchResult {
            kind: "source".to_string(),
            id,
            title: title
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| canonical_uri.clone()),
            snippet: canonical_uri,
            source_id: None,
            chunk_index: None,
        })
    })?;
    for row in source_rows {
        results.push(row?);
    }

    for point in search_points(conn, trimmed, point_limit)? {
        let location = point_source_location(conn, &point.id)?;
        results.push(WorkspaceSearchResult {
            kind: "point".to_string(),
            id: point.id,
            title: point
                .source_doc_name
                .unwrap_or_else(|| point.tag_type.unwrap_or_else(|| "观点".to_string())),
            snippet: point.content,
            source_id: location.as_ref().map(|(source_id, _)| source_id.clone()),
            chunk_index: location.map(|(_, chunk_index)| chunk_index),
        });
    }

    results.truncate(limit);
    Ok(results)
}

pub fn search_assets(
    conn: &Connection,
    input: SearchAssetsInput,
) -> Result<Vec<SearchAssetResult>> {
    let query = input.query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let limit = normalize_search_assets_limit(input.limit);
    let filter = parse_search_asset_filter(input.filter.as_deref())?;
    let allowed_kinds = search_asset_allowed_kinds(input.kinds.as_deref(), filter.as_ref());
    if allowed_kinds.is_empty() {
        return Ok(Vec::new());
    }

    let mut results = Vec::new();
    if allowed_kinds.contains("source") || allowed_kinds.contains("point") {
        for item in search_workspace(conn, query, limit.saturating_mul(2))? {
            if allowed_kinds.contains(item.kind.as_str()) {
                let score = if item.kind == "source" { 0.95 } else { 0.9 };
                results.push(SearchAssetResult {
                    kind: item.kind.clone(),
                    id: item.id,
                    title: item.title,
                    snippet: item.snippet.clone(),
                    preview: Some(compact_preview(&item.snippet, 240)),
                    reason: if item.kind == "source" {
                        "Matched Source title, URI, or metadata".to_string()
                    } else {
                        "Matched Point content or source context".to_string()
                    },
                    score,
                    source_id: item.source_id,
                    chunk_index: item.chunk_index,
                    metadata_json: "{}".to_string(),
                });
            }
        }
    }

    if allowed_kinds.contains("evidence") {
        for evidence in search_evidence(conn, query, limit)? {
            let snippet_source = first_non_empty([
                Some(evidence.answer.as_str()),
                evidence.reasoning.as_deref(),
                evidence.context.as_deref(),
            ])
            .unwrap_or(evidence.claim.as_str());
            let snippet = compact_preview(snippet_source, 240);
            let preview = compact_preview(snippet_source, 360);
            results.push(SearchAssetResult {
                kind: "evidence".to_string(),
                id: evidence.id,
                title: evidence.claim,
                snippet,
                preview: Some(preview),
                reason: "Matched Evidence claim, answer, reasoning, context, or source".to_string(),
                score: 0.82,
                source_id: evidence.source_id,
                chunk_index: evidence.chunk_index,
                metadata_json: serde_json::json!({ "verdict": evidence.verdict }).to_string(),
            });
        }
    }

    if allowed_kinds.contains("report") {
        for report in search_reports(conn, query, limit)? {
            if matches!(filter, Some(SearchAssetFilter::ReportKind(ref kind)) if report.kind != *kind)
            {
                continue;
            }
            results.push(SearchAssetResult {
                kind: "report".to_string(),
                id: report.id,
                title: report.title,
                snippet: compact_preview(&report.summary, 240),
                preview: Some(compact_preview(&report.body_md, 420)),
                reason: "Matched Report title, kind, source name, body, summary, or citations"
                    .to_string(),
                score: if report.kind == "investigation" {
                    0.86
                } else {
                    0.8
                },
                source_id: None,
                chunk_index: None,
                metadata_json: serde_json::json!({ "reportKind": report.kind }).to_string(),
            });
        }
    }

    if allowed_kinds.contains("journal") {
        for entry in search_journal_entries(conn, query, limit)? {
            results.push(SearchAssetResult {
                kind: "journal".to_string(),
                id: entry.id,
                title: entry.query,
                snippet: compact_preview(&entry.note, 240),
                preview: Some(compact_preview(&entry.note, 360)),
                reason: "Matched Journal query, note, tags, or linked asset ids".to_string(),
                score: 0.76,
                source_id: None,
                chunk_index: None,
                metadata_json: serde_json::json!({ "sourceKind": entry.source_kind }).to_string(),
            });
        }
    }

    if allowed_kinds.contains("gallery") {
        for item in search_gallery(conn, query, limit)? {
            let linked_preview = item
                .source_points
                .iter()
                .map(|point| point.content.as_str())
                .collect::<Vec<_>>()
                .join(" · ");
            results.push(SearchAssetResult {
                kind: "gallery".to_string(),
                id: item.id,
                title: compact_preview(&item.prompt, 120),
                snippet: compact_preview(
                    first_non_empty([Some(linked_preview.as_str()), Some(item.file_path.as_str())])
                        .unwrap_or(item.prompt.as_str()),
                    240,
                ),
                preview: Some(compact_preview(&item.prompt, 360)),
                reason: "Matched Gallery prompt, file path, linked points, or source point text"
                    .to_string(),
                score: 0.74,
                source_id: None,
                chunk_index: None,
                metadata_json: serde_json::json!({
                    "downloadStatus": item.download_status,
                    "pointCount": item.point_ids.len()
                })
                .to_string(),
            });
        }
    }

    if allowed_kinds.contains("indexed_file") {
        for file in search_indexed_files(conn, query, limit)? {
            let preview = file.preview_text.as_deref().unwrap_or(file.path.as_str());
            results.push(SearchAssetResult {
                kind: "indexed_file".to_string(),
                id: file.id,
                title: file.name,
                snippet: compact_preview(&file.path, 240),
                preview: Some(compact_preview(preview, 420)),
                reason: "Matched indexed file name, path, status, metadata, or preview".to_string(),
                score: 0.78,
                source_id: file.source_id,
                chunk_index: None,
                metadata_json: serde_json::json!({
                    "sourceKind": "indexed_folder",
                    "folderId": file.folder_id,
                    "extension": file.extension,
                    "descriptorKind": file.descriptor_kind,
                    "readStatus": file.read_status,
                    "indexStatus": file.index_status
                })
                .to_string(),
            });
        }
    }

    let mut seen = HashSet::new();
    results.retain(|item| seen.insert((item.kind.clone(), item.id.clone())));
    results.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.kind.cmp(&right.kind))
            .then_with(|| left.title.cmp(&right.title))
    });
    results.truncate(limit);
    Ok(results)
}

pub fn explain_search_ranking(
    conn: &Connection,
    input: SearchRankingExplanationInput,
) -> Result<SearchRankingExplanation> {
    let query = input.query.trim().to_string();
    let generated_at = chrono::Utc::now().to_rfc3339();
    let ranker = "search_assets_coarse_score_v1".to_string();
    let diagnostic_model = "marginalia_score_components_diagnostic_v1".to_string();
    let mut warnings = Vec::new();
    if query.is_empty() {
        warnings.push("empty query".to_string());
        return Ok(SearchRankingExplanation {
            query,
            query_terms: Vec::new(),
            ranker,
            diagnostic_model,
            result_count: 0,
            analyzed_count: 0,
            max_score: None,
            min_score: None,
            items: Vec::new(),
            warnings,
            generated_at,
        });
    }

    let limit = normalize_search_assets_limit(input.limit);
    let query_terms = search_ranking_terms(&query);
    if query_terms.is_empty() {
        warnings.push("query produced no rankable terms".to_string());
    }
    let results = search_assets(
        conn,
        SearchAssetsInput {
            query: query.clone(),
            kinds: input.kinds,
            filter: input.filter,
            limit: Some(limit as i64),
        },
    )?;
    if results.is_empty() {
        warnings.push("no search matches".to_string());
    } else if results.len() == limit {
        warnings.push("search result set reached the configured limit".to_string());
    }

    let max_score = results
        .iter()
        .map(|item| item.score)
        .fold(None, |acc: Option<f64>, value| {
            Some(acc.map_or(value, |current| current.max(value)))
        });
    let min_score = results
        .iter()
        .map(|item| item.score)
        .fold(None, |acc: Option<f64>, value| {
            Some(acc.map_or(value, |current| current.min(value)))
        });
    let top_score = max_score.unwrap_or(0.0);
    let items = results
        .into_iter()
        .enumerate()
        .map(|(index, result)| {
            explain_search_ranking_item(index as i64 + 1, result, &query_terms, top_score)
        })
        .collect::<Vec<_>>();

    Ok(SearchRankingExplanation {
        query,
        query_terms,
        ranker,
        diagnostic_model,
        result_count: items.len() as i64,
        analyzed_count: items.len() as i64,
        max_score,
        min_score,
        items,
        warnings,
        generated_at,
    })
}

pub fn build_block_reference_manifest(
    conn: &Connection,
    input: BlockReferenceInput,
) -> Result<BlockReferenceManifest> {
    let root_kind = input.kind.trim().to_string();
    let root_id = input.id.trim().to_string();
    let generated_at = chrono::Utc::now().to_rfc3339();
    let query = optional_trimmed(input.query.as_deref());
    let include_related = input.include_related.unwrap_or(true);
    let limit = normalize_block_reference_limit(input.limit);
    let query_terms = query
        .as_deref()
        .map(search_ranking_terms)
        .unwrap_or_default();
    let mut warnings = Vec::new();

    if root_kind.is_empty() || root_id.is_empty() {
        warnings.push("missing block reference target".to_string());
        return Ok(BlockReferenceManifest {
            root_kind,
            root_id,
            root_title: None,
            query,
            block_count: 0,
            cards: Vec::new(),
            warnings,
            generated_at,
            source_inspiration:
                "SiYuan block references refined into Thepoint Round 16".to_string(),
        });
    }
    if !valid_search_asset_kind(&root_kind) {
        anyhow::bail!("invalid block reference target kind: {root_kind}");
    }

    let mut drafts = Vec::new();
    let root_title = collect_block_reference_drafts(
        conn,
        &root_kind,
        &root_id,
        include_related,
        limit.saturating_mul(3),
        &mut drafts,
        &mut warnings,
    )?;
    if root_title.is_none() {
        warnings.push(format!(
            "block reference target not found: {root_kind}:{root_id}"
        ));
    }

    let mut seen = HashSet::new();
    drafts.retain(|draft| seen.insert(draft.block_id.clone()));
    let mut scored = drafts
        .into_iter()
        .enumerate()
        .map(|(order, draft)| {
            let card = block_reference_card_from_draft(draft, &query_terms);
            (order, card)
        })
        .collect::<Vec<_>>();
    scored.sort_by(|left, right| {
        right
            .1
            .score
            .partial_cmp(&left.1.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.0.cmp(&right.0))
    });
    scored.truncate(limit);
    let cards = scored
        .into_iter()
        .enumerate()
        .map(|(index, (_, mut card))| {
            card.index = index as i64 + 1;
            card
        })
        .collect::<Vec<_>>();
    if cards.is_empty() && root_title.is_some() {
        warnings.push("target produced no block reference cards".to_string());
    } else if cards.len() == limit {
        warnings.push("block reference result set reached the configured limit".to_string());
    }

    Ok(BlockReferenceManifest {
        root_kind,
        root_id,
        root_title,
        query,
        block_count: cards.len() as i64,
        cards,
        warnings,
        generated_at,
        source_inspiration: "SiYuan block references refined into Thepoint Round 16".to_string(),
    })
}

pub fn build_board_snapshot_export(
    conn: &Connection,
    input: BoardSnapshotInput,
) -> Result<BoardSnapshotExport> {
    let manifest = build_block_reference_manifest(
        conn,
        BlockReferenceInput {
            kind: input.kind,
            id: input.id,
            query: input.query,
            limit: input.limit,
            include_related: input.include_related,
        },
    )?;
    let title = manifest.root_title.clone().unwrap_or_else(|| {
        format!("{}:{}", manifest.root_kind.as_str(), manifest.root_id.as_str())
    });
    let nodes = manifest
        .cards
        .iter()
        .enumerate()
        .map(|(index, card)| board_snapshot_node_from_card(index as i64 + 1, card))
        .collect::<Vec<_>>();
    let edges = board_snapshot_edges(&manifest, &nodes);
    let markdown = board_snapshot_markdown(&title, &manifest, &nodes, &edges);

    Ok(BoardSnapshotExport {
        root_kind: manifest.root_kind,
        root_id: manifest.root_id,
        title,
        node_count: nodes.len() as i64,
        edge_count: edges.len() as i64,
        nodes,
        edges,
        markdown,
        warnings: manifest.warnings,
        generated_at: manifest.generated_at,
        source_inspiration:
            "AFFiNE canvas snapshots and AppFlowy board views refined into Thepoint Round 17"
                .to_string(),
    })
}

pub fn build_retrieval_context(
    conn: &Connection,
    input: RetrievalContextInput,
) -> Result<RetrievalContext> {
    let query = input.query.trim().to_string();
    let limit = normalize_retrieval_context_limit(input.limit);
    let max_chars = normalize_retrieval_context_item_chars(input.max_chars_per_item);
    if query.is_empty() {
        return Ok(RetrievalContext {
            query,
            item_count: 0,
            total_chars: 0,
            items: Vec::new(),
            warnings: vec!["empty query".to_string()],
        });
    }

    let results = search_assets(
        conn,
        SearchAssetsInput {
            query: query.clone(),
            kinds: input.kinds,
            filter: input.filter,
            limit: Some(limit as i64),
        },
    )?;
    let mut total_chars = 0i64;
    let items = results
        .into_iter()
        .enumerate()
        .map(|(index, result)| {
            let excerpt_source = result
                .preview
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(result.snippet.as_str());
            let excerpt = compact_preview(excerpt_source, max_chars);
            total_chars += excerpt.chars().count() as i64;
            RetrievalContextItem {
                index: index as i64 + 1,
                kind: result.kind,
                id: result.id,
                title: result.title,
                excerpt,
                reason: result.reason,
                score: result.score,
                source_id: result.source_id,
                chunk_index: result.chunk_index,
                metadata_json: result.metadata_json,
            }
        })
        .collect::<Vec<_>>();
    let mut warnings = Vec::new();
    if items.is_empty() {
        warnings.push("no retrieval matches".to_string());
    } else if items.len() == limit {
        warnings.push("retrieval result set reached the configured limit".to_string());
    }

    Ok(RetrievalContext {
        query,
        item_count: items.len() as i64,
        total_chars,
        items,
        warnings,
    })
}

pub fn suggest_backlinks(
    conn: &Connection,
    input: BacklinkSuggestionInput,
) -> Result<Vec<BacklinkSuggestion>> {
    let target_kind = input.kind.trim().to_string();
    let target_id = input.id.trim().to_string();
    if target_kind.is_empty() || target_id.is_empty() {
        return Ok(Vec::new());
    }
    if !valid_search_asset_kind(&target_kind) {
        anyhow::bail!("invalid backlink target kind: {target_kind}");
    }

    let Some(target) = resolve_backlink_target(conn, &target_kind, &target_id)? else {
        return Ok(Vec::new());
    };
    let queries = backlink_search_queries(&target);
    if queries.is_empty() {
        return Ok(Vec::new());
    }

    let limit = normalize_backlink_suggestion_limit(input.limit);
    let search_limit = limit.saturating_mul(4).clamp(1, 100) as i64;
    let target_terms = significant_backlink_terms(&format!("{} {}", target.title, target.text));
    let mut seen = HashSet::new();
    let mut suggestions = Vec::new();

    for (query_index, query) in queries.iter().enumerate() {
        let results = search_assets(
            conn,
            SearchAssetsInput {
                query: query.clone(),
                kinds: None,
                filter: None,
                limit: Some(search_limit),
            },
        )?;

        for result in results {
            if result.kind == target.kind && result.id == target.id {
                continue;
            }
            if !seen.insert((result.kind.clone(), result.id.clone())) {
                continue;
            }

            let candidate_text = format!(
                "{}\n{}\n{}\n{}",
                result.title,
                result.snippet,
                result.preview.as_deref().unwrap_or(""),
                result.metadata_json
            );
            let exact_title_match = target.title.chars().count() >= 4
                && contains_normalized(&candidate_text, &target.title);
            let matched_terms = matched_backlink_terms(&candidate_text, &target_terms);
            if !exact_title_match && matched_terms.len() < 2 {
                continue;
            }

            let existing_relation =
                asset_relation_exists(conn, &target.kind, &target.id, &result.kind, &result.id)?;
            if existing_relation {
                continue;
            }

            let term_bonus = matched_terms.len().min(5) as f64 * 0.03;
            let exact_bonus = if exact_title_match { 0.14 } else { 0.0 };
            let query_penalty = query_index as f64 * 0.02;
            let score =
                (result.score * 0.78 + exact_bonus + term_bonus - query_penalty).clamp(0.0, 1.0);
            let excerpt_source = result
                .preview
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or(result.snippet.as_str());

            suggestions.push(BacklinkSuggestion {
                target_kind: target.kind.clone(),
                target_id: target.id.clone(),
                candidate_kind: result.kind,
                candidate_id: result.id,
                candidate_title: result.title,
                candidate_excerpt: compact_preview(excerpt_source, 320),
                relation: "same_topic".to_string(),
                reason: backlink_suggestion_reason(
                    exact_title_match,
                    &target.title,
                    &matched_terms,
                    query,
                ),
                score,
                existing_relation: false,
                source_id: result.source_id,
                chunk_index: result.chunk_index,
                metadata_json: result.metadata_json,
            });
        }
    }

    suggestions.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.candidate_kind.cmp(&right.candidate_kind))
            .then_with(|| left.candidate_title.cmp(&right.candidate_title))
    });
    suggestions.truncate(limit);
    Ok(suggestions)
}

pub fn save_asset_search(
    conn: &Connection,
    input: SaveAssetSearchInput,
) -> Result<SavedAssetSearch> {
    let (name, query, kinds, filter, limit) = normalize_saved_asset_search_input(input)?;
    let now = chrono::Utc::now().to_rfc3339();
    let existing_id = conn
        .query_row(
            "SELECT id FROM saved_asset_searches WHERE name = ?1",
            params![name],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let id = existing_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let kinds_json = json_string_array(kinds);

    if get_saved_asset_search(conn, &id)?.is_some() {
        conn.execute(
            "UPDATE saved_asset_searches
             SET query = ?1, kinds_json = ?2, filter = ?3, limit_value = ?4, updated_at = ?5
             WHERE id = ?6",
            params![query, kinds_json, filter, limit, now, id],
        )?;
    } else {
        conn.execute(
            "INSERT INTO saved_asset_searches
                (id, name, query, kinds_json, filter, limit_value, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            params![id, name, query, kinds_json, filter, limit, now],
        )?;
    }

    get_saved_asset_search(conn, &id)?
        .ok_or_else(|| anyhow::anyhow!("saved asset search not found: {id}"))
}

pub fn list_saved_asset_searches(conn: &Connection) -> Result<Vec<SavedAssetSearch>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, query, kinds_json, filter, limit_value, created_at, updated_at
         FROM saved_asset_searches
         ORDER BY updated_at DESC, name ASC",
    )?;
    let rows = stmt.query_map([], map_saved_asset_search_row)?;
    let mut searches = Vec::new();
    for row in rows {
        searches.push(row?);
    }
    Ok(searches)
}

pub fn preview_saved_asset_search(
    conn: &Connection,
    id: &str,
    limit: Option<i64>,
) -> Result<Option<SavedAssetSearchPreview>> {
    let Some(search) = get_saved_asset_search(conn, id)? else {
        return Ok(None);
    };
    let preview_limit = limit.unwrap_or(search.limit).clamp(1, 100);
    let results = search_assets(
        conn,
        SearchAssetsInput {
            query: search.query.clone(),
            kinds: if search.kinds.is_empty() {
                None
            } else {
                Some(search.kinds.clone())
            },
            filter: search.filter.clone(),
            limit: Some(preview_limit),
        },
    )?;
    let mut warnings = Vec::new();
    if results.is_empty() {
        warnings.push("saved search preview returned no matches".to_string());
    } else if results.len() == preview_limit as usize {
        warnings.push("saved search preview reached the configured limit".to_string());
    }

    Ok(Some(SavedAssetSearchPreview {
        result_count: results.len().min(i64::MAX as usize) as i64,
        search,
        results,
        warnings,
    }))
}

pub fn delete_saved_asset_search(conn: &Connection, id: &str) -> Result<()> {
    let id = id.trim();
    if id.is_empty() {
        return Ok(());
    }
    conn.execute(
        "DELETE FROM saved_asset_searches WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

fn get_saved_asset_search(conn: &Connection, id: &str) -> Result<Option<SavedAssetSearch>> {
    let id = id.trim();
    if id.is_empty() {
        return Ok(None);
    }
    conn.query_row(
        "SELECT id, name, query, kinds_json, filter, limit_value, created_at, updated_at
         FROM saved_asset_searches
         WHERE id = ?1",
        params![id],
        map_saved_asset_search_row,
    )
    .optional()
    .map_err(Into::into)
}

pub fn save_retrieval_profile(
    conn: &Connection,
    input: SaveRetrievalProfileInput,
) -> Result<RetrievalProfile> {
    let normalized = normalize_retrieval_profile_input(conn, input)?;
    let NormalizedRetrievalProfileInput {
        name,
        description,
        query,
        kinds,
        filter,
        saved_search_id,
        limit,
        max_chars_per_item,
        min_score,
        mode,
    } = normalized;
    let now = chrono::Utc::now().to_rfc3339();
    let existing_id = conn
        .query_row(
            "SELECT id FROM retrieval_profiles WHERE name = ?1",
            params![name],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    let id = existing_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let kinds_json = json_string_array(kinds);

    if get_retrieval_profile(conn, &id)?.is_some() {
        conn.execute(
            "UPDATE retrieval_profiles
             SET description = ?1,
                 query = ?2,
                 kinds_json = ?3,
                 filter = ?4,
                 saved_search_id = ?5,
                 limit_value = ?6,
                 max_chars_per_item = ?7,
                 min_score = ?8,
                 mode = ?9,
                 updated_at = ?10
             WHERE id = ?11",
            params![
                description,
                query,
                kinds_json,
                filter,
                saved_search_id,
                limit,
                max_chars_per_item,
                min_score,
                mode,
                now,
                id
            ],
        )?;
    } else {
        conn.execute(
            "INSERT INTO retrieval_profiles
                (id, name, description, query, kinds_json, filter, saved_search_id,
                 limit_value, max_chars_per_item, min_score, mode, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
            params![
                id,
                name,
                description,
                query,
                kinds_json,
                filter,
                saved_search_id,
                limit,
                max_chars_per_item,
                min_score,
                mode,
                now
            ],
        )?;
    }

    get_retrieval_profile(conn, &id)?
        .ok_or_else(|| anyhow::anyhow!("retrieval profile not found: {id}"))
}

pub fn list_retrieval_profiles(conn: &Connection) -> Result<Vec<RetrievalProfile>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, query, kinds_json, filter, saved_search_id,
                limit_value, max_chars_per_item, min_score, mode, created_at, updated_at
         FROM retrieval_profiles
         ORDER BY updated_at DESC, name ASC",
    )?;
    let rows = stmt.query_map([], map_retrieval_profile_row)?;
    let mut profiles = Vec::new();
    for row in rows {
        profiles.push(row?);
    }
    Ok(profiles)
}

pub fn preview_retrieval_profile(
    conn: &Connection,
    input: PreviewRetrievalProfileInput,
) -> Result<Option<RetrievalProfilePreview>> {
    let Some(profile) = get_retrieval_profile(conn, &input.id)? else {
        return Ok(None);
    };

    let mut warnings = Vec::new();
    let saved_search = match profile.saved_search_id.as_deref() {
        Some(id) => match get_saved_asset_search(conn, id)? {
            Some(search) => Some(search),
            None => {
                warnings.push(format!(
                    "retrieval profile references a missing saved search: {id}"
                ));
                None
            }
        },
        None => None,
    };

    let effective_query = optional_trimmed(input.query_override.as_deref())
        .or_else(|| optional_trimmed(Some(profile.query.as_str())))
        .or_else(|| saved_search.as_ref().map(|search| search.query.clone()))
        .unwrap_or_default();
    let effective_kinds = if profile.kinds.is_empty() {
        saved_search
            .as_ref()
            .map(|search| search.kinds.clone())
            .unwrap_or_default()
    } else {
        profile.kinds.clone()
    };
    let effective_filter = profile.filter.clone().or_else(|| {
        saved_search
            .as_ref()
            .and_then(|search| search.filter.clone())
    });
    let effective_limit = input.limit.unwrap_or(profile.limit);
    let effective_max_chars = input
        .max_chars_per_item
        .unwrap_or(profile.max_chars_per_item);

    let mut context = build_retrieval_context(
        conn,
        RetrievalContextInput {
            query: effective_query.clone(),
            kinds: if effective_kinds.is_empty() {
                None
            } else {
                Some(effective_kinds.clone())
            },
            filter: effective_filter.clone(),
            limit: Some(effective_limit),
            max_chars_per_item: Some(effective_max_chars),
        },
    )?;

    let min_score = profile.min_score;
    if min_score > 0.0 {
        let before = context.items.len();
        context
            .items
            .retain(|item| item.score + f64::EPSILON >= min_score);
        if context.items.len() != before {
            warnings.push(format!(
                "minScore filtered {} retrieval item(s).",
                before.saturating_sub(context.items.len())
            ));
        }
        refresh_retrieval_context_stats(&mut context);
    }

    if profile.mode == "query" && context.items.is_empty() {
        warnings.push(
            "query mode profile would refuse to answer without retrieval matches.".to_string(),
        );
    }
    if saved_search.is_some() {
        warnings.push("profile scope includes a saved search definition.".to_string());
    }

    Ok(Some(RetrievalProfilePreview {
        profile,
        saved_search,
        effective_query,
        effective_kinds,
        effective_filter,
        min_score,
        context,
        warnings,
    }))
}

pub fn delete_retrieval_profile(conn: &Connection, id: &str) -> Result<()> {
    let id = id.trim();
    if id.is_empty() {
        return Ok(());
    }
    conn.execute("DELETE FROM retrieval_profiles WHERE id = ?1", params![id])?;
    Ok(())
}

fn get_retrieval_profile(conn: &Connection, id: &str) -> Result<Option<RetrievalProfile>> {
    let id = id.trim();
    if id.is_empty() {
        return Ok(None);
    }
    conn.query_row(
        "SELECT id, name, description, query, kinds_json, filter, saved_search_id,
                limit_value, max_chars_per_item, min_score, mode, created_at, updated_at
         FROM retrieval_profiles
         WHERE id = ?1",
        params![id],
        map_retrieval_profile_row,
    )
    .optional()
    .map_err(Into::into)
}

#[derive(Clone, Debug)]
struct BacklinkTarget {
    kind: String,
    id: String,
    title: String,
    text: String,
}

#[derive(Clone, Debug)]
struct BlockReferenceDraft {
    block_kind: String,
    asset_kind: String,
    asset_id: String,
    block_id: String,
    title: String,
    text: String,
    locator: String,
    source_id: Option<String>,
    chunk_index: Option<i64>,
    command_name: String,
    wrapper_name: String,
    input_json: String,
    metadata_json: String,
    base_score: f64,
}

fn resolve_backlink_target(
    conn: &Connection,
    kind: &str,
    id: &str,
) -> Result<Option<BacklinkTarget>> {
    match kind {
        "source" => {
            let Some(workspace) = get_source_workspace(conn, id)? else {
                return Ok(None);
            };
            let title = workspace
                .source
                .title
                .clone()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| workspace.source.canonical_uri.clone());
            let chunk_text = workspace
                .chunks
                .iter()
                .map(|chunk| chunk.text.as_str())
                .collect::<Vec<_>>()
                .join("\n");
            let text = [
                title.as_str(),
                workspace.source.canonical_uri.as_str(),
                workspace.source.metadata_json.as_str(),
                chunk_text.as_str(),
            ]
            .join("\n");
            Ok(Some(BacklinkTarget {
                kind: kind.to_string(),
                id: id.to_string(),
                title,
                text,
            }))
        }
        "point" => {
            let Some(point) = get_point(conn, id)? else {
                return Ok(None);
            };
            let title = first_non_empty([
                point.tag_type.as_deref(),
                point.source_doc_name.as_deref(),
                Some(point.content.as_str()),
            ])
            .map(|value| compact_preview(value, 96))
            .unwrap_or_else(|| id.to_string());
            let text = [
                point.content.as_str(),
                point.tag_type.as_deref().unwrap_or(""),
                point.source_doc_name.as_deref().unwrap_or(""),
                point.source_excerpt.as_deref().unwrap_or(""),
            ]
            .join("\n");
            Ok(Some(BacklinkTarget {
                kind: kind.to_string(),
                id: id.to_string(),
                title,
                text,
            }))
        }
        "evidence" => {
            let Some(evidence) = get_evidence(conn, id)? else {
                return Ok(None);
            };
            let source_text = evidence
                .sources
                .iter()
                .map(|source| {
                    format!(
                        "{} {} {} {}",
                        source.title.as_deref().unwrap_or(""),
                        source.url,
                        source.snippet.as_deref().unwrap_or(""),
                        source.stance
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");
            let text = [
                evidence.claim.as_str(),
                evidence.answer.as_str(),
                evidence.reasoning.as_deref().unwrap_or(""),
                evidence.context.as_deref().unwrap_or(""),
                source_text.as_str(),
            ]
            .join("\n");
            Ok(Some(BacklinkTarget {
                kind: kind.to_string(),
                id: id.to_string(),
                title: evidence.claim,
                text,
            }))
        }
        "report" => {
            let Some(report) = get_report(conn, id)? else {
                return Ok(None);
            };
            let text = [
                report.title.as_str(),
                report.kind.as_str(),
                report.source_name.as_deref().unwrap_or(""),
                report.summary.as_str(),
                report.body_md.as_str(),
                report.citations_json.as_str(),
            ]
            .join("\n");
            Ok(Some(BacklinkTarget {
                kind: kind.to_string(),
                id: id.to_string(),
                title: report.title,
                text,
            }))
        }
        "journal" => {
            let Some(entry) = get_journal_entry(conn, id)? else {
                return Ok(None);
            };
            let text = [
                entry.query.as_str(),
                entry.note.as_str(),
                entry.tags_json.as_str(),
                entry.source_ids_json.as_str(),
                entry.point_ids_json.as_str(),
                entry.evidence_ids_json.as_str(),
                entry.report_ids_json.as_str(),
                entry.source_kind.as_str(),
            ]
            .join("\n");
            Ok(Some(BacklinkTarget {
                kind: kind.to_string(),
                id: id.to_string(),
                title: entry.query,
                text,
            }))
        }
        "gallery" => {
            let Some(item) = get_gallery_item(conn, id)? else {
                return Ok(None);
            };
            let linked_text = item
                .source_points
                .iter()
                .map(|point| point.content.as_str())
                .collect::<Vec<_>>()
                .join("\n");
            let text = [
                item.prompt.as_str(),
                item.file_path.as_str(),
                item.thumbnail_path.as_str(),
                item.download_status.as_str(),
                linked_text.as_str(),
            ]
            .join("\n");
            Ok(Some(BacklinkTarget {
                kind: kind.to_string(),
                id: id.to_string(),
                title: compact_preview(&item.prompt, 96),
                text,
            }))
        }
        "indexed_file" => {
            let Some(file) = get_indexed_file(conn, id)? else {
                return Ok(None);
            };
            let text = [
                file.name.as_str(),
                file.path.as_str(),
                file.canonical_path.as_deref().unwrap_or(""),
                file.extension.as_deref().unwrap_or(""),
                file.descriptor_kind.as_str(),
                file.read_status.as_str(),
                file.index_status.as_str(),
                file.metadata_json.as_str(),
                file.preview_text.as_deref().unwrap_or(""),
            ]
            .join("\n");
            Ok(Some(BacklinkTarget {
                kind: kind.to_string(),
                id: id.to_string(),
                title: file.name,
                text,
            }))
        }
        _ => Ok(None),
    }
}

fn collect_block_reference_drafts(
    conn: &Connection,
    kind: &str,
    id: &str,
    include_related: bool,
    budget: usize,
    drafts: &mut Vec<BlockReferenceDraft>,
    warnings: &mut Vec<String>,
) -> Result<Option<String>> {
    match kind {
        "source" => {
            let Some(workspace) = get_source_workspace(conn, id)? else {
                return Ok(None);
            };
            let title = source_reference_title(&workspace.source);
            for chunk in &workspace.chunks {
                if drafts.len() >= budget {
                    break;
                }
                push_source_chunk_reference(drafts, &workspace.source, chunk, 1.0);
            }
            if include_related && drafts.len() < budget {
                for point in list_points_for_source(conn, id, budget.saturating_sub(drafts.len()))? {
                    push_point_reference(drafts, &point, 0.74);
                }
            }
            if include_related && drafts.len() < budget {
                for evidence in list_evidence_for_source(conn, id)? {
                    if drafts.len() >= budget {
                        break;
                    }
                    push_evidence_reference(drafts, &evidence, 0.68);
                }
            }
            Ok(Some(title))
        }
        "point" => {
            let Some(point) = get_point(conn, id)? else {
                return Ok(None);
            };
            let title = point_reference_title(&point);
            push_point_reference(drafts, &point, 1.0);
            if include_related {
                if let Some(context) = get_point_source_context(conn, id)? {
                    if let Some(chunk) = context
                        .chunks
                        .iter()
                        .find(|chunk| chunk.chunk_index == context.chunk_index)
                    {
                        push_source_chunk_reference(drafts, &context.source, chunk, 0.95);
                    }
                }
                for evidence in list_evidence_for_point(conn, id)? {
                    if drafts.len() >= budget {
                        break;
                    }
                    push_evidence_reference(drafts, &evidence, 0.72);
                }
            }
            Ok(Some(title))
        }
        "evidence" => {
            let Some(evidence) = get_evidence(conn, id)? else {
                return Ok(None);
            };
            let title = evidence.claim.clone();
            push_evidence_reference(drafts, &evidence, 1.0);
            if include_related {
                if let Some(source_id) = evidence.source_id.as_deref() {
                    push_block_reference_asset_summary(
                        conn,
                        "source",
                        source_id,
                        0.82,
                        drafts,
                        budget,
                        warnings,
                    )?;
                }
                if let Some(point_id) = evidence.point_id.as_deref() {
                    push_block_reference_asset_summary(
                        conn,
                        "point",
                        point_id,
                        0.78,
                        drafts,
                        budget,
                        warnings,
                    )?;
                }
            }
            Ok(Some(title))
        }
        "report" => {
            let Some(report) = get_report(conn, id)? else {
                return Ok(None);
            };
            let title = report.title.clone();
            push_report_reference(drafts, &report, 1.0);
            if include_related {
                for (target_kind, target_id) in report_citation_assets(&report) {
                    if drafts.len() >= budget {
                        break;
                    }
                    push_block_reference_asset_summary(
                        conn,
                        &target_kind,
                        &target_id,
                        0.76,
                        drafts,
                        budget,
                        warnings,
                    )?;
                }
            }
            Ok(Some(title))
        }
        "journal" => {
            let Some(entry) = get_journal_entry(conn, id)? else {
                return Ok(None);
            };
            let title = entry.query.clone();
            push_journal_reference(drafts, &entry, 1.0);
            if include_related {
                for source_id in json_array_strings(&entry.source_ids_json) {
                    push_block_reference_asset_summary(
                        conn, "source", &source_id, 0.72, drafts, budget, warnings,
                    )?;
                }
                for point_id in json_array_strings(&entry.point_ids_json) {
                    push_block_reference_asset_summary(
                        conn, "point", &point_id, 0.70, drafts, budget, warnings,
                    )?;
                }
                for evidence_id in json_array_strings(&entry.evidence_ids_json) {
                    push_block_reference_asset_summary(
                        conn, "evidence", &evidence_id, 0.68, drafts, budget, warnings,
                    )?;
                }
                for report_id in json_array_strings(&entry.report_ids_json) {
                    push_block_reference_asset_summary(
                        conn, "report", &report_id, 0.66, drafts, budget, warnings,
                    )?;
                }
            }
            Ok(Some(title))
        }
        "gallery" => {
            let Some(item) = get_gallery_item(conn, id)? else {
                return Ok(None);
            };
            let title = compact_preview(&item.prompt, 96);
            push_gallery_reference(drafts, &item, 1.0);
            if include_related {
                for point in &item.source_points {
                    if drafts.len() >= budget {
                        break;
                    }
                    if let Some(stored) = get_point(conn, &point.id)? {
                        push_point_reference(drafts, &stored, 0.68);
                    } else {
                        push_gallery_source_point_reference(drafts, &item, point, 0.58);
                    }
                }
            }
            Ok(Some(title))
        }
        "indexed_file" => {
            let Some(file) = get_indexed_file(conn, id)? else {
                return Ok(None);
            };
            let title = file.name.clone();
            push_indexed_file_reference(drafts, &file, 1.0);
            if include_related {
                if let Some(source_id) = file.source_id.as_deref() {
                    push_block_reference_asset_summary(
                        conn,
                        "source",
                        source_id,
                        0.82,
                        drafts,
                        budget,
                        warnings,
                    )?;
                }
            }
            Ok(Some(title))
        }
        _ => Ok(None),
    }
}

fn push_block_reference_asset_summary(
    conn: &Connection,
    kind: &str,
    id: &str,
    base_score: f64,
    drafts: &mut Vec<BlockReferenceDraft>,
    budget: usize,
    warnings: &mut Vec<String>,
) -> Result<()> {
    if drafts.len() >= budget {
        return Ok(());
    }
    match kind {
        "source" => {
            if let Some(workspace) = get_source_workspace(conn, id)? {
                if let Some(chunk) = workspace.chunks.first() {
                    push_source_chunk_reference(drafts, &workspace.source, chunk, base_score);
                } else {
                    push_source_summary_reference(drafts, &workspace.source, base_score);
                }
            } else {
                warnings.push(format!("referenced source not found: {id}"));
            }
        }
        "point" => {
            if let Some(point) = get_point(conn, id)? {
                push_point_reference(drafts, &point, base_score);
            } else {
                warnings.push(format!("referenced point not found: {id}"));
            }
        }
        "evidence" => {
            if let Some(evidence) = get_evidence(conn, id)? {
                push_evidence_reference(drafts, &evidence, base_score);
            } else {
                warnings.push(format!("referenced evidence not found: {id}"));
            }
        }
        "report" => {
            if let Some(report) = get_report(conn, id)? {
                push_report_reference(drafts, &report, base_score);
            } else {
                warnings.push(format!("referenced report not found: {id}"));
            }
        }
        _ => warnings.push(format!("unsupported block reference asset: {kind}:{id}")),
    }
    Ok(())
}

fn push_source_chunk_reference(
    drafts: &mut Vec<BlockReferenceDraft>,
    source: &SourceSummaryRecord,
    chunk: &SourceChunkRecord,
    base_score: f64,
) {
    let title = source_reference_title(source);
    let locator = chunk
        .heading_path
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|heading| format!("source chunk {} · {heading}", chunk.chunk_index))
        .unwrap_or_else(|| format!("source chunk {}", chunk.chunk_index));
    drafts.push(BlockReferenceDraft {
        block_kind: "source_chunk".to_string(),
        asset_kind: "source".to_string(),
        asset_id: source.id.clone(),
        block_id: format!("source:{}:chunk:{}", source.id, chunk.chunk_index),
        title: format!("{title} · chunk {}", chunk.chunk_index),
        text: chunk.text.clone(),
        locator,
        source_id: Some(source.id.clone()),
        chunk_index: Some(chunk.chunk_index),
        command_name: "open_source_workspace".to_string(),
        wrapper_name: "openSourceWorkspace".to_string(),
        input_json: serde_json::json!({ "sourceId": source.id.as_str() }).to_string(),
        metadata_json: serde_json::json!({
            "sourceKind": source.kind.as_str(),
            "headingPath": chunk.heading_path.as_deref(),
            "canonicalUri": source.canonical_uri.as_str()
        })
        .to_string(),
        base_score,
    });
}

fn push_source_summary_reference(
    drafts: &mut Vec<BlockReferenceDraft>,
    source: &SourceSummaryRecord,
    base_score: f64,
) {
    let title = source_reference_title(source);
    drafts.push(BlockReferenceDraft {
        block_kind: "source_summary".to_string(),
        asset_kind: "source".to_string(),
        asset_id: source.id.clone(),
        block_id: format!("source:{}:summary", source.id),
        title: title.clone(),
        text: format!("{}\n{}", source.canonical_uri, source.metadata_json),
        locator: "source metadata".to_string(),
        source_id: Some(source.id.clone()),
        chunk_index: None,
        command_name: "open_source_workspace".to_string(),
        wrapper_name: "openSourceWorkspace".to_string(),
        input_json: serde_json::json!({ "sourceId": source.id.as_str() }).to_string(),
        metadata_json: serde_json::json!({
            "sourceKind": source.kind.as_str(),
            "chunkCount": source.chunk_count,
            "pointCount": source.point_count
        })
        .to_string(),
        base_score,
    });
}

fn push_point_reference(drafts: &mut Vec<BlockReferenceDraft>, point: &StoredPoint, base_score: f64) {
    let title = point_reference_title(point);
    let text = [
        point.content.as_str(),
        point.tag_type.as_deref().unwrap_or(""),
        point.source_doc_name.as_deref().unwrap_or(""),
        point.source_excerpt.as_deref().unwrap_or(""),
    ]
    .join("\n");
    drafts.push(BlockReferenceDraft {
        block_kind: "point_card".to_string(),
        asset_kind: "point".to_string(),
        asset_id: point.id.clone(),
        block_id: format!("point:{}:card", point.id),
        title,
        text,
        locator: "point card".to_string(),
        source_id: None,
        chunk_index: None,
        command_name: "get_point_source_context".to_string(),
        wrapper_name: "getPointSourceContext".to_string(),
        input_json: serde_json::json!({ "pointId": point.id.as_str() }).to_string(),
        metadata_json: serde_json::json!({
            "tagType": point.tag_type.as_deref(),
            "parentId": point.parent_id.as_deref(),
            "sourceDocName": point.source_doc_name.as_deref(),
            "archived": point.archived,
            "starred": point.starred
        })
        .to_string(),
        base_score,
    });
}

fn push_evidence_reference(
    drafts: &mut Vec<BlockReferenceDraft>,
    evidence: &EvidenceRecord,
    base_score: f64,
) {
    let source_text = evidence
        .sources
        .iter()
        .map(|source| {
            format!(
                "{} {} {} {}",
                source.title.as_deref().unwrap_or(""),
                source.url,
                source.snippet.as_deref().unwrap_or(""),
                source.stance
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let text = [
        evidence.claim.as_str(),
        evidence.answer.as_str(),
        evidence.reasoning.as_deref().unwrap_or(""),
        evidence.context.as_deref().unwrap_or(""),
        source_text.as_str(),
    ]
    .join("\n");
    drafts.push(BlockReferenceDraft {
        block_kind: "evidence_claim".to_string(),
        asset_kind: "evidence".to_string(),
        asset_id: evidence.id.clone(),
        block_id: format!("evidence:{}:claim", evidence.id),
        title: evidence.claim.clone(),
        text,
        locator: "evidence claim".to_string(),
        source_id: evidence.source_id.clone(),
        chunk_index: evidence.chunk_index,
        command_name: "get_evidence".to_string(),
        wrapper_name: "getEvidence".to_string(),
        input_json: serde_json::json!({ "evidenceId": evidence.id.as_str() }).to_string(),
        metadata_json: serde_json::json!({
            "verdict": evidence.verdict.as_str(),
            "pointId": evidence.point_id.as_deref(),
            "sourceId": evidence.source_id.as_deref(),
            "chunkIndex": evidence.chunk_index,
            "sourceCount": evidence.sources.len()
        })
        .to_string(),
        base_score,
    });
}

fn push_report_reference(
    drafts: &mut Vec<BlockReferenceDraft>,
    report: &ReportRecord,
    base_score: f64,
) {
    let text = if report.summary.trim().is_empty() {
        report.body_md.clone()
    } else {
        format!("{}\n{}", report.summary, report.body_md)
    };
    drafts.push(BlockReferenceDraft {
        block_kind: "report_section".to_string(),
        asset_kind: "report".to_string(),
        asset_id: report.id.clone(),
        block_id: format!("report:{}:summary", report.id),
        title: report.title.clone(),
        text,
        locator: format!("{} report summary/body", report.kind),
        source_id: None,
        chunk_index: None,
        command_name: "get_report".to_string(),
        wrapper_name: "getReport".to_string(),
        input_json: serde_json::json!({ "reportId": report.id.as_str() }).to_string(),
        metadata_json: serde_json::json!({
            "reportKind": report.kind.as_str(),
            "sourceName": report.source_name.as_deref()
        })
        .to_string(),
        base_score,
    });
}

fn push_journal_reference(
    drafts: &mut Vec<BlockReferenceDraft>,
    entry: &JournalEntry,
    base_score: f64,
) {
    let text = [
        entry.query.as_str(),
        entry.note.as_str(),
        entry.tags_json.as_str(),
        entry.source_kind.as_str(),
    ]
    .join("\n");
    drafts.push(BlockReferenceDraft {
        block_kind: "journal_note".to_string(),
        asset_kind: "journal".to_string(),
        asset_id: entry.id.clone(),
        block_id: format!("journal:{}:note", entry.id),
        title: entry.query.clone(),
        text,
        locator: "journal note".to_string(),
        source_id: None,
        chunk_index: None,
        command_name: "search_journal_entries".to_string(),
        wrapper_name: "searchJournalEntries".to_string(),
        input_json: serde_json::json!({ "query": entry.query.as_str() }).to_string(),
        metadata_json: serde_json::json!({
            "sourceKind": entry.source_kind.as_str(),
            "createdReportId": entry.created_report_id.as_deref(),
            "invalidatedAt": entry.invalidated_at.as_deref()
        })
        .to_string(),
        base_score,
    });
}

fn push_gallery_reference(
    drafts: &mut Vec<BlockReferenceDraft>,
    item: &GalleryItem,
    base_score: f64,
) {
    let title = compact_preview(&item.prompt, 96);
    drafts.push(BlockReferenceDraft {
        block_kind: "gallery_prompt".to_string(),
        asset_kind: "gallery".to_string(),
        asset_id: item.id.clone(),
        block_id: format!("gallery:{}:prompt", item.id),
        title: title.clone(),
        text: item.prompt.clone(),
        locator: "gallery prompt".to_string(),
        source_id: None,
        chunk_index: None,
        command_name: "search_gallery".to_string(),
        wrapper_name: "searchGallery".to_string(),
        input_json: serde_json::json!({ "query": title }).to_string(),
        metadata_json: serde_json::json!({
            "downloadStatus": item.download_status.as_str(),
            "pointCount": item.point_ids.len(),
            "sourcePointCount": item.source_points.len()
        })
        .to_string(),
        base_score,
    });
}

fn push_gallery_source_point_reference(
    drafts: &mut Vec<BlockReferenceDraft>,
    item: &GalleryItem,
    point: &GallerySourcePoint,
    base_score: f64,
) {
    drafts.push(BlockReferenceDraft {
        block_kind: "gallery_source_point".to_string(),
        asset_kind: "gallery".to_string(),
        asset_id: item.id.clone(),
        block_id: format!("gallery:{}:source-point:{}", item.id, point.id),
        title: compact_preview(&point.content, 96),
        text: point.content.clone(),
        locator: "gallery source point".to_string(),
        source_id: None,
        chunk_index: None,
        command_name: "search_gallery".to_string(),
        wrapper_name: "searchGallery".to_string(),
        input_json: serde_json::json!({ "query": compact_preview(&item.prompt, 96) }).to_string(),
        metadata_json: serde_json::json!({
            "pointId": point.id.as_str(),
            "sourceDocName": point.source_doc_name.as_deref()
        })
        .to_string(),
        base_score,
    });
}

fn push_indexed_file_reference(
    drafts: &mut Vec<BlockReferenceDraft>,
    file: &IndexedFile,
    base_score: f64,
) {
    let text = first_non_empty([file.preview_text.as_deref(), Some(file.path.as_str())])
        .unwrap_or(file.name.as_str())
        .to_string();
    drafts.push(BlockReferenceDraft {
        block_kind: "indexed_file_preview".to_string(),
        asset_kind: "indexed_file".to_string(),
        asset_id: file.id.clone(),
        block_id: format!("indexed_file:{}:preview", file.id),
        title: file.name.clone(),
        text,
        locator: "indexed file preview".to_string(),
        source_id: file.source_id.clone(),
        chunk_index: None,
        command_name: "load_indexed_file_preview".to_string(),
        wrapper_name: "loadIndexedFilePreview".to_string(),
        input_json: serde_json::json!({ "fileId": file.id.as_str() }).to_string(),
        metadata_json: serde_json::json!({
            "folderId": file.folder_id.as_str(),
            "extension": file.extension.as_deref(),
            "descriptorKind": file.descriptor_kind.as_str(),
            "readStatus": file.read_status.as_str(),
            "indexStatus": file.index_status.as_str(),
            "sourceId": file.source_id.as_deref()
        })
        .to_string(),
        base_score,
    });
}

fn normalize_backlink_suggestion_limit(limit: Option<i64>) -> usize {
    limit.unwrap_or(12).clamp(1, 30) as usize
}

fn backlink_search_queries(target: &BacklinkTarget) -> Vec<String> {
    let mut queries = Vec::new();
    push_backlink_query(&mut queries, &target.title);

    let title_terms = significant_backlink_terms(&target.title);
    if title_terms.len() >= 2 {
        push_backlink_query(
            &mut queries,
            &title_terms[..title_terms.len().min(3)].join(" "),
        );
    }

    for term in significant_backlink_terms(&target.text) {
        push_backlink_query(&mut queries, &term);
        if queries.len() >= 6 {
            break;
        }
    }

    queries
}

fn push_backlink_query(queries: &mut Vec<String>, value: &str) {
    let query = compact_search_query(value, 96);
    if query.chars().count() < 4 || queries.iter().any(|existing| existing == &query) {
        return;
    }
    queries.push(query);
}

fn compact_search_query(value: &str, max_chars: usize) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= max_chars {
        normalized
    } else {
        normalized.chars().take(max_chars).collect()
    }
}

fn contains_normalized(haystack: &str, needle: &str) -> bool {
    haystack.to_lowercase().contains(&needle.to_lowercase())
}

fn matched_backlink_terms(candidate_text: &str, target_terms: &[String]) -> Vec<String> {
    let haystack = candidate_text.to_lowercase();
    target_terms
        .iter()
        .filter(|term| haystack.contains(term.as_str()))
        .take(6)
        .cloned()
        .collect()
}

fn significant_backlink_terms(value: &str) -> Vec<String> {
    let mut raw_terms = Vec::new();
    let mut current = String::new();
    for ch in value.chars() {
        if ch.is_alphanumeric() {
            current.push(ch);
        } else if !current.is_empty() {
            raw_terms.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        raw_terms.push(current);
    }

    let mut seen = HashSet::new();
    let mut terms = Vec::new();
    for raw in raw_terms {
        let term = raw.to_lowercase();
        if term.chars().count() < 4 || is_backlink_stopword(&term) {
            continue;
        }
        if seen.insert(term.clone()) {
            terms.push(term);
        }
    }
    terms
}

fn is_backlink_stopword(term: &str) -> bool {
    matches!(
        term,
        "about"
            | "after"
            | "analysis"
            | "body"
            | "context"
            | "evidence"
            | "from"
            | "into"
            | "journal"
            | "note"
            | "notes"
            | "point"
            | "report"
            | "source"
            | "that"
            | "this"
            | "with"
            | "without"
    )
}

fn backlink_suggestion_reason(
    exact_title_match: bool,
    target_title: &str,
    matched_terms: &[String],
    query: &str,
) -> String {
    if exact_title_match {
        return format!(
            "Unlinked mention candidate: matched target title \"{}\"",
            compact_preview(target_title, 80)
        );
    }
    if !matched_terms.is_empty() {
        return format!(
            "Unlinked mention candidate: matched target terms {}",
            matched_terms
                .iter()
                .take(4)
                .cloned()
                .collect::<Vec<_>>()
                .join(", ")
        );
    }
    format!("Unlinked mention candidate: matched query \"{query}\"")
}

fn asset_relation_exists(
    conn: &Connection,
    left_kind: &str,
    left_id: &str,
    right_kind: &str,
    right_id: &str,
) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM asset_relations
         WHERE (from_kind = ?1 AND from_id = ?2 AND to_kind = ?3 AND to_id = ?4)
            OR (from_kind = ?3 AND from_id = ?4 AND to_kind = ?1 AND to_id = ?2)",
        params![left_kind, left_id, right_kind, right_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

fn normalize_search_assets_limit(limit: Option<i64>) -> usize {
    limit.unwrap_or(40).clamp(1, 100) as usize
}

fn normalize_block_reference_limit(limit: Option<i64>) -> usize {
    limit.unwrap_or(24).clamp(1, 50) as usize
}

fn normalize_retrieval_context_limit(limit: Option<i64>) -> usize {
    limit.unwrap_or(8).clamp(1, 20) as usize
}

fn normalize_retrieval_context_item_chars(max_chars_per_item: Option<i64>) -> usize {
    max_chars_per_item.unwrap_or(700).clamp(120, 2_000) as usize
}

fn source_reference_title(source: &SourceSummaryRecord) -> String {
    first_non_empty([source.title.as_deref(), Some(source.canonical_uri.as_str())])
        .unwrap_or(source.id.as_str())
        .to_string()
}

fn point_reference_title(point: &StoredPoint) -> String {
    first_non_empty([
        point.tag_type.as_deref(),
        point.source_doc_name.as_deref(),
        Some(point.content.as_str()),
    ])
    .map(|value| compact_preview(value, 96))
    .unwrap_or_else(|| point.id.clone())
}

fn block_reference_card_from_draft(
    draft: BlockReferenceDraft,
    query_terms: &[String],
) -> BlockReferenceCard {
    let (matched_terms, matched_fields, match_score) =
        block_reference_match_signals(&draft, query_terms);
    let excerpt_source = if draft.text.trim().is_empty() {
        draft.title.clone()
    } else {
        draft.text.clone()
    };
    let excerpt = compact_preview(&excerpt_source, 700);
    let block_hash = stable_text_hash(&excerpt_source);
    let reason = if query_terms.is_empty() {
        format!("Block-level reference from {}.", draft.locator)
    } else if matched_terms.is_empty() {
        format!(
            "Related block from {}; no query terms matched directly.",
            draft.locator
        )
    } else {
        format!(
            "Matched {} query term(s) in {}.",
            matched_terms.len(),
            matched_fields.join(", ")
        )
    };
    let score = round_search_ranking_number(draft.base_score + match_score);
    BlockReferenceCard {
        index: 0,
        block_kind: draft.block_kind,
        asset_kind: draft.asset_kind,
        asset_id: draft.asset_id,
        block_id: draft.block_id,
        title: draft.title,
        excerpt,
        locator: draft.locator,
        source_id: draft.source_id,
        chunk_index: draft.chunk_index,
        matched_terms,
        matched_fields,
        reason,
        score,
        command_name: draft.command_name,
        wrapper_name: draft.wrapper_name,
        input_json: draft.input_json,
        metadata_json: draft.metadata_json,
        block_hash,
    }
}

fn block_reference_match_signals(
    draft: &BlockReferenceDraft,
    query_terms: &[String],
) -> (Vec<String>, Vec<String>, f64) {
    let fields = [
        ("title", draft.title.as_str(), 2.0),
        ("text", draft.text.as_str(), 1.6),
        ("locator", draft.locator.as_str(), 0.7),
        ("metadata", draft.metadata_json.as_str(), 0.5),
        ("blockKind", draft.block_kind.as_str(), 0.3),
    ];
    let mut matched_terms = Vec::new();
    let mut matched_fields = Vec::new();
    let mut score = 0.0;

    for term in query_terms {
        let mut term_score = 0.0;
        for (field, value, weight) in fields {
            let hits = search_ranking_term_hits(value, term);
            if hits > 0 {
                push_unique_string(&mut matched_fields, field);
                term_score += weight * hits.min(3) as f64;
            }
        }
        if term_score > 0.0 {
            push_unique_string(&mut matched_terms, term);
            score += term_score * search_ranking_term_weight(term);
        }
    }

    (
        matched_terms,
        matched_fields,
        round_search_ranking_number(score / 10.0),
    )
}

fn board_snapshot_node_from_card(index: i64, card: &BlockReferenceCard) -> BoardSnapshotNode {
    let lane = board_snapshot_lane(card);
    let lane_index = match lane.as_str() {
        "sources" => 0,
        "claims" => 1,
        "reports" => 2,
        "memory" => 3,
        _ => 4,
    };
    BoardSnapshotNode {
        index,
        node_id: format!("node_{index}"),
        lane,
        x: lane_index * 360,
        y: ((index - 1) % 12) * 180,
        asset_kind: card.asset_kind.clone(),
        asset_id: card.asset_id.clone(),
        block_kind: card.block_kind.clone(),
        block_id: card.block_id.clone(),
        title: card.title.clone(),
        excerpt: card.excerpt.clone(),
        locator: card.locator.clone(),
        command_name: card.command_name.clone(),
        wrapper_name: card.wrapper_name.clone(),
        input_json: card.input_json.clone(),
        block_hash: card.block_hash.clone(),
    }
}

fn board_snapshot_lane(card: &BlockReferenceCard) -> String {
    match card.asset_kind.as_str() {
        "source" | "indexed_file" => "sources",
        "point" | "evidence" => "claims",
        "report" => "reports",
        "journal" => "memory",
        "gallery" => "media",
        _ => "other",
    }
    .to_string()
}

fn board_snapshot_edges(
    manifest: &BlockReferenceManifest,
    nodes: &[BoardSnapshotNode],
) -> Vec<BoardSnapshotEdge> {
    let root_node = nodes
        .iter()
        .find(|node| node.asset_kind == manifest.root_kind && node.asset_id == manifest.root_id)
        .or_else(|| nodes.first());
    let Some(root_node) = root_node else {
        return Vec::new();
    };
    nodes
        .iter()
        .filter(|node| node.node_id != root_node.node_id)
        .map(|node| BoardSnapshotEdge {
            from_node_id: root_node.node_id.clone(),
            to_node_id: node.node_id.clone(),
            relation: "references".to_string(),
            reason: format!(
                "{} is included in the board snapshot for {}:{}",
                node.block_kind, manifest.root_kind, manifest.root_id
            ),
        })
        .collect()
}

fn board_snapshot_markdown(
    title: &str,
    manifest: &BlockReferenceManifest,
    nodes: &[BoardSnapshotNode],
    edges: &[BoardSnapshotEdge],
) -> String {
    let mut lines = vec![
        format!("# Board Snapshot: {title}"),
        String::new(),
        format!("- Root: `{}:{}`", manifest.root_kind, manifest.root_id),
        format!("- Nodes: {}", nodes.len()),
        format!("- Edges: {}", edges.len()),
        "- Source inspiration: AFFiNE canvas snapshots + AppFlowy board views refined into Thepoint Round 17".to_string(),
        String::new(),
        "```mermaid".to_string(),
        "flowchart LR".to_string(),
    ];

    for node in nodes {
        let label = board_snapshot_mermaid_label(node);
        lines.push(format!("  {}[\"{}\"]", node.node_id, label));
    }
    for edge in edges {
        lines.push(format!(
            "  {} -->|{}| {}",
            edge.from_node_id,
            edge.relation,
            edge.to_node_id
        ));
    }
    lines.push("```".to_string());
    lines.push(String::new());
    lines.push("## Cards".to_string());
    for node in nodes {
        lines.push(format!(
            "{}. **{}** `{}`",
            node.index, node.title, node.block_kind
        ));
        lines.push(format!("   - Lane: `{}`", node.lane));
        lines.push(format!("   - Locator: {}", node.locator));
        lines.push(format!(
            "   - Action: `{}` via `{}`",
            node.command_name, node.wrapper_name
        ));
        lines.push(format!("   - Excerpt: {}", node.excerpt));
    }
    if !manifest.warnings.is_empty() {
        lines.push(String::new());
        lines.push("## Warnings".to_string());
        for warning in &manifest.warnings {
            lines.push(format!("- {warning}"));
        }
    }
    lines.join("\n")
}

fn board_snapshot_mermaid_label(node: &BoardSnapshotNode) -> String {
    let title = node
        .title
        .replace('\\', "\\\\")
        .replace('"', "'")
        .replace('[', "(")
        .replace(']', ")");
    let kind = node.block_kind.replace('_', " ");
    compact_preview(&format!("{kind}\\n{title}"), 80)
}

fn explain_search_ranking_item(
    rank: i64,
    result: SearchAssetResult,
    query_terms: &[String],
    top_score: f64,
) -> SearchRankingItemExplanation {
    let (matched_terms, missing_terms, matched_fields, field_match_score) =
        search_ranking_field_match(&result, query_terms);
    let term_coverage = if query_terms.is_empty() {
        0.0
    } else {
        matched_terms.len() as f64 / query_terms.len() as f64
    };
    let (locator_value, locator_reason) = search_ranking_locator_signal(&result);
    let (metadata_value, metadata_reason) = search_ranking_metadata_signal(&result);
    let components = vec![
        search_ranking_component(
            "asset_kind_prior",
            result.score,
            1.0,
            result.score,
            true,
            "Current search_assets ordering uses this coarse asset-kind score before kind/title tie-breaks.",
        ),
        search_ranking_component(
            "term_coverage",
            term_coverage,
            0.15,
            term_coverage * 0.15,
            false,
            "Diagnostic: share of normalized query terms visible in the returned title/snippet/preview/metadata.",
        ),
        search_ranking_component(
            "field_match",
            field_match_score,
            0.10,
            field_match_score * 0.10,
            false,
            "Diagnostic: weighted visible-field matches, inspired by marginalia metadata field scoring.",
        ),
        search_ranking_component(
            "source_locator",
            locator_value,
            0.05,
            locator_value * 0.05,
            false,
            &locator_reason,
        ),
        search_ranking_component(
            "metadata_quality",
            metadata_value,
            0.05,
            metadata_value * 0.05,
            false,
            &metadata_reason,
        ),
    ];

    SearchRankingItemExplanation {
        rank,
        kind: result.kind,
        id: result.id,
        title: result.title,
        score: round_search_ranking_number(result.score),
        score_delta_from_top: round_search_ranking_number((top_score - result.score).max(0.0)),
        reason: result.reason,
        matched_terms,
        missing_terms,
        matched_fields,
        components,
        source_id: result.source_id,
        chunk_index: result.chunk_index,
        metadata_json: result.metadata_json,
    }
}

fn search_ranking_component(
    name: &str,
    value: f64,
    weight: f64,
    contribution: f64,
    used_for_ranking: bool,
    reason: &str,
) -> SearchRankingComponent {
    SearchRankingComponent {
        name: name.to_string(),
        value: round_search_ranking_number(value),
        weight: round_search_ranking_number(weight),
        contribution: round_search_ranking_number(contribution),
        used_for_ranking,
        reason: reason.to_string(),
    }
}

fn search_ranking_field_match(
    result: &SearchAssetResult,
    query_terms: &[String],
) -> (Vec<String>, Vec<String>, Vec<String>, f64) {
    let preview = result.preview.clone().unwrap_or_default();
    let fields = [
        ("title", result.title.as_str(), 2.4),
        ("snippet", result.snippet.as_str(), 1.6),
        ("preview", preview.as_str(), 1.2),
        ("metadata", result.metadata_json.as_str(), 0.8),
        ("reason", result.reason.as_str(), 0.4),
        ("kind", result.kind.as_str(), 0.2),
    ];
    let mut matched_terms = Vec::new();
    let mut missing_terms = Vec::new();
    let mut matched_fields = Vec::new();
    let mut score = 0.0;

    for term in query_terms {
        let mut term_score = 0.0;
        for (field, value, weight) in fields {
            let hits = search_ranking_term_hits(value, term);
            if hits > 0 {
                push_unique_string(&mut matched_fields, field);
                term_score += weight * hits.min(3) as f64;
            }
        }
        if term_score > 0.0 {
            push_unique_string(&mut matched_terms, term);
            score += term_score * search_ranking_term_weight(term);
        } else {
            push_unique_string(&mut missing_terms, term);
        }
    }

    (
        matched_terms,
        missing_terms,
        matched_fields,
        score.min(12.0),
    )
}

fn search_ranking_locator_signal(result: &SearchAssetResult) -> (f64, String) {
    let mut value = 0.0;
    let mut parts = Vec::new();
    if result.source_id.is_some() {
        value += 0.7;
        parts.push("sourceId present");
    }
    if result.chunk_index.is_some() {
        value += 0.3;
        parts.push("chunkIndex present");
    }
    if parts.is_empty() {
        (
            0.0,
            "Diagnostic: result has no source/chunk locator.".to_string(),
        )
    } else {
        (
            value,
            format!(
                "Diagnostic: result can navigate back to source context ({})",
                parts.join(", ")
            ),
        )
    }
}

fn search_ranking_metadata_signal(result: &SearchAssetResult) -> (f64, String) {
    let parsed = serde_json::from_str::<serde_json::Value>(&result.metadata_json).ok();
    match result.kind.as_str() {
        "indexed_file" => {
            let read_status = parsed
                .as_ref()
                .and_then(|value| value.get("readStatus"))
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");
            let index_status = parsed
                .as_ref()
                .and_then(|value| value.get("indexStatus"))
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");
            let descriptor_kind = parsed
                .as_ref()
                .and_then(|value| value.get("descriptorKind"))
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");
            if read_status == "missing" || index_status == "stale" {
                return (
                    -1.0,
                    "Diagnostic: indexed file appears missing or stale.".to_string(),
                );
            }
            if read_status == "failed" || index_status == "failed" {
                return (
                    -0.8,
                    "Diagnostic: indexed file has a failed scan state.".to_string(),
                );
            }
            if descriptor_kind == "metadata_only" || index_status == "partial" {
                return (
                    -0.35,
                    "Diagnostic: indexed file has partial or metadata-only coverage.".to_string(),
                );
            }
            if result.source_id.is_some() {
                return (
                    0.4,
                    "Diagnostic: indexed file has generated source context.".to_string(),
                );
            }
            (
                0.1,
                "Diagnostic: indexed-file metadata is available.".to_string(),
            )
        }
        "report" => {
            let report_kind = parsed
                .as_ref()
                .and_then(|value| value.get("reportKind"))
                .and_then(serde_json::Value::as_str)
                .unwrap_or("");
            if report_kind == "investigation" {
                (
                    0.25,
                    "Diagnostic: investigation reports are high-value retrieval context."
                        .to_string(),
                )
            } else {
                (
                    0.1,
                    "Diagnostic: report kind metadata is available.".to_string(),
                )
            }
        }
        "evidence" => (
            parsed
                .as_ref()
                .and_then(|value| value.get("verdict"))
                .and_then(serde_json::Value::as_str)
                .map(|_| 0.2)
                .unwrap_or(0.0),
            "Diagnostic: Evidence verdict metadata helps downstream filtering.".to_string(),
        ),
        "gallery" => (
            parsed
                .as_ref()
                .and_then(|value| value.get("pointCount"))
                .and_then(serde_json::Value::as_i64)
                .map(|count| if count > 0 { 0.2 } else { 0.0 })
                .unwrap_or(0.0),
            "Diagnostic: Gallery links to Points improve explainability.".to_string(),
        ),
        _ => (
            0.0,
            "Diagnostic: no extra metadata quality signal.".to_string(),
        ),
    }
}

fn search_ranking_terms(query: &str) -> Vec<String> {
    let mut terms = Vec::new();
    push_search_ranking_term(&mut terms, query);
    let mut current = String::new();
    for ch in query.chars() {
        if ch.is_alphanumeric() || search_ranking_is_cjk_char(ch) {
            current.push(ch);
        } else if !current.is_empty() {
            push_search_ranking_term(&mut terms, &current);
            current.clear();
        }
    }
    if !current.is_empty() {
        push_search_ranking_term(&mut terms, &current);
    }
    terms
}

fn push_search_ranking_term(terms: &mut Vec<String>, raw: &str) {
    let term = raw.trim().trim_matches(|ch: char| {
        matches!(
            ch,
            '.' | ',' | ';' | ':' | '!' | '?' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\''
        )
    });
    if term.is_empty() {
        return;
    }
    let key = term.to_lowercase();
    if is_search_ranking_stopword(&key) {
        return;
    }
    let has_digit = term.chars().any(|ch| ch.is_ascii_digit());
    let has_upper = term.chars().any(|ch| ch.is_uppercase());
    if term.chars().count() < 4 && !has_digit && !has_upper && !search_ranking_contains_cjk(term) {
        return;
    }
    if !terms.iter().any(|existing| existing.to_lowercase() == key) {
        terms.push(term.to_string());
    }
}

fn is_search_ranking_stopword(term: &str) -> bool {
    matches!(
        term,
        "about"
            | "after"
            | "and"
            | "are"
            | "does"
            | "from"
            | "have"
            | "into"
            | "than"
            | "that"
            | "the"
            | "their"
            | "this"
            | "with"
    )
}

fn search_ranking_term_hits(raw: &str, term: &str) -> usize {
    let needle = term.to_lowercase();
    if needle.is_empty() {
        return 0;
    }
    raw.to_lowercase().matches(&needle).count()
}

fn search_ranking_term_weight(term: &str) -> f64 {
    let mut weight = 1.0;
    if term.chars().count() >= 7 {
        weight += 0.35;
    }
    if term.chars().any(|ch| ch.is_ascii_digit()) {
        weight += 0.6;
    }
    if term.chars().any(|ch| ch.is_uppercase()) {
        weight += 0.4;
    }
    if term.chars().any(|ch| "/+-_.".contains(ch)) {
        weight += 0.3;
    }
    weight
}

fn search_ranking_contains_cjk(term: &str) -> bool {
    term.chars().any(search_ranking_is_cjk_char)
}

fn search_ranking_is_cjk_char(ch: char) -> bool {
    ('\u{3040}'..='\u{30ff}').contains(&ch)
        || ('\u{3400}'..='\u{4dbf}').contains(&ch)
        || ('\u{4e00}'..='\u{9fff}').contains(&ch)
        || ('\u{ac00}'..='\u{d7a3}').contains(&ch)
        || ('\u{f900}'..='\u{faff}').contains(&ch)
}

fn push_unique_string(items: &mut Vec<String>, value: &str) {
    if !items.iter().any(|item| item == value) {
        items.push(value.to_string());
    }
}

fn round_search_ranking_number(value: f64) -> f64 {
    (value * 10_000.0).round() / 10_000.0
}

fn normalize_saved_asset_search_input(
    input: SaveAssetSearchInput,
) -> Result<(String, String, Vec<String>, Option<String>, i64)> {
    let name = required_trimmed("saved search name", &input.name)?.to_string();
    let query = required_trimmed("saved search query", &input.query)?.to_string();
    let filter = optional_trimmed(input.filter.as_deref());
    let parsed_filter = parse_search_asset_filter(filter.as_deref())?;
    let kinds = normalize_saved_search_kinds(input.kinds)?;
    if !kinds.is_empty()
        && search_asset_allowed_kinds(Some(&kinds), parsed_filter.as_ref()).is_empty()
    {
        anyhow::bail!("saved search kinds conflict with the saved filter");
    }
    let limit = normalize_search_assets_limit(input.limit) as i64;
    Ok((name, query, kinds, filter, limit))
}

fn normalize_saved_search_kinds(kinds: Option<Vec<String>>) -> Result<Vec<String>> {
    let Some(values) = kinds else {
        return Ok(Vec::new());
    };
    let mut saw_explicit_kind = false;
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for value in values {
        let kind = value.trim();
        if kind.is_empty() {
            continue;
        }
        saw_explicit_kind = true;
        if valid_search_asset_kind(kind) && seen.insert(kind.to_string()) {
            normalized.push(kind.to_string());
        }
    }
    if saw_explicit_kind && normalized.is_empty() {
        anyhow::bail!("saved search must include at least one valid asset kind");
    }
    Ok(normalized)
}

#[allow(clippy::type_complexity)]
struct NormalizedRetrievalProfileInput {
    name: String,
    description: Option<String>,
    query: String,
    kinds: Vec<String>,
    filter: Option<String>,
    saved_search_id: Option<String>,
    limit: i64,
    max_chars_per_item: i64,
    min_score: f64,
    mode: String,
}

fn normalize_retrieval_profile_input(
    conn: &Connection,
    input: SaveRetrievalProfileInput,
) -> Result<NormalizedRetrievalProfileInput> {
    let name = required_trimmed("retrieval profile name", &input.name)?.to_string();
    let description = optional_trimmed(input.description.as_deref());
    let query = optional_trimmed(Some(input.query.as_str())).unwrap_or_default();
    let filter = optional_trimmed(input.filter.as_deref());
    let parsed_filter = parse_search_asset_filter(filter.as_deref())?;
    let kinds = normalize_saved_search_kinds(input.kinds)?;
    let saved_search_id = optional_trimmed(input.saved_search_id.as_deref());
    let saved_search = match saved_search_id.as_deref() {
        Some(id) => Some(get_saved_asset_search(conn, id)?.ok_or_else(|| {
            anyhow::anyhow!("saved search not found for retrieval profile: {id}")
        })?),
        None => None,
    };
    let effective_query = query
        .is_empty()
        .then(|| saved_search.as_ref().map(|search| search.query.clone()))
        .flatten()
        .unwrap_or_else(|| query.clone());
    if effective_query.trim().is_empty() {
        anyhow::bail!("retrieval profile query is required unless savedSearchId supplies one");
    }

    let effective_kinds = if kinds.is_empty() {
        saved_search
            .as_ref()
            .map(|search| search.kinds.clone())
            .unwrap_or_default()
    } else {
        kinds.clone()
    };
    let effective_filter = filter.clone().or_else(|| {
        saved_search
            .as_ref()
            .and_then(|search| search.filter.clone())
    });
    let effective_filter = parse_search_asset_filter(effective_filter.as_deref())?;
    if !effective_kinds.is_empty()
        && search_asset_allowed_kinds(Some(&effective_kinds), effective_filter.as_ref()).is_empty()
    {
        anyhow::bail!("retrieval profile kinds conflict with the effective filter");
    }
    if !kinds.is_empty()
        && search_asset_allowed_kinds(Some(&kinds), parsed_filter.as_ref()).is_empty()
    {
        anyhow::bail!("retrieval profile kinds conflict with the profile filter");
    }

    let limit = normalize_retrieval_context_limit(input.limit) as i64;
    let max_chars = normalize_retrieval_context_item_chars(input.max_chars_per_item) as i64;
    let min_score = normalize_retrieval_profile_min_score(input.min_score);
    let mode = normalize_retrieval_profile_mode(input.mode.as_deref());
    Ok(NormalizedRetrievalProfileInput {
        name,
        description,
        query,
        kinds,
        filter,
        saved_search_id,
        limit,
        max_chars_per_item: max_chars,
        min_score,
        mode,
    })
}

fn normalize_retrieval_profile_min_score(value: Option<f64>) -> f64 {
    value.unwrap_or(0.0).clamp(0.0, 1.0)
}

fn normalize_retrieval_profile_mode(value: Option<&str>) -> String {
    match optional_trimmed(value).as_deref() {
        Some("automatic") => "automatic".to_string(),
        Some("query") => "query".to_string(),
        Some("chat") => "chat".to_string(),
        _ => "automatic".to_string(),
    }
}

fn refresh_retrieval_context_stats(context: &mut RetrievalContext) {
    let mut total_chars = 0i64;
    for (index, item) in context.items.iter_mut().enumerate() {
        item.index = index as i64 + 1;
        total_chars += item.excerpt.chars().count() as i64;
    }
    context.item_count = context.items.len() as i64;
    context.total_chars = total_chars;
    if context.items.is_empty()
        && !context
            .warnings
            .iter()
            .any(|warning| warning == "no retrieval matches")
    {
        context.warnings.push("no retrieval matches".to_string());
    }
}

fn parse_search_asset_filter(filter: Option<&str>) -> Result<Option<SearchAssetFilter>> {
    let Some(filter) = filter.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let Some((field, raw_value)) = filter.split_once("==") else {
        anyhow::bail!("unsupported search filter: expected field == \"value\"");
    };
    let field = field.trim();
    let raw_value = raw_value.trim();
    if raw_value.len() < 2 || !raw_value.starts_with('"') || !raw_value.ends_with('"') {
        anyhow::bail!("unsupported search filter: value must be quoted");
    }
    let value = &raw_value[1..raw_value.len() - 1];
    if value.contains('"') {
        anyhow::bail!("unsupported search filter: quoted values cannot contain quotes");
    }

    match field {
        "kind" if valid_search_asset_kind(value) => {
            Ok(Some(SearchAssetFilter::Kind(value.to_string())))
        }
        "kind" => anyhow::bail!("unsupported search filter kind: {value}"),
        "reportKind" if value == "investigation" => {
            Ok(Some(SearchAssetFilter::ReportKind(value.to_string())))
        }
        "reportKind" => anyhow::bail!("unsupported search filter reportKind: {value}"),
        "sourceKind" if value == "indexed_folder" => {
            Ok(Some(SearchAssetFilter::SourceKind(value.to_string())))
        }
        "sourceKind" => anyhow::bail!("unsupported search filter sourceKind: {value}"),
        _ => anyhow::bail!("unsupported search filter field: {field}"),
    }
}

fn search_asset_allowed_kinds(
    input_kinds: Option<&[String]>,
    filter: Option<&SearchAssetFilter>,
) -> HashSet<String> {
    let mut kinds: HashSet<String> = match input_kinds {
        Some(values) => values
            .iter()
            .map(|value| value.trim())
            .filter(|value| valid_search_asset_kind(value))
            .map(str::to_string)
            .collect(),
        None => SEARCH_ASSET_KINDS
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
    };

    match filter {
        Some(SearchAssetFilter::Kind(kind)) => {
            kinds.retain(|value| value == kind);
        }
        Some(SearchAssetFilter::ReportKind(_)) => {
            kinds.retain(|value| value == "report");
        }
        Some(SearchAssetFilter::SourceKind(source_kind)) if source_kind == "indexed_folder" => {
            kinds.retain(|value| value == "indexed_file");
        }
        Some(SearchAssetFilter::SourceKind(_)) | None => {}
    }
    kinds
}

const SEARCH_ASSET_KINDS: [&str; 7] = [
    "source",
    "point",
    "evidence",
    "report",
    "journal",
    "gallery",
    "indexed_file",
];

fn valid_search_asset_kind(kind: &str) -> bool {
    SEARCH_ASSET_KINDS.contains(&kind)
}

fn first_non_empty<'a>(values: impl IntoIterator<Item = Option<&'a str>>) -> Option<&'a str> {
    values
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|value| !value.is_empty())
}

fn compact_preview(value: &str, max_chars: usize) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let char_count = normalized.chars().count();
    if char_count <= max_chars {
        return normalized;
    }
    let mut preview = normalized.chars().take(max_chars).collect::<String>();
    preview.push('…');
    preview
}

// Staged DB API for the next command/UI slice; this data-layer task does not wire callers yet.
#[allow(dead_code)]
pub fn save_evidence(conn: &mut Connection, input: SaveEvidenceInput) -> Result<EvidenceRecord> {
    let now = chrono::Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let claim = required_trimmed("claim", &input.claim)?.to_string();
    let verdict = input.verdict.trim().to_string();
    validate_evidence_verdict(&verdict)?;
    let answer = required_trimmed("answer", &input.answer)?.to_string();
    let reasoning = optional_trimmed(input.reasoning.as_deref());
    let context = optional_trimmed(input.context.as_deref());
    let point_id = optional_trimmed(input.point_id.as_deref());
    let source_id = optional_trimmed(input.source_id.as_deref());
    let checked_at = optional_trimmed(input.checked_at.as_deref()).unwrap_or_else(|| now.clone());
    let chunk_index = input.chunk_index;

    let mut sources = Vec::with_capacity(input.sources.len());
    for source in input.sources {
        let url = required_trimmed("source url", &source.url)?.to_string();
        let stance = source.stance.trim().to_string();
        validate_evidence_stance(&stance)?;
        sources.push((
            optional_trimmed(source.title.as_deref()),
            url,
            optional_trimmed(source.snippet.as_deref()),
            stance,
        ));
    }

    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO evidence_records
            (id, claim, verdict, answer, reasoning, context, point_id, source_id, chunk_index, checked_at, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![id, claim, verdict, answer, reasoning, context, point_id, source_id, chunk_index, checked_at, now],
    )?;

    for (title, url, snippet, stance) in sources {
        tx.execute(
            "INSERT INTO evidence_sources (id, evidence_id, title, url, snippet, stance, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![uuid::Uuid::new_v4().to_string(), id, title, url, snippet, stance, now],
        )?;
    }

    tx.commit()?;
    get_evidence(conn, &id)?.ok_or_else(|| anyhow::anyhow!("saved evidence not found: {id}"))
}

#[allow(dead_code)]
pub fn get_evidence(conn: &Connection, evidence_id: &str) -> Result<Option<EvidenceRecord>> {
    if evidence_id.trim().is_empty() {
        return Ok(None);
    }

    let mut stmt = conn.prepare(
        "SELECT id, claim, verdict, answer, reasoning, context, point_id, source_id, chunk_index, checked_at, created_at
         FROM evidence_records
         WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![evidence_id])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };

    let mut record = map_evidence_row(row)?;
    record.sources = list_evidence_sources(conn, &record.id)?;
    Ok(Some(record))
}

#[allow(dead_code)]
pub fn list_evidence_for_point(conn: &Connection, point_id: &str) -> Result<Vec<EvidenceRecord>> {
    if point_id.trim().is_empty() {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT id, claim, verdict, answer, reasoning, context, point_id, source_id, chunk_index, checked_at, created_at
         FROM evidence_records
         WHERE point_id = ?1
         ORDER BY checked_at DESC, created_at DESC",
    )?;
    let rows = stmt.query_map(params![point_id], map_evidence_row)?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    hydrate_evidence_records(conn, records)
}

#[allow(dead_code)]
pub fn list_evidence_for_source(conn: &Connection, source_id: &str) -> Result<Vec<EvidenceRecord>> {
    if source_id.trim().is_empty() {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT id, claim, verdict, answer, reasoning, context, point_id, source_id, chunk_index, checked_at, created_at
         FROM evidence_records
         WHERE source_id = ?1
         ORDER BY checked_at DESC, created_at DESC",
    )?;
    let rows = stmt.query_map(params![source_id], map_evidence_row)?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    hydrate_evidence_records(conn, records)
}

#[allow(dead_code)]
pub fn list_recent_evidence(conn: &Connection, limit: usize) -> Result<Vec<EvidenceRecord>> {
    if limit == 0 {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT id, claim, verdict, answer, reasoning, context, point_id, source_id, chunk_index, checked_at, created_at
         FROM evidence_records
         ORDER BY checked_at DESC, created_at DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit as i64], map_evidence_row)?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    hydrate_evidence_records(conn, records)
}

#[allow(dead_code)]
pub fn search_evidence(
    conn: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<EvidenceRecord>> {
    let trimmed = query.trim();
    if trimmed.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    let pattern = format!("%{}%", escape_like(trimmed));
    let mut stmt = conn.prepare(
        "SELECT DISTINCT e.id, e.claim, e.verdict, e.answer, e.reasoning, e.context,
                e.point_id, e.source_id, e.chunk_index, e.checked_at, e.created_at
         FROM evidence_records e
         LEFT JOIN evidence_sources s ON s.evidence_id = e.id
         WHERE e.claim LIKE ?1 ESCAPE '\\'
            OR e.answer LIKE ?1 ESCAPE '\\'
            OR e.reasoning LIKE ?1 ESCAPE '\\'
            OR e.context LIKE ?1 ESCAPE '\\'
            OR s.title LIKE ?1 ESCAPE '\\'
            OR s.url LIKE ?1 ESCAPE '\\'
            OR s.snippet LIKE ?1 ESCAPE '\\'
            OR s.stance LIKE ?1 ESCAPE '\\'
         ORDER BY e.checked_at DESC, e.created_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![pattern, limit as i64], map_evidence_row)?;
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    hydrate_evidence_records(conn, records)
}

#[allow(dead_code)]
fn hydrate_evidence_records(
    conn: &Connection,
    mut records: Vec<EvidenceRecord>,
) -> Result<Vec<EvidenceRecord>> {
    for record in &mut records {
        record.sources = list_evidence_sources(conn, &record.id)?;
    }
    Ok(records)
}

#[allow(dead_code)]
fn list_evidence_sources(
    conn: &Connection,
    evidence_id: &str,
) -> Result<Vec<EvidenceSourceRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, evidence_id, title, url, snippet, stance, created_at
         FROM evidence_sources
         WHERE evidence_id = ?1
         ORDER BY created_at, id",
    )?;
    let rows = stmt.query_map(params![evidence_id], map_evidence_source_row)?;
    let mut sources = Vec::new();
    for row in rows {
        sources.push(row?);
    }
    Ok(sources)
}

pub fn save_report(conn: &Connection, input: SaveReportInput) -> Result<ReportRecord> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let title = required_trimmed("report title", &input.title)?.to_string();
    let kind = input.kind.trim().to_string();
    validate_report_kind(&kind)?;
    let source_name = optional_trimmed(input.source_name.as_deref());
    let body_md = required_trimmed("report body", &input.body_md)?.to_string();
    let summary = required_trimmed("report summary", &input.summary)?.to_string();
    let citations_json = normalize_report_citations_json(&input.citations_json)?;

    conn.execute(
        "INSERT INTO reports (id, title, kind, source_name, body_md, summary, citations_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, title, kind, source_name, body_md, summary, citations_json, now],
    )?;

    get_report(conn, &id)?.ok_or_else(|| anyhow::anyhow!("saved report not found: {id}"))
}

pub fn replace_report_audit_rows(
    conn: &Connection,
    report_id: &str,
    claims: Vec<SaveReportClaimInput>,
    citations: Vec<SaveReportCitationInput>,
) -> Result<ReportAuditRecord> {
    let report_id = required_trimmed("report id", report_id)?;
    conn.execute(
        "DELETE FROM report_claims WHERE report_id = ?1",
        params![report_id],
    )?;
    conn.execute(
        "DELETE FROM report_citations WHERE report_id = ?1",
        params![report_id],
    )?;

    let now = chrono::Utc::now().to_rfc3339();
    for citation in citations {
        validate_report_citation_input(&citation)?;
        conn.execute(
            "INSERT INTO report_citations
                (id, report_id, citation_index, target_kind, target_id, label, title, quote,
                 excerpt, reason, source_id, chunk_index, source_text_hash, span_start, span_end,
                 locator_status, match_count, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![
                uuid::Uuid::new_v4().to_string(),
                report_id,
                citation.citation_index,
                citation.target_kind.trim(),
                citation.target_id.trim(),
                optional_trimmed(citation.label.as_deref()),
                optional_trimmed(citation.title.as_deref()),
                optional_trimmed(citation.quote.as_deref()),
                optional_trimmed(citation.excerpt.as_deref()),
                optional_trimmed(citation.reason.as_deref()),
                optional_trimmed(citation.source_id.as_deref()),
                citation.chunk_index,
                optional_trimmed(citation.source_text_hash.as_deref()),
                citation.span_start,
                citation.span_end,
                citation.locator_status.trim(),
                citation.match_count.max(0),
                now,
            ],
        )?;
    }

    for claim in claims {
        validate_report_claim_input(&claim)?;
        conn.execute(
            "INSERT INTO report_claims
                (id, report_id, claim_index, claim_text, claim_status, citation_labels_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                uuid::Uuid::new_v4().to_string(),
                report_id,
                claim.claim_index,
                claim.claim_text.trim(),
                claim.claim_status.trim(),
                json_string_array(claim.citation_labels),
                now,
            ],
        )?;
    }

    load_report_audit(conn, report_id)?
        .ok_or_else(|| anyhow::anyhow!("report audit report not found: {report_id}"))
}

pub fn load_report_audit(conn: &Connection, report_id: &str) -> Result<Option<ReportAuditRecord>> {
    let report_id = report_id.trim();
    if report_id.is_empty() {
        return Ok(None);
    }
    if get_report(conn, report_id)?.is_none() {
        return Ok(None);
    }
    let claims = list_report_claims(conn, report_id)?;
    let citations = list_report_citations(conn, report_id)?;
    let coverage = report_audit_coverage(&claims, &citations);
    Ok(Some(ReportAuditRecord {
        report_id: report_id.to_string(),
        claims,
        citations,
        coverage,
    }))
}

pub fn run_investigation_qa_eval(
    conn: &Connection,
    input: InvestigationQaEvalInput,
) -> Result<InvestigationQaEvalReport> {
    let generated_at = chrono::Utc::now().to_rfc3339();
    let limit = normalize_investigation_qa_eval_limit(input.limit);
    let reports = if let Some(report_id) = optional_trimmed(input.report_id.as_deref()) {
        get_report(conn, &report_id)?.into_iter().collect::<Vec<_>>()
    } else {
        list_recent_reports(conn, limit.saturating_mul(4).min(200))?
    };
    let mut cases = Vec::new();
    for report in reports
        .into_iter()
        .filter(|report| report.kind == "investigation")
        .take(limit)
    {
        let Some(audit) = load_report_audit(conn, &report.id)? else {
            continue;
        };
        cases.push(investigation_qa_eval_case(&report, &audit));
    }

    let pass_count = cases.iter().filter(|case| case.status == "pass").count() as i64;
    let warning_count = cases
        .iter()
        .filter(|case| case.status == "warning")
        .count() as i64;
    let fail_count = cases.iter().filter(|case| case.status == "fail").count() as i64;
    let average_score = if cases.is_empty() {
        0.0
    } else {
        cases.iter().map(|case| case.score).sum::<f64>() / cases.len() as f64
    };
    let mut warnings = Vec::new();
    if cases.is_empty() {
        warnings.push("no investigation reports available for QA eval".to_string());
    }

    Ok(InvestigationQaEvalReport {
        generated_at,
        case_count: cases.len() as i64,
        pass_count,
        warning_count,
        fail_count,
        average_score: round_search_ranking_number(average_score),
        cases,
        warnings,
        source_inspiration:
            "Kotaemon multi-document QA evaluation fixtures refined into Thepoint Round 19"
                .to_string(),
    })
}

pub fn build_capability_scorecard() -> CapabilityScorecard {
    let generated_at = chrono::Utc::now().to_rfc3339();
    let items = vec![
        scorecard_item(1, "marginalia / Zotero", "Search Evaluation Harness", "read_only", 0.82, 0.08, &["search_assets"], "Rust eval fixture tracks hit@1/hit@k.", "Extend with MRR/NDCG before ranking changes."),
        scorecard_item(2, "Khoj / Quivr / Kotaemon", "Read-only Agent Retrieval Context", "read_only", 0.86, 0.10, &["build_retrieval_context"], "Rust read-only manifest test plus frontend boundary checks.", "Use as future agent/RAG context contract."),
        scorecard_item(3, "Foam / Logseq", "Backlink & Unlinked Mention Suggestions", "read_only", 0.84, 0.12, &["suggest_backlinks"], "Rust suggestion test verifies no relation writes.", "Add UI review before creating relations."),
        scorecard_item(4, "Zotero", "Citation Quality Dashboard", "read_only", 0.88, 0.12, &["load_citation_quality_dashboard"], "Rust aggregation test covers locator states.", "Surface dashboard in report maintenance UI."),
        scorecard_item(5, "Joplin / SiYuan", "Saved Search / Smart Collections", "write", 0.78, 0.22, &["save_asset_search", "list_saved_asset_searches", "preview_saved_asset_search"], "Rust dynamic preview test covers safe filter semantics.", "Expose saved searches as Library collections."),
        scorecard_item(6, "Memos", "Quick Capture Inbox", "write", 0.80, 0.25, &["save_quick_capture", "resolve_quick_capture", "dismiss_quick_capture"], "Rust transaction test covers resolve targets.", "Add compact inbox UI and review queue handoff."),
        scorecard_item(7, "AFFiNE / AppFlowy", "Template-based Report/Investigation Starters", "draft_only", 0.76, 0.14, &["build_report_starter", "list_report_starter_templates"], "Rust read-only draft test covers context citations.", "Let UI launch Investigation from templates."),
        scorecard_item(8, "marginalia", "Low-quality Asset Reprocess Queue", "read_only", 0.79, 0.10, &["load_reprocess_queue"], "Rust diagnostic test verifies no mutations.", "Connect queue items to explicit reprocess actions."),
        scorecard_item(9, "Zotero", "Duplicate/near-duplicate Asset Detection", "read_only", 0.78, 0.14, &["detect_duplicate_assets"], "Rust duplicate grouping test is read-only.", "Add merge/dismiss workflow only with confirmation."),
        scorecard_item(10, "Logseq / Foam", "Graph Neighborhood Preview", "read_only", 0.83, 0.13, &["build_graph_neighborhood_preview"], "Rust graph preview test covers suggestions and relations.", "Render graph neighborhood panel."),
        scorecard_item(11, "SilverBullet", "Command Palette Manifest", "read_only", 0.74, 0.08, &["list_command_palette_items"], "Rust manifest filter test covers categories/query/limit.", "Build real palette UI from manifest."),
        scorecard_item(12, "AnythingLLM", "Workspace-scoped Retrieval Profiles", "write", 0.82, 0.22, &["save_retrieval_profile", "preview_retrieval_profile"], "Rust profile preview test covers saved-search scope.", "Let Investigation generation select retrieval profiles."),
        scorecard_item(13, "Khoj", "Automation Suggestions", "read_only", 0.85, 0.15, &["load_automation_suggestions"], "Rust aggregation test covers seven categories.", "Add user-confirmed action execution log."),
        scorecard_item(14, "Zotero / Joplin", "Import Diagnostics Ledger", "read_only", 0.81, 0.10, &["load_import_diagnostics_ledger"], "Rust ledger test covers warning/critical scan outcomes.", "Expose import diagnostics beside indexed folders."),
        scorecard_item(15, "marginalia", "Ranking Explainability", "read_only", 0.86, 0.12, &["explain_search_ranking"], "Rust test verifies order is unchanged and components are diagnostic.", "Only tune ranking after extending eval metrics."),
        scorecard_item(16, "SiYuan", "Block-level References", "read_only", 0.88, 0.12, &["build_block_reference_manifest"], "Rust test covers point/source/evidence cards and hashes.", "Render block reference cards in Library/Report UI."),
        scorecard_item(17, "AFFiNE / AppFlowy", "Canvas/Board Snapshot Export", "draft_only", 0.80, 0.13, &["build_board_snapshot_export"], "Rust test covers nodes/edges and Mermaid Markdown.", "Use nodes/edges for a future board snapshot UI."),
        scorecard_item(18, "AppFlowy", "Local-first Sync/Export Audit", "read_only", 0.82, 0.11, &["build_export_sync_audit"], "Rust command test covers needs_config/missing/in_sync/stale.", "Show audit before mirror export/prune."),
        scorecard_item(19, "Kotaemon", "Multi-document QA Eval Fixtures", "read_only", 0.87, 0.14, &["run_investigation_qa_eval"], "Rust eval test covers pass/fail Investigation cases.", "Use eval result as Investigation regression gate."),
        scorecard_item(20, "Cross-project", "Capability Scorecard", "read_only", 0.77, 0.07, &["build_capability_scorecard"], "Rust scorecard test validates all 20 rounds are represented.", "Use this scorecard to choose the next roadmap tranche."),
    ];
    let completed_count = items.iter().filter(|item| item.status == "completed").count() as i64;
    let read_only_count = items
        .iter()
        .filter(|item| item.boundary == "read_only")
        .count() as i64;
    let write_count = items.iter().filter(|item| item.boundary == "write").count() as i64;
    let draft_count = items
        .iter()
        .filter(|item| item.boundary == "draft_only")
        .count() as i64;
    let model_call_count = items
        .iter()
        .filter(|item| item.boundary == "model_call")
        .count() as i64;
    let average_impact_score =
        round_search_ranking_number(items.iter().map(|item| item.impact_score).sum::<f64>() / items.len() as f64);
    let average_risk_score =
        round_search_ranking_number(items.iter().map(|item| item.risk_score).sum::<f64>() / items.len() as f64);

    CapabilityScorecard {
        generated_at,
        item_count: items.len() as i64,
        completed_count,
        read_only_count,
        write_count,
        draft_count,
        model_call_count,
        average_impact_score,
        average_risk_score,
        items,
        recommendations: vec![
            "Promote the read-only diagnostics into UI panels before adding more write workflows.".to_string(),
            "Use Round 01 and Round 19 evals as gates before changing ranking or Investigation generation.".to_string(),
            "Keep write-capable slices behind explicit confirmation and audit logs.".to_string(),
            "Next tranche should focus on UI integration: command palette, diagnostics panels, and block reference cards.".to_string(),
        ],
        source_inspiration:
            "Cross-project capability refinement scorecard for Thepoint Round 20".to_string(),
    }
}

pub fn build_citation_quality_dashboard(
    conn: &Connection,
    limit: Option<i64>,
) -> Result<CitationQualityDashboard> {
    let limit = normalize_citation_quality_dashboard_limit(limit);
    let reports = list_recent_reports(conn, limit)?;
    let report_count = reports.len().min(i64::MAX as usize) as i64;
    let mut audited_report_count = 0i64;
    let mut total_claims = 0i64;
    let mut cited_claims = 0i64;
    let mut inferred_claims = 0i64;
    let mut unsupported_claims = 0i64;
    let mut total_citations = 0i64;
    let mut located_citations = 0i64;
    let mut warning_citations = 0i64;
    let mut missing_citations = 0i64;
    let mut stale_citations = 0i64;
    let mut ambiguous_citations = 0i64;
    let mut not_found_citations = 0i64;
    let mut target_missing_citations = 0i64;
    let mut not_applicable_citations = 0i64;
    let mut rows = Vec::new();
    let mut problem_citations = Vec::new();

    for report in reports {
        let Some(audit) = load_report_audit(conn, &report.id)? else {
            continue;
        };
        let has_audit_rows = !audit.claims.is_empty() || !audit.citations.is_empty();
        if has_audit_rows {
            audited_report_count += 1;
        }

        let coverage = audit.coverage.clone();
        total_claims += coverage.total_claims;
        cited_claims += coverage.cited_claims;
        inferred_claims += coverage.inferred_claims;
        unsupported_claims += coverage.unsupported_claims;
        total_citations += coverage.total_citations;
        located_citations += coverage.located_citations;
        warning_citations += coverage.warning_citations;
        missing_citations += coverage.missing_citations;
        stale_citations += citation_quality_status_count(&audit.citations, "stale");
        ambiguous_citations += citation_quality_status_count(&audit.citations, "multiple_matches");
        not_found_citations += citation_quality_status_count(&audit.citations, "not_found");
        target_missing_citations +=
            citation_quality_status_count(&audit.citations, "target_missing");
        not_applicable_citations +=
            citation_quality_status_count(&audit.citations, "not_applicable");

        for citation in audit
            .citations
            .iter()
            .filter(|citation| citation_quality_problem_status(&citation.locator_status))
        {
            let message = citation_quality_problem_message(citation);
            let reason = optional_trimmed(citation.reason.as_deref()).unwrap_or_else(|| {
                citation
                    .quote
                    .as_deref()
                    .or(citation.excerpt.as_deref())
                    .map(|value| compact_preview(value, 180))
                    .unwrap_or_else(|| message.clone())
            });
            problem_citations.push(CitationQualityProblemCitation {
                report_id: report.id.clone(),
                report_title: report.title.clone(),
                citation_index: citation.citation_index,
                label: citation.label.clone(),
                title: citation.title.clone(),
                target_kind: citation.target_kind.clone(),
                target_id: citation.target_id.clone(),
                locator_status: citation.locator_status.clone(),
                reason,
                source_id: citation.source_id.clone(),
                chunk_index: citation.chunk_index,
                message,
            });
        }

        let mut row_warnings = coverage.warnings.clone();
        if !has_audit_rows {
            row_warnings.insert(
                0,
                "No durable audit rows are available for this report.".to_string(),
            );
        }
        rows.push(CitationQualityReportRow {
            report_id: report.id,
            title: report.title,
            kind: report.kind,
            created_at: report.created_at,
            total_claims: coverage.total_claims,
            cited_claims: coverage.cited_claims,
            inferred_claims: coverage.inferred_claims,
            unsupported_claims: coverage.unsupported_claims,
            total_citations: coverage.total_citations,
            located_citations: coverage.located_citations,
            warning_citations: coverage.warning_citations,
            missing_citations: coverage.missing_citations,
            coverage_ratio: coverage.coverage_ratio,
            quality_score: citation_quality_score(&coverage),
            severity: citation_quality_severity(&coverage, has_audit_rows).to_string(),
            warnings: row_warnings,
        });
    }

    let coverage_ratio = if total_claims == 0 {
        0.0
    } else {
        cited_claims as f64 / total_claims as f64
    };
    let aggregate_coverage = ReportAuditCoverage {
        total_claims,
        cited_claims,
        inferred_claims,
        unsupported_claims,
        total_citations,
        located_citations,
        warning_citations,
        missing_citations,
        coverage_ratio,
        warnings: Vec::new(),
    };
    let mut warnings = Vec::new();
    if report_count == 0 {
        warnings.push("No reports were found for citation quality analysis.".to_string());
    }
    let unaudited = report_count - audited_report_count;
    if unaudited > 0 {
        warnings.push(format!(
            "{unaudited} report(s) do not have durable audit rows yet."
        ));
    }
    if missing_citations > 0 {
        warnings.push(format!(
            "{missing_citations} citation(s) are not found or target missing assets."
        ));
    }
    if warning_citations > 0 {
        warnings.push(format!(
            "{warning_citations} citation(s) are stale, ambiguous, or not directly locatable."
        ));
    }
    if unsupported_claims > 0 {
        warnings.push(format!(
            "{unsupported_claims} claim shell(s) are marked unsupported."
        ));
    }
    if rows.len() == limit {
        warnings.push(format!(
            "Citation quality dashboard reached the report inspection limit of {limit}."
        ));
    }

    Ok(CitationQualityDashboard {
        generated_at: chrono::Utc::now().to_rfc3339(),
        report_count,
        audited_report_count,
        total_claims,
        cited_claims,
        inferred_claims,
        unsupported_claims,
        total_citations,
        located_citations,
        warning_citations,
        missing_citations,
        stale_citations,
        ambiguous_citations,
        not_found_citations,
        target_missing_citations,
        not_applicable_citations,
        coverage_ratio,
        quality_score: citation_quality_score(&aggregate_coverage),
        reports: rows,
        problem_citations,
        warnings,
    })
}

pub fn extract_report_claims_for_report(report: &ReportRecord) -> Vec<SaveReportClaimInput> {
    let labels = report_citation_labels(&report.citations_json);
    extract_report_claims(&report.body_md, &labels)
}

pub fn extract_report_claims(
    body_md: &str,
    citation_labels: &[String],
) -> Vec<SaveReportClaimInput> {
    let candidates = report_claim_candidates(body_md);
    candidates
        .into_iter()
        .enumerate()
        .map(|(index, claim_text)| {
            let labels = citation_labels_in_text(&claim_text, citation_labels);
            let claim_status = if labels.is_empty() {
                "inferred"
            } else {
                "cited"
            };
            SaveReportClaimInput {
                claim_index: index.min(i64::MAX as usize) as i64,
                claim_text,
                claim_status: claim_status.to_string(),
                citation_labels: labels,
            }
        })
        .collect()
}

fn list_report_claims(conn: &Connection, report_id: &str) -> Result<Vec<ReportClaimRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, report_id, claim_index, claim_text, claim_status, citation_labels_json, created_at
         FROM report_claims
         WHERE report_id = ?1
         ORDER BY claim_index ASC, created_at ASC, id ASC",
    )?;
    let rows = stmt.query_map(params![report_id], map_report_claim_row)?;
    let mut claims = Vec::new();
    for row in rows {
        claims.push(row?);
    }
    Ok(claims)
}

fn list_report_citations(conn: &Connection, report_id: &str) -> Result<Vec<ReportCitationRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, report_id, citation_index, target_kind, target_id, label, title, quote,
                excerpt, reason, source_id, chunk_index, source_text_hash, span_start, span_end,
                locator_status, match_count, created_at
         FROM report_citations
         WHERE report_id = ?1
         ORDER BY citation_index ASC, created_at ASC, id ASC",
    )?;
    let rows = stmt.query_map(params![report_id], map_report_citation_row)?;
    let mut citations = Vec::new();
    for row in rows {
        citations.push(row?);
    }
    Ok(citations)
}

fn report_audit_coverage(
    claims: &[ReportClaimRecord],
    citations: &[ReportCitationRecord],
) -> ReportAuditCoverage {
    let total_claims = claims.len().min(i64::MAX as usize) as i64;
    let cited_claims = claims
        .iter()
        .filter(|claim| claim.claim_status == "cited")
        .count()
        .min(i64::MAX as usize) as i64;
    let inferred_claims = claims
        .iter()
        .filter(|claim| claim.claim_status == "inferred")
        .count()
        .min(i64::MAX as usize) as i64;
    let unsupported_claims = claims
        .iter()
        .filter(|claim| claim.claim_status == "unsupported")
        .count()
        .min(i64::MAX as usize) as i64;
    let total_citations = citations.len().min(i64::MAX as usize) as i64;
    let located_citations = citations
        .iter()
        .filter(|citation| citation.locator_status == "located")
        .count()
        .min(i64::MAX as usize) as i64;
    let warning_citations = citations
        .iter()
        .filter(|citation| {
            matches!(
                citation.locator_status.as_str(),
                "multiple_matches" | "stale" | "not_applicable"
            )
        })
        .count()
        .min(i64::MAX as usize) as i64;
    let missing_citations = citations
        .iter()
        .filter(|citation| {
            matches!(
                citation.locator_status.as_str(),
                "not_found" | "target_missing"
            )
        })
        .count()
        .min(i64::MAX as usize) as i64;
    let coverage_ratio = if total_claims == 0 {
        0.0
    } else {
        cited_claims as f64 / total_claims as f64
    };
    let mut warnings = Vec::new();
    if total_claims == 0 {
        warnings.push("No durable claim shells were extracted from this report.".to_string());
    }
    if inferred_claims > 0 {
        warnings.push(format!(
            "{inferred_claims} claim shell(s) have no citation label and are marked inferred."
        ));
    }
    if missing_citations > 0 {
        warnings.push(format!(
            "{missing_citations} citation(s) could not be located or target a missing asset."
        ));
    }
    if warning_citations > 0 {
        warnings.push(format!(
            "{warning_citations} citation(s) need review because they are stale, ambiguous, or lack quote text."
        ));
    }
    if total_citations == 0 {
        warnings.push("No persistent citations were saved for this report.".to_string());
    }
    ReportAuditCoverage {
        total_claims,
        cited_claims,
        inferred_claims,
        unsupported_claims,
        total_citations,
        located_citations,
        warning_citations,
        missing_citations,
        coverage_ratio,
        warnings,
    }
}

fn investigation_qa_eval_case(
    report: &ReportRecord,
    audit: &ReportAuditRecord,
) -> InvestigationQaEvalCase {
    let mut unique_targets = HashSet::new();
    let mut citation_kinds = Vec::new();
    for citation in &audit.citations {
        unique_targets.insert(format!("{}:{}", citation.target_kind, citation.target_id));
        push_unique_string(&mut citation_kinds, &citation.target_kind);
    }
    citation_kinds.sort();

    let mut checks = vec![
        investigation_qa_eval_check(
            "multi_document_context",
            unique_targets.len() >= 2,
            unique_targets.len() == 1,
            &format!("{} unique citation target(s) found.", unique_targets.len()),
        ),
        investigation_qa_eval_check(
            "citation_health",
            audit.coverage.total_citations > 0
                && audit.coverage.missing_citations == 0
                && audit.coverage.warning_citations == 0,
            audit.coverage.total_citations > 0 && audit.coverage.missing_citations == 0,
            &format!(
                "{} citation(s), {} warning, {} missing.",
                audit.coverage.total_citations,
                audit.coverage.warning_citations,
                audit.coverage.missing_citations
            ),
        ),
        investigation_qa_eval_check(
            "claim_coverage",
            audit.coverage.coverage_ratio >= 0.8,
            audit.coverage.coverage_ratio >= 0.5,
            &format!(
                "claim citation coverage ratio is {:.2}.",
                audit.coverage.coverage_ratio
            ),
        ),
        investigation_qa_eval_check(
            "answer_structure",
            report.summary.trim().chars().count() >= 20
                && report.body_md.trim().chars().count() >= 160,
            !report.summary.trim().is_empty() && report.body_md.trim().chars().count() >= 80,
            "summary and body length provide enough answer surface for regression QA.",
        ),
    ];
    if citation_kinds.iter().any(|kind| kind == "source")
        && citation_kinds
            .iter()
            .any(|kind| kind == "point" || kind == "evidence")
    {
        checks.push(investigation_qa_eval_check(
            "citation_kind_mix",
            true,
            false,
            "citations include Source plus Point/Evidence context.",
        ));
    } else {
        checks.push(investigation_qa_eval_check(
            "citation_kind_mix",
            false,
            !citation_kinds.is_empty(),
            "expected Source plus Point/Evidence citation mix for multi-document QA.",
        ));
    }

    let status = if checks.iter().any(|check| check.status == "fail") {
        "fail"
    } else if checks.iter().any(|check| check.status == "warning") {
        "warning"
    } else {
        "pass"
    };
    let score = if checks.is_empty() {
        0.0
    } else {
        checks.iter().map(|check| check.score).sum::<f64>() / checks.len() as f64
    };
    let warnings = checks
        .iter()
        .filter(|check| check.status != "pass")
        .map(|check| format!("{}: {}", check.name, check.message))
        .collect::<Vec<_>>();

    InvestigationQaEvalCase {
        case_id: format!("investigation-qa:{}", report.id),
        report_id: report.id.clone(),
        title: report.title.clone(),
        question: first_non_empty([Some(report.title.as_str()), Some(report.summary.as_str())])
            .unwrap_or(report.id.as_str())
            .to_string(),
        expected_citation_kinds: citation_kinds,
        unique_citation_targets: unique_targets.len().min(i64::MAX as usize) as i64,
        status: status.to_string(),
        score: round_search_ranking_number(score),
        checks,
        warnings,
    }
}

fn investigation_qa_eval_check(
    name: &str,
    pass: bool,
    warning: bool,
    message: &str,
) -> InvestigationQaEvalCheck {
    let (status, score) = if pass {
        ("pass", 1.0)
    } else if warning {
        ("warning", 0.5)
    } else {
        ("fail", 0.0)
    };
    InvestigationQaEvalCheck {
        name: name.to_string(),
        status: status.to_string(),
        score,
        message: message.to_string(),
    }
}

fn normalize_investigation_qa_eval_limit(limit: Option<i64>) -> usize {
    limit.unwrap_or(20).clamp(1, 50) as usize
}

fn scorecard_item(
    round: i64,
    source_inspiration: &str,
    capability: &str,
    boundary: &str,
    impact_score: f64,
    risk_score: f64,
    command_names: &[&str],
    verification: &str,
    next_step: &str,
) -> CapabilityScorecardItem {
    CapabilityScorecardItem {
        round,
        source_inspiration: source_inspiration.to_string(),
        capability: capability.to_string(),
        status: "completed".to_string(),
        boundary: boundary.to_string(),
        impact_score,
        risk_score,
        readiness: if boundary == "read_only" {
            "ready_for_ui"
        } else if boundary == "draft_only" {
            "ready_for_preview_ui"
        } else {
            "needs_confirmation_ui"
        }
        .to_string(),
        command_names: command_names.iter().map(|value| (*value).to_string()).collect(),
        verification: verification.to_string(),
        next_step: next_step.to_string(),
    }
}

fn normalize_citation_quality_dashboard_limit(limit: Option<i64>) -> usize {
    limit.unwrap_or(120).clamp(1, 200) as usize
}

fn citation_quality_status_count(citations: &[ReportCitationRecord], status: &str) -> i64 {
    citations
        .iter()
        .filter(|citation| citation.locator_status == status)
        .count()
        .min(i64::MAX as usize) as i64
}

fn citation_quality_problem_status(status: &str) -> bool {
    matches!(
        status,
        "multiple_matches" | "stale" | "not_found" | "target_missing" | "not_applicable"
    )
}

fn citation_quality_score(coverage: &ReportAuditCoverage) -> f64 {
    if coverage.total_claims == 0 && coverage.total_citations == 0 {
        return 0.0;
    }
    let claim_score = if coverage.total_claims > 0 {
        coverage.coverage_ratio
    } else {
        1.0
    };
    let citation_score = if coverage.total_citations > 0 {
        let reviewable =
            coverage.located_citations as f64 + coverage.warning_citations as f64 * 0.4;
        reviewable / coverage.total_citations as f64
    } else {
        0.0
    };
    let unsupported_penalty = if coverage.total_claims > 0 {
        coverage.unsupported_claims as f64 / coverage.total_claims as f64 * 0.5
    } else {
        0.0
    };
    (claim_score * citation_score - unsupported_penalty).clamp(0.0, 1.0)
}

fn citation_quality_severity(coverage: &ReportAuditCoverage, has_audit_rows: bool) -> &'static str {
    if coverage.missing_citations > 0 || coverage.unsupported_claims > 0 {
        "critical"
    } else if !has_audit_rows
        || coverage.warning_citations > 0
        || coverage.inferred_claims > 0
        || coverage.total_claims == 0
        || coverage.total_citations == 0
    {
        "warning"
    } else {
        "ok"
    }
}

fn citation_quality_problem_message(citation: &ReportCitationRecord) -> String {
    match citation.locator_status.as_str() {
        "multiple_matches" => format!(
            "Citation matched {} location(s); choose a more precise quote.",
            citation.match_count
        ),
        "stale" => "Saved citation text hash differs from the current target text.".to_string(),
        "not_found" => {
            "Citation quote or excerpt no longer appears in the target text.".to_string()
        }
        "target_missing" => "Citation target asset is missing or unsupported.".to_string(),
        "not_applicable" => {
            "Citation has no quote or excerpt, so it cannot be located precisely.".to_string()
        }
        other => format!("Citation locator status needs review: {other}."),
    }
}

fn validate_report_claim_input(input: &SaveReportClaimInput) -> Result<()> {
    if input.claim_index < 0 {
        anyhow::bail!("report claim index must be non-negative");
    }
    required_trimmed("report claim text", &input.claim_text)?;
    validate_report_claim_status(input.claim_status.trim())?;
    Ok(())
}

fn validate_report_citation_input(input: &SaveReportCitationInput) -> Result<()> {
    if input.citation_index < 0 {
        anyhow::bail!("report citation index must be non-negative");
    }
    required_trimmed("report citation target id", &input.target_id)?;
    validate_report_citation_target_kind(input.target_kind.trim())?;
    validate_citation_locator_status(input.locator_status.trim())?;
    if input.match_count < 0 {
        anyhow::bail!("report citation match count must be non-negative");
    }
    if let (Some(start), Some(end)) = (input.span_start, input.span_end) {
        if start < 0 || end < start {
            anyhow::bail!("report citation span is invalid");
        }
    }
    Ok(())
}

fn report_claim_candidates(body_md: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    let mut paragraph: Vec<String> = Vec::new();
    let mut in_fence = false;

    for line in body_md.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            flush_claim_paragraph(&mut paragraph, &mut candidates);
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        if trimmed.is_empty() || is_markdown_separator(trimmed) {
            flush_claim_paragraph(&mut paragraph, &mut candidates);
            continue;
        }
        if is_markdown_heading(trimmed) {
            flush_claim_paragraph(&mut paragraph, &mut candidates);
            continue;
        }

        let normalized = normalize_claim_line(trimmed);
        if normalized.is_empty() {
            flush_claim_paragraph(&mut paragraph, &mut candidates);
            continue;
        }
        if is_markdown_list_item(trimmed) {
            flush_claim_paragraph(&mut paragraph, &mut candidates);
            push_claim_candidate(normalized, &mut candidates);
        } else {
            paragraph.push(normalized);
        }
    }

    flush_claim_paragraph(&mut paragraph, &mut candidates);
    dedupe_preserving_order(candidates)
}

fn flush_claim_paragraph(paragraph: &mut Vec<String>, candidates: &mut Vec<String>) {
    if paragraph.is_empty() {
        return;
    }
    let candidate = paragraph.join(" ");
    paragraph.clear();
    push_claim_candidate(candidate, candidates);
}

fn push_claim_candidate(candidate: String, candidates: &mut Vec<String>) {
    let candidate = normalize_whitespace(&candidate);
    if is_substantive_claim(&candidate) {
        candidates.push(candidate);
    }
}

fn normalize_claim_line(line: &str) -> String {
    let mut value = strip_blockquote_prefixes(line);
    value = strip_list_prefix(value);
    value = strip_checklist_prefix(value);
    value.trim().to_string()
}

fn strip_blockquote_prefixes(mut value: &str) -> &str {
    loop {
        let trimmed = value.trim_start();
        let Some(rest) = trimmed.strip_prefix('>') else {
            return trimmed;
        };
        value = rest;
    }
}

fn strip_list_prefix(value: &str) -> &str {
    let trimmed = value.trim_start();
    if let Some(rest) = trimmed
        .strip_prefix("- ")
        .or_else(|| trimmed.strip_prefix("* "))
        .or_else(|| trimmed.strip_prefix("+ "))
    {
        return rest.trim_start();
    }
    strip_ordered_list_prefix(trimmed).unwrap_or(trimmed)
}

fn strip_ordered_list_prefix(value: &str) -> Option<&str> {
    let mut digit_end = 0;
    for (index, ch) in value.char_indices() {
        if ch.is_ascii_digit() {
            digit_end = index + ch.len_utf8();
            continue;
        }
        break;
    }
    if digit_end == 0 {
        return None;
    }
    let rest = &value[digit_end..];
    let rest = rest.strip_prefix('.').or_else(|| rest.strip_prefix(')'))?;
    if rest.chars().next().is_some_and(char::is_whitespace) {
        Some(rest.trim_start())
    } else {
        None
    }
}

fn strip_checklist_prefix(value: &str) -> &str {
    let trimmed = value.trim_start();
    if let Some(rest) = trimmed
        .strip_prefix("[ ]")
        .or_else(|| trimmed.strip_prefix("[x]"))
        .or_else(|| trimmed.strip_prefix("[X]"))
    {
        return rest.trim_start();
    }
    trimmed
}

fn is_markdown_heading(value: &str) -> bool {
    let hashes = value.chars().take_while(|ch| *ch == '#').count();
    (1..=6).contains(&hashes)
        && value[hashes..]
            .chars()
            .next()
            .is_some_and(char::is_whitespace)
}

fn is_markdown_separator(value: &str) -> bool {
    let chars = value
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect::<Vec<_>>();
    chars.len() >= 3 && chars.iter().all(|ch| matches!(*ch, '-' | '*' | '_'))
}

fn is_markdown_list_item(value: &str) -> bool {
    let trimmed = value.trim_start();
    trimmed.starts_with("- ")
        || trimmed.starts_with("* ")
        || trimmed.starts_with("+ ")
        || strip_ordered_list_prefix(trimmed).is_some()
}

fn is_substantive_claim(candidate: &str) -> bool {
    let trimmed = candidate.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("id:")
        || lower.starts_with("url:")
        || lower.starts_with("source:")
        || lower.starts_with("chunk:")
        || trimmed.starts_with("标题:")
        || trimmed.starts_with("摘录:")
    {
        return false;
    }
    let signal_chars = trimmed.chars().filter(|ch| ch.is_alphanumeric()).count();
    signal_chars >= 8
}

fn normalize_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn dedupe_preserving_order(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut unique = Vec::new();
    for value in values {
        if seen.insert(value.clone()) {
            unique.push(value);
        }
    }
    unique
}

fn report_citation_labels(citations_json: &str) -> Vec<String> {
    let Ok(serde_json::Value::Array(citations)) =
        serde_json::from_str::<serde_json::Value>(citations_json)
    else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    let mut labels = Vec::new();
    for citation in citations {
        let Some(label) = citation
            .as_object()
            .and_then(|object| object.get("label"))
            .and_then(serde_json::Value::as_str)
            .and_then(normalize_report_citation_label)
        else {
            continue;
        };
        if seen.insert(label.clone()) {
            labels.push(label);
        }
    }
    labels
}

fn citation_labels_in_text(text: &str, citation_labels: &[String]) -> Vec<String> {
    citation_labels
        .iter()
        .filter_map(|label| {
            let label = normalize_report_citation_label(label)?;
            let needle = format!("[{label}]");
            if text.contains(&needle) {
                Some(label)
            } else {
                None
            }
        })
        .collect()
}

fn normalize_report_citation_label(label: &str) -> Option<String> {
    let trimmed = label.trim().trim_start_matches('[').trim_end_matches(']');
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub fn save_ai_invocation(
    conn: &Connection,
    input: SaveAiInvocationInput,
) -> Result<AiInvocationRecord> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let task_kind = required_trimmed("AI invocation task kind", &input.task_kind)?.to_string();
    let prompt_version =
        required_trimmed("AI invocation prompt version", &input.prompt_version)?.to_string();
    let input_refs_json =
        normalized_json_object("AI invocation input refs", &input.input_refs_json)?;
    let context_manifest_json = normalized_json_object(
        "AI invocation context manifest",
        &input.context_manifest_json,
    )?;
    let warnings_json = normalized_json_array("AI invocation warnings", &input.warnings_json)?;
    let token_usage_json = match input.token_usage_json.as_deref() {
        Some(value) if !value.trim().is_empty() => {
            Some(normalized_json_object("AI invocation token usage", value)?)
        }
        _ => None,
    };

    conn.execute(
        "INSERT INTO ai_invocations
            (id, task_kind, model_profile_id, model_name, prompt_version, input_query,
             input_refs_json, context_manifest_json, output_ref_kind, output_ref_id,
             token_usage_json, warnings_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, NULL, ?9, ?10, ?11)",
        params![
            id,
            task_kind,
            optional_trimmed(input.model_profile_id.as_deref()),
            optional_trimmed(input.model_name.as_deref()),
            prompt_version,
            optional_trimmed(input.input_query.as_deref()),
            input_refs_json,
            context_manifest_json,
            token_usage_json,
            warnings_json,
            now
        ],
    )?;

    get_ai_invocation(conn, &id)?
        .ok_or_else(|| anyhow::anyhow!("saved AI invocation not found: {id}"))
}

pub fn get_ai_invocation(
    conn: &Connection,
    invocation_id: &str,
) -> Result<Option<AiInvocationRecord>> {
    let trimmed = invocation_id.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let mut stmt = conn.prepare(
        "SELECT id, task_kind, model_profile_id, model_name, prompt_version, input_query,
                input_refs_json, context_manifest_json, output_ref_kind, output_ref_id,
                token_usage_json, warnings_json, created_at
         FROM ai_invocations
         WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![trimmed])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    Ok(Some(map_ai_invocation_row(row)?))
}

pub fn save_investigation_context_items(
    conn: &Connection,
    inputs: Vec<SaveInvestigationContextItemInput>,
) -> Result<Vec<InvestigationContextItemRecord>> {
    let mut records = Vec::with_capacity(inputs.len());
    for input in inputs {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let invocation_id =
            required_trimmed("context item invocation id", &input.invocation_id)?.to_string();
        let target_kind =
            required_trimmed("context item target kind", &input.target_kind)?.to_string();
        validate_context_target_kind(&target_kind)?;
        let target_id = required_trimmed("context item target id", &input.target_id)?.to_string();
        let role = required_trimmed("context item role", &input.role)?.to_string();
        validate_context_role(&role)?;
        conn.execute(
            "INSERT INTO investigation_context_items
                (id, invocation_id, target_kind, target_id, label, role, included, truncated,
                 reason, char_count, source_text_hash, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                id,
                invocation_id,
                target_kind,
                target_id,
                optional_trimmed(input.label.as_deref()),
                role,
                input.included as i64,
                input.truncated as i64,
                optional_trimmed(input.reason.as_deref()),
                input.char_count,
                optional_trimmed(input.source_text_hash.as_deref()),
                now
            ],
        )?;
        if let Some(record) = get_investigation_context_item(conn, &id)? {
            records.push(record);
        }
    }
    Ok(records)
}

pub fn link_ai_invocation_output(
    conn: &Connection,
    invocation_id: &str,
    output_ref_kind: &str,
    output_ref_id: &str,
) -> Result<()> {
    let invocation_id = invocation_id.trim();
    if invocation_id.is_empty() {
        return Ok(());
    }
    let output_ref_kind = required_trimmed("AI invocation output kind", output_ref_kind)?;
    validate_asset_kind(output_ref_kind)?;
    let output_ref_id = required_trimmed("AI invocation output id", output_ref_id)?;
    conn.execute(
        "UPDATE ai_invocations
         SET output_ref_kind = ?1, output_ref_id = ?2
         WHERE id = ?3",
        params![output_ref_kind, output_ref_id, invocation_id],
    )?;
    Ok(())
}

pub fn load_report_invocation_audit(
    conn: &Connection,
    report_id: &str,
) -> Result<Option<ReportInvocationAudit>> {
    let report_id = report_id.trim();
    if report_id.is_empty() {
        return Ok(None);
    }
    let mut stmt = conn.prepare(
        "SELECT id, task_kind, model_profile_id, model_name, prompt_version, input_query,
                input_refs_json, context_manifest_json, output_ref_kind, output_ref_id,
                token_usage_json, warnings_json, created_at
         FROM ai_invocations
         WHERE output_ref_kind = 'report' AND output_ref_id = ?1
         ORDER BY created_at DESC
         LIMIT 1",
    )?;
    let mut rows = stmt.query(params![report_id])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    let invocation = map_ai_invocation_row(row)?;
    let context_items = list_investigation_context_items(conn, &invocation.id)?;
    let total = context_items.len().min(i64::MAX as usize) as i64;
    let included_count = context_items.iter().filter(|item| item.included).count() as i64;
    let truncated_count = context_items.iter().filter(|item| item.truncated).count() as i64;
    Ok(Some(ReportInvocationAudit {
        invocation,
        context_items,
        total,
        included_count,
        truncated_count,
    }))
}

fn get_investigation_context_item(
    conn: &Connection,
    id: &str,
) -> Result<Option<InvestigationContextItemRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, invocation_id, target_kind, target_id, label, role, included, truncated,
                reason, char_count, source_text_hash, created_at
         FROM investigation_context_items
         WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    Ok(Some(map_investigation_context_item_row(row)?))
}

pub fn list_investigation_context_items(
    conn: &Connection,
    invocation_id: &str,
) -> Result<Vec<InvestigationContextItemRecord>> {
    let invocation_id = invocation_id.trim();
    if invocation_id.is_empty() {
        return Ok(Vec::new());
    }
    let mut stmt = conn.prepare(
        "SELECT id, invocation_id, target_kind, target_id, label, role, included, truncated,
                reason, char_count, source_text_hash, created_at
         FROM investigation_context_items
         WHERE invocation_id = ?1
         ORDER BY created_at ASC, id ASC",
    )?;
    let rows = stmt.query_map(params![invocation_id], map_investigation_context_item_row)?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

pub fn get_report(conn: &Connection, report_id: &str) -> Result<Option<ReportRecord>> {
    if report_id.trim().is_empty() {
        return Ok(None);
    }

    let mut stmt = conn.prepare(
        "SELECT id, title, kind, source_name, body_md, summary, citations_json, created_at
         FROM reports
         WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![report_id])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };

    Ok(Some(map_report_row(row)?))
}

pub fn list_recent_reports(conn: &Connection, limit: usize) -> Result<Vec<ReportRecord>> {
    if limit == 0 {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT id, title, kind, source_name, body_md, summary, citations_json, created_at
         FROM reports
         ORDER BY created_at DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit as i64], map_report_row)?;
    let mut reports = Vec::new();
    for row in rows {
        reports.push(row?);
    }
    Ok(reports)
}

pub fn search_reports(conn: &Connection, query: &str, limit: usize) -> Result<Vec<ReportRecord>> {
    let trimmed = query.trim();
    if trimmed.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    let pattern = format!("%{}%", escape_like(trimmed));
    let mut stmt = conn.prepare(
        "SELECT id, title, kind, source_name, body_md, summary, citations_json, created_at
         FROM reports
         WHERE title LIKE ?1 ESCAPE '\\'
            OR kind LIKE ?1 ESCAPE '\\'
            OR source_name LIKE ?1 ESCAPE '\\'
            OR body_md LIKE ?1 ESCAPE '\\'
            OR summary LIKE ?1 ESCAPE '\\'
            OR citations_json LIKE ?1 ESCAPE '\\'
         ORDER BY created_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![pattern, limit as i64], map_report_row)?;
    let mut reports = Vec::new();
    for row in rows {
        reports.push(row?);
    }
    Ok(reports)
}

pub fn list_points_for_source(
    conn: &Connection,
    source_id: &str,
    limit: usize,
) -> Result<Vec<StoredPoint>> {
    let trimmed = source_id.trim();
    if trimmed.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT p.id, p.content, p.tag_type, p.parent_id, p.source_doc_name, p.source_excerpt, p.created_at, p.archived, p.starred
         FROM points p
         JOIN point_source_links l ON l.point_id = p.id
         WHERE l.source_id = ?1
         ORDER BY p.created_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![trimmed, limit as i64], map_point_row)?;
    let mut points = Vec::new();
    for row in rows {
        points.push(row?);
    }
    Ok(points)
}

pub fn list_reports_for_source(
    conn: &Connection,
    source_id: &str,
    limit: usize,
) -> Result<Vec<ReportRecord>> {
    let trimmed = source_id.trim();
    if trimmed.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        "SELECT id, title, kind, source_name, body_md, summary, citations_json, created_at
         FROM reports
         ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], map_report_row)?;
    let mut reports = Vec::new();
    for row in rows {
        let report = row?;
        if report_references_source(&report, trimmed) {
            reports.push(report);
            if reports.len() >= limit {
                break;
            }
        }
    }
    Ok(reports)
}

pub fn list_gallery_for_source(
    conn: &Connection,
    source_id: &str,
    limit: usize,
) -> Result<Vec<GalleryItem>> {
    let trimmed = source_id.trim();
    if trimmed.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    let point_ids = point_ids_for_source(conn, trimmed)?;
    if point_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut gallery = Vec::new();
    for item in list_gallery(conn)? {
        if item
            .point_ids
            .iter()
            .any(|point_id| point_ids.contains(point_id))
        {
            gallery.push(item);
            if gallery.len() >= limit {
                break;
            }
        }
    }
    Ok(gallery)
}

fn point_ids_for_source(conn: &Connection, source_id: &str) -> Result<HashSet<String>> {
    let mut stmt = conn.prepare(
        "SELECT point_id
         FROM point_source_links
         WHERE source_id = ?1",
    )?;
    let rows = stmt.query_map(params![source_id], |row| row.get::<_, String>(0))?;
    let mut ids = HashSet::new();
    for row in rows {
        ids.insert(row?);
    }
    Ok(ids)
}

fn report_references_source(report: &ReportRecord, source_id: &str) -> bool {
    let Ok(serde_json::Value::Array(citations)) =
        serde_json::from_str::<serde_json::Value>(&report.citations_json)
    else {
        return false;
    };
    citations
        .iter()
        .any(|citation| citation_references_source(citation, source_id))
}

fn citation_references_source(citation: &serde_json::Value, source_id: &str) -> bool {
    let Some(object) = citation.as_object() else {
        return false;
    };
    let direct_source = object
        .get("sourceId")
        .or_else(|| object.get("source_id"))
        .and_then(serde_json::Value::as_str);
    if direct_source == Some(source_id) {
        return true;
    }
    let kind = object.get("kind").and_then(serde_json::Value::as_str);
    let id = object.get("id").and_then(serde_json::Value::as_str);
    kind == Some("source") && id == Some(source_id)
}

pub fn delete_report(conn: &Connection, report_id: &str) -> Result<()> {
    let trimmed = report_id.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    conn.execute(
        "DELETE FROM report_claims WHERE report_id = ?1",
        params![trimmed],
    )?;
    conn.execute(
        "DELETE FROM report_citations WHERE report_id = ?1",
        params![trimmed],
    )?;
    conn.execute("DELETE FROM reports WHERE id = ?1", params![trimmed])?;
    Ok(())
}

pub fn save_journal_entry(conn: &Connection, input: SaveJournalEntryInput) -> Result<JournalEntry> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let query = required_trimmed("journal query", &input.query)?.to_string();
    let note = required_trimmed("journal note", &input.note)?.to_string();
    let source_kind = required_trimmed("journal source kind", &input.source_kind)?.to_string();
    let tags_json = json_string_array(input.tags);
    let source_ids_json = json_string_array(input.source_ids);
    let point_ids_json = json_string_array(input.point_ids);
    let evidence_ids_json = json_string_array(input.evidence_ids);
    let report_ids_json = json_string_array(input.report_ids);
    let created_report_id = optional_trimmed(input.created_report_id.as_deref());

    conn.execute(
        "INSERT INTO journal_entries
            (id, query, note, tags_json, source_ids_json, point_ids_json, evidence_ids_json, report_ids_json,
             created_report_id, source_kind, created_at, invalidated_at, invalidated_reason)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, NULL)",
        params![
            id,
            query,
            note,
            tags_json,
            source_ids_json,
            point_ids_json,
            evidence_ids_json,
            report_ids_json,
            created_report_id,
            source_kind,
            now
        ],
    )?;

    get_journal_entry(conn, &id)?
        .ok_or_else(|| anyhow::anyhow!("saved journal entry not found: {id}"))
}

pub fn get_journal_entry(conn: &Connection, id: &str) -> Result<Option<JournalEntry>> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let mut stmt = conn.prepare(
        "SELECT id, query, note, tags_json, source_ids_json, point_ids_json, evidence_ids_json, report_ids_json,
                created_report_id, source_kind, created_at, invalidated_at, invalidated_reason
         FROM journal_entries
         WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![trimmed])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    Ok(Some(map_journal_entry_row(row)?))
}

pub fn list_recent_journal_entries(conn: &Connection, limit: usize) -> Result<Vec<JournalEntry>> {
    if limit == 0 {
        return Ok(Vec::new());
    }
    let mut stmt = conn.prepare(
        "SELECT id, query, note, tags_json, source_ids_json, point_ids_json, evidence_ids_json, report_ids_json,
                created_report_id, source_kind, created_at, invalidated_at, invalidated_reason
         FROM journal_entries
         ORDER BY created_at DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit as i64], map_journal_entry_row)?;
    let mut entries = Vec::new();
    for row in rows {
        entries.push(row?);
    }
    Ok(entries)
}

pub fn search_journal_entries(
    conn: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<JournalEntry>> {
    let trimmed = query.trim();
    if trimmed.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }
    let pattern = format!("%{}%", escape_like(trimmed));
    let mut stmt = conn.prepare(
        "SELECT id, query, note, tags_json, source_ids_json, point_ids_json, evidence_ids_json, report_ids_json,
                created_report_id, source_kind, created_at, invalidated_at, invalidated_reason
         FROM journal_entries
         WHERE invalidated_at IS NULL
           AND (query LIKE ?1 ESCAPE '\\'
             OR note LIKE ?1 ESCAPE '\\'
             OR tags_json LIKE ?1 ESCAPE '\\'
             OR source_ids_json LIKE ?1 ESCAPE '\\'
             OR point_ids_json LIKE ?1 ESCAPE '\\'
             OR evidence_ids_json LIKE ?1 ESCAPE '\\'
             OR report_ids_json LIKE ?1 ESCAPE '\\')
         ORDER BY created_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![pattern, limit as i64], map_journal_entry_row)?;
    let mut entries = Vec::new();
    for row in rows {
        entries.push(row?);
    }
    Ok(entries)
}

pub fn invalidate_journal_entry(conn: &Connection, id: &str, reason: &str) -> Result<()> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    let reason = required_trimmed("journal invalidation reason", reason)?.to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE journal_entries
         SET invalidated_at = ?1, invalidated_reason = ?2
         WHERE id = ?3",
        params![now, reason, trimmed],
    )?;
    Ok(())
}

pub fn save_quick_capture(
    conn: &Connection,
    input: SaveQuickCaptureInput,
) -> Result<QuickCaptureItem> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let content = required_trimmed("quick capture content", &input.content)?.to_string();
    let tags_json = json_string_array(input.tags);
    let source_kind =
        optional_trimmed(input.source_kind.as_deref()).unwrap_or_else(|| "manual".to_string());

    conn.execute(
        "INSERT INTO quick_capture_items
            (id, content, tags_json, source_kind, status, resolved_kind, resolved_id, resolved_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'inbox', NULL, NULL, NULL, ?5, ?5)",
        params![
            id.as_str(),
            content.as_str(),
            tags_json.as_str(),
            source_kind.as_str(),
            now.as_str()
        ],
    )?;

    get_quick_capture_item(conn, &id)?
        .ok_or_else(|| anyhow::anyhow!("saved quick capture not found: {id}"))
}

pub fn list_quick_captures(
    conn: &Connection,
    status: Option<&str>,
    limit: Option<i64>,
) -> Result<Vec<QuickCaptureItem>> {
    let limit = limit.unwrap_or(120).clamp(1, 200);
    let status = optional_trimmed(status);
    if let Some(status) = status.as_deref() {
        validate_quick_capture_status(status)?;
        let mut stmt = conn.prepare(
            "SELECT id, content, tags_json, source_kind, status, resolved_kind, resolved_id, resolved_at, created_at, updated_at
             FROM quick_capture_items
             WHERE status = ?1
             ORDER BY updated_at DESC, created_at DESC
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![status, limit], map_quick_capture_row)?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row?);
        }
        return Ok(items);
    }

    let mut stmt = conn.prepare(
        "SELECT id, content, tags_json, source_kind, status, resolved_kind, resolved_id, resolved_at, created_at, updated_at
         FROM quick_capture_items
         ORDER BY updated_at DESC, created_at DESC
         LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit], map_quick_capture_row)?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

pub fn resolve_quick_capture(
    conn: &mut Connection,
    input: ResolveQuickCaptureInput,
) -> Result<Option<QuickCaptureResolution>> {
    let capture_id = input.id.trim().to_string();
    if capture_id.is_empty() {
        return Ok(None);
    }
    let Some(capture) = get_quick_capture_item(conn, &capture_id)? else {
        return Ok(None);
    };
    if capture.status != "inbox" {
        anyhow::bail!("quick capture is not in inbox");
    }
    let target_kind = input.target_kind.trim().to_string();
    validate_quick_capture_target_kind(&target_kind)?;

    let now = chrono::Utc::now().to_rfc3339();
    let tags_json = json_string_array(capture.tags.clone());
    let title = optional_trimmed(input.title.as_deref())
        .or_else(|| first_non_empty(capture.content.lines().map(Some)).map(str::to_string))
        .map(|value| compact_preview(&value, 96))
        .unwrap_or_else(|| "Quick Capture".to_string());
    let mut journal = None;
    let mut point = None;
    let mut source = None;
    let resolved_id;

    let tx = conn.transaction()?;
    match target_kind.as_str() {
        "journal" => {
            let id = uuid::Uuid::new_v4().to_string();
            let query = optional_trimmed(input.query.as_deref()).unwrap_or_else(|| title.clone());
            tx.execute(
                "INSERT INTO journal_entries
                    (id, query, note, tags_json, source_ids_json, point_ids_json, evidence_ids_json,
                     report_ids_json, created_report_id, source_kind, created_at, invalidated_at, invalidated_reason)
                 VALUES (?1, ?2, ?3, ?4, '[]', '[]', '[]', '[]', NULL, 'quick_capture', ?5, NULL, NULL)",
                params![
                    id.as_str(),
                    query.as_str(),
                    capture.content.as_str(),
                    tags_json.as_str(),
                    now.as_str()
                ],
            )?;
            journal = Some(JournalEntry {
                id: id.clone(),
                query,
                note: capture.content.clone(),
                tags_json: tags_json.clone(),
                source_ids_json: "[]".to_string(),
                point_ids_json: "[]".to_string(),
                evidence_ids_json: "[]".to_string(),
                report_ids_json: "[]".to_string(),
                created_report_id: None,
                source_kind: "quick_capture".to_string(),
                created_at: now.clone(),
                invalidated_at: None,
                invalidated_reason: None,
            });
            resolved_id = id;
        }
        "point" => {
            let id = uuid::Uuid::new_v4().to_string();
            let parent_id = optional_trimmed(input.parent_id.as_deref());
            tx.execute(
                "INSERT INTO points
                    (id, content, tag_type, parent_id, source_doc_name, source_excerpt, created_at, archived, starred)
                 VALUES (?1, ?2, 'quick_capture', ?3, 'Quick Capture Inbox', NULL, ?4, 0, 0)",
                params![
                    id.as_str(),
                    capture.content.as_str(),
                    parent_id.as_deref(),
                    now.as_str()
                ],
            )?;
            point = Some(StoredPoint {
                id: id.clone(),
                content: capture.content.clone(),
                tag_type: Some("quick_capture".to_string()),
                parent_id,
                source_doc_name: Some("Quick Capture Inbox".to_string()),
                source_excerpt: None,
                created_at: now.clone(),
                archived: false,
                starred: false,
            });
            resolved_id = id;
        }
        "source" => {
            let id = uuid::Uuid::new_v4().to_string();
            let canonical_uri = format!("quick-capture://{}", capture.id);
            let metadata_json = serde_json::json!({
                "captureId": capture.id.clone(),
                "captureSourceKind": capture.source_kind.clone(),
                "tags": capture.tags.clone(),
            })
            .to_string();
            tx.execute(
                "INSERT INTO source_documents
                    (id, kind, title, canonical_uri, metadata_json, created_at, updated_at)
                 VALUES (?1, 'quick_capture', ?2, ?3, ?4, ?5, ?5)",
                params![
                    id.as_str(),
                    title.as_str(),
                    canonical_uri.as_str(),
                    metadata_json.as_str(),
                    now.as_str()
                ],
            )?;
            tx.execute(
                "INSERT INTO source_chunks
                    (id, source_id, chunk_index, heading_path, text, created_at)
                 VALUES (?1, ?2, 0, NULL, ?3, ?4)",
                params![
                    uuid::Uuid::new_v4().to_string(),
                    id.as_str(),
                    capture.content.as_str(),
                    now.as_str()
                ],
            )?;
            source = Some(SourceDocumentRecord {
                id: id.clone(),
                kind: "quick_capture".to_string(),
                title: Some(title),
                canonical_uri,
                metadata_json,
                created_at: now.clone(),
                updated_at: now.clone(),
            });
            resolved_id = id;
        }
        _ => unreachable!("validated quick capture target kind"),
    }

    tx.execute(
        "UPDATE quick_capture_items
         SET status = 'resolved', resolved_kind = ?1, resolved_id = ?2, resolved_at = ?3, updated_at = ?3
         WHERE id = ?4",
        params![
            target_kind.as_str(),
            resolved_id.as_str(),
            now.as_str(),
            capture.id.as_str()
        ],
    )?;
    tx.commit()?;

    let item = get_quick_capture_item(conn, &capture_id)?
        .ok_or_else(|| anyhow::anyhow!("resolved quick capture not found: {capture_id}"))?;
    Ok(Some(QuickCaptureResolution {
        item,
        journal,
        point,
        source,
    }))
}

pub fn dismiss_quick_capture(conn: &Connection, id: &str) -> Result<Option<QuickCaptureItem>> {
    let id = id.trim();
    if id.is_empty() {
        return Ok(None);
    }
    let Some(capture) = get_quick_capture_item(conn, id)? else {
        return Ok(None);
    };
    if capture.status != "inbox" {
        anyhow::bail!("quick capture is not in inbox");
    }
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE quick_capture_items
         SET status = 'dismissed', resolved_kind = NULL, resolved_id = NULL, resolved_at = ?1, updated_at = ?1
         WHERE id = ?2",
        params![now.as_str(), id],
    )?;
    get_quick_capture_item(conn, id)
}

fn get_quick_capture_item(conn: &Connection, id: &str) -> Result<Option<QuickCaptureItem>> {
    let id = id.trim();
    if id.is_empty() {
        return Ok(None);
    }
    conn.query_row(
        "SELECT id, content, tags_json, source_kind, status, resolved_kind, resolved_id, resolved_at, created_at, updated_at
         FROM quick_capture_items
         WHERE id = ?1",
        params![id],
        map_quick_capture_row,
    )
    .optional()
    .map_err(Into::into)
}

struct ReportStarterTemplateSpec {
    id: &'static str,
    name: &'static str,
    category: &'static str,
    kind: &'static str,
    description: &'static str,
    sections: &'static [&'static str],
    source_inspiration: &'static str,
}

struct CommandPaletteItemSpec {
    id: &'static str,
    title: &'static str,
    category: &'static str,
    description: &'static str,
    keywords: &'static [&'static str],
    command_name: &'static str,
    wrapper_name: &'static str,
    execution_kind: &'static str,
    required_input: &'static [&'static str],
    input_hint: &'static str,
    risk: &'static str,
    shortcut_hint: Option<&'static str>,
    source_inspiration: &'static str,
    priority: i64,
}

const COMMAND_PALETTE_ITEMS: &[CommandPaletteItemSpec] = &[
    CommandPaletteItemSpec {
        id: "system.command_palette_manifest",
        title: "System: List Command Palette Items",
        category: "system",
        description: "Return the searchable command manifest that a future palette UI can render.",
        keywords: &["command", "palette", "manifest", "silverbullet", "list commands"],
        command_name: "list_command_palette_items",
        wrapper_name: "listCommandPaletteItems",
        execution_kind: "read",
        required_input: &[],
        input_hint: "Optional query, category, and limit filters.",
        risk: "read_only",
        shortcut_hint: Some("Mod+/"),
        source_inspiration: "SilverBullet command hook + system.listCommands API",
        priority: 120,
    },
    CommandPaletteItemSpec {
        id: "system.capability_scorecard",
        title: "System: Build Capability Scorecard",
        category: "system",
        description: "Summarize all 20 capability refinement rounds with impact, risk, boundaries, commands, and next steps.",
        keywords: &[
            "capability",
            "scorecard",
            "round 20",
            "roadmap",
            "risk",
            "impact",
            "炼化",
        ],
        command_name: "build_capability_scorecard",
        wrapper_name: "buildCapabilityScorecard",
        execution_kind: "read",
        required_input: &[],
        input_hint: "No input required.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "Cross-project capability refinement scorecard for Thepoint Round 20",
        priority: 119,
    },
    CommandPaletteItemSpec {
        id: "search.unified_assets",
        title: "Search: Unified Assets",
        category: "search",
        description: "Search Source, Point, Evidence, Report, Journal, Gallery, and indexed files through one typed entry point.",
        keywords: &["search", "asset", "library", "source", "point", "report", "indexed file"],
        command_name: "search_assets",
        wrapper_name: "searchAssets",
        execution_kind: "read",
        required_input: &["query"],
        input_hint: "query plus optional kinds, filter, and limit.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "marginalia/Zotero search evaluation and Thepoint Round 01",
        priority: 110,
    },
    CommandPaletteItemSpec {
        id: "search.ranking_explainability",
        title: "Search: Explain Ranking",
        category: "search",
        description: "Explain unified search result ordering with query terms, matched fields, score deltas, and diagnostic score components.",
        keywords: &["search", "ranking", "explain", "score", "components", "marginalia", "eval"],
        command_name: "explain_search_ranking",
        wrapper_name: "explainSearchRanking",
        execution_kind: "diagnostic",
        required_input: &["query"],
        input_hint: "query plus optional kinds, filter, and limit.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "marginalia recall_knowledge score_components and eval ablation reporting refined into Thepoint Round 15",
        priority: 109,
    },
    CommandPaletteItemSpec {
        id: "references.block_manifest",
        title: "References: Build Block Reference Manifest",
        category: "references",
        description: "Return source chunk, point, evidence, report, journal, gallery, and indexed-file block cards for a target asset.",
        keywords: &[
            "reference",
            "block",
            "chunk",
            "point",
            "siyuan",
            "citation card",
            "locator",
        ],
        command_name: "build_block_reference_manifest",
        wrapper_name: "buildBlockReferenceManifest",
        execution_kind: "read",
        required_input: &["kind", "id"],
        input_hint: "target kind/id plus optional query, limit, and includeRelated.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "SiYuan block-level references refined into Thepoint Round 16",
        priority: 108,
    },
    CommandPaletteItemSpec {
        id: "board.snapshot_export",
        title: "Board: Build Snapshot Export",
        category: "board",
        description: "Convert block reference cards into a portable board node/edge manifest plus Markdown map.",
        keywords: &[
            "board",
            "canvas",
            "snapshot",
            "markdown map",
            "affine",
            "appflowy",
            "export",
        ],
        command_name: "build_board_snapshot_export",
        wrapper_name: "buildBoardSnapshotExport",
        execution_kind: "draft",
        required_input: &["kind", "id"],
        input_hint: "target kind/id plus optional query, limit, and includeRelated.",
        risk: "draft_only",
        shortcut_hint: None,
        source_inspiration: "AFFiNE canvas snapshots and AppFlowy board views refined into Thepoint Round 17",
        priority: 107,
    },
    CommandPaletteItemSpec {
        id: "automation.suggestions",
        title: "Automation: Load Action Suggestions",
        category: "automation",
        description: "Aggregate due reviews, citation issues, reprocess items, duplicate groups, inbox captures, new Sources, and retrieval profiles into actionable suggestions.",
        keywords: &["automation", "suggestion", "action", "maintenance", "khoj", "scheduler", "next step"],
        command_name: "load_automation_suggestions",
        wrapper_name: "loadAutomationSuggestions",
        execution_kind: "diagnostic",
        required_input: &[],
        input_hint: "Optional categories and limit.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "Khoj automation metadata, trigger preview, and preset cards refined into Thepoint Round 13",
        priority: 106,
    },
    CommandPaletteItemSpec {
        id: "agent.retrieval_context",
        title: "Agent: Build Retrieval Context",
        category: "agent",
        description: "Package unified search results into a bounded, auditable context manifest for future agent/RAG use.",
        keywords: &["agent", "retrieval", "rag", "context", "khoj", "quivr", "kotaemon"],
        command_name: "build_retrieval_context",
        wrapper_name: "buildRetrievalContext",
        execution_kind: "read",
        required_input: &["query"],
        input_hint: "query plus optional kinds, filter, limit, and maxCharsPerItem.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "Khoj/Quivr/Kotaemon read-only retrieval manifests and Thepoint Round 02",
        priority: 104,
    },
    CommandPaletteItemSpec {
        id: "retrieval.profiles.preview",
        title: "Retrieval: Preview Workspace Profile",
        category: "retrieval",
        description: "Apply a saved retrieval profile to build a scoped, bounded context preview without writing assets.",
        keywords: &["retrieval", "profile", "workspace", "scope", "preview", "anythingllm"],
        command_name: "preview_retrieval_profile",
        wrapper_name: "previewRetrievalProfile",
        execution_kind: "read",
        required_input: &["id"],
        input_hint: "profile id plus optional queryOverride, limit, and maxCharsPerItem.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "AnythingLLM workspace similarityThreshold/topN/chatMode retrieval settings and Thepoint Round 12",
        priority: 103,
    },
    CommandPaletteItemSpec {
        id: "retrieval.profiles.save",
        title: "Retrieval: Save Workspace Profile",
        category: "retrieval",
        description: "Persist a reusable retrieval scope with query defaults, asset kinds, filters, context budget, and mode.",
        keywords: &["retrieval", "profile", "workspace", "scope", "save", "anythingllm"],
        command_name: "save_retrieval_profile",
        wrapper_name: "saveRetrievalProfile",
        execution_kind: "write",
        required_input: &["name"],
        input_hint: "name plus query or savedSearchId; optional kinds, filter, limits, minScore, and mode.",
        risk: "creates_or_updates_local_records",
        shortcut_hint: None,
        source_inspiration: "AnythingLLM workspace-scoped retrieval defaults refined into Thepoint Round 12",
        priority: 102,
    },
    CommandPaletteItemSpec {
        id: "retrieval.profiles.list",
        title: "Retrieval: List Workspace Profiles",
        category: "retrieval",
        description: "List reusable workspace retrieval profiles for search, investigation, and future agent scopes.",
        keywords: &["retrieval", "profile", "workspace", "list", "scope", "anythingllm"],
        command_name: "list_retrieval_profiles",
        wrapper_name: "listRetrievalProfiles",
        execution_kind: "read",
        required_input: &[],
        input_hint: "No input required.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "AnythingLLM per-workspace retrieval settings and Thepoint Round 12",
        priority: 101,
    },
    CommandPaletteItemSpec {
        id: "capture.quick_capture.save",
        title: "Capture: Save Quick Capture",
        category: "capture",
        description: "Save raw user text into the local quick-capture inbox for later triage.",
        keywords: &["capture", "memo", "inbox", "quick", "memos", "note"],
        command_name: "save_quick_capture",
        wrapper_name: "saveQuickCapture",
        execution_kind: "write",
        required_input: &["content"],
        input_hint: "content plus optional tags and sourceKind.",
        risk: "creates_or_updates_local_records",
        shortcut_hint: None,
        source_inspiration: "Memos low-friction capture and Thepoint Round 06",
        priority: 100,
    },
    CommandPaletteItemSpec {
        id: "reports.starter.build",
        title: "Reports: Build Starter Draft",
        category: "reports",
        description: "Create a report or investigation draft from a template and selected local assets without saving it.",
        keywords: &["report", "starter", "template", "investigation", "draft", "affine", "appflowy"],
        command_name: "build_report_starter",
        wrapper_name: "buildReportStarter",
        execution_kind: "draft",
        required_input: &["templateId", "query"],
        input_hint: "templateId, query, and optional sourceIds, pointIds, evidenceIds.",
        risk: "draft_only",
        shortcut_hint: None,
        source_inspiration: "AFFiNE/AppFlowy template workflows and Thepoint Round 07",
        priority: 98,
    },
    CommandPaletteItemSpec {
        id: "reports.starter.templates",
        title: "Reports: List Starter Templates",
        category: "reports",
        description: "List searchable built-in starter templates for reports and investigations.",
        keywords: &["template", "starter", "report", "investigation", "list"],
        command_name: "list_report_starter_templates",
        wrapper_name: "listReportStarterTemplates",
        execution_kind: "read",
        required_input: &[],
        input_hint: "Optional category and query filters.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "AFFiNE searchable templates and Thepoint Round 07",
        priority: 94,
    },
    CommandPaletteItemSpec {
        id: "diagnostics.reprocess_queue",
        title: "Diagnostics: Review Reprocess Queue",
        category: "diagnostics",
        description: "Find low-quality indexed files, chunkless Sources, and report audit gaps that may need reprocessing.",
        keywords: &["diagnostic", "reprocess", "queue", "low quality", "indexed file", "marginalia"],
        command_name: "load_reprocess_queue",
        wrapper_name: "loadReprocessQueue",
        execution_kind: "diagnostic",
        required_input: &[],
        input_hint: "Optional kinds and limit.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "marginalia ingest lifecycle and Thepoint Round 08",
        priority: 92,
    },
    CommandPaletteItemSpec {
        id: "diagnostics.import_ledger",
        title: "Diagnostics: Import Diagnostics Ledger",
        category: "diagnostics",
        description: "Review indexed-folder import and scan outcomes by file, format, status, error, and recovery action.",
        keywords: &[
            "diagnostic",
            "import",
            "ledger",
            "scan",
            "indexed file",
            "zotero",
            "joplin",
            "warnings",
        ],
        command_name: "load_import_diagnostics_ledger",
        wrapper_name: "loadImportDiagnosticsLedger",
        execution_kind: "diagnostic",
        required_input: &[],
        input_hint: "Optional folderId, statuses, includeOk, and limit.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "Zotero import progress queue + Joplin InteropService warnings refined into Thepoint Round 14",
        priority: 93,
    },
    CommandPaletteItemSpec {
        id: "diagnostics.duplicate_assets",
        title: "Diagnostics: Review Duplicate Assets",
        category: "diagnostics",
        description: "Detect exact and near-duplicate Sources, Points, and Reports without merging or deleting anything.",
        keywords: &["diagnostic", "duplicate", "dedupe", "near duplicate", "zotero", "review"],
        command_name: "detect_duplicate_assets",
        wrapper_name: "detectDuplicateAssets",
        execution_kind: "diagnostic",
        required_input: &[],
        input_hint: "Optional kinds and limit.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "Zotero duplicate item detection and Thepoint Round 09",
        priority: 90,
    },
    CommandPaletteItemSpec {
        id: "graph.neighborhood_preview",
        title: "Graph: Preview Asset Neighborhood",
        category: "graph",
        description: "Preview one-hop or two-hop relation context plus suggested backlinks and duplicates.",
        keywords: &["graph", "neighborhood", "preview", "relations", "foam", "logseq"],
        command_name: "build_graph_neighborhood_preview",
        wrapper_name: "buildGraphNeighborhoodPreview",
        execution_kind: "read",
        required_input: &["kind", "id"],
        input_hint: "kind, id, optional depth, includeSuggestions, and limit.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "Foam graph focus subsets + Logseq page graph and Thepoint Round 10",
        priority: 88,
    },
    CommandPaletteItemSpec {
        id: "graph.backlink_suggestions",
        title: "Graph: Suggest Backlinks",
        category: "graph",
        description: "Find assets that mention the current target but are not yet linked by asset_relations.",
        keywords: &["graph", "backlink", "unlinked mention", "same topic", "foam", "logseq"],
        command_name: "suggest_backlinks",
        wrapper_name: "suggestBacklinks",
        execution_kind: "read",
        required_input: &["kind", "id"],
        input_hint: "target kind and id plus optional limit.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "Foam/Logseq backlink workflows and Thepoint Round 03",
        priority: 86,
    },
    CommandPaletteItemSpec {
        id: "diagnostics.citation_quality",
        title: "Diagnostics: Citation Quality Dashboard",
        category: "diagnostics",
        description: "Aggregate report claim/citation coverage, stale locators, missing targets, and severity.",
        keywords: &["citation", "quality", "dashboard", "report", "zotero", "audit"],
        command_name: "load_citation_quality_dashboard",
        wrapper_name: "loadCitationQualityDashboard",
        execution_kind: "diagnostic",
        required_input: &[],
        input_hint: "Optional limit.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "Zotero citation workflows and Thepoint Round 04",
        priority: 84,
    },
    CommandPaletteItemSpec {
        id: "evaluations.investigation_qa",
        title: "Evaluations: Run Investigation QA Fixtures",
        category: "evaluations",
        description: "Evaluate saved Investigation reports for multi-document citation coverage, citation health, and answer structure.",
        keywords: &[
            "evaluation",
            "qa",
            "fixture",
            "investigation",
            "multi document",
            "kotaemon",
            "regression",
        ],
        command_name: "run_investigation_qa_eval",
        wrapper_name: "runInvestigationQaEval",
        execution_kind: "diagnostic",
        required_input: &[],
        input_hint: "Optional reportId and limit.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "Kotaemon multi-document QA evaluation fixtures refined into Thepoint Round 19",
        priority: 83,
    },
    CommandPaletteItemSpec {
        id: "collections.saved_searches.list",
        title: "Collections: List Saved Searches",
        category: "collections",
        description: "List saved smart collection definitions for reusable dynamic Library searches.",
        keywords: &["saved search", "smart collection", "joplin", "siyuan", "collection"],
        command_name: "list_saved_asset_searches",
        wrapper_name: "listSavedAssetSearches",
        execution_kind: "read",
        required_input: &[],
        input_hint: "No input required.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "Joplin reusable search + SiYuan attribute views and Thepoint Round 05",
        priority: 82,
    },
    CommandPaletteItemSpec {
        id: "collections.saved_searches.save",
        title: "Collections: Save Smart Search",
        category: "collections",
        description: "Persist a unified-search definition as a dynamic smart collection.",
        keywords: &["saved search", "smart collection", "filter", "library", "save"],
        command_name: "save_asset_search",
        wrapper_name: "saveAssetSearch",
        execution_kind: "write",
        required_input: &["name", "query"],
        input_hint: "name, query, optional kinds, filter, and limit.",
        risk: "creates_or_updates_local_records",
        shortcut_hint: None,
        source_inspiration: "Joplin/SiYuan saved search methodology and Thepoint Round 05",
        priority: 80,
    },
    CommandPaletteItemSpec {
        id: "capture.quick_capture.list",
        title: "Capture: List Quick Captures",
        category: "capture",
        description: "Load inbox, resolved, or dismissed quick-capture items for triage.",
        keywords: &["capture", "memo", "inbox", "triage", "list"],
        command_name: "list_quick_captures",
        wrapper_name: "listQuickCaptures",
        execution_kind: "read",
        required_input: &[],
        input_hint: "Optional status and limit.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "Memos inbox state model and Thepoint Round 06",
        priority: 78,
    },
    CommandPaletteItemSpec {
        id: "capture.quick_capture.resolve",
        title: "Capture: Resolve Quick Capture",
        category: "capture",
        description: "Archive a capture into Journal, Point, or Source in one local transaction.",
        keywords: &["capture", "resolve", "journal", "point", "source", "triage"],
        command_name: "resolve_quick_capture",
        wrapper_name: "resolveQuickCapture",
        execution_kind: "write",
        required_input: &["id", "targetKind"],
        input_hint: "capture id, targetKind, and optional title, query, parentId.",
        risk: "creates_or_updates_local_records",
        shortcut_hint: None,
        source_inspiration: "Memos memo lifecycle refined into Thepoint Round 06",
        priority: 76,
    },
    CommandPaletteItemSpec {
        id: "review.queue_plan",
        title: "Review: Build Queue Plan",
        category: "review",
        description: "Build a read-only plan for due or catch-up review items.",
        keywords: &["review", "queue", "spaced", "due", "plan"],
        command_name: "build_review_queue_plan",
        wrapper_name: "buildReviewQueuePlan",
        execution_kind: "read",
        required_input: &[],
        input_hint: "Optional mode and limit.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "Local research workspace review queue",
        priority: 74,
    },
    CommandPaletteItemSpec {
        id: "review.due_items",
        title: "Review: List Due Items",
        category: "review",
        description: "Load currently due review items ordered by due time and priority.",
        keywords: &["review", "due", "items", "spaced repetition"],
        command_name: "list_due_review_items",
        wrapper_name: "listDueReviewItems",
        execution_kind: "read",
        required_input: &[],
        input_hint: "No input required.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "Thepoint local Review Queue",
        priority: 72,
    },
    CommandPaletteItemSpec {
        id: "mirror.plan",
        title: "Export: Build Open Data Mirror Plan",
        category: "export",
        description: "Preview which Markdown mirror files would be written, skipped, overwritten, or pruned.",
        keywords: &["export", "mirror", "open data", "plan", "markdown"],
        command_name: "build_open_data_mirror_plan",
        wrapper_name: "buildOpenDataMirrorPlan",
        execution_kind: "read",
        required_input: &[],
        input_hint: "Mirror config must already be set.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "Thepoint Open Data Mirror plan-first export",
        priority: 70,
    },
    CommandPaletteItemSpec {
        id: "mirror.sync_audit",
        title: "Export: Audit Mirror Sync",
        category: "export",
        description: "Audit whether local assets, mirror files, and manifest entries are in sync without exporting or pruning.",
        keywords: &[
            "export",
            "mirror",
            "sync",
            "audit",
            "local first",
            "appflowy",
            "consistency",
        ],
        command_name: "build_export_sync_audit",
        wrapper_name: "buildExportSyncAudit",
        execution_kind: "diagnostic",
        required_input: &[],
        input_hint: "No input required; uses the current Open Data Mirror config.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "AppFlowy local-first workspace consistency checks refined into Thepoint Round 18",
        priority: 69,
    },
    CommandPaletteItemSpec {
        id: "mirror.export",
        title: "Export: Run Open Data Mirror",
        category: "export",
        description: "Write portable Markdown mirror files for configured local assets.",
        keywords: &["export", "mirror", "markdown", "manifest", "write files"],
        command_name: "export_open_data_mirror",
        wrapper_name: "exportOpenDataMirror",
        execution_kind: "export",
        required_input: &[],
        input_hint: "Mirror config must be enabled and point to a root path.",
        risk: "writes_export_files",
        shortcut_hint: None,
        source_inspiration: "Thepoint Open Data Mirror export workflow",
        priority: 68,
    },
    CommandPaletteItemSpec {
        id: "ai.generate_investigation",
        title: "AI: Generate Investigation",
        category: "ai",
        description: "Generate a bounded investigation from explicit local scope, optional Journal recall, and library search.",
        keywords: &["ai", "investigation", "report", "generate", "scope", "journal"],
        command_name: "generate_investigation",
        wrapper_name: "generateInvestigation",
        execution_kind: "model",
        required_input: &["query", "scope"],
        input_hint: "query, scope asset ids, include flags, and mode.",
        risk: "model_call",
        shortcut_hint: None,
        source_inspiration: "Thepoint Investigation audit and context manifest",
        priority: 66,
    },
    CommandPaletteItemSpec {
        id: "ai.generate_digest",
        title: "AI: Generate Digest",
        category: "ai",
        description: "Generate a citation-aware digest from current starred Points and optional Evidence selections.",
        keywords: &["ai", "digest", "generate", "evidence", "starred points"],
        command_name: "generate_digest",
        wrapper_name: "generateDigest",
        execution_kind: "model",
        required_input: &[],
        input_hint: "Optional evidenceIds; starred Points are read from local state.",
        risk: "model_call",
        shortcut_hint: None,
        source_inspiration: "Thepoint Evidence/Digest citation workflow",
        priority: 64,
    },
    CommandPaletteItemSpec {
        id: "ai.generate_synthesis",
        title: "AI: Generate Synthesis",
        category: "ai",
        description: "Generate a bounded multi-source synthesis from selected Sources and optional starred Points.",
        keywords: &["ai", "synthesis", "source", "generate", "multi document"],
        command_name: "generate_synthesis",
        wrapper_name: "generateSynthesis",
        execution_kind: "model",
        required_input: &["sourceIds"],
        input_hint: "sourceIds and includeStarred.",
        risk: "model_call",
        shortcut_hint: None,
        source_inspiration: "Thepoint multi-source synthesis command",
        priority: 62,
    },
    CommandPaletteItemSpec {
        id: "analytics.overview",
        title: "Analytics: Open Workbench Overview",
        category: "analytics",
        description: "Load local analytics for sources, points, reports, evidence, review, and mirror state.",
        keywords: &["analytics", "overview", "stats", "workspace"],
        command_name: "get_analytics",
        wrapper_name: "getAnalytics",
        execution_kind: "read",
        required_input: &[],
        input_hint: "No input required.",
        risk: "read_only",
        shortcut_hint: None,
        source_inspiration: "Thepoint analytics dashboard",
        priority: 58,
    },
];

const REPORT_STARTER_TEMPLATES: &[ReportStarterTemplateSpec] = &[
    ReportStarterTemplateSpec {
        id: "investigation-brief",
        name: "Investigation Brief",
        category: "investigation",
        kind: "investigation",
        description: "A question-first investigation scaffold with evidence map, findings, risks, and next actions.",
        sections: &[
            "Question",
            "Context Pack",
            "Evidence Map",
            "Findings",
            "Risks And Unknowns",
            "Next Actions",
        ],
        source_inspiration: "AFFiNE built-in template manager + AppFlowy default workspace templates",
    },
    ReportStarterTemplateSpec {
        id: "evidence-review",
        name: "Evidence Review Matrix",
        category: "investigation",
        kind: "investigation",
        description: "A source/point/evidence review scaffold for checking support, contradiction, gaps, and follow-up work.",
        sections: &[
            "Review Scope",
            "Evidence Table",
            "Agreement And Conflict",
            "Missing Evidence",
            "Decision Notes",
        ],
        source_inspiration: "AFFiNE searchable template categories + AppFlowy structured default database fields",
    },
    ReportStarterTemplateSpec {
        id: "synthesis-note",
        name: "Synthesis Note",
        category: "synthesis",
        kind: "synthesis",
        description: "A compact synthesis scaffold for combining selected assets into a reusable narrative report.",
        sections: &[
            "Synthesis Thesis",
            "Supporting Signals",
            "Counterpoints",
            "Reusable Summary",
            "Follow-up Questions",
        ],
        source_inspiration: "AFFiNE template content insertion + AppFlowy template library entrypoint",
    },
];

pub fn list_command_palette_items(input: CommandPaletteInput) -> CommandPaletteManifest {
    let query = optional_trimmed(input.query.as_deref()).map(|value| value.to_lowercase());
    let category = optional_trimmed(input.category.as_deref()).map(|value| value.to_lowercase());
    let limit = input.limit.unwrap_or(60).clamp(1, 100) as usize;
    let mut items = COMMAND_PALETTE_ITEMS
        .iter()
        .filter(|spec| {
            category.as_ref().map_or(true, |category| {
                spec.category.eq_ignore_ascii_case(category)
            })
        })
        .filter(|spec| {
            query.as_ref().map_or(true, |query| {
                command_palette_item_matches_query(spec, query)
            })
        })
        .map(command_palette_item_from_spec)
        .collect::<Vec<_>>();

    items.sort_by(|left, right| {
        right
            .priority
            .cmp(&left.priority)
            .then_with(|| left.category.cmp(&right.category))
            .then_with(|| left.title.cmp(&right.title))
    });

    let total_matches = items.len();
    items.truncate(limit);
    let mut warnings = Vec::new();
    if total_matches == 0 {
        warnings.push("No command palette items matched the filters.".to_string());
    }
    if total_matches > items.len() {
        warnings.push(format!(
            "Command palette manifest truncated from {total_matches} item(s) to {limit} item(s)."
        ));
    }

    CommandPaletteManifest {
        generated_at: chrono::Utc::now().to_rfc3339(),
        item_count: items.len() as i64,
        categories: command_palette_categories(),
        items,
        warnings,
    }
}

pub fn load_import_diagnostics_ledger(
    conn: &Connection,
    input: ImportDiagnosticsInput,
) -> Result<ImportDiagnosticsLedger> {
    let limit = input.limit.unwrap_or(80).clamp(1, 200) as usize;
    let include_ok = input.include_ok.unwrap_or(false);
    let statuses = normalize_import_diagnostic_statuses(input.statuses);
    let rows = load_indexed_file_diagnostic_rows(conn, input.folder_id.as_deref())?;
    let total_rows = rows.len();
    let mut folder_summaries: HashMap<String, ImportFolderDiagnosticSummary> = HashMap::new();
    let mut items = Vec::new();

    for row in rows {
        let classification = classify_import_diagnostic(&row.file);
        update_import_folder_summary(&mut folder_summaries, &row, &classification);
        let item = import_diagnostic_item(row, classification);
        if !include_ok && item.severity == "ok" {
            continue;
        }
        if !import_diagnostic_matches_status(&item, &statuses) {
            continue;
        }
        items.push(item);
    }

    items.sort_by(|left, right| {
        import_severity_rank(&right.severity)
            .cmp(&import_severity_rank(&left.severity))
            .then_with(|| right.indexed_at.cmp(&left.indexed_at))
            .then_with(|| left.folder_name.cmp(&right.folder_name))
            .then_with(|| left.file_name.cmp(&right.file_name))
            .then_with(|| left.file_id.cmp(&right.file_id))
    });

    let total_candidates = items.len();
    items.truncate(limit);

    let mut folders = folder_summaries.into_values().collect::<Vec<_>>();
    folders.sort_by(|left, right| {
        right
            .critical_count
            .cmp(&left.critical_count)
            .then_with(|| right.warning_count.cmp(&left.warning_count))
            .then_with(|| left.folder_name.cmp(&right.folder_name))
            .then_with(|| left.folder_id.cmp(&right.folder_id))
    });

    let ok_count = folders.iter().map(|folder| folder.ok_count).sum();
    let warning_count = folders.iter().map(|folder| folder.warning_count).sum();
    let critical_count = folders.iter().map(|folder| folder.critical_count).sum();

    let mut warnings = Vec::new();
    if total_rows == 0 {
        warnings.push("No indexed-folder import records matched the selected scope.".to_string());
    } else if total_candidates == 0 {
        warnings.push("No import diagnostics matched the selected filters.".to_string());
    }
    if total_candidates > items.len() {
        warnings.push(format!(
            "Import diagnostics ledger truncated from {total_candidates} candidate(s) to {limit} item(s)."
        ));
    }

    Ok(ImportDiagnosticsLedger {
        generated_at: chrono::Utc::now().to_rfc3339(),
        item_count: items.len() as i64,
        folder_count: folders.len() as i64,
        ok_count,
        warning_count,
        critical_count,
        folders,
        items,
        warnings,
    })
}

struct IndexedFileDiagnosticRow {
    file: IndexedFile,
    folder_name: String,
    folder_path: String,
    folder_last_scanned_at: Option<String>,
}

fn load_indexed_file_diagnostic_rows(
    conn: &Connection,
    folder_id: Option<&str>,
) -> Result<Vec<IndexedFileDiagnosticRow>> {
    let folder_filter = optional_trimmed(folder_id);
    let mut stmt = conn.prepare(
        "SELECT f.id, f.folder_id, f.path, f.canonical_path, f.name, f.extension, f.size_bytes, f.modified_at, f.source_id, f.indexed_at,
                f.descriptor_kind, f.read_status, f.index_status, f.metadata_json, f.preview_text, f.text_hash, f.extracted_chars, f.total_chars, f.last_error,
                COALESCE(folder.name, f.folder_id) AS folder_name,
                COALESCE(folder.path, f.folder_id) AS folder_path,
                folder.last_scanned_at
         FROM indexed_files f
         LEFT JOIN indexed_folders folder ON folder.id = f.folder_id
         WHERE (?1 IS NULL OR f.folder_id = ?1)
         ORDER BY f.indexed_at DESC",
    )?;
    let rows = stmt.query_map(params![folder_filter.as_deref()], |row| {
        Ok(IndexedFileDiagnosticRow {
            file: map_indexed_file_row(row)?,
            folder_name: row.get(19)?,
            folder_path: row.get(20)?,
            folder_last_scanned_at: row.get(21)?,
        })
    })?;
    let mut output = Vec::new();
    for row in rows {
        output.push(row?);
    }
    Ok(output)
}

struct ImportDiagnosticClassification {
    severity: &'static str,
    issue_kind: &'static str,
    message: String,
    recovery_action: &'static str,
    command_name: &'static str,
    wrapper_name: &'static str,
}

fn classify_import_diagnostic(file: &IndexedFile) -> ImportDiagnosticClassification {
    let error = optional_trimmed(file.last_error.as_deref())
        .map(|value| compact_preview(&value, 180))
        .unwrap_or_default();
    if file.read_status == "missing" || file.index_status == "stale" {
        return ImportDiagnosticClassification {
            severity: "critical",
            issue_kind: "missing_or_stale_file",
            message: first_non_empty([
                Some(error.as_str()),
                Some("File was missing or stale during the last indexed-folder scan."),
            ])
            .unwrap()
            .to_string(),
            recovery_action: "Restore the file at its original path or rescan the indexed folder.",
            command_name: "scan_indexed_folder",
            wrapper_name: "scanIndexedFolder",
        };
    }
    if file.read_status == "failed" || file.index_status == "failed" {
        return ImportDiagnosticClassification {
            severity: "critical",
            issue_kind: "file_read_failed",
            message: first_non_empty([
                Some(error.as_str()),
                Some("The file could not be read or indexed."),
            ])
            .unwrap()
            .to_string(),
            recovery_action:
                "Check file permissions, encoding, and path validity, then rescan the folder.",
            command_name: "scan_indexed_folder",
            wrapper_name: "scanIndexedFolder",
        };
    }
    if file.index_status == "partial" {
        return ImportDiagnosticClassification {
            severity: "warning",
            issue_kind: "partial_index",
            message: first_non_empty([
                Some(error.as_str()),
                Some("The file was discovered but only partially indexed."),
            ])
            .unwrap()
            .to_string(),
            recovery_action:
                "Inspect the source file and rescan after fixing parser or encoding issues.",
            command_name: "scan_indexed_folder",
            wrapper_name: "scanIndexedFolder",
        };
    }
    if file.read_status == "too_large" {
        return ImportDiagnosticClassification {
            severity: "warning",
            issue_kind: "file_too_large",
            message: first_non_empty([
                Some(error.as_str()),
                Some("The file exceeded the local text indexing size budget."),
            ])
            .unwrap()
            .to_string(),
            recovery_action:
                "Split or summarize the file before rescanning, or import a smaller derivative.",
            command_name: "load_indexed_file_preview",
            wrapper_name: "loadIndexedFilePreview",
        };
    }
    if file.read_status == "unsupported" || file.index_status == "metadata_only" {
        return ImportDiagnosticClassification {
            severity: "warning",
            issue_kind: "metadata_only_file",
            message: "File was recorded as metadata only; no searchable text was extracted."
                .to_string(),
            recovery_action:
                "Inspect parser support or convert the file to a supported text format.",
            command_name: "load_indexed_file_preview",
            wrapper_name: "loadIndexedFilePreview",
        };
    }
    if !error.is_empty() {
        return ImportDiagnosticClassification {
            severity: "warning",
            issue_kind: "import_warning",
            message: error,
            recovery_action: "Inspect the file warning and rescan if the source changed.",
            command_name: "load_indexed_file_preview",
            wrapper_name: "loadIndexedFilePreview",
        };
    }
    ImportDiagnosticClassification {
        severity: "ok",
        issue_kind: "import_ok",
        message: "File is indexed and has no recorded import warning.".to_string(),
        recovery_action: "No recovery action required.",
        command_name: "load_indexed_file_preview",
        wrapper_name: "loadIndexedFilePreview",
    }
}

fn import_diagnostic_item(
    row: IndexedFileDiagnosticRow,
    classification: ImportDiagnosticClassification,
) -> ImportDiagnosticItem {
    let input = if classification.command_name == "scan_indexed_folder" {
        serde_json::json!({ "folderId": row.file.folder_id.clone() })
    } else {
        serde_json::json!({ "fileId": row.file.id.clone() })
    };
    ImportDiagnosticItem {
        id: format!("import:{}:{}", row.file.folder_id, row.file.id),
        folder_id: row.file.folder_id.clone(),
        folder_name: row.folder_name,
        folder_path: row.folder_path,
        file_id: row.file.id.clone(),
        file_name: row.file.name.clone(),
        path: row.file.path.clone(),
        extension: row.file.extension.clone(),
        descriptor_kind: row.file.descriptor_kind.clone(),
        read_status: row.file.read_status.clone(),
        index_status: row.file.index_status.clone(),
        severity: classification.severity.to_string(),
        issue_kind: classification.issue_kind.to_string(),
        message: classification.message,
        recovery_action: classification.recovery_action.to_string(),
        command_name: classification.command_name.to_string(),
        wrapper_name: classification.wrapper_name.to_string(),
        input_json: input.to_string(),
        source_id: row.file.source_id,
        indexed_at: row.file.indexed_at,
        last_error: row.file.last_error,
        metadata_json: row.file.metadata_json,
    }
}

fn update_import_folder_summary(
    summaries: &mut HashMap<String, ImportFolderDiagnosticSummary>,
    row: &IndexedFileDiagnosticRow,
    classification: &ImportDiagnosticClassification,
) {
    let summary = summaries
        .entry(row.file.folder_id.clone())
        .or_insert_with(|| ImportFolderDiagnosticSummary {
            folder_id: row.file.folder_id.clone(),
            folder_name: row.folder_name.clone(),
            folder_path: row.folder_path.clone(),
            last_scanned_at: row.folder_last_scanned_at.clone(),
            total_files: 0,
            ok_count: 0,
            metadata_only_count: 0,
            partial_count: 0,
            failed_count: 0,
            missing_count: 0,
            stale_count: 0,
            warning_count: 0,
            critical_count: 0,
        });
    summary.total_files += 1;
    if row.file.index_status == "metadata_only" {
        summary.metadata_only_count += 1;
    }
    if row.file.index_status == "partial" {
        summary.partial_count += 1;
    }
    if row.file.read_status == "failed" || row.file.index_status == "failed" {
        summary.failed_count += 1;
    }
    if row.file.read_status == "missing" {
        summary.missing_count += 1;
    }
    if row.file.index_status == "stale" {
        summary.stale_count += 1;
    }
    match classification.severity {
        "critical" => summary.critical_count += 1,
        "warning" => summary.warning_count += 1,
        "ok" => summary.ok_count += 1,
        _ => {}
    }
}

fn normalize_import_diagnostic_statuses(statuses: Option<Vec<String>>) -> HashSet<String> {
    let allowed = [
        "ok",
        "warning",
        "critical",
        "indexed",
        "metadata_only",
        "partial",
        "failed",
        "missing",
        "stale",
        "unsupported",
        "too_large",
        "import_ok",
        "metadata_only_file",
        "partial_index",
        "file_read_failed",
        "missing_or_stale_file",
        "file_too_large",
        "import_warning",
    ];
    statuses
        .unwrap_or_default()
        .into_iter()
        .filter_map(|status| optional_trimmed(Some(&status)))
        .map(|status| status.to_lowercase())
        .filter(|status| allowed.contains(&status.as_str()))
        .collect()
}

fn import_diagnostic_matches_status(
    item: &ImportDiagnosticItem,
    statuses: &HashSet<String>,
) -> bool {
    statuses.is_empty()
        || statuses.contains(item.severity.as_str())
        || statuses.contains(item.issue_kind.as_str())
        || statuses.contains(item.read_status.as_str())
        || statuses.contains(item.index_status.as_str())
}

fn import_severity_rank(severity: &str) -> i64 {
    match severity {
        "critical" => 3,
        "warning" => 2,
        "ok" => 1,
        _ => 0,
    }
}

pub fn load_automation_suggestions(
    conn: &Connection,
    input: AutomationSuggestionInput,
) -> Result<AutomationSuggestionReport> {
    let limit = input.limit.unwrap_or(40).clamp(1, 100) as usize;
    let categories = normalize_automation_suggestion_categories(input.categories);
    let mut items = Vec::new();

    if categories.contains("review") {
        collect_review_automation_suggestions(conn, &mut items, limit)?;
    }
    if categories.contains("citations") {
        collect_citation_automation_suggestions(conn, &mut items, limit)?;
    }
    if categories.contains("reprocess") {
        collect_reprocess_automation_suggestions(conn, &mut items, limit)?;
    }
    if categories.contains("import") {
        collect_import_automation_suggestions(conn, &mut items, limit)?;
    }
    if categories.contains("duplicates") {
        collect_duplicate_automation_suggestions(conn, &mut items, limit)?;
    }
    if categories.contains("capture") {
        collect_capture_automation_suggestions(conn, &mut items, limit)?;
    }
    if categories.contains("sources") {
        collect_source_automation_suggestions(conn, &mut items, limit)?;
    }
    if categories.contains("retrieval") {
        collect_retrieval_profile_automation_suggestions(conn, &mut items, limit)?;
    }

    items.sort_by(|left, right| {
        right
            .priority_score
            .cmp(&left.priority_score)
            .then_with(|| left.category.cmp(&right.category))
            .then_with(|| left.subject.cmp(&right.subject))
            .then_with(|| left.id.cmp(&right.id))
    });

    let total_candidates = items.len();
    items.truncate(limit);
    let critical_count = automation_priority_count(&items, "critical");
    let high_count = automation_priority_count(&items, "high");
    let normal_count = automation_priority_count(&items, "normal");
    let low_count = automation_priority_count(&items, "low");
    let mut warnings = Vec::new();
    if total_candidates == 0 {
        warnings.push("No automation suggestions matched the selected categories.".to_string());
    }
    if total_candidates > items.len() {
        warnings.push(format!(
            "Automation suggestions truncated from {total_candidates} candidate(s) to {limit} item(s)."
        ));
    }

    Ok(AutomationSuggestionReport {
        generated_at: chrono::Utc::now().to_rfc3339(),
        item_count: items.len() as i64,
        critical_count,
        high_count,
        normal_count,
        low_count,
        items,
        warnings,
    })
}

fn normalize_automation_suggestion_categories(categories: Option<Vec<String>>) -> HashSet<String> {
    let allowed = [
        "review",
        "citations",
        "reprocess",
        "import",
        "duplicates",
        "capture",
        "retrieval",
        "sources",
    ];
    let mut normalized = categories
        .unwrap_or_default()
        .into_iter()
        .filter_map(|category| optional_trimmed(Some(&category)))
        .map(|category| match category.to_lowercase().as_str() {
            "citation" => "citations".to_string(),
            "duplicate" => "duplicates".to_string(),
            "source" => "sources".to_string(),
            value => value.to_string(),
        })
        .filter(|category| allowed.contains(&category.as_str()))
        .collect::<HashSet<_>>();
    if normalized.is_empty() {
        normalized.extend(allowed.iter().map(|category| (*category).to_string()));
    }
    normalized
}

fn collect_review_automation_suggestions(
    conn: &Connection,
    items: &mut Vec<AutomationSuggestionItem>,
    limit: usize,
) -> Result<()> {
    let plan = build_review_queue_plan(
        conn,
        ReviewQueuePlanInput {
            mode: Some("due".to_string()),
            limit: Some(limit.min(REVIEW_QUEUE_MAX_LIMIT as usize) as i64),
        },
    )?;
    for plan_item in plan.items {
        let priority = if plan_item.days_overdue > 0 || plan_item.priority_rank >= 3 {
            "high"
        } else if plan_item.priority_rank <= 1 {
            "low"
        } else {
            "normal"
        };
        let target_kind = plan_item.item.target_kind.clone();
        let target_id = plan_item.item.target_id.clone();
        let title = plan_item.item.title.clone();
        items.push(automation_suggestion_item(
            format!("review:{}", plan_item.item.id),
            "review",
            priority,
            format!("Review due item: {title}"),
            format!(
                "{} review target is in the due queue at position {}.",
                target_kind, plan_item.position
            ),
            plan_item.reason,
            "Open review queue plan",
            "build_review_queue_plan",
            "buildReviewQueuePlan",
            serde_json::json!({ "mode": "due", "limit": REVIEW_QUEUE_DEFAULT_LIMIT }),
            Some(target_kind),
            Some(target_id),
            "Review queue sweep: daily or when starting a research session.",
            "Khoj scheduled jobs + Thepoint Review Queue planner",
        ));
    }
    Ok(())
}

fn collect_citation_automation_suggestions(
    conn: &Connection,
    items: &mut Vec<AutomationSuggestionItem>,
    limit: usize,
) -> Result<()> {
    let dashboard = build_citation_quality_dashboard(conn, Some(limit.min(50) as i64))?;
    for citation in dashboard.problem_citations {
        let priority = match citation.locator_status.as_str() {
            "target_missing" | "not_found" => "critical",
            "stale" => "high",
            _ => "normal",
        };
        let label = citation
            .label
            .as_deref()
            .or(citation.title.as_deref())
            .unwrap_or("citation");
        items.push(automation_suggestion_item(
            format!(
                "citation:{}:{}:{}",
                citation.report_id, citation.citation_index, citation.locator_status
            ),
            "citations",
            priority,
            format!("Check {label} in {}", citation.report_title),
            citation.message,
            citation.reason,
            "Open citation quality dashboard",
            "load_citation_quality_dashboard",
            "loadCitationQualityDashboard",
            serde_json::json!({ "limit": 50 }),
            Some("report".to_string()),
            Some(citation.report_id),
            "Citation audit sweep: daily or before exporting reports.",
            "Khoj automation reports + Zotero-style stale citation diagnostics",
        ));
    }
    Ok(())
}

fn collect_reprocess_automation_suggestions(
    conn: &Connection,
    items: &mut Vec<AutomationSuggestionItem>,
    limit: usize,
) -> Result<()> {
    let queue = build_reprocess_queue(
        conn,
        ReprocessQueueInput {
            kinds: None,
            limit: Some(limit.min(50) as i64),
        },
    )?;
    for queue_item in queue.items {
        let priority = if queue_item.severity == "critical" {
            "critical"
        } else {
            "normal"
        };
        let action_label = queue_item.suggested_action.replace('_', " ");
        items.push(automation_suggestion_item(
            format!(
                "reprocess:{}:{}",
                queue_item.target_kind, queue_item.target_id
            ),
            "reprocess",
            priority,
            format!("Reprocess candidate: {}", queue_item.title),
            format!(
                "{} has `{}` quality issue.",
                queue_item.target_kind, queue_item.issue_kind
            ),
            queue_item.reason,
            action_label,
            "load_reprocess_queue",
            "loadReprocessQueue",
            serde_json::json!({ "kinds": [queue_item.target_kind.clone()], "limit": 50 }),
            Some(queue_item.target_kind),
            Some(queue_item.target_id),
            "Maintenance sweep: daily or after indexed-folder scans.",
            "Khoj recurring jobs + marginalia ingest lifecycle queue",
        ));
    }
    Ok(())
}

fn collect_import_automation_suggestions(
    conn: &Connection,
    items: &mut Vec<AutomationSuggestionItem>,
    limit: usize,
) -> Result<()> {
    let ledger = load_import_diagnostics_ledger(
        conn,
        ImportDiagnosticsInput {
            folder_id: None,
            statuses: None,
            include_ok: Some(false),
            limit: Some(limit.min(50) as i64),
        },
    )?;
    for item in ledger.items {
        let priority = if item.severity == "critical" {
            "critical"
        } else {
            "normal"
        };
        items.push(automation_suggestion_item(
            format!("import:{}:{}", item.folder_id, item.file_id),
            "import",
            priority,
            format!("Inspect import diagnostic: {}", item.file_name),
            format!(
                "{} scan item has `{}` import issue.",
                item.descriptor_kind, item.issue_kind
            ),
            format!(
                "{} | read_status={} | index_status={}",
                item.message, item.read_status, item.index_status
            ),
            "Open import diagnostics ledger",
            "load_import_diagnostics_ledger",
            "loadImportDiagnosticsLedger",
            serde_json::json!({
                "folderId": item.folder_id.clone(),
                "statuses": [item.severity.clone()],
                "includeOk": false,
                "limit": 50
            }),
            Some("indexed_file".to_string()),
            Some(item.file_id),
            "Import diagnostics sweep: after indexed-folder scans or failed imports.",
            "Khoj action suggestions + Zotero/Joplin import warning ledgers",
        ));
    }
    Ok(())
}

fn collect_duplicate_automation_suggestions(
    conn: &Connection,
    items: &mut Vec<AutomationSuggestionItem>,
    limit: usize,
) -> Result<()> {
    let report = detect_duplicate_assets(
        conn,
        DuplicateAssetInput {
            kinds: None,
            limit: Some(limit.min(30) as i64),
        },
    )?;
    for group in report.groups {
        let Some(first) = group.candidates.first() else {
            continue;
        };
        let priority = if group.match_kind == "exact_fingerprint" {
            "high"
        } else {
            "normal"
        };
        items.push(automation_suggestion_item(
            format!("duplicate:{}:{}", group.group_id, group.duplicate_key),
            "duplicates",
            priority,
            format!("Review duplicate {}: {}", first.kind, first.title),
            format!(
                "{} candidate(s) share a {} duplicate fingerprint.",
                group.candidates.len(),
                group.match_kind
            ),
            group.reason,
            "Open duplicate asset report",
            "detect_duplicate_assets",
            "detectDuplicateAssets",
            serde_json::json!({ "kinds": [first.kind.clone()], "limit": 30 }),
            Some(first.kind.clone()),
            Some(first.id.clone()),
            "Duplicate review sweep: weekly or before report cleanup.",
            "Khoj preset automation cards + Zotero duplicate review workflow",
        ));
    }
    Ok(())
}

fn collect_capture_automation_suggestions(
    conn: &Connection,
    items: &mut Vec<AutomationSuggestionItem>,
    limit: usize,
) -> Result<()> {
    for capture in list_quick_captures(conn, Some("inbox"), Some(limit.min(50) as i64))? {
        let preview = compact_preview(&capture.content, 80);
        items.push(automation_suggestion_item(
            format!("capture:{}", capture.id),
            "capture",
            "normal",
            format!("Triage quick capture: {preview}"),
            "Quick capture is still in the inbox and should be resolved or dismissed.",
            format!(
                "source_kind={} | tags={}",
                capture.source_kind,
                capture.tags.join(", ")
            ),
            "Resolve quick capture",
            "resolve_quick_capture",
            "resolveQuickCapture",
            serde_json::json!({
                "id": capture.id.clone(),
                "targetKind": "journal",
                "title": null,
                "query": null,
                "parentId": null
            }),
            Some("quick_capture".to_string()),
            Some(capture.id),
            "Capture inbox sweep: daily or after research sessions.",
            "Khoj automation preset cards + Memos inbox triage lifecycle",
        ));
    }
    Ok(())
}

fn collect_source_automation_suggestions(
    conn: &Connection,
    items: &mut Vec<AutomationSuggestionItem>,
    limit: usize,
) -> Result<()> {
    for source in list_recent_sources(conn, limit.min(30))? {
        if has_review_item_for_target(conn, "source", &source.id)? {
            continue;
        }
        let title = first_non_empty([source.title.as_deref(), Some(source.canonical_uri.as_str())])
            .unwrap_or("Untitled Source")
            .to_string();
        items.push(automation_suggestion_item(
            format!("source:{}:review", source.id),
            "sources",
            "normal",
            format!("Add new Source to review: {title}"),
            "Recent Source has no review queue item yet.",
            format!(
                "source_kind={} | chunks={} | points={} | updated_at={}",
                source.kind, source.chunk_count, source.point_count, source.updated_at
            ),
            "Create review item",
            "add_review_item",
            "addReviewItem",
            serde_json::json!({
                "targetKind": "source",
                "targetId": source.id.clone(),
                "title": title,
                "note": "Automation suggestion: review recent Source",
                "priority": "normal",
                "dueAt": null
            }),
            Some("source".to_string()),
            Some(source.id),
            "New source review: after imports or indexed-folder scans.",
            "Khoj recurring knowledge tasks refined into Thepoint Review Queue",
        ));
    }
    Ok(())
}

fn collect_retrieval_profile_automation_suggestions(
    conn: &Connection,
    items: &mut Vec<AutomationSuggestionItem>,
    limit: usize,
) -> Result<()> {
    for profile in list_retrieval_profiles(conn)?
        .into_iter()
        .take(limit.min(20))
    {
        let priority = if profile.mode == "query" {
            "normal"
        } else {
            "low"
        };
        let scope = if let Some(saved_search_id) = profile.saved_search_id.as_deref() {
            format!("saved_search_id={saved_search_id}")
        } else {
            format!(
                "query={} | kinds={}",
                compact_preview(&profile.query, 80),
                profile.kinds.join(", ")
            )
        };
        items.push(automation_suggestion_item(
            format!("retrieval_profile:{}:preview", profile.id),
            "retrieval",
            priority,
            format!("Preview retrieval profile: {}", profile.name),
            "Retrieval profile can provide a scoped context pack for the next investigation.",
            scope,
            "Preview retrieval profile",
            "preview_retrieval_profile",
            "previewRetrievalProfile",
            serde_json::json!({
                "id": profile.id.clone(),
                "queryOverride": null,
                "limit": null,
                "maxCharsPerItem": null
            }),
            Some("retrieval_profile".to_string()),
            Some(profile.id),
            "Retrieval profile sweep: before drafting investigations or reports.",
            "Khoj automation queries + AnythingLLM workspace retrieval profiles",
        ));
    }
    Ok(())
}

fn has_review_item_for_target(conn: &Connection, kind: &str, id: &str) -> Result<bool> {
    conn.query_row(
        "SELECT 1 FROM review_items WHERE target_kind = ?1 AND target_id = ?2 LIMIT 1",
        params![kind, id],
        |_| Ok(()),
    )
    .optional()
    .map(|value| value.is_some())
    .map_err(Into::into)
}

fn automation_suggestion_item(
    id: String,
    category: &str,
    priority: &str,
    subject: String,
    summary: impl Into<String>,
    reason: impl Into<String>,
    action_label: impl Into<String>,
    command_name: &str,
    wrapper_name: &str,
    input: serde_json::Value,
    target_kind: Option<String>,
    target_id: Option<String>,
    schedule_hint: &str,
    source_inspiration: &str,
) -> AutomationSuggestionItem {
    AutomationSuggestionItem {
        id,
        category: category.to_string(),
        priority: priority.to_string(),
        priority_score: automation_priority_score(priority),
        subject,
        summary: summary.into(),
        reason: reason.into(),
        action_label: action_label.into(),
        command_name: command_name.to_string(),
        wrapper_name: wrapper_name.to_string(),
        input_json: input.to_string(),
        target_kind,
        target_id,
        schedule_hint: schedule_hint.to_string(),
        source_inspiration: source_inspiration.to_string(),
    }
}

fn automation_priority_score(priority: &str) -> i64 {
    match priority {
        "critical" => 400,
        "high" => 300,
        "normal" => 200,
        "low" => 100,
        _ => 0,
    }
}

fn automation_priority_count(items: &[AutomationSuggestionItem], priority: &str) -> i64 {
    items
        .iter()
        .filter(|item| item.priority == priority)
        .count() as i64
}

fn command_palette_categories() -> Vec<String> {
    let mut categories = COMMAND_PALETTE_ITEMS
        .iter()
        .map(|spec| spec.category.to_string())
        .collect::<Vec<_>>();
    categories.sort();
    categories.dedup();
    categories
}

fn command_palette_item_from_spec(spec: &CommandPaletteItemSpec) -> CommandPaletteItem {
    CommandPaletteItem {
        id: spec.id.to_string(),
        title: spec.title.to_string(),
        category: spec.category.to_string(),
        description: spec.description.to_string(),
        keywords: spec
            .keywords
            .iter()
            .map(|keyword| (*keyword).to_string())
            .collect(),
        command_name: spec.command_name.to_string(),
        wrapper_name: spec.wrapper_name.to_string(),
        execution_kind: spec.execution_kind.to_string(),
        required_input: spec
            .required_input
            .iter()
            .map(|field| (*field).to_string())
            .collect(),
        input_hint: spec.input_hint.to_string(),
        risk: spec.risk.to_string(),
        shortcut_hint: spec.shortcut_hint.map(str::to_string),
        source_inspiration: spec.source_inspiration.to_string(),
        priority: spec.priority,
    }
}

fn command_palette_item_matches_query(spec: &CommandPaletteItemSpec, query: &str) -> bool {
    let haystack = format!(
        "{} {} {} {} {} {} {} {} {} {}",
        spec.id,
        spec.title,
        spec.category,
        spec.description,
        spec.keywords.join(" "),
        spec.command_name,
        spec.wrapper_name,
        spec.execution_kind,
        spec.input_hint,
        spec.source_inspiration,
    )
    .to_lowercase();
    query
        .split_whitespace()
        .all(|term| haystack.contains(term) || command_palette_subsequence_match(term, &haystack))
}

fn command_palette_subsequence_match(query: &str, value: &str) -> bool {
    if query.is_empty() {
        return true;
    }
    let mut query_chars = query.chars();
    let mut current = query_chars.next();
    for ch in value.chars() {
        if Some(ch) == current {
            current = query_chars.next();
            if current.is_none() {
                return true;
            }
        }
    }
    false
}

pub fn list_report_starter_templates(
    category: Option<&str>,
    query: Option<&str>,
) -> Vec<ReportStarterTemplate> {
    let category = optional_trimmed(category).map(|value| value.to_lowercase());
    let query = optional_trimmed(query).map(|value| value.to_lowercase());
    REPORT_STARTER_TEMPLATES
        .iter()
        .filter(|spec| {
            category.as_ref().map_or(true, |category| {
                spec.category.eq_ignore_ascii_case(category)
            })
        })
        .filter(|spec| {
            query.as_ref().map_or(true, |query| {
                let haystack = format!(
                    "{} {} {} {}",
                    spec.id, spec.name, spec.category, spec.description
                )
                .to_lowercase();
                haystack.contains(query) || report_starter_subsequence_match(query, &haystack)
            })
        })
        .map(report_starter_template_from_spec)
        .collect()
}

pub fn build_report_starter(
    conn: &Connection,
    input: BuildReportStarterInput,
) -> Result<ReportStarterDraft> {
    let template_id = required_trimmed("report starter template id", &input.template_id)?;
    let query = required_trimmed("report starter query", &input.query)?;
    let spec = REPORT_STARTER_TEMPLATES
        .iter()
        .find(|spec| spec.id == template_id)
        .ok_or_else(|| anyhow::anyhow!("unknown report starter template: {template_id}"))?;
    validate_report_kind(spec.kind)?;

    let template = report_starter_template_from_spec(spec);
    let mut context_items = Vec::new();
    let mut warnings = Vec::new();
    collect_report_starter_sources(conn, input.source_ids, &mut context_items, &mut warnings)?;
    collect_report_starter_points(conn, input.point_ids, &mut context_items, &mut warnings)?;
    collect_report_starter_evidence(conn, input.evidence_ids, &mut context_items, &mut warnings)?;
    relabel_report_starter_context(&mut context_items);

    if context_items.is_empty() {
        warnings.push("report starter has no selected context assets".to_string());
    }

    let title = compact_preview(&format!("{} - {}", query, template.name), 120);
    let body_md = render_report_starter_body(&template, query, &context_items, &warnings);
    let summary = compact_preview(
        &format!(
            "{} starter for `{}` with {} selected context item(s).",
            template.name,
            query,
            context_items.len()
        ),
        240,
    );
    let citations_json = render_report_starter_citations(&context_items)?;

    Ok(ReportStarterDraft {
        template,
        save_input: SaveReportInput {
            title,
            kind: spec.kind.to_string(),
            source_name: Some("Report Starter".to_string()),
            body_md,
            summary,
            citations_json,
        },
        context_items,
        warnings,
    })
}

fn report_starter_template_from_spec(spec: &ReportStarterTemplateSpec) -> ReportStarterTemplate {
    ReportStarterTemplate {
        id: spec.id.to_string(),
        name: spec.name.to_string(),
        category: spec.category.to_string(),
        kind: spec.kind.to_string(),
        description: spec.description.to_string(),
        sections: spec
            .sections
            .iter()
            .map(|section| (*section).to_string())
            .collect(),
        source_inspiration: spec.source_inspiration.to_string(),
    }
}

fn report_starter_subsequence_match(query: &str, value: &str) -> bool {
    if query.is_empty() {
        return true;
    }
    let mut query_chars = query.chars();
    let mut current = query_chars.next();
    for ch in value.chars() {
        if Some(ch) == current {
            current = query_chars.next();
            if current.is_none() {
                return true;
            }
        }
    }
    false
}

fn collect_report_starter_sources(
    conn: &Connection,
    source_ids: Vec<String>,
    context_items: &mut Vec<ReportStarterContextItem>,
    warnings: &mut Vec<String>,
) -> Result<()> {
    let mut seen = HashSet::new();
    for source_id in source_ids {
        let Some(source_id) = optional_trimmed(Some(&source_id)) else {
            continue;
        };
        if !seen.insert(source_id.clone()) {
            continue;
        }
        let Some(source) = get_source_workspace_summary(conn, &source_id)? else {
            warnings.push(format!("source not found: {source_id}"));
            continue;
        };
        let chunks = list_source_chunks(conn, &source_id)?;
        let excerpt = chunks
            .first()
            .map(|chunk| compact_preview(&chunk.text, 260))
            .unwrap_or_else(|| "No source chunk text available yet.".to_string());
        context_items.push(ReportStarterContextItem {
            kind: "source".to_string(),
            id: source.id,
            label: String::new(),
            title: first_non_empty([source.title.as_deref(), Some(source.canonical_uri.as_str())])
                .unwrap_or("Untitled Source")
                .to_string(),
            excerpt,
            reason: "selected source context".to_string(),
        });
    }
    Ok(())
}

fn collect_report_starter_points(
    conn: &Connection,
    point_ids: Vec<String>,
    context_items: &mut Vec<ReportStarterContextItem>,
    warnings: &mut Vec<String>,
) -> Result<()> {
    let mut seen = HashSet::new();
    for point_id in point_ids {
        let Some(point_id) = optional_trimmed(Some(&point_id)) else {
            continue;
        };
        if !seen.insert(point_id.clone()) {
            continue;
        }
        let Some(point) = get_point(conn, &point_id)? else {
            warnings.push(format!("point not found: {point_id}"));
            continue;
        };
        let title = compact_preview(&point.content, 80);
        context_items.push(ReportStarterContextItem {
            kind: "point".to_string(),
            id: point.id,
            label: String::new(),
            title,
            excerpt: compact_preview(&point.content, 260),
            reason: "selected point context".to_string(),
        });
    }
    Ok(())
}

fn collect_report_starter_evidence(
    conn: &Connection,
    evidence_ids: Vec<String>,
    context_items: &mut Vec<ReportStarterContextItem>,
    warnings: &mut Vec<String>,
) -> Result<()> {
    let mut seen = HashSet::new();
    for evidence_id in evidence_ids {
        let Some(evidence_id) = optional_trimmed(Some(&evidence_id)) else {
            continue;
        };
        if !seen.insert(evidence_id.clone()) {
            continue;
        }
        let Some(evidence) = get_evidence(conn, &evidence_id)? else {
            warnings.push(format!("evidence not found: {evidence_id}"));
            continue;
        };
        let excerpt = first_non_empty([
            Some(evidence.answer.as_str()),
            evidence.reasoning.as_deref(),
            evidence.context.as_deref(),
        ])
        .map(|value| compact_preview(value, 260))
        .unwrap_or_else(|| compact_preview(&evidence.claim, 260));
        context_items.push(ReportStarterContextItem {
            kind: "evidence".to_string(),
            id: evidence.id,
            label: String::new(),
            title: compact_preview(&evidence.claim, 80),
            excerpt,
            reason: format!("selected evidence context ({})", evidence.verdict),
        });
    }
    Ok(())
}

fn relabel_report_starter_context(context_items: &mut [ReportStarterContextItem]) {
    let mut source_count = 0;
    let mut point_count = 0;
    let mut evidence_count = 0;
    for item in context_items {
        let label = match item.kind.as_str() {
            "source" => {
                source_count += 1;
                format!("S{source_count}")
            }
            "point" => {
                point_count += 1;
                format!("P{point_count}")
            }
            "evidence" => {
                evidence_count += 1;
                format!("E{evidence_count}")
            }
            _ => String::new(),
        };
        item.label = label;
    }
}

fn render_report_starter_body(
    template: &ReportStarterTemplate,
    query: &str,
    context_items: &[ReportStarterContextItem],
    warnings: &[String],
) -> String {
    let mut lines = vec![
        format!("# {} - {}", query, template.name),
        String::new(),
        format!("> Template: {}", template.name),
        format!("> Category: {}", template.category),
        format!("> Source inspiration: {}", template.source_inspiration),
        String::new(),
        "## Question".to_string(),
        format!("- Primary question: {query}"),
        "- Decision or research outcome needed: ".to_string(),
        "- Success criteria: ".to_string(),
        String::new(),
        "## Context Pack".to_string(),
    ];

    if context_items.is_empty() {
        lines.push(
            "- No context selected yet. Add Source, Point, or Evidence assets before finalizing."
                .to_string(),
        );
    } else {
        for item in context_items {
            lines.push(format!(
                "- [{}] {} `{}`: {}",
                item.label, item.kind, item.id, item.title
            ));
            lines.push(format!("  - Why included: {}", item.reason));
            lines.push(format!("  - Excerpt: {}", item.excerpt));
        }
    }

    for section in &template.sections {
        if section == "Question" || section == "Context Pack" {
            continue;
        }
        lines.push(String::new());
        lines.push(format!("## {section}"));
        lines.extend(report_starter_section_prompts(section, context_items));
    }

    if !warnings.is_empty() {
        lines.push(String::new());
        lines.push("## Starter Warnings".to_string());
        for warning in warnings {
            lines.push(format!("- {warning}"));
        }
    }

    lines.join("\n")
}

fn report_starter_section_prompts(
    section: &str,
    context_items: &[ReportStarterContextItem],
) -> Vec<String> {
    let labels = context_items
        .iter()
        .map(|item| format!("[{}]", item.label))
        .collect::<Vec<_>>()
        .join(", ");
    let citation_hint = if labels.is_empty() {
        "Add citations after selecting context assets.".to_string()
    } else {
        format!("Use these starter citation labels where relevant: {labels}.")
    };

    match section {
        "Evidence Map" | "Evidence Table" => vec![
            "| Claim | Support | Tension | Citation |".to_string(),
            "|---|---|---|---|".to_string(),
            format!("|  |  |  | {citation_hint} |"),
        ],
        "Findings" => vec![
            "- Finding 1: ".to_string(),
            "- Finding 2: ".to_string(),
            format!("- Citation guidance: {citation_hint}"),
        ],
        "Risks And Unknowns" | "Missing Evidence" => vec![
            "- Unknown: ".to_string(),
            "- Risk if wrong: ".to_string(),
            "- What would reduce uncertainty: ".to_string(),
        ],
        "Next Actions" | "Follow-up Questions" => vec![
            "- Next action: ".to_string(),
            "- Owner / trigger: ".to_string(),
            "- Review date or condition: ".to_string(),
        ],
        "Agreement And Conflict" | "Counterpoints" => vec![
            "- Agreement signal: ".to_string(),
            "- Contradiction or weak signal: ".to_string(),
            format!("- Citation guidance: {citation_hint}"),
        ],
        "Decision Notes" | "Reusable Summary" | "Synthesis Thesis" | "Supporting Signals" => vec![
            "- Draft note: ".to_string(),
            format!("- Citation guidance: {citation_hint}"),
        ],
        "Review Scope" => vec![
            "- Included assets: ".to_string(),
            "- Excluded assets: ".to_string(),
            "- Review rule: ".to_string(),
        ],
        _ => vec![
            "- Draft: ".to_string(),
            format!("- Citation guidance: {citation_hint}"),
        ],
    }
}

fn render_report_starter_citations(context_items: &[ReportStarterContextItem]) -> Result<String> {
    let citations = context_items
        .iter()
        .map(|item| {
            serde_json::json!({
                "kind": item.kind,
                "label": item.label,
                "id": item.id,
                "title": item.title,
                "excerpt": item.excerpt,
                "reason": item.reason,
                "sourceId": if item.kind == "source" { Some(item.id.as_str()) } else { None },
                "chunkIndex": if item.kind == "source" { Some(0_i64) } else { None },
                "url": serde_json::Value::Null,
            })
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&citations).map_err(Into::into)
}

pub fn build_reprocess_queue(
    conn: &Connection,
    input: ReprocessQueueInput,
) -> Result<ReprocessQueue> {
    let limit = input.limit.unwrap_or(50).clamp(1, 200) as usize;
    let kinds = normalize_reprocess_queue_kinds(input.kinds);
    let mut items = Vec::new();

    if kinds.contains("indexed_file") {
        collect_indexed_file_reprocess_items(conn, &mut items)?;
    }
    if kinds.contains("source") {
        collect_source_reprocess_items(conn, &mut items)?;
    }
    if kinds.contains("report") {
        collect_report_reprocess_items(conn, &mut items, limit)?;
    }

    items.sort_by(|left, right| {
        reprocess_severity_rank(&right.severity)
            .cmp(&reprocess_severity_rank(&left.severity))
            .then_with(|| left.target_kind.cmp(&right.target_kind))
            .then_with(|| left.title.cmp(&right.title))
    });

    let total_candidates = items.len();
    items.truncate(limit);
    let critical_count = items
        .iter()
        .filter(|item| item.severity == "critical")
        .count() as i64;
    let warning_count = items
        .iter()
        .filter(|item| item.severity == "warning")
        .count() as i64;
    let mut warnings = Vec::new();
    if total_candidates == 0 {
        warnings.push("No low-quality assets matched the reprocess queue criteria.".to_string());
    }
    if total_candidates > items.len() {
        warnings.push(format!(
            "Reprocess queue truncated from {total_candidates} candidate(s) to {limit} item(s)."
        ));
    }

    Ok(ReprocessQueue {
        generated_at: chrono::Utc::now().to_rfc3339(),
        item_count: items.len() as i64,
        critical_count,
        warning_count,
        items,
        warnings,
    })
}

fn normalize_reprocess_queue_kinds(kinds: Option<Vec<String>>) -> HashSet<String> {
    let allowed = ["indexed_file", "source", "report"];
    let mut normalized = kinds
        .unwrap_or_default()
        .into_iter()
        .filter_map(|kind| optional_trimmed(Some(&kind)))
        .map(|kind| kind.to_lowercase())
        .filter(|kind| allowed.contains(&kind.as_str()))
        .collect::<HashSet<_>>();
    if normalized.is_empty() {
        normalized.extend(allowed.iter().map(|kind| (*kind).to_string()));
    }
    normalized
}

fn collect_indexed_file_reprocess_items(
    conn: &Connection,
    items: &mut Vec<ReprocessQueueItem>,
) -> Result<()> {
    let mut stmt = conn.prepare(
        "SELECT id, folder_id, path, canonical_path, name, extension, size_bytes, modified_at, source_id, indexed_at,
                descriptor_kind, read_status, index_status, metadata_json, preview_text, text_hash, extracted_chars, total_chars, last_error
         FROM indexed_files
         WHERE read_status <> 'ok'
            OR index_status <> 'indexed'
            OR (last_error IS NOT NULL AND TRIM(last_error) <> '')
         ORDER BY indexed_at DESC",
    )?;
    let rows = stmt.query_map([], map_indexed_file_row)?;
    for row in rows {
        let file = row?;
        let (severity, issue_kind, suggested_action) = indexed_file_reprocess_classification(&file);
        let reason = indexed_file_reprocess_reason(&file);
        items.push(ReprocessQueueItem {
            target_kind: "indexed_file".to_string(),
            target_id: file.id,
            title: file.name,
            severity: severity.to_string(),
            issue_kind: issue_kind.to_string(),
            reason,
            suggested_action: suggested_action.to_string(),
            source_id: file.source_id,
            folder_id: Some(file.folder_id),
            metadata_json: serde_json::json!({
                "path": file.path,
                "canonicalPath": file.canonical_path,
                "descriptorKind": file.descriptor_kind,
                "readStatus": file.read_status,
                "indexStatus": file.index_status,
                "extractedChars": file.extracted_chars,
                "totalChars": file.total_chars,
                "lastError": file.last_error,
            })
            .to_string(),
        });
    }
    Ok(())
}

fn indexed_file_reprocess_classification(
    file: &IndexedFile,
) -> (&'static str, &'static str, &'static str) {
    if file.read_status == "missing" || file.index_status == "stale" {
        return ("critical", "missing_or_stale_file", "scan_indexed_folder");
    }
    if file.read_status != "ok" {
        return ("critical", "file_read_failed", "scan_indexed_folder");
    }
    if file.index_status == "partial" {
        return ("warning", "partial_index", "rescan_or_reimport_file");
    }
    if file.index_status == "metadata_only" {
        return ("warning", "metadata_only_file", "inspect_parser_support");
    }
    if optional_trimmed(file.last_error.as_deref()).is_some() {
        return ("warning", "indexed_file_warning", "inspect_last_error");
    }
    (
        "warning",
        "indexed_file_quality_unknown",
        "inspect_indexed_file",
    )
}

fn indexed_file_reprocess_reason(file: &IndexedFile) -> String {
    let mut parts = vec![
        format!("read_status={}", file.read_status),
        format!("index_status={}", file.index_status),
        format!("descriptor_kind={}", file.descriptor_kind),
    ];
    if let Some(error) = optional_trimmed(file.last_error.as_deref()) {
        parts.push(format!("last_error={}", compact_preview(&error, 160)));
    }
    if let (Some(extracted), Some(total)) = (file.extracted_chars, file.total_chars) {
        parts.push(format!("coverage={extracted}/{total} chars"));
    }
    parts.join("; ")
}

fn collect_source_reprocess_items(
    conn: &Connection,
    items: &mut Vec<ReprocessQueueItem>,
) -> Result<()> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.kind, s.title, s.canonical_uri, s.metadata_json, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM source_chunks c WHERE c.source_id = s.id) AS chunk_count,
                (SELECT COUNT(*) FROM point_source_links l WHERE l.source_id = s.id) AS point_count,
                (SELECT COUNT(*)
                 FROM point_source_links l
                 JOIN points p ON p.id = l.point_id
                 WHERE l.source_id = s.id AND p.starred = 1) AS star_count
         FROM source_documents s
         WHERE (SELECT COUNT(*) FROM source_chunks c WHERE c.source_id = s.id) = 0
         ORDER BY s.updated_at DESC",
    )?;
    let rows = stmt.query_map([], map_source_summary_row)?;
    for row in rows {
        let source = row?;
        let title = first_non_empty([source.title.as_deref(), Some(source.canonical_uri.as_str())])
            .unwrap_or("Untitled Source")
            .to_string();
        items.push(ReprocessQueueItem {
            target_kind: "source".to_string(),
            target_id: source.id.clone(),
            title,
            severity: "warning".to_string(),
            issue_kind: "source_has_no_chunks".to_string(),
            reason: "Source document has no indexed chunks, so retrieval and citation lookup will be weak.".to_string(),
            suggested_action: "reimport_or_replace_source_chunks".to_string(),
            source_id: Some(source.id),
            folder_id: None,
            metadata_json: serde_json::json!({
                "sourceKind": source.kind,
                "canonicalUri": source.canonical_uri,
                "chunkCount": source.chunk_count,
                "pointCount": source.point_count,
                "starCount": source.star_count,
            })
            .to_string(),
        });
    }
    Ok(())
}

fn collect_report_reprocess_items(
    conn: &Connection,
    items: &mut Vec<ReprocessQueueItem>,
    limit: usize,
) -> Result<()> {
    for report in list_recent_reports(conn, limit.max(50))? {
        let Some(audit) = load_report_audit(conn, &report.id)? else {
            continue;
        };
        let has_audit_rows = !audit.claims.is_empty() || !audit.citations.is_empty();
        let coverage = audit.coverage;
        if has_audit_rows
            && coverage.warning_citations == 0
            && coverage.missing_citations == 0
            && coverage.unsupported_claims == 0
            && coverage.inferred_claims == 0
            && !coverage.warnings.iter().any(|warning| {
                warning.contains("No durable claim") || warning.contains("No persistent citations")
            })
        {
            continue;
        }

        let severity = if coverage.missing_citations > 0 || coverage.unsupported_claims > 0 {
            "critical"
        } else {
            "warning"
        };
        let issue_kind = if !has_audit_rows {
            "report_missing_audit_rows"
        } else if coverage.missing_citations > 0 {
            "report_missing_citations"
        } else if coverage.warning_citations > 0 {
            "report_warning_citations"
        } else if coverage.inferred_claims > 0 {
            "report_inferred_claims"
        } else {
            "report_audit_warning"
        };
        let reason = first_non_empty(
            coverage
                .warnings
                .iter()
                .map(|warning| Some(warning.as_str())),
        )
        .map(str::to_string)
        .unwrap_or_else(|| {
            format!(
                "claims cited={}/{}; citations located={}/{}; warnings={}; missing={}",
                coverage.cited_claims,
                coverage.total_claims,
                coverage.located_citations,
                coverage.total_citations,
                coverage.warning_citations,
                coverage.missing_citations
            )
        });

        items.push(ReprocessQueueItem {
            target_kind: "report".to_string(),
            target_id: report.id.clone(),
            title: report.title,
            severity: severity.to_string(),
            issue_kind: issue_kind.to_string(),
            reason,
            suggested_action: "refresh_report_audit_or_regenerate_report".to_string(),
            source_id: None,
            folder_id: None,
            metadata_json: serde_json::json!({
                "reportKind": report.kind,
                "createdAt": report.created_at,
                "totalClaims": coverage.total_claims,
                "citedClaims": coverage.cited_claims,
                "inferredClaims": coverage.inferred_claims,
                "unsupportedClaims": coverage.unsupported_claims,
                "totalCitations": coverage.total_citations,
                "locatedCitations": coverage.located_citations,
                "warningCitations": coverage.warning_citations,
                "missingCitations": coverage.missing_citations,
                "coverageRatio": coverage.coverage_ratio,
            })
            .to_string(),
        });
    }
    Ok(())
}

fn reprocess_severity_rank(severity: &str) -> i64 {
    match severity {
        "critical" => 2,
        "warning" => 1,
        _ => 0,
    }
}

#[derive(Clone)]
struct DuplicateAssetSeed {
    kind: String,
    id: String,
    title: String,
    excerpt: String,
    fingerprint: String,
    metadata_json: String,
}

pub fn detect_duplicate_assets(
    conn: &Connection,
    input: DuplicateAssetInput,
) -> Result<DuplicateAssetReport> {
    let limit = input.limit.unwrap_or(30).clamp(1, 100) as usize;
    let kinds = normalize_duplicate_asset_kinds(input.kinds);
    let mut seeds = Vec::new();
    if kinds.contains("source") {
        collect_duplicate_source_seeds(conn, &mut seeds)?;
    }
    if kinds.contains("point") {
        collect_duplicate_point_seeds(conn, &mut seeds)?;
    }
    if kinds.contains("report") {
        collect_duplicate_report_seeds(conn, &mut seeds)?;
    }

    let mut groups = duplicate_exact_groups(&seeds);
    groups.extend(duplicate_near_groups(&seeds, &groups));
    groups.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.duplicate_key.cmp(&right.duplicate_key))
    });
    let total_groups = groups.len();
    groups.truncate(limit);
    for (index, group) in groups.iter_mut().enumerate() {
        group.group_id = format!("dup-{:03}", index + 1);
    }

    let candidate_count = groups
        .iter()
        .map(|group| group.candidates.len() as i64)
        .sum::<i64>();
    let mut warnings = Vec::new();
    if groups.is_empty() {
        warnings.push("No duplicate or near-duplicate assets were detected.".to_string());
    }
    if total_groups > groups.len() {
        warnings.push(format!(
            "Duplicate detection truncated from {total_groups} group(s) to {limit} group(s)."
        ));
    }

    Ok(DuplicateAssetReport {
        generated_at: chrono::Utc::now().to_rfc3339(),
        group_count: groups.len() as i64,
        candidate_count,
        groups,
        warnings,
    })
}

fn normalize_duplicate_asset_kinds(kinds: Option<Vec<String>>) -> HashSet<String> {
    let allowed = ["source", "point", "report"];
    let mut normalized = kinds
        .unwrap_or_default()
        .into_iter()
        .filter_map(|kind| optional_trimmed(Some(&kind)))
        .map(|kind| kind.to_lowercase())
        .filter(|kind| allowed.contains(&kind.as_str()))
        .collect::<HashSet<_>>();
    if normalized.is_empty() {
        normalized.extend(allowed.iter().map(|kind| (*kind).to_string()));
    }
    normalized
}

fn collect_duplicate_source_seeds(
    conn: &Connection,
    seeds: &mut Vec<DuplicateAssetSeed>,
) -> Result<()> {
    for source in list_recent_sources(conn, 500)? {
        let title = first_non_empty([source.title.as_deref(), Some(source.canonical_uri.as_str())])
            .unwrap_or("Untitled Source")
            .to_string();
        let fingerprint = duplicate_asset_fingerprint(&title);
        if fingerprint.chars().count() < 4 {
            continue;
        }
        seeds.push(DuplicateAssetSeed {
            kind: "source".to_string(),
            id: source.id.clone(),
            title,
            excerpt: source.canonical_uri.clone(),
            fingerprint,
            metadata_json: serde_json::json!({
                "sourceKind": source.kind,
                "canonicalUri": source.canonical_uri,
                "chunkCount": source.chunk_count,
                "pointCount": source.point_count,
            })
            .to_string(),
        });
    }
    Ok(())
}

fn collect_duplicate_point_seeds(
    conn: &Connection,
    seeds: &mut Vec<DuplicateAssetSeed>,
) -> Result<()> {
    for point in list_points(conn)? {
        let fingerprint = duplicate_asset_fingerprint(&point.content);
        if fingerprint.chars().count() < 8 {
            continue;
        }
        seeds.push(DuplicateAssetSeed {
            kind: "point".to_string(),
            id: point.id,
            title: compact_preview(&point.content, 80),
            excerpt: compact_preview(&point.content, 260),
            fingerprint,
            metadata_json: serde_json::json!({
                "tagType": point.tag_type,
                "parentId": point.parent_id,
                "sourceDocName": point.source_doc_name,
                "starred": point.starred,
            })
            .to_string(),
        });
    }
    Ok(())
}

fn collect_duplicate_report_seeds(
    conn: &Connection,
    seeds: &mut Vec<DuplicateAssetSeed>,
) -> Result<()> {
    for report in list_recent_reports(conn, 500)? {
        let fingerprint = duplicate_asset_fingerprint(&report.title);
        if fingerprint.chars().count() < 4 {
            continue;
        }
        seeds.push(DuplicateAssetSeed {
            kind: "report".to_string(),
            id: report.id,
            title: report.title.clone(),
            excerpt: compact_preview(&report.summary, 260),
            fingerprint,
            metadata_json: serde_json::json!({
                "reportKind": report.kind,
                "sourceName": report.source_name,
                "createdAt": report.created_at,
            })
            .to_string(),
        });
    }
    Ok(())
}

fn duplicate_exact_groups(seeds: &[DuplicateAssetSeed]) -> Vec<DuplicateAssetGroup> {
    let mut groups = Vec::new();
    let mut fingerprints = Vec::<(String, String)>::new();
    for seed in seeds {
        let key = (seed.kind.clone(), seed.fingerprint.clone());
        if !fingerprints.iter().any(|value| value == &key) {
            fingerprints.push(key);
        }
    }
    for (kind, fingerprint) in fingerprints {
        let candidates = seeds
            .iter()
            .filter(|seed| seed.kind == kind && seed.fingerprint == fingerprint)
            .cloned()
            .collect::<Vec<_>>();
        if candidates.len() < 2 {
            continue;
        }
        groups.push(DuplicateAssetGroup {
            group_id: String::new(),
            duplicate_key: fingerprint.clone(),
            match_kind: "exact_fingerprint".to_string(),
            score: 1.0,
            reason: "Normalized title/content fingerprint is identical within the same asset kind."
                .to_string(),
            candidates: candidates
                .into_iter()
                .map(duplicate_candidate_from_seed)
                .collect(),
        });
    }
    groups
}

fn duplicate_near_groups(
    seeds: &[DuplicateAssetSeed],
    exact_groups: &[DuplicateAssetGroup],
) -> Vec<DuplicateAssetGroup> {
    let exact_pairs = exact_groups
        .iter()
        .flat_map(|group| duplicate_group_pairs(&group.candidates))
        .collect::<HashSet<_>>();
    let mut groups = Vec::new();
    let mut seen_pairs = HashSet::new();
    for (left_index, left) in seeds.iter().enumerate() {
        for right in seeds.iter().skip(left_index + 1) {
            if left.kind != right.kind {
                continue;
            }
            let pair_key = duplicate_pair_key(&left.kind, &left.id, &right.id);
            if exact_pairs.contains(&pair_key) || !seen_pairs.insert(pair_key) {
                continue;
            }
            let score = duplicate_fingerprint_similarity(&left.fingerprint, &right.fingerprint);
            if score < 0.82 {
                continue;
            }
            groups.push(DuplicateAssetGroup {
                group_id: String::new(),
                duplicate_key: format!("{}~{}", left.fingerprint, right.fingerprint),
                match_kind: "near_fingerprint".to_string(),
                score,
                reason: format!(
                    "Normalized fingerprints are {:.0}% similar within the same asset kind.",
                    score * 100.0
                ),
                candidates: vec![
                    duplicate_candidate_from_seed(left.clone()),
                    duplicate_candidate_from_seed(right.clone()),
                ],
            });
        }
    }
    groups
}

fn duplicate_group_pairs(candidates: &[DuplicateAssetCandidate]) -> Vec<String> {
    let mut pairs = Vec::new();
    for (left_index, left) in candidates.iter().enumerate() {
        for right in candidates.iter().skip(left_index + 1) {
            pairs.push(duplicate_pair_key(&left.kind, &left.id, &right.id));
        }
    }
    pairs
}

fn duplicate_pair_key(kind: &str, left_id: &str, right_id: &str) -> String {
    if left_id <= right_id {
        format!("{kind}:{left_id}:{right_id}")
    } else {
        format!("{kind}:{right_id}:{left_id}")
    }
}

fn duplicate_candidate_from_seed(seed: DuplicateAssetSeed) -> DuplicateAssetCandidate {
    DuplicateAssetCandidate {
        kind: seed.kind,
        id: seed.id,
        title: seed.title,
        excerpt: seed.excerpt,
        fingerprint: seed.fingerprint,
        metadata_json: seed.metadata_json,
    }
}

fn duplicate_asset_fingerprint(value: &str) -> String {
    let mut normalized = String::new();
    let mut last_was_space = true;
    for ch in value.chars().flat_map(char::to_lowercase) {
        if ch.is_alphanumeric() {
            normalized.push(ch);
            last_was_space = false;
        } else if !last_was_space {
            normalized.push(' ');
            last_was_space = true;
        }
    }
    normalized.trim().to_string()
}

fn duplicate_fingerprint_similarity(left: &str, right: &str) -> f64 {
    if left == right {
        return 1.0;
    }
    let left_tokens = left.split_whitespace().collect::<HashSet<_>>();
    let right_tokens = right.split_whitespace().collect::<HashSet<_>>();
    if left_tokens.is_empty() || right_tokens.is_empty() {
        return 0.0;
    }
    let intersection = left_tokens.intersection(&right_tokens).count() as f64;
    let union = left_tokens.union(&right_tokens).count() as f64;
    let jaccard = if union == 0.0 {
        0.0
    } else {
        intersection / union
    };
    let prefix_bonus = if left.starts_with(right) || right.starts_with(left) {
        0.08
    } else {
        0.0
    };
    (jaccard + prefix_bonus).min(0.99)
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct GraphAssetKey {
    kind: String,
    id: String,
}

impl GraphAssetKey {
    fn new(kind: impl Into<String>, id: impl Into<String>) -> Self {
        Self {
            kind: kind.into(),
            id: id.into(),
        }
    }
}

struct GraphAssetSummary {
    title: String,
    label: String,
    metadata_json: String,
}

pub fn build_graph_neighborhood_preview(
    conn: &Connection,
    input: GraphNeighborhoodInput,
) -> Result<GraphNeighborhoodPreview> {
    let root_kind = required_trimmed("graph target kind", &input.kind)?.to_string();
    let root_id = required_trimmed("graph target id", &input.id)?.to_string();
    validate_asset_kind(&root_kind)?;
    let depth = input.depth.unwrap_or(2).clamp(1, 2);
    let limit = input.limit.unwrap_or(80).clamp(1, 150) as usize;
    let include_suggestions = input.include_suggestions.unwrap_or(true);
    let root = GraphAssetKey::new(root_kind.clone(), root_id.clone());
    let mut distances = HashMap::new();
    let mut warnings = Vec::new();
    distances.insert(root.clone(), 0);

    let mut queue = VecDeque::from([root.clone()]);
    while let Some(current) = queue.pop_front() {
        let current_depth = distances.get(&current).copied().unwrap_or(0);
        if current_depth >= depth {
            continue;
        }
        for relation in discover_related_assets(conn, &current.kind, &current.id)? {
            let Some(next) = graph_relation_neighbor(&relation, &current) else {
                continue;
            };
            if distances.contains_key(&next) {
                continue;
            }
            if distances.len() >= limit {
                warnings.push(format!(
                    "Graph neighborhood node limit reached at {limit}; additional relation neighbors were omitted."
                ));
                continue;
            }
            distances.insert(next.clone(), current_depth + 1);
            queue.push_back(next);
        }
    }

    let mut edges = Vec::new();
    let mut seen_edges = HashSet::new();
    add_graph_relation_edges(conn, &distances, &mut edges, &mut seen_edges)?;

    if include_suggestions {
        add_graph_backlink_suggestion_edges(
            conn,
            &root,
            limit,
            &mut distances,
            &mut edges,
            &mut seen_edges,
            &mut warnings,
        )?;
        add_graph_duplicate_suggestion_edges(
            conn,
            &root,
            limit,
            &mut distances,
            &mut edges,
            &mut seen_edges,
            &mut warnings,
        )?;
    }

    let mut nodes = Vec::new();
    for (key, node_depth) in &distances {
        let Some(summary) = graph_asset_summary(conn, key)? else {
            warnings.push(format!(
                "Graph node {}:{} no longer resolves to an existing asset.",
                key.kind, key.id
            ));
            nodes.push(GraphNeighborhoodNode {
                kind: key.kind.clone(),
                id: key.id.clone(),
                title: format!("Missing {} {}", key.kind, key.id),
                label: format!("missing:{}", key.kind),
                depth: *node_depth,
                root: key == &root,
                asset_exists: false,
                metadata_json: "{}".to_string(),
            });
            continue;
        };
        nodes.push(GraphNeighborhoodNode {
            kind: key.kind.clone(),
            id: key.id.clone(),
            title: summary.title,
            label: summary.label,
            depth: *node_depth,
            root: key == &root,
            asset_exists: true,
            metadata_json: summary.metadata_json,
        });
    }

    nodes.sort_by(|left, right| {
        left.depth
            .cmp(&right.depth)
            .then_with(|| right.root.cmp(&left.root))
            .then_with(|| left.kind.cmp(&right.kind))
            .then_with(|| left.title.cmp(&right.title))
    });
    edges.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.edge_kind.cmp(&right.edge_kind))
            .then_with(|| left.from_kind.cmp(&right.from_kind))
            .then_with(|| left.from_id.cmp(&right.from_id))
            .then_with(|| left.to_kind.cmp(&right.to_kind))
            .then_with(|| left.to_id.cmp(&right.to_id))
    });

    Ok(GraphNeighborhoodPreview {
        generated_at: chrono::Utc::now().to_rfc3339(),
        root_kind,
        root_id,
        depth,
        node_count: nodes.len() as i64,
        edge_count: edges.len() as i64,
        nodes,
        edges,
        warnings,
    })
}

fn add_graph_relation_edges(
    conn: &Connection,
    distances: &HashMap<GraphAssetKey, i64>,
    edges: &mut Vec<GraphNeighborhoodEdge>,
    seen_edges: &mut HashSet<String>,
) -> Result<()> {
    let included = distances.keys().cloned().collect::<HashSet<_>>();
    for key in distances.keys() {
        for relation in discover_related_assets(conn, &key.kind, &key.id)? {
            let from = GraphAssetKey::new(relation.from_kind.clone(), relation.from_id.clone());
            let to = GraphAssetKey::new(relation.to_kind.clone(), relation.to_id.clone());
            if included.contains(&from) && included.contains(&to) {
                add_graph_edge(edges, seen_edges, graph_edge_from_relation(relation));
            }
        }
    }
    Ok(())
}

fn graph_relation_neighbor(
    relation: &AssetRelationRecord,
    current: &GraphAssetKey,
) -> Option<GraphAssetKey> {
    if relation.from_kind == current.kind && relation.from_id == current.id {
        Some(GraphAssetKey::new(
            relation.to_kind.clone(),
            relation.to_id.clone(),
        ))
    } else if relation.to_kind == current.kind && relation.to_id == current.id {
        Some(GraphAssetKey::new(
            relation.from_kind.clone(),
            relation.from_id.clone(),
        ))
    } else {
        None
    }
}

fn graph_edge_from_relation(relation: AssetRelationRecord) -> GraphNeighborhoodEdge {
    GraphNeighborhoodEdge {
        from_kind: relation.from_kind,
        from_id: relation.from_id,
        to_kind: relation.to_kind,
        to_id: relation.to_id,
        relation: relation.relation,
        reason: relation.reason,
        score: relation.score,
        edge_kind: "relation".to_string(),
        provenance: relation.source_kind,
        existing_relation: true,
    }
}

fn add_graph_backlink_suggestion_edges(
    conn: &Connection,
    root: &GraphAssetKey,
    limit: usize,
    distances: &mut HashMap<GraphAssetKey, i64>,
    edges: &mut Vec<GraphNeighborhoodEdge>,
    seen_edges: &mut HashSet<String>,
    warnings: &mut Vec<String>,
) -> Result<()> {
    let suggestions = suggest_backlinks(
        conn,
        BacklinkSuggestionInput {
            kind: root.kind.clone(),
            id: root.id.clone(),
            limit: Some(8),
        },
    )?;
    for suggestion in suggestions {
        let candidate = GraphAssetKey::new(suggestion.candidate_kind, suggestion.candidate_id);
        if !distances.contains_key(&candidate) {
            if distances.len() >= limit {
                warnings.push(
                    "Graph neighborhood node limit reached; backlink suggestions were omitted."
                        .to_string(),
                );
                continue;
            }
            distances.insert(candidate.clone(), 1);
        }
        add_graph_edge(
            edges,
            seen_edges,
            GraphNeighborhoodEdge {
                from_kind: candidate.kind,
                from_id: candidate.id,
                to_kind: root.kind.clone(),
                to_id: root.id.clone(),
                relation: suggestion.relation,
                reason: suggestion.reason,
                score: suggestion.score,
                edge_kind: "suggested_backlink".to_string(),
                provenance: "unlinked_mention".to_string(),
                existing_relation: false,
            },
        );
    }
    Ok(())
}

fn add_graph_duplicate_suggestion_edges(
    conn: &Connection,
    root: &GraphAssetKey,
    limit: usize,
    distances: &mut HashMap<GraphAssetKey, i64>,
    edges: &mut Vec<GraphNeighborhoodEdge>,
    seen_edges: &mut HashSet<String>,
    warnings: &mut Vec<String>,
) -> Result<()> {
    if !matches!(root.kind.as_str(), "source" | "point" | "report") {
        return Ok(());
    }
    let duplicate_report = detect_duplicate_assets(
        conn,
        DuplicateAssetInput {
            kinds: Some(vec![root.kind.clone()]),
            limit: Some(100),
        },
    )?;
    for group in duplicate_report.groups {
        let contains_root = group
            .candidates
            .iter()
            .any(|candidate| candidate.kind == root.kind && candidate.id == root.id);
        if !contains_root {
            continue;
        }
        for candidate in group.candidates {
            if candidate.kind == root.kind && candidate.id == root.id {
                continue;
            }
            let candidate_key = GraphAssetKey::new(candidate.kind, candidate.id);
            if !distances.contains_key(&candidate_key) {
                if distances.len() >= limit {
                    warnings.push("Graph neighborhood node limit reached; duplicate suggestions were omitted.".to_string());
                    continue;
                }
                distances.insert(candidate_key.clone(), 1);
            }
            add_graph_edge(
                edges,
                seen_edges,
                GraphNeighborhoodEdge {
                    from_kind: root.kind.clone(),
                    from_id: root.id.clone(),
                    to_kind: candidate_key.kind,
                    to_id: candidate_key.id,
                    relation: "same_topic".to_string(),
                    reason: format!(
                        "Duplicate detection found a {} match: {}",
                        group.match_kind, group.reason
                    ),
                    score: group.score,
                    edge_kind: "suggested_duplicate".to_string(),
                    provenance: group.match_kind.clone(),
                    existing_relation: false,
                },
            );
        }
    }
    Ok(())
}

fn add_graph_edge(
    edges: &mut Vec<GraphNeighborhoodEdge>,
    seen_edges: &mut HashSet<String>,
    edge: GraphNeighborhoodEdge,
) {
    let key = graph_edge_dedupe_key(&edge);
    if seen_edges.insert(key) {
        edges.push(edge);
    }
}

fn graph_edge_dedupe_key(edge: &GraphNeighborhoodEdge) -> String {
    let left = format!("{}:{}", edge.from_kind, edge.from_id);
    let right = format!("{}:{}", edge.to_kind, edge.to_id);
    if edge.edge_kind == "relation" && edge.provenance == "auto" {
        let (a, b) = if left <= right {
            (left, right)
        } else {
            (right, left)
        };
        format!(
            "{}|{}|{}|{}|{}",
            edge.edge_kind, edge.provenance, edge.relation, a, b
        )
    } else {
        format!(
            "{}|{}|{}|{}|{}",
            edge.edge_kind, edge.provenance, edge.relation, left, right
        )
    }
}

fn graph_asset_summary(
    conn: &Connection,
    key: &GraphAssetKey,
) -> Result<Option<GraphAssetSummary>> {
    match key.kind.as_str() {
        "source" => {
            let Some(source) = source_summary_by_id(conn, &key.id)? else {
                return Ok(None);
            };
            let title = source
                .title
                .clone()
                .unwrap_or_else(|| source.canonical_uri.clone());
            Ok(Some(GraphAssetSummary {
                title: title.clone(),
                label: format!("Source: {title}"),
                metadata_json: serde_json::json!({
                    "sourceKind": &source.kind,
                    "canonicalUri": &source.canonical_uri,
                    "chunkCount": source.chunk_count,
                    "pointCount": source.point_count,
                    "starCount": source.star_count,
                    "metadataJson": &source.metadata_json
                })
                .to_string(),
            }))
        }
        "point" => {
            let Some(point) = get_point(conn, &key.id)? else {
                return Ok(None);
            };
            let title = compact_preview(&point.content, 100);
            Ok(Some(GraphAssetSummary {
                title: title.clone(),
                label: format!("Point: {title}"),
                metadata_json: serde_json::json!({
                    "tagType": &point.tag_type,
                    "parentId": &point.parent_id,
                    "sourceDocName": &point.source_doc_name,
                    "archived": point.archived,
                    "starred": point.starred
                })
                .to_string(),
            }))
        }
        "evidence" => {
            let Some(evidence) = get_evidence(conn, &key.id)? else {
                return Ok(None);
            };
            let title = compact_preview(&evidence.claim, 100);
            Ok(Some(GraphAssetSummary {
                title: title.clone(),
                label: format!("Evidence: {title}"),
                metadata_json: serde_json::json!({
                    "verdict": &evidence.verdict,
                    "sourceId": &evidence.source_id,
                    "pointId": &evidence.point_id,
                    "chunkIndex": evidence.chunk_index,
                    "sourceCount": evidence.sources.len()
                })
                .to_string(),
            }))
        }
        "report" => {
            let Some(report) = get_report(conn, &key.id)? else {
                return Ok(None);
            };
            Ok(Some(GraphAssetSummary {
                title: report.title.clone(),
                label: format!("Report: {}", report.title),
                metadata_json: serde_json::json!({
                    "reportKind": &report.kind,
                    "sourceName": &report.source_name,
                    "summary": compact_preview(&report.summary, 180)
                })
                .to_string(),
            }))
        }
        "journal" => {
            let Some(entry) = get_journal_entry(conn, &key.id)? else {
                return Ok(None);
            };
            let title = if entry.query.trim().is_empty() {
                compact_preview(&entry.note, 100)
            } else {
                entry.query.clone()
            };
            Ok(Some(GraphAssetSummary {
                title: title.clone(),
                label: format!("Journal: {title}"),
                metadata_json: serde_json::json!({
                    "sourceKind": &entry.source_kind,
                    "tagsJson": &entry.tags_json,
                    "invalidatedAt": &entry.invalidated_at
                })
                .to_string(),
            }))
        }
        "gallery" => {
            let Some(item) = get_gallery_item(conn, &key.id)? else {
                return Ok(None);
            };
            let title = compact_preview(&item.prompt, 100);
            Ok(Some(GraphAssetSummary {
                title: title.clone(),
                label: format!("Gallery: {title}"),
                metadata_json: serde_json::json!({
                    "filePath": &item.file_path,
                    "thumbnailPath": &item.thumbnail_path,
                    "downloadStatus": &item.download_status,
                    "pointIds": &item.point_ids
                })
                .to_string(),
            }))
        }
        "review" => {
            let Some(item) = get_review_item(conn, &key.id)? else {
                return Ok(None);
            };
            Ok(Some(GraphAssetSummary {
                title: item.title.clone(),
                label: format!("Review: {}", item.title),
                metadata_json: serde_json::json!({
                    "targetKind": &item.target_kind,
                    "targetId": &item.target_id,
                    "status": &item.status,
                    "priority": &item.priority,
                    "dueAt": &item.due_at
                })
                .to_string(),
            }))
        }
        _ => Ok(None),
    }
}

pub fn save_asset_relation(
    conn: &Connection,
    input: SaveAssetRelationInput,
) -> Result<AssetRelationRecord> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let from_kind = required_trimmed("relation from kind", &input.from_kind)?.to_string();
    let from_id = required_trimmed("relation from id", &input.from_id)?.to_string();
    let to_kind = required_trimmed("relation to kind", &input.to_kind)?.to_string();
    let to_id = required_trimmed("relation to id", &input.to_id)?.to_string();
    validate_asset_kind(&from_kind)?;
    validate_asset_kind(&to_kind)?;
    validate_asset_relation(&input.relation)?;
    let relation = input.relation.trim().to_string();
    let reason = required_trimmed("relation reason", &input.reason)?.to_string();
    let source_kind = required_trimmed("relation source kind", &input.source_kind)?.to_string();
    let score = input.score.clamp(0.0, 1.0);

    conn.execute(
        "INSERT OR REPLACE INTO asset_relations
            (id, from_kind, from_id, to_kind, to_id, relation, reason, score, source_kind, created_at, vetted_at)
         VALUES (
            COALESCE((SELECT id FROM asset_relations
                      WHERE from_kind = ?1 AND from_id = ?2 AND to_kind = ?3 AND to_id = ?4
                        AND relation = ?5 AND source_kind = ?8), ?9),
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?10,
            (SELECT vetted_at FROM asset_relations
             WHERE from_kind = ?1 AND from_id = ?2 AND to_kind = ?3 AND to_id = ?4
               AND relation = ?5 AND source_kind = ?8)
         )",
        params![from_kind, from_id, to_kind, to_id, relation, reason, score, source_kind, id, now],
    )?;

    get_asset_relation(
        conn,
        &from_kind,
        &from_id,
        &to_kind,
        &to_id,
        &relation,
        &source_kind,
    )?
    .ok_or_else(|| anyhow::anyhow!("saved asset relation not found"))
}

fn get_asset_relation(
    conn: &Connection,
    from_kind: &str,
    from_id: &str,
    to_kind: &str,
    to_id: &str,
    relation: &str,
    source_kind: &str,
) -> Result<Option<AssetRelationRecord>> {
    let mut stmt = conn.prepare(
        "SELECT id, from_kind, from_id, to_kind, to_id, relation, reason, score, source_kind, created_at, vetted_at
         FROM asset_relations
         WHERE from_kind = ?1 AND from_id = ?2 AND to_kind = ?3 AND to_id = ?4
           AND relation = ?5 AND source_kind = ?6",
    )?;
    let mut rows = stmt.query(params![
        from_kind,
        from_id,
        to_kind,
        to_id,
        relation,
        source_kind
    ])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    Ok(Some(map_asset_relation_row(row)?))
}

pub fn discover_related_assets(
    conn: &Connection,
    kind: &str,
    id: &str,
) -> Result<Vec<AssetRelationRecord>> {
    let kind = kind.trim();
    let id = id.trim();
    if kind.is_empty() || id.is_empty() {
        return Ok(Vec::new());
    }
    validate_asset_kind(kind)?;
    let mut stmt = conn.prepare(
        "SELECT id, from_kind, from_id, to_kind, to_id, relation, reason, score, source_kind, created_at, vetted_at
         FROM asset_relations
         WHERE (from_kind = ?1 AND from_id = ?2)
            OR (to_kind = ?1 AND to_id = ?2)
         ORDER BY score DESC, created_at DESC
         LIMIT 80",
    )?;
    let rows = stmt.query_map(params![kind, id], map_asset_relation_row)?;
    let mut relations = Vec::new();
    for row in rows {
        relations.push(row?);
    }
    Ok(relations)
}

pub fn rebuild_asset_relations(conn: &Connection) -> Result<usize> {
    conn.execute("DELETE FROM asset_relations WHERE source_kind = 'auto'", [])?;
    let mut count = 0;
    count += rebuild_report_cocitations(conn)?;
    count += rebuild_evidence_relations(conn)?;
    count += rebuild_journal_relations(conn)?;
    count += rebuild_gallery_relations(conn)?;
    count += rebuild_review_relations(conn)?;
    Ok(count)
}

pub fn add_review_item(conn: &Connection, input: AddReviewItemInput) -> Result<ReviewItem> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let target_kind = required_trimmed("review target kind", &input.target_kind)?.to_string();
    validate_review_asset_kind(&target_kind)?;
    let target_id = required_trimmed("review target id", &input.target_id)?.to_string();
    let title = required_trimmed("review title", &input.title)?.to_string();
    let note = optional_trimmed(input.note.as_deref());
    let priority =
        optional_trimmed(input.priority.as_deref()).unwrap_or_else(|| "normal".to_string());
    validate_review_priority(&priority)?;
    let due_at = optional_trimmed(input.due_at.as_deref()).unwrap_or_else(|| now.clone());

    conn.execute(
        "INSERT INTO review_items
            (id, target_kind, target_id, title, note, status, priority, due_at,
             last_reviewed_at, review_count, ease, interval_days, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?7, NULL, 0, NULL, NULL, ?8, ?8)",
        params![
            id,
            target_kind,
            target_id,
            title,
            note,
            priority,
            due_at,
            now
        ],
    )?;
    get_review_item(conn, &id)?.ok_or_else(|| anyhow::anyhow!("saved review item not found: {id}"))
}

pub fn get_review_item(conn: &Connection, id: &str) -> Result<Option<ReviewItem>> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let mut stmt = conn.prepare(
        "SELECT id, target_kind, target_id, title, note, status, priority, due_at, last_reviewed_at,
                review_count, ease, interval_days, created_at, updated_at
         FROM review_items
         WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![trimmed])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    Ok(Some(map_review_item_row(row)?))
}

pub fn list_due_review_items(conn: &Connection) -> Result<Vec<ReviewItem>> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut stmt = conn.prepare(
        "SELECT id, target_kind, target_id, title, note, status, priority, due_at, last_reviewed_at,
                review_count, ease, interval_days, created_at, updated_at
         FROM review_items
         WHERE status = 'active' AND due_at <= ?1
         ORDER BY due_at ASC,
                  CASE priority WHEN 'high' THEN 3 WHEN 'normal' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC,
                  created_at ASC",
    )?;
    let rows = stmt.query_map(params![now], map_review_item_row)?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

pub fn list_all_review_items(conn: &Connection) -> Result<Vec<ReviewItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, target_kind, target_id, title, note, status, priority, due_at, last_reviewed_at,
                review_count, ease, interval_days, created_at, updated_at
         FROM review_items
         ORDER BY status ASC, due_at ASC, updated_at DESC",
    )?;
    let rows = stmt.query_map([], map_review_item_row)?;
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

pub fn build_review_queue_plan(
    conn: &Connection,
    input: ReviewQueuePlanInput,
) -> Result<ReviewQueuePlan> {
    let items = list_all_review_items(conn)?;
    Ok(build_review_queue_plan_from_items(
        items,
        input,
        chrono::Utc::now(),
    ))
}

pub fn complete_review_item(conn: &Connection, id: &str, rating: &str) -> Result<ReviewItem> {
    let interval_days = review_interval_days(rating)?;
    let trimmed = required_trimmed("review item id", id)?;
    let now = chrono::Utc::now();
    let due_at = (now + chrono::Duration::days(interval_days)).to_rfc3339();
    let reviewed_at = now.to_rfc3339();
    let ease_delta = match rating {
        "again" => -0.2,
        "hard" => -0.05,
        "good" => 0.0,
        "easy" => 0.15,
        _ => 0.0,
    };
    conn.execute(
        "UPDATE review_items
         SET status = 'active',
             due_at = ?1,
             last_reviewed_at = ?2,
             review_count = review_count + 1,
             interval_days = ?3,
             ease = MAX(1.3, COALESCE(ease, 2.5) + ?4),
             updated_at = ?2
         WHERE id = ?5",
        params![due_at, reviewed_at, interval_days, ease_delta, trimmed],
    )?;
    get_review_item(conn, trimmed)?
        .ok_or_else(|| anyhow::anyhow!("review item not found: {trimmed}"))
}

pub fn snooze_review_item(conn: &Connection, id: &str, days: i64) -> Result<ReviewItem> {
    let trimmed = required_trimmed("review item id", id)?;
    if days < 1 {
        anyhow::bail!("snooze days must be positive");
    }
    let now = chrono::Utc::now();
    let due_at = (now + chrono::Duration::days(days)).to_rfc3339();
    let updated_at = now.to_rfc3339();
    conn.execute(
        "UPDATE review_items SET due_at = ?1, updated_at = ?2 WHERE id = ?3",
        params![due_at, updated_at, trimmed],
    )?;
    get_review_item(conn, trimmed)?
        .ok_or_else(|| anyhow::anyhow!("review item not found: {trimmed}"))
}

pub fn dismiss_review_item(conn: &Connection, id: &str) -> Result<()> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE review_items SET status = 'dismissed', updated_at = ?1 WHERE id = ?2",
        params![now, trimmed],
    )?;
    Ok(())
}

pub fn get_open_data_mirror_config(conn: &Connection) -> Result<OpenDataMirrorConfig> {
    let mut stmt = conn.prepare(
        "SELECT enabled, root_path, export_sources, export_evidence, export_reports, export_journal, export_gallery_index
         FROM open_data_mirror_config
         WHERE id = 1",
    )?;
    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        return Ok(OpenDataMirrorConfig {
            enabled: row.get::<_, i64>(0)? != 0,
            root_path: row.get(1)?,
            export_sources: row.get::<_, i64>(2)? != 0,
            export_evidence: row.get::<_, i64>(3)? != 0,
            export_reports: row.get::<_, i64>(4)? != 0,
            export_journal: row.get::<_, i64>(5)? != 0,
            export_gallery_index: row.get::<_, i64>(6)? != 0,
        });
    }
    Ok(default_open_data_mirror_config())
}

pub fn set_open_data_mirror_config(conn: &Connection, config: OpenDataMirrorConfig) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    let root_path = optional_trimmed(config.root_path.as_deref());
    conn.execute(
        "INSERT OR REPLACE INTO open_data_mirror_config
            (id, enabled, root_path, export_sources, export_evidence, export_reports, export_journal, export_gallery_index, updated_at)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            config.enabled as i64,
            root_path,
            config.export_sources as i64,
            config.export_evidence as i64,
            config.export_reports as i64,
            config.export_journal as i64,
            config.export_gallery_index as i64,
            now
        ],
    )?;
    Ok(())
}

pub fn add_indexed_folder(conn: &Connection, path: &str) -> Result<IndexedFolder> {
    let path = required_trimmed("indexed folder path", path)?.to_string();
    let name = Path::new(&path)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(path.as_str())
        .to_string();
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR IGNORE INTO indexed_folders (id, path, name, enabled, last_scanned_at, created_at)
         VALUES (?1, ?2, ?3, 1, NULL, ?4)",
        params![id, path, name, now],
    )?;
    get_indexed_folder_by_path(conn, &path)?
        .ok_or_else(|| anyhow::anyhow!("indexed folder not found after insert"))
}

pub fn list_indexed_folders(conn: &Connection) -> Result<Vec<IndexedFolder>> {
    let mut stmt = conn.prepare(
        "SELECT id, path, name, enabled, last_scanned_at, created_at
         FROM indexed_folders
         ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], map_indexed_folder_row)?;
    let mut folders = Vec::new();
    for row in rows {
        folders.push(row?);
    }
    Ok(folders)
}

pub fn get_indexed_folder(conn: &Connection, id: &str) -> Result<Option<IndexedFolder>> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let mut stmt = conn.prepare(
        "SELECT id, path, name, enabled, last_scanned_at, created_at
         FROM indexed_folders
         WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![trimmed])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    Ok(Some(map_indexed_folder_row(row)?))
}

fn get_indexed_folder_by_path(conn: &Connection, path: &str) -> Result<Option<IndexedFolder>> {
    let mut stmt = conn.prepare(
        "SELECT id, path, name, enabled, last_scanned_at, created_at
         FROM indexed_folders
         WHERE path = ?1",
    )?;
    let mut rows = stmt.query(params![path])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    Ok(Some(map_indexed_folder_row(row)?))
}

pub fn upsert_indexed_file(
    conn: &Connection,
    input: UpsertIndexedFileInput,
) -> Result<IndexedFile> {
    let folder_id = required_trimmed("indexed file folder id", &input.folder_id)?.to_string();
    let path = required_trimmed("indexed file path", &input.path)?.to_string();
    let name = required_trimmed("indexed file name", &input.name)?.to_string();
    let descriptor_kind =
        required_trimmed("indexed file descriptor kind", &input.descriptor_kind)?.to_string();
    let read_status = required_trimmed("indexed file read status", &input.read_status)?.to_string();
    let index_status =
        required_trimmed("indexed file index status", &input.index_status)?.to_string();
    let metadata_json = input.metadata_json.trim();
    if metadata_json.is_empty() {
        anyhow::bail!("indexed file metadata json is required");
    }
    serde_json::from_str::<serde_json::Value>(metadata_json)
        .context("indexed file metadata json must be valid JSON")?;
    let metadata_json = metadata_json.to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let existing_id: Option<String> = conn
        .query_row(
            "SELECT id FROM indexed_files WHERE path = ?1",
            params![path],
            |row| row.get(0),
        )
        .optional()?;
    let id = existing_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    conn.execute(
        "INSERT OR REPLACE INTO indexed_files
            (id, folder_id, path, canonical_path, name, extension, size_bytes, modified_at, source_id, indexed_at,
             descriptor_kind, read_status, index_status, metadata_json, preview_text, text_hash, extracted_chars, total_chars, last_error)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)",
        params![
            id,
            folder_id,
            path,
            optional_trimmed(input.canonical_path.as_deref()),
            name,
            optional_trimmed(input.extension.as_deref()),
            input.size_bytes,
            optional_trimmed(input.modified_at.as_deref()),
            optional_trimmed(input.source_id.as_deref()),
            now,
            descriptor_kind,
            read_status,
            index_status,
            metadata_json,
            input.preview_text,
            optional_trimmed(input.text_hash.as_deref()),
            input.extracted_chars,
            input.total_chars,
            optional_trimmed(input.last_error.as_deref()),
        ],
    )?;
    get_indexed_file(conn, &id)?
        .ok_or_else(|| anyhow::anyhow!("indexed file not found after upsert: {id}"))
}

pub fn get_indexed_file(conn: &Connection, id: &str) -> Result<Option<IndexedFile>> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let mut stmt = conn.prepare(
        "SELECT id, folder_id, path, canonical_path, name, extension, size_bytes, modified_at, source_id, indexed_at,
                descriptor_kind, read_status, index_status, metadata_json, preview_text, text_hash, extracted_chars, total_chars, last_error
         FROM indexed_files
         WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![trimmed])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    Ok(Some(map_indexed_file_row(row)?))
}

#[allow(dead_code)]
pub fn list_indexed_files_for_folder(
    conn: &Connection,
    folder_id: &str,
) -> Result<Vec<IndexedFile>> {
    let trimmed = folder_id.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let mut stmt = conn.prepare(
        "SELECT id, folder_id, path, canonical_path, name, extension, size_bytes, modified_at, source_id, indexed_at,
                descriptor_kind, read_status, index_status, metadata_json, preview_text, text_hash, extracted_chars, total_chars, last_error
         FROM indexed_files
         WHERE folder_id = ?1
         ORDER BY indexed_at DESC",
    )?;
    let rows = stmt.query_map(params![trimmed], map_indexed_file_row)?;
    let mut files = Vec::new();
    for row in rows {
        files.push(row?);
    }
    Ok(files)
}

pub fn search_indexed_files(
    conn: &Connection,
    query: &str,
    limit: usize,
) -> Result<Vec<IndexedFile>> {
    let trimmed = query.trim();
    if trimmed.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }
    let pattern = format!("%{}%", escape_like(trimmed));
    let mut stmt = conn.prepare(
        "SELECT id, folder_id, path, canonical_path, name, extension, size_bytes, modified_at, source_id, indexed_at,
                descriptor_kind, read_status, index_status, metadata_json, preview_text, text_hash, extracted_chars, total_chars, last_error
         FROM indexed_files
         WHERE name LIKE ?1 ESCAPE '\\'
            OR path LIKE ?1 ESCAPE '\\'
            OR canonical_path LIKE ?1 ESCAPE '\\'
            OR extension LIKE ?1 ESCAPE '\\'
            OR descriptor_kind LIKE ?1 ESCAPE '\\'
            OR read_status LIKE ?1 ESCAPE '\\'
            OR index_status LIKE ?1 ESCAPE '\\'
            OR metadata_json LIKE ?1 ESCAPE '\\'
            OR preview_text LIKE ?1 ESCAPE '\\'
         ORDER BY indexed_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![pattern, limit as i64], map_indexed_file_row)?;
    let mut files = Vec::new();
    for row in rows {
        files.push(row?);
    }
    Ok(files)
}

pub fn mark_missing_indexed_files(
    conn: &Connection,
    folder_id: &str,
    seen_paths: &HashSet<String>,
) -> Result<Vec<IndexedFile>> {
    let existing = list_indexed_files_for_folder(conn, folder_id)?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut missing = Vec::new();
    for file in existing {
        if seen_paths.contains(&file.path) || file.read_status == "missing" {
            continue;
        }
        conn.execute(
            "UPDATE indexed_files
             SET read_status = 'missing',
                 index_status = 'stale',
                 indexed_at = ?1,
                 last_error = 'file missing on last scan'
             WHERE id = ?2",
            params![now, file.id],
        )?;
        if let Some(updated) = get_indexed_file(conn, &file.id)? {
            missing.push(updated);
        }
    }
    Ok(missing)
}

pub fn mark_indexed_folder_scanned(
    conn: &Connection,
    folder_id: &str,
    scanned_at: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE indexed_folders SET last_scanned_at = ?1 WHERE id = ?2",
        params![scanned_at, folder_id],
    )?;
    Ok(())
}

pub fn remove_indexed_folder(conn: &Connection, folder_id: &str) -> Result<()> {
    let trimmed = folder_id.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    conn.execute(
        "DELETE FROM indexed_files WHERE folder_id = ?1",
        params![trimmed],
    )?;
    conn.execute(
        "DELETE FROM indexed_folders WHERE id = ?1",
        params![trimmed],
    )?;
    Ok(())
}

pub fn get_point(conn: &Connection, point_id: &str) -> Result<Option<StoredPoint>> {
    let trimmed = point_id.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let mut stmt = conn.prepare(
        "SELECT id, content, tag_type, parent_id, source_doc_name, source_excerpt, created_at, archived, starred
         FROM points
         WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![trimmed])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    Ok(Some(map_point_row(row)?))
}

/// Read every non-archived point (newest first) including its parent link.
pub fn list_points(conn: &Connection) -> Result<Vec<StoredPoint>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, tag_type, parent_id, source_doc_name, source_excerpt, created_at, archived, starred
         FROM points
         WHERE archived = 0
         ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], map_point_row)?;

    let mut points = Vec::new();
    for row in rows {
        points.push(row?);
    }
    Ok(points)
}

/// Insert a batch of child points under `parent_id` (NULL parent = root) and
/// record one `explore_actions` row, all in a single transaction. Returns the
/// freshly written rows so the frontend can splice them into the tree.
pub fn save_child_points(
    conn: &mut Connection,
    parent_id: Option<&str>,
    action_type: &str,
    detail: Option<&str>,
    points: &[(String, String)],
) -> Result<Vec<StoredPoint>> {
    let now = chrono::Utc::now().to_rfc3339();
    let tx = conn.transaction()?;
    let mut written = Vec::with_capacity(points.len());

    for (content, tag_type) in points {
        let id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO points (id, content, tag_type, parent_id, source_doc_name, source_excerpt, created_at)
             VALUES (?1, ?2, ?3, ?4, NULL, NULL, ?5)",
            params![id, content, tag_type, parent_id, now],
        )?;
        written.push(StoredPoint {
            id,
            content: content.clone(),
            tag_type: Some(tag_type.clone()),
            parent_id: parent_id.map(str::to_string),
            source_doc_name: None,
            source_excerpt: None,
            created_at: now.clone(),
            archived: false,
            starred: false,
        });
    }

    // Record behaviour for later stats. `point_id` is the parent when present,
    // otherwise the first new point (root deep-dive).
    let action_point = parent_id
        .map(str::to_string)
        .or_else(|| written.first().map(|p| p.id.clone()))
        .unwrap_or_default();
    tx.execute(
        "INSERT INTO explore_actions (point_id, action_type, detail, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![action_point, action_type, detail, now],
    )?;

    tx.commit()?;
    Ok(written)
}

/// FTS5-powered similarity search over `content`, excluding the point itself
/// and all of its descendants. Falls back gracefully to an empty result if the
/// query string is blank.
pub fn find_similar_points(
    conn: &Connection,
    point_id: &str,
    keywords: &[String],
    limit: usize,
) -> Result<Vec<StoredPoint>> {
    if keywords.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    // FTS5 uses the trigram tokenizer here; two-character CJK terms cannot
    // produce stable MATCH results, so keep those for the local fallback.
    let fts_keywords = keywords
        .iter()
        .filter(|kw| kw.chars().count() >= 3)
        .collect::<Vec<_>>();

    let mut out = if fts_keywords.is_empty() {
        Vec::new()
    } else {
        // Build an OR query for FTS5: each keyword as a quoted phrase so special
        // chars are treated literally.
        let fts_query = fts_keywords
            .iter()
            .map(|kw| format!("\"{}\"", kw.replace('"', " ")))
            .collect::<Vec<_>>()
            .join(" OR ");

        let sql = "WITH RECURSIVE descendants(id) AS (
                SELECT ?1
                UNION ALL
                SELECT p.id FROM points p JOIN descendants d ON p.parent_id = d.id
            )
            SELECT p.id, p.content, p.tag_type, p.parent_id, p.source_doc_name, p.source_excerpt, p.created_at, p.archived, p.starred
            FROM points_fts f
            JOIN points p ON p.id = f.id
            WHERE points_fts MATCH ?2
              AND p.archived = 0
              AND p.id NOT IN (SELECT id FROM descendants)
            ORDER BY rank
            LIMIT ?3";

        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map(params![point_id, fts_query, limit as i64], map_point_row)?;

        let mut rows_out = Vec::new();
        for row in rows {
            rows_out.push(row?);
        }
        rows_out
    };

    if out.len() < limit {
        let seen = out
            .iter()
            .map(|point| point.id.clone())
            .collect::<HashSet<_>>();
        let mut fallback = find_similar_points_by_keyword_overlap(
            conn,
            point_id,
            keywords,
            limit - out.len(),
            &seen,
        )?;
        out.append(&mut fallback);
    }

    Ok(out)
}

fn find_similar_points_by_keyword_overlap(
    conn: &Connection,
    point_id: &str,
    keywords: &[String],
    limit: usize,
    seen: &HashSet<String>,
) -> Result<Vec<StoredPoint>> {
    if limit == 0 {
        return Ok(Vec::new());
    }

    let like_terms = keywords
        .iter()
        .filter(|kw| kw.chars().count() >= 2)
        .take(12)
        .map(|kw| format!("%{}%", escape_like(kw)))
        .collect::<Vec<_>>();

    if like_terms.is_empty() {
        return Ok(Vec::new());
    }

    let mut sql = String::from(
        "WITH RECURSIVE descendants(id) AS (
            SELECT ?
            UNION ALL
            SELECT p.id FROM points p JOIN descendants d ON p.parent_id = d.id
        )
        SELECT p.id, p.content, p.tag_type, p.parent_id, p.source_doc_name, p.source_excerpt, p.created_at, p.archived, p.starred
        FROM points p
        WHERE p.archived = 0
          AND p.id NOT IN (SELECT id FROM descendants)",
    );

    let mut values = vec![point_id.to_string()];
    if !seen.is_empty() {
        let placeholders = std::iter::repeat("?")
            .take(seen.len())
            .collect::<Vec<_>>()
            .join(", ");
        sql.push_str(&format!(" AND p.id NOT IN ({placeholders})"));
        values.extend(seen.iter().cloned());
    }

    let like_clause = std::iter::repeat("p.content LIKE ? ESCAPE '\\'")
        .take(like_terms.len())
        .collect::<Vec<_>>()
        .join(" OR ");
    sql.push_str(&format!(
        " AND ({like_clause}) ORDER BY p.created_at DESC LIMIT 250"
    ));
    values.extend(like_terms);

    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_from_iter(values.iter()), map_point_row)?;
    let mut scored = Vec::new();
    for row in rows {
        let point = row?;
        let score = keyword_overlap_score(&point.content, keywords);
        if score > 0 {
            scored.push((score, point));
        }
    }

    scored.sort_by(|(left_score, left), (right_score, right)| {
        right_score
            .cmp(left_score)
            .then_with(|| right.created_at.cmp(&left.created_at))
    });

    Ok(scored
        .into_iter()
        .take(limit)
        .map(|(_, point)| point)
        .collect())
}

fn keyword_overlap_score(content: &str, keywords: &[String]) -> usize {
    keywords
        .iter()
        .filter(|kw| kw.chars().count() >= 2 && content.contains(kw.as_str()))
        .map(|kw| kw.chars().count().min(6))
        .sum()
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// FTS5 keyword search over all points. Empty query returns empty vec.
pub fn search_points(conn: &Connection, query: &str, limit: usize) -> Result<Vec<StoredPoint>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let fts_query = query
        .split_whitespace()
        .map(|t| format!("\"{}\"", t.replace('"', " ")))
        .collect::<Vec<_>>()
        .join(" OR ");

    let sql = "SELECT p.id, p.content, p.tag_type, p.parent_id, p.source_doc_name, p.source_excerpt, p.created_at, p.archived, p.starred
               FROM points_fts f
               JOIN points p ON p.id = f.id
               WHERE points_fts MATCH ?1
               ORDER BY rank
               LIMIT ?2";

    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![fts_query, limit as i64], map_point_row)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// Delete a point and all its descendants (recursive CTE), plus their explore_actions rows.
pub fn delete_point(conn: &Connection, point_id: &str) -> Result<()> {
    conn.execute_batch(&format!(
        "WITH RECURSIVE descendants(id) AS (
             SELECT '{pid}'
             UNION ALL
             SELECT p.id FROM points p JOIN descendants d ON p.parent_id = d.id
         )
         UPDATE evidence_records SET point_id = NULL WHERE point_id IN (SELECT id FROM descendants);
         WITH RECURSIVE descendants(id) AS (
             SELECT '{pid}'
             UNION ALL
             SELECT p.id FROM points p JOIN descendants d ON p.parent_id = d.id
         )
         DELETE FROM point_source_links WHERE point_id IN (SELECT id FROM descendants);
         WITH RECURSIVE descendants(id) AS (
             SELECT '{pid}'
             UNION ALL
             SELECT p.id FROM points p JOIN descendants d ON p.parent_id = d.id
         )
         DELETE FROM explore_actions WHERE point_id IN (SELECT id FROM descendants);
         WITH RECURSIVE descendants(id) AS (
             SELECT '{pid}'
             UNION ALL
             SELECT p.id FROM points p JOIN descendants d ON p.parent_id = d.id
         )
         DELETE FROM points WHERE id IN (SELECT id FROM descendants);",
        pid = point_id.replace('\'', "''")
    ))
    .context("failed to delete point and descendants")
}

/// Record a standalone explore action (used when no rows are written, e.g. similar search).
pub fn record_explore_action(
    conn: &Connection,
    point_id: &str,
    action_type: &str,
    detail: Option<&str>,
) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO explore_actions (point_id, action_type, detail, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![point_id, action_type, detail, now],
    )?;
    Ok(())
}

/// Derive rough keywords from a point's content: CJK trigrams/bigrams plus
/// latin word tokens. Deliberately simple — this feeds local similarity search.
pub fn extract_keywords(content: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let is_sep = |c: char| {
        c.is_whitespace()
            || c.is_ascii_punctuation()
            || "，。、；：！？“”‘’（）《》【】…—·".contains(c)
    };

    for token in content.split(is_sep) {
        let chars: Vec<char> = token.chars().collect();
        if chars.is_empty() {
            continue;
        }
        let is_cjk = chars.iter().any(|c| ('\u{4E00}'..='\u{9FFF}').contains(c));
        if is_cjk {
            for window in chars.windows(3) {
                let trigram: String = window.iter().collect();
                if seen.insert(trigram.clone()) {
                    out.push(trigram);
                }
            }
            for window in chars.windows(2) {
                let bigram: String = window.iter().collect();
                if seen.insert(bigram.clone()) {
                    out.push(bigram);
                }
            }
        } else if chars.len() >= 3 {
            let word: String = chars.iter().collect::<String>().to_lowercase();
            if seen.insert(word.clone()) {
                out.push(word);
            }
        }
    }

    out.truncate(18);
    out
}

/// Read every archived point (newest first).
pub fn list_archived_points(conn: &Connection) -> Result<Vec<StoredPoint>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, tag_type, parent_id, source_doc_name, source_excerpt, created_at, archived, starred
         FROM points
         WHERE archived = 1
         ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], map_point_row)?;
    let mut points = Vec::new();
    for row in rows {
        points.push(row?);
    }
    Ok(points)
}

/// Set the `archived` flag on a point (1 = archived, 0 = active).
pub fn set_archived(conn: &Connection, point_id: &str, archived: bool) -> Result<()> {
    conn.execute(
        "UPDATE points SET archived = ?1 WHERE id = ?2",
        params![archived as i64, point_id],
    )?;
    Ok(())
}

fn map_point_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredPoint> {
    Ok(StoredPoint {
        id: row.get(0)?,
        content: row.get(1)?,
        tag_type: row.get(2)?,
        parent_id: row.get(3)?,
        source_doc_name: row.get(4)?,
        source_excerpt: row.get(5)?,
        created_at: row.get(6)?,
        archived: row.get::<_, i64>(7).unwrap_or(0) != 0,
        starred: row.get::<_, i64>(8).unwrap_or(0) != 0,
    })
}

fn map_source_summary_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SourceSummaryRecord> {
    Ok(SourceSummaryRecord {
        id: row.get(0)?,
        kind: row.get(1)?,
        title: row.get(2)?,
        canonical_uri: row.get(3)?,
        metadata_json: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        chunk_count: row.get(7)?,
        point_count: row.get(8)?,
        star_count: row.get(9)?,
    })
}

fn map_source_chunk_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SourceChunkRecord> {
    Ok(SourceChunkRecord {
        id: row.get(0)?,
        source_id: row.get(1)?,
        chunk_index: row.get(2)?,
        heading_path: row.get(3)?,
        text: row.get(4)?,
        created_at: row.get(5)?,
    })
}

fn map_evidence_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<EvidenceRecord> {
    Ok(EvidenceRecord {
        id: row.get(0)?,
        claim: row.get(1)?,
        verdict: row.get(2)?,
        answer: row.get(3)?,
        reasoning: row.get(4)?,
        context: row.get(5)?,
        point_id: row.get(6)?,
        source_id: row.get(7)?,
        chunk_index: row.get(8)?,
        checked_at: row.get(9)?,
        created_at: row.get(10)?,
        sources: Vec::new(),
    })
}

fn map_evidence_source_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<EvidenceSourceRecord> {
    Ok(EvidenceSourceRecord {
        id: row.get(0)?,
        evidence_id: row.get(1)?,
        title: row.get(2)?,
        url: row.get(3)?,
        snippet: row.get(4)?,
        stance: row.get(5)?,
        created_at: row.get(6)?,
    })
}

fn map_report_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReportRecord> {
    Ok(ReportRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        kind: row.get(2)?,
        source_name: row.get(3)?,
        body_md: row.get(4)?,
        summary: row.get(5)?,
        citations_json: row.get(6)?,
        created_at: row.get(7)?,
    })
}

fn map_saved_asset_search_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SavedAssetSearch> {
    let kinds_json: String = row.get(3)?;
    Ok(SavedAssetSearch {
        id: row.get(0)?,
        name: row.get(1)?,
        query: row.get(2)?,
        kinds: json_array_strings(&kinds_json),
        filter: row.get(4)?,
        limit: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn map_retrieval_profile_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<RetrievalProfile> {
    let kinds_json: String = row.get(4)?;
    Ok(RetrievalProfile {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        query: row.get(3)?,
        kinds: json_array_strings(&kinds_json),
        filter: row.get(5)?,
        saved_search_id: row.get(6)?,
        limit: row.get(7)?,
        max_chars_per_item: row.get(8)?,
        min_score: row.get(9)?,
        mode: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn map_report_claim_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReportClaimRecord> {
    let citation_labels_json: String = row.get(5)?;
    Ok(ReportClaimRecord {
        id: row.get(0)?,
        report_id: row.get(1)?,
        claim_index: row.get(2)?,
        claim_text: row.get(3)?,
        claim_status: row.get(4)?,
        citation_labels: json_array_strings(&citation_labels_json),
        created_at: row.get(6)?,
    })
}

fn map_report_citation_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReportCitationRecord> {
    Ok(ReportCitationRecord {
        id: row.get(0)?,
        report_id: row.get(1)?,
        citation_index: row.get(2)?,
        target_kind: row.get(3)?,
        target_id: row.get(4)?,
        label: row.get(5)?,
        title: row.get(6)?,
        quote: row.get(7)?,
        excerpt: row.get(8)?,
        reason: row.get(9)?,
        source_id: row.get(10)?,
        chunk_index: row.get(11)?,
        source_text_hash: row.get(12)?,
        span_start: row.get(13)?,
        span_end: row.get(14)?,
        locator_status: row.get(15)?,
        match_count: row.get(16)?,
        created_at: row.get(17)?,
    })
}

fn map_ai_invocation_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiInvocationRecord> {
    Ok(AiInvocationRecord {
        id: row.get(0)?,
        task_kind: row.get(1)?,
        model_profile_id: row.get(2)?,
        model_name: row.get(3)?,
        prompt_version: row.get(4)?,
        input_query: row.get(5)?,
        input_refs_json: row.get(6)?,
        context_manifest_json: row.get(7)?,
        output_ref_kind: row.get(8)?,
        output_ref_id: row.get(9)?,
        token_usage_json: row.get(10)?,
        warnings_json: row.get(11)?,
        created_at: row.get(12)?,
    })
}

fn map_investigation_context_item_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<InvestigationContextItemRecord> {
    Ok(InvestigationContextItemRecord {
        id: row.get(0)?,
        invocation_id: row.get(1)?,
        target_kind: row.get(2)?,
        target_id: row.get(3)?,
        label: row.get(4)?,
        role: row.get(5)?,
        included: row.get::<_, i64>(6)? != 0,
        truncated: row.get::<_, i64>(7)? != 0,
        reason: row.get(8)?,
        char_count: row.get(9)?,
        source_text_hash: row.get(10)?,
        created_at: row.get(11)?,
    })
}

fn map_journal_entry_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<JournalEntry> {
    Ok(JournalEntry {
        id: row.get(0)?,
        query: row.get(1)?,
        note: row.get(2)?,
        tags_json: row.get(3)?,
        source_ids_json: row.get(4)?,
        point_ids_json: row.get(5)?,
        evidence_ids_json: row.get(6)?,
        report_ids_json: row.get(7)?,
        created_report_id: row.get(8)?,
        source_kind: row.get(9)?,
        created_at: row.get(10)?,
        invalidated_at: row.get(11)?,
        invalidated_reason: row.get(12)?,
    })
}

fn map_quick_capture_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<QuickCaptureItem> {
    let tags_json: String = row.get(2)?;
    Ok(QuickCaptureItem {
        id: row.get(0)?,
        content: row.get(1)?,
        tags: json_array_strings(&tags_json),
        source_kind: row.get(3)?,
        status: row.get(4)?,
        resolved_kind: row.get(5)?,
        resolved_id: row.get(6)?,
        resolved_at: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn map_asset_relation_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AssetRelationRecord> {
    Ok(AssetRelationRecord {
        id: row.get(0)?,
        from_kind: row.get(1)?,
        from_id: row.get(2)?,
        to_kind: row.get(3)?,
        to_id: row.get(4)?,
        relation: row.get(5)?,
        reason: row.get(6)?,
        score: row.get(7)?,
        source_kind: row.get(8)?,
        created_at: row.get(9)?,
        vetted_at: row.get(10)?,
    })
}

fn map_review_item_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReviewItem> {
    Ok(ReviewItem {
        id: row.get(0)?,
        target_kind: row.get(1)?,
        target_id: row.get(2)?,
        title: row.get(3)?,
        note: row.get(4)?,
        status: row.get(5)?,
        priority: row.get(6)?,
        due_at: row.get(7)?,
        last_reviewed_at: row.get(8)?,
        review_count: row.get(9)?,
        ease: row.get(10)?,
        interval_days: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

struct ReviewQueueCandidate {
    item: ReviewItem,
    due_at: Option<chrono::DateTime<chrono::Utc>>,
    due_sort_at: chrono::DateTime<chrono::Utc>,
    priority_rank: i64,
    days_overdue: i64,
}

fn build_review_queue_plan_from_items(
    items: Vec<ReviewItem>,
    input: ReviewQueuePlanInput,
    now: chrono::DateTime<chrono::Utc>,
) -> ReviewQueuePlan {
    let mode = normalize_review_queue_mode(input.mode.as_deref());
    let limit = normalize_review_queue_limit(input.limit);
    let mut due_count = 0;
    let mut overdue_count = 0;
    let mut future_count = 0;
    let mut dismissed_count = 0;
    let mut candidates = Vec::new();

    for item in items {
        if item.status != "active" {
            dismissed_count += 1;
            continue;
        }

        let due_at = parse_review_due_at(&item.due_at);
        if due_at.as_ref().is_some_and(|value| *value > now) {
            future_count += 1;
            continue;
        }

        due_count += 1;
        let is_overdue = due_at.as_ref().is_some_and(|value| *value < now);
        if is_overdue {
            overdue_count += 1;
        }
        let days_overdue = due_at
            .as_ref()
            .map(|value| {
                now.signed_duration_since(value.to_owned())
                    .num_days()
                    .max(0)
            })
            .unwrap_or(0);
        let priority_rank = review_priority_rank(&item.priority);
        candidates.push(ReviewQueueCandidate {
            due_sort_at: due_at.clone().unwrap_or(now),
            due_at,
            priority_rank,
            days_overdue,
            item,
        });
    }

    candidates.sort_by(|left, right| {
        left.due_sort_at
            .cmp(&right.due_sort_at)
            .then_with(|| right.priority_rank.cmp(&left.priority_rank))
            .then_with(|| left.item.review_count.cmp(&right.item.review_count))
            .then_with(|| left.item.created_at.cmp(&right.item.created_at))
            .then_with(|| left.item.id.cmp(&right.item.id))
    });

    let candidate_count = candidates.len() as i64;
    let planned_items: Vec<ReviewQueuePlanItem> = candidates
        .into_iter()
        .take(limit as usize)
        .enumerate()
        .map(|(index, candidate)| ReviewQueuePlanItem {
            reason: review_queue_plan_reason(&candidate),
            item: candidate.item,
            position: index as i64 + 1,
            priority_rank: candidate.priority_rank,
            days_overdue: candidate.days_overdue,
        })
        .collect();
    let overflow_count = (candidate_count - planned_items.len() as i64).max(0);

    ReviewQueuePlan {
        now: now.to_rfc3339(),
        mode,
        limit,
        candidate_count,
        due_count,
        overdue_count,
        future_count,
        dismissed_count,
        overflow_count,
        items: planned_items,
    }
}

fn normalize_review_queue_mode(mode: Option<&str>) -> String {
    match optional_trimmed(mode).as_deref() {
        Some("catchup") => "catchup".to_string(),
        _ => "due".to_string(),
    }
}

fn normalize_review_queue_limit(limit: Option<i64>) -> i64 {
    limit
        .unwrap_or(REVIEW_QUEUE_DEFAULT_LIMIT)
        .clamp(1, REVIEW_QUEUE_MAX_LIMIT)
}

fn parse_review_due_at(value: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|date| date.with_timezone(&chrono::Utc))
}

fn review_priority_rank(priority: &str) -> i64 {
    match priority {
        "high" => 3,
        "normal" => 2,
        "low" => 1,
        _ => 0,
    }
}

fn review_queue_plan_reason(candidate: &ReviewQueueCandidate) -> String {
    let priority = match candidate.priority_rank {
        3 => "high priority",
        2 => "normal priority",
        1 => "low priority",
        _ => "unknown priority",
    };
    let due_status = if candidate.due_at.is_none() {
        "date unavailable".to_string()
    } else if candidate.days_overdue > 0 {
        format!("overdue {}d", candidate.days_overdue)
    } else {
        "due now".to_string()
    };
    format!(
        "{priority} | {due_status} | reviewed {}x",
        candidate.item.review_count
    )
}

fn map_indexed_folder_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<IndexedFolder> {
    Ok(IndexedFolder {
        id: row.get(0)?,
        path: row.get(1)?,
        name: row.get(2)?,
        enabled: row.get::<_, i64>(3)? != 0,
        last_scanned_at: row.get(4)?,
        created_at: row.get(5)?,
    })
}

fn map_indexed_file_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<IndexedFile> {
    Ok(IndexedFile {
        id: row.get(0)?,
        folder_id: row.get(1)?,
        path: row.get(2)?,
        canonical_path: row.get(3)?,
        name: row.get(4)?,
        extension: row.get(5)?,
        size_bytes: row.get(6)?,
        modified_at: row.get(7)?,
        source_id: row.get(8)?,
        indexed_at: row.get(9)?,
        descriptor_kind: row.get(10)?,
        read_status: row.get(11)?,
        index_status: row.get(12)?,
        metadata_json: row.get(13)?,
        preview_text: row.get(14)?,
        text_hash: row.get(15)?,
        extracted_chars: row.get(16)?,
        total_chars: row.get(17)?,
        last_error: row.get(18)?,
    })
}

fn required_trimmed<'a>(field: &str, value: &'a str) -> Result<&'a str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        anyhow::bail!("{field} is required");
    }
    Ok(trimmed)
}

fn optional_trimmed(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|trimmed| !trimmed.is_empty())
        .map(str::to_string)
}

fn validate_evidence_verdict(verdict: &str) -> Result<()> {
    match verdict {
        "supported" | "contradicted" | "mixed" | "uncertain" => Ok(()),
        _ => anyhow::bail!("invalid evidence verdict: {verdict}"),
    }
}

fn validate_evidence_stance(stance: &str) -> Result<()> {
    match stance {
        "support" | "contradict" | "context" | "unknown" => Ok(()),
        _ => anyhow::bail!("invalid evidence source stance: {stance}"),
    }
}

fn validate_report_kind(kind: &str) -> Result<()> {
    match kind {
        "digest" | "synthesis" | "investigation" => Ok(()),
        _ => anyhow::bail!("invalid report kind: {kind}"),
    }
}

fn validate_report_claim_status(status: &str) -> Result<()> {
    match status {
        "cited" | "inferred" | "unsupported" => Ok(()),
        _ => anyhow::bail!("invalid report claim status: {status}"),
    }
}

fn validate_report_citation_target_kind(kind: &str) -> Result<()> {
    match kind {
        "source" | "point" | "evidence" => Ok(()),
        _ => anyhow::bail!("invalid report citation target kind: {kind}"),
    }
}

fn validate_citation_locator_status(status: &str) -> Result<()> {
    match status {
        "located" | "multiple_matches" | "not_found" | "stale" | "target_missing"
        | "not_applicable" => Ok(()),
        _ => anyhow::bail!("invalid citation locator status: {status}"),
    }
}

fn validate_quick_capture_status(status: &str) -> Result<()> {
    match status {
        "inbox" | "resolved" | "dismissed" => Ok(()),
        _ => anyhow::bail!("invalid quick capture status: {status}"),
    }
}

fn validate_quick_capture_target_kind(kind: &str) -> Result<()> {
    match kind {
        "journal" | "point" | "source" => Ok(()),
        _ => anyhow::bail!("invalid quick capture target kind: {kind}"),
    }
}

fn validate_asset_kind(kind: &str) -> Result<()> {
    match kind {
        "source" | "point" | "evidence" | "report" | "journal" | "gallery" | "review" => Ok(()),
        _ => anyhow::bail!("invalid asset kind: {kind}"),
    }
}

fn validate_context_target_kind(kind: &str) -> Result<()> {
    match kind {
        "source" | "point" | "evidence" | "report" | "journal" | "relation" => Ok(()),
        _ => anyhow::bail!("invalid context target kind: {kind}"),
    }
}

fn validate_context_role(role: &str) -> Result<()> {
    match role {
        "source" | "point" | "evidence" | "prior_report" | "journal_recall" | "related_clue" => {
            Ok(())
        }
        _ => anyhow::bail!("invalid context role: {role}"),
    }
}

fn validate_review_asset_kind(kind: &str) -> Result<()> {
    match kind {
        "source" | "point" | "evidence" | "report" | "journal" => Ok(()),
        _ => anyhow::bail!("invalid review target kind: {kind}"),
    }
}

fn validate_asset_relation(relation: &str) -> Result<()> {
    match relation.trim() {
        "co_cited" | "same_source" | "supports" | "contradicts" | "same_topic" | "derived_from"
        | "review_related" => Ok(()),
        _ => anyhow::bail!("invalid asset relation: {relation}"),
    }
}

fn validate_review_priority(priority: &str) -> Result<()> {
    match priority {
        "low" | "normal" | "high" => Ok(()),
        _ => anyhow::bail!("invalid review priority: {priority}"),
    }
}

fn review_interval_days(rating: &str) -> Result<i64> {
    match rating {
        "again" => Ok(1),
        "hard" => Ok(3),
        "good" => Ok(7),
        "easy" => Ok(14),
        _ => anyhow::bail!("invalid review rating: {rating}"),
    }
}

fn default_open_data_mirror_config() -> OpenDataMirrorConfig {
    OpenDataMirrorConfig {
        enabled: false,
        root_path: None,
        export_sources: true,
        export_evidence: true,
        export_reports: true,
        export_journal: true,
        export_gallery_index: true,
    }
}

fn json_string_array(values: Vec<String>) -> String {
    let normalized = values
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    serde_json::to_string(&normalized).unwrap_or_else(|_| "[]".to_string())
}

fn json_array_strings(value: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(value).unwrap_or_default()
}

fn normalized_json_object(field: &str, value: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        anyhow::bail!("{field} is required");
    }
    let parsed: serde_json::Value =
        serde_json::from_str(trimmed).with_context(|| format!("{field} must be valid JSON"))?;
    if !parsed.is_object() {
        anyhow::bail!("{field} must be a JSON object");
    }
    Ok(parsed.to_string())
}

fn normalized_json_array(field: &str, value: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        anyhow::bail!("{field} is required");
    }
    let parsed: serde_json::Value =
        serde_json::from_str(trimmed).with_context(|| format!("{field} must be valid JSON"))?;
    if !parsed.is_array() {
        anyhow::bail!("{field} must be a JSON array");
    }
    Ok(parsed.to_string())
}

pub fn stable_text_hash(text: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in text.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("fnv1a64:{hash:016x}")
}

fn citation_asset(citation: &serde_json::Value) -> Option<(String, String)> {
    let object = citation.as_object()?;
    let kind = object.get("kind")?.as_str()?.trim();
    let id = object.get("id")?.as_str()?.trim();
    if kind.is_empty() || id.is_empty() || validate_asset_kind(kind).is_err() {
        return None;
    }
    Some((kind.to_string(), id.to_string()))
}

fn report_citation_assets(report: &ReportRecord) -> Vec<(String, String)> {
    let Ok(serde_json::Value::Array(citations)) =
        serde_json::from_str::<serde_json::Value>(&report.citations_json)
    else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    citations
        .iter()
        .filter_map(citation_asset)
        .filter(|asset| seen.insert(asset.clone()))
        .collect()
}

fn save_symmetric_relation(
    conn: &Connection,
    left_kind: &str,
    left_id: &str,
    right_kind: &str,
    right_id: &str,
    relation: &str,
    reason: &str,
    score: f64,
) -> Result<usize> {
    if left_kind == right_kind && left_id == right_id {
        return Ok(0);
    }
    save_asset_relation(
        conn,
        SaveAssetRelationInput {
            from_kind: left_kind.to_string(),
            from_id: left_id.to_string(),
            to_kind: right_kind.to_string(),
            to_id: right_id.to_string(),
            relation: relation.to_string(),
            reason: reason.to_string(),
            score,
            source_kind: "auto".to_string(),
        },
    )?;
    save_asset_relation(
        conn,
        SaveAssetRelationInput {
            from_kind: right_kind.to_string(),
            from_id: right_id.to_string(),
            to_kind: left_kind.to_string(),
            to_id: left_id.to_string(),
            relation: relation.to_string(),
            reason: reason.to_string(),
            score,
            source_kind: "auto".to_string(),
        },
    )?;
    Ok(2)
}

fn rebuild_report_cocitations(conn: &Connection) -> Result<usize> {
    let mut count = 0;
    for report in list_recent_reports(conn, usize::MAX)? {
        let assets = report_citation_assets(&report);
        for (left_index, (left_kind, left_id)) in assets.iter().enumerate() {
            count += save_symmetric_relation(
                conn,
                "report",
                &report.id,
                left_kind,
                left_id,
                "derived_from",
                "Report cites this asset",
                0.9,
            )?;
            for (right_kind, right_id) in assets.iter().skip(left_index + 1) {
                count += save_symmetric_relation(
                    conn,
                    left_kind,
                    left_id,
                    right_kind,
                    right_id,
                    "co_cited",
                    "Assets are cited together in a report",
                    0.72,
                )?;
            }
        }
    }
    Ok(count)
}

fn rebuild_evidence_relations(conn: &Connection) -> Result<usize> {
    let mut count = 0;
    for evidence in list_recent_evidence(conn, usize::MAX)? {
        if let Some(source_id) = evidence.source_id.as_deref() {
            count += save_symmetric_relation(
                conn,
                "evidence",
                &evidence.id,
                "source",
                source_id,
                "same_source",
                "Evidence is linked to this Source",
                0.85,
            )?;
        }
        if let Some(point_id) = evidence.point_id.as_deref() {
            count += save_symmetric_relation(
                conn,
                "evidence",
                &evidence.id,
                "point",
                point_id,
                "supports",
                "Evidence was saved from this Point",
                0.78,
            )?;
        }
    }
    Ok(count)
}

fn rebuild_journal_relations(conn: &Connection) -> Result<usize> {
    let mut count = 0;
    for entry in list_recent_journal_entries(conn, usize::MAX)? {
        if entry.invalidated_at.is_some() {
            continue;
        }
        let mut assets = Vec::new();
        assets.extend(
            json_array_strings(&entry.source_ids_json)
                .into_iter()
                .map(|id| ("source".to_string(), id)),
        );
        assets.extend(
            json_array_strings(&entry.point_ids_json)
                .into_iter()
                .map(|id| ("point".to_string(), id)),
        );
        assets.extend(
            json_array_strings(&entry.evidence_ids_json)
                .into_iter()
                .map(|id| ("evidence".to_string(), id)),
        );
        assets.extend(
            json_array_strings(&entry.report_ids_json)
                .into_iter()
                .map(|id| ("report".to_string(), id)),
        );
        if let Some(report_id) = entry.created_report_id.as_deref() {
            assets.push(("report".to_string(), report_id.to_string()));
        }
        let mut seen = HashSet::new();
        assets.retain(|asset| seen.insert(asset.clone()));
        for (kind, id) in &assets {
            count += save_symmetric_relation(
                conn,
                "journal",
                &entry.id,
                kind,
                id,
                "same_topic",
                "Journal entry references this asset",
                0.68,
            )?;
        }
        for (left_index, (left_kind, left_id)) in assets.iter().enumerate() {
            for (right_kind, right_id) in assets.iter().skip(left_index + 1) {
                count += save_symmetric_relation(
                    conn,
                    left_kind,
                    left_id,
                    right_kind,
                    right_id,
                    "same_topic",
                    "Assets appear together in a Journal entry",
                    0.58,
                )?;
            }
        }
    }
    Ok(count)
}

fn rebuild_gallery_relations(conn: &Connection) -> Result<usize> {
    let mut count = 0;
    for item in list_gallery(conn)? {
        for point_id in &item.point_ids {
            count += save_symmetric_relation(
                conn,
                "gallery",
                &item.id,
                "point",
                point_id,
                "derived_from",
                "Gallery image was generated from this Point",
                0.7,
            )?;
        }
    }
    Ok(count)
}

fn rebuild_review_relations(conn: &Connection) -> Result<usize> {
    let mut count = 0;
    let items = list_all_review_items(conn)?;
    for item in &items {
        count += save_symmetric_relation(
            conn,
            "review",
            &item.id,
            &item.target_kind,
            &item.target_id,
            "review_related",
            "Review item targets this asset",
            0.65,
        )?;
    }
    for (left_index, left) in items.iter().enumerate() {
        for right in items.iter().skip(left_index + 1) {
            if left.status == "active" && right.status == "active" {
                count += save_symmetric_relation(
                    conn,
                    &left.target_kind,
                    &left.target_id,
                    &right.target_kind,
                    &right.target_id,
                    "review_related",
                    "Assets are active in the Review Queue together",
                    0.45,
                )?;
            }
        }
    }
    Ok(count)
}

fn normalize_report_citations_json(value: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        anyhow::bail!("report citations json is required");
    }
    let parsed: serde_json::Value =
        serde_json::from_str(trimmed).context("report citations json must be valid JSON")?;
    if !parsed.is_array() {
        anyhow::bail!("report citations json must be an array");
    }
    Ok(parsed.to_string())
}

/// Toggle starred on a point; returns new total starred count.
pub fn set_starred(conn: &Connection, point_id: &str, starred: bool) -> Result<u32> {
    conn.execute(
        "UPDATE points SET starred = ?1 WHERE id = ?2",
        params![starred as i64, point_id],
    )?;
    let count: u32 =
        conn.query_row("SELECT COUNT(*) FROM points WHERE starred = 1", [], |row| {
            row.get(0)
        })?;
    Ok(count)
}

/// Return total starred count.
pub fn starred_count(conn: &Connection) -> Result<u32> {
    let count: u32 =
        conn.query_row("SELECT COUNT(*) FROM points WHERE starred = 1", [], |row| {
            row.get(0)
        })?;
    Ok(count)
}

/// List all starred points (content only), for image prompt generation.
pub fn list_starred_points(conn: &Connection) -> Result<Vec<StoredPoint>> {
    let mut stmt = conn.prepare(
        "SELECT id, content, tag_type, parent_id, source_doc_name, source_excerpt, created_at, archived, starred
         FROM points WHERE starred = 1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], map_point_row)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// Clear the current starred collection after a digest has been generated.
pub fn clear_starred_points(conn: &Connection) -> Result<u32> {
    conn.execute("UPDATE points SET starred = 0 WHERE starred = 1", [])?;
    starred_count(conn)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GalleryItem {
    pub id: String,
    pub file_path: String,
    pub thumbnail_path: String,
    pub prompt: String,
    pub generated_at: String,
    pub download_status: String,
    pub point_ids: Vec<String>,
    pub source_points: Vec<GallerySourcePoint>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GallerySourcePoint {
    pub id: String,
    pub content: String,
    pub source_doc_name: Option<String>,
}

pub fn insert_gallery_item(conn: &Connection, item: &GalleryItem) -> Result<()> {
    let point_ids = serde_json::to_string(&item.point_ids)?;
    let source_points = serde_json::to_string(&item.source_points)?;
    conn.execute(
        "INSERT INTO gallery (id, file_path, thumbnail_path, prompt, generated_at, download_status, point_ids, source_points)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![item.id, item.file_path, item.thumbnail_path, item.prompt,
                item.generated_at, item.download_status, point_ids, source_points],
    )?;
    Ok(())
}

pub fn list_gallery(conn: &Connection) -> Result<Vec<GalleryItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, file_path, thumbnail_path, prompt, generated_at, download_status, point_ids, source_points
         FROM gallery ORDER BY generated_at DESC",
    )?;
    let rows = stmt.query_map([], map_gallery_row)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn search_gallery(conn: &Connection, query: &str, limit: usize) -> Result<Vec<GalleryItem>> {
    let trimmed = query.trim();
    if trimmed.is_empty() || limit == 0 {
        return Ok(Vec::new());
    }

    let pattern = format!("%{}%", escape_like(trimmed));
    let mut stmt = conn.prepare(
        "SELECT id, file_path, thumbnail_path, prompt, generated_at, download_status, point_ids, source_points
         FROM gallery
         WHERE prompt LIKE ?1 ESCAPE '\\'
            OR file_path LIKE ?1 ESCAPE '\\'
            OR thumbnail_path LIKE ?1 ESCAPE '\\'
            OR point_ids LIKE ?1 ESCAPE '\\'
            OR source_points LIKE ?1 ESCAPE '\\'
         ORDER BY generated_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![pattern, limit as i64], map_gallery_row)?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn get_gallery_item(conn: &Connection, id: &str) -> Result<Option<GalleryItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, file_path, thumbnail_path, prompt, generated_at, download_status, point_ids, source_points
         FROM gallery WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(map_gallery_row(row)?))
    } else {
        Ok(None)
    }
}

pub fn delete_gallery_item(conn: &Connection, id: &str) -> Result<(String, String)> {
    let item = get_gallery_item(conn, id)?.ok_or_else(|| anyhow::anyhow!("item not found"))?;
    conn.execute("DELETE FROM gallery WHERE id = ?1", params![id])?;
    Ok((item.file_path, item.thumbnail_path))
}

pub fn update_gallery_status(
    conn: &Connection,
    id: &str,
    file_path: &str,
    thumb_path: &str,
    status: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE gallery SET file_path=?1, thumbnail_path=?2, download_status=?3 WHERE id=?4",
        params![file_path, thumb_path, status, id],
    )?;
    Ok(())
}

fn map_gallery_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<GalleryItem> {
    let point_ids_str: String = row.get(6)?;
    let point_ids: Vec<String> = serde_json::from_str(&point_ids_str).unwrap_or_default();
    let source_points_str: String = row.get(7)?;
    let source_points: Vec<GallerySourcePoint> =
        serde_json::from_str(&source_points_str).unwrap_or_default();
    Ok(GalleryItem {
        id: row.get(0)?,
        file_path: row.get(1)?,
        thumbnail_path: row.get(2)?,
        prompt: row.get(3)?,
        generated_at: row.get(4)?,
        download_status: row.get(5)?,
        point_ids,
        source_points,
    })
}

// ── Suggestions ─────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub id: String,
    pub date: String,
    pub body_md: String,
    pub summary: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionMeta {
    pub id: String,
    pub summary: String,
    pub created_at: String,
}

pub fn save_suggestion(
    conn: &Connection,
    id: &str,
    date: &str,
    body_md: &str,
    summary: &str,
    created_at: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO suggestions (id, date, body_md, summary, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, date, body_md, summary, created_at],
    )?;
    Ok(())
}

pub fn list_suggestions_by_date(conn: &Connection, date: &str) -> Result<Vec<SuggestionMeta>> {
    let mut stmt = conn.prepare(
        "SELECT id, summary, created_at FROM suggestions WHERE date = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![date], |r| {
        Ok(SuggestionMeta {
            id: r.get(0)?,
            summary: r.get(1)?,
            created_at: r.get(2)?,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn get_suggestion(conn: &Connection, id: &str) -> Result<Option<Suggestion>> {
    let mut stmt = conn
        .prepare("SELECT id, date, body_md, summary, created_at FROM suggestions WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Suggestion {
            id: row.get(0)?,
            date: row.get(1)?,
            body_md: row.get(2)?,
            summary: row.get(3)?,
            created_at: row.get(4)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn delete_suggestion(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM suggestions WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn list_marked_dates(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT date FROM suggestions ORDER BY date DESC")?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn list_recent_suggestion_summaries(conn: &Connection, limit: u32) -> Result<Vec<String>> {
    let mut stmt =
        conn.prepare("SELECT summary FROM suggestions ORDER BY created_at DESC LIMIT ?1")?;
    let rows = stmt.query_map(params![limit], |r| r.get::<_, String>(0))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_db(&conn).unwrap();
        conn
    }

    fn insert_point(
        conn: &Connection,
        id: &str,
        content: &str,
        parent_id: Option<&str>,
        created_at: &str,
    ) {
        conn.execute(
            "INSERT INTO points
                (id, content, tag_type, parent_id, source_doc_name, source_excerpt, created_at, archived, starred)
             VALUES (?1, ?2, '作者观点', ?3, '测试文档', NULL, ?4, 0, 0)",
            params![id, content, parent_id, created_at],
        )
        .unwrap();
    }

    fn evidence_input(
        claim: &str,
        point_id: Option<&str>,
        source_id: Option<&str>,
        checked_at: &str,
    ) -> SaveEvidenceInput {
        SaveEvidenceInput {
            claim: claim.to_string(),
            verdict: "supported".to_string(),
            answer: format!("Evidence answer for {claim}"),
            reasoning: Some("Evidence reasoning".to_string()),
            context: Some("Evidence context".to_string()),
            point_id: point_id.map(str::to_string),
            source_id: source_id.map(str::to_string),
            chunk_index: Some(0),
            checked_at: Some(checked_at.to_string()),
            sources: vec![SaveEvidenceSourceInput {
                title: Some(format!("{claim} source")),
                url: format!(
                    "https://example.com/evidence/{}",
                    claim.replace(' ', "-").to_lowercase()
                ),
                snippet: Some(format!("{claim} source snippet")),
                stance: "support".to_string(),
            }],
        }
    }

    fn report_input(title: &str, kind: &str, created_label: &str) -> SaveReportInput {
        SaveReportInput {
            title: title.to_string(),
            kind: kind.to_string(),
            source_name: Some(format!("{kind} source")),
            body_md: format!("# {title}\n\nReport body with {created_label}"),
            summary: format!("{title} summary"),
            citations_json: format!(
                r#"[{{"kind":"source","label":"S1","id":"source-{created_label}","title":"Source {created_label}","excerpt":"quoted evidence","sourceId":"source-{created_label}","chunkIndex":0,"url":"https://example.com/{created_label}"}}]"#
            ),
        }
    }

    struct SearchEvalCase {
        query: &'static str,
        expected_kind: &'static str,
        expected_id: String,
        hit_k: usize,
        reason: &'static str,
    }

    struct SearchEvalOutcome {
        query: String,
        expected_kind: String,
        expected_id: String,
        top: Option<(String, String, String)>,
        hit_at_1: bool,
        hit_at_k: bool,
        hit_k: usize,
        reason: String,
    }

    fn run_search_eval(conn: &Connection, cases: Vec<SearchEvalCase>) -> Vec<SearchEvalOutcome> {
        cases
            .into_iter()
            .map(|case| {
                let results = search_assets(
                    conn,
                    SearchAssetsInput {
                        query: case.query.to_string(),
                        kinds: None,
                        filter: None,
                        limit: Some(case.hit_k.max(10) as i64),
                    },
                )
                .unwrap();
                let expected_hit = |result: &SearchAssetResult| {
                    result.kind == case.expected_kind && result.id == case.expected_id
                };
                let top = results
                    .first()
                    .map(|result| (result.kind.clone(), result.id.clone(), result.title.clone()));
                let hit_at_1 = results.first().map_or(false, |result| {
                    result.kind == case.expected_kind && result.id == case.expected_id
                });
                let hit_at_k = results.iter().take(case.hit_k).any(expected_hit);

                SearchEvalOutcome {
                    query: case.query.to_string(),
                    expected_kind: case.expected_kind.to_string(),
                    expected_id: case.expected_id,
                    top,
                    hit_at_1,
                    hit_at_k,
                    hit_k: case.hit_k,
                    reason: case.reason.to_string(),
                }
            })
            .collect()
    }

    fn search_eval_summary(outcomes: &[SearchEvalOutcome]) -> String {
        let mut lines = vec![
            "| query | expected | top | hit@1 | hit@k | reason |".to_string(),
            "|---|---|---|---:|---:|---|".to_string(),
        ];
        for outcome in outcomes {
            let top = outcome
                .top
                .as_ref()
                .map(|(kind, id, title)| format!("{kind}:{id}:{title}"))
                .unwrap_or_else(|| "none".to_string());
            lines.push(format!(
                "| {} | {}:{} | {} | {} | {}@{} | {} |",
                outcome.query,
                outcome.expected_kind,
                outcome.expected_id,
                top,
                outcome.hit_at_1,
                outcome.hit_at_k,
                outcome.hit_k,
                outcome.reason
            ));
        }
        lines.join("\n")
    }

    fn retrieval_context_counts(conn: &Connection) -> (i64, i64, i64, i64, i64, i64) {
        (
            table_count(conn, "source_documents"),
            table_count(conn, "points"),
            table_count(conn, "reports"),
            table_count(conn, "journal_entries"),
            table_count(conn, "indexed_folders"),
            table_count(conn, "indexed_files"),
        )
    }

    fn table_count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .unwrap()
    }

    #[test]
    fn upsert_source_document_reuses_existing_row() {
        let conn = memory_db();

        let first = upsert_source_document(
            &conn,
            "file",
            "D:/docs/test.md",
            Some("test.md"),
            r#"{"kind":"file"}"#,
        )
        .unwrap();
        let second = upsert_source_document(
            &conn,
            "file",
            "D:/docs/test.md",
            Some("test.md"),
            r#"{"kind":"file","updated":true}"#,
        )
        .unwrap();

        assert_eq!(first.id, second.id);
        assert_eq!(second.metadata_json, r#"{"kind":"file","updated":true}"#);

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM source_documents", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn replace_source_chunks_replaces_previous_rows() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "webpage",
            "https://example.com/story",
            Some("Story"),
            r#"{"kind":"webpage"}"#,
        )
        .unwrap();

        replace_source_chunks(
            &mut conn,
            &source.id,
            &["first".to_string(), "second".to_string()],
        )
        .unwrap();
        replace_source_chunks(&mut conn, &source.id, &["updated".to_string()]).unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM source_chunks WHERE source_id = ?1",
                params![source.id],
                |row| row.get(0),
            )
            .unwrap();
        let text: String = conn
            .query_row(
                "SELECT text FROM source_chunks WHERE source_id = ?1 ORDER BY chunk_index LIMIT 1",
                params![source.id],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(count, 1);
        assert_eq!(text, "updated");
    }

    #[test]
    fn insert_point_source_link_persists_chunk_location() {
        let conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "file",
            "D:/docs/source.md",
            Some("source.md"),
            r#"{"kind":"file"}"#,
        )
        .unwrap();
        insert_point(
            &conn,
            "point-1",
            "这是一条来自来源块的观点。",
            None,
            "2026-07-03T00:00:00Z",
        );

        let link =
            insert_point_source_link(&conn, "point-1", &source.id, 2, Some("来源块原文")).unwrap();

        assert_eq!(link.point_id, "point-1");
        assert_eq!(link.source_id, source.id);
        assert_eq!(link.chunk_index, 2);

        let row: (String, i64, String) = conn
            .query_row(
                "SELECT source_id, chunk_index, anchor_text
                 FROM point_source_links
                 WHERE point_id = ?1",
                params!["point-1"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(row, (source.id, 2, "来源块原文".to_string()));
    }

    #[test]
    fn get_point_source_context_returns_source_and_chunks() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "webpage",
            "https://example.com/a",
            Some("Example A"),
            r#"{"kind":"webpage","name":"Example A"}"#,
        )
        .unwrap();
        replace_source_chunks(
            &mut conn,
            &source.id,
            &["alpha".to_string(), "beta".to_string()],
        )
        .unwrap();
        insert_point(
            &conn,
            "point-context",
            "beta summary",
            None,
            "2026-07-03T00:00:00Z",
        );
        insert_point_source_link(&conn, "point-context", &source.id, 1, Some("beta")).unwrap();

        let context = get_point_source_context(&conn, "point-context")
            .unwrap()
            .unwrap();

        assert_eq!(context.point_id, "point-context");
        assert_eq!(context.source.id, source.id);
        assert_eq!(context.chunk_index, 1);
        assert_eq!(context.chunks.len(), 2);
        assert_eq!(context.chunks[1].text, "beta");
    }

    #[test]
    fn source_summary_counts_chunks_points_and_stars() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "file",
            "D:/docs/counts.md",
            Some("counts.md"),
            r#"{"kind":"file"}"#,
        )
        .unwrap();
        replace_source_chunks(
            &mut conn,
            &source.id,
            &["one".to_string(), "two".to_string()],
        )
        .unwrap();
        insert_point(
            &conn,
            "point-a",
            "one summary",
            None,
            "2026-07-03T00:00:00Z",
        );
        insert_point(
            &conn,
            "point-b",
            "two summary",
            None,
            "2026-07-03T00:01:00Z",
        );
        insert_point_source_link(&conn, "point-a", &source.id, 0, None).unwrap();
        insert_point_source_link(&conn, "point-b", &source.id, 1, None).unwrap();
        set_starred(&conn, "point-b", true).unwrap();

        let summary = get_source_workspace_summary(&conn, &source.id)
            .unwrap()
            .unwrap();

        assert_eq!(summary.chunk_count, 2);
        assert_eq!(summary.point_count, 2);
        assert_eq!(summary.star_count, 1);
    }

    #[test]
    fn search_workspace_returns_sources_and_linked_points() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "webpage",
            "https://example.com/productivity",
            Some("Productivity Note"),
            r#"{"kind":"webpage"}"#,
        )
        .unwrap();
        replace_source_chunks(&mut conn, &source.id, &["deep work chunk".to_string()]).unwrap();
        insert_point(
            &conn,
            "point-search",
            "deep work improves focus",
            None,
            "2026-07-03T00:00:00Z",
        );
        insert_point_source_link(&conn, "point-search", &source.id, 0, None).unwrap();

        let results = search_workspace(&conn, "Productivity", 20).unwrap();
        assert!(results
            .iter()
            .any(|result| result.kind == "source" && result.id == source.id));

        let point_results = search_workspace(&conn, "focus", 20).unwrap();
        assert!(point_results.iter().any(|result| {
            result.kind == "point"
                && result.id == "point-search"
                && result.source_id.as_deref() == Some(source.id.as_str())
                && result.chunk_index == Some(0)
        }));
    }

    #[test]
    fn get_source_assets_groups_linked_points_evidence_reports_and_gallery() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "webpage",
            "https://example.com/source-assets",
            Some("Source Assets"),
            r#"{"kind":"webpage"}"#,
        )
        .unwrap();
        replace_source_chunks(&mut conn, &source.id, &["asset chunk".to_string()]).unwrap();
        insert_point(
            &conn,
            "point-source-asset",
            "source asset point",
            None,
            "2026-07-05T00:00:00Z",
        );
        insert_point_source_link(&conn, "point-source-asset", &source.id, 0, None).unwrap();

        let evidence = save_evidence(
            &mut conn,
            evidence_input(
                "source asset evidence",
                Some("point-source-asset"),
                Some(&source.id),
                "2026-07-05T00:01:00Z",
            ),
        )
        .unwrap();

        let mut report = report_input("Source Asset Report", "synthesis", "source-asset");
        report.citations_json = format!(
            r#"[{{"kind":"source","label":"S1","id":"{0}","title":"Source Assets","excerpt":"asset chunk","sourceId":"{0}","chunkIndex":0,"url":"https://example.com/source-assets"}}]"#,
            source.id
        );
        let saved_report = save_report(&conn, report).unwrap();

        insert_gallery_item(
            &conn,
            &GalleryItem {
                id: "gallery-source-asset".to_string(),
                file_path: "D:/gallery/source-asset.webp".to_string(),
                thumbnail_path: "D:/gallery/source-asset-thumb.webp".to_string(),
                prompt: "source asset diagram".to_string(),
                generated_at: "2026-07-05T00:02:00Z".to_string(),
                download_status: "ok".to_string(),
                point_ids: vec!["point-source-asset".to_string()],
                source_points: vec![GallerySourcePoint {
                    id: "point-source-asset".to_string(),
                    content: "source asset point".to_string(),
                    source_doc_name: Some("Source Assets".to_string()),
                }],
            },
        )
        .unwrap();

        let assets = get_source_assets(&conn, &source.id).unwrap().unwrap();

        assert_eq!(assets.source.id, source.id);
        assert_eq!(assets.points.len(), 1);
        assert_eq!(assets.points[0].id, "point-source-asset");
        assert_eq!(assets.evidence.len(), 1);
        assert_eq!(assets.evidence[0].id, evidence.id);
        assert_eq!(assets.reports.len(), 1);
        assert_eq!(assets.reports[0].id, saved_report.id);
        assert_eq!(assets.gallery.len(), 1);
        assert_eq!(assets.gallery[0].id, "gallery-source-asset");
    }

    #[test]
    fn save_evidence_persists_record_and_sources() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "webpage",
            "https://example.com/remote-work",
            Some("Remote Work Study"),
            r#"{"kind":"webpage"}"#,
        )
        .unwrap();
        insert_point(
            &conn,
            "point-evidence",
            "Remote work boosts productivity.",
            None,
            "2026-07-05T00:00:00Z",
        );

        let mut input = evidence_input(
            "  Remote work boosts productivity  ",
            Some("point-evidence"),
            Some(&source.id),
            "2026-07-05T00:10:00Z",
        );
        input.answer = "  Multiple studies support hybrid productivity gains.  ".to_string();
        input.sources[0].url = "  https://example.com/remote-work  ".to_string();
        let saved = save_evidence(&mut conn, input).unwrap();

        assert_eq!(saved.claim, "Remote work boosts productivity");
        assert_eq!(saved.verdict, "supported");
        assert_eq!(
            saved.answer,
            "Multiple studies support hybrid productivity gains."
        );
        assert_eq!(saved.point_id.as_deref(), Some("point-evidence"));
        assert_eq!(saved.source_id.as_deref(), Some(source.id.as_str()));
        assert_eq!(saved.chunk_index, Some(0));
        assert_eq!(saved.checked_at, "2026-07-05T00:10:00Z");
        assert_eq!(saved.sources.len(), 1);
        assert_eq!(saved.sources[0].url, "https://example.com/remote-work");
        assert_eq!(saved.sources[0].stance, "support");

        let fetched = get_evidence(&conn, &saved.id).unwrap().unwrap();
        assert_eq!(fetched.id, saved.id);
        assert_eq!(fetched.sources.len(), 1);
        assert_eq!(fetched.sources[0].evidence_id, saved.id);
    }

    #[test]
    fn list_evidence_for_point_returns_hydrated_sources() {
        let mut conn = memory_db();
        insert_point(
            &conn,
            "point-a",
            "first point",
            None,
            "2026-07-05T00:00:00Z",
        );
        insert_point(
            &conn,
            "point-b",
            "second point",
            None,
            "2026-07-05T00:01:00Z",
        );

        save_evidence(
            &mut conn,
            evidence_input(
                "older evidence",
                Some("point-a"),
                None,
                "2026-07-05T00:02:00Z",
            ),
        )
        .unwrap();
        save_evidence(
            &mut conn,
            evidence_input(
                "newer evidence",
                Some("point-a"),
                None,
                "2026-07-05T00:03:00Z",
            ),
        )
        .unwrap();
        save_evidence(
            &mut conn,
            evidence_input(
                "other point evidence",
                Some("point-b"),
                None,
                "2026-07-05T00:04:00Z",
            ),
        )
        .unwrap();

        let records = list_evidence_for_point(&conn, "point-a").unwrap();

        assert_eq!(records.len(), 2);
        assert_eq!(records[0].claim, "newer evidence");
        assert_eq!(records[1].claim, "older evidence");
        assert_eq!(records[0].sources.len(), 1);
        assert_eq!(records[0].sources[0].stance, "support");
    }

    #[test]
    fn list_evidence_for_source_returns_linked_records() {
        let mut conn = memory_db();
        let source_a = upsert_source_document(
            &conn,
            "file",
            "D:/docs/source-a.md",
            Some("source-a.md"),
            r#"{"kind":"file"}"#,
        )
        .unwrap();
        let source_b = upsert_source_document(
            &conn,
            "file",
            "D:/docs/source-b.md",
            Some("source-b.md"),
            r#"{"kind":"file"}"#,
        )
        .unwrap();

        save_evidence(
            &mut conn,
            evidence_input(
                "source a older",
                None,
                Some(&source_a.id),
                "2026-07-05T00:02:00Z",
            ),
        )
        .unwrap();
        save_evidence(
            &mut conn,
            evidence_input(
                "source a newer",
                None,
                Some(&source_a.id),
                "2026-07-05T00:03:00Z",
            ),
        )
        .unwrap();
        save_evidence(
            &mut conn,
            evidence_input(
                "source b evidence",
                None,
                Some(&source_b.id),
                "2026-07-05T00:04:00Z",
            ),
        )
        .unwrap();

        let records = list_evidence_for_source(&conn, &source_a.id).unwrap();

        assert_eq!(records.len(), 2);
        assert!(records
            .iter()
            .all(|record| record.source_id.as_deref() == Some(source_a.id.as_str())));
        assert_eq!(records[0].claim, "source a newer");
    }

    #[test]
    fn list_recent_evidence_returns_newest_hydrated_records_with_limit() {
        let mut conn = memory_db();

        save_evidence(
            &mut conn,
            evidence_input("oldest evidence", None, None, "2026-07-05T00:01:00Z"),
        )
        .unwrap();
        save_evidence(
            &mut conn,
            evidence_input("newest evidence", None, None, "2026-07-05T00:03:00Z"),
        )
        .unwrap();
        save_evidence(
            &mut conn,
            evidence_input("middle evidence", None, None, "2026-07-05T00:02:00Z"),
        )
        .unwrap();

        let records = list_recent_evidence(&conn, 2).unwrap();

        assert_eq!(records.len(), 2);
        assert_eq!(records[0].claim, "newest evidence");
        assert_eq!(records[1].claim, "middle evidence");
        assert_eq!(records[0].sources.len(), 1);
        assert_eq!(records[0].sources[0].stance, "support");
        assert!(list_recent_evidence(&conn, 0).unwrap().is_empty());
    }

    #[test]
    fn search_evidence_matches_record_and_source_fields() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "webpage",
            "https://example.com/sleep",
            Some("Sleep Study"),
            r#"{"kind":"webpage"}"#,
        )
        .unwrap();

        let mut matching = evidence_input(
            "Sleep improves memory",
            None,
            Some(&source.id),
            "2026-07-05T00:02:00Z",
        );
        matching.answer = "Hippocampus consolidation is supported.".to_string();
        matching.reasoning = Some("Randomized trial synthesis".to_string());
        matching.context = Some("Nightly rest evidence review".to_string());
        matching.sources[0].title = Some("Neuroscience Digest".to_string());
        matching.sources[0].snippet = Some("hippocampus recall data".to_string());
        let saved = save_evidence(&mut conn, matching).unwrap();

        save_evidence(
            &mut conn,
            evidence_input("unrelated claim", None, None, "2026-07-05T00:03:00Z"),
        )
        .unwrap();

        for term in [
            "Sleep improves",
            "consolidation",
            "trial synthesis",
            "Nightly rest",
            "Neuroscience",
            "hippocampus recall",
        ] {
            let results = search_evidence(&conn, term, 10).unwrap();
            assert!(
                results
                    .iter()
                    .any(|record| record.id == saved.id && record.sources.len() == 1),
                "expected search term {term} to return saved evidence"
            );
        }
    }

    #[test]
    fn delete_point_detaches_evidence_without_deleting_it() {
        let mut conn = memory_db();
        insert_point(&conn, "root", "root point", None, "2026-07-05T00:00:00Z");
        insert_point(
            &conn,
            "child",
            "child point",
            Some("root"),
            "2026-07-05T00:01:00Z",
        );

        let saved = save_evidence(
            &mut conn,
            evidence_input(
                "child evidence survives deletion",
                Some("child"),
                None,
                "2026-07-05T00:02:00Z",
            ),
        )
        .unwrap();

        delete_point(&conn, "root").unwrap();

        let fetched = get_evidence(&conn, &saved.id).unwrap().unwrap();
        assert_eq!(fetched.point_id, None);
        assert_eq!(fetched.claim, "child evidence survives deletion");
        assert_eq!(fetched.sources.len(), 1);

        let point_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM points WHERE id IN ('root', 'child')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(point_count, 0);
    }

    #[test]
    fn save_evidence_rejects_invalid_verdict_stance_and_empty_url() {
        let mut conn = memory_db();

        let mut invalid_verdict = evidence_input(
            "invalid verdict evidence",
            None,
            None,
            "2026-07-05T00:00:00Z",
        );
        invalid_verdict.verdict = "likely".to_string();
        assert!(save_evidence(&mut conn, invalid_verdict).is_err());

        let mut invalid_stance = evidence_input(
            "invalid stance evidence",
            None,
            None,
            "2026-07-05T00:01:00Z",
        );
        invalid_stance.sources[0].stance = "maybe".to_string();
        assert!(save_evidence(&mut conn, invalid_stance).is_err());

        let mut empty_url =
            evidence_input("empty url evidence", None, None, "2026-07-05T00:02:00Z");
        empty_url.sources[0].url = "   ".to_string();
        assert!(save_evidence(&mut conn, empty_url).is_err());
    }

    #[test]
    fn save_report_persists_and_reads_structured_citations() {
        let conn = memory_db();
        let mut input = report_input("  Strategy Digest  ", "digest", "digest-1");
        input.summary = "  A concise report summary.  ".to_string();

        let saved = save_report(&conn, input).unwrap();

        assert_eq!(saved.title, "Strategy Digest");
        assert_eq!(saved.kind, "digest");
        assert_eq!(saved.summary, "A concise report summary.");
        assert!(saved.citations_json.contains("\"label\":\"S1\""));

        let fetched = get_report(&conn, &saved.id).unwrap().unwrap();
        assert_eq!(fetched.id, saved.id);
        assert_eq!(fetched.source_name.as_deref(), Some("digest source"));
        assert_eq!(
            fetched.body_md,
            "#   Strategy Digest  \n\nReport body with digest-1"
        );
    }

    #[test]
    fn extract_report_claims_marks_cited_and_inferred_shells() {
        let claims = extract_report_claims(
            "# Report\n\n关键结论成立 [S1].\n延续说明仍属于同一段落 [E2].\n\n- 无引用的后续判断需要复查。\n\n```text\ncode [S1]\n```\n\n### Details\n\n1. 编号列表结论 [P1].",
            &["S1".to_string(), "E2".to_string(), "P1".to_string()],
        );

        assert_eq!(claims.len(), 3);
        assert_eq!(claims[0].claim_status, "cited");
        assert_eq!(claims[0].citation_labels, vec!["S1", "E2"]);
        assert!(claims[0].claim_text.contains("关键结论成立"));
        assert_eq!(claims[1].claim_status, "inferred");
        assert!(claims[1].citation_labels.is_empty());
        assert_eq!(claims[2].claim_status, "cited");
        assert_eq!(claims[2].citation_labels, vec!["P1"]);
        assert!(!claims.iter().any(|claim| claim.claim_text.contains("code")));
    }

    #[test]
    fn report_audit_rows_round_trip_and_summarize_coverage() {
        let conn = memory_db();
        let report = save_report(
            &conn,
            SaveReportInput {
                title: "Audit Round Trip".to_string(),
                kind: "digest".to_string(),
                source_name: Some("Audit".to_string()),
                body_md: "# Audit\n\nCited claim [S1].\n\nInferred claim.".to_string(),
                summary: "Audit summary".to_string(),
                citations_json: "[]".to_string(),
            },
        )
        .unwrap();

        let audit = replace_report_audit_rows(
            &conn,
            &report.id,
            vec![
                SaveReportClaimInput {
                    claim_index: 0,
                    claim_text: "Cited claim [S1].".to_string(),
                    claim_status: "cited".to_string(),
                    citation_labels: vec!["S1".to_string()],
                },
                SaveReportClaimInput {
                    claim_index: 1,
                    claim_text: "Inferred claim.".to_string(),
                    claim_status: "inferred".to_string(),
                    citation_labels: vec![],
                },
            ],
            vec![
                SaveReportCitationInput {
                    citation_index: 0,
                    target_kind: "source".to_string(),
                    target_id: "source-1".to_string(),
                    label: Some("S1".to_string()),
                    title: Some("Source One".to_string()),
                    quote: Some("quoted evidence".to_string()),
                    excerpt: Some("quoted evidence".to_string()),
                    reason: Some("supporting quote".to_string()),
                    source_id: Some("source-1".to_string()),
                    chunk_index: Some(0),
                    source_text_hash: Some("fnv1a64:1111111111111111".to_string()),
                    span_start: Some(2),
                    span_end: Some(17),
                    locator_status: "located".to_string(),
                    match_count: 1,
                },
                SaveReportCitationInput {
                    citation_index: 1,
                    target_kind: "point".to_string(),
                    target_id: "point-1".to_string(),
                    label: Some("P1".to_string()),
                    title: Some("Point One".to_string()),
                    quote: Some("repeat".to_string()),
                    excerpt: None,
                    reason: None,
                    source_id: None,
                    chunk_index: None,
                    source_text_hash: Some("fnv1a64:2222222222222222".to_string()),
                    span_start: Some(0),
                    span_end: Some(6),
                    locator_status: "multiple_matches".to_string(),
                    match_count: 2,
                },
                SaveReportCitationInput {
                    citation_index: 2,
                    target_kind: "evidence".to_string(),
                    target_id: "evidence-1".to_string(),
                    label: Some("E1".to_string()),
                    title: Some("Evidence One".to_string()),
                    quote: Some("missing".to_string()),
                    excerpt: None,
                    reason: None,
                    source_id: None,
                    chunk_index: None,
                    source_text_hash: Some("fnv1a64:3333333333333333".to_string()),
                    span_start: None,
                    span_end: None,
                    locator_status: "not_found".to_string(),
                    match_count: 0,
                },
            ],
        )
        .unwrap();

        assert_eq!(audit.claims.len(), 2);
        assert_eq!(audit.citations.len(), 3);
        assert_eq!(audit.citations[0].label.as_deref(), Some("S1"));
        assert_eq!(audit.citations[0].span_start, Some(2));
        assert_eq!(
            audit.citations[0].reason.as_deref(),
            Some("supporting quote")
        );
        assert_eq!(audit.coverage.total_claims, 2);
        assert_eq!(audit.coverage.cited_claims, 1);
        assert_eq!(audit.coverage.inferred_claims, 1);
        assert_eq!(audit.coverage.total_citations, 3);
        assert_eq!(audit.coverage.located_citations, 1);
        assert_eq!(audit.coverage.warning_citations, 1);
        assert_eq!(audit.coverage.missing_citations, 1);
        assert!((audit.coverage.coverage_ratio - 0.5).abs() < f64::EPSILON);
        assert!(audit
            .coverage
            .warnings
            .iter()
            .any(|warning| warning.contains("inferred")));

        let loaded = load_report_audit(&conn, &report.id).unwrap().unwrap();
        assert_eq!(loaded.claims[0].citation_labels, vec!["S1"]);
        assert_eq!(loaded.citations[1].locator_status, "multiple_matches");

        let legacy = save_report(&conn, report_input("Legacy Report", "digest", "legacy")).unwrap();
        let legacy_audit = load_report_audit(&conn, &legacy.id).unwrap().unwrap();
        assert!(legacy_audit.claims.is_empty());
        assert!(legacy_audit.citations.is_empty());
        assert!(legacy_audit
            .coverage
            .warnings
            .iter()
            .any(|warning| warning.contains("No durable claim")));

        delete_report(&conn, &report.id).unwrap();
        assert!(load_report_audit(&conn, &report.id).unwrap().is_none());
        let claim_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM report_claims WHERE report_id = ?1",
                params![report.id],
                |row| row.get(0),
            )
            .unwrap();
        let citation_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM report_citations WHERE report_id = ?1",
                params![report.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(claim_count, 0);
        assert_eq!(citation_count, 0);
    }

    #[test]
    fn citation_quality_dashboard_aggregates_report_audit_health_read_only() {
        let conn = memory_db();
        let healthy = save_report(
            &conn,
            SaveReportInput {
                title: "Healthy Citation Report".to_string(),
                kind: "investigation".to_string(),
                source_name: Some("Quality".to_string()),
                body_md: "Located claim [S1].".to_string(),
                summary: "All citations located.".to_string(),
                citations_json: "[]".to_string(),
            },
        )
        .unwrap();
        replace_report_audit_rows(
            &conn,
            &healthy.id,
            vec![SaveReportClaimInput {
                claim_index: 0,
                claim_text: "Located claim [S1].".to_string(),
                claim_status: "cited".to_string(),
                citation_labels: vec!["S1".to_string()],
            }],
            vec![SaveReportCitationInput {
                citation_index: 0,
                target_kind: "source".to_string(),
                target_id: "source-ok".to_string(),
                label: Some("S1".to_string()),
                title: Some("Source OK".to_string()),
                quote: Some("located quote".to_string()),
                excerpt: Some("located quote".to_string()),
                reason: Some("direct support".to_string()),
                source_id: Some("source-ok".to_string()),
                chunk_index: Some(0),
                source_text_hash: Some("fnv1a64:aaaaaaaaaaaaaaaa".to_string()),
                span_start: Some(4),
                span_end: Some(17),
                locator_status: "located".to_string(),
                match_count: 1,
            }],
        )
        .unwrap();

        let risky = save_report(
            &conn,
            SaveReportInput {
                title: "Risky Citation Report".to_string(),
                kind: "digest".to_string(),
                source_name: Some("Quality".to_string()),
                body_md: "Cited claim [S2].\n\nInferred claim.\n\nUnsupported claim.".to_string(),
                summary: "Several citations need review.".to_string(),
                citations_json: "[]".to_string(),
            },
        )
        .unwrap();
        replace_report_audit_rows(
            &conn,
            &risky.id,
            vec![
                SaveReportClaimInput {
                    claim_index: 0,
                    claim_text: "Cited claim [S2].".to_string(),
                    claim_status: "cited".to_string(),
                    citation_labels: vec!["S2".to_string()],
                },
                SaveReportClaimInput {
                    claim_index: 1,
                    claim_text: "Inferred claim.".to_string(),
                    claim_status: "inferred".to_string(),
                    citation_labels: Vec::new(),
                },
                SaveReportClaimInput {
                    claim_index: 2,
                    claim_text: "Unsupported claim.".to_string(),
                    claim_status: "unsupported".to_string(),
                    citation_labels: Vec::new(),
                },
            ],
            vec![
                SaveReportCitationInput {
                    citation_index: 0,
                    target_kind: "source".to_string(),
                    target_id: "source-stale".to_string(),
                    label: Some("S2".to_string()),
                    title: Some("Stale Source".to_string()),
                    quote: Some("stale quote".to_string()),
                    excerpt: None,
                    reason: None,
                    source_id: Some("source-stale".to_string()),
                    chunk_index: Some(1),
                    source_text_hash: Some("fnv1a64:bbbbbbbbbbbbbbbb".to_string()),
                    span_start: None,
                    span_end: None,
                    locator_status: "stale".to_string(),
                    match_count: 1,
                },
                SaveReportCitationInput {
                    citation_index: 1,
                    target_kind: "point".to_string(),
                    target_id: "point-ambiguous".to_string(),
                    label: Some("P1".to_string()),
                    title: Some("Ambiguous Point".to_string()),
                    quote: Some("repeat".to_string()),
                    excerpt: None,
                    reason: None,
                    source_id: None,
                    chunk_index: None,
                    source_text_hash: Some("fnv1a64:cccccccccccccccc".to_string()),
                    span_start: Some(0),
                    span_end: Some(6),
                    locator_status: "multiple_matches".to_string(),
                    match_count: 2,
                },
                SaveReportCitationInput {
                    citation_index: 2,
                    target_kind: "evidence".to_string(),
                    target_id: "evidence-not-found".to_string(),
                    label: Some("E1".to_string()),
                    title: Some("Missing Quote Evidence".to_string()),
                    quote: Some("absent quote".to_string()),
                    excerpt: None,
                    reason: Some("quote drifted".to_string()),
                    source_id: None,
                    chunk_index: None,
                    source_text_hash: Some("fnv1a64:dddddddddddddddd".to_string()),
                    span_start: None,
                    span_end: None,
                    locator_status: "not_found".to_string(),
                    match_count: 0,
                },
                SaveReportCitationInput {
                    citation_index: 3,
                    target_kind: "source".to_string(),
                    target_id: "source-missing".to_string(),
                    label: Some("S3".to_string()),
                    title: Some("Missing Source".to_string()),
                    quote: Some("missing target quote".to_string()),
                    excerpt: None,
                    reason: None,
                    source_id: Some("source-missing".to_string()),
                    chunk_index: Some(0),
                    source_text_hash: None,
                    span_start: None,
                    span_end: None,
                    locator_status: "target_missing".to_string(),
                    match_count: 0,
                },
                SaveReportCitationInput {
                    citation_index: 4,
                    target_kind: "source".to_string(),
                    target_id: "source-no-quote".to_string(),
                    label: Some("S4".to_string()),
                    title: Some("No Quote Source".to_string()),
                    quote: None,
                    excerpt: None,
                    reason: None,
                    source_id: Some("source-no-quote".to_string()),
                    chunk_index: Some(0),
                    source_text_hash: None,
                    span_start: None,
                    span_end: None,
                    locator_status: "not_applicable".to_string(),
                    match_count: 0,
                },
            ],
        )
        .unwrap();

        let legacy = save_report(
            &conn,
            report_input("Legacy Citation Report", "synthesis", "cq"),
        )
        .unwrap();
        let before = (
            table_count(&conn, "reports"),
            table_count(&conn, "report_claims"),
            table_count(&conn, "report_citations"),
        );

        let dashboard = build_citation_quality_dashboard(&conn, Some(10)).unwrap();
        let after = (
            table_count(&conn, "reports"),
            table_count(&conn, "report_claims"),
            table_count(&conn, "report_citations"),
        );

        assert_eq!(before, after);
        assert_eq!(dashboard.report_count, 3);
        assert_eq!(dashboard.audited_report_count, 2);
        assert_eq!(dashboard.total_claims, 4);
        assert_eq!(dashboard.cited_claims, 2);
        assert_eq!(dashboard.inferred_claims, 1);
        assert_eq!(dashboard.unsupported_claims, 1);
        assert_eq!(dashboard.total_citations, 6);
        assert_eq!(dashboard.located_citations, 1);
        assert_eq!(dashboard.warning_citations, 3);
        assert_eq!(dashboard.missing_citations, 2);
        assert_eq!(dashboard.stale_citations, 1);
        assert_eq!(dashboard.ambiguous_citations, 1);
        assert_eq!(dashboard.not_found_citations, 1);
        assert_eq!(dashboard.target_missing_citations, 1);
        assert_eq!(dashboard.not_applicable_citations, 1);
        assert!((dashboard.coverage_ratio - 0.5).abs() < f64::EPSILON);
        assert!(dashboard.quality_score > 0.0);
        assert!(dashboard.quality_score < 0.5);
        assert_eq!(dashboard.problem_citations.len(), 5);
        for status in [
            "stale",
            "multiple_matches",
            "not_found",
            "target_missing",
            "not_applicable",
        ] {
            assert!(dashboard
                .problem_citations
                .iter()
                .any(|citation| citation.locator_status == status));
        }
        assert!(dashboard
            .problem_citations
            .iter()
            .any(|citation| citation.report_id == risky.id
                && citation.locator_status == "not_found"
                && citation.reason == "quote drifted"));
        assert!(dashboard
            .reports
            .iter()
            .any(|row| row.report_id == healthy.id && row.severity == "ok"));
        assert!(dashboard
            .reports
            .iter()
            .any(|row| row.report_id == risky.id && row.severity == "critical"));
        assert!(dashboard.reports.iter().any(|row| {
            row.report_id == legacy.id
                && row.severity == "warning"
                && row
                    .warnings
                    .iter()
                    .any(|warning| warning.contains("No durable audit rows"))
        }));
        assert!(dashboard
            .warnings
            .iter()
            .any(|warning| warning.contains("do not have durable audit rows")));
    }

    #[test]
    fn ai_invocation_audit_persists_context_and_links_to_report() {
        let conn = memory_db();
        let invocation = save_ai_invocation(
            &conn,
            SaveAiInvocationInput {
                task_kind: "investigation".to_string(),
                model_profile_id: Some("default".to_string()),
                model_name: Some("gpt-test".to_string()),
                prompt_version: "investigation.v1".to_string(),
                input_query: Some("What changed in the market?".to_string()),
                input_refs_json: r#"{"scope":{"sourceIds":["source-1"]}}"#.to_string(),
                context_manifest_json: r#"{"counts":{"sources":1,"journal":1}}"#.to_string(),
                token_usage_json: Some(r#"{"input":100,"output":40}"#.to_string()),
                warnings_json: r#"["Journal entries were included as recall clues."]"#.to_string(),
            },
        )
        .unwrap();

        let items = save_investigation_context_items(
            &conn,
            vec![
                SaveInvestigationContextItemInput {
                    invocation_id: invocation.id.clone(),
                    target_kind: "source".to_string(),
                    target_id: "source-1".to_string(),
                    label: Some("S1".to_string()),
                    role: "source".to_string(),
                    included: true,
                    truncated: false,
                    reason: Some("Explicit source scope".to_string()),
                    char_count: Some(120),
                    source_text_hash: Some(stable_text_hash("source text")),
                },
                SaveInvestigationContextItemInput {
                    invocation_id: invocation.id.clone(),
                    target_kind: "journal".to_string(),
                    target_id: "journal-1".to_string(),
                    label: Some("J1".to_string()),
                    role: "journal_recall".to_string(),
                    included: true,
                    truncated: true,
                    reason: Some("Recall clue".to_string()),
                    char_count: Some(420),
                    source_text_hash: Some(stable_text_hash("journal text")),
                },
            ],
        )
        .unwrap();
        assert_eq!(items.len(), 2);

        let report = save_report(
            &conn,
            report_input("Investigation Audit", "investigation", "audit"),
        )
        .unwrap();
        link_ai_invocation_output(&conn, &invocation.id, "report", &report.id).unwrap();

        let audit = load_report_invocation_audit(&conn, &report.id)
            .unwrap()
            .unwrap();
        assert_eq!(audit.invocation.id, invocation.id);
        assert_eq!(audit.invocation.model_name.as_deref(), Some("gpt-test"));
        assert_eq!(audit.invocation.prompt_version, "investigation.v1");
        assert_eq!(audit.total, 2);
        assert_eq!(audit.included_count, 2);
        assert_eq!(audit.truncated_count, 1);
        assert_eq!(audit.context_items[0].role, "source");
        assert_eq!(audit.context_items[1].role, "journal_recall");
        assert_eq!(
            audit.context_items[1].source_text_hash.as_deref(),
            Some(stable_text_hash("journal text").as_str())
        );
        assert!(load_report_invocation_audit(&conn, "missing-report")
            .unwrap()
            .is_none());
    }

    #[test]
    fn list_recent_reports_returns_newest_with_limit() {
        let conn = memory_db();

        let first = save_report(&conn, report_input("First Report", "digest", "first")).unwrap();
        let second =
            save_report(&conn, report_input("Second Report", "synthesis", "second")).unwrap();
        let third = save_report(&conn, report_input("Third Report", "digest", "third")).unwrap();

        conn.execute(
            "UPDATE reports SET created_at = ?1 WHERE id = ?2",
            params!["2026-07-05T00:01:00Z", first.id],
        )
        .unwrap();
        conn.execute(
            "UPDATE reports SET created_at = ?1 WHERE id = ?2",
            params!["2026-07-05T00:03:00Z", second.id],
        )
        .unwrap();
        conn.execute(
            "UPDATE reports SET created_at = ?1 WHERE id = ?2",
            params!["2026-07-05T00:02:00Z", third.id],
        )
        .unwrap();

        let reports = list_recent_reports(&conn, 2).unwrap();

        assert_eq!(reports.len(), 2);
        assert_eq!(reports[0].title, "Second Report");
        assert_eq!(reports[1].title, "Third Report");
        assert!(list_recent_reports(&conn, 0).unwrap().is_empty());
    }

    #[test]
    fn search_reports_matches_body_summary_and_citations() {
        let conn = memory_db();
        let saved =
            save_report(&conn, report_input("Market Report", "synthesis", "alpha")).unwrap();
        save_report(&conn, report_input("Unrelated Report", "digest", "beta")).unwrap();

        for term in [
            "Market",
            "synthesis source",
            "Report body",
            "Source alpha",
            "https://example.com/alpha",
        ] {
            let reports = search_reports(&conn, term, 10).unwrap();
            assert!(
                reports.iter().any(|report| report.id == saved.id),
                "expected search term {term} to return saved report"
            );
        }
    }

    #[test]
    fn save_report_rejects_invalid_kind_blank_body_and_invalid_citations() {
        let conn = memory_db();

        let invalid_kind = report_input("Invalid Kind", "memo", "invalid-kind");
        assert!(save_report(&conn, invalid_kind).is_err());

        let mut blank_body = report_input("Blank Body", "digest", "blank-body");
        blank_body.body_md = "   ".to_string();
        assert!(save_report(&conn, blank_body).is_err());

        let mut invalid_json = report_input("Invalid JSON", "digest", "invalid-json");
        invalid_json.citations_json = "{not-json".to_string();
        assert!(save_report(&conn, invalid_json).is_err());

        let mut non_array_json = report_input("Non Array JSON", "digest", "non-array");
        non_array_json.citations_json = r#"{"kind":"source"}"#.to_string();
        assert!(save_report(&conn, non_array_json).is_err());
    }

    #[test]
    fn delete_report_removes_report_from_reads_lists_and_search() {
        let conn = memory_db();
        let saved = save_report(&conn, report_input("Delete Me", "digest", "delete-me")).unwrap();
        let kept = save_report(&conn, report_input("Keep Me", "synthesis", "keep-me")).unwrap();

        delete_report(&conn, &saved.id).unwrap();
        delete_report(&conn, "   ").unwrap();
        delete_report(&conn, "missing-report").unwrap();

        assert!(get_report(&conn, &saved.id).unwrap().is_none());

        let recent = list_recent_reports(&conn, 10).unwrap();
        assert!(!recent.iter().any(|report| report.id == saved.id));
        assert!(recent.iter().any(|report| report.id == kept.id));

        let search = search_reports(&conn, "Delete Me", 10).unwrap();
        assert!(search.is_empty());
    }

    #[test]
    fn report_kind_accepts_investigation() {
        let conn = memory_db();
        let saved = save_report(
            &conn,
            report_input("Investigation", "investigation", "investigation"),
        )
        .unwrap();

        assert_eq!(saved.kind, "investigation");
        assert!(search_reports(&conn, "investigation", 10)
            .unwrap()
            .iter()
            .any(|report| report.id == saved.id));
    }

    #[test]
    fn search_assets_eval_fixture_tracks_hit_at_1_and_hit_at_k() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "file",
            "D:/eval/alpha-source-anchor.md",
            Some("Alpha Source Anchor"),
            r#"{"topic":"alpha-source-anchor"}"#,
        )
        .unwrap();
        replace_source_chunks(
            &mut conn,
            &source.id,
            &["Body text for the Alpha Source Anchor fixture.".to_string()],
        )
        .unwrap();
        insert_point(
            &conn,
            "point-eval-delta",
            "delta-point-insight quantizes local research salience",
            None,
            "2026-07-08T00:00:00Z",
        );
        let report = save_report(
            &conn,
            report_input(
                "Market Rotation Report",
                "investigation",
                "market-rotation-report",
            ),
        )
        .unwrap();
        let journal = save_journal_entry(
            &conn,
            SaveJournalEntryInput {
                query: "pricing-power-journal".to_string(),
                note: "Journal note for durable moat tracking.".to_string(),
                tags: vec!["pricing-power-journal".to_string()],
                source_ids: vec![source.id.clone()],
                point_ids: vec!["point-eval-delta".to_string()],
                evidence_ids: Vec::new(),
                report_ids: vec![report.id.clone()],
                created_report_id: Some(report.id.clone()),
                source_kind: "investigation".to_string(),
            },
        )
        .unwrap();
        let folder = add_indexed_folder(&conn, "D:/Eval Notes").unwrap();
        let indexed = upsert_indexed_file(
            &conn,
            UpsertIndexedFileInput {
                folder_id: folder.id.clone(),
                path: "D:/Eval Notes/semantic-map-needle.md".to_string(),
                canonical_path: Some("D:/Eval Notes/semantic-map-needle.md".to_string()),
                name: "semantic-map-needle.md".to_string(),
                extension: Some("md".to_string()),
                size_bytes: Some(512),
                modified_at: Some("2026-07-08T00:05:00Z".to_string()),
                source_id: Some(source.id.clone()),
                descriptor_kind: "markdown".to_string(),
                read_status: "ok".to_string(),
                index_status: "indexed".to_string(),
                metadata_json: r#"{"kind":"indexed_file","eval":"round-01"}"#.to_string(),
                preview_text: Some("semantic-map-needle marks local graph context.".to_string()),
                text_hash: Some("fnv1a64:search-eval".to_string()),
                extracted_chars: Some(48),
                total_chars: Some(48),
                last_error: None,
            },
        )
        .unwrap();

        let outcomes = run_search_eval(
            &conn,
            vec![
                SearchEvalCase {
                    query: "alpha-source-anchor",
                    expected_kind: "source",
                    expected_id: source.id.clone(),
                    hit_k: 5,
                    reason: "source title/metadata should be discoverable through unified search",
                },
                SearchEvalCase {
                    query: "delta-point-insight",
                    expected_kind: "point",
                    expected_id: "point-eval-delta".to_string(),
                    hit_k: 5,
                    reason: "point content should remain searchable via workspace search",
                },
                SearchEvalCase {
                    query: "Market Rotation Report",
                    expected_kind: "report",
                    expected_id: report.id.clone(),
                    hit_k: 5,
                    reason: "report title/body/citation fields should join the unified stream",
                },
                SearchEvalCase {
                    query: "pricing-power-journal",
                    expected_kind: "journal",
                    expected_id: journal.id.clone(),
                    hit_k: 5,
                    reason: "journal query/tags should be retrievable for memory workflows",
                },
                SearchEvalCase {
                    query: "semantic-map-needle",
                    expected_kind: "indexed_file",
                    expected_id: indexed.id.clone(),
                    hit_k: 5,
                    reason: "indexed folder metadata and preview should feed unified search",
                },
            ],
        );
        let summary = search_eval_summary(&outcomes);

        assert!(
            outcomes.iter().all(|outcome| outcome.hit_at_k),
            "search eval hit@k regression:\n{summary}"
        );
        assert!(
            outcomes.iter().filter(|outcome| outcome.hit_at_1).count() >= 4,
            "search eval hit@1 regression:\n{summary}"
        );
        assert!(summary.contains("pricing-power-journal"));
        assert!(summary.contains("semantic-map-needle"));
    }

    #[test]
    fn build_retrieval_context_returns_agent_safe_read_only_manifest() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "file",
            "D:/eval/round-two-agent.md",
            Some("round-two-agent source"),
            r#"{"topic":"round-two-agent"}"#,
        )
        .unwrap();
        replace_source_chunks(
            &mut conn,
            &source.id,
            &["round-two-agent source text should not be written into a new table.".to_string()],
        )
        .unwrap();
        insert_point(
            &conn,
            "point-round-two-agent",
            "round-two-agent point context for retrieval",
            None,
            "2026-07-08T00:10:00Z",
        );
        let report = save_report(
            &conn,
            report_input("round-two-agent report", "investigation", "round-two-agent"),
        )
        .unwrap();
        save_journal_entry(
            &conn,
            SaveJournalEntryInput {
                query: "round-two-agent journal".to_string(),
                note: "round-two-agent memory note".to_string(),
                tags: vec!["round-two-agent".to_string()],
                source_ids: vec![source.id.clone()],
                point_ids: vec!["point-round-two-agent".to_string()],
                evidence_ids: Vec::new(),
                report_ids: vec![report.id.clone()],
                created_report_id: Some(report.id.clone()),
                source_kind: "investigation".to_string(),
            },
        )
        .unwrap();
        let folder = add_indexed_folder(&conn, "D:/Agent Eval Notes").unwrap();
        let indexed = upsert_indexed_file(
            &conn,
            UpsertIndexedFileInput {
                folder_id: folder.id,
                path: "D:/Agent Eval Notes/round-two-agent.md".to_string(),
                canonical_path: Some("D:/Agent Eval Notes/round-two-agent.md".to_string()),
                name: "round-two-agent.md".to_string(),
                extension: Some("md".to_string()),
                size_bytes: Some(256),
                modified_at: Some("2026-07-08T00:11:00Z".to_string()),
                source_id: Some(source.id.clone()),
                descriptor_kind: "markdown".to_string(),
                read_status: "ok".to_string(),
                index_status: "indexed".to_string(),
                metadata_json: r#"{"kind":"indexed_file","eval":"round-02"}"#.to_string(),
                preview_text: Some("round-two-agent indexed preview".to_string()),
                text_hash: Some("fnv1a64:round-two-agent".to_string()),
                extracted_chars: Some(31),
                total_chars: Some(31),
                last_error: None,
            },
        )
        .unwrap();
        let before = retrieval_context_counts(&conn);

        let context = build_retrieval_context(
            &conn,
            RetrievalContextInput {
                query: "round-two-agent".to_string(),
                kinds: None,
                filter: None,
                limit: Some(5),
                max_chars_per_item: Some(120),
            },
        )
        .unwrap();
        let after = retrieval_context_counts(&conn);

        assert_eq!(before, after);
        assert_eq!(context.query, "round-two-agent");
        assert_eq!(context.item_count, 5);
        assert_eq!(context.items.len(), 5);
        assert!(context.total_chars > 0);
        assert!(context
            .items
            .iter()
            .enumerate()
            .all(|(index, item)| item.index == index as i64 + 1
                && !item.excerpt.is_empty()
                && item.excerpt.chars().count() <= 120
                && !item.reason.is_empty()));
        assert!(context
            .items
            .iter()
            .any(|item| item.kind == "source" && item.id == source.id));
        assert!(context
            .items
            .iter()
            .any(|item| item.kind == "point" && item.id == "point-round-two-agent"));
        assert!(context
            .items
            .iter()
            .any(|item| item.kind == "indexed_file" && item.id == indexed.id));
        assert!(context
            .warnings
            .contains(&"retrieval result set reached the configured limit".to_string()));
    }

    #[test]
    fn suggest_backlinks_finds_unlinked_mentions_without_persisting_relations() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "file",
            "D:/eval/round-three-anchor.md",
            Some("Round Three Anchor"),
            r#"{"topic":"round-three-anchor"}"#,
        )
        .unwrap();
        replace_source_chunks(
            &mut conn,
            &source.id,
            &["Round Three Anchor is the target asset for backlink suggestions.".to_string()],
        )
        .unwrap();
        let report = save_report(
            &conn,
            SaveReportInput {
                title: "Unlinked Backlink Report".to_string(),
                kind: "investigation".to_string(),
                source_name: Some("round-three".to_string()),
                body_md: "This report references Round Three Anchor without a saved relation."
                    .to_string(),
                summary: "Round Three Anchor appears as an unlinked mention.".to_string(),
                citations_json: "[]".to_string(),
            },
        )
        .unwrap();
        let journal = save_journal_entry(
            &conn,
            SaveJournalEntryInput {
                query: "Backlink inbox".to_string(),
                note: "Follow up on Round Three Anchor and connect it to current research."
                    .to_string(),
                tags: vec!["round-three-anchor".to_string()],
                source_ids: Vec::new(),
                point_ids: Vec::new(),
                evidence_ids: Vec::new(),
                report_ids: Vec::new(),
                created_report_id: None,
                source_kind: "manual".to_string(),
            },
        )
        .unwrap();
        insert_point(
            &conn,
            "point-existing-backlink",
            "Round Three Anchor is already linked through a stored relation.",
            None,
            "2026-07-08T00:30:00Z",
        );
        save_asset_relation(
            &conn,
            SaveAssetRelationInput {
                from_kind: "point".to_string(),
                from_id: "point-existing-backlink".to_string(),
                to_kind: "source".to_string(),
                to_id: source.id.clone(),
                relation: "same_topic".to_string(),
                reason: "existing vetted relation".to_string(),
                score: 0.72,
                source_kind: "manual".to_string(),
            },
        )
        .unwrap();

        let before_counts = retrieval_context_counts(&conn);
        let before_relations = table_count(&conn, "asset_relations");
        let suggestions = suggest_backlinks(
            &conn,
            BacklinkSuggestionInput {
                kind: "source".to_string(),
                id: source.id.clone(),
                limit: Some(10),
            },
        )
        .unwrap();
        let after_counts = retrieval_context_counts(&conn);
        let after_relations = table_count(&conn, "asset_relations");

        assert_eq!(before_counts, after_counts);
        assert_eq!(before_relations, after_relations);
        assert!(suggestions.iter().any(|suggestion| {
            suggestion.candidate_kind == "report"
                && suggestion.candidate_id == report.id
                && suggestion.relation == "same_topic"
                && !suggestion.existing_relation
                && suggestion.reason.contains("Unlinked mention candidate")
        }));
        assert!(suggestions.iter().any(|suggestion| {
            suggestion.candidate_kind == "journal" && suggestion.candidate_id == journal.id
        }));
        assert!(!suggestions.iter().any(|suggestion| {
            suggestion.candidate_kind == "point"
                && suggestion.candidate_id == "point-existing-backlink"
        }));
        assert!(suggestions
            .iter()
            .all(|suggestion| suggestion.target_kind == "source"
                && suggestion.target_id == source.id
                && !suggestion.candidate_excerpt.is_empty()
                && suggestion.score > 0.0));
    }

    #[test]
    fn saved_asset_searches_preview_dynamic_collections_read_only() {
        let conn = memory_db();
        let saved = save_asset_search(
            &conn,
            SaveAssetSearchInput {
                name: "Round Five Investigations".to_string(),
                query: "Round Five Dynamic".to_string(),
                kinds: Some(vec!["report".to_string(), "unknown".to_string()]),
                filter: Some(r#"reportKind == "investigation""#.to_string()),
                limit: Some(5),
            },
        )
        .unwrap();
        assert_eq!(saved.name, "Round Five Investigations");
        assert_eq!(saved.kinds, vec!["report"]);
        assert_eq!(
            saved.filter.as_deref(),
            Some(r#"reportKind == "investigation""#)
        );
        assert_eq!(saved.limit, 5);
        assert_eq!(table_count(&conn, "saved_asset_searches"), 1);

        let empty_preview = preview_saved_asset_search(&conn, &saved.id, None)
            .unwrap()
            .unwrap();
        assert_eq!(empty_preview.result_count, 0);
        assert!(empty_preview
            .warnings
            .contains(&"saved search preview returned no matches".to_string()));

        let investigation = save_report(
            &conn,
            report_input(
                "Round Five Dynamic Investigation",
                "investigation",
                "round-five-dynamic",
            ),
        )
        .unwrap();
        let digest = save_report(
            &conn,
            report_input("Round Five Dynamic Digest", "digest", "round-five-dynamic"),
        )
        .unwrap();
        let before_preview = (
            table_count(&conn, "saved_asset_searches"),
            table_count(&conn, "reports"),
        );
        let preview = preview_saved_asset_search(&conn, &saved.id, None)
            .unwrap()
            .unwrap();
        let after_preview = (
            table_count(&conn, "saved_asset_searches"),
            table_count(&conn, "reports"),
        );

        assert_eq!(before_preview, after_preview);
        assert_eq!(preview.result_count, 1);
        assert_eq!(preview.results[0].kind, "report");
        assert_eq!(preview.results[0].id, investigation.id);
        assert!(!preview.results.iter().any(|result| result.id == digest.id));

        let updated = save_asset_search(
            &conn,
            SaveAssetSearchInput {
                name: "Round Five Investigations".to_string(),
                query: "Round Five Dynamic".to_string(),
                kinds: None,
                filter: Some(r#"kind == "report""#.to_string()),
                limit: Some(1),
            },
        )
        .unwrap();
        assert_eq!(updated.id, saved.id);
        assert!(updated.kinds.is_empty());
        assert_eq!(updated.filter.as_deref(), Some(r#"kind == "report""#));
        assert_eq!(table_count(&conn, "saved_asset_searches"), 1);
        let listed = list_saved_asset_searches(&conn).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, saved.id);

        let limited_preview = preview_saved_asset_search(&conn, &saved.id, None)
            .unwrap()
            .unwrap();
        assert_eq!(limited_preview.result_count, 1);
        assert!(limited_preview
            .warnings
            .contains(&"saved search preview reached the configured limit".to_string()));

        let invalid = save_asset_search(
            &conn,
            SaveAssetSearchInput {
                name: "Broken Filter".to_string(),
                query: "Round Five".to_string(),
                kinds: Some(vec!["source".to_string()]),
                filter: Some(r#"kind == "report""#.to_string()),
                limit: None,
            },
        )
        .unwrap_err();
        assert!(invalid
            .to_string()
            .contains("saved search kinds conflict with the saved filter"));

        delete_saved_asset_search(&conn, &saved.id).unwrap();
        assert!(preview_saved_asset_search(&conn, &saved.id, None)
            .unwrap()
            .is_none());
    }

    #[test]
    fn retrieval_profiles_save_list_preview_saved_search_scope_read_only() {
        let conn = memory_db();
        let saved = save_asset_search(
            &conn,
            SaveAssetSearchInput {
                name: "Round Twelve Investigation Search".to_string(),
                query: "Round Twelve Profile".to_string(),
                kinds: Some(vec!["report".to_string()]),
                filter: Some(r#"reportKind == "investigation""#.to_string()),
                limit: Some(5),
            },
        )
        .unwrap();

        let profile = save_retrieval_profile(
            &conn,
            SaveRetrievalProfileInput {
                name: "Round Twelve Investigation Profile".to_string(),
                description: Some("AnythingLLM-style workspace retrieval scope".to_string()),
                query: "   ".to_string(),
                kinds: None,
                filter: None,
                saved_search_id: Some(saved.id.clone()),
                limit: Some(5),
                max_chars_per_item: Some(120),
                min_score: Some(0.85),
                mode: Some("query".to_string()),
            },
        )
        .unwrap();
        assert_eq!(profile.name, "Round Twelve Investigation Profile");
        assert_eq!(profile.query, "");
        assert_eq!(profile.saved_search_id.as_deref(), Some(saved.id.as_str()));
        assert_eq!(profile.limit, 5);
        assert_eq!(profile.max_chars_per_item, 120);
        assert_eq!(profile.min_score, 0.85);
        assert_eq!(profile.mode, "query");

        let source = upsert_source_document(
            &conn,
            "file",
            "D:/eval/round-twelve-profile.md",
            Some("Round Twelve Profile Source"),
            r#"{"round":"twelve"}"#,
        )
        .unwrap();
        let investigation = save_report(
            &conn,
            report_input(
                "Round Twelve Profile Investigation",
                "investigation",
                "round-twelve-profile",
            ),
        )
        .unwrap();
        let digest = save_report(
            &conn,
            report_input(
                "Round Twelve Profile Digest",
                "digest",
                "round-twelve-profile",
            ),
        )
        .unwrap();

        let before_preview = (
            table_count(&conn, "retrieval_profiles"),
            table_count(&conn, "saved_asset_searches"),
            table_count(&conn, "source_documents"),
            table_count(&conn, "reports"),
        );
        let preview = preview_retrieval_profile(
            &conn,
            PreviewRetrievalProfileInput {
                id: profile.id.clone(),
                query_override: None,
                limit: None,
                max_chars_per_item: None,
            },
        )
        .unwrap()
        .unwrap();
        let after_preview = (
            table_count(&conn, "retrieval_profiles"),
            table_count(&conn, "saved_asset_searches"),
            table_count(&conn, "source_documents"),
            table_count(&conn, "reports"),
        );

        assert_eq!(before_preview, after_preview);
        assert_eq!(preview.effective_query, "Round Twelve Profile");
        assert_eq!(preview.effective_kinds, vec!["report"]);
        assert_eq!(
            preview.effective_filter.as_deref(),
            Some(r#"reportKind == "investigation""#)
        );
        assert_eq!(preview.min_score, 0.85);
        assert_eq!(
            preview
                .saved_search
                .as_ref()
                .map(|search| search.id.as_str()),
            Some(saved.id.as_str())
        );
        assert_eq!(preview.context.item_count, 1);
        assert_eq!(preview.context.items[0].kind, "report");
        assert_eq!(preview.context.items[0].id, investigation.id);
        assert!(!preview
            .context
            .items
            .iter()
            .any(|item| item.id == digest.id || item.id == source.id));
        assert!(preview
            .warnings
            .contains(&"profile scope includes a saved search definition.".to_string()));

        let listed = list_retrieval_profiles(&conn).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id.as_str(), profile.id.as_str());

        let updated = save_retrieval_profile(
            &conn,
            SaveRetrievalProfileInput {
                name: "Round Twelve Investigation Profile".to_string(),
                description: None,
                query: "Round Twelve Profile Source".to_string(),
                kinds: Some(vec!["source".to_string()]),
                filter: None,
                saved_search_id: None,
                limit: Some(30),
                max_chars_per_item: Some(8_000),
                min_score: Some(2.0),
                mode: Some("chat".to_string()),
            },
        )
        .unwrap();
        assert_eq!(updated.id.as_str(), profile.id.as_str());
        assert_eq!(updated.query, "Round Twelve Profile Source");
        assert_eq!(updated.kinds, vec!["source"]);
        assert_eq!(updated.limit, 20);
        assert_eq!(updated.max_chars_per_item, 2_000);
        assert_eq!(updated.min_score, 1.0);
        assert_eq!(updated.mode, "chat");
        assert_eq!(table_count(&conn, "retrieval_profiles"), 1);

        let invalid = save_retrieval_profile(
            &conn,
            SaveRetrievalProfileInput {
                name: "Broken Retrieval Profile".to_string(),
                description: None,
                query: "Round Twelve".to_string(),
                kinds: Some(vec!["source".to_string()]),
                filter: Some(r#"kind == "report""#.to_string()),
                saved_search_id: None,
                limit: None,
                max_chars_per_item: None,
                min_score: None,
                mode: None,
            },
        )
        .unwrap_err();
        assert!(invalid
            .to_string()
            .contains("retrieval profile kinds conflict with the effective filter"));

        delete_retrieval_profile(&conn, &profile.id).unwrap();
        assert_eq!(table_count(&conn, "retrieval_profiles"), 0);
        assert!(preview_retrieval_profile(
            &conn,
            PreviewRetrievalProfileInput {
                id: profile.id.clone(),
                query_override: None,
                limit: None,
                max_chars_per_item: None,
            },
        )
        .unwrap()
        .is_none());
    }

    #[test]
    fn quick_capture_inbox_resolves_to_journal_point_and_source_transactionally() {
        let mut conn = memory_db();

        let blank = save_quick_capture(
            &conn,
            SaveQuickCaptureInput {
                content: "   ".to_string(),
                tags: Vec::new(),
                source_kind: None,
            },
        )
        .unwrap_err();
        assert!(blank
            .to_string()
            .contains("quick capture content is required"));

        let capture = save_quick_capture(
            &conn,
            SaveQuickCaptureInput {
                content: "Round Six inbox memo should become a journal entry.".to_string(),
                tags: vec!["round-six".to_string(), "inbox".to_string()],
                source_kind: None,
            },
        )
        .unwrap();
        assert_eq!(capture.status, "inbox");
        assert_eq!(capture.source_kind, "manual");
        assert_eq!(capture.tags, vec!["round-six", "inbox"]);

        let second = save_quick_capture(
            &conn,
            SaveQuickCaptureInput {
                content: "Round Six second memo should stay in the inbox.".to_string(),
                tags: vec!["clipboard".to_string()],
                source_kind: Some("clipboard".to_string()),
            },
        )
        .unwrap();
        let before_list_counts = (
            table_count(&conn, "quick_capture_items"),
            table_count(&conn, "journal_entries"),
            table_count(&conn, "points"),
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
        );
        let inbox = list_quick_captures(&conn, Some("inbox"), Some(10)).unwrap();
        let after_list_counts = (
            table_count(&conn, "quick_capture_items"),
            table_count(&conn, "journal_entries"),
            table_count(&conn, "points"),
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
        );
        assert_eq!(before_list_counts, after_list_counts);
        assert_eq!(inbox.len(), 2);
        assert!(inbox.iter().any(|item| item.id == capture.id));
        assert!(inbox.iter().any(|item| {
            item.id == second.id && item.source_kind == "clipboard" && item.status == "inbox"
        }));

        let journal_resolution = resolve_quick_capture(
            &mut conn,
            ResolveQuickCaptureInput {
                id: capture.id.clone(),
                target_kind: "journal".to_string(),
                title: Some("Round Six Capture Journal".to_string()),
                query: Some("Round Six query".to_string()),
                parent_id: None,
            },
        )
        .unwrap()
        .unwrap();
        assert_eq!(journal_resolution.item.status, "resolved");
        assert_eq!(
            journal_resolution.item.resolved_kind.as_deref(),
            Some("journal")
        );
        let journal = journal_resolution.journal.unwrap();
        assert_eq!(journal.query, "Round Six query");
        assert_eq!(
            journal.note,
            "Round Six inbox memo should become a journal entry."
        );
        assert_eq!(journal.source_kind, "quick_capture");
        assert_eq!(
            journal_resolution.item.resolved_id.as_deref(),
            Some(journal.id.as_str())
        );
        assert!(journal_resolution.point.is_none());
        assert!(journal_resolution.source.is_none());

        let repeat = resolve_quick_capture(
            &mut conn,
            ResolveQuickCaptureInput {
                id: capture.id.clone(),
                target_kind: "journal".to_string(),
                title: None,
                query: None,
                parent_id: None,
            },
        )
        .unwrap_err();
        assert!(repeat.to_string().contains("quick capture is not in inbox"));

        let point_capture = save_quick_capture(
            &conn,
            SaveQuickCaptureInput {
                content: "Round Six point-worthy thought.".to_string(),
                tags: vec!["point".to_string()],
                source_kind: Some("shortcut".to_string()),
            },
        )
        .unwrap();
        let point_resolution = resolve_quick_capture(
            &mut conn,
            ResolveQuickCaptureInput {
                id: point_capture.id.clone(),
                target_kind: "point".to_string(),
                title: None,
                query: None,
                parent_id: Some("parent-point".to_string()),
            },
        )
        .unwrap()
        .unwrap();
        let point = point_resolution.point.unwrap();
        assert_eq!(point.content, "Round Six point-worthy thought.");
        assert_eq!(point.tag_type.as_deref(), Some("quick_capture"));
        assert_eq!(point.parent_id.as_deref(), Some("parent-point"));
        assert_eq!(
            point_resolution.item.resolved_kind.as_deref(),
            Some("point")
        );
        assert_eq!(
            point_resolution.item.resolved_id.as_deref(),
            Some(point.id.as_str())
        );

        let source_capture = save_quick_capture(
            &conn,
            SaveQuickCaptureInput {
                content: "Round Six source material with enough detail to index.".to_string(),
                tags: vec!["source".to_string()],
                source_kind: Some("paste".to_string()),
            },
        )
        .unwrap();
        let source_resolution = resolve_quick_capture(
            &mut conn,
            ResolveQuickCaptureInput {
                id: source_capture.id.clone(),
                target_kind: "source".to_string(),
                title: Some("Round Six Capture Source".to_string()),
                query: None,
                parent_id: None,
            },
        )
        .unwrap()
        .unwrap();
        let source = source_resolution.source.unwrap();
        assert_eq!(source.kind, "quick_capture");
        assert_eq!(source.title.as_deref(), Some("Round Six Capture Source"));
        assert_eq!(
            source.canonical_uri,
            format!("quick-capture://{}", source_capture.id)
        );
        assert_eq!(
            source_resolution.item.resolved_kind.as_deref(),
            Some("source")
        );
        assert_eq!(
            source_resolution.item.resolved_id.as_deref(),
            Some(source.id.as_str())
        );
        let source_chunk_text: String = conn
            .query_row(
                "SELECT text FROM source_chunks WHERE source_id = ?1 AND chunk_index = 0",
                params![source.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            source_chunk_text,
            "Round Six source material with enough detail to index."
        );

        let dismiss_capture = save_quick_capture(
            &conn,
            SaveQuickCaptureInput {
                content: "Round Six dismissed memo should remain queryable.".to_string(),
                tags: Vec::new(),
                source_kind: None,
            },
        )
        .unwrap();
        let dismissed = dismiss_quick_capture(&conn, &dismiss_capture.id)
            .unwrap()
            .unwrap();
        assert_eq!(dismissed.status, "dismissed");
        assert_eq!(
            dismissed.content,
            "Round Six dismissed memo should remain queryable."
        );
        assert!(list_quick_captures(&conn, Some("dismissed"), Some(10))
            .unwrap()
            .iter()
            .any(|item| item.id == dismiss_capture.id));
        let dismissed_resolve = resolve_quick_capture(
            &mut conn,
            ResolveQuickCaptureInput {
                id: dismiss_capture.id.clone(),
                target_kind: "source".to_string(),
                title: None,
                query: None,
                parent_id: None,
            },
        )
        .unwrap_err();
        assert!(dismissed_resolve
            .to_string()
            .contains("quick capture is not in inbox"));

        let invalid_capture = save_quick_capture(
            &conn,
            SaveQuickCaptureInput {
                content: "Round Six invalid target should remain inbox.".to_string(),
                tags: Vec::new(),
                source_kind: None,
            },
        )
        .unwrap();
        let before_invalid_counts = (
            table_count(&conn, "quick_capture_items"),
            table_count(&conn, "journal_entries"),
            table_count(&conn, "points"),
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
        );
        let invalid = resolve_quick_capture(
            &mut conn,
            ResolveQuickCaptureInput {
                id: invalid_capture.id.clone(),
                target_kind: "report".to_string(),
                title: None,
                query: None,
                parent_id: None,
            },
        )
        .unwrap_err();
        let after_invalid_counts = (
            table_count(&conn, "quick_capture_items"),
            table_count(&conn, "journal_entries"),
            table_count(&conn, "points"),
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
        );
        assert!(invalid
            .to_string()
            .contains("invalid quick capture target kind"));
        assert_eq!(before_invalid_counts, after_invalid_counts);
        assert!(list_quick_captures(&conn, Some("inbox"), Some(10))
            .unwrap()
            .iter()
            .any(|item| item.id == invalid_capture.id));
    }

    #[test]
    fn report_starter_templates_build_read_only_drafts_with_context_citations() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "file",
            "D:/round-seven/source.md",
            Some("Round Seven Source"),
            r#"{"round":7}"#,
        )
        .unwrap();
        replace_source_chunks(
            &mut conn,
            &source.id,
            &["Round Seven source context should appear in the starter draft.".to_string()],
        )
        .unwrap();
        insert_point(
            &conn,
            "round-seven-point",
            "Round Seven point context should be cited in the starter.",
            None,
            "2026-07-09T00:00:00Z",
        );
        let evidence = save_evidence(
            &mut conn,
            SaveEvidenceInput {
                claim: "Round Seven evidence claim".to_string(),
                verdict: "supported".to_string(),
                answer: "Round Seven evidence answer.".to_string(),
                reasoning: Some("Round Seven evidence reasoning.".to_string()),
                context: None,
                point_id: Some("round-seven-point".to_string()),
                source_id: Some(source.id.clone()),
                chunk_index: Some(0),
                checked_at: Some("2026-07-09T00:10:00Z".to_string()),
                sources: Vec::new(),
            },
        )
        .unwrap();

        let investigation_templates =
            list_report_starter_templates(Some("investigation"), Some("brief"));
        assert!(investigation_templates
            .iter()
            .any(|template| template.id == "investigation-brief"));
        assert!(investigation_templates
            .iter()
            .all(|template| template.category == "investigation"));
        assert!(list_report_starter_templates(None, None).len() >= 3);

        let before_counts = (
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
            table_count(&conn, "points"),
            table_count(&conn, "evidence_records"),
            table_count(&conn, "reports"),
        );
        let draft = build_report_starter(
            &conn,
            BuildReportStarterInput {
                template_id: "investigation-brief".to_string(),
                query: "Round Seven templated report".to_string(),
                source_ids: vec![
                    source.id.clone(),
                    source.id.clone(),
                    "missing-source".to_string(),
                ],
                point_ids: vec!["round-seven-point".to_string(), "missing-point".to_string()],
                evidence_ids: vec![evidence.id.clone(), "missing-evidence".to_string()],
            },
        )
        .unwrap();
        let after_counts = (
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
            table_count(&conn, "points"),
            table_count(&conn, "evidence_records"),
            table_count(&conn, "reports"),
        );

        assert_eq!(before_counts, after_counts);
        assert_eq!(draft.template.id, "investigation-brief");
        assert_eq!(draft.save_input.kind, "investigation");
        assert!(draft
            .save_input
            .title
            .contains("Round Seven templated report"));
        assert!(draft.save_input.body_md.contains("## Evidence Map"));
        assert!(draft.save_input.body_md.contains("[S1] source"));
        assert!(draft.save_input.body_md.contains("[P1] point"));
        assert!(draft.save_input.body_md.contains("[E1] evidence"));
        assert_eq!(draft.context_items.len(), 3);
        assert_eq!(draft.context_items[0].label, "S1");
        assert_eq!(draft.context_items[1].label, "P1");
        assert_eq!(draft.context_items[2].label, "E1");
        assert!(draft
            .warnings
            .contains(&"source not found: missing-source".to_string()));
        assert!(draft
            .warnings
            .contains(&"point not found: missing-point".to_string()));
        assert!(draft
            .warnings
            .contains(&"evidence not found: missing-evidence".to_string()));

        let citations: serde_json::Value =
            serde_json::from_str(&draft.save_input.citations_json).unwrap();
        let citations = citations.as_array().unwrap();
        assert_eq!(citations.len(), 3);
        assert_eq!(citations[0]["label"], "S1");
        assert_eq!(citations[1]["label"], "P1");
        assert_eq!(citations[2]["label"], "E1");

        let blank = build_report_starter(
            &conn,
            BuildReportStarterInput {
                template_id: "investigation-brief".to_string(),
                query: "   ".to_string(),
                source_ids: Vec::new(),
                point_ids: Vec::new(),
                evidence_ids: Vec::new(),
            },
        )
        .unwrap_err();
        assert!(blank
            .to_string()
            .contains("report starter query is required"));

        let unknown = build_report_starter(
            &conn,
            BuildReportStarterInput {
                template_id: "unknown-template".to_string(),
                query: "Round Seven".to_string(),
                source_ids: Vec::new(),
                point_ids: Vec::new(),
                evidence_ids: Vec::new(),
            },
        )
        .unwrap_err();
        assert!(unknown
            .to_string()
            .contains("unknown report starter template"));
    }

    #[test]
    fn reprocess_queue_surfaces_low_quality_assets_without_mutating_them() {
        let mut conn = memory_db();
        let folder = add_indexed_folder(&conn, "D:/round-eight").unwrap();
        let empty_source = upsert_source_document(
            &conn,
            "file",
            "D:/round-eight/no-chunks.md",
            Some("Round Eight Source Without Chunks"),
            r#"{"round":8}"#,
        )
        .unwrap();
        let healthy_source = upsert_source_document(
            &conn,
            "file",
            "D:/round-eight/healthy.md",
            Some("Round Eight Healthy Source"),
            r#"{"round":8,"healthy":true}"#,
        )
        .unwrap();
        replace_source_chunks(
            &mut conn,
            &healthy_source.id,
            &["Round Eight healthy chunk.".to_string()],
        )
        .unwrap();

        let missing_file = upsert_indexed_file(
            &conn,
            UpsertIndexedFileInput {
                folder_id: folder.id.clone(),
                path: "D:/round-eight/missing.md".to_string(),
                canonical_path: None,
                name: "missing.md".to_string(),
                extension: Some("md".to_string()),
                size_bytes: None,
                modified_at: None,
                source_id: None,
                descriptor_kind: "markdown".to_string(),
                read_status: "missing".to_string(),
                index_status: "stale".to_string(),
                metadata_json: r#"{"round":8}"#.to_string(),
                preview_text: None,
                text_hash: None,
                extracted_chars: None,
                total_chars: None,
                last_error: Some("file missing on last scan".to_string()),
            },
        )
        .unwrap();
        let metadata_only_file = upsert_indexed_file(
            &conn,
            UpsertIndexedFileInput {
                folder_id: folder.id.clone(),
                path: "D:/round-eight/image.png".to_string(),
                canonical_path: None,
                name: "image.png".to_string(),
                extension: Some("png".to_string()),
                size_bytes: Some(100),
                modified_at: None,
                source_id: None,
                descriptor_kind: "image".to_string(),
                read_status: "unsupported".to_string(),
                index_status: "metadata_only".to_string(),
                metadata_json: r#"{"round":8,"type":"image"}"#.to_string(),
                preview_text: None,
                text_hash: None,
                extracted_chars: None,
                total_chars: None,
                last_error: Some("unsupported image parser".to_string()),
            },
        )
        .unwrap();
        upsert_indexed_file(
            &conn,
            UpsertIndexedFileInput {
                folder_id: folder.id.clone(),
                path: "D:/round-eight/healthy.md".to_string(),
                canonical_path: None,
                name: "healthy.md".to_string(),
                extension: Some("md".to_string()),
                size_bytes: Some(42),
                modified_at: None,
                source_id: Some(healthy_source.id.clone()),
                descriptor_kind: "markdown".to_string(),
                read_status: "ok".to_string(),
                index_status: "indexed".to_string(),
                metadata_json: r#"{"round":8,"healthy":true}"#.to_string(),
                preview_text: Some("healthy preview".to_string()),
                text_hash: Some("fnv1a64:0000000000000001".to_string()),
                extracted_chars: Some(20),
                total_chars: Some(20),
                last_error: None,
            },
        )
        .unwrap();
        let unaudited_report = save_report(
            &conn,
            report_input(
                "Round Eight Unaudited Report",
                "investigation",
                "round-eight",
            ),
        )
        .unwrap();

        let before_counts = (
            table_count(&conn, "indexed_files"),
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
            table_count(&conn, "reports"),
            table_count(&conn, "report_claims"),
            table_count(&conn, "report_citations"),
        );
        let queue = build_reprocess_queue(
            &conn,
            ReprocessQueueInput {
                kinds: None,
                limit: Some(20),
            },
        )
        .unwrap();
        let after_counts = (
            table_count(&conn, "indexed_files"),
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
            table_count(&conn, "reports"),
            table_count(&conn, "report_claims"),
            table_count(&conn, "report_citations"),
        );

        assert_eq!(before_counts, after_counts);
        assert!(queue.item_count >= 4);
        assert!(queue.critical_count >= 2);
        assert!(queue.warning_count >= 2);
        assert_eq!(queue.items[0].severity, "critical");
        assert!(queue.items.iter().any(|item| {
            item.target_kind == "indexed_file"
                && item.target_id == missing_file.id
                && item.issue_kind == "missing_or_stale_file"
                && item.suggested_action == "scan_indexed_folder"
                && item.folder_id.as_deref() == Some(folder.id.as_str())
        }));
        assert!(queue.items.iter().any(|item| {
            item.target_kind == "indexed_file"
                && item.target_id == metadata_only_file.id
                && (item.issue_kind == "file_read_failed"
                    || item.issue_kind == "metadata_only_file")
        }));
        assert!(queue.items.iter().any(|item| {
            item.target_kind == "source"
                && item.target_id == empty_source.id
                && item.issue_kind == "source_has_no_chunks"
        }));
        assert!(queue.items.iter().any(|item| {
            item.target_kind == "report"
                && item.target_id == unaudited_report.id
                && item.issue_kind == "report_missing_audit_rows"
        }));
        assert!(!queue
            .items
            .iter()
            .any(|item| item.target_id == healthy_source.id));

        let source_only = build_reprocess_queue(
            &conn,
            ReprocessQueueInput {
                kinds: Some(vec!["source".to_string(), "unknown".to_string()]),
                limit: Some(5),
            },
        )
        .unwrap();
        assert!(!source_only.items.is_empty());
        assert!(source_only
            .items
            .iter()
            .all(|item| item.target_kind == "source"));
    }

    #[test]
    fn duplicate_asset_detection_groups_exact_and_near_matches_read_only() {
        let conn = memory_db();
        let source_a = upsert_source_document(
            &conn,
            "file",
            "D:/round-nine/source-a.md",
            Some("Round Nine Duplicate Source"),
            r#"{"round":9,"source":"a"}"#,
        )
        .unwrap();
        let source_b = upsert_source_document(
            &conn,
            "web",
            "https://example.com/round-nine-source-b",
            Some("round nine duplicate source!"),
            r#"{"round":9,"source":"b"}"#,
        )
        .unwrap();
        let source_near = upsert_source_document(
            &conn,
            "file",
            "D:/round-nine/source-near.md",
            Some("Round Nine Duplicate Source Draft"),
            r#"{"round":9,"source":"near"}"#,
        )
        .unwrap();
        insert_point(
            &conn,
            "round-nine-point-a",
            "Duplicate point content should group exactly.",
            None,
            "2026-07-09T01:00:00Z",
        );
        insert_point(
            &conn,
            "round-nine-point-b",
            "Duplicate point content should group exactly!",
            None,
            "2026-07-09T01:01:00Z",
        );
        let report_a = save_report(
            &conn,
            report_input(
                "Round Nine Near Duplicate Report",
                "investigation",
                "round-nine-a",
            ),
        )
        .unwrap();
        let report_b = save_report(
            &conn,
            report_input(
                "Round Nine Near Duplicate Report Draft",
                "investigation",
                "round-nine-b",
            ),
        )
        .unwrap();
        let cross_kind_same_name = save_report(
            &conn,
            report_input("Round Nine Duplicate Source", "digest", "round-nine-cross"),
        )
        .unwrap();

        let before_counts = (
            table_count(&conn, "source_documents"),
            table_count(&conn, "points"),
            table_count(&conn, "reports"),
            table_count(&conn, "asset_relations"),
        );
        let report = detect_duplicate_assets(
            &conn,
            DuplicateAssetInput {
                kinds: None,
                limit: Some(20),
            },
        )
        .unwrap();
        let after_counts = (
            table_count(&conn, "source_documents"),
            table_count(&conn, "points"),
            table_count(&conn, "reports"),
            table_count(&conn, "asset_relations"),
        );

        assert_eq!(before_counts, after_counts);
        assert!(report.group_count >= 3);
        assert!(report.candidate_count >= 6);
        assert!(report.groups.iter().any(|group| {
            group.match_kind == "exact_fingerprint"
                && group
                    .candidates
                    .iter()
                    .any(|candidate| candidate.id == source_a.id)
                && group
                    .candidates
                    .iter()
                    .any(|candidate| candidate.id == source_b.id)
                && !group
                    .candidates
                    .iter()
                    .any(|candidate| candidate.id == cross_kind_same_name.id)
        }));
        assert!(report.groups.iter().any(|group| {
            group.match_kind == "near_fingerprint"
                && group.score >= 0.82
                && group
                    .candidates
                    .iter()
                    .any(|candidate| candidate.id == source_near.id)
        }));
        assert!(report.groups.iter().any(|group| {
            group.match_kind == "exact_fingerprint"
                && group
                    .candidates
                    .iter()
                    .all(|candidate| candidate.kind == "point")
                && group
                    .candidates
                    .iter()
                    .any(|candidate| candidate.id == "round-nine-point-a")
                && group
                    .candidates
                    .iter()
                    .any(|candidate| candidate.id == "round-nine-point-b")
        }));
        assert!(report.groups.iter().any(|group| {
            group.match_kind == "near_fingerprint"
                && group
                    .candidates
                    .iter()
                    .all(|candidate| candidate.kind == "report")
                && group
                    .candidates
                    .iter()
                    .any(|candidate| candidate.id == report_a.id)
                && group
                    .candidates
                    .iter()
                    .any(|candidate| candidate.id == report_b.id)
        }));

        let reports_only = detect_duplicate_assets(
            &conn,
            DuplicateAssetInput {
                kinds: Some(vec!["report".to_string(), "unknown".to_string()]),
                limit: Some(10),
            },
        )
        .unwrap();
        assert!(!reports_only.groups.is_empty());
        assert!(reports_only.groups.iter().all(|group| {
            group
                .candidates
                .iter()
                .all(|candidate| candidate.kind == "report")
        }));
    }

    #[test]
    fn graph_neighborhood_preview_builds_read_only_relation_and_suggestion_graph() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "file",
            "D:/round-ten/graph-seed.md",
            Some("Round Ten Graph Seed"),
            r#"{"round":10,"role":"root"}"#,
        )
        .unwrap();
        let duplicate_source = upsert_source_document(
            &conn,
            "web",
            "https://example.com/round-ten-graph-seed-copy",
            Some("round ten graph seed!"),
            r#"{"round":10,"role":"duplicate"}"#,
        )
        .unwrap();
        insert_point(
            &conn,
            "round-ten-point",
            "Round ten graph neighbor point.",
            None,
            "2026-07-10T01:00:00Z",
        );
        let evidence = save_evidence(
            &mut conn,
            evidence_input(
                "Round ten graph second hop evidence",
                Some("round-ten-point"),
                Some(&source.id),
                "2026-07-10T01:05:00Z",
            ),
        )
        .unwrap();
        save_asset_relation(
            &conn,
            SaveAssetRelationInput {
                from_kind: "source".to_string(),
                from_id: source.id.clone(),
                to_kind: "point".to_string(),
                to_id: "round-ten-point".to_string(),
                relation: "same_topic".to_string(),
                reason: "Manual graph seed relation".to_string(),
                score: 0.91,
                source_kind: "manual".to_string(),
            },
        )
        .unwrap();
        save_asset_relation(
            &conn,
            SaveAssetRelationInput {
                from_kind: "point".to_string(),
                from_id: "round-ten-point".to_string(),
                to_kind: "evidence".to_string(),
                to_id: evidence.id.clone(),
                relation: "supports".to_string(),
                reason: "Point is supported by this evidence".to_string(),
                score: 0.81,
                source_kind: "manual".to_string(),
            },
        )
        .unwrap();
        let backlink_report = save_report(
            &conn,
            SaveReportInput {
                title: "Round Ten Unlinked Graph Report".to_string(),
                kind: "investigation".to_string(),
                source_name: Some("round-ten".to_string()),
                body_md: "This report mentions Round Ten Graph Seed without a stored relation."
                    .to_string(),
                summary: "Unlinked mention for graph preview.".to_string(),
                citations_json: "[]".to_string(),
            },
        )
        .unwrap();
        let before_counts = (
            table_count(&conn, "source_documents"),
            table_count(&conn, "points"),
            table_count(&conn, "evidence_records"),
            table_count(&conn, "reports"),
            table_count(&conn, "asset_relations"),
        );

        let preview = build_graph_neighborhood_preview(
            &conn,
            GraphNeighborhoodInput {
                kind: "source".to_string(),
                id: source.id.clone(),
                depth: Some(2),
                include_suggestions: Some(true),
                limit: Some(20),
            },
        )
        .unwrap();
        let after_counts = (
            table_count(&conn, "source_documents"),
            table_count(&conn, "points"),
            table_count(&conn, "evidence_records"),
            table_count(&conn, "reports"),
            table_count(&conn, "asset_relations"),
        );

        assert_eq!(before_counts, after_counts);
        assert_eq!(preview.root_kind, "source");
        assert_eq!(preview.root_id, source.id);
        assert!(preview.nodes.iter().any(|node| {
            node.kind == "source" && node.id == source.id && node.depth == 0 && node.root
        }));
        assert!(preview.nodes.iter().any(|node| {
            node.kind == "point" && node.id == "round-ten-point" && node.depth == 1
        }));
        assert!(preview
            .nodes
            .iter()
            .any(|node| { node.kind == "evidence" && node.id == evidence.id && node.depth == 2 }));
        assert!(preview.edges.iter().any(|edge| {
            edge.edge_kind == "relation"
                && edge.existing_relation
                && edge.from_kind == "source"
                && edge.to_kind == "point"
                && edge.relation == "same_topic"
        }));
        assert!(preview.edges.iter().any(|edge| {
            edge.edge_kind == "suggested_backlink"
                && !edge.existing_relation
                && edge.from_kind == "report"
                && edge.from_id == backlink_report.id
                && edge.to_kind == "source"
        }));
        assert!(preview.edges.iter().any(|edge| {
            edge.edge_kind == "suggested_duplicate"
                && !edge.existing_relation
                && edge.to_kind == "source"
                && edge.to_id == duplicate_source.id
        }));

        let without_suggestions = build_graph_neighborhood_preview(
            &conn,
            GraphNeighborhoodInput {
                kind: "source".to_string(),
                id: source.id,
                depth: Some(2),
                include_suggestions: Some(false),
                limit: Some(20),
            },
        )
        .unwrap();
        assert!(without_suggestions
            .edges
            .iter()
            .all(|edge| edge.edge_kind == "relation"));
    }

    #[test]
    fn command_palette_manifest_filters_static_actions_without_db_writes() {
        let conn = memory_db();
        let before_counts = (
            table_count(&conn, "source_documents"),
            table_count(&conn, "points"),
            table_count(&conn, "reports"),
            table_count(&conn, "saved_asset_searches"),
            table_count(&conn, "quick_capture_items"),
            table_count(&conn, "asset_relations"),
        );

        let manifest = list_command_palette_items(CommandPaletteInput {
            query: None,
            category: None,
            limit: Some(100),
        });
        let after_counts = (
            table_count(&conn, "source_documents"),
            table_count(&conn, "points"),
            table_count(&conn, "reports"),
            table_count(&conn, "saved_asset_searches"),
            table_count(&conn, "quick_capture_items"),
            table_count(&conn, "asset_relations"),
        );

        assert_eq!(before_counts, after_counts);
        assert!(manifest.item_count >= 20);
        assert!(manifest.categories.contains(&"diagnostics".to_string()));
        assert!(manifest.categories.contains(&"graph".to_string()));
        assert!(manifest.categories.contains(&"capture".to_string()));
        assert!(manifest.items.windows(2).all(|pair| {
            pair[0].priority >= pair[1].priority || pair[0].category <= pair[1].category
        }));
        assert!(manifest
            .items
            .iter()
            .any(|item| item.command_name == "load_reprocess_queue"
                && item.source_inspiration.contains("Round 08")
                && item.risk == "read_only"));
        assert!(manifest
            .items
            .iter()
            .any(|item| item.command_name == "detect_duplicate_assets"
                && item.source_inspiration.contains("Round 09")));
        assert!(manifest.items.iter().any(|item| item.command_name
            == "build_graph_neighborhood_preview"
            && item.source_inspiration.contains("Round 10")
            && item.required_input == vec!["kind".to_string(), "id".to_string()]));

        let diagnostics = list_command_palette_items(CommandPaletteInput {
            query: None,
            category: Some("DIAGNOSTICS".to_string()),
            limit: Some(20),
        });
        assert!(!diagnostics.items.is_empty());
        assert!(diagnostics
            .items
            .iter()
            .all(|item| item.category == "diagnostics"));
        assert!(diagnostics
            .items
            .iter()
            .any(|item| item.command_name == "load_citation_quality_dashboard"));

        let duplicate_query = list_command_palette_items(CommandPaletteInput {
            query: Some("zotero duplicate review".to_string()),
            category: None,
            limit: Some(10),
        });
        assert!(duplicate_query
            .items
            .iter()
            .any(|item| item.command_name == "detect_duplicate_assets"));

        let limited = list_command_palette_items(CommandPaletteInput {
            query: None,
            category: None,
            limit: Some(2),
        });
        assert_eq!(limited.item_count, 2);
        assert!(limited
            .warnings
            .iter()
            .any(|warning| warning.contains("truncated")));

        let empty = list_command_palette_items(CommandPaletteInput {
            query: Some("zzzzzz-not-a-command".to_string()),
            category: None,
            limit: None,
        });
        assert_eq!(empty.item_count, 0);
        assert!(empty
            .warnings
            .contains(&"No command palette items matched the filters.".to_string()));
    }

    #[test]
    fn automation_suggestions_aggregate_existing_diagnostics_read_only() {
        let mut conn = memory_db();
        insert_point(
            &conn,
            "round-thirteen-review-point",
            "Round Thirteen review target point.",
            None,
            "2026-07-09T01:00:00Z",
        );
        let review = add_review_item(
            &conn,
            AddReviewItemInput {
                target_kind: "point".to_string(),
                target_id: "round-thirteen-review-point".to_string(),
                title: "Round Thirteen Due Review".to_string(),
                note: Some("Exercise the automation suggestion review source.".to_string()),
                priority: Some("high".to_string()),
                due_at: Some("2020-01-01T00:00:00Z".to_string()),
            },
        )
        .unwrap();

        let report = save_report(
            &conn,
            report_input(
                "Round Thirteen Citation Drift Report",
                "investigation",
                "round-thirteen-citation",
            ),
        )
        .unwrap();
        replace_report_audit_rows(
            &conn,
            &report.id,
            vec![SaveReportClaimInput {
                claim_index: 0,
                claim_text: "Round Thirteen claim needs support.".to_string(),
                claim_status: "cited".to_string(),
                citation_labels: vec!["S1".to_string()],
            }],
            vec![SaveReportCitationInput {
                citation_index: 0,
                target_kind: "source".to_string(),
                target_id: "missing-round-thirteen-source".to_string(),
                label: Some("S1".to_string()),
                title: Some("Missing Round Thirteen Source".to_string()),
                quote: Some("missing quote".to_string()),
                excerpt: None,
                reason: Some("source was removed".to_string()),
                source_id: Some("missing-round-thirteen-source".to_string()),
                chunk_index: Some(0),
                source_text_hash: None,
                span_start: None,
                span_end: None,
                locator_status: "target_missing".to_string(),
                match_count: 0,
            }],
        )
        .unwrap();

        let folder = add_indexed_folder(&conn, "D:/round-thirteen").unwrap();
        let stale_file = upsert_indexed_file(
            &conn,
            UpsertIndexedFileInput {
                folder_id: folder.id.clone(),
                path: "D:/round-thirteen/missing.md".to_string(),
                canonical_path: None,
                name: "missing.md".to_string(),
                extension: Some("md".to_string()),
                size_bytes: None,
                modified_at: None,
                source_id: None,
                descriptor_kind: "markdown".to_string(),
                read_status: "missing".to_string(),
                index_status: "stale".to_string(),
                metadata_json: r#"{"round":13}"#.to_string(),
                preview_text: None,
                text_hash: None,
                extracted_chars: None,
                total_chars: None,
                last_error: Some("file missing on automation sweep".to_string()),
            },
        )
        .unwrap();

        save_report(
            &conn,
            report_input(
                "Round Thirteen Duplicate Candidate",
                "synthesis",
                "round-thirteen-dup-a",
            ),
        )
        .unwrap();
        save_report(
            &conn,
            report_input(
                "Round Thirteen Duplicate Candidate",
                "digest",
                "round-thirteen-dup-b",
            ),
        )
        .unwrap();

        let capture = save_quick_capture(
            &conn,
            SaveQuickCaptureInput {
                content: "Round Thirteen inbox item should be suggested for triage.".to_string(),
                tags: vec!["automation".to_string()],
                source_kind: Some("manual".to_string()),
            },
        )
        .unwrap();

        let source = upsert_source_document(
            &conn,
            "file",
            "D:/round-thirteen/new-source.md",
            Some("Round Thirteen New Source"),
            r#"{"round":13,"role":"new-source"}"#,
        )
        .unwrap();
        replace_source_chunks(
            &mut conn,
            &source.id,
            &["Round Thirteen new source chunk.".to_string()],
        )
        .unwrap();

        let profile = save_retrieval_profile(
            &conn,
            SaveRetrievalProfileInput {
                name: "Round Thirteen Retrieval Profile".to_string(),
                description: Some("Profile to preview from automation suggestions.".to_string()),
                query: "Round Thirteen".to_string(),
                kinds: Some(vec!["source".to_string()]),
                filter: None,
                saved_search_id: None,
                limit: Some(5),
                max_chars_per_item: Some(160),
                min_score: Some(0.0),
                mode: Some("query".to_string()),
            },
        )
        .unwrap();

        let before_counts = (
            table_count(&conn, "review_items"),
            table_count(&conn, "reports"),
            table_count(&conn, "report_claims"),
            table_count(&conn, "report_citations"),
            table_count(&conn, "indexed_files"),
            table_count(&conn, "quick_capture_items"),
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
            table_count(&conn, "retrieval_profiles"),
            table_count(&conn, "asset_relations"),
        );
        let suggestions = load_automation_suggestions(
            &conn,
            AutomationSuggestionInput {
                categories: None,
                limit: Some(100),
            },
        )
        .unwrap();
        let after_counts = (
            table_count(&conn, "review_items"),
            table_count(&conn, "reports"),
            table_count(&conn, "report_claims"),
            table_count(&conn, "report_citations"),
            table_count(&conn, "indexed_files"),
            table_count(&conn, "quick_capture_items"),
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
            table_count(&conn, "retrieval_profiles"),
            table_count(&conn, "asset_relations"),
        );

        assert_eq!(before_counts, after_counts);
        assert!(suggestions.item_count >= 7);
        assert!(suggestions.critical_count >= 2);
        assert!(suggestions.items.windows(2).all(|pair| {
            pair[0].priority_score >= pair[1].priority_score || pair[0].category <= pair[1].category
        }));
        assert!(suggestions.items.iter().any(|item| {
            item.category == "review"
                && item.command_name == "build_review_queue_plan"
                && item.target_id.as_deref() == Some("round-thirteen-review-point")
                && item.input_json.contains("\"mode\":\"due\"")
                && item.id.contains(&review.id)
        }));
        assert!(suggestions.items.iter().any(|item| {
            item.category == "citations"
                && item.command_name == "load_citation_quality_dashboard"
                && item.target_id.as_deref() == Some(report.id.as_str())
                && item.priority == "critical"
        }));
        assert!(suggestions.items.iter().any(|item| {
            item.category == "reprocess"
                && item.command_name == "load_reprocess_queue"
                && item.target_id.as_deref() == Some(stale_file.id.as_str())
        }));
        assert!(suggestions.items.iter().any(|item| {
            item.category == "duplicates" && item.command_name == "detect_duplicate_assets"
        }));
        assert!(suggestions.items.iter().any(|item| {
            item.category == "capture"
                && item.command_name == "resolve_quick_capture"
                && item.target_id.as_deref() == Some(capture.id.as_str())
        }));
        assert!(suggestions.items.iter().any(|item| {
            item.category == "sources"
                && item.command_name == "add_review_item"
                && item.target_id.as_deref() == Some(source.id.as_str())
        }));
        assert!(suggestions.items.iter().any(|item| {
            item.category == "retrieval"
                && item.command_name == "preview_retrieval_profile"
                && item.target_id.as_deref() == Some(profile.id.as_str())
        }));

        let capture_only = load_automation_suggestions(
            &conn,
            AutomationSuggestionInput {
                categories: Some(vec!["capture".to_string()]),
                limit: Some(10),
            },
        )
        .unwrap();
        assert!(!capture_only.items.is_empty());
        assert!(capture_only
            .items
            .iter()
            .all(|item| item.category == "capture"));

        let manifest = list_command_palette_items(CommandPaletteInput {
            query: Some("khoj automation suggestions".to_string()),
            category: None,
            limit: Some(20),
        });
        assert!(manifest.items.iter().any(|item| {
            item.command_name == "load_automation_suggestions"
                && item.risk == "read_only"
                && item.source_inspiration.contains("Round 13")
        }));
    }

    #[test]
    fn import_diagnostics_ledger_summarizes_scan_outcomes_read_only() {
        let conn = memory_db();
        let folder = add_indexed_folder(&conn, "D:/round-fourteen/imports").unwrap();
        let ok_file = upsert_indexed_file(
            &conn,
            UpsertIndexedFileInput {
                folder_id: folder.id.clone(),
                path: "D:/round-fourteen/imports/ok.md".to_string(),
                canonical_path: Some("D:/round-fourteen/imports/ok.md".to_string()),
                name: "ok.md".to_string(),
                extension: Some("md".to_string()),
                size_bytes: Some(42),
                modified_at: Some("2026-07-09T01:00:00Z".to_string()),
                source_id: Some("source-ok".to_string()),
                descriptor_kind: "markdown".to_string(),
                read_status: "ok".to_string(),
                index_status: "indexed".to_string(),
                metadata_json: r#"{"round":14,"state":"ok"}"#.to_string(),
                preview_text: Some("Indexed body".to_string()),
                text_hash: Some("fnv1a64:0000000000000001".to_string()),
                extracted_chars: Some(12),
                total_chars: Some(12),
                last_error: None,
            },
        )
        .unwrap();
        let metadata_only = upsert_indexed_file(
            &conn,
            UpsertIndexedFileInput {
                folder_id: folder.id.clone(),
                path: "D:/round-fourteen/imports/image.png".to_string(),
                canonical_path: Some("D:/round-fourteen/imports/image.png".to_string()),
                name: "image.png".to_string(),
                extension: Some("png".to_string()),
                size_bytes: Some(2048),
                modified_at: Some("2026-07-09T01:01:00Z".to_string()),
                source_id: None,
                descriptor_kind: "image".to_string(),
                read_status: "unsupported".to_string(),
                index_status: "metadata_only".to_string(),
                metadata_json: r#"{"round":14,"state":"metadata"}"#.to_string(),
                preview_text: None,
                text_hash: None,
                extracted_chars: None,
                total_chars: None,
                last_error: None,
            },
        )
        .unwrap();
        let partial = upsert_indexed_file(
            &conn,
            UpsertIndexedFileInput {
                folder_id: folder.id.clone(),
                path: "D:/round-fourteen/imports/bad.txt".to_string(),
                canonical_path: Some("D:/round-fourteen/imports/bad.txt".to_string()),
                name: "bad.txt".to_string(),
                extension: Some("txt".to_string()),
                size_bytes: Some(128),
                modified_at: Some("2026-07-09T01:02:00Z".to_string()),
                source_id: None,
                descriptor_kind: "text".to_string(),
                read_status: "ok".to_string(),
                index_status: "partial".to_string(),
                metadata_json: r#"{"round":14,"state":"partial"}"#.to_string(),
                preview_text: None,
                text_hash: None,
                extracted_chars: Some(0),
                total_chars: Some(128),
                last_error: Some("invalid utf-8 sequence during import".to_string()),
            },
        )
        .unwrap();
        let missing = upsert_indexed_file(
            &conn,
            UpsertIndexedFileInput {
                folder_id: folder.id.clone(),
                path: "D:/round-fourteen/imports/missing.md".to_string(),
                canonical_path: None,
                name: "missing.md".to_string(),
                extension: Some("md".to_string()),
                size_bytes: None,
                modified_at: None,
                source_id: None,
                descriptor_kind: "markdown".to_string(),
                read_status: "missing".to_string(),
                index_status: "stale".to_string(),
                metadata_json: r#"{"round":14,"state":"missing"}"#.to_string(),
                preview_text: None,
                text_hash: None,
                extracted_chars: None,
                total_chars: None,
                last_error: Some("file missing on last scan".to_string()),
            },
        )
        .unwrap();

        let before_counts = (
            table_count(&conn, "indexed_folders"),
            table_count(&conn, "indexed_files"),
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
        );
        let ledger = load_import_diagnostics_ledger(
            &conn,
            ImportDiagnosticsInput {
                folder_id: None,
                statuses: None,
                include_ok: None,
                limit: Some(20),
            },
        )
        .unwrap();
        let after_counts = (
            table_count(&conn, "indexed_folders"),
            table_count(&conn, "indexed_files"),
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
        );

        assert_eq!(before_counts, after_counts);
        assert_eq!(ledger.folder_count, 1);
        assert_eq!(ledger.item_count, 3);
        assert_eq!(ledger.ok_count, 1);
        assert_eq!(ledger.warning_count, 2);
        assert_eq!(ledger.critical_count, 1);
        let folder_summary = ledger.folders.first().unwrap();
        assert_eq!(folder_summary.folder_id, folder.id);
        assert_eq!(folder_summary.total_files, 4);
        assert_eq!(folder_summary.metadata_only_count, 1);
        assert_eq!(folder_summary.partial_count, 1);
        assert_eq!(folder_summary.missing_count, 1);
        assert_eq!(folder_summary.stale_count, 1);
        assert_eq!(folder_summary.ok_count, 1);
        assert_eq!(folder_summary.warning_count, 2);
        assert_eq!(folder_summary.critical_count, 1);
        assert!(!ledger.items.iter().any(|item| item.file_id == ok_file.id));

        let missing_item = ledger
            .items
            .iter()
            .find(|item| item.file_id == missing.id)
            .unwrap();
        assert_eq!(missing_item.severity, "critical");
        assert_eq!(missing_item.issue_kind, "missing_or_stale_file");
        assert_eq!(missing_item.command_name, "scan_indexed_folder");
        assert!(missing_item.input_json.contains(&folder.id));

        let metadata_item = ledger
            .items
            .iter()
            .find(|item| item.file_id == metadata_only.id)
            .unwrap();
        assert_eq!(metadata_item.issue_kind, "metadata_only_file");
        assert_eq!(metadata_item.command_name, "load_indexed_file_preview");
        assert!(metadata_item.input_json.contains(&metadata_only.id));

        let partial_item = ledger
            .items
            .iter()
            .find(|item| item.file_id == partial.id)
            .unwrap();
        assert_eq!(partial_item.issue_kind, "partial_index");
        assert!(partial_item.message.contains("invalid utf-8"));

        let include_ok = load_import_diagnostics_ledger(
            &conn,
            ImportDiagnosticsInput {
                folder_id: Some(folder.id.clone()),
                statuses: None,
                include_ok: Some(true),
                limit: Some(20),
            },
        )
        .unwrap();
        assert_eq!(include_ok.item_count, 4);
        assert!(include_ok
            .items
            .iter()
            .any(|item| item.file_id == ok_file.id));

        let critical_only = load_import_diagnostics_ledger(
            &conn,
            ImportDiagnosticsInput {
                folder_id: None,
                statuses: Some(vec!["critical".to_string()]),
                include_ok: Some(true),
                limit: Some(20),
            },
        )
        .unwrap();
        assert_eq!(critical_only.item_count, 1);
        assert_eq!(critical_only.items[0].file_id, missing.id);

        let automation = load_automation_suggestions(
            &conn,
            AutomationSuggestionInput {
                categories: Some(vec!["import".to_string()]),
                limit: Some(10),
            },
        )
        .unwrap();
        assert!(automation.items.iter().any(|item| {
            item.category == "import"
                && item.command_name == "load_import_diagnostics_ledger"
                && item.target_id.as_deref() == Some(missing.id.as_str())
                && item.input_json.contains("\"includeOk\":false")
        }));

        let manifest = list_command_palette_items(CommandPaletteInput {
            query: Some("zotero joplin import ledger".to_string()),
            category: Some("diagnostics".to_string()),
            limit: Some(20),
        });
        assert!(manifest.items.iter().any(|item| {
            item.command_name == "load_import_diagnostics_ledger"
                && item.risk == "read_only"
                && item.source_inspiration.contains("Round 14")
        }));
    }

    #[test]
    fn search_assets_empty_query_returns_empty() {
        let conn = memory_db();
        let results = search_assets(
            &conn,
            SearchAssetsInput {
                query: "   ".to_string(),
                kinds: None,
                filter: None,
                limit: None,
            },
        )
        .unwrap();

        assert!(results.is_empty());
    }

    #[test]
    fn search_assets_kind_filter_returns_only_reports() {
        let mut conn = memory_db();
        save_report(
            &conn,
            report_input("Unified Search Report", "digest", "unified-search"),
        )
        .unwrap();
        save_evidence(
            &mut conn,
            evidence_input(
                "Unified Search Evidence",
                None,
                None,
                "2026-07-05T00:10:00Z",
            ),
        )
        .unwrap();

        let results = search_assets(
            &conn,
            SearchAssetsInput {
                query: "Unified Search".to_string(),
                kinds: None,
                filter: Some(r#"kind == "report""#.to_string()),
                limit: Some(20),
            },
        )
        .unwrap();

        assert!(!results.is_empty());
        assert!(results.iter().all(|result| result.kind == "report"));
    }

    #[test]
    fn search_assets_report_kind_filter_returns_only_investigations() {
        let conn = memory_db();
        save_report(
            &conn,
            report_input("Shared Search Digest", "digest", "shared-search"),
        )
        .unwrap();
        let investigation = save_report(
            &conn,
            report_input(
                "Shared Search Investigation",
                "investigation",
                "shared-search",
            ),
        )
        .unwrap();

        let results = search_assets(
            &conn,
            SearchAssetsInput {
                query: "Shared Search".to_string(),
                kinds: None,
                filter: Some(r#"reportKind == "investigation""#.to_string()),
                limit: Some(20),
            },
        )
        .unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, investigation.id);
        assert_eq!(results[0].kind, "report");
        assert!(results[0]
            .metadata_json
            .contains(r#""reportKind":"investigation""#));
    }

    #[test]
    fn search_assets_invalid_filter_errors() {
        let conn = memory_db();
        let err = search_assets(
            &conn,
            SearchAssetsInput {
                query: "anything".to_string(),
                kinds: None,
                filter: Some("kind = report".to_string()),
                limit: None,
            },
        )
        .unwrap_err();

        assert!(err.to_string().contains("unsupported search filter"));
    }

    #[test]
    fn search_assets_source_kind_filter_returns_indexed_files() {
        let conn = memory_db();
        let folder = add_indexed_folder(&conn, "D:/Research Notes").unwrap();
        let indexed = upsert_indexed_file(
            &conn,
            UpsertIndexedFileInput {
                folder_id: folder.id.clone(),
                path: "D:/Research Notes/semantic-map.md".to_string(),
                canonical_path: Some("D:/Research Notes/semantic-map.md".to_string()),
                name: "semantic-map.md".to_string(),
                extension: Some("md".to_string()),
                size_bytes: Some(256),
                modified_at: Some("2026-07-05T00:00:00Z".to_string()),
                source_id: Some("source-indexed".to_string()),
                descriptor_kind: "markdown".to_string(),
                read_status: "ok".to_string(),
                index_status: "indexed".to_string(),
                metadata_json: r#"{"kind":"indexed_file"}"#.to_string(),
                preview_text: Some("Semantic map preview needle".to_string()),
                text_hash: Some("fnv1a64:indexed".to_string()),
                extracted_chars: Some(27),
                total_chars: Some(27),
                last_error: None,
            },
        )
        .unwrap();

        let results = search_assets(
            &conn,
            SearchAssetsInput {
                query: "needle".to_string(),
                kinds: None,
                filter: Some(r#"sourceKind == "indexed_folder""#.to_string()),
                limit: Some(20),
            },
        )
        .unwrap();

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].kind, "indexed_file");
        assert_eq!(results[0].id, indexed.id);
        assert_eq!(results[0].source_id.as_deref(), Some("source-indexed"));
        assert!(results[0]
            .metadata_json
            .contains(r#""sourceKind":"indexed_folder""#));
    }

    #[test]
    fn explain_search_ranking_breaks_down_scores_without_changing_search_order() {
        let mut conn = memory_db();
        insert_point(
            &conn,
            "round-fifteen-point",
            "round-fifteen-ranking field match point content",
            None,
            "2026-07-09T01:00:00Z",
        );
        save_report(
            &conn,
            report_input(
                "Round Fifteen Ranking Investigation",
                "investigation",
                "round-fifteen-ranking",
            ),
        )
        .unwrap();
        let source = upsert_source_document(
            &conn,
            "file",
            "D:/round-fifteen/ranking.md",
            Some("Round Fifteen Ranking Source"),
            r#"{"round":15,"topic":"ranking explainability"}"#,
        )
        .unwrap();
        replace_source_chunks(
            &mut conn,
            &source.id,
            &["round-fifteen-ranking source text for diagnostics".to_string()],
        )
        .unwrap();
        let folder = add_indexed_folder(&conn, "D:/round-fifteen").unwrap();
        let indexed = upsert_indexed_file(
            &conn,
            UpsertIndexedFileInput {
                folder_id: folder.id.clone(),
                path: "D:/round-fifteen/ranking-notes.md".to_string(),
                canonical_path: Some("D:/round-fifteen/ranking-notes.md".to_string()),
                name: "ranking-notes.md".to_string(),
                extension: Some("md".to_string()),
                size_bytes: Some(512),
                modified_at: Some("2026-07-09T01:02:00Z".to_string()),
                source_id: Some(source.id.clone()),
                descriptor_kind: "markdown".to_string(),
                read_status: "ok".to_string(),
                index_status: "indexed".to_string(),
                metadata_json: r#"{"round":15,"language":"zh"}"#.to_string(),
                preview_text: Some(
                    "round-fifteen-ranking indexed preview about 机器学习 ranking".to_string(),
                ),
                text_hash: Some("fnv1a64:round-fifteen".to_string()),
                extracted_chars: Some(70),
                total_chars: Some(70),
                last_error: None,
            },
        )
        .unwrap();

        let before_counts = (
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
            table_count(&conn, "points"),
            table_count(&conn, "reports"),
            table_count(&conn, "indexed_folders"),
            table_count(&conn, "indexed_files"),
        );
        let raw_results = search_assets(
            &conn,
            SearchAssetsInput {
                query: "round-fifteen-ranking".to_string(),
                kinds: None,
                filter: None,
                limit: Some(20),
            },
        )
        .unwrap();
        let explanation = explain_search_ranking(
            &conn,
            SearchRankingExplanationInput {
                query: "round-fifteen-ranking".to_string(),
                kinds: None,
                filter: None,
                limit: Some(20),
            },
        )
        .unwrap();
        let after_counts = (
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
            table_count(&conn, "points"),
            table_count(&conn, "reports"),
            table_count(&conn, "indexed_folders"),
            table_count(&conn, "indexed_files"),
        );

        assert_eq!(before_counts, after_counts);
        assert_eq!(explanation.ranker, "search_assets_coarse_score_v1");
        assert_eq!(explanation.result_count as usize, raw_results.len());
        assert_eq!(
            explanation.items.first().map(|item| item.id.as_str()),
            raw_results.first().map(|item| item.id.as_str())
        );
        assert!(explanation
            .query_terms
            .contains(&"round-fifteen-ranking".to_string()));
        assert!(explanation.query_terms.contains(&"fifteen".to_string()));
        assert!(explanation.query_terms.contains(&"ranking".to_string()));

        let point_explanation = explanation
            .items
            .iter()
            .find(|item| item.kind == "point" && item.id == "round-fifteen-point")
            .unwrap();
        assert!(point_explanation
            .matched_terms
            .contains(&"round-fifteen-ranking".to_string()));
        assert!(point_explanation
            .matched_fields
            .iter()
            .any(|field| field == "snippet"));
        assert!(point_explanation.components.iter().any(|component| {
            component.name == "asset_kind_prior"
                && component.used_for_ranking
                && component.contribution > 0.0
        }));
        assert!(point_explanation
            .components
            .iter()
            .any(|component| { component.name == "field_match" && !component.used_for_ranking }));

        let indexed_explanation = explanation
            .items
            .iter()
            .find(|item| item.kind == "indexed_file" && item.id == indexed.id)
            .unwrap();
        assert!(indexed_explanation
            .components
            .iter()
            .any(|component| { component.name == "source_locator" && component.value > 0.0 }));
        assert!(indexed_explanation
            .components
            .iter()
            .any(|component| { component.name == "metadata_quality" && component.value > 0.0 }));

        let cjk = explain_search_ranking(
            &conn,
            SearchRankingExplanationInput {
                query: "机器学习".to_string(),
                kinds: Some(vec!["indexed_file".to_string()]),
                filter: None,
                limit: Some(5),
            },
        )
        .unwrap();
        assert!(cjk.query_terms.contains(&"机器学习".to_string()));
        assert!(cjk.items.iter().any(|item| {
            item.id == indexed.id && item.matched_terms.contains(&"机器学习".to_string())
        }));

        let manifest = list_command_palette_items(CommandPaletteInput {
            query: Some("marginalia score components".to_string()),
            category: Some("search".to_string()),
            limit: Some(20),
        });
        assert!(manifest.items.iter().any(|item| {
            item.command_name == "explain_search_ranking"
                && item.wrapper_name == "explainSearchRanking"
                && item.source_inspiration.contains("Round 15")
        }));
    }

    #[test]
    fn block_reference_manifest_builds_point_chunk_cards_read_only() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "file",
            "D:/round-sixteen/block-reference.md",
            Some("Round Sixteen Block Reference Source"),
            r#"{"round":16,"topic":"block references"}"#,
        )
        .unwrap();
        replace_source_chunks(
            &mut conn,
            &source.id,
            &[
                "background chunk without the key phrase".to_string(),
                "siyuan block reference source chunk with anchored evidence".to_string(),
            ],
        )
        .unwrap();
        insert_point(
            &conn,
            "round-sixteen-point",
            "siyuan block reference point insight",
            None,
            "2026-07-10T01:00:00Z",
        );
        insert_point_source_link(
            &conn,
            "round-sixteen-point",
            &source.id,
            1,
            Some("anchored evidence"),
        )
        .unwrap();
        save_evidence(
            &mut conn,
            evidence_input(
                "siyuan block reference evidence",
                Some("round-sixteen-point"),
                Some(&source.id),
                "2026-07-10T01:05:00Z",
            ),
        )
        .unwrap();

        let before_counts = (
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
            table_count(&conn, "points"),
            table_count(&conn, "point_source_links"),
            table_count(&conn, "evidence_records"),
            table_count(&conn, "evidence_sources"),
        );
        let manifest = build_block_reference_manifest(
            &conn,
            BlockReferenceInput {
                kind: "point".to_string(),
                id: "round-sixteen-point".to_string(),
                query: Some("siyuan block reference".to_string()),
                limit: Some(10),
                include_related: Some(true),
            },
        )
        .unwrap();
        let after_counts = (
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
            table_count(&conn, "points"),
            table_count(&conn, "point_source_links"),
            table_count(&conn, "evidence_records"),
            table_count(&conn, "evidence_sources"),
        );

        assert_eq!(before_counts, after_counts);
        assert_eq!(manifest.root_kind, "point");
        assert_eq!(manifest.root_id, "round-sixteen-point");
        assert_eq!(manifest.root_title.as_deref(), Some("作者观点"));
        assert!(manifest.source_inspiration.contains("Round 16"));
        assert!(manifest.block_count >= 3);

        let point_card = manifest
            .cards
            .iter()
            .find(|card| card.block_kind == "point_card")
            .unwrap();
        assert_eq!(point_card.command_name, "get_point_source_context");
        assert_eq!(point_card.wrapper_name, "getPointSourceContext");
        assert!(point_card.matched_terms.contains(&"siyuan".to_string()));
        assert!(point_card.matched_fields.iter().any(|field| field == "text"));
        assert!(point_card.block_hash.starts_with("fnv1a64:"));

        let chunk_card = manifest
            .cards
            .iter()
            .find(|card| card.block_kind == "source_chunk")
            .unwrap();
        assert_eq!(chunk_card.asset_kind, "source");
        assert_eq!(chunk_card.source_id.as_deref(), Some(source.id.as_str()));
        assert_eq!(chunk_card.chunk_index, Some(1));
        assert_eq!(chunk_card.command_name, "open_source_workspace");
        assert!(chunk_card.input_json.contains("sourceId"));

        assert!(manifest.cards.iter().any(|card| {
            card.block_kind == "evidence_claim"
                && card.command_name == "get_evidence"
                && card.matched_terms.contains(&"reference".to_string())
        }));

        let missing = build_block_reference_manifest(
            &conn,
            BlockReferenceInput {
                kind: "point".to_string(),
                id: "missing-point".to_string(),
                query: None,
                limit: Some(5),
                include_related: Some(true),
            },
        )
        .unwrap();
        assert_eq!(missing.block_count, 0);
        assert!(missing
            .warnings
            .iter()
            .any(|warning| warning.contains("not found")));

        let manifest_item = list_command_palette_items(CommandPaletteInput {
            query: Some("siyuan block references".to_string()),
            category: Some("references".to_string()),
            limit: Some(20),
        });
        assert!(manifest_item.items.iter().any(|item| {
            item.command_name == "build_block_reference_manifest"
                && item.wrapper_name == "buildBlockReferenceManifest"
                && item.source_inspiration.contains("Round 16")
            }));
    }

    #[test]
    fn board_snapshot_export_converts_block_refs_to_markdown_map_read_only() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "file",
            "D:/round-seventeen/board-snapshot.md",
            Some("Round Seventeen Board Source"),
            r#"{"round":17,"topic":"board snapshot"}"#,
        )
        .unwrap();
        replace_source_chunks(
            &mut conn,
            &source.id,
            &[
                "affine board snapshot background".to_string(),
                "appflowy board snapshot source chunk for markdown map".to_string(),
            ],
        )
        .unwrap();
        insert_point(
            &conn,
            "round-seventeen-point",
            "affine appflowy board snapshot point",
            None,
            "2026-07-10T02:00:00Z",
        );
        insert_point_source_link(
            &conn,
            "round-seventeen-point",
            &source.id,
            1,
            Some("board snapshot source chunk"),
        )
        .unwrap();
        save_evidence(
            &mut conn,
            evidence_input(
                "affine board snapshot evidence",
                Some("round-seventeen-point"),
                Some(&source.id),
                "2026-07-10T02:05:00Z",
            ),
        )
        .unwrap();

        let before_counts = (
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
            table_count(&conn, "points"),
            table_count(&conn, "point_source_links"),
            table_count(&conn, "evidence_records"),
            table_count(&conn, "evidence_sources"),
        );
        let export = build_board_snapshot_export(
            &conn,
            BoardSnapshotInput {
                kind: "point".to_string(),
                id: "round-seventeen-point".to_string(),
                query: Some("affine board snapshot".to_string()),
                limit: Some(12),
                include_related: Some(true),
            },
        )
        .unwrap();
        let after_counts = (
            table_count(&conn, "source_documents"),
            table_count(&conn, "source_chunks"),
            table_count(&conn, "points"),
            table_count(&conn, "point_source_links"),
            table_count(&conn, "evidence_records"),
            table_count(&conn, "evidence_sources"),
        );

        assert_eq!(before_counts, after_counts);
        assert_eq!(export.root_kind, "point");
        assert_eq!(export.root_id, "round-seventeen-point");
        assert!(export.source_inspiration.contains("Round 17"));
        assert!(export.node_count >= 3);
        assert_eq!(export.edge_count, export.node_count.saturating_sub(1));
        assert!(export.nodes.iter().any(|node| node.lane == "sources"));
        assert!(export.nodes.iter().any(|node| node.lane == "claims"));
        assert!(export.markdown.contains("```mermaid"));
        assert!(export.markdown.contains("flowchart LR"));
        assert!(export.markdown.contains("## Cards"));
        assert!(export
            .edges
            .iter()
            .all(|edge| edge.relation == "references"));

        let manifest_item = list_command_palette_items(CommandPaletteInput {
            query: Some("affine appflowy board snapshot".to_string()),
            category: Some("board".to_string()),
            limit: Some(20),
        });
        assert!(manifest_item.items.iter().any(|item| {
            item.command_name == "build_board_snapshot_export"
                && item.wrapper_name == "buildBoardSnapshotExport"
                && item.source_inspiration.contains("Round 17")
        }));
    }

    #[test]
    fn investigation_qa_eval_scores_multi_document_reports_read_only() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "file",
            "D:/round-nineteen/qa-source.md",
            Some("Round Nineteen QA Source"),
            r#"{"round":19,"topic":"qa eval"}"#,
        )
        .unwrap();
        replace_source_chunks(
            &mut conn,
            &source.id,
            &["alpha qa quote from source context".to_string()],
        )
        .unwrap();
        insert_point(
            &conn,
            "round-nineteen-point",
            "point qa quote from extracted insight",
            None,
            "2026-07-10T03:00:00Z",
        );
        insert_point_source_link(&conn, "round-nineteen-point", &source.id, 0, None).unwrap();

        let citations_json = serde_json::to_string(&serde_json::json!([
            {
                "kind": "source",
                "label": "S1",
                "id": source.id,
                "title": "Round Nineteen QA Source",
                "quote": "alpha qa quote",
                "sourceId": source.id,
                "chunkIndex": 0
            },
            {
                "kind": "point",
                "label": "P1",
                "id": "round-nineteen-point",
                "title": "QA Point",
                "quote": "point qa quote"
            }
        ]))
        .unwrap();
        let strong = save_report(
            &conn,
            SaveReportInput {
                title: "Round Nineteen Multi Document QA".to_string(),
                kind: "investigation".to_string(),
                source_name: Some("Round 19".to_string()),
                body_md: "# Round Nineteen Multi Document QA\n\nThe source says alpha qa quote [S1].\n\nThe point preserves point qa quote [P1].\n\nThe conclusion combines both cited contexts [S1][P1] for a multi-document answer.".to_string(),
                summary: "QA investigation summary with enough detail for regression checks.".to_string(),
                citations_json,
            },
        )
        .unwrap();
        replace_report_audit_rows(
            &conn,
            &strong.id,
            extract_report_claims_for_report(&strong),
            vec![
                SaveReportCitationInput {
                    citation_index: 0,
                    target_kind: "source".to_string(),
                    target_id: source.id.clone(),
                    label: Some("S1".to_string()),
                    title: Some("Round Nineteen QA Source".to_string()),
                    quote: Some("alpha qa quote".to_string()),
                    excerpt: None,
                    reason: Some("source context".to_string()),
                    source_id: Some(source.id.clone()),
                    chunk_index: Some(0),
                    source_text_hash: Some(stable_text_hash("alpha qa quote from source context")),
                    span_start: Some(0),
                    span_end: Some(14),
                    locator_status: "located".to_string(),
                    match_count: 1,
                },
                SaveReportCitationInput {
                    citation_index: 1,
                    target_kind: "point".to_string(),
                    target_id: "round-nineteen-point".to_string(),
                    label: Some("P1".to_string()),
                    title: Some("QA Point".to_string()),
                    quote: Some("point qa quote".to_string()),
                    excerpt: None,
                    reason: Some("point context".to_string()),
                    source_id: None,
                    chunk_index: None,
                    source_text_hash: Some(stable_text_hash(
                        "point qa quote from extracted insight",
                    )),
                    span_start: Some(0),
                    span_end: Some(14),
                    locator_status: "located".to_string(),
                    match_count: 1,
                },
            ],
        )
        .unwrap();
        save_report(
            &conn,
            SaveReportInput {
                title: "Weak Investigation".to_string(),
                kind: "investigation".to_string(),
                source_name: Some("Round 19".to_string()),
                body_md: "# Weak\n\nNo citations here.".to_string(),
                summary: "short".to_string(),
                citations_json: "[]".to_string(),
            },
        )
        .unwrap();

        let before_counts = (
            table_count(&conn, "reports"),
            table_count(&conn, "report_claims"),
            table_count(&conn, "report_citations"),
            table_count(&conn, "source_documents"),
            table_count(&conn, "points"),
        );
        let eval = run_investigation_qa_eval(
            &conn,
            InvestigationQaEvalInput {
                report_id: None,
                limit: Some(10),
            },
        )
        .unwrap();
        let after_counts = (
            table_count(&conn, "reports"),
            table_count(&conn, "report_claims"),
            table_count(&conn, "report_citations"),
            table_count(&conn, "source_documents"),
            table_count(&conn, "points"),
        );

        assert_eq!(before_counts, after_counts);
        assert_eq!(eval.case_count, 2);
        assert_eq!(eval.pass_count, 1);
        assert_eq!(eval.fail_count, 1);
        assert!(eval.average_score > 0.0);
        assert!(eval.source_inspiration.contains("Round 19"));

        let strong_case = eval
            .cases
            .iter()
            .find(|case| case.report_id == strong.id)
            .unwrap();
        assert_eq!(strong_case.status, "pass");
        assert_eq!(strong_case.unique_citation_targets, 2);
        assert!(strong_case
            .expected_citation_kinds
            .contains(&"source".to_string()));
        assert!(strong_case
            .expected_citation_kinds
            .contains(&"point".to_string()));
        assert!(strong_case
            .checks
            .iter()
            .any(|check| check.name == "multi_document_context" && check.status == "pass"));

        let targeted = run_investigation_qa_eval(
            &conn,
            InvestigationQaEvalInput {
                report_id: Some(strong.id.clone()),
                limit: Some(10),
            },
        )
        .unwrap();
        assert_eq!(targeted.case_count, 1);
        assert_eq!(targeted.pass_count, 1);

        let manifest_item = list_command_palette_items(CommandPaletteInput {
            query: Some("kotaemon multi document qa fixtures".to_string()),
            category: Some("evaluations".to_string()),
            limit: Some(20),
        });
        assert!(manifest_item.items.iter().any(|item| {
            item.command_name == "run_investigation_qa_eval"
                && item.wrapper_name == "runInvestigationQaEval"
                && item.source_inspiration.contains("Round 19")
        }));
    }

    #[test]
    fn capability_scorecard_summarizes_all_refinement_rounds() {
        let scorecard = build_capability_scorecard();

        assert_eq!(scorecard.item_count, 20);
        assert_eq!(scorecard.completed_count, 20);
        assert!(scorecard.read_only_count >= 12);
        assert!(scorecard.write_count >= 3);
        assert!(scorecard.average_impact_score > 0.75);
        assert!(scorecard.average_risk_score < 0.20);
        assert!(scorecard
            .recommendations
            .iter()
            .any(|item| item.contains("read-only diagnostics")));
        assert!(scorecard.items.iter().any(|item| {
            item.round == 19
                && item
                    .command_names
                    .contains(&"run_investigation_qa_eval".to_string())
        }));
        assert!(scorecard.items.iter().any(|item| {
            item.round == 20
                && item
                    .command_names
                    .contains(&"build_capability_scorecard".to_string())
                && item.source_inspiration.contains("Cross-project")
        }));

        let manifest_item = list_command_palette_items(CommandPaletteInput {
            query: Some("round 20 capability scorecard roadmap".to_string()),
            category: Some("system".to_string()),
            limit: Some(20),
        });
        assert!(manifest_item.items.iter().any(|item| {
            item.command_name == "build_capability_scorecard"
                && item.wrapper_name == "buildCapabilityScorecard"
                && item.source_inspiration.contains("Round 20")
        }));
    }

    #[test]
    fn journal_entries_list_search_and_invalidate() {
        let conn = memory_db();
        let entry = save_journal_entry(
            &conn,
            SaveJournalEntryInput {
                query: "market durability".to_string(),
                note: "Journal note about pricing power".to_string(),
                tags: vec!["market".to_string(), "pricing".to_string()],
                source_ids: vec!["source-1".to_string()],
                point_ids: vec!["point-1".to_string()],
                evidence_ids: vec!["evidence-1".to_string()],
                report_ids: vec!["report-1".to_string()],
                created_report_id: Some("report-1".to_string()),
                source_kind: "investigation".to_string(),
            },
        )
        .unwrap();

        assert_eq!(entry.query, "market durability");
        assert_eq!(list_recent_journal_entries(&conn, 10).unwrap().len(), 1);
        assert_eq!(
            search_journal_entries(&conn, "pricing", 10).unwrap()[0].id,
            entry.id
        );

        invalidate_journal_entry(&conn, &entry.id, "superseded").unwrap();
        let invalidated = get_journal_entry(&conn, &entry.id).unwrap().unwrap();
        assert_eq!(
            invalidated.invalidated_reason.as_deref(),
            Some("superseded")
        );
        assert!(search_journal_entries(&conn, "pricing", 10)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn review_items_schedule_snooze_and_dismiss() {
        let conn = memory_db();
        let item = add_review_item(
            &conn,
            AddReviewItemInput {
                target_kind: "source".to_string(),
                target_id: "source-1".to_string(),
                title: "Review source".to_string(),
                note: Some("remember thesis".to_string()),
                priority: Some("high".to_string()),
                due_at: Some("2026-01-01T00:00:00Z".to_string()),
            },
        )
        .unwrap();

        assert_eq!(list_due_review_items(&conn).unwrap()[0].id, item.id);
        let completed = complete_review_item(&conn, &item.id, "easy").unwrap();
        assert_eq!(completed.review_count, 1);
        assert_eq!(completed.interval_days, Some(14));
        assert!(completed.ease.unwrap() > 2.5);

        let snoozed = snooze_review_item(&conn, &item.id, 3).unwrap();
        assert_eq!(snoozed.status, "active");
        dismiss_review_item(&conn, &item.id).unwrap();
        let dismissed = get_review_item(&conn, &item.id).unwrap().unwrap();
        assert_eq!(dismissed.status, "dismissed");
    }

    #[test]
    fn review_queue_plan_ranks_counts_and_overflow() {
        let conn = memory_db();
        let due_at = "2026-01-01T00:00:00Z".to_string();
        let normal = add_review_item(
            &conn,
            AddReviewItemInput {
                target_kind: "source".to_string(),
                target_id: "source-normal".to_string(),
                title: "Normal source".to_string(),
                note: None,
                priority: Some("normal".to_string()),
                due_at: Some(due_at.clone()),
            },
        )
        .unwrap();
        let high = add_review_item(
            &conn,
            AddReviewItemInput {
                target_kind: "point".to_string(),
                target_id: "point-high".to_string(),
                title: "High point".to_string(),
                note: None,
                priority: Some("high".to_string()),
                due_at: Some(due_at.clone()),
            },
        )
        .unwrap();
        let low = add_review_item(
            &conn,
            AddReviewItemInput {
                target_kind: "evidence".to_string(),
                target_id: "evidence-low".to_string(),
                title: "Low evidence".to_string(),
                note: None,
                priority: Some("low".to_string()),
                due_at: Some(due_at),
            },
        )
        .unwrap();
        let future = add_review_item(
            &conn,
            AddReviewItemInput {
                target_kind: "report".to_string(),
                target_id: "report-future".to_string(),
                title: "Future report".to_string(),
                note: None,
                priority: Some("high".to_string()),
                due_at: Some("2026-01-10T00:00:00Z".to_string()),
            },
        )
        .unwrap();
        let dismissed = add_review_item(
            &conn,
            AddReviewItemInput {
                target_kind: "journal".to_string(),
                target_id: "journal-dismissed".to_string(),
                title: "Dismissed journal".to_string(),
                note: None,
                priority: Some("high".to_string()),
                due_at: Some("2026-01-01T00:00:00Z".to_string()),
            },
        )
        .unwrap();
        dismiss_review_item(&conn, &dismissed.id).unwrap();

        let now = chrono::DateTime::parse_from_rfc3339("2026-01-05T00:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        let plan = build_review_queue_plan_from_items(
            list_all_review_items(&conn).unwrap(),
            ReviewQueuePlanInput {
                mode: Some("due".to_string()),
                limit: Some(2),
            },
            now,
        );

        assert_eq!(plan.mode, "due");
        assert_eq!(plan.limit, 2);
        assert_eq!(plan.candidate_count, 3);
        assert_eq!(plan.due_count, 3);
        assert_eq!(plan.overdue_count, 3);
        assert_eq!(plan.future_count, 1);
        assert_eq!(plan.dismissed_count, 1);
        assert_eq!(plan.overflow_count, 1);
        assert_eq!(plan.items.len(), 2);
        assert_eq!(plan.items[0].item.id, high.id);
        assert_eq!(plan.items[0].priority_rank, 3);
        assert_eq!(plan.items[0].position, 1);
        assert_eq!(plan.items[1].item.id, normal.id);
        assert!(!plan.items.iter().any(|entry| entry.item.id == low.id));
        assert!(!plan.items.iter().any(|entry| entry.item.id == future.id));
        assert!(!plan.items.iter().any(|entry| entry.item.id == dismissed.id));
        assert!(plan.items[0].reason.contains("high priority"));
    }

    #[test]
    fn review_queue_plan_normalizes_mode_and_limit() {
        let now = chrono::DateTime::parse_from_rfc3339("2026-01-05T00:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        let plan = build_review_queue_plan_from_items(
            Vec::new(),
            ReviewQueuePlanInput {
                mode: Some("unsupported".to_string()),
                limit: Some(0),
            },
            now,
        );

        assert_eq!(plan.mode, "due");
        assert_eq!(plan.limit, 1);
    }

    #[test]
    fn mirror_config_round_trips_with_defaults() {
        let conn = memory_db();
        let default = get_open_data_mirror_config(&conn).unwrap();
        assert!(!default.enabled);
        assert!(default.export_sources);

        set_open_data_mirror_config(
            &conn,
            OpenDataMirrorConfig {
                enabled: true,
                root_path: Some("D:/Mirror".to_string()),
                export_sources: true,
                export_evidence: false,
                export_reports: true,
                export_journal: false,
                export_gallery_index: true,
            },
        )
        .unwrap();

        let saved = get_open_data_mirror_config(&conn).unwrap();
        assert!(saved.enabled);
        assert_eq!(saved.root_path.as_deref(), Some("D:/Mirror"));
        assert!(!saved.export_evidence);
        assert!(!saved.export_journal);
    }

    #[test]
    fn indexed_folders_and_files_round_trip_without_deleting_sources() {
        let conn = memory_db();
        let folder = add_indexed_folder(&conn, "D:/Research Notes").unwrap();
        let duplicate = add_indexed_folder(&conn, "D:/Research Notes").unwrap();
        assert_eq!(folder.id, duplicate.id);

        let file = upsert_indexed_file(
            &conn,
            UpsertIndexedFileInput {
                folder_id: folder.id.clone(),
                path: "D:/Research Notes/a.md".to_string(),
                canonical_path: Some("D:/Research Notes/a.md".to_string()),
                name: "a.md".to_string(),
                extension: Some("md".to_string()),
                size_bytes: Some(123),
                modified_at: Some("2026-07-05T00:00:00Z".to_string()),
                source_id: Some("source-1".to_string()),
                descriptor_kind: "markdown".to_string(),
                read_status: "ok".to_string(),
                index_status: "indexed".to_string(),
                metadata_json:
                    r#"{"kind":"indexed_file","markdown":{"headings":[{"level":1,"title":"A"}]}}"#
                        .to_string(),
                preview_text: Some("# A\npreview".to_string()),
                text_hash: Some("fnv1a64:test".to_string()),
                extracted_chars: Some(11),
                total_chars: Some(11),
                last_error: None,
            },
        )
        .unwrap();
        assert_eq!(file.source_id.as_deref(), Some("source-1"));
        assert_eq!(file.descriptor_kind, "markdown");
        assert_eq!(file.read_status, "ok");
        assert_eq!(file.index_status, "indexed");
        assert_eq!(file.preview_text.as_deref(), Some("# A\npreview"));
        assert_eq!(file.text_hash.as_deref(), Some("fnv1a64:test"));
        assert_eq!(
            list_indexed_files_for_folder(&conn, &folder.id)
                .unwrap()
                .len(),
            1
        );

        remove_indexed_folder(&conn, &folder.id).unwrap();
        assert!(get_indexed_folder(&conn, &folder.id).unwrap().is_none());
        assert!(list_indexed_files_for_folder(&conn, &folder.id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn rebuild_asset_relations_derives_report_journal_evidence_gallery_and_review_links() {
        let mut conn = memory_db();
        let source = upsert_source_document(
            &conn,
            "file",
            "D:/docs/relation.md",
            Some("Relation Source"),
            r#"{"kind":"file"}"#,
        )
        .unwrap();
        replace_source_chunks(&mut conn, &source.id, &["relation chunk".to_string()]).unwrap();
        insert_point(
            &conn,
            "point-relation",
            "Point relation",
            None,
            "2026-07-05T00:00:00Z",
        );
        insert_point_source_link(&conn, "point-relation", &source.id, 0, Some("relation")).unwrap();
        let evidence = save_evidence(
            &mut conn,
            evidence_input(
                "Relation claim",
                Some("point-relation"),
                Some(&source.id),
                "2026-07-05T00:01:00Z",
            ),
        )
        .unwrap();
        let mut report = report_input("Relation Report", "investigation", "relation");
        report.citations_json = format!(
            r#"[{{"kind":"source","label":"S1","id":"{}","title":"Source","excerpt":"source excerpt","sourceId":"{}","chunkIndex":0,"url":null}},{{"kind":"evidence","label":"E1","id":"{}","title":"Evidence","excerpt":"evidence excerpt","sourceId":"{}","chunkIndex":0,"url":null}}]"#,
            source.id, source.id, evidence.id, source.id
        );
        let saved_report = save_report(&conn, report).unwrap();
        let journal = save_journal_entry(
            &conn,
            SaveJournalEntryInput {
                query: "relation query".to_string(),
                note: "relation note".to_string(),
                tags: Vec::new(),
                source_ids: vec![source.id.clone()],
                point_ids: vec!["point-relation".to_string()],
                evidence_ids: vec![evidence.id.clone()],
                report_ids: vec![saved_report.id.clone()],
                created_report_id: Some(saved_report.id.clone()),
                source_kind: "investigation".to_string(),
            },
        )
        .unwrap();
        insert_gallery_item(
            &conn,
            &GalleryItem {
                id: "gallery-relation".to_string(),
                file_path: "D:/gallery/relation.webp".to_string(),
                thumbnail_path: "D:/gallery/relation-thumb.webp".to_string(),
                prompt: "relation diagram".to_string(),
                generated_at: "2026-07-05T00:03:00Z".to_string(),
                download_status: "ok".to_string(),
                point_ids: vec!["point-relation".to_string()],
                source_points: Vec::new(),
            },
        )
        .unwrap();
        let review = add_review_item(
            &conn,
            AddReviewItemInput {
                target_kind: "report".to_string(),
                target_id: saved_report.id.clone(),
                title: "Review report".to_string(),
                note: None,
                priority: None,
                due_at: Some("2026-01-01T00:00:00Z".to_string()),
            },
        )
        .unwrap();

        let count = rebuild_asset_relations(&conn).unwrap();
        assert!(count > 0);
        let source_relations = discover_related_assets(&conn, "source", &source.id).unwrap();
        assert!(source_relations
            .iter()
            .any(|relation| relation.relation == "co_cited"));
        assert!(source_relations
            .iter()
            .any(|relation| relation.from_kind == "journal" || relation.to_kind == "journal"));
        let review_relations = discover_related_assets(&conn, "review", &review.id).unwrap();
        assert!(review_relations
            .iter()
            .any(|relation| relation.relation == "review_related"));
        let journal_relations = discover_related_assets(&conn, "journal", &journal.id).unwrap();
        assert!(!journal_relations.is_empty());
    }

    #[test]
    fn search_gallery_matches_prompt_paths_and_source_points() {
        let conn = memory_db();
        insert_gallery_item(
            &conn,
            &GalleryItem {
                id: "gallery-match".to_string(),
                file_path: "D:/gallery/market-map.webp".to_string(),
                thumbnail_path: "D:/gallery/market-map-thumb.webp".to_string(),
                prompt: "market structure diagram".to_string(),
                generated_at: "2026-07-05T00:02:00Z".to_string(),
                download_status: "ok".to_string(),
                point_ids: vec!["point-market".to_string()],
                source_points: vec![GallerySourcePoint {
                    id: "point-market".to_string(),
                    content: "pricing power and supply chain".to_string(),
                    source_doc_name: Some("Market Memo".to_string()),
                }],
            },
        )
        .unwrap();
        insert_gallery_item(
            &conn,
            &GalleryItem {
                id: "gallery-other".to_string(),
                file_path: "D:/gallery/other.webp".to_string(),
                thumbnail_path: "D:/gallery/other-thumb.webp".to_string(),
                prompt: "unrelated artwork".to_string(),
                generated_at: "2026-07-05T00:01:00Z".to_string(),
                download_status: "ok".to_string(),
                point_ids: Vec::new(),
                source_points: Vec::new(),
            },
        )
        .unwrap();

        for term in [
            "market structure",
            "market-map",
            "pricing power",
            "Market Memo",
        ] {
            let results = search_gallery(&conn, term, 10).unwrap();
            assert!(
                results.iter().any(|item| item.id == "gallery-match"),
                "expected search term {term} to return gallery-match"
            );
        }

        assert!(search_gallery(&conn, "missing term", 10)
            .unwrap()
            .is_empty());
        assert!(search_gallery(&conn, "market", 0).unwrap().is_empty());
    }

    #[test]
    fn extract_keywords_includes_cjk_trigrams_for_fts() {
        let keywords = extract_keywords("养老金改革影响年轻人，养老金制度需要调整。");

        assert!(keywords.iter().any(|keyword| keyword == "养老金"));
        assert!(keywords.iter().any(|keyword| keyword == "养老"));
    }

    #[test]
    fn find_similar_points_falls_back_to_keyword_overlap() {
        let conn = memory_db();
        insert_point(
            &conn,
            "current",
            "养老金不够了，需要提高缴费比例。",
            None,
            "2026-06-08T00:00:00Z",
        );
        insert_point(
            &conn,
            "related",
            "公开报道提到养老资金压力，各省会调整具体比例。",
            None,
            "2026-06-08T00:01:00Z",
        );
        insert_point(
            &conn,
            "child",
            "养老资金压力这个子节点不应返回。",
            Some("current"),
            "2026-06-08T00:02:00Z",
        );
        insert_point(
            &conn,
            "unrelated",
            "城市文旅消费正在恢复。",
            None,
            "2026-06-08T00:03:00Z",
        );

        let keywords = vec!["养老".to_string(), "比例".to_string()];
        let matches = find_similar_points(&conn, "current", &keywords, 8).unwrap();
        let ids = matches
            .into_iter()
            .map(|point| point.id)
            .collect::<Vec<_>>();

        assert_eq!(ids, vec!["related"]);
    }
}
