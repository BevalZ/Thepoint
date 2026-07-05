# Frontend Component Guidelines

> How React components are built in this project.

---

## Overview

Components are functional React components written in TypeScript and styled with Tailwind utility classes. The application favors dense desktop-tool UI: compact controls, clear icons, restrained panels, and stateful workflows over marketing-style sections.

Reference files:

- `frontend/src/App.tsx` for app shell, navigation, title bar, lazy pages, and Framer Motion transitions.
- `frontend/src/components/PointCard.tsx` for editable card props, local draft state, Tailwind styling, and motion variants.
- `frontend/src/components/EvidenceList.tsx` for reusable list rendering with a `renderAction` extension point.
- `frontend/src/components/DigestModal.tsx` for modal structure, report actions, and citation navigation.
- `frontend/src/pages/Library.tsx` for page-level composition of shared components and local render helpers.

---

## Component Shape

Use named exports for shared components:

```ts
export function EvidenceList({ records, title, onOpenSource, renderAction }: EvidenceListProps) {
  // ...
}
```

Default exports are used for lazy-loaded pages:

```ts
export default function Library({ onOpenPointSource, onOpenSource }: LibraryProps) {
  // ...
}
```

Keep component files ordered roughly as:

1. Imports.
2. Local constants and variant maps.
3. Local helper functions.
4. Props interfaces.
5. Component implementation.
6. Small private child components when they are only used in this file.

Do not extract a helper purely because the file is long. Extract when reuse, testability, or ownership requires it.

---

## Props

- Define a local `interface` for props when the component has more than one or two props.
- Use callback props for navigation and side effects rather than importing page stores into deeply reusable components.
- Use `ReactNode` only for extension slots, such as `EvidenceList.renderAction`.
- Keep optional callbacks optional and guard invocation with `?.`.

Examples:

- `EvidenceListProps.renderAction?: (record: EvidenceRecord) => ReactNode` lets Library add Digest actions without hard-coding Digest behavior into the list.
- `DigestModal.onOpenSource?: (sourceId: string, focusChunkIndex?: number | null) => void` keeps citation navigation owned by the app shell/page.
- `LibraryProps.onOpenPointSource` and `onOpenSource` keep source opening coordinated through `App.tsx`.

---

## Styling

- Use Tailwind classes inline with project design tokens from `index.css`: `bg-bg`, `bg-bg-elevated`, `bg-bg-hover`, `text-fg`, `text-fg-muted`, `text-fg-faint`, `border-border`, `text-accent`.
- Use `cn()` from `@/lib/utils` for conditional class composition.
- Use lucide icons for button affordances and state cues.
- Use compact rounded controls (`rounded-md`, `rounded-lg`) and avoid nesting cards inside cards.
- For repeated states, prefer constant maps such as `VERDICT_CLASSES` in `EvidenceList.tsx` or `TAG_STYLES` in `PointCard.tsx`.

Example pattern:

```ts
className={cn(
  'rounded-lg border border-border bg-bg-elevated px-4 py-3',
  selected && 'border-accent/40 bg-accent/10 text-accent'
)}
```

---

## Interaction And State

- Keep transient UI state local: modal copied state, draft inputs, loading flags for a single button, or current hover/selection state.
- Use global stores only for cross-page or cross-component state; see `state-management.md`.
- Guard duplicate async actions with loading state, as in report deletion and report archive actions.
- Prefer `type="button"` on buttons that are not form submissions.
- Use `title` for icon-only or compact controls when the meaning is not obvious.

---

## Motion

Framer Motion is used for navigation transitions, modal entry/exit, card hover/tap effects, and animated overlays.

- Keep motion variants near the component that owns them.
- Respect reduced motion for app-level page transitions, as in `App.tsx` with `useReducedMotion()`.
- Do not use animation to mask missing loading, empty, or error states; render those states explicitly.

---

## Accessibility And Runtime Safety

- Use semantic elements for repeated content (`article`, `section`, `button`, `a`) as the existing components do.
- External links should include `target="_blank"` and `rel="noreferrer"`.
- Overlay modals should stop propagation on their content container and close from the backdrop or close button.
- Browser preview can run without Tauri internals; components must tolerate empty API fallback data and missing desktop runtime.

---

## Common Mistakes

- Bypassing `src/api` from a component instead of importing a typed API wrapper.
- Copying a report/evidence row renderer and letting action behavior diverge. Prefer a local render helper or shared component when the same row appears in multiple sections.
- Putting stable artifact generation inside a modal component instead of `src/lib/`, which makes it hard to test copy/download/archive behavior.
- Adding generic explanatory UI text that describes how the feature works instead of building the actual workflow state.
