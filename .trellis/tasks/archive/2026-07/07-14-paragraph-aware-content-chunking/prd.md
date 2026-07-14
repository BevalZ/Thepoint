# Paragraph-aware content chunking

## Goal

Rebuild the import decomposition pipeline so Explore presents and analyzes coherent natural paragraphs, or small groups of adjacent natural paragraphs, instead of cutting text at arbitrary punctuation or character positions. The same canonical chunk plan must drive display, AI analysis, persistence, translation, citations, and source reopening.

## What I Already Know

- The reported failure split `i.e.` across two blocks.
- Abbreviation protection fixes that exact symptom but does not address the underlying character-first design.
- The preferred reading unit is one natural paragraph or several adjacent natural paragraphs combined into one block.
- Rich web content, pasted text, and local documents must degrade consistently.
- Existing source-linked points, evidence, reports, translations, and source highlights depend on stable chunk indexes and exact source text.

## Requirements

### Canonical structure

- Introduce a typed structural unit model for heading, paragraph, list group/item, blockquote, code/preformatted text, table text, and image/caption boundaries.
- Preserve source order, original paragraph separators, heading hierarchy, and exact normalized source text.
- Produce one canonical chunk plan in the backend; remove independent display-versus-analysis chunk decisions.
- Keep current `html` and `text` fields temporarily for compatibility while adding structured units/chunks.

### Paragraph repair

- Normalize CRLF, trailing whitespace, and repeated blank lines without collapsing real paragraph boundaries.
- Rejoin hard-wrapped PDF/plain-text lines when evidence indicates they belong to one paragraph.
- Preserve Markdown headings, fenced code, lists, blockquotes, and tables as structural boundaries.
- Do not use document-wide paragraph deletion. Only remove adjacent exact duplicates or extraction artifacts supported by structural evidence.

### Chunk planning

- Treat headings, images, code blocks, tables, and explicit section changes as hard or strong boundaries.
- Attach a heading to the following content when possible; never leave a heading-only analysis chunk.
- Keep a valid natural paragraph intact when it is below the hard limit, even when it exceeds the preferred size.
- Merge adjacent short paragraphs within the same section until the preferred reading range is reached.
- Do not merge across an image, heading/section boundary, code/table block, or clear topic-transition marker.
- Keep list items together as a list group; split only between items when the group exceeds the hard limit.
- Keep blockquotes intact where possible and avoid mixing a quote with unrelated following prose.
- Split an oversized single paragraph only as a fallback, at protected sentence boundaries and near a balanced target.
- Protect abbreviations, decimals, citations, initials, ellipses, URLs, domains, version numbers, and common academic references from false sentence breaks.
- If no safe sentence boundary exists, prefer punctuation/whitespace boundaries before a final grapheme-safe hard split.

### Size policy

- Measure size with a language-neutral estimated-token cost rather than JavaScript UTF-16 length, Rust bytes, or raw character count.
- Initial policy: preferred 280-650 estimated tokens, soft ceiling 850, hard ceiling 1400.
- A single paragraph may pass the soft ceiling intact but not the hard ceiling.
- Tiny trailing paragraphs should be back-merged into the previous compatible block when doing so remains below the soft ceiling.
- Thresholds must live in one backend configuration object and be covered by behavior tests, not duplicated as UI constants.

### Identity and downstream consistency

- Return chunk metadata including stable content-derived ID, ordinal index, unit range, heading path, text, and split reason.
- Persist the same canonical text and heading path that the UI displays and the AI analyzes.
- Map analysis cards by chunk ID/index, never by a separate count of “valuable” frontend blocks.
- Translation remains presentation-only and addresses canonical chunk IDs.
- Reopening a source must reproduce the persisted blocks without re-splitting them in the frontend.
- Existing saved sources remain readable; no destructive migration or automatic rewrite is required.

### Performance and resilience

