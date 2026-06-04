# 技术架构设计 —— Deep Explorer

> 更新：2026-06-03 | 技术栈：Tauri 2 + Rust + React

---

## 一、总体架构

```
┌──────────────────────────────────────────────┐
│                  Tauri 2                      │
│  ┌─────────────────┐   ┌────────────────────┐│
│  │ 前端 WebView     │   │  Rust Core         ││
│  │ React + Vite    │◄──►│  Tauri Commands    ││
│  │ TailwindCSS     │   │  业务逻辑 / DB       ││
│  │ shadcn/ui       │   │  文档解析 / AI调用  ││
│  │ ECharts         │   │  SQLite (rusqlite)  ││
│  └─────────────────┘   └────────────────────┘│
└──────────────────────────────────────────────┘
```

**无独立进程**：所有后端逻辑作为 Tauri commands 运行在同一进程中，通过 `invoke()` 从前端调用。不启动额外 HTTP 服务器，延迟更低，打包更小。

---

## 二、目录结构

```
deep-explorer/
├── src-tauri/               # Rust 核心
│   ├── src/
│   │   ├── main.rs          # Tauri app 入口，注册所有 commands
│   │   ├── lib.rs
│   │   ├── commands/        # Tauri command handlers（对应前端 invoke 调用）
│   │   │   ├── extract.rs   # AI 提取 Point
│   │   │   ├── points.rs    # Point CRUD
│   │   │   ├── sessions.rs  # 会话管理
│   │   │   ├── projects.rs  # 项目管理
│   │   │   ├── actions.rs   # 深挖动作
│   │   │   ├── search.rs    # 搜索
│   │   │   ├── stats.rs     # 行为统计
│   │   │   └── config.rs    # LLM / 搜索引擎配置
│   │   ├── db/
│   │   │   ├── mod.rs       # 连接池初始化，迁移运行
│   │   │   ├── migrations/  # SQL 迁移文件（按序号命名）
│   │   │   └── queries/     # 复杂查询函数
│   │   ├── parsers/         # 文档解析
│   │   │   ├── mod.rs
│   │   │   ├── pdf.rs       # lopdf
│   │   │   ├── docx.rs      # docx-rs
│   │   │   ├── pptx.rs      # pptx-rs（或 zip+XML 解析）
│   │   │   └── plaintext.rs
│   │   ├── ai/              # LLM 接口
│   │   │   ├── mod.rs       # trait LLMClient
│   │   │   ├── openai.rs    # reqwest 调用 OpenAI API
│   │   │   └── ollama.rs    # reqwest 调用本地 Ollama
│   │   └── search/          # 搜索模块
│   │       ├── internal.rs  # SQLite FTS5
│   │       ├── web.rs       # 联网搜索
│   │       └── academic.rs  # arXiv / PubMed / Crossref 等
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── frontend/                # React + Vite 前端
│   ├── src/
│   │   ├── components/      # shadcn/ui 组件 + 业务组件
│   │   │   ├── ui/          # shadcn/ui 基础组件（自动生成）
│   │   │   ├── PointCard.tsx
│   │   │   ├── PointTree.tsx
│   │   │   └── charts/      # ECharts 图表组件
│   │   ├── pages/           # 页面
│   │   │   ├── Explore.tsx  # 主探索页
│   │   │   ├── Library.tsx  # 总知识库
│   │   │   ├── Projects.tsx # 项目库
│   │   │   └── Settings.tsx # 设置（LLM 配置）
│   │   ├── store/           # Zustand 状态管理
│   │   ├── api/             # Tauri invoke 封装
│   │   │   └── index.ts     # 所有 invoke 调用的类型化封装
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── docs/                    # 项目文档
├── resources/               # 图标、字体等静态资源
└── README.md
```

---

## 三、前后端通信

Tauri 的 `invoke` 机制替代 HTTP：

```typescript
// frontend/src/api/index.ts
import { invoke } from '@tauri-apps/api/core';

export const extractText = (text: string, sessionId: string) =>
  invoke<Point[]>('extract_text', { text, sessionId, mode: 'auto' });
```

```rust
// src-tauri/src/commands/extract.rs
#[tauri::command]
pub async fn extract_text(
    text: String,
    session_id: String,
    mode: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Point>, String> { ... }
```

---

## 四、Rust 依赖（Cargo.toml 关键项）

```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
tokio = { version = "1", features = ["full"] }
rusqlite = { version = "0.31", features = ["bundled", "vtab"] }
reqwest = { version = "0.12", features = ["json", "stream"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
lopdf = "0.34"
docx-rs = "0.4"
uuid = { version = "1", features = ["v4"] }
anyhow = "1"
```

---

## 五、UI 设计原则

- **shadcn/ui** 作为组件基础：Card、Dialog、Command（⌘K 搜索）、Tabs、ScrollArea
- **TailwindCSS** 暗色模式优先（`dark:` 前缀），主色调 neutral + accent
- **动效**：使用 Framer Motion 做 Point 展开/折叠动画
- **字体**：Geist Sans（UI）+ Geist Mono（代码/引用）
- **ECharts** 主题与整体配色保持一致，图表背景透明

---

## 六、关键技术决策记录（ADR）

| 决策 | 选择 | 理由 |
|------|------|------|
| 桌面框架 | Tauri 2（非 Electron） | 包体 ~5MB vs ~150MB；内存 ~40MB vs ~200MB |
| 后端语言 | Rust（非 Python） | 性能、内存安全；AI 调用直接 HTTP 不需要 SDK |
| 进程模型 | 单进程（非 sidecar） | 无 IPC 开销，启动更快，部署更简单 |
| UI 框架 | React + shadcn/ui | 生态成熟，shadcn/ui 组件精致，ECharts 集成好 |
| 文档解析 | Rust crates | 避免引入 Python runtime，减少打包复杂度 |
| 数据库 | SQLite bundled | rusqlite 的 bundled feature 内嵌 SQLite，零依赖 |
