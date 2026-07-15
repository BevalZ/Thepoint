# Fix Thin Mint Chat Response Parsing

## Goal

Make the OpenAI-compatible text provider work with Thin Mint proxy responses for models such as `grok-4.20-fast` and `deepseek-v4-flash`, while preserving existing providers and clear HTTP error reporting.

## Requirements

* Parse standard Chat Completions JSON with string `message.content`.
* Parse providers that return `message.content` as an array of text parts.
* Fall back to `message.reasoning_content` when final content is absent or blank.
* Parse SSE responses containing `choices[].delta.content` even when the request did not enable streaming.
* Ignore SSE `[DONE]`, join content deltas in order, and surface provider error events.
* Preserve non-success HTTP status handling, including Thin Mint 503 capacity responses.
* Reuse one backend parser across text-generation call sites instead of adding provider-name conditionals.
* Never log API keys, prompts, full responses, or user document text.

## Acceptance Criteria

* [x] Captured Thin Mint SSE shape returns assembled text.
* [x] Standard JSON, content-array JSON, and reasoning-content JSON return text.
* [x] Empty/malformed/error-event responses return actionable errors.
* [x] Explore analysis can consume Thin Mint Grok responses.
* [x] Existing Rust tests and frontend checks remain green.

## Definition of Done

* Shared response parser has focused fixture tests.
* Relevant text-generation paths use the shared parser.
* Live smoke confirms Thin Mint Grok returns parseable text without exposing content in logs.
* Changes do not overwrite unrelated dirty command edits.

## Technical Approach

Add a pure parser under `src-tauri/src/ai/` that detects SSE by `data:` framing and otherwise parses JSON through `serde_json::Value`. Extract text from standard message content, content parts, reasoning fallback, legacy text, and SSE deltas. Replace local strict `content: String` parsing at text-provider response boundaries.

## Decision (ADR-lite)

**Context**: Thin Mint behaves as an OpenAI-compatible proxy but may force SSE or expose newer response fields.

**Decision**: Normalize response bodies by shape rather than provider or model name.

**Consequences**: Future compatible proxies benefit automatically. Strict structured-output parsing remains downstream after text extraction.

## Out of Scope

* Retrying provider 429/503 capacity failures automatically.
* Changing model selection or Thin Mint account limits.
* Exposing chain-of-thought separately in the UI.
* Migrating requests to the OpenAI Responses API.

## Research References

* `research/thin-mint-response-shapes.md` - Sanitized live response structure and parser implications.
