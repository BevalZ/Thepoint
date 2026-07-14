# Current content chunking audit

## Scope inspected

- `src-tauri/src/commands/extract.rs`: URL extraction and streaming analysis entrypoint.
- `src-tauri/src/ai/openai.rs`: deterministic analysis chunking.
- `frontend/src/pages/Explore.tsx`: rich-HTML traversal and display block chunking.
- `frontend/src/store/exploreStore.ts`: import, persistence, and analysis orchestration.
- `src-tauri/src/parsers/*`: local document text extraction.
- `src-tauri/src/commands/library.rs`: independent indexed-file chunking.

## Findings

1. Explore display blocks and backend analysis chunks are produced independently. They use similar constants and helpers but are not the same data, so sequential `textIndex` mapping can drift.
2. The primary backend and frontend splitters enforce a 400/500-character maximum. A single natural paragraph is therefore split even when its structure is valid.
3. The recent abbreviation-aware sentence boundary fix prevents examples such as `i.e.` and `et al.` from being split, but it remains a fallback patch inside a character-first design.
4. HTML extraction preserves block tags in `FetchedPage.html`, but `FetchedPage.text` flattens every selected element to one line. The backend analysis only receives the flattened text and loses explicit block types, image boundaries, list grouping, and heading hierarchy.
5. `parseSourceBlocks()` collects all pending text, joins it, and runs another splitter. This discards the DOM block identity that was available moments earlier.
6. The paragraph deduplication set is document-wide. Identical body paragraphs can be removed even when repetition is intentional.
7. Indexed folders use a third splitter (`chunk_indexed_text`) with a 3200-byte-like `String::len()` threshold, which differs from Explore in both unit and behavior.
8. `source_chunks.heading_path` already exists but current Explore persistence does not populate it.

## Recommended direction

Use one canonical, deterministic paragraph-aware chunk planner in Rust and make every consumer use its output. Extraction should first produce typed structural units; chunk planning should group those units without losing natural paragraph boundaries; display, analysis, persistence, translation, citations, and reopening should all reference the same planned chunks.

The planner should use a soft target rather than a hard target as the normal rule. A natural paragraph may exceed the preferred size. It should only be sentence-split when it exceeds a much larger hard limit, using protected abbreviation/decimal/citation logic and balanced split points.

## Rejected alternatives

### Keep patching sentence-boundary regexes

Low implementation cost, but it cannot preserve paragraph, list, quote, heading, code, table, or image semantics and leaves frontend/backend drift intact.

### Keep frontend and backend planners but share constants

Reduces some mismatch but still duplicates behavior across languages and cannot guarantee identical block indexes or citation anchors.

### Let the LLM decide chunk boundaries

Adds latency, cost, nondeterminism, provider dependence, and failure modes to an operation that can be solved deterministically from document structure.

