# Backend Error Handling

> How errors are represented, propagated, and returned from the Rust/Tauri backend.

---

## Overview

Backend internals use `anyhow::Result<T>` for fallible work. Tauri commands expose errors to the frontend as `Result<T, String>`, because frontend `invoke` rejects with a string-like error.

The common path is:

1. Validate command input early when the command can produce a clearer user message.
2. Run DB/file work inside `tokio::task::spawn_blocking`.
3. Use `?` inside internal helpers that return `anyhow::Result<T>`.
4. Convert both task join errors and internal errors with `.map_err(|e| e.to_string())`.

Reference files:

- `src-tauri/src/commands/library.rs`
- `src-tauri/src/commands/extract.rs`
- `src-tauri/src/commands/digest.rs`
- `src-tauri/src/db/mod.rs`
- `src-tauri/src/parsers/mod.rs`
- `src-tauri/src/ai/openai.rs`

---

## Error Types

### Command boundary

Tauri commands generally return:

```rust
Result<T, String>
```

Use this for any command listed in `src-tauri/src/lib.rs` and called from `frontend/src/api`.

Examples:

- `commands/library.rs`: `save_evidence`, `search_reports`, `delete_point`
- `commands/extract.rs`: `parse_document`, `describe_image`, `fact_check_claim`
- `commands/digest.rs`: `generate_digest`, `generate_synthesis`

### Internal helpers

Internal DB, parser, and AI helpers generally return:

```rust
anyhow::Result<T>
```

Examples:

- `db::open_db(path) -> Result<Connection>`
- `db::save_report(conn, input) -> Result<ReportRecord>`
- `parsers::parse_document(path) -> anyhow::Result<String>`
- `openai::extract_points(...) -> anyhow::Result<Vec<ExtractedPoint>>`

`db/mod.rs` imports `anyhow::{Context, Result}` and uses context for low-level DB setup and schema creation failures.

---

## Command Pattern

For commands that touch SQLite:

```rust
let path = db::db_path(&app).map_err(|e| e.to_string())?;
tokio::task::spawn_blocking(move || -> anyhow::Result<T> {
    let conn = db::open_db(&path)?;
    db::some_operation(&conn, &input)
})
.await
.map_err(|e| e.to_string())?
.map_err(|e| e.to_string())
```

The first `map_err` after `.await` handles the blocking task join error. The second handles the internal `anyhow::Result<T>`.

Do not collapse this into an unchecked `unwrap()` or direct blocking DB call in async commands.

---

## Validation Errors

Prefer explicit validation at the closest layer that can give the best message:

- Command layer: validate simple user input before doing work, such as empty manual point content or empty fact-check claim.
- DB layer: validate persistence invariants, such as required report fields, valid Evidence verdict values, valid source stance values, and citation JSON shape.
- Parser dispatch layer: validate unsupported file types and return user-facing unsupported-format messages.
- AI layer: validate missing API keys and non-success HTTP responses.

Reference examples:

- `commands/library.rs` trims manual/fact-check child point content and returns a command error when empty.
- `db/mod.rs` uses `required_trimmed`, `validate_evidence_verdict`, `validate_evidence_stance`, `validate_report_kind`, and `normalize_report_citations_json`.
- `parsers/mod.rs` rejects PDF and DOC imports with format-specific guidance.
- `commands/extract.rs` rejects missing image URL, missing API key, disabled search model, and empty fact-check claim before sending requests.

---

## Context And Messages

Use `anyhow::Context` when wrapping low-level failures that would otherwise be ambiguous.

Good examples in `db/mod.rs`:

- resolving the app data directory
- creating the app data directory
- opening the library DB
- creating tables and indexes in `init_db`
- parsing report citation JSON

Use `anyhow::bail!` for validation or provider-response failures inside internal helpers.

Good examples:

- `ai/openai.rs` bails on missing API key and non-success model responses.
- `parsers/mod.rs` bails on unsupported formats.
- `db/mod.rs` bails on invalid Evidence/Report enum values.

