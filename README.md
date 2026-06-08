# Deep Explorer

> 把文本、网页和图片变成可以追问、审查、收藏和再组织的知识块。

Deep Explorer 是一款桌面端 AI 阅读与知识分析软件。它从文档、网页、粘贴文本或图片中抽取信息块，逐块生成分析卡片，支持星标采集、事实审查、评论员解读、框架解读、知识研报和 AI 生图。

本项目为完整自我开发项目，没有借鉴或复刻其他项目的代码、交互或设计实现。

## 功能概览

- **探索页分块解析**：导入文件、网页或粘贴文本后，按主题拆分为信息块，逐块动画生成分析结果。
- **知识库沉淀**：将有价值的观点、事实、疑问、评论和事实审查保存为可展开的树状知识块。
- **事实审查**：对事实陈述调用搜索模型核查，并保存为独立子块，保留来源链接和解析块原文。
- **评论员系统**：可让 LLM 根据文本内容选择合适的预设评论员进行评论。
- **框架解读**：支持内置和自定义思维框架，对知识块进行结构化解读。
- **星标采集与研报**：收集多个 star 后生成知识研报，并记录引用来源。
- **AI 生图**：支持艺术性生图与知识性生图两种模式，可为图片模型单独配置 API。
- **本地优先**：配置和数据保存在本地；API Key 不上传到第三方服务器。

## 截图

项目仍在快速迭代中，建议以 Release 中的实际应用界面为准。

## 下载

前往 GitHub Releases 下载对应平台安装包：

- Windows: `.msi` / `.exe`
- macOS: `.dmg`
- Linux: `.deb` / `.AppImage` / `.rpm`

Release 会由 GitHub Actions 自动构建并发布。

## 使用方式

1. 打开软件，进入设置。
2. 配置聊天模型 API。
3. 如需事实审查，配置搜索模型 API。
4. 如需 AI 生图，配置图片模型 API。
5. 回到探索页，导入文件、网页或粘贴文本。
6. 等待分块解析完成，按需 star、事实审查、框架解读或生成研报。

## 开发

### 环境要求

- Node.js 20+
- Rust stable
- Tauri 2 依赖环境

Linux 还需要 WebKit / GTK 相关系统依赖，详见 Tauri 官方文档。

### 安装依赖

```bash
cd frontend
npm ci
```

### 前端构建

```bash
cd frontend
npm run build
```

### 运行 Tauri 开发环境

```bash
cargo tauri dev
```

### 打包

```bash
cargo tauri build
```

## GitHub Actions 发布

推送 tag 即可触发多平台打包和 Release 发布：

```bash
git tag v0.1.0
git push origin v0.1.0
```

也可以在 GitHub Actions 页面手动运行 `Build and Release` workflow，并填写 release tag。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 前端 | React 18, Vite, TailwindCSS |
| 动效 | Framer Motion |
| 后端 | Rust, Tauri commands |
| 数据库 | SQLite, rusqlite, FTS5 |
| 文档/网页解析 | Rust parser stack, scraper |
| 图表 | ECharts |
| AI 接入 | OpenAI-compatible HTTP APIs |

## 目录

```text
frontend/      React 前端
src-tauri/     Tauri / Rust 后端与打包配置
docs/          设计、架构和接口文档
Skills/        人物 Skill 原始资料
```

## 文档

- [产品说明](docs/product-spec.md)
- [架构设计](docs/architecture.md)
- [数据库结构](docs/database-schema.md)
- [接口说明](docs/api-spec.md)
- [开发环境](docs/dev-setup.md)
- [贡献说明](docs/contributing.md)

## 鸣谢

感谢所有已经支持、测试和反馈这个项目的人。

感谢 Unity2 中转站的资助支持：https://unity2.ai/

感谢山姆·奥特曼的慷慨。

## License

本项目不使用 MIT License。

Deep Explorer 使用自定义的 **Non-Commercial Source License**：

- 个人使用不受限制。
- 允许学习、研究、非商业修改和二次开发。
- 允许非商业分发修改版本，但必须明确标注源代码来源和原项目地址。
- 禁止任何商业用途，包括但不限于售卖、商业 SaaS、企业内部商业部署、商业集成、付费分发或作为商业产品的一部分。
- 如需商业授权，请联系项目作者。

完整条款见 [LICENSE](LICENSE)。
