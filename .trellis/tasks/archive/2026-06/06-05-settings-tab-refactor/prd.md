# 设置页 Tab 重构：服务商优化 + JSON 配置编辑器

## 目标
把设置页改为 Tab 布局，重构服务商选项，新增 JSON 配置编辑面板。

## Tab 结构
三个 Tab 标签（lucide 图标）：
1. **聊天模型** — 现有的服务商 / Base URL / API Key / 模型字段
2. **图片生成** — 独立的 imageBaseUrl / imageApiKey / imageModel 字段（从折叠区块升格）
3. **高级配置** — JSON 编辑器

---

## Tab 1：聊天模型 — 服务商重构

### 服务商按钮列表（新顺序和名称）
| key | 显示名 | baseUrl | 路径后缀 |
|-----|--------|---------|---------|
| openai-compat | OpenAI compatible | https://api.openai.com | /v1/chat/completions |
| anthropic-compat | Anthropic compatible | https://api.anthropic.com | /v1/messages |
| deepseek | DeepSeek | https://api.deepseek.com | /v1/chat/completions |
| grok | Grok | https://api.x.ai | /v1/chat/completions |
| qwen | Qwen | https://dashscope.aliyuncs.com/compatible-mode | /v1/chat/completions |
| gemini | Gemini | https://generativelanguage.googleapis.com/v1beta/openai | /v1/chat/completions |
| kimi | Kimi | https://api.moonshot.cn | /v1/chat/completions |
| custom | 自定义 | （用户输入） | （用户输入） |

### 自定义供应商
选中 `custom` 时，展示两个输入框：
- **供应商名称**（可选，用于 profile 展示，如 "MyProxy"）
- **完整请求地址**（必填，如 `https://x666.me/v1/chat/completions`，即直接是最终 endpoint，不做 base+suffix 拼接）

选中预设服务商时，Base URL 字段照常显示（只读或可编辑），提示"会自动补全 {suffix}"。

### AppConfig 新增字段
- `providerKey: String` — 当前选中的服务商 key（存 store）
- `customEndpoint: String` — 自定义时的完整地址（存 store）
- `customProviderName: String` — 自定义供应商名称（存 store）

后端：`completions_endpoint(base_url, provider_key, custom_endpoint)` 逻辑：
- 若 provider_key == "custom"：直接用 custom_endpoint
- 否则按 provider 的 suffix 拼接

---

## Tab 3：高级配置 — JSON 编辑器

### 功能
- 一个 `<textarea>`（等宽字体，暗色），默认显示当前 AppConfig 的 JSON（美化 pretty-print）
- 包含 `extraHeaders: {}` 字段（额外请求头，后端在 AI 调用时注入）
- 「格式化」按钮：`JSON.parse` + `JSON.stringify(_, null, 2)` 重新美化
- 「保存配置」按钮：parse → 提取已知字段 + extraHeaders → 写入 store
- 解析错误时红色提示，不写入
- 只读查看模式（默认）+ 编辑模式切换（一个 toggle 按钮）

### AppConfig 新增字段
- `extraHeaders: String` — JSON 字符串（如 `{"X-Custom": "value"}`），存 store key `extra_headers`

### 后端 AI 调用时注入请求头
`openai.rs` 和 `explore.rs` 的 `reqwest::Client` 调用时，从 AppConfig 解析 extra_headers 并 `.header(k, v)` 注入。改动点：
- AI 函数签名加 `extra_headers: &str` 参数（JSON 字符串）
- 解析失败则跳过（不报错）

---

## 前端结构
- `pages/Settings.tsx` 用 Tab 组件（自建 or CSS class toggle），3 个 tab
- Tab 切换状态用 `useState`
- 无需引入新依赖，只用 lucide + tailwind

---

## 验收标准
- 三个 Tab 可切换
- 自定义服务商：选中后显示「供应商名称」+「完整请求地址」两个输入框
- 预设服务商：选中后 baseUrl 自动填充，提示路径后缀
- JSON 编辑器：默认显示当前配置 JSON，可编辑保存，格式化按钮有效
- `cargo check` ✅，`npx tsc --noEmit` ✅，无 any
