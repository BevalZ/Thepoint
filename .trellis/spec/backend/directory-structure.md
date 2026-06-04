# Directory Structure

> Root: `src-tauri/src/` — Rust Tauri backend

## Directory Layout

```
src-tauri/src/
├── lib.rs              # Tauri app entry; all commands registered here via generate_handler![]
├── main.rs             # Thin wrapper: calls lib::run()
├── commands/           # One file per domain, each exports #[tauri::command] fns
│   ├── extract.rs      # AI extraction (extract_text, extract_file)
│   ├── points.rs       # Point CRUD + bulk_add_to_library
│   ├── sessions.rs     # Session lifecycle (create/end/archive/wake)
│   ├── projects.rs     # Project management
│   ├── actions.rs      # Deep-dive actions (explain/counter/followup/similar)
│   ├── search.rs       # Internal FTS5 + web + academic search
│   ├── stats.rs        # Behavior stats aggregation
│   └── config.rs       # LLM config + detect_ollama
├── db/
│   ├── mod.rs          # Connection pool init; runs migrations on startup
│   ├── migrations/     # Numbered SQL files: 001_init.sql, 002_fts5.sql …
│   └── queries/        # Complex query functions (NOT inlined in commands)
├── parsers/            # Document parsing — one file per format
│   ├── pdf.rs          # lopdf
│   ├── docx.rs         # docx-rs
│   ├── pptx.rs         # zip + XML
│   └── plaintext.rs
├── ai/
│   ├── mod.rs          # trait LLMClient { complete, stream }
│   ├── openai.rs       # reqwest → OpenAI HTTP API
│   └── ollama.rs       # reqwest → localhost:11434
└── search/
    ├── internal.rs     # FTS5 queries
    ├── web.rs          # Proxied web search
    └── academic.rs     # arXiv / PubMed / Crossref / Google Scholar / Baidu
```

## Module Organization Rules

- New domain → new file in `commands/`. Never add commands directly to `lib.rs`.
- DB queries longer than 3 lines → move to `db/queries/`, not inline in commands.
- Never import `rusqlite` directly in `commands/` — access DB through `db/` module only.
- Parsers return `String` (extracted text); structuring into Points is done in `commands/extract.rs`.

## Naming Conventions

- Files: `snake_case.rs`
- Tauri commands: `snake_case` (e.g. `extract_text`, `bulk_add_to_library`)
- Structs/Enums: `PascalCase`
- All public types that cross the Tauri boundary must `#[derive(Serialize, Deserialize)]`