At the command boundary, map the error into a string. Do not expose custom Rust error types to Tauri commands unless the frontend contract is also changed.

---

## Recoverable Degradation

Some workflows intentionally continue after non-critical failures. Make this explicit and keep the primary user action successful.

Examples:

- `commands/extract.rs` returns the deterministic page extraction when AI edge cleanup fails, logging a short skip message.
- Streaming extraction/analysis emits successful chunk results and ignores per-chunk failures instead of failing the whole stream.
- `commands/gallery.rs` ignores filesystem removal errors after the gallery DB row has been deleted.
- `diagnose_gallery_file` returns a diagnostic payload with `error: Some(...)` instead of returning `Result`.

Use this pattern only when the feature can produce a correct partial result and the caller has no useful recovery action.

## Scenario: OpenAI-compatible Chat Response Normalization

### 1. Scope / Trigger

- Trigger: reading successful response bodies from OpenAI-compatible chat-completion providers or proxies.
- Applies to text extraction, analysis, suggestions, analytics, fact checking, grounded answers, and other backend text-generation paths.

### 2. Signatures

```rust
extract_chat_text(raw: &str) -> anyhow::Result<String>
```

### 3. Contracts

- Successful response bodies are normalized by response shape, not provider or model name.
- Standard JSON supports string or text-part-array `choices[0].message.content`.
- Blank/missing final content may fall back to `reasoning_content`.
- SSE bodies collect `choices[0].delta.content` in event order and ignore `data: [DONE]`.
- HTTP non-success handling remains at the request boundary before text normalization.
- Do not log raw successful responses, prompts, API keys, or generated text.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Standard JSON string content | Return trimmed content |
| JSON content parts | Concatenate text parts in order |
| Final content blank, reasoning present | Return reasoning fallback |
| SSE delta events | Concatenate content deltas in order |
| SSE error event | Return an error containing the provider error message |
| Empty/malformed body | Return an actionable parse/no-text error |
| HTTP 429/503 or other non-success | Preserve the existing status/body error path; do not parse as success |

### 5. Good/Base/Bad Cases

- Good: a proxy forces `text/event-stream` despite no `stream` request and the client still extracts the final text.
- Base: an ordinary OpenAI-compatible JSON response remains unchanged.
- Bad: deserialize every provider into a local `content: String` struct.
- Bad: add model-name checks such as `if model.starts_with("grok")` to choose parsing behavior.

### 6. Tests Required

- Fixture tests for standard JSON, content arrays, reasoning fallback, captured SSE delta framing, empty responses, and SSE error events.
- Full backend checks: `cargo check --manifest-path src-tauri/Cargo.toml` and `cargo test --manifest-path src-tauri/Cargo.toml`.
- Live provider smoke records only status, content type, framing, field names, and lengths; never response text or secrets.

### 7. Wrong vs Correct

#### Wrong

```rust
#[derive(Deserialize)]
struct Message { content: String }
let parsed: ChatResponse = serde_json::from_str(&raw)?;
```

#### Correct

```rust
if !status.is_success() {
    anyhow::bail!("provider returned {status}: {raw}");
}
let content = extract_chat_text(&raw)?;
```

## Scenario: GitHub User Pages Source Fallback

### 1. Scope / Trigger

- Trigger: URL ingestion fails for an exact `<user>.github.io` host while public GitHub repository content remains reachable.

### 2. Signatures

```rust
github_pages_fallback_candidates(url: &reqwest::Url) -> Vec<GitHubPagesFallbackCandidate>
fetch_url_html(client, requested_url) -> Result<(String, Url, Url), String>
decode_github_contents_payload(raw: &str) -> Result<String, String>
```

### 3. Contracts

