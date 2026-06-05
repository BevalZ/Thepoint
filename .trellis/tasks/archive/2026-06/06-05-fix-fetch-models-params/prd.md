# Fix: fetch_models 改用入参而非 Store 读取

## 问题
用户填好 API Key 和 Base URL 后，点「获取可用模型」按钮时报"尚未配置 API Key"。
根因：`fetch_models` Tauri 命令从 Store 读取配置，但用户尚未点「保存」，Store 仍为空。

## 修复范围（最小改动）

### 后端 `src-tauri/src/commands/config.rs`
`fetch_models` 改为接收显式参数，不读 Store：
```rust
pub async fn fetch_models(api_key: String, base_url: String) -> Result<Vec<String>, String>
```
移除 `app: tauri::AppHandle<Wry>` 参数（不需要 Store 访问）。

### 前端 `frontend/src/api/index.ts`
更新 `fetchModels` 包装，传入当前输入值：
```ts
export const fetchModels = (apiKey: string, baseUrl: string) =>
  invoke<string[]>('fetch_models', { apiKey, baseUrl })
```

### 前端 `frontend/src/pages/Settings.tsx`
`handleFetchModels` 调用时传入当前 state：
```ts
const list = await fetchModels(apiKey, baseUrl)
```

## 验收标准
- 用户填好 Key 和 Base URL **不保存**，点「获取可用模型」能成功返回列表。
- `cargo check` 通过，`npx tsc --noEmit` 通过，无 `any`。
