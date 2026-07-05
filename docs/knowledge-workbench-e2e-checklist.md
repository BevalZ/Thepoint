# Knowledge Workbench E2E Checklist

Use this checklist before releasing changes that touch Source, Point, Evidence, Digest, Synthesis, or saved Report behavior.

## Manual Runtime

Run persistence-heavy flows in the Tauri desktop runtime, not browser-only preview. Browser preview uses API fallbacks and cannot validate SQLite persistence, Tauri commands, file metadata, or source/report reopen behavior.

```powershell
cargo tauri dev
```

`cargo tauri dev` starts the frontend dev server through the Tauri `beforeDevCommand`.

## Preconditions

- App starts with a configured text model.
- Search/fact-check provider is configured when testing live fact checks.
- Use a small webpage or pasted article with at least three factual claims.

## Flow

1. Import a Source.
   - Paste text, fetch a webpage, or load a local document.
   - Confirm Source Workspace shows chunks and source metadata.
   - Confirm the Source asset panel appears with loading, empty, or linked asset states.

2. Generate and save Points.
   - Run analysis/extraction.
   - Save at least two Points.
   - Confirm Library shows the Points and can open their Source/Chunk.
   - Return to the Source Workspace and confirm linked Points appear in the Source asset panel.

3. Save Evidence from fact check.
   - Select a claim in Explore and run fact check.
   - Save the fact check as Evidence.
   - Confirm the Source asset panel shows Evidence verdict, claim, answer, checked time, source links, and source/chunk return.
   - Export the Evidence record as Markdown and confirm claim, verdict, answer, sources, and Source/Chunk context are present.

4. Verify Evidence from Point context.
   - Open Library list/grouped/Kanban view.
   - Confirm the linked Point shows its Evidence section.
   - Click the Evidence source control and confirm it returns to the correct Source/Chunk.

5. Search Evidence.
   - Search Library for a claim, answer phrase, or evidence source URL.
   - Confirm Evidence results render separately from Source and Point results.
   - Add one Evidence result to Digest input and confirm the global ring count updates.

6. Search unified assets.
   - Search Library default mode for a known Source title, Point phrase, Evidence claim, Report title, and Gallery prompt/path/source Point.
   - Confirm Source, Point, Evidence, Report, and Gallery results render in separate grouped sections.
   - Open a Source or Point result and confirm it navigates to the correct Source/Chunk where available.
   - Open a Gallery result and confirm it switches to the Gallery page.

7. Generate Digest with citations.
   - Star at least one Point.
   - Generate Digest from the ring.
   - Confirm the Digest modal shows Markdown content and a structured citation list.
   - Confirm `[P*]` and `[E*]` citations have correct labels and source/chunk return where available.
   - Save the Digest as a Report.
   - Open Library -> Reports and confirm the saved Digest appears.
   - Filter Reports to “知识研报” and confirm the Digest remains visible.
   - Filter Reports to “多来源综合” and confirm the Digest is hidden unless a matching synthesis report also exists.
   - Reopen the saved Report and confirm copy/download/export output includes the citation appendix.

8. Generate multi-source synthesis.
   - Search Library for at least two Sources.
   - Add them to the synthesis input panel.
   - Optionally enable “包含 Star”.
   - Generate synthesis.
   - Confirm the report includes common themes, aligned claims, conflicting claims, evidence strength, unresolved questions, next steps, and citations.
   - Confirm `[S*]`, `[P*]`, and `[E*]` citation entries can open Source/Chunk when metadata is present.
   - Save the synthesis as a Report and confirm it reopens from Library -> Reports.
   - Filter Reports to “多来源综合” and confirm the synthesis Report remains visible.
   - Filter Reports to “知识研报” and confirm the synthesis Report is hidden unless a matching Digest report also exists.

9. Verify Source asset bundle export.
   - Open a Source with linked Points, Evidence, and at least one saved Report citation.
   - If Gallery images were generated from linked Points, confirm they appear in the Gallery group; otherwise confirm the empty state is explicit.
   - Export the Source asset bundle as Markdown.
   - Confirm the Markdown includes Source metadata plus grouped Points, Evidence, Reports, and Gallery sections.

