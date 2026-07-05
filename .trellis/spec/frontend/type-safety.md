# Frontend Type Safety

> TypeScript conventions and contracts for the frontend.

---

## Overview

The frontend is TypeScript strict (`frontend/tsconfig.json`) and uses shared interfaces in `frontend/src/api/types.ts` plus a typed Tauri command map in `frontend/src/api/commandMap.ts`. Types should make backend command payloads, UI records, and helper contracts explicit.

Reference files:

- `frontend/tsconfig.json`
- `frontend/src/api/types.ts`
- `frontend/src/api/commandMap.ts`
- `frontend/src/api/invoke.ts`
- `frontend/src/api/index.ts`
- `frontend/src/lib/reportArtifacts.ts`
- `frontend/src/lib/reportArtifacts.test.ts`

---

## Shared Types

Put backend-facing DTOs and cross-feature records in `frontend/src/api/types.ts`.

Examples:

- `StoredPoint`, `ChunkCard`, `SourceWorkspaceRecord`
- `EvidenceRecord`, `EvidenceSourceRecord`, `DigestCitation`, `DigestResult`
- `ReportRecord`, `SaveReportInput`, `ReportKind`
- `WorkspaceSearchResult` discriminated union

Keep component-only view state types local to the component file unless another module imports them.

Example: `Explore.tsx` keeps local UI types such as `FactBubbleState`, `SelectionToolbarState`, and `SourceBlock` in the page because they describe page internals.

---

## Tauri Command Typing

Every command available to the frontend should be represented in `TauriCommandMap`:

```ts
search_reports: {
  args: { query: string }
  result: ReportRecord[]
}
```

Then expose a narrow wrapper in `frontend/src/api/index.ts`:

```ts
export const searchReports = (query: string): Promise<ReportRecord[]> =>
  invokeCommand('search_reports', { query })
```

This keeps command names, payload shapes, and result types centralized. UI code should import the wrapper, not `invokeCommand` or Tauri `invoke`.

---

## Nullability And Optional Fields

Backend records commonly use explicit `null` for absent persisted values. Match that in TypeScript instead of using broad optional fields.

Examples:

- `EvidenceRecord.sourceId: string | null`
- `EvidenceRecord.chunkIndex: number | null`
- `ReportRecord.sourceName: string | null`
- `PointSourceContext.anchorText: string | null`

Use optional fields for frontend input convenience where callers may omit a value:

```ts
export interface SaveReportInput {
  sourceName?: string | null
}
```

When crossing the command boundary, normalize optional values to `null` in the API wrapper.

---

## Discriminated Unions

Use discriminated unions for result sets where the rendered behavior depends on item kind.

Example: `WorkspaceSearchResult` is discriminated by `kind: 'source' | 'point'`, allowing Library search to branch without unsafe casts.

When adding a new asset type to a mixed result stream, update the union or keep the type in a separate typed result array if the backend command remains separate.

---

## Runtime Guards

Use small local type guards when reading untrusted JSON or localStorage.

Examples:

- `isExploreHistoryItem()` in `exploreStore.ts` validates localStorage history entries.
- `parseReportCitations()` in `reportArtifacts.ts` catches malformed JSON and filters with `isDigestCitation()`.
- `metadataFromWorkspace()` in `exploreStore.ts` catches invalid source metadata JSON and falls back to derived metadata.

Do not assume localStorage or serialized backend JSON is valid just because the app wrote it previously.

---

## Type Imports And Assertions

- Use `import type` for type-only imports.
- Prefer explicit interfaces/types over `any`.
- Avoid type assertions except at unavoidable platform boundaries, such as Tauri file drop path access or DOM query results.
- If a type assertion is needed, keep it local and surround it with runtime checks where possible.

Examples:

- `const selected = await open(...)` is checked with `typeof selected === 'string'`.
- DOM query results are typed as `HTMLElement | null` and checked before use.
- Drag/drop file path access in `Explore.tsx` is a Tauri/browser interop boundary and should not spread into shared helpers.

---

## Testing Type Contracts

Use `npm run typecheck` for full frontend type validation. Use focused Vitest tests for helpers that parse, transform, or serialize typed records.

Examples:

- `reportArtifacts.test.ts` verifies report save input, citation parsing, and kind filtering.
- `digestArtifacts.test.ts` verifies citation markdown output.
- `evidenceLedger.test.ts` verifies verdict filtering.

---

## Anti-Patterns

- Do not duplicate Rust command payload details in a component.
- Do not return `unknown` from API wrappers when the result type is known.
- Do not parse JSON in render; parse in helpers or stores and return typed fallback values.
- Do not add broad string unions when the backend contract has exact values, such as `ReportKind` or `EvidenceRecord['verdict']`.
