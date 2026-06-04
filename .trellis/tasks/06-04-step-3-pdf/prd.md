# PRD — Step 3: 文档解析（PDF + 纯文本/Markdown）

## Goal
把上传的文档转成纯文本，供后续 AI 提取。MVP 支持 PDF、TXT、Markdown 三种格式。

## Requirements
- `parsers/plaintext.rs`：读取 .txt / .md 文件内容
- `parsers/pdf.rs`：用 lopdf 提取 PDF 文本
- `parsers/mod.rs`：按文件扩展名分发到对应解析器；返回 `anyhow::Result<String>`
- Tauri command `parse_document(file_path: String) -> Result<String, String>`
- 单元测试：plaintext 解析、扩展名分发、不支持格式报错

## Acceptance Criteria
- [ ] 传入 .txt → 返回文件文本
- [ ] 传入 .md → 返回文件文本
- [ ] 传入 .pdf → 返回提取的文本
- [ ] 不支持的扩展名（如 .docx）→ 返回明确错误信息
- [ ] cargo test 通过，cargo check 通过

## Out of Scope
- Word/PPT（第二阶段）
- OCR / 扫描版 PDF
- 页码/段落级溯源定位（MVP 先返回整篇文本，Point 溯源在后续迭代）
- 文件选择对话框 UI（Step 5 做）

## Technical Notes
- lopdf 0.34：遍历 pages，extract_text
- 解析器返回纯 String，结构化由 extract.rs 负责（遵循 directory-structure spec）
- 测试用 in-repo fixture 或临时文件
