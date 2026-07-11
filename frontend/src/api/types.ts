export interface AppConfig {
  openaiApiKey: string
  openaiModel: string
  openaiBaseUrl: string
  imageBaseUrl: string
  imageApiKey: string
  imageModel: string
  imageProviderKey: string
  imageCustomEndpoint: string
  imageSize: string
  imageKnowledgeStylePrompt: string
  providerKey: string
  customEndpoint: string
  customProviderName: string
  extraHeaders: string
  searchEnabled: boolean
  searchApiKey: string
  searchModel: string
  searchBaseUrl: string
  searchProviderKey: string
  searchCustomEndpoint: string
  factCheckLanguage: string
  annotationUnderlineColor: string
  annotationWavyColor: string
  annotationHighlightColor: string
  commentatorName: string
  commentatorStyle: string
  commentatorEmoji: string
  commentatorProfiles: CommentatorProfile[]
  customMentalModels: MentalModel[]
}

export interface CommentatorProfile {
  id: string
  name: string
  emoji: string
  domain: string
  style: string
  bio?: string | null
  sourceKind: 'builtin' | 'github' | 'manual' | string
  sourceName?: string | null
  sourceUrl?: string | null
}

export interface ConfigProfile {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  imageBaseUrl?: string
  imageApiKey?: string
  imageModel?: string
  imageProviderKey?: string
  imageCustomEndpoint?: string
  imageSize?: string
  imageKnowledgeStylePrompt?: string
  searchEnabled?: boolean
  searchBaseUrl?: string
  searchApiKey?: string
  searchModel?: string
  searchProviderKey?: string
  searchCustomEndpoint?: string
}

export interface ExtractedPoint {
  content: string
  tagType: string
  anchor?: string
}

export interface PointSourceLinkInput {
  sourceId: string
  chunkIndex: number
  anchorText?: string | null
}

export interface StoredPoint {
  id: string
  content: string
  tagType: string | null
  parentId: string | null
  sourceDocName: string | null
  sourceExcerpt: string | null
  createdAt: string
  archived: boolean
  starred: boolean
}

export interface MentalModel {
  key: string
  name: string
  description: string
  promptLens?: string
}

export interface FrameworkRecommendation {
  key: string
  name: string
  reason: string
}

export type DeepenAction = 'explain' | 'counter' | 'followup' | 'framework'

export interface Label {
  category: string
  sub: string
}

export interface ChunkCard {
  index: number
  text: string
  summary: string
  hotTake: string
  commentatorName?: string | null
  commentatorEmoji?: string | null
  labels: Label[]
}

export interface FactCheckSource {
  title: string
  url: string
  snippet: string
}

export interface FactCheckResult {
  claim: string
  answer: string
  context: string
  extra: string[]
  sources: FactCheckSource[]
}

export interface EvidenceSourceRecord {
  id: string
  evidenceId: string
  title: string | null
  url: string
  snippet: string | null
  stance: 'support' | 'contradict' | 'context' | 'unknown'
  createdAt: string
}

export interface EvidenceRecord {
  id: string
  claim: string
  verdict: 'supported' | 'contradicted' | 'mixed' | 'uncertain'
  answer: string
  reasoning: string | null
  context: string | null
  pointId: string | null
  sourceId: string | null
  chunkIndex: number | null
  checkedAt: string
  createdAt: string
  sources: EvidenceSourceRecord[]
}

export interface SaveEvidenceInput {
  result: FactCheckResult
  pointId?: string | null
  sourceId?: string | null
  chunkIndex?: number | null
}

export interface DigestCitation {
  kind: 'source' | 'point' | 'evidence'
  label: string
  id: string
  title: string
  excerpt: string
  sourceId: string | null
  chunkIndex: number | null
  url: string | null
  quote?: string | null
  reason?: string | null
  sourceTextHash?: string | null
}

export interface DigestResult {
  content: string
  citations: DigestCitation[]
  invocationId?: string | null
}

export type CitationLocatorStatus =
  | 'located'
  | 'multiple_matches'
  | 'not_found'
  | 'stale'
  | 'target_missing'
  | 'not_applicable'
  | string

export interface CitationLocatorInput {
  kind: DigestCitation['kind']
  id: string
  quote?: string | null
  excerpt?: string | null
  sourceId?: string | null
  chunkIndex?: number | null
  sourceTextHash?: string | null
}

export interface CitationLocation {
  start: number
  end: number
  snippet: string
}

