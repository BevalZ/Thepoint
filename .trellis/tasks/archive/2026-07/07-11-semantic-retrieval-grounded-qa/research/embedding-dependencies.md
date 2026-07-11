# Embedding and Secret-Store Dependency Research

## Current Choices

* `fastembed = 5.17.2` is the current crates.io release inspected on 2026-07-11.
* The crate includes `EmbeddingModel::MultilingualE5Small` and supports configurable cache directories.
* Default features include ONNX Runtime binary download, Hugging Face native-TLS download support, and image models. The implementation should disable unused image-model features and keep only the text/online runtime features required by this app.
* `keyring = 4.1.4` is the current cross-platform OS credential-store crate and requires Rust 1.88; the repository currently uses Rust 1.88.0.
* `keyring` default v1 adapters cover macOS Keychain, Windows Credential Manager, and Linux Secret Service.
* `sha2 = 0.11.0` is available for explicit model/download integrity checks where the provider does not expose a trusted checksum.

## Repo Constraints

* Tauri, SQLite, and Rust run in one process; no sidecar or HTTP service should be introduced.
* Model work and exact vector scanning must run off the async UI thread via `spawn_blocking` or managed background tasks.
* The app currently stores API keys through `tauri-plugin-store`; no encryption adapter is visible in that path.
* Browser preview must not download or instantiate local embedding models.
* Multi-platform CI builds Windows, macOS, and Linux installers; any ONNX/keyring dependency must compile on all three.

## Implementation Notes

* Use a pinned cache directory under app data so model state is discoverable and removable from Settings.
* Prefix E5 query text with `query:` and passage text with `passage:`.
* Normalize embeddings before persistence or cosine scoring; reject dimension mismatches.
* Keep the remote adapter behind the same embedding interface and use `/v1/embeddings` with typed response validation.
* OS credential migration must be write-then-read-verify-then-delete; a failed keyring operation leaves the original value intact and shows a user-visible warning.

