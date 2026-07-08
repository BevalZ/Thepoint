# Unified Search Filter Preview Local Research

## Comparable Patterns From `炼化/`

* Memos-style filter syntax is useful only when narrowly constrained; users need quick filters, not arbitrary database access.
* Zettlr/Joplin-style unified search works best when results include a preview/snippet and a reason for why they matched.
* Foam/Logseq-style knowledge workflows benefit when search results and relations share a common asset vocabulary.
* Kotaemon/Quivr-like RAG pipelines need a trusted retrieval surface before any agent or model context expansion is safe.

## Current Thepoint State

* `Library.tsx` default search already fans out to workspace/evidence/report/gallery APIs, while Journal and scoped modes call separate APIs.
* Backend has separate search helpers for workspace, evidence, reports, journal, gallery, and indexed file listing/preview.
* Frontend already has `WorkspaceSearchResult` but not a unified asset result type.
* Indexed files have metadata/preview columns but are not visible in Library default search.
* API boundary rules are strict: pages must call wrappers from `frontend/src/api`, not Tauri `invoke`.

## MVP Decision

Add a schema-free `search_assets(input)` command that aggregates existing search helpers and one indexed-file search helper. Keep filter syntax deliberately small:

```text
kind == "source"
reportKind == "investigation"
sourceKind == "indexed_folder"
```

This avoids a risky SQL DSL while giving users immediate asset-wide search and a future extension point.

## Risks And Controls

* Risk: duplicated search ranking across asset types.
  * Control: MVP uses coarse per-kind scores and stable grouping; ranking improvements can come later.
* Risk: filter DSL grows into arbitrary SQL.
  * Control: parse only explicit `field == "value"` whitelist; reject anything else.
* Risk: UI rewrite becomes too broad.
  * Control: only replace Library default search. Leave scoped Evidence/Reports/Journal/Gallery modes unchanged.
* Risk: indexed file search pulls too much data.
  * Control: use bounded limit and preview snippets.

