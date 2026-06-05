# PRD — 探索页面重构

## 目标

对 Explore 页面进行全面升级，将文件导入、内容展示、Point 标注整合为一个沉浸式阅读+标注体验。

---

## 功能一：拖拽添加文件

在文件选择区域支持拖拽文件到页面（dragover/drop 事件），效果与点击"选择文件"相同，触发 `parseFile`。

---

## 功能二：扩展文件格式支持

### 后端新增 parsers

在 `src-tauri/src/parsers/` 中新增格式支持，`parsers/mod.rs` 的 `parse_document` dispatch 扩展：

| 格式 | 实现方式 |
|------|---------|
| `.docx` | crate `docx-rs`（已在 Cargo.toml 可选）或 `zip` + XML 解析 |
| `.doc` | 暂不支持（格式过于复杂），返回友好错误提示 |
| `.odt` | `zip` + content.xml 提取文本 |
| `.html` / `.htm` | `scraper` crate 提取正文文本（剥除脚本/样式标签） |
| `.txt` | 已支持 |
| `.md` / `.markdown` | 已支持 |
| `.rst` | `fs::read_to_string`（纯文本即可，RST 语法不影响提取） |
| `.csv` | `fs::read_to_string`（直接读取） |

不支持 PDF，但在错误提示中说明："PDF 支持计划中（将通过 MinerU 转换为 Markdown）"。

`parse_document` 返回统一的 `String`（纯文本或 Markdown），调用方无需区分格式。

### 前端文件过滤器更新

`Explore.tsx` 的 `open()` dialog `filters.extensions` 同步扩展为：
`['txt', 'md', 'markdown', 'docx', 'odt', 'html', 'htm', 'rst', 'csv']`

---

## 功能三：粘贴网页 → 阅读模式渲染

### 触发检测

在 `Explore.tsx` 添加全局 `paste` 事件监听。检测粘贴内容：
- 若 clipboard 含 `text/html` 类型 → 走网页处理路径
- 否则 → 走现有纯文本路径（写入 textarea）

### 网页内容处理（纯前端）

使用 `DOMParser` 解析 HTML：
1. 移除 `<script>`, `<style>`, `<nav>`, `<footer>`, `<aside>`, `<header>` 等噪音标签
2. 保留正文结构：标题（h1-h6）、段落（p）、列表（ul/ol/li）、图片（img，保留 src）、blockquote、code
3. 将处理后的 HTML 存为 `richHtml: string` 状态（用于渲染），同时提取纯文本存入 `text`（用于 AI 提取）

### 渲染模式

网页内容不再用 `<textarea>` 显示，改为 `<div className="prose ...">`，以阅读模式渲染：
- 标题、段落、图片（`<img>` 原始 URL，加载失败不报错）、列表、引用块
- 样式：`max-w-3xl`, 舒适行高，serif/sans 字体跟随 `--font-ui`
- 顶部显示来源 URL（从 HTML `<title>` 或 `<link rel=canonical>` 提取）

---

## 功能四：行内 Point 标注

### 核心交互

提取完成后，Point 不再以卡片列表展示，改为在原文中高亮锚点句子，Point 以小徽标（圆点）悬浮在锚点右上方。

### AI 输出格式变更

`openai.rs` 的提取 prompt 和返回结构扩展：

```json
{
  "points": [
    {
      "content": "Point 核心内容",
      "tagType": "事实陈述 | 作者观点 | 待验证疑问",
      "anchor": "原文中被标注的句子片段（尽量精确，15-80字）"
    }
  ]
}
```

`ExtractedPoint` 类型新增 `anchor?: string`（可选，向后兼容）。

### 前端标注渲染

提取完成后，对 `text`（纯文本）内容按段落渲染（`<p>` 标签），并对每个 Point 的 `anchor` 做字符串匹配：

1. 遍历 Points，找到 `anchor` 在原文中的位置
2. 用 `<mark>` 包裹锚点文字，附加波浪下划线（tag 颜色：事实陈述=蓝、作者观点=紫、疑问=琥珀）
3. `<mark>` 右上角渲染一个圆形徽标（含序号或 tag 色点）
4. `anchor` 匹配失败的 Point 降级为底部卡片列表

### 双模式提取

- **自动**：文件加载/网页粘贴完成后自动触发 `extract()`
- **手动选中**：用户选中页面内的文字后，出现浮动"提取选中内容"按钮，点击后以选中文字作为 `text` 调用 AI 提取，结果标注回原文中对应位置

### 交互：展开 Point

点击徽标或高亮文字 → 弹出 Popover，展示：
- Point 内容（可编辑）
- Tag 类型
- 操作按钮：延伸解释 / 反方观点 / 生成追问 / 查找相似 / 框架解读
- 保存到知识库按钮

操作按钮复用现有 `deepen_point` / `find_similar` Tauri commands，结果在 Popover 内展示子 Points。

### 保存流程

Popover 内"保存到知识库"保存单个 Point。页面顶部保留全局"保存全部"按钮（批量保存所有已提取的 Points）。

---

## 数据结构变更

### Rust

```rust
// ai/openai.rs — ExtractedPoint 新增 anchor
#[derive(Serialize, Deserialize)]
pub struct ExtractedPoint {
    pub content: String,
    pub tag_type: String,
    #[serde(default)]
    pub anchor: Option<String>,
}
```

### TypeScript

```ts
// api/types.ts
export interface ExtractedPoint {
  content: string
  tagType: string
  anchor?: string  // 新增，可选
}
```

### store 新增状态

```ts
// useExploreStore 新增
richHtml: string | null      // 网页粘贴时的处理后 HTML
sourceUrl: string | null     // 网页来源 URL
```

---

## 不在本任务内

- `.doc`（二进制 Word 格式）解析
- PDF 解析（计划通过 MinerU 转 Markdown 实现）
- Point 的永久持久化锚点位置（保存到知识库后 anchor 仅作元数据）
- 多文件同时打开
- 图片内容的 AI 理解（仅展示原始 URL）

---

## 新增 Cargo 依赖（建议）

| crate | 用途 | 预估复杂度 |
|-------|------|-----------|
| `zip` | odt 解析（已通用） | 低 |
| `scraper` | html 解析 | 低 |
| `quick-xml` | docx/odt XML 提取 | 低-中 |
| `docx-rs` 或手写 zip+xml | docx 解析 | 中 |
