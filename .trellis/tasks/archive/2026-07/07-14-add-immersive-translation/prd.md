# Add Immersive Translation to Explore

## Goal

Add an immersive, block-aligned translation workflow to the Explore source workspace so users can read the original and translated text together without leaving the article. Translation must support a separately configurable AI API and DeepLX from the Settings control panel.

## What I Already Know

* Explore already parses imported text, rich HTML, and source blocks, and it stays mounted so long-running workflows survive navigation.
* App configuration is persisted through typed frontend API wrappers and Rust/Tauri commands.
* The user explicitly requires API-based translation settings and DeepLX support.
* Existing dirty changes from earlier tasks must remain intact and must not be mixed into an automatic commit.

## Product Decisions

* “Immersive translation” means paragraph/block-aligned bilingual reading rather than replacing the full article with one translated blob.
* The first version will translate text blocks only; image OCR, PDF layout reconstruction, and browser-wide page injection are not required.
* The default layout is original text followed immediately by its translation inside the same content card.
* The reading toolbar provides original-only, bilingual, and translated-only modes.
* Translation is cancellable/retryable, preserves original text, and avoids re-requesting unchanged blocks during the current source session.
* AI translation uses an OpenAI-compatible chat-completions endpoint with its own endpoint, API key, and model instead of silently reusing the main analysis provider.
* DeepLX / DLX uses a configurable self-hosted base URL and optional authorization token.

## Requirements (Evolving)

* Add an Explore translation toolbar that can start, cancel, continue, retry failed blocks, hide translations, and switch translation display mode.
* Render translated text adjacent to the corresponding original block without changing stored Source text or Point anchors.
* Add an `AI 配置 → 翻译` Settings sub-tab with provider (`AI API` or `DeepLX / DLX`), endpoint/base URL, API key or optional token, AI model, and target language.
* Support an OpenAI-compatible AI provider and DeepLX / DLX through one typed `translate_text` backend command.
* For AI, send a translation-only system prompt to a chat-completions endpoint and parse the existing compatible response shapes.
* For DeepLX / DLX, append `/translate` to a base URL unless a full translate endpoint is supplied, send optional Bearer authentication, and accept both `data` and `translations[0].text` response shapes.
* Preserve translation state while navigating away from Explore.
* Surface per-block failures without discarding successfully translated blocks.
* Translate text blocks only, with at most three concurrent requests and a backend request timeout.
* Cache successful results by source/block text plus provider/model/endpoint/target-language signature for the lifetime of the mounted Explore workspace.
* Reset incompatible translation presentation when the source or relevant translation settings change.
* Default the target language to Simplified Chinese and offer Chinese, English, Japanese, Korean, German, French, and Spanish.

## Acceptance Criteria (Evolving)

* [x] A user can translate an imported Explore article and read block-aligned original/translated text.
* [x] Original-only, bilingual, and translated-only display modes work without changing persisted Source content.
* [x] Translation continues when navigating away from Explore and remains visible when returning.
* [x] The user can configure and select an independent AI translation API or DeepLX / DLX in Settings.
* [x] DeepLX accepts an optional token and both native/current compatibility response shapes.
* [x] Failed blocks can be retried without retranslating successful unchanged blocks.
* [x] Cancel stops scheduling new blocks; continuing reuses completed blocks and resumes the remaining queue.
* [x] Original Source content, saved Point anchors, and citation navigation remain unchanged.
* [x] Frontend typecheck, boundary check, tests, and production build pass.
* [x] Rust check and tests pass.

## Definition of Done

* Focused tests cover configuration defaults/round-trip, provider payload parsing, block-cache identity, and retry behavior.
* Errors are actionable and do not expose API keys.
* Translation work is bounded and cleans up cancellation state.
* Specs record the translation provider and Explore state contracts.

## Technical Approach

1. Extend `AppConfig` across TypeScript, browser fallback, Rust config persistence, and OS secret storage with translation provider/base URL/key/model/target language.
2. Add a typed `TranslationInput`/`TranslationResult`, command-map entry, frontend wrapper, Rust translation command, and Tauri registration.
3. Reuse the existing OpenAI-compatible response extractor for AI translation; implement a small dual-shape DeepLX response parser with focused Rust tests.
4. Add a pure frontend translation cache/signature helper with tests.
5. Add Explore-local queue state and a three-worker scheduler guarded by a run generation. Explore remains mounted, so translation continues across navigation; cancel invalidates the generation and stops new scheduling.
6. Add a compact translation toolbar and render translation status/result directly in `ThemeBlock` below the original text.
7. Verify Settings, Explore display modes, retries, browser-preview fallbacks, and the full quality gates.

## Decision (ADR-lite)

**Context**: Translation can be implemented as one whole-document request, independent block requests from the UI, or a persisted translation database.

**Decision**: Use block-aligned requests through one Rust command, scheduled by a bounded Explore-local worker queue with session-lifetime caching.

**Consequences**: The UI receives progressive results, can retry individual failures, and preserves exact source anchors. It creates more small requests than whole-document translation, so concurrency is limited to three. Translation is not persisted across application restarts in the MVP, avoiding a new SQLite schema and stale-cache migration problem.

## Out of Scope

* Browser-extension translation outside Explore.
* OCR or translation of text inside images.
* Rewriting persisted source text with translated content.
* A translation-memory database shared across unrelated sources in the first version.
* Official DeepL API billing/account integration; DeepLX / DLX is an independent compatibility provider.
* Persisting translated text into Sources, Points, Evidence, reports, or exports.

## Research References

* [`research/deeplx-api-compatibility.md`](research/deeplx-api-compatibility.md) — current DLX rename, endpoints, authentication, response shapes, and repository mapping.

## Technical Notes

* Candidate areas: `frontend/src/pages/Explore.tsx`, Settings/config store and DTOs, typed command map/API wrapper, Rust config command, a new Rust translation command/service, and Tauri command registration.
* DeepLX / DLX upstream compatibility was verified against the 2026-07-14 repository state.
