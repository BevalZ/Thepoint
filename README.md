# Deep Explorer

<p align="center">
  <strong>深度探索助手 · 本地优先的 AI 阅读、审查与知识沉淀桌面应用</strong>
</p>

<p align="center">
  <em>Your point is great! Now it's mine!</em>
</p>

<p align="center">
  <a href="https://github.com/BevalZ/Thepoint/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/BevalZ/Thepoint?style=social"></a>
  <a href="https://github.com/BevalZ/Thepoint/releases"><img alt="Release" src="https://img.shields.io/github/v/release/BevalZ/Thepoint?include_prereleases"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT%20%2B%20Commons%20Clause-blue"></a>
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-24c8db">
  <img alt="React" src="https://img.shields.io/badge/React-18-61dafb">
  <img alt="Rust" src="https://img.shields.io/badge/Rust-native-b7410e">
  <img alt="Local First" src="https://img.shields.io/badge/Local--First-privacy-2ea043">
  <img alt="AI Native" src="https://img.shields.io/badge/AI--Native-knowledge-8b5cf6">
</p>

> 从文档到洞见，让每一次探索都有迹可循。

Deep Explorer 是一款完整自我开发的桌面端 AI 阅读与知识分析软件。它可以从文本、网页、文件和图片中提取信息块，逐块生成 Point，支持星标采集、事实审查、评论员解读、框架解读、知识研报和 AI 生图。

项目坚持本地优先：配置、历史、知识库、存档和 API Key 均保存在本地，不上传到项目服务器。

---

## ✨ 一眼看懂

| 🔭 探索 | ⭐ 采集 | 🧾 审查 | 🧠 沉淀 |
| --- | --- | --- | --- |
| 文本、网页、图片、文件导入 | 将重要 Point 收集成 star | 搜索模型核查事实陈述 | 本地知识库与研报沉淀 |
| 主题分块、逐块动画解析 | 圆环来源占比与清空机制 | 保存来源链接与解析块原文 | 子块、元信息、存档可追溯 |

---

## 🎬 使用演示



https://github.com/user-attachments/assets/726111cd-10fe-479c-94f3-dc6649ef0d65


