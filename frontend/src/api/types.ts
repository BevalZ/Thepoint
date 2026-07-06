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

export interface OpenDataMirrorConfig {
  enabled: boolean
  rootPath: string | null
  exportSources: boolean
  exportEvidence: boolean
  exportReports: boolean
  exportJournal: boolean
  exportGalleryIndex: boolean
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