export interface CitationLocatorResult {
  status: CitationLocatorStatus
  targetKind: string
  targetId: string
  targetTitle: string | null
  quote: string | null
  matchCount: number
  locations: CitationLocation[]
  sourceTextHash: string | null
  message: string | null
}

export interface ReportCitationAuditItem {
  citationIndex: number
  kind: DigestCitation['kind']
  id: string
  label: string
  title: string
  quote: string | null
  excerpt: string | null
  sourceId: string | null
  chunkIndex: number | null
  locator: CitationLocatorResult
}

export interface ReportCitationAudit {
  reportId: string
  total: number
  locatedCount: number
  multipleMatchesCount: number
  notFoundCount: number
  staleCount: number
  targetMissingCount: number
  notApplicableCount: number
  citations: ReportCitationAuditItem[]
}

export type ReportClaimStatus = 'cited' | 'inferred' | 'unsupported' | string

export interface ReportClaimRecord {
  id: string
  reportId: string
  claimIndex: number
  claimText: string
  claimStatus: ReportClaimStatus
  citationLabels: string[]
  createdAt: string
}

export interface ReportCitationRecord {
  id: string
  reportId: string
  citationIndex: number
  targetKind: DigestCitation['kind']
  targetId: string
  label: string | null
  title: string | null
  quote: string | null
  excerpt: string | null
  reason: string | null
  sourceId: string | null
  chunkIndex: number | null
  sourceTextHash: string | null
  spanStart: number | null
  spanEnd: number | null
  locatorStatus: CitationLocatorStatus
  matchCount: number
  createdAt: string
}

export interface ReportAuditCoverage {
  totalClaims: number
  citedClaims: number
  inferredClaims: number
  unsupportedClaims: number
  totalCitations: number
  locatedCitations: number
  warningCitations: number
  missingCitations: number
  coverageRatio: number
  warnings: string[]
}

export interface ReportAuditRecord {
  reportId: string
  claims: ReportClaimRecord[]
  citations: ReportCitationRecord[]
  coverage: ReportAuditCoverage
}

export interface InvestigationQaEvalInput {
  reportId?: string | null
  limit?: number | null
}

export interface InvestigationQaEvalCheck {
  name: string
  status: 'pass' | 'warning' | 'fail' | string
  score: number
  message: string
}

export interface InvestigationQaEvalCase {
  caseId: string
  reportId: string
  title: string
  question: string
  expectedCitationKinds: string[]
  uniqueCitationTargets: number
  status: 'pass' | 'warning' | 'fail' | string
  score: number
  checks: InvestigationQaEvalCheck[]
  warnings: string[]
}

export interface InvestigationQaEvalReport {
  generatedAt: string
  caseCount: number
  passCount: number
  warningCount: number
  failCount: number
  averageScore: number
  cases: InvestigationQaEvalCase[]
  warnings: string[]
  sourceInspiration: string
}

export type CitationQualitySeverity = 'ok' | 'warning' | 'critical' | string

export interface CitationQualityReportRow {
  reportId: string
  title: string
  kind: ReportKind | string
  createdAt: string
  totalClaims: number
  citedClaims: number
  inferredClaims: number
  unsupportedClaims: number
  totalCitations: number
  locatedCitations: number
  warningCitations: number
  missingCitations: number
  coverageRatio: number
  qualityScore: number
  severity: CitationQualitySeverity
  warnings: string[]
}

export interface CitationQualityProblemCitation {
  reportId: string
  reportTitle: string
  citationIndex: number
  label: string | null
  title: string | null
  targetKind: DigestCitation['kind']
  targetId: string
  locatorStatus: CitationLocatorStatus
  reason: string
  sourceId: string | null
  chunkIndex: number | null
  message: string
}

export interface CitationQualityDashboard {
  generatedAt: string
  reportCount: number
  auditedReportCount: number
  totalClaims: number
  citedClaims: number
  inferredClaims: number
  unsupportedClaims: number
  totalCitations: number
  locatedCitations: number
  warningCitations: number
  missingCitations: number
  staleCitations: number
  ambiguousCitations: number
  notFoundCitations: number
  targetMissingCitations: number
  notApplicableCitations: number
  coverageRatio: number
  qualityScore: number
  reports: CitationQualityReportRow[]
  problemCitations: CitationQualityProblemCitation[]
  warnings: string[]
}

export interface AiInvocationRecord {
  id: string
  taskKind: string
  modelProfileId: string | null
  modelName: string | null
  promptVersion: string
  inputQuery: string | null
  inputRefsJson: string
  contextManifestJson: string
  outputRefKind: string | null
  outputRefId: string | null
  tokenUsageJson: string | null
  warningsJson: string
  createdAt: string
}

