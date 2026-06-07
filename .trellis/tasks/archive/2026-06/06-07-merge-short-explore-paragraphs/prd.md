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
- After generated results finish revealing, play a lightweight celebratory confetti animation.
- Result text cards should size to their actual paragraph content height, with the star action centered beside the content instead of creating tall stretched cards.
- Summary text should avoid meta openings such as “文章以”, “该文本”, or “本文”, and read like a natural human summary.

## Verification

- `npm run build`
- `cargo test split_candidate_chunks_merges_short_paragraphs_preserving_breaks`
- `cargo test ai::openai::tests`
- `cargo check`
