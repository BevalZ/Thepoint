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

## Forbidden Patterns

- ❌ `invoke()` directly in components — use `api/index.ts` wrappers
- ❌ Editing `components/ui/` files — managed by shadcn CLI
- ❌ Inline `style={{}}` for anything achievable with Tailwind
- ❌ `any` type
- ❌ CSS keyframe animations when Framer Motion can do it

## Required Patterns

- All API calls go through `api/index.ts` typed wrappers
- Global data → Zustand store, not prop-drilling
- `cn()` for conditional Tailwind class merging
- Dark mode tested for every new component

## Testing Requirements

- Unit test pure utility functions in `src/lib/`
- Component tests (Vitest + Testing Library) for interactive components (PointCard actions)
- No need to test simple presentational components or page layouts
