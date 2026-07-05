# Knowledge Workbench E2E Checklist

Use this checklist before releasing changes that touch Source, Point, Evidence, Digest, or Synthesis behavior.

## Preconditions

- App starts with a configured text model.
- Search/fact-check provider is configured when testing live fact checks.
- Use a small webpage or pasted article with at least three factual claims.

## Flow

1. Import a Source.
   - Paste text, fetch a webpage, or load a local document.
   - Confirm Source Workspace shows chunks and source metadata.

2. Generate and save Points.
   - Run analysis/extraction.
   - Save at least two Points.
   - Confirm Library shows the Points and can open their Source/Chunk.

3. Save Evidence from fact check.
   - Select a claim in Explore and run fact check.
   - Save the fact check as Evidence.
   - Confirm the Source Evidence panel shows verdict, claim, answer, checked time, source links, and source/chunk return.

4. Verify Evidence from Point context.
   - Open Library list/grouped/Kanban view.
   - Confirm the linked Point shows its Evidence section.
   - Click the Evidence source control and confirm it returns to the correct Source/Chunk.

5. Search Evidence.
   - Search Library for a claim, answer phrase, or evidence source URL.
   - Confirm Evidence results render separately from Source and Point results.
   - Add one Evidence result to Digest input and confirm the global ring count updates.

6. Generate Digest with citations.
   - Star at least one Point.
   - Generate Digest from the ring.
   - Confirm the Digest modal shows Markdown content and a structured citation list.
   - Confirm `[P*]` and `[E*]` citations have correct labels and source/chunk return where available.
   - Save the Digest as a Report.
   - Open Library -> Reports and confirm the saved Digest appears.
   - Reopen the saved Report and confirm copy/download output includes the citation appendix.

7. Generate multi-source synthesis.
   - Search Library for at least two Sources.
   - Add them to the synthesis input panel.
   - Optionally enable “包含 Star”.
   - Generate synthesis.
   - Confirm the report includes common themes, aligned claims, conflicting claims, evidence strength, unresolved questions, next steps, and citations.
   - Confirm `[S*]`, `[P*]`, and `[E*]` citation entries can open Source/Chunk when metadata is present.
   - Save the synthesis as a Report and confirm it reopens from Library -> Reports.

8. Empty and degradation states.
   - Evidence without source context shows “无来源定位” and no broken jump button.
   - Synthesis refuses to run with no selected Source and no Star input.
   - Digest refuses to run with no Point and no Evidence input.

## Automated Regression Commands

Run these after code changes:

```powershell
cd frontend
npm run test:run
npm run typecheck
npm run check:boundaries
cd ..
cargo test --manifest-path src-tauri\Cargo.toml evidence
cargo test --manifest-path src-tauri\Cargo.toml report
cargo test --manifest-path src-tauri\Cargo.toml digest
cargo test --manifest-path src-tauri\Cargo.toml synthesis
cargo check --manifest-path src-tauri\Cargo.toml
```
