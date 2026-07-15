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

### Convention: Source Citation Highlight Navigation

**What**: When a report citation needs to open Source Workspace and visually locate a quote, extend the existing source-open callback with an optional `SourceHighlightRequest` from `frontend/src/lib/sourceHighlight.ts`:

```ts
onOpenSource?: (
  sourceId: string,
  focusChunkIndex?: number | null,
  highlight?: SourceHighlightRequest | null
) => void
```

**Why**: ReportModal, DigestModal, Library, StarRing, App, and Explore all participate in source navigation. A single optional payload keeps the navigation owner in `App.tsx`, keeps the transient highlight state out of durable stores, and prevents each component from inventing its own quote/span shape.

**Rules**:

- Keep highlight state transient in the app/page layer; do not persist it to Zustand or SQLite unless the product becomes durable annotations.
- Put quote/span splitting logic in `frontend/src/lib/sourceHighlight.ts` with focused Vitest coverage.
- Components may pass a highlight payload, but only Explore should render the `<mark>` because it owns Source text blocks and scroll state.
- If the quote/span cannot be found, open the Source normally rather than throwing or blocking navigation.

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

### Runtime Performance Contract

Decorative motion must have a bounded lifetime or an active-work reason. Global backgrounds and idle cards must not use a JavaScript frame loop, an infinite Framer Motion transition, or a compositor-heavy CSS animation. Keep continuous motion only for an active operation such as parsing, analysis, or fact-checking; use a static visual plus a short entry transition everywhere else.

For repeated rows and heavy content, add `content-visibility: auto` through the shared `perf-content-auto` class when the browser can skip off-screen layout and paint without changing interaction semantics. A hidden page that owns an in-flight workflow may preserve store state and Promise chains, but should return no heavy DOM while inactive.

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