export interface InvestigationContextItemRecord {
  id: string
  invocationId: string
  targetKind: string
  targetId: string
  label: string | null
  role: string
  included: boolean
  truncated: boolean
  reason: string | null
  charCount: number | null
  sourceTextHash: string | null
  createdAt: string
}

export interface ReportInvocationAudit {
  invocation: AiInvocationRecord
  contextItems: InvestigationContextItemRecord[]
  total: number
  includedCount: number
  truncatedCount: number
}

export interface InvestigationInput {
  query: string
  scope: {
    sourceIds: string[]
    pointIds: string[]
    evidenceIds: string[]
    reportIds: string[]
    includeLibrarySearch: boolean
    includeJournal: boolean
  }
  mode: 'quick' | 'standard' | 'deep'
}

export type ReportKind = 'digest' | 'synthesis' | 'investigation'

export interface ReportRecord {
  id: string
  title: string
  kind: ReportKind
  sourceName: string | null
  bodyMd: string
  summary: string
  citationsJson: string
  createdAt: string
}

export interface SaveReportInput {
  title: string
  kind: ReportKind
  sourceName?: string | null
  bodyMd: string
  summary: string
  citationsJson: string
  invocationId?: string | null
}

export interface ReportStarterTemplate {
  id: string
  name: string
  category: string
  kind: ReportKind
  description: string
  sections: string[]
  sourceInspiration: string
}

export interface BuildReportStarterInput {
  templateId: string
  query: string
  sourceIds: string[]
  pointIds: string[]
  evidenceIds: string[]
}

export interface ReportStarterContextItem {
  kind: DigestCitation['kind']
  id: string
  label: string
  title: string
  excerpt: string
  reason: string
}

export interface ReportStarterDraft {
  template: ReportStarterTemplate
  saveInput: SaveReportInput
  contextItems: ReportStarterContextItem[]
  warnings: string[]
}

export type ReprocessQueueKind = 'indexed_file' | 'source' | 'report'

export type ReprocessQueueSeverity = 'critical' | 'warning'

export interface ReprocessQueueInput {
  kinds?: ReprocessQueueKind[] | null
  limit?: number | null
}

export interface ReprocessQueueItem {
  targetKind: ReprocessQueueKind
  targetId: string
  title: string
  severity: ReprocessQueueSeverity
  issueKind: string
  reason: string
  suggestedAction: string
  sourceId: string | null
  folderId: string | null
  metadataJson: string
}

export interface ReprocessQueue {
  generatedAt: string
  itemCount: number
  criticalCount: number
  warningCount: number
  items: ReprocessQueueItem[]
  warnings: string[]
}

export type DuplicateAssetKind = 'source' | 'point' | 'report'

export interface DuplicateAssetInput {
  kinds?: DuplicateAssetKind[] | null
  limit?: number | null
}

export interface DuplicateAssetCandidate {
  kind: DuplicateAssetKind
  id: string
  title: string
  excerpt: string
  fingerprint: string
  metadataJson: string
}

export interface DuplicateAssetGroup {
  groupId: string
  duplicateKey: string
  matchKind: 'exact_fingerprint' | 'near_fingerprint' | string
  score: number
  reason: string
  candidates: DuplicateAssetCandidate[]
}

export interface DuplicateAssetReport {
  generatedAt: string
  groupCount: number
  candidateCount: number
  groups: DuplicateAssetGroup[]
  warnings: string[]
}

export interface GraphNeighborhoodInput {
  kind: AssetKind
  id: string
  depth?: number | null
  includeSuggestions?: boolean | null
  limit?: number | null
}

export interface GraphNeighborhoodNode {
  kind: AssetKind
  id: string
  title: string
  label: string
  depth: number
  root: boolean
  assetExists: boolean
  metadataJson: string
}

export interface GraphNeighborhoodEdge {
  fromKind: AssetKind
  fromId: string
  toKind: AssetKind
  toId: string
  relation: AssetRelation | string
  reason: string
  score: number
  edgeKind: 'relation' | 'suggested_backlink' | 'suggested_duplicate' | string
  provenance: string
  existingRelation: boolean
}

export interface GraphNeighborhoodPreview {
  generatedAt: string
  rootKind: AssetKind
  rootId: string
  depth: number
  nodeCount: number
  edgeCount: number
  nodes: GraphNeighborhoodNode[]
  edges: GraphNeighborhoodEdge[]
  warnings: string[]
}

export interface CommandPaletteInput {
  query?: string | null
  category?: string | null
  limit?: number | null
}

