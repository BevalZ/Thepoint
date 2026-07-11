# Semantic Retrieval And Research Q&A E2E Checklist

Use this checklist on a desktop Tauri build. Browser preview intentionally cannot download or run the local embedding model.

## A. Credential-free local model flow

- [ ] Start with the local embedding provider selected in Settings → Data.
- [ ] Confirm the index card shows uncached/unavailable model state before first enable.
- [ ] Click “下载模型并建索引”; verify the UI remains responsive and reaches a terminal ready/error state.
- [ ] Cancel during indexing, reopen the page, and verify rebuilding resumes pending chunks without deleting Sources, Points, Evidence, or Reports.
- [ ] Disconnect the network before an uncached first enable; verify an actionable download/offline error, then reconnect and retry successfully.
- [ ] Edit/reimport a Source so chunk text changes; verify stale count increases and returns to zero after rebuild.
- [ ] Restart the app; verify ready vectors are reused without a second model download.

## B. Hybrid retrieval flow

- [ ] Search a literal phrase and confirm keyword rank metadata appears.
- [ ] Search a Chinese question for an English Source (and the reverse); confirm a semantic-only or fused hit appears in the top five.
- [ ] Apply a Source scope and verify results contain only that Source.
- [ ] Select/deselect context cards and verify the answer button count matches the selected cards.
- [ ] Click a result and verify Explore opens the exact Source chunk.

## C. Grounded answer flow (chat credentials required)

- [ ] With no selected/insufficient context, verify the app refuses without creating an invocation audit.
- [ ] With sufficient context, generate an answer and verify every factual paragraph uses valid `[S#]` labels.
- [ ] Verify each rendered citation opens the correct Source/chunk.
- [ ] Save the answer as an Investigation report and verify its citation appendix and invocation/context audit survive restart.
- [ ] Simulate an answer with an unknown/missing citation label through a test provider; verify the answer is rejected and cannot be saved.

## D. Remote embeddings (remote credentials required)

- [ ] Configure Base URL/model and store the API key; confirm the key is absent from ordinary localStorage/config JSON.
- [ ] Rebuild with the remote provider and verify model-key isolation from local E5 rows.
- [ ] Test 401, timeout, malformed JSON, response-count mismatch, and dimension mismatch; verify existing ready vectors remain intact.

## E. Database safety

- [ ] Run integrity check and create a validated backup.
- [ ] Add a disposable Source, restore the backup, and verify the disposable Source disappears while prior data remains.
- [ ] Try restoring a corrupt/non-SQLite file; verify the live DB remains readable and unchanged.
- [ ] Confirm a pre-restore safety backup is retained for manual recovery.

## Evidence to record

Record app version/commit, OS, model/provider, Source count, chunk count, timings, screenshots for errors, and the saved Investigation report ID in the session journal or release notes.