- Always request the public URL first with normal TLS verification.
- Only exact GitHub user-site hosts receive raw repository candidates.
- Try `<user>/<user>.github.io` on `master`, then `main`; trailing-slash paths map to `index.html`.
- Within each branch, race the raw file request against the unauthenticated GitHub Contents API. The first valid HTML result wins, so a blocked raw domain does not force a second long timeout.
- Contents API responses must be `type=file`, `encoding=base64`, contain decodable UTF-8 text, and must never require or log a GitHub token.
- Resolve relative HTML assets against the raw URL, but return the original public URL as Source identity.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Public URL succeeds | Use it; do not invoke fallback |
| GitHub user-site request resets or returns non-success | Try master raw/API, then main raw/API |
| Raw host is blocked but `api.github.com` is reachable | Decode the same branch/path through Contents API |
| Non-GitHub host fails | Return the original request error |
| All repository transports fail | Return original plus fallback errors |
| Contents payload is not a Base64 file or is not UTF-8 | Reject that candidate and continue to the next branch |
| Host resembles GitHub Pages only as a suffix of another domain | Do not generate candidates |

### 5. Good/Base/Bad Cases

- Good: a blocked user-site article loads from its public raw `index.html` or Contents API representation while retaining the public citation URL.
- Base: ordinary websites and reachable GitHub Pages behave unchanged.
- Bad: disable TLS verification or proxy arbitrary sites through GitHub raw content.

### 6. Tests Required

- Pure mapping tests for valid and invalid hosts, Contents API URLs, and Base64 decoding.
- Ignored live smoke for a reported public article, asserting substantial HTML/text and preserved URL.
- Full backend check and tests.

### 7. Wrong vs Correct

#### Wrong

```rust
reqwest::Client::builder().danger_accept_invalid_certs(true)
```

#### Correct

```rust
let candidates = github_pages_fallback_candidates(&requested_url);
// Keep TLS verification; race only validated raw/API URLs for this exact repository path.
```

---

## Scenario: Bounded Translation Provider Boundary

### 1. Scope / Trigger

- Trigger: configuring or calling the Explore `translate_text` command through AI API or DeepLX / DLX.
- Applies to `commands/config.rs`, `commands/translation.rs`, Tauri command registration, and the typed frontend API boundary.

### 2. Signatures

```rust
translate_text(app, input: TranslationInput) -> Result<TranslationResult, String>

TranslationInput {
  text: String,
  source_language: Option<String>,
  target_language: Option<String>,
}
```

```ts
translateText(input: TranslationInput): Promise<TranslationResult>
```

### 3. Contracts

- Providers normalize to `ai | deeplx`; unsupported stored values fall back to `deeplx`.
- Source language normalizes to `AUTO | ZH | EN | JA | KO | DE | FR | ES`; target language must be concrete and defaults to `ZH`.
- The translation key/token uses the OS credential store. Successful migration must remove and persist deletion of the legacy plaintext store field.
- All translation calls share one HTTP client and one backend semaphore with three permits. Full-block, single-block, and selected-text translation all pass through this limit.
- Each request has a 45-second timeout, accepts at most 12,000 input characters, and reads at most 1 MiB of response data.
- AI endpoints accept a root URL, `/v1`, or a full `/chat/completions` URL. DeepLX accepts a root URL or full `/translate` URL. URL query parameters are preserved; user-info and fragments are rejected.
- A request carrying a secret may use plain HTTP only for localhost or a loopback IP. Remote authenticated endpoints require HTTPS.
- AI responses use `extract_chat_text`. DeepLX accepts native `data` and compatibility `translations[0].text` shapes.
- Returned errors classify timeout, connection, redirect, HTTP status, invalid payload, and response-size failures. Exact configured secrets are redacted and messages are bounded before crossing Tauri.
- Browser preview rejects `translate_text` through the normal Promise error path; it must never cache an unavailable message as a successful translation.

### 4. Validation & Error Matrix

