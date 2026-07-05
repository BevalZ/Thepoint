# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

(To be filled by the team)

---

## Forbidden Patterns

<!-- Patterns that should never be used and why -->

(To be filled by the team)

---

## Required Patterns

<!-- Patterns that must always be used -->

(To be filled by the team)

---

## Testing Requirements

<!-- What level of testing is expected -->

(To be filled by the team)

---

## Code Review Checklist

<!-- What reviewers should check -->

(To be filled by the team)

---

## Scenario: Knowledge Workbench Regression Tests

### 1. Scope / Trigger

- Trigger: regression coverage for Evidence, Digest, and Synthesis frontend contracts.
- Applies to: `frontend/src/lib/*.test.ts`, `frontend/src/store/*.test.ts`, `frontend/package.json`, and manual E2E checklist docs.
- Use this when a feature stores report input state, generates citation artifacts, or changes Digest/Synthesis copy/download/archive payloads.

### 2. Signatures

Package script:

```json
{
  "scripts": {
    "test:run": "vitest run"
  }
}
```

Digest artifact helper module:

```ts
citationMarkdown(citations: DigestCitation[]): string
digestMarkdownWithCitations(result: DigestResult): string
digestSourceExcerpt(points: StoredPoint[], citations: DigestCitation[]): string
```

### 3. Contracts

- Use `npm run test:run` for non-watch automated frontend tests.
- Keep testable report artifact logic in `frontend/src/lib/`, not hidden inside React component closures.
- `DigestModal` should consume shared artifact helpers instead of duplicating citation appendix logic.
- Zustand selection stores should be testable directly through `useStore.getState()`.
- Manual E2E acceptance belongs in `docs/knowledge-workbench-e2e-checklist.md`.

### 4. Validation & Error Matrix

| Condition | Behavior |
|---|---|
| Need CI/non-watch frontend tests | Run `npm run test:run` |
| Helper output loses citation appendix | Test must fail on missing `## 引用清单` |
| Store receives duplicate Evidence/Source | Preserve one record and keep existing selection stable |
| Store toggle called for selected record | Remove the record |
| Store clear called | Selection becomes empty |

### 5. Good/Base/Bad Cases

- Good: Digest/Synthesis content copied, downloaded, and archived through the same tested helper output.
- Base: store tests verify add, dedupe, toggle, remove, and clear without rendering UI.
- Bad: component-local helper logic is modified without tests, or `npm test` is used in automation and enters watch mode.

### 6. Tests Required

- `frontend/src/lib/digestArtifacts.test.ts`: citation markdown, digest markdown appendix, source excerpt with stars/citations, citation-only reports.
- `frontend/src/store/reportInputStores.test.ts`: Evidence Digest and Synthesis Source selection store behavior.
- `npm run typecheck`: ensures helper signatures stay aligned with `DigestResult` and `DigestCitation`.
- `npm run check:boundaries`: ensures tests and components do not bypass the API boundary.

### 7. Wrong vs Correct

#### Wrong

```powershell
npm test
```

#### Correct

```powershell
npm run test:run
```
