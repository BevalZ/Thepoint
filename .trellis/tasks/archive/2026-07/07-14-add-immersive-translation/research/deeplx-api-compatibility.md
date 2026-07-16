# DeepLX / DLX API Compatibility Research — 2026-07-14

## Upstream Status

The upstream project formerly known as DeepLX was renamed **DLX** in July 2026 after a trademark notice. It remains the same self-hosted translation API project and explicitly states that it is independent from DeepL SE. Product-facing compatibility text can say “DeepLX / DLX” so existing users recognize it without implying an official DeepL integration.

Sources:

* <https://github.com/OwO-Network/DLX>
* <https://raw.githubusercontent.com/OwO-Network/DLX/main/README.md>
* <https://raw.githubusercontent.com/OwO-Network/DLX/main/service/service.go>
* <https://raw.githubusercontent.com/OwO-Network/DLX/main/service/config.go>
* <https://raw.githubusercontent.com/OwO-Network/DLX/main/translate/types.go>

## Recommended Endpoint

Use the native JSON endpoint:

```http
POST {base_url}/translate
Content-Type: application/json
Authorization: Bearer {optional_token}

{
  "text": "Hello, world!",
  "source_lang": "AUTO",
  "target_lang": "ZH",
  "tag_handling": ""
}
```

The default self-hosted base URL is `http://127.0.0.1:1188`. If the configured value already ends in `/translate`, use it as the complete endpoint; otherwise append `/translate` once.

`source_lang` may be blank/automatic for upstream behavior, but sending `AUTO` preserves compatibility with older DeepLX deployments. Target language uses uppercase service codes such as `ZH`, `EN`, `JA`, `KO`, `DE`, and `FR`.

## Authentication Compatibility

The current server accepts any one of:

* `Authorization: Bearer <token>`
* `Authorization: DeepL-Auth-Key <token>`
* `?token=<token>`

Use Bearer in Thepoint. It avoids putting secrets in URLs and works with current upstream. The token is optional because local deployments commonly run without one.

## Response Compatibility

The native endpoint returns:

```json
{
  "code": 200,
  "id": 123,
  "data": "你好，世界！",
  "alternatives": [],
  "source_lang": "EN",
  "target_lang": "ZH",
  "method": "..."
}
```

Some compatible deployments expose the official-style `/v2/translate` response instead:

```json
{
  "translations": [
    { "detected_source_language": "EN", "text": "你好，世界！" }
  ]
}
```

The backend parser should accept both `data` and `translations[0].text`. Non-2xx responses should extract `message` when present.

## Operational Constraints

* `/translate` accepts one string per request. The app should batch locally by bounded concurrency rather than assume an array API.
* The free endpoint supports optional `tag_handling` values `html` or `xml`; the MVP sends plain text so block anchors and markup remain under frontend control.
* `/v1/translate` requires a Pro `dl_session` and is not appropriate for the default integration.
* DLX is a network service even when self-hosted. Apply a request timeout, do not log tokens, and return provider/HTTP status context without dumping response secrets.

## Repository Mapping

* Persist provider/base URL/token/target language through the existing `AppConfig` store contract.
* Store the token using the same secret-store migration helper used by chat/search/image API keys.
* Implement the request in Rust/Tauri so browser UI never handles cross-origin or token-header concerns directly.
* Expose one typed translation command used by Explore for both DLX and AI providers.
