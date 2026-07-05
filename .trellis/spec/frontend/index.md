# Frontend Development Guidelines

> Project-specific guidance for the React/Vite/Tauri frontend.

---

## Overview

The frontend is a React 18 + Vite application embedded in a Tauri desktop shell. It uses Tailwind utility classes, lucide icons, Framer Motion for focused transitions, Zustand stores, and a typed `src/api` boundary for Tauri commands.

Read the files below before changing frontend code. For cross-layer work that touches Rust commands or SQLite, also read the backend spec files that own the command/database contract.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Source layout, module boundaries, placement rules | Project-specific |
| [Component Guidelines](./component-guidelines.md) | Component shape, props, styling, motion, accessibility | Project-specific |
| [Hook Guidelines](./hook-guidelines.md) | Custom hook scope, effects, DOM animation cleanup | Project-specific |
| [State Management](./state-management.md) | Zustand stores, local state, backend-backed state, localStorage | Project-specific |
| [Type Safety](./type-safety.md) | Shared DTOs, command map typing, nullability, runtime guards | Project-specific |
| [Quality Guidelines](./quality-guidelines.md) | Verification commands, forbidden patterns, scenario contracts | Project-specific |

---

## Pre-Development Checklist

Before frontend implementation:

1. Read [Directory Structure](./directory-structure.md) to place files correctly.
2. Read [Type Safety](./type-safety.md) before changing API payloads, shared records, or serialized data.
3. Read [State Management](./state-management.md) before adding store state, localStorage, or cross-component selections.
4. Read [Component Guidelines](./component-guidelines.md) before adding page or component UI.
5. Read [Hook Guidelines](./hook-guidelines.md) before adding effects, DOM listeners, or custom hooks.
6. Read [Quality Guidelines](./quality-guidelines.md) for required checks and scenario-specific contracts.

---

## Quality Check

For material frontend changes, run from `frontend/`:

```powershell
npm run typecheck
npm run check:boundaries
npm run test:run
npm run build
```

Use `npm run test:run`, not `npm test`, for automation.

---

## Core Boundary

UI code must not call Tauri `invoke` directly. Add or update the typed command map and API wrapper in `frontend/src/api/`, then import the wrapper from pages, components, stores, or helpers.
