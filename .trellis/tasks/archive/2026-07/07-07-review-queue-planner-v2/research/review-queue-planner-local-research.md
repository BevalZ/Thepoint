# Review Queue Planner v2 Local Research

## Comparable Patterns From `炼化/`

* Foliole-like review queues expose a plan with selected candidates, overflow, and scheduling rationale instead of only listing due records.
* Memos-like lightweight filters prioritize fast review entry and simple state controls over heavy planner configuration.
* Joplin-like local workflows benefit from diagnostic status after mutations: users need to understand what changed and what remains.

## Current Thepoint State

* `review_items` stores target, status, priority, due date, review count, ease, interval, and timestamps.
* Commands exist for add/list due/list all/complete/snooze/dismiss.
* Library Review mode shows all items and mutation actions.
* Existing due listing orders by `due_at ASC, priority DESC`, but `priority` is a string (`low`, `normal`, `high`), so DB string order is not an explicit scheduler contract.

## Feasible Approaches

### Approach A: Schema-Free Planner (Recommended)

Add a read-only planner command that loads review items, computes stats and explicit priority-ranked plan items in Rust, and renders a plan summary in Library.

Pros:
* Small, testable cross-layer feature.
* Fixes priority ranking semantics now.
* No migration or data-risk surface.

Cons:
* Does not record sessions or explain source diversity yet.

### Approach B: Full Review Session Tracking

Add review session tables and item participation rows.

Pros:
* Better long-term review analytics.

Cons:
* Larger schema and UI scope; less suitable for a single additional feature round.

### Approach C: Scheduler Metadata Columns

Add `available_at`, source metadata, and scheduler state JSON now.

Pros:
* Prepares richer scheduling.

Cons:
* Requires migration/backfill decisions before there is enough planner usage feedback.

## MVP Decision

Use Approach A. Keep the command read-only and make the plan payload stable enough for later session/scheduler upgrades.