- Chunk planning is deterministic and local; it must not call an AI provider.
- Planning should be linear in the number of structural units plus text length.
- Avoid parsing the same rich HTML repeatedly during React renders.
- Limit concurrent AI analysis separately from chunk planning so larger coherent blocks reduce request count without causing request bursts.
- If structured extraction fails, fall back to paragraph-aware plain-text units and surface no fatal import error.

## Acceptance Criteria

- [ ] `i.e.`, `e.g.`, `et al.`, `3.5`, `v1.2.3`, URLs, domains, and initials are never split internally.
- [ ] A normal natural paragraph below the hard limit remains a single unit/block.
- [ ] Two to four short adjacent paragraphs in the same section can merge into one block with `\n\n` preserved.
- [ ] Headings attach to following prose and start a new chunk.
- [ ] Images remain in source order and force a text boundary without corrupting analysis-card alignment.
- [ ] Lists split between list items, not inside an item; code and tables are not sentence-split.
- [ ] An oversized paragraph splits at balanced safe sentence boundaries; concatenating the results preserves all source text apart from documented whitespace normalization.
- [ ] Frontend display block text, backend analyzed chunk text, and persisted `source_chunks.text` are identical for the same chunk index/ID.
- [ ] Reopening a saved source does not invoke a second chunking algorithm.
- [ ] Pasted text, fetched HTML, Markdown/plain text, PDF hard wraps, and CJK/English mixed text have regression fixtures.
- [ ] Existing source workspaces still open and existing citations remain navigable.
- [ ] Frontend typecheck/tests/build and backend check/tests pass.

## Technical Approach

1. Add a backend `content_chunking` module containing structural DTOs, normalization, paragraph repair, size estimation, protected sentence boundaries, and the canonical planner.
2. Extend extraction/parsers to emit structural units while retaining current plain text/rich HTML compatibility fields.
3. Expose planned chunks through the typed Tauri API and pass them into streaming analysis/persistence as the authoritative chunk set.
4. Replace `Explore.tsx` local text splitting with rendering of canonical chunks plus interleaved media units.
5. Replace sequential valuable-block/card matching with chunk identity matching.
6. Route indexed-file chunking through the same planner using a profile appropriate for search indexing, while sharing structural and boundary logic.
7. Add fixture-driven and property-style tests for text preservation, boundary safety, deterministic output, and cross-layer identity.

## Decision (ADR-lite)

**Context**: Three independent splitters currently disagree, and the 400-character cap destroys natural paragraph structure.

**Decision**: Adopt a single deterministic backend planner based on typed document structure, with natural paragraphs as the primary unit and sentence splitting only as an oversized-paragraph fallback.

**Consequences**: This requires a cross-layer DTO change and compatibility path, but it removes the root cause rather than growing abbreviation regexes. Larger coherent blocks may change analysis density, so analysis prompts and concurrency limits must be tuned and tested together.

## Rollout Plan

1. Add planner and fixtures behind the existing import path with no database schema deletion.
2. Integrate fetched HTML and pasted/plain text, then verify Explore display-analysis identity.
3. Integrate local document and indexed-folder paths.
4. Remove obsolete frontend and backend duplicate splitters only after parity tests pass.

## Out of Scope

- AI-generated semantic/topic segmentation.
- Rewriting all historical source chunks in the database.
- OCR layout reconstruction beyond the text/paragraph signals currently returned by parsers.
- Changing the meaning of saved points, evidence, reports, or translation data.

## Research References

- `research/current-chunking-audit.md` - audit of current splitters, drift risks, and recommended architecture.

## Technical Notes

- Existing `source_chunks.heading_path` can carry preserved hierarchy.
- Existing `FetchedPage.html` retains enough HTML tag information to seed typed web units.
- Current `parseSourceBlocks()` and `split_candidate_chunks()` should become consumers or be removed, not remain independent authorities.
- The first regression fixture should use the reported Lilian Weng article paragraph containing `i.e.` and `et al.`.