10. Manage saved Reports.
   - In Library -> Reports, switch the type filter back to “全部”.
   - Delete one saved Report and confirm the row disappears after confirmation.
   - Confirm deleting a Report does not remove the original Source, linked Points, saved Evidence, or the other saved Reports.
   - Search for the deleted Report title and confirm it no longer appears.
   - Reopen a remaining Report and confirm citation source/chunk controls still work.

11. Generate and save an Investigation.
   - Open Library -> Investigations or use the Source Workspace Investigation action.
   - Enter a concrete research question.
   - Include at least one Source and one Evidence record; enable Library search and Journal recall when available.
   - Generate the Investigation and confirm the report includes the question, summary, supporting evidence, conflicts, uncertainties, citation list, and follow-up questions.
   - Save it as an Investigation Report.
   - Reopen it from Library -> Investigations and confirm structured citations can return to Source/Chunk or Evidence context where available.

12. Verify Journal memory.
   - Open Library -> Journal after saving the Investigation.
   - Confirm a Journal entry appears with the original query, summary note, linked Report, and asset IDs.
   - Use the Journal entry to start a new Investigation and confirm the query/scope is prefilled or carried forward.
   - Invalidate the Journal entry with a reason.
   - Search a similar query and confirm the invalidated Journal entry is not included in default Journal search results.

13. Verify Related assets.
   - Rebuild asset relations from Library -> Related.
   - Discover related assets for the Investigation Report, one cited Evidence record, and the current Source.
   - Confirm relation rows show relation type, reason, score, and source signal.
   - Confirm co-cited Evidence/Source assets and Journal-linked assets appear without deleting or mutating the original assets.

14. Verify Review Queue.
   - Add one Source, one Evidence record, and one Investigation Report to Review.
   - Open Library -> Review and confirm due items appear with title, target kind, priority, due date, and note.
   - Complete one item with each rating path as available: again, hard, good, easy.
   - Confirm due dates advance by 1, 3, 7, and 14 days respectively.
   - Snooze one item and dismiss one item.
   - Open an item from Review and confirm navigation returns to the original asset where supported.

15. Verify Open Data Mirror.
   - Open Settings -> Data.
   - Enable Open Data Mirror and choose a local empty test folder.
   - Export with Sources, Evidence, Reports, Journal, and Gallery index enabled.
   - Confirm the folder contains `sources/`, `evidence/`, `reports/`, `investigations/`, `journal/`, `gallery/`, `index.md`, and `manifest.json`.
   - Open exported Markdown files and confirm ids, timestamps, report bodies, citation JSON, and linked asset metadata are readable.
   - Run export again and confirm stable filenames are overwritten rather than duplicated.

16. Verify Indexed Folders.
   - Create a temporary folder with a Markdown file, a JSON file, a code file, and a PDF or binary file.
   - Add the folder in Settings -> Data.
   - Scan the folder.
   - Confirm text-like files are indexed into Source Workspace and searchable from Library.
   - Confirm the PDF or binary file is recorded metadata-only.
   - Modify a text file, scan again, and confirm its Source updates.
   - Remove the indexed folder and confirm generated Sources/Evidence/Reports remain available while the folder entry disappears.

17. Empty and degradation states.
   - Evidence without source context shows “无来源定位” and no broken jump button.
   - A Source with no linked assets shows Source asset panel empty states without hiding Source content.
   - Synthesis refuses to run with no selected Source and no Star input.
   - Digest refuses to run with no Point and no Evidence input.
   - Reports with no saved entries show the empty Reports state.
   - Report type filters with no matches show a no-match state instead of stale rows.
   - Investigation refuses to run when no Source, Point, or Evidence can be collected.
   - Journal entries marked invalidated do not appear in default Investigation recall.
   - Mirror export fails clearly when disabled or missing a root path.
   - Indexed folder scan fails clearly when the configured path no longer exists.

## Automated Regression Commands

Run these after code changes:

```powershell
cd frontend
npm run typecheck
npm run check:boundaries
npm run test:run
npm run build
cd ..
cargo check --manifest-path src-tauri\Cargo.toml
cargo test --manifest-path src-tauri\Cargo.toml
```
