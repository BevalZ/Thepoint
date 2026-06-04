# Type Safety

> Type safety patterns in this project.

---

## Overview

<!--
Document your project's type safety conventions here.

Questions to answer:
- What type system do you use?
- How are types organized?
- What validation library do you use?
- How do you handle type inference?
-->

## Type Organization

- **Shared types** (mirror Rust structs): `api/types.ts` — single source of truth
- **Component-local types**: inline `interface Props` at top of file
- No duplicating types from `api/types.ts` — import and reuse

```ts
// api/types.ts — mirrors Rust #[derive(Serialize, Deserialize)] structs
export interface Point {
  id: string
  content: string
  parentId: string | null
  sessionId: string
  tagType: string
  customTags: string[]
  sourceLocation: string | null
  highlight: string | null
  createdAt: string
}
```

## Forbidden Patterns

- ❌ `any` — use `unknown` and narrow, or define the type
- ❌ `as SomeType` type assertions (except in tests or `api/index.ts` invoke wrappers)
- ❌ Optional chaining `?.` to silence TypeScript on potentially null data — handle null explicitly

## Runtime Validation

No Zod for now — Tauri's `invoke` returns data matching our Rust types. If types drift, fix the Rust struct, not a Zod schema.