export type CommandPaletteExecutionKind =
  | 'read'
  | 'write'
  | 'draft'
  | 'diagnostic'
  | 'export'
  | 'model'
  | string

export type CommandPaletteRisk =
  | 'read_only'
  | 'creates_or_updates_local_records'
  | 'draft_only'
  | 'writes_export_files'
  | 'model_call'
  | string

export interface CommandPaletteItem {
  id: string
  title: string
  category: string
  description: string
  keywords: string[]
  commandName: string
  wrapperName: string
  executionKind: CommandPaletteExecutionKind
  requiredInput: string[]
  inputHint: string
  risk: CommandPaletteRisk
  shortcutHint: string | null
  sourceInspiration: string
  priority: number
}

export interface CommandPaletteManifest {
  generatedAt: string
  itemCount: number
  categories: string[]
  items: CommandPaletteItem[]
  warnings: string[]
}

export interface CapabilityScorecardItem {
  round: number
  sourceInspiration: string
  capability: string
  status: string
  boundary: 'read_only' | 'write' | 'draft_only' | 'model_call' | string
  impactScore: number
  riskScore: number
  readiness: string
  commandNames: string[]
  verification: string
  nextStep: string
}

export interface CapabilityScorecard {
  generatedAt: string
  itemCount: number
  completedCount: number
  readOnlyCount: number
  writeCount: number
  draftCount: number
  modelCallCount: number
  averageImpactScore: number
  averageRiskScore: number
  items: CapabilityScorecardItem[]
  recommendations: string[]
  sourceInspiration: string
}

export type AutomationSuggestionCategory =
  | 'review'
  | 'citations'
  | 'reprocess'
  | 'import'
  | 'duplicates'
  | 'capture'
  | 'sources'
  | 'retrieval'
  | string

export type AutomationSuggestionPriority = 'critical' | 'high' | 'normal' | 'low' | string

export interface AutomationSuggestionInput {
  categories?: AutomationSuggestionCategory[] | null
  limit?: number | null
}

export interface AutomationSuggestionItem {
  id: string
  category: AutomationSuggestionCategory
  priority: AutomationSuggestionPriority
  priorityScore: number
  subject: string
  summary: string
  reason: string
  actionLabel: string
  commandName: string
  wrapperName: string
  inputJson: string
  targetKind: string | null
  targetId: string | null
  scheduleHint: string
  sourceInspiration: string
}

export interface AutomationSuggestionReport {
  generatedAt: string
  itemCount: number
  criticalCount: number
  highCount: number
  normalCount: number
  lowCount: number
  items: AutomationSuggestionItem[]
  warnings: string[]
}

export interface SaveJournalEntryInput {
  query: string
  note: string
  tags: string[]
  sourceIds: string[]
  pointIds: string[]
  evidenceIds: string[]
  reportIds: string[]
  createdReportId?: string | null
  sourceKind: string
}

export interface JournalEntry {
  id: string
  query: string
  note: string
  tagsJson: string
  sourceIdsJson: string
  pointIdsJson: string
  evidenceIdsJson: string
  reportIdsJson: string
  createdReportId: string | null
  sourceKind: string
  createdAt: string
  invalidatedAt: string | null
  invalidatedReason: string | null
}

export type AssetKind = 'source' | 'point' | 'evidence' | 'report' | 'journal' | 'gallery' | 'review'
export type SearchAssetKind = AssetKind | 'indexed_file'

export interface SearchAssetsInput {
  query: string
  kinds?: SearchAssetKind[] | null
  filter?: string | null
  limit?: number | null
}

export interface SearchAssetResult {
  kind: SearchAssetKind
  id: string
  title: string
  snippet: string
  preview: string | null
  reason: string
  score: number
  sourceId: string | null
  chunkIndex: number | null
  metadataJson: string
}

export interface SearchRankingExplanationInput {
  query: string
  kinds?: SearchAssetKind[] | null
  filter?: string | null
  limit?: number | null
}

export interface SearchRankingComponent {
  name: string
  value: number
  weight: number
  contribution: number
  usedForRanking: boolean
  reason: string
}

export interface SearchRankingItemExplanation {
  rank: number
  kind: SearchAssetKind
  id: string
  title: string
  score: number
  scoreDeltaFromTop: number
  reason: string
  matchedTerms: string[]
  missingTerms: string[]
  matchedFields: string[]
  components: SearchRankingComponent[]
  sourceId: string | null
  chunkIndex: number | null
  metadataJson: string
}

