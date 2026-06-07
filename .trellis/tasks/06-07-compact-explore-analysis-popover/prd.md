# Compact Explore Analysis Popover

## Goal

Clicking the star/action beside an Explore result should open a compact analysis card around that clicked item, not a full-height right sidebar.
The global star ring should expose collection composition on single click and reserve digest generation for double click.

## Requirements

- Replace the full-height `ChunkDrawer` presentation with a floating card sized to its content.
- Center the floating card near the clicked star button when possible.
- Keep a max height with internal scrolling for long summaries or comments.
- Preserve existing summary, commentator, labels, close behavior, and outside-click close.
- Avoid layout shift in the result list when the analysis card opens.
- When the analysis card opens, move the main result column left enough that text and images are still readable.
- Draw an animated sparkling connector from the clicked star to the centered analysis card.
- Single-clicking the bottom star ring opens a compact source-composition panel.
- Double-clicking the bottom star ring generates the digest.
- The ring uses multi-color proportional segments grouped by source file/page name.
- A successful digest generation clears the current starred collection so the user starts collecting again.
- The same stored point must not be counted multiple times in one collection.

## Verification

- `npm run build`
- `cargo check`