如果 GitHub 页面没有自动渲染视频，可以直接打开：[Deep Explorer 使用演示视频](https://pub-333fca0c6c334353ae4185f9accd0547.r2.dev/Video_2026-06-08_175111_with_music.mp4)。

---

## 📸 界面截图

### 🔭 探索页：把材料拆成可追问的知识块

![探索页](好的/1.jpg)

进入软件后，左侧提供探索、知识库、画廊、统计、设置和使用说明等入口。探索页支持拖拽文件、粘贴文本、抓取网页内容，并将材料按主题拆分为信息块逐块解析。右上角可以查看既往解析记录的缩略图，便于在多个材料之间切换和回溯。

### 📚 知识库：保存、展开和继续追问

![知识库](好的/2.jpg)

知识库会沉淀探索过程中保存的 Point、事实审查、Comment、研报摘要和原文片段。每条记录都可以继续扩展、查看来源、展开子块或重新组织，适合把零散阅读结果整理成长期可用的知识资产。

### 🖼️ 画廊：管理 AI 生成图片

![画廊](好的/3.jpg)

画廊保存所有 AI 生成图片，包括艺术性生图和知识性生图。你可以按时间查看生成记录，并回到相关内容继续分析，适合沉淀图像化的论证、概念图和视觉摘要。

### 📊 统计：观察自己的探索习惯

![统计](好的/4.jpg)

统计页用于查看使用痕迹和知识积累情况，帮助理解最近阅读、采集、生成和沉淀的节奏。它不是简单计数，而是为后续复盘和调整阅读策略提供入口。

### ⚙️ 设置：配置模型、外观和知识工具

![设置](好的/5.jpg)

设置页用于配置聊天模型、搜索模型、图片模型、评论员、框架解读、标注颜色和界面外观。Deep Explorer 支持多套模型配置，API Key 保存在本地，便于在不同任务中切换合适的 AI 能力。

---

## 🧭 使用流程

1. 📥 在探索页粘贴文本、拖拽文件，或输入网页链接。
2. 🧩 等待系统按标题、主题和自然段拆分内容，并逐块生成 Point。
3. 🔎 对事实陈述执行事实审查，保存审查结果和来源链接。
4. 🎭 让 LLM 自动选择合适评论员，对关键段落进行评论。
5. ⭐ 将重要 Point 采集到圆环，按来源查看采集构成。
6. 🧾 点击生成研报，将多个 star 汇总成可保存的知识摘要。
7. 📚 在知识库中继续展开、归档、查看原文和复用结果。
8. 🖼️ 按需生成艺术图或知识图，并在画廊中管理。

---

## 💡 为什么做它

传统阅读工具擅长保存材料，但不擅长把材料变成可追问、可审查、可复用的知识结构。Deep Explorer 的目标是把一次阅读拆成连续的探索过程：

1. 📥 导入材料。
2. 🧩 按主题切成信息块。
3. ✨ 逐块生成可验证的 Point。
4. 🔎 对事实陈述做搜索核查。
5. ⭐ 收集 star，生成知识研报。
6. 📚 把结果沉淀到本地知识库。

---

## 🧭 核心能力

| 模块 | 能力 |
| --- | --- |
| 🔭 探索页 | 支持粘贴文本、拖拽文件、网页抓取和图片导入，按主题拆分信息块并逐块动画解析 |
| ✨ Point 生成 | 自动判断信息块价值，短文本不主动生成，允许手动触发 AI 解读 |
| ⭐ Star 采集 | 将重要观点采集到圆环，支持来源占比、清空、生成知识研报 |
| 🔎 事实审查 | 对事实陈述调用搜索模型，结果保存为独立子块，保留解析块原文与来源链接 |
| 🎭 评论员系统 | 由 LLM 根据文本内容选择合适评论员，再一次调用完成评论 |
| 🧠 框架解读 | 支持内置框架和用户自定义框架，用结构化方式重读文本 |
| 🖼️ AI 生图 | 支持艺术性生图与知识性生图，图片模型可单独配置 |
| 📚 知识库 | 支持树状子块、原文查看、元信息保留、存档、重新激活和搜索 |
| 🌌 动效体验 | 启动动画、星空背景、星标飞行动画、卡片堆叠、光效提示和桌面窗口控制 |

---

## 🏗️ 技术架构

```mermaid
flowchart TD
  A[用户输入<br/>文本 / 文件 / 网页 / 图片] --> B[探索页导入层]
  B --> C[解析与清洗<br/>正文抽取 / 噪音过滤 / 元信息识别]
  C --> D[主题分块引擎<br/>标题优先 / 自然段合并 / 价值判断]
  D --> E[逐块解析队列<br/>动画展示 / 中央聚焦 / 生成状态]

  E --> F[聊天模型<br/>Point / 评论员 / 框架解读]
  E --> G[搜索模型<br/>事实审查 / 来源核验]
  E --> H[图片模型<br/>艺术图 / 知识图]

  F --> I[Point 卡片]
  G --> J[事实审查子块]
  H --> K[图库与缩略图]

  I --> L[Star 采集圆环]
  J --> M[本地知识库]
  K --> M
  L --> N[知识研报生成]
  N --> M

  M --> O[(SQLite + FTS5)]
  P[设置中心<br/>模型配置 / 外观 / 评论员 / 框架] --> F
  P --> G
  P --> H
```

---

## ⚙️ 技术栈

| 层级 | 选型 |
| --- | --- |
| 🖥️ 桌面框架 | Tauri 2 + Rust |
| ⚛️ 前端 | React 18 + Vite + TailwindCSS |
| 🎞️ UI 与动效 | shadcn/ui 风格组件 + Framer Motion |
| 🦀 后端逻辑 | Rust Tauri commands |
| 🗃️ 数据库 | SQLite + rusqlite + FTS5 |
| 📄 文档解析 | lopdf, docx-rs, pptx-rs 等解析链路 |
| 🌐 网页解析 | HTML 源码正文抽取、噪音清洗、LLM 辅助裁剪 |
| 📊 图表 | ECharts |
| 🤖 AI 接口 | OpenAI-compatible HTTP API / Ollama 兼容接口 |
| 🚀 打包 | Tauri CLI 跨平台打包 |

---

## 🚀 快速开始

### 🧰 环境要求

- Node.js 20+
- Rust stable
- Tauri 2 桌面依赖

Linux 需要额外安装 WebKit / GTK / AppIndicator / librsvg 等 Tauri 依赖。

### 📦 安装依赖

```bash
cd frontend
npm ci
```

### 🧪 开发运行

```bash
cargo tauri dev
```

### 🧱 前端构建

```bash
cd frontend
npm run build
```

### 📦 桌面打包

```bash
cargo tauri build
```

---

## 🤖 模型配置

首次启动后请进入设置：

1. 💬 配置聊天模型，用于 Point、评论员、框架解读和研报生成。
2. 🔎 配置搜索模型，用于事实审查。
3. 🖼️ 配置图片模型，用于艺术性生图和知识性生图。
4. 🎛️ 按需添加评论员、框架和外观主题。

所有 API Key 均保存在本地。

---

## 📥 下载

<p align="center">
  <a href="https://github.com/BevalZ/Thepoint/releases/latest">
    <img alt="Latest Release" src="https://img.shields.io/github/v/release/BevalZ/Thepoint?label=Latest%20Release&style=for-the-badge">
  </a>
</p>

前往 [Latest Release](https://github.com/BevalZ/Thepoint/releases/latest) 下载对应平台安装包：

- 🪟 Windows: `.msi` / `.exe`
- 🍎 macOS: Apple Silicon / Intel
- 🐧 Linux: `.deb` / `.AppImage` / `.rpm`

---

## 🌟 Star History

<a href="https://star-history.com/#BevalZ/Thepoint&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=BevalZ/Thepoint&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=BevalZ/Thepoint&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=BevalZ/Thepoint&type=Date" />
  </picture>
</a>

---

## 🗂️ 项目结构

```text
frontend/      React 前端与交互动画
src-tauri/     Tauri / Rust 后端、权限和打包配置
docs/          产品、架构、接口和开发文档
Skills/        蒸馏人格 Skill 原始资料
```

## 📖 文档

- 📌 [产品说明](docs/product-spec.md)
- 🏗️ [架构设计](docs/architecture.md)
- 🗃️ [数据库结构](docs/database-schema.md)
- 🔌 [接口说明](docs/api-spec.md)
- 🧭 [参考 Foliole 的功能优化路线图](docs/foliole-functional-roadmap.md)
- 🧰 [开发环境](docs/dev-setup.md)
- 🤝 [贡献说明](docs/contributing.md)

---

## 🙏 鸣谢

感谢所有已经支持、测试和反馈这个项目的人。

感谢 [Unity2 中转站](https://unity2.ai/) 的资助支持。

<p>
  <a href="https://linux.do">
    <img src="https://cdn3.ldstatic.com/original/4X/d/6/5/d65def8cc0c413f318bee2bcd1c774bc4ad109a8.png" alt="linux.do" width="28" align="absmiddle">
  </a>
  感谢 <a href="https://linux.do">linux.do</a> 社区的讨论、反馈与支持。
</p>

特别感谢 linux.do 几位佬提供 token 支持：@Member、@picpi、@Rawchat。

感谢山姆·奥特曼的慷慨。

---

## 📜 License

Deep Explorer 使用 **MIT License + Commons Clause**。

你可以自由地学习、使用、修改和二次开发本项目代码，但不得在未获得授权的情况下销售本软件、托管商业服务、出售修改版本，或将本项目作为商业产品的一部分进行商业化。

完整条款见 [LICENSE](LICENSE)。
