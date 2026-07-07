# Citation Jump/Highlight Local Research

## Comparable Patterns From `炼化/`

* Zotero reader pattern: a citation is useful when it can carry the reader back to the cited source context, not just list bibliographic metadata.
* Kotaemon answer-source pattern: generated answer citations should expose the evidence fragment so users can quickly verify model output.
* Zettlr/notes pattern: source context should remain local and document-centered; navigation should not require a server-side routing framework.

## Current Thepoint State

* `ReportModal` already loads computed citation audit and persisted report audit through typed frontend API wrappers.
* Citation locator result includes status, target kind/id, match locations, snippets, and source/chunk metadata.
* `ReportModal` already receives `onOpenSource(sourceId, chunkIndex)`.
* `App.tsx` already routes `onOpenSource` to the Explore page and selected source/chunk state.
* `Explore.tsx` renders Source chunk text as local React state; this is the safest place to add transient visual highlight.

## Feasible Approaches

### Approach A: One-Time Source Highlight Payload (Recommended)

Extend the existing `onOpenSource` callback with an optional highlight payload. ReportModal passes quote/snippet/label from the locator. Explore renders a transient `<mark>` around the first matching text segment and clears the request after a timeout.

Pros:
* Small frontend-only change.
* Reuses existing source open flow.
* Testable with pure text-splitting helper.

Cons:
* Only supports Source text, not Point/Evidence cards yet.
* Offset mapping remains best-effort because locator offsets are computed against synthesized target text.

### Approach B: Global Asset Deep-Link Router

Introduce a single asset navigation command that can target Source, Point, Evidence, Report, and Gallery with optional highlight metadata.

Pros:
* Strong future foundation.

Cons:
* Too broad for this slice; touches multiple pages and view states.

### Approach C: Persisted Highlight Rows

Store highlight targets as durable annotations.

Pros:
* Reusable and reviewable later.

Cons:
* Changes product semantics from temporary verification aid to annotation system; requires schema and delete/update behavior.

## MVP Decision

Use Approach A. It gives immediate report citation复核 value while preserving a future path to a unified asset deep-link router.

## Verification Notes

* Add helper tests for exact match, offset-preferred repeated match, and missing match fallback.
* Run frontend typecheck/boundary/tests/build.
* Run Rust check/test because this goal requires full validation after each feature round even when this slice is frontend-only.
