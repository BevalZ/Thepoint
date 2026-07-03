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
│   │   ├── store/           # Zustand 状态管理（按领域拆分）
│   │   │   ├── exploreStore.ts
│   │   │   ├── libraryStore.ts
│   │   │   ├── galleryStore.ts
│   │   │   ├── configStore.ts
│   │   │   ├── themeStore.ts
│   │   │   └── index.ts     # barrel exports
│   │   ├── api/             # Tauri invoke 契约层
│   │   │   ├── commandMap.ts # 命令名/入参/返回值契约
│   │   │   ├── invoke.ts     # 唯一 invoke 入口
│   │   │   └── index.ts      # 业务 API 封装
│   │   └── main.tsx
│   ├── index.html
│   ├── scripts/             # 前端工程约束脚本
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
// frontend/src/api/invoke.ts
import { invoke } from '@tauri-apps/api/core'

export function invokeCommand<T extends TauriCommandName>(
  command: T,
  ...args: TauriCommandArgs<T> extends undefined ? [] | [undefined] : [TauriCommandArgs<T>]
) {
  const payload = args[0]
  return payload === undefined ? invoke(command) : invoke(command, payload)
}
```

```typescript
// frontend/src/api/index.ts
import { invokeCommand } from './invoke'

export const extractText = (text: string, sessionId: string) =>
  invokeCommand('extract_text', { text, sessionId, mode: 'auto' })
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

这样做的约束是：

- 前端只允许 `frontend/src/api/invoke.ts` 直接触达 `@tauri-apps/api/core`
- 页面、组件、store 统一消费 `api/index.ts`
- 命令名、入参和返回值在 `commandMap.ts` 里集中维护，避免前后端契约散落

---

## 四、前端分层约束

参考大型桌面工作台项目的做法，前端目前采用轻量分层：

- `pages/` 负责页面壳层与布局编排
- `components/` 负责可复用 UI 与交互单元
- `store/` 负责领域状态，不直接暴露 Tauri 细节
- `api/` 负责所有命令调用和类型契约

当前通过 `frontend/scripts/check-frontend-boundary.mjs` 做最小约束检查，防止组件层重新散落 `invoke()` 调用。

---

## 五、Rust 依赖（Cargo.toml 关键项）

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

## 六、UI 设计原则

- **shadcn/ui** 作为组件基础：Card、Dialog、Command（⌘K 搜索）、Tabs、ScrollArea
- **TailwindCSS** 暗色模式优先（`dark:` 前缀），主色调 neutral + accent
- **动效**：使用 Framer Motion 做 Point 展开/折叠动画
- **字体**：Geist Sans（UI）+ Geist Mono（代码/引用）
- **ECharts** 主题与整体配色保持一致，图表背景透明

---

## 七、关键技术决策记录（ADR）

| 决策 | 选择 | 理由 |
|------|------|------|
| 桌面框架 | Tauri 2（非 Electron） | 包体 ~5MB vs ~150MB；内存 ~40MB vs ~200MB |
| 后端语言 | Rust（非 Python） | 性能、内存安全；AI 调用直接 HTTP 不需要 SDK |
| 进程模型 | 单进程（非 sidecar） | 无 IPC 开销，启动更快，部署更简单 |
| UI 框架 | React + shadcn/ui | 生态成熟，shadcn/ui 组件精致，ECharts 集成好 |
| 文档解析 | Rust crates | 避免引入 Python runtime，减少打包复杂度 |
| 数据库 | SQLite bundled | rusqlite 的 bundled feature 内嵌 SQLite，零依赖 |
