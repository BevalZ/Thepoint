# Ten-Round Execution Plan

Each round must finish with a task-note entry containing evidence, change, verification, and result.

## Round 1: Canonical sentence-boundary usability

Audit and finish abbreviation-safe splitting for legacy presentation helpers without reintroducing a second canonical chunk planner. Verify English abbreviations/citations and existing CJK punctuation behavior with focused frontend and Rust tests.

## Round 2: Reanalysis recovery and listener lifecycle

Finish the reopened-Source fallback chain (`current text -> matching history -> saved chunk text`) and guarantee that streaming listeners and `analyzing` state settle exactly once whether completion arrives by event, command return, or error.

## Round 3: Investigation depth and evidence quality

Finish the prompt-versioned evidence-role/strength/confidence requirements, retain source-grounded citation rules, and verify deterministic prompt content without asserting model quality that cannot be tested locally.

## Round 4: Hidden Explore presentation suspension

Stop stage/reveal/confetti presentation effects while Explore is inactive while leaving analysis, fact checking, Investigation, Gallery, and Translation Promise work untouched. Verify the visibility policy as a pure helper or focused component-independent test.

## Round 5: Constant-count result reveal scheduling

Replace one-timeout-per-result reveal with one self-rescheduling timeout. Preserve progressive display while active and immediate catch-up for reopened/hidden-completed sources. Test the reveal-state transition helper.

## Round 6: Remove repeated block entrance animation cost

Use a normal icon button for repeated `ThemeBlock` Star/analyze controls instead of mounting a Framer Motion spring for every result. Preserve click, double-click regeneration, context-menu collection, busy, error, title, and focus behavior.

## Round 7: Pool near-viewport observers

Share `IntersectionObserver` instances by root margin, unobserve nodes after first intersection, and release empty pools. Keep the no-observer browser fallback. Add deterministic observer-pool tests with a mocked observer.

## Round 8: Reuse the backend HTTP client

Add a process-wide default `reqwest::Client` and migrate ordinary call sites so connection pools survive between commands and block requests. Preserve dedicated builders where redirect, proxy, or timeout behavior differs. Verify the shared identity/configuration and scan for remaining intentional constructors.

## Round 9: Upsert Explore history snapshots

Update history entries for the same persisted Source instead of appending duplicate full snapshots. Preserve the stable history ID and original creation timestamp, move the updated entry to the front, and keep unrelated/pasted history entries intact. Add pure helper tests.

## Round 10: Single-flight configuration loading

Coalesce concurrent config/profile requests, track profile readiness, prevent the Settings first-load double read, and allow retries after a failed request. Add store-level tests with mocked API calls.

## Final Acceptance

After all rounds:

* run focused tests after each round;
* run the full frontend and Rust gates from the exact staged tree;
* exercise Explore navigation persistence, reanalysis, translation, Investigation failure/retry, Settings loading, Library search, and Gallery controls in browser/desktop-compatible acceptance flows;
* capture final timer/observer/client/history/request-count evidence and production chunk sizes;
* inspect precise staged hunks, commit in coherent batches, archive the task, record the journal, verify `main` and the remote, then push the final commits to GitHub.

