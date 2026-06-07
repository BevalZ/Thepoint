# Merge Short Explore Paragraphs

## Goal

When imported or pasted content contains many very short natural paragraphs, merge adjacent paragraphs into larger analysis blocks so the Explore loading animation and LLM analysis operate on coherent 200-400 character blocks instead of one tiny card per sentence.

## Requirements

- Merge adjacent short text paragraphs into one analysis block when possible.
- Target merged text blocks should be 200-400 Chinese/Unicode characters.
- Preserve natural paragraph breaks inside merged blocks with newline separators.
- Keep long paragraphs splittable so oversized blocks do not become unwieldy.
- Keep frontend source/processing blocks and backend LLM analysis chunks aligned by using equivalent local splitting rules.
- Do not merge across image blocks in rich HTML; images remain their own source blocks.
- Preserve existing filtering that ignores low-value text blocks before LLM analysis.

## Verification

- `npm run build`
- `cargo test split_candidate_chunks_merges_short_paragraphs_preserving_breaks`
- `cargo check`
