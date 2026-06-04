# Logging Guidelines

> How logging is done in this project.

---

## Overview

<!--
Document your project's logging conventions here.

Questions to answer:
- What logging library do you use?
- What are the log levels and when to use each?
- What should be logged?
- What should NOT be logged (PII, secrets)?
-->

Library: `tracing` crate with `tracing-subscriber`.

## Log Levels

| Level | When |
|-------|------|
| `trace!` | Fine-grained DB query internals (dev only) |
| `debug!` | LLM request/response payloads (dev only) |
| `info!` | Session created/ended, Point extracted count |
| `warn!` | Ollama not detected, search API timeout (non-fatal) |
| `error!` | DB migration failure, file parse error (fatal for operation) |

## What NOT to Log

- ❌ API keys or any credential value
- ❌ Full document text content (may contain PII)
- ❌ User-provided Point content at `info` or above
