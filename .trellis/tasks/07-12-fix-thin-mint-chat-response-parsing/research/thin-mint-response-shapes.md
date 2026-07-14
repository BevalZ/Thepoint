# Thin Mint Response Shapes

Validated on 2026-07-12 against the configured `https://x666.me/v1/chat/completions` endpoint with a minimal non-user-data prompt. API keys and response text were not recorded.

## `grok-4.20-fast`

* HTTP status: 200
* Content-Type: `text/event-stream`
* Body begins with `data:` even though the request omitted `stream`.
* Three JSON data events plus `data: [DONE]` were observed.
* Text is carried by `choices[0].delta.content` and must be concatenated in event order.

## `deepseek-v4-flash`

* One request returned HTTP 200 with `application/json`.
* A later request returned HTTP 503 with `ResourceExhausted: Worker local total request limit reached`.
* The client must keep non-success status reporting separate from successful-body parsing.

## Parser Implications

* Do not select behavior by model name; inspect response framing and JSON shape.
* Support standard `choices[].message.content`, array content parts, `reasoning_content` fallback, and SSE `choices[].delta.content`.
* Never print raw provider responses in normal success diagnostics because they contain generated/user-derived content.