export interface SearchRankingExplanation {
  query: string
  queryTerms: string[]
  ranker: string
  diagnosticModel: string
  resultCount: number
  analyzedCount: number
  maxScore: number | null
  minScore: number | null
  items: SearchRankingItemExplanation[]
  warnings: string[]
  generatedAt: string
}

export interface BlockReferenceInput {
  kind: SearchAssetKind
  id: string
  query?: string | null
  limit?: number | null
  includeRelated?: boolean | null
}

export interface BlockReferenceCard {
  index: number
  blockKind: string
  assetKind: SearchAssetKind
  assetId: string
  blockId: string
  title: string
  excerpt: string
  locator: string
  sourceId: string | null
  chunkIndex: number | null
  matchedTerms: string[]
  matchedFields: string[]
  reason: string
  score: number
  commandName: string
  wrapperName: string
  inputJson: string
  metadataJson: string
  blockHash: string
}

export interface BlockReferenceManifest {
  rootKind: SearchAssetKind
  rootId: string
  rootTitle: string | null
  query: string | null
  blockCount: number
  cards: BlockReferenceCard[]
  warnings: string[]
  generatedAt: string
  sourceInspiration: string
}

export interface BoardSnapshotInput {
  kind: SearchAssetKind
  id: string
  query?: string | null
  limit?: number | null
  includeRelated?: boolean | null
}

export interface BoardSnapshotNode {
  index: number
  nodeId: string
  lane: string
  x: number
  y: number
  assetKind: SearchAssetKind
  assetId: string
  blockKind: string
  blockId: string
  title: string
  excerpt: string
  locator: string
  commandName: string
  wrapperName: string
  inputJson: string
  blockHash: string
}

export interface BoardSnapshotEdge {
  fromNodeId: string
  toNodeId: string
  relation: string
  reason: string
}

export interface BoardSnapshotExport {
  rootKind: SearchAssetKind
  rootId: string
  title: string
  nodeCount: number
  edgeCount: number
  nodes: BoardSnapshotNode[]
  edges: BoardSnapshotEdge[]
  markdown: string
  warnings: string[]
  generatedAt: string
  sourceInspiration: string
}

export interface RetrievalContextInput {
  query: string
  kinds?: SearchAssetKind[] | null
  filter?: string | null
  limit?: number | null
  maxCharsPerItem?: number | null
}

export interface RetrievalContextItem {
  index: number
  kind: SearchAssetKind
  id: string
  title: string
  excerpt: string
  reason: string
  score: number
  sourceId: string | null
  chunkIndex: number | null
  metadataJson: string
}

export interface RetrievalContext {
  query: string
  itemCount: number
  totalChars: number
  items: RetrievalContextItem[]
  warnings: string[]
}

export type RetrievalProfileMode = 'automatic' | 'query' | 'chat'

export interface SaveRetrievalProfileInput {
  name: string
  description?: string | null
  query: string
  kinds?: SearchAssetKind[] | null
  filter?: string | null
  savedSearchId?: string | null
  limit?: number | null
  maxCharsPerItem?: number | null
  minScore?: number | null
  mode?: RetrievalProfileMode | null
}

export interface RetrievalProfile {
  id: string
  name: string
  description: string | null
  query: string
  kinds: SearchAssetKind[]
  filter: string | null
  savedSearchId: string | null
  limit: number
  maxCharsPerItem: number
  minScore: number
  mode: RetrievalProfileMode
  createdAt: string
  updatedAt: string
}

export interface PreviewRetrievalProfileInput {
  id: string
  queryOverride?: string | null
  limit?: number | null
  maxCharsPerItem?: number | null
}

export interface RetrievalProfilePreview {
  profile: RetrievalProfile
  savedSearch: SavedAssetSearch | null
  effectiveQuery: string
  effectiveKinds: SearchAssetKind[]
  effectiveFilter: string | null
  minScore: number
  context: RetrievalContext
  warnings: string[]
}

export interface BacklinkSuggestionInput {
  kind: SearchAssetKind
  id: string
  limit?: number | null
}

export interface BacklinkSuggestion {
  targetKind: SearchAssetKind
  targetId: string
  candidateKind: SearchAssetKind
  candidateId: string
  candidateTitle: string
  candidateExcerpt: string
  relation: AssetRelation
  reason: string
  score: number
  existingRelation: boolean
  sourceId: string | null
  chunkIndex: number | null
  metadataJson: string
}

export interface SaveAssetSearchInput {
  name: string
  query: string
  kinds?: SearchAssetKind[] | null
  filter?: string | null
  limit?: number | null
}

