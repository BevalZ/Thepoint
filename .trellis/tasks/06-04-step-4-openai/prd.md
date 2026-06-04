# PRD — Step 4: OpenAI 观点提取

## Goal
把文档文本通过 OpenAI API 提取成段落级 Point 列表，每个 Point 带核心内容和类型标签。这是 MVP 核心功能。

## Requirements
- `ai/mod.rs`：定义提取相关类型 + 模块导出
- `ai/openai.rs`：reqwest 调用 OpenAI chat completions API，使用 store 里的 api_key + model
- 提取 prompt：指示模型把文本拆成段落级要点，返回 JSON 数组，每项含 content + tagType
- tagType 取值：事实陈述 / 作者观点 / 待验证疑问
- `commands/extract.rs` 新增 `extract_text(text, sessionId?) -> Result<Vec<ExtractedPoint>, String>`
- 类型：ExtractedPoint { content, tagType }（MVP 阶段不含 id/parent，提取结果是临时的）
- 前端 types.ts 加对应类型，api/index.ts 加封装

## Acceptance Criteria
- [ ] 给定一段文本 + 已配置的 Key，返回若干 Point（每个有 content 和 tagType）
- [ ] API Key 未配置时返回明确错误
- [ ] OpenAI 返回非预期格式时不 panic，返回错误
- [ ] cargo check 通过，tsc 通过

## Out of Scope
- 半自动模式（偏好标签加权）——MVP 先全自动
- 多层级 / parent_id（提取结果是扁平列表）
- 持久化到 SQLite（Step 6）
- 源文档页码溯源
- 流式输出

## Technical Notes
- OpenAI endpoint: https://api.openai.com/v1/chat/completions
- 用 response_format json_object 或在 prompt 里要求返回 JSON，解析时容错
- reqwest 已在 Cargo.toml（json feature）
- prompt 用中文，要求模型用文档原语言提取
- api_key 从 tauri-plugin-store 读取（与 config.rs 同 store）
