# Directory Structure

> How frontend code is organized in this project.

---

## Overview

<!--
Document your project's frontend directory structure here.

Questions to answer:
- Where do components live?
- How are features/modules organized?
- Where are shared utilities?
- How are assets organized?
-->

## Directory Layout

```
frontend/src/
├── components/
│   ├── ui/           # shadcn/ui base components (auto-generated, do not edit)
│   ├── PointCard.tsx # Single Point display + action buttons
│   ├── PointTree.tsx # Recursive tree of PointCards
│   └── charts/       # ECharts wrappers (RadarChart, TrendChart)
├── pages/
│   ├── Explore.tsx   # Main exploration view
│   ├── Library.tsx   # Total knowledge base
│   ├── Projects.tsx  # Project management
│   └── Settings.tsx  # LLM config + Ollama detection
├── store/
│   └── index.ts      # Zustand stores (one slice per domain)
├── api/
│   ├── index.ts      # All invoke() calls, typed wrappers
│   └── types.ts      # Shared TypeScript types mirroring Rust structs
└── main.tsx
```

## Module Organization Rules

- New page → new file in `pages/`, register in router
- New reusable component → `components/` (not inside a page file)
- All `invoke()` calls → `api/index.ts` only; pages/components never call `invoke` directly
- shadcn/ui additions via `npx shadcn@latest add <component>` → auto-placed in `components/ui/`

## Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Components | `PascalCase.tsx` | `PointCard.tsx` |
| Hooks | `camelCase.ts` prefixed `use` | `usePointTree.ts` |
| Store slices | `camelCase` | `sessionStore` |
| API functions | `camelCase` matching command name | `extractText`, `getPointTree` |
