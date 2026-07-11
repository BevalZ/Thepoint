# Local Model Smoke Test

## Attempt

Ran the ignored `local_multilingual_e5_smoke` Rust test on 2026-07-11. The test initializes `fastembed` 5.17.2 with `EmbeddingModel::MultilingualE5Small` and attempts to embed a Chinese query plus an English passage.

## Result

The ONNX model could not be retrieved:

```text
Failed to retrieve onnx/model.onnx
request error: io: Connection refused
```

The failure occurs before inference and indicates that the current environment cannot reach the Hugging Face model repository. No API credentials are involved.

## Hardening Derived From The Failure

* Cache readiness must require a plausibly complete `model.onnx` plus `tokenizer.json`, not merely a non-empty cache directory.
* Connection-refused/timeout/DNS failures must surface an actionable offline/network message.
* The smoke test remains ignored in normal CI and can be run explicitly in a network-enabled release environment.

## Required Follow-up Environment

Run from `src-tauri/` where Hugging Face is reachable:

```powershell
cargo test semantic::provider::tests::local_multilingual_e5_smoke --lib -- --ignored --nocapture
```
