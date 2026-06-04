# Deep Explorer —— 深度探索助手

> 从文档到洞见，让每一次探索都有迹可循

一款**纯本地、隐私优先**的桌面应用。上传文档 → AI 自动提炼观点（Point）→ 无限深挖 → 知识库沉淀 → 量化你的思考模式。

## 技术栈

| 层级 | 选型 |
|------|------|
| 桌面框架 | Tauri 2 (Rust) |
| 前端 | React 18 + Vite + TailwindCSS + shadcn/ui |
| 后端逻辑 | Rust (Tauri commands) |
| 文档解析 | lopdf, docx-rs, pptx-rs |
| AI 接口 | reqwest + OpenAI HTTP API / Ollama |
| 数据库 | SQLite (rusqlite + FTS5) |
| 图表 | ECharts (echarts-for-react) |
| 打包体积 | ~5–10 MB |

## 快速开始

```bash
# 安装依赖
cd frontend && npm install

# 开发模式（同时启动前端 + Tauri）
cargo tauri dev

# 生产构建
cargo tauri build
```

详见 [docs/dev-setup.md](docs/dev-setup.md)

## 文档索引

| 文档 | 说明 |
|------|------|
| [docs/product-spec.md](docs/product-spec.md) | 产品需求说明 |
| [docs/architecture.md](docs/architecture.md) | 技术架构设计 |
| [docs/database-schema.md](docs/database-schema.md) | 数据库表结构 |
| [docs/api-spec.md](docs/api-spec.md) | Tauri Command 接口文档 |
| [docs/dev-setup.md](docs/dev-setup.md) | 开发环境搭建 |
| [docs/contributing.md](docs/contributing.md) | 贡献指南 |

## 开源协议

MIT