| Condition | Required behavior |
|---|---|
| Blank text | Reject before reading config or making a request |
| Text exceeds 12,000 characters | Reject with the block-size limit |
| Fourth simultaneous translation | Wait for a semaphore permit; active network requests remain at three |
| AI key or model missing | Return an actionable Settings path |
| Remote authenticated `http://` endpoint | Reject before sending the secret |
| Response exceeds 1 MiB | Stop reading and return a bounded error |
| DeepLX HTTP success with non-2xx JSON `code` | Return its sanitized provider message |
| Provider message contains the configured secret | Replace the exact secret with `[REDACTED]` |
| Browser preview invokes translation | Return a rejected Promise naming the unavailable Tauri command |

### 5. Good/Base/Bad Cases

- Good: three block workers reuse one client while a fourth request waits; successful blocks remain usable after another block fails.
- Good: a loopback DeepLX server accepts an optional Bearer token and either supported response shape.
- Base: a legacy config without translation fields reads as DeepLX, `AUTO -> ZH`, and the loopback default URL.
- Bad: creating one client per block, buffering an unlimited response, returning a token echoed by a provider, or treating browser preview text as a successful translation.

### 6. Tests Required

- Config tests: camel-case round trip, legacy defaults, provider/language normalization, and plaintext-secret cleanup behavior when the store is available.
- Translation tests: AI/DeepLX URL normalization including query parameters, transport safety, native/compatibility response parsing, invalid languages, response-size handling, and exact-secret redaction.
- Shared response tests continue to cover JSON, content-part arrays, reasoning fallback, and SSE chat shapes.
- Full gates: `cargo check`, `cargo test`, frontend typecheck, command registry, boundary check, focused helper tests, and production build.

### 7. Wrong vs Correct

#### Wrong

```rust
let client = reqwest::Client::new();
let raw = client.post(format!("{base}/translate")).send().await?.text().await?;
```

#### Correct

```rust
let _permit = TRANSLATION_LIMIT.acquire().await?;
let endpoint = deeplx_translation_endpoint(base)?;
validate_endpoint_transport(&endpoint, sends_secret)?;
let (status, raw) = read_bounded_response(shared_client.post(endpoint).send().await?).await?;
```

---

## Tests

Test validation and conversion behavior close to the layer that owns it.

Examples:

- `commands/library.rs` tests conservative fact-check verdict inference and command-to-DB input conversion.
- `commands/extract.rs` tests page extraction, metadata removal, edge trimming, and JSON parsing/clamping helpers.
- `parsers/mod.rs` tests unsupported PDF/DOC messages.
- `db/mod.rs` tests DB validation failures, search behavior, delete semantics, and idempotent no-op behavior for missing report deletes.

Use `unwrap()` and `expect()` freely inside tests when setup must succeed for the assertion to matter. Avoid `unwrap()` in production command/helper code except for static invariants that cannot fail in normal operation, such as known-valid CSS selectors.

---

## Wrong Vs Correct

### Wrong

```rust
#[tauri::command]
pub async fn list_reports(app: tauri::AppHandle<Wry>) -> Result<Vec<ReportRecord>, String> {
    let conn = db::open_db(&db::db_path(&app).unwrap()).unwrap();
    Ok(db::list_recent_reports(&conn, 120).unwrap())
}
```

### Correct

```rust
#[tauri::command]
pub async fn list_reports(app: tauri::AppHandle<Wry>) -> Result<Vec<ReportRecord>, String> {
    let path = db::db_path(&app).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || -> anyhow::Result<Vec<ReportRecord>> {
        let conn = db::open_db(&path)?;
        db::list_recent_reports(&conn, 120)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())
}
```

---

## Anti-Patterns

- Do not use `unwrap()` or `expect()` in command handlers for runtime input, DB, filesystem, network, or model failures.
- Do not return `anyhow::Error` directly from a Tauri command.
- Do not replace user-facing validation messages with raw SQL or HTTP errors when the command can validate earlier.
- Do not swallow a persistence failure and report success to the frontend.
- Do not add logging-only error handling for operations whose caller needs to know the command failed.
