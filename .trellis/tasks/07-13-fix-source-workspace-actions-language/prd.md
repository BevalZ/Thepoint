# Fix Source Workspace Actions and Language

## Goal

Make Source Workspace actions reliable, provide a persisted Chinese/English UI language choice across owned application copy, and allow individual Explore analysis cards to be regenerated without reprocessing the full source.

## Requirements

* Generate Source Investigation through the shared JSON/SSE chat response parser.
* Load Journal and Related independently; one failure must not clear or mislabel the other.
* An empty Related result is a valid empty state, not an error.
* Add `uiLanguage` (`zh-CN` or `en-US`) to persisted application settings.
* Add a Settings language selector.
* Apply the selected language consistently to Source Workspace panel headings, actions, empty states, and action errors.
* Apply the selected language to Capability Center fixed UI and Round 20 scorecard copy; preserve project and product names.
* Double-click an analyzed block's Star button to regenerate that block's AI analysis in place.
* Preserve the current analysis when regeneration fails, expose the error, and prevent duplicate regeneration requests.
* Keep existing single-click open and right-click star/unstar behavior.
* Default existing installations to Chinese.
* Detect when a Source Investigation has too few source-linked Points or Evidence to support a useful report.
* Offer one-click preparation that analyzes a bounded set of valuable source blocks, saves deduplicated source-linked Points, fact-checks a small evidence set, and then generates the Investigation automatically.
* Treat AI image generation as optional context, never as a prerequisite for Investigation.
* Generate Source Investigations in deep mode with explicit expectations for multiple findings, evidence strength, conflicts, uncertainty, and follow-up questions.
* Continue preparing other candidates when one block analysis or fact check fails; preserve successfully prepared assets and report a useful error only when the minimum context still cannot be reached.

## Acceptance Criteria

* [x] Thin Mint Grok Investigation responses parse successfully.
* [x] Related returns/render empty independently of Journal.
* [ ] Settings persists Chinese/English choice across restart.
* [x] Source Workspace panel does not mix Chinese and English labels within either mode.
* [ ] Capability Center fixed scorecard copy follows the selected language.
* [ ] Double-clicking an analyzed Star regenerates only that block and refreshes its open detail card.
* [ ] Failed regeneration keeps the previous card usable and provides a retry message.
* [x] A thin Source shows its missing Investigation context and can run Prepare + Investigate without requiring manual Point or image generation.
* [x] Preparation targets five deduplicated Points and two Evidence items while bounding automatic block analysis and tolerating individual candidate failures.
* [x] Source Investigation uses deep-mode guidance and requests a substantially richer, citation-grounded report.
* [x] Backend and frontend quality gates pass after the expanded changes.

## Technical Approach

Reuse `ai::chat_response::extract_chat_text` in Investigation. Split the Source Workspace `Promise.all` effect into independently guarded requests. Extend `AppConfig` with `uiLanguage`. Use typed frontend copy helpers for Source Workspace and Capability Center. Add an explicit regenerate callback to `ThemeBlock`; regenerate through the existing `analyzeTextBlock` API and replace only the owning card after success. Gate Investigation on a small pure readiness contract, reuse existing `analyzeTextBlock`, `savePoints`, `factCheckClaim`, and `saveEvidence` APIs for bounded preparation, then call the existing Investigation command in deep mode with explicit depth guidance.

## Out of Scope

* Translating model-generated article content.
* Translating imported article/source text or arbitrary model-generated content.
* Completing full-app localization of every legacy page beyond Source Workspace and Capability Center in this slice.
* Changing Related relation generation semantics.
