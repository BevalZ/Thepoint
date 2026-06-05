# PRD — 搜索模型配置与集成

## 目标

在 AI 配置中新增"搜索模型"独立配置项，当深挖动作（explain/counter/followup/framework）需要联网信息时，自动调用搜索模型获取结果并注入 LLM prompt。

## 功能范围

### 设置页 — 新增"搜索模型"子标签

在 `Settings.tsx` 的 AI 配置 tab 下，新增第四个子标签 `search`（搜索模型），与现有 `chat`/`image`/`advanced` 并列。

配置字段（与 chat 模型字段对称）：
- 服务商选择（复用 PROVIDERS 列表）
- Base URL / 完整 endpoint
- API Key
- 模型名（支持手动输入 + 获取列表）
- **启用搜索** 开关（toggle）— 关闭时搜索功能完全禁用

### 后端 — 新增搜索模型配置存储

在 `commands/config.rs` 中扩展：
- `AppConfig` 新增字段：`search_enabled: bool`、`search_api_key`、`search_model`、`search_base_url`、`search_provider_key`、`search_custom_endpoint`
- `STORE_FILE` 新增对应 key 常量
- `get_config` / `set_config` 同步读写新字段

### 后端 — 搜索触发逻辑

在 `commands/explore.rs` 的 `deepen_point` 中：
1. 读取 config，若 `search_enabled` 为 true
2. 先用搜索模型发起一次搜索请求（OpenAI-compatible `/v1/chat/completions`，system prompt 要求返回相关信息摘要）
3. 将搜索结果作为额外上下文拼入主 LLM 的 prompt

搜索请求 prompt 模板（示意）：
```
请针对以下观点，检索并返回最新的相关信息摘要（200字以内）：
{point_content}
```

## 数据结构变更

`AppConfig`（Rust + TS types.ts 同步更新）新增字段：
```rust
pub search_enabled: bool,
pub search_api_key: String,
pub search_model: String,
pub search_base_url: String,
pub search_provider_key: String,
pub search_custom_endpoint: String,
```

## 不在本任务内

- 搜索结果的独立展示 UI（结果直接注入 prompt，不单独渲染）
- 搜索历史记录
- 非深挖场景（提取阶段）触发搜索
