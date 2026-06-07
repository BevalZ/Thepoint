# Fix Duplicate Explore Images And Source Chrome

## Goal

Fix duplicate image blocks in Explore results and polish the visible source/window chrome.

## Requirements

- If the same image URL appears multiple times in fetched rich HTML, show it once in the Explore source/result flow.
- Deduplicate both backend-extracted fetched HTML and frontend-parsed source blocks by normalized resolved image URL.
- Preserve the first useful caption/alt text when duplicate images are removed.
- Hide explicit scrollbars while preserving scroll behavior.
- Replace the native window title strip with an app-themed title bar that follows the current color theme.
- Beautify the Explore source header.
- Add a source metadata button. For local files, show file size, created date, modified date, and character count. For webpages, show the full URL and allow clicking it to open. For pasted text, show source type and character count.
- Download the startup sound from `https://cdn.pixabay.com/audio/2026/05/22/audio_0ca20bc399.mp3` into the frontend assets and play it on app entry.
- Add a reusable frontend sound registry so future UI sound effects can be registered without hardcoding asset paths in components.

## Constraints

- Keep the fix scoped to Explore import/display behavior and app chrome.
- Do not add heavy animation or background computation.
- Preserve existing history behavior; older history entries without metadata must still load.
- Sound playback must fail silently if the runtime blocks autoplay.

## Verification

- `npm run build`
- `cargo test extract_page_content_deduplicates_images_by_normalized_src`
- `cargo check`
- Targeted code inspection confirms image dedupe is based on resolved `src`, not DOM element identity.
