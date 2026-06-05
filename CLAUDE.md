# Deep Explorer — Project Context

## 项目概述

Tauri v2 + Rust + React (TypeScript) 桌面 app。
AI 辅助阅读工具：导入文档 → 提取关键观点 → 知识库管理 → 深挖/相似搜索。

## 项目结构

```
Thepoint/
├── frontend/          # React + Vite + Tailwind 前端
│   ├── src/
│   │   ├── pages/     # Explore, Library, Analytics, Settings
│   │   ├── components/# PointCard, PointTree, DeepenActions
│   │   ├── store/     # Zustand: useConfigStore, useLibraryStore, useExploreStore, useThemeStore
│   │   ├── api/       # Tauri invoke 封装
│   │   └── index.css  # CSS 变量主题系统
│   ├── public/fonts/  # 内嵌字体：Monaco 400.ttf, NotoSerifSC-VariableFont_wght.ttf
│   └── tailwind.config.js  # 颜色/字体全部引用 CSS 变量
├── src-tauri/
│   └── src/
│       ├── db/mod.rs       # SQLite + FTS5，核心数据层
│       ├── commands/       # library.rs, explore.rs, config.rs, analytics.rs
│       ├── ai/             # OpenAI/Anthropic 接口
│       └── parsers/        # PDF, txt, md 解析
└── .github/workflows/build.yml  # 跨平台打包（仅手动触发）
```

## 启动开发

```bash
cd frontend
npx tauri dev       # 完整 Tauri app（需 Rust 环境）
# 或
npm run dev         # 仅前端 Vite（无 Rust 后端，AI 功能不可用）
```

## 构建

```bash
cd frontend
npm run build       # 前端 build
cd ../src-tauri
cargo build         # Rust build
```

## 技术要点

### 主题系统（CSS 变量驱动）
- `:root` 定义暗色变量，`.light` class 覆盖浅色
- `useThemeStore` 持久化：`mode` / `accent` / `uiFont` / `codeFont` / `fontSize`
- 变量：`--color-*`、`--font-ui`、`--font-code`、`--font-size-base`

### 数据库（SQLite）
- `points` 主表 + `points_fts` FTS5 虚表（trigram tokenizer）
- 3 个 trigger 自动同步 FTS
- `rusqlite` 需 `bundled-full` feature

### Tauri Commands（主要）
- `list_points` / `save_points` / `delete_point` / `search_points`
- `deepen_point` / `find_similar`
- `get_config` / `set_config` / `get_profiles` / `set_profiles`
- `extract_text` / `parse_document`

### 环境注意
- Windows：需 VS2022 C++ Build Tools
- Scoop Git 的 `link.exe` 会遮蔽 MSVC linker → 构建前确保 PATH 里 MSVC 优先
- `tsconfig.json` 已加 `noEmit: true`，防止 tsc 输出 .js 到 src/

## Trellis 工作流

```bash
python .trellis/scripts/task.py create "<slug>"  # 建任务
python .trellis/scripts/task.py archive <slug>   # 归档（自动 commit）
```
