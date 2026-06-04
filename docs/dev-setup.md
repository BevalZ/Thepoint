# 开发环境搭建 —— Deep Explorer

> 更新：2026-06-03 | Tauri 2 + Rust + React

---

## 前置要求

| 工具 | 版本 | 安装 |
|------|------|------|
| Rust | stable (≥1.77) | `rustup` |
| Node.js | ≥18 | 官网或 nvm |
| Tauri CLI | 2.x | `cargo install tauri-cli` |
| 系统依赖 | — | 见下 |

### Windows 系统依赖
```powershell
# 需要 Microsoft C++ Build Tools 和 WebView2（Win11 已内置）
winget install Microsoft.VisualStudio.2022.BuildTools
```

### macOS 系统依赖
```bash
xcode-select --install
```

---

## 克隆与初始化

```bash
git clone https://github.com/<your-org>/deep-explorer.git
cd deep-explorer

# 安装前端依赖
cd frontend && npm install && cd ..
```

---

## 开发模式

```bash
# 同时启动前端 Vite dev server + Tauri 窗口（热重载）
cargo tauri dev
```

---

## 数据库初始化

首次启动时 Tauri 自动运行迁移（`src-tauri/src/db/migrations/`），无需手动操作。

开发数据库默认路径：
- Windows: `%APPDATA%\deep-explorer\data.db`
- macOS: `~/Library/Application Support/deep-explorer/data.db`

---

## 前端独立开发

```bash
cd frontend
# 使用 mock invoke（不需要启动 Tauri）
npm run dev
```

在 `frontend/src/api/mock.ts` 中维护 mock 数据，通过 `VITE_MOCK=true` 环境变量切换。

---

## 添加 shadcn/ui 组件

```bash
cd frontend
npx shadcn@latest add button card dialog command scroll-area tabs
```

---

## 生产构建

```bash
cargo tauri build
# 输出：src-tauri/target/release/bundle/
# Windows: .msi / .exe
# macOS: .dmg / .app
```

---

## 运行测试

```bash
# Rust 单元测试
cargo test

# 前端测试
cd frontend && npm test
```