export interface SavedAssetSearch {
  id: string
  name: string
  query: string
  kinds: SearchAssetKind[]
  filter: string | null
  limit: number
  createdAt: string
  updatedAt: string
}

export interface SavedAssetSearchPreview {
  search: SavedAssetSearch
  resultCount: number
  results: SearchAssetResult[]
  warnings: string[]
}

export type QuickCaptureStatus = 'inbox' | 'resolved' | 'dismissed'

export type QuickCaptureTargetKind = 'journal' | 'point' | 'source'

export interface SaveQuickCaptureInput {
  content: string
  tags: string[]
  sourceKind?: string | null
}

export interface ResolveQuickCaptureInput {
  id: string
  targetKind: QuickCaptureTargetKind
  title?: string | null
  query?: string | null
  parentId?: string | null
}

export interface QuickCaptureItem {
  id: string
  content: string
  tags: string[]
  sourceKind: string
  status: QuickCaptureStatus
  resolvedKind: QuickCaptureTargetKind | null
  resolvedId: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface QuickCaptureResolution {
  item: QuickCaptureItem
  journal: JournalEntry | null
  point: StoredPoint | null
  source: SourceDocumentRecord | null
}

export type AssetRelation =
  | 'co_cited'
  | 'same_source'
  | 'supports'
  | 'contradicts'
  | 'same_topic'
  | 'derived_from'
  | 'review_related'

export interface AssetRelationRecord {
  id: string
  fromKind: AssetKind
  fromId: string
  toKind: AssetKind
  toId: string
  relation: AssetRelation
  reason: string
  score: number
  sourceKind: string
  createdAt: string
  vettedAt: string | null
}

export type ReviewTargetKind = 'source' | 'point' | 'evidence' | 'report' | 'journal'
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy'
export type ReviewPriority = 'low' | 'normal' | 'high'
export type ReviewQueueMode = 'due' | 'catchup'

export interface AddReviewItemInput {
  targetKind: ReviewTargetKind
  targetId: string
  title: string
  note?: string | null
  priority?: ReviewPriority | null
  dueAt?: string | null
}

export interface ReviewItem {
  id: string
  targetKind: ReviewTargetKind
  targetId: string
  title: string
  note: string | null
  status: 'active' | 'dismissed' | string
  priority: ReviewPriority
  dueAt: string
  lastReviewedAt: string | null
  reviewCount: number
  ease: number | null
  intervalDays: number | null
  createdAt: string
  updatedAt: string
}

export interface ReviewQueuePlanInput {
  mode?: ReviewQueueMode | null
  limit?: number | null
}

export interface ReviewQueuePlanItem {
  item: ReviewItem
  position: number
  priorityRank: number
  daysOverdue: number
  reason: string
}

export interface ReviewQueuePlan {
  now: string
  mode: ReviewQueueMode
  limit: number
  candidateCount: number
  dueCount: number
  overdueCount: number
  futureCount: number
  dismissedCount: number
  overflowCount: number
  items: ReviewQueuePlanItem[]
}

export interface OpenDataMirrorConfig {
  enabled: boolean
  rootPath: string | null
  exportSources: boolean
  exportEvidence: boolean
  exportReports: boolean
  exportJournal: boolean
  exportGalleryIndex: boolean
}

export interface MirrorManifestCounts {
  sources: number
  evidence: number
  reports: number
  investigations: number
  journal: number
  gallery: number
}

export type MirrorPlanAction = 'write' | 'skip' | 'overwrite' | 'prune' | string

export interface MirrorPlanItem {
  kind: AssetKind | 'investigation'
  id: string
  title: string
  path: string
  contentHash: string | null
  previousHash: string | null
  action: MirrorPlanAction
}

export interface MirrorPlanError {
  kind: string | null
  id: string | null
  path: string | null
  message: string
}

export interface OpenDataMirrorPlan {
  rootPath: string
  generatedAt: string
  counts: MirrorManifestCounts
  toWrite: MirrorPlanItem[]
  unchanged: MirrorPlanItem[]
  stale: MirrorPlanItem[]
  toPrune: MirrorPlanItem[]
  errors: MirrorPlanError[]
}

export interface MirrorManifestAsset {
  kind: AssetKind | 'investigation'
  id: string
  title: string
  path: string
  contentHash: string
  exportedAt: string
  attachments: unknown[]
  warnings: string[]
}

export interface OpenDataMirrorManifest {
  version: number
  generatedAt: string | null
  assets: MirrorManifestAsset[]
  errors: MirrorPlanError[]
  pruned: MirrorPlanItem[]
  stale: MirrorPlanItem[]
  counts: MirrorManifestCounts | null
}

export interface MirrorExportResult {
  rootPath: string
  filesWritten: number
  sources: number
  evidence: number
  reports: number
  investigations: number
  journal: number
  gallery: number
  plan: OpenDataMirrorPlan
  manifest: OpenDataMirrorManifest
}

export interface OpenDataMirrorPruneResult {
  rootPath: string
  filesDeleted: number
  pruned: MirrorPlanItem[]
  errors: MirrorPlanError[]
  manifest: OpenDataMirrorManifest | null
}

export type ExportSyncAuditStatus = 'in_sync' | 'out_of_sync' | 'needs_config' | 'error' | string

export interface ExportSyncAuditItem {
  kind: string | null
  id: string | null
  title: string | null
  path: string | null
  status: string
  action: string
  currentHash: string | null
  previousHash: string | null
  message: string
}

export interface ExportSyncAuditReport {
  generatedAt: string
  status: ExportSyncAuditStatus
  rootPath: string | null
  manifestVersion: number | null
  currentAssetCount: number
  manifestAssetCount: number
  inSyncCount: number
  pendingWriteCount: number
  pendingOverwriteCount: number
  pendingPruneCount: number
  errorCount: number
  items: ExportSyncAuditItem[]
  warnings: string[]
  sourceInspiration: string
}

export interface IndexedFolder {
  id: string
  path: string
  name: string
  enabled: boolean
  lastScannedAt: string | null
  createdAt: string
}

export interface IndexedFile {
  id: string
  folderId: string
  path: string
  canonicalPath: string | null
  name: string
  extension: string | null
  sizeBytes: number | null
  modifiedAt: string | null
  sourceId: string | null
  indexedAt: string
  descriptorKind: string
  readStatus: string
  indexStatus: string
  metadataJson: string
  previewText: string | null
  textHash: string | null
  extractedChars: number | null
  totalChars: number | null
  lastError: string | null
}

export interface IndexedFolderScanResult {
  folder: IndexedFolder
  files: IndexedFile[]
  indexedCount: number
  metadataOnlyCount: number
}

export type ImportDiagnosticSeverity = 'ok' | 'warning' | 'critical' | string

export interface ImportDiagnosticsInput {
  folderId?: string | null
  statuses?: string[] | null
  includeOk?: boolean | null
  limit?: number | null
}

export interface ImportDiagnosticItem {
  id: string
  folderId: string
  folderName: string
  folderPath: string
  fileId: string
  fileName: string
  path: string
  extension: string | null
  descriptorKind: string
  readStatus: string
  indexStatus: string
  severity: ImportDiagnosticSeverity
  issueKind: string
  message: string
  recoveryAction: string
  commandName: string
  wrapperName: string
  inputJson: string
  sourceId: string | null
  indexedAt: string
  lastError: string | null
  metadataJson: string
}

export interface ImportFolderDiagnosticSummary {
  folderId: string
  folderName: string
  folderPath: string
  lastScannedAt: string | null
  totalFiles: number
  okCount: number
  metadataOnlyCount: number
  partialCount: number
  failedCount: number
  missingCount: number
  staleCount: number
  warningCount: number
  criticalCount: number
}

export interface ImportDiagnosticsLedger {
  generatedAt: string
  itemCount: number
  folderCount: number
  okCount: number
  warningCount: number
  criticalCount: number
  folders: ImportFolderDiagnosticSummary[]
  items: ImportDiagnosticItem[]
  warnings: string[]
}

export type RelatedRelation = 'same_view' | 'opposite_view' | 'similar_case' | 'evidence' | 'duplicate'

export interface RelatedCandidateInput {
  id: string
  content: string
  tagType?: string | null
  sourceDocName?: string | null
}

export interface RelatedClassification {
  id: string
  relation: RelatedRelation
  reason: string
  confidence: number
}

export interface GalleryItem {
  id: string
  filePath: string
  thumbnailPath: string
  prompt: string
  generatedAt: string
  downloadStatus: string
  pointIds: string[]
  sourcePoints: GallerySourcePoint[]
}

export interface GallerySourcePoint {
  id: string
  content: string
  sourceDocName?: string | null
}

export type GalleryImageMode = 'artwork' | 'knowledge'

export interface GalleryKnowledgeChunk {
  index: number
  text: string
  summary: string
  hotTake: string
  labels: string[]
}

export interface GalleryKnowledgeStar {
  id: string
  content: string
  tagType?: string | null
  sourceExcerpt?: string | null
}

export interface GalleryKnowledgeContext {
  sourceName: string
  sourceUrl?: string | null
  originalText: string
  chunkCards: GalleryKnowledgeChunk[]
  starredPoints: GalleryKnowledgeStar[]
}

export interface GalleryPromptPreview {
  prompt: string
  pointIds: string[]
  sourcePoints: GallerySourcePoint[]
  mode: GalleryImageMode
}

export interface GalleryFileDiagnostic {
  filePath: string
  exists: boolean
  sizeBytes?: number | null
  imageWidth?: number | null
  imageHeight?: number | null
  error?: string | null
}

export interface FileMetadata {
  filePath: string
  fileName: string
  sizeBytes: number
  createdAt: string | null
  modifiedAt: string | null
}

export interface SourceDocumentRecord {
  id: string
  kind: string
  title: string | null
  canonicalUri: string
  metadataJson: string
  createdAt: string
  updatedAt: string
}

export interface SourceChunkRecord {
  id: string
  sourceId: string
  chunkIndex: number
  headingPath: string | null
  text: string
  createdAt: string
}

export interface SourceSummaryRecord extends SourceDocumentRecord {
  chunkCount: number
  pointCount: number
  starCount: number
}

export interface SourceWorkspaceRecord {
  source: SourceSummaryRecord
  chunks: SourceChunkRecord[]
}

export interface SourceAssetsRecord {
  source: SourceSummaryRecord
  points: StoredPoint[]
  evidence: EvidenceRecord[]
  reports: ReportRecord[]
  gallery: GalleryItem[]
}

export interface PointSourceContext {
  pointId: string
  source: SourceSummaryRecord
  chunkIndex: number
  anchorText: string | null
  chunks: SourceChunkRecord[]
}

export type WorkspaceSearchResult =
  | {
      kind: 'source'
      id: string
      title: string
      snippet: string
      sourceId: null
      chunkIndex: null
    }
  | {
      kind: 'point'
      id: string
      title: string
      snippet: string
      sourceId: string | null
      chunkIndex: number | null
    }

export type ExploreSourceKind = 'file' | 'webpage' | 'paste'

export interface ExploreSourceMetadata {
  kind: ExploreSourceKind
  name: string | null
  path: string | null
  url: string | null
  sizeBytes: number | null
  createdAt: string | null
  modifiedAt: string | null
  characterCount: number
  author?: string | null
  publishedAt?: string | null
  readingTime?: string | null
}

export interface ExploreHistoryItem {
  id: string
  sourceId?: string | null
  sourceName: string | null
  sourceUrl: string | null
  sourceMetadata?: ExploreSourceMetadata | null
  text: string
  richHtml: string | null
  chunkCards: ChunkCard[]
  previewImage: string | null
  createdAt: string
  updatedAt: string
  archived: boolean
}

export interface DailyActions {
  date: string
  count: number
}

export interface AnalyticsData {
  totalPoints: number
  totalActions: number
  explainCount: number
  counterCount: number
  followupCount: number
  similarCount: number
  frameworkCount: number
  totalChildPoints: number
  dailyActions: DailyActions[]
}

export interface GenerateSuggestionResult {
  bodyMd: string
  summary: string
}

export interface SuggestionMeta {
  id: string
  summary: string
  createdAt: string
}

export interface Suggestion {
  id: string
  date: string
  bodyMd: string
  summary: string
  createdAt: string
}

export interface EmbeddingProviderConfig {
  kind: 'local' | 'remote'
  baseUrl: string | null
  apiKey: string | null
  model: string | null
}

export interface SemanticIndexStatus {
  modelKey: string
  phase: string
  total: number
  ready: number
  pending: number
  stale: number
  failed: number
  processed: number
  cancellable: boolean
  modelCached: boolean
  lastError: string | null
  updatedAt: string | null
}

export interface HybridSearchHit {
  id: string
  sourceId: string
  sourceTitle: string
  chunkIndex: number
  headingPath: string | null
  text: string
  score: number
  keywordRank: number | null
  semanticRank: number | null
  semanticScore: number | null
  reason: string
}

export interface GroundedCitation {
  kind: string
  label: string
  id: string
  title: string
  excerpt: string
  sourceId: string | null
  chunkIndex: number | null
  url: string | null
  quote: string | null
  reason: string | null
}

export interface GroundedAnswerResult {
  content: string
  citations: GroundedCitation[]
  invocationId: string | null
  refused: boolean
  warnings: string[]
}

export interface DatabaseSafetyStatus {
  databasePath: string
  integrity: string
  latestBackupPath: string | null
  checkedAt: string
}
