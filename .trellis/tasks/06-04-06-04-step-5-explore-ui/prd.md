# Step 5: 探索页 UI（上传 + 提取 + 卡片）

## 目标
把已有后端能力（`parse_document` / `extract_text`）接到界面上，第一次端到端跑通：
**选文件 / 粘贴文本 → 解析 → OpenAI 提取 → Point 卡片列表展示。**

## 背景
- Step 3 已实现 `parse_document`（PDF/txt/md → 纯文本）。
- Step 4 已实现 `extract_text`（文本 → `ExtractedPoint[]`，含 content + tagType）。
- 前端 `api/index.ts` 已有 `parseDocument` / `extractText` 包装。
- `App.tsx` 探索页目前是 “探索页 — 即将开发” 占位。

## 前置依赖（关键）
前端 `@tauri-apps/plugin-dialog` 已在 package.json，但 **Rust 端未集成**：
1. `src-tauri/Cargo.toml`：加 `tauri-plugin-dialog = "2"`。
2. `src-tauri/src/lib.rs`：`.plugin(tauri_plugin_dialog::init())`。
3. `src-tauri/capabilities/default.json`：permissions 加 `"dialog:default"`。

## 功能需求
### 1. 输入区
- “选择文件” 按钮：用 `@tauri-apps/plugin-dialog` 的 `open()` 选 PDF/txt/md（filters 限定扩展名，multiple: false）。
- 选中后调 `parseDocument(path)` 得到文本，填入文本框；显示文件名。
- 文本框（textarea）：也可直接粘贴/编辑文本。
- “提取观点” 按钮：调 `extractText(text)`。文本为空时禁用。

### 2. 状态与反馈
- 解析中 / 提取中：按钮 loading 态 + 禁用，避免重复点击。
- 错误：捕获 invoke 抛出的 string 错误，红色提示条展示（如未配置 Key、解析失败、OpenAI 失败）。
- 未配置 API Key：可在提取前给出友好提示，引导去设置页（非强制）。

### 3. Point 卡片列表
- 提取成功后展示卡片列表，每张卡片：
  - content（主体文本）
  - tagType 标签（事实陈述 / 作者观点 / 待验证疑问）——不同颜色区分。
- 空态：未提取时显示引导文案。
- 进入/列表动画用 framer-motion（项目已用）。

## 状态管理
- 新建 `useExploreStore`（zustand）或在组件内 useState 均可。倾向放 store：`text` / `points` / `loading` / `error` / `sourceName`，便于后续 Step 6 持久化复用。

## 文件改动
- 新增 `frontend/src/pages/Explore.tsx`
- 新增 `frontend/src/store/explore.ts`（zustand，可选）
- 改 `frontend/src/App.tsx`：探索页渲染 `<Explore />`
- 改 `src-tauri/Cargo.toml` / `lib.rs` / `capabilities/default.json`（dialog 插件）
- 可能新增 `frontend/src/api/index.ts` 中无新增（已有 parseDocument/extractText）

## 验收标准
- `cargo check` 通过（含 dialog 插件）。
- `npx tsc --noEmit` 通过，无 `any`。
- 运行 app：能选 PDF/txt/md 文件 → 文本出现 → 点提取 → 看到 Point 卡片。
- 未配置 Key 时点提取 → 看到清晰错误提示，不崩溃。
- 所有 invoke 经 `api/index.ts`；shadcn/暗色风格一致；用 `cn()` 合并 class。

## 非目标（本步不做）
- 不写 SQLite（Step 6）。
- 不做 Point 编辑/删除、深挖动作、知识库列表。
