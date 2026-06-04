# PRD — Step 2: 设置页 + API Key 存储

## Goal
用户能在设置页输入 OpenAI API Key 和模型名，安全持久化存储，重启后保留。这是后续 AI 提取功能的前置依赖。

## Requirements
- 设置页（Settings）：API Key 输入框（password 类型，可切换显示）、模型选择（默认 gpt-4o-mini）、保存按钮
- API Key 通过 `tauri-plugin-store` 存储（不写入 SQLite，符合 backend/database-guidelines）
- 两个 Tauri command：`get_config` 读取、`set_config` 写入
- 前端通过 `api/index.ts` 封装 invoke 调用
- UI：暗色 Linear 风格基础（TailwindCSS + cn 工具 + @/ 别名）
- 应用启动时进入设置页或主页可切换（最小导航）

## Acceptance Criteria
- [ ] 输入 Key + 模型，点保存，重启应用后值还在
- [ ] Key 输入框默认隐藏字符，可点击眼睛图标切换
- [ ] 未配置 Key 时有明显提示
- [ ] cargo check 通过，前端 tsc 通过

## Out of Scope
- Ollama 检测（第二阶段）
- API Key 有效性验证（联网测试）——仅存储
- 多 provider 切换

## Technical Notes
- Store 文件名：`config.json`，key: `openai_api_key`, `openai_model`
- Settings 页路由：MVP 用简单的 useState 切换 Explore/Settings，不引入 react-router
- 配置类型定义在 api/types.ts
