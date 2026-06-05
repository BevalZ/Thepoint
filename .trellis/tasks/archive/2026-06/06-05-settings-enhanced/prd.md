# 设置页增强：模型下拉修复 + 生图模型 + 多配置管理

## 问题与目标
1. **模型下拉 UI 修复**：获取到 5 个模型后，下拉建议面板没有正确展开显示全部选项。改用原生 `<select>` 或更可靠的下拉实现。
2. **生图模型配置**：新增独立的图片生成模型字段（为后续 Step 生图功能预留接口）。
3. **多套配置管理**：支持保存多套配置（名称 + baseUrl + apiKey + model），可下拉切换、删除。

---

## 技术设计

### 数据结构
新增 `ConfigProfile`（仅前端 + store，不改 Rust 命令，用 tauri-plugin-store 的一个新 key 存数组）：
```ts
interface ConfigProfile {
  id: string        // uuid（前端生成）
  name: string      // 用户起的名字，如 "Gemini 中转" / "DeepSeek"
  baseUrl: string
  apiKey: string
  model: string
  imageBaseUrl?: string
  imageApiKey?: string
  imageModel?: string
}
```

存储方案：新增 Rust 命令 `get_profiles() -> Vec<ConfigProfile>` 和 `set_profiles(profiles) -> ()`，用 store key `config_profiles`。

### 当前配置（AppConfig）改动
`AppConfig` 加三个可选图片字段：
```rust
pub image_base_url: String,
pub image_api_key: String,
pub image_model: String,
```
serde camelCase。对应 store key：`image_base_url`、`image_api_key`、`image_model`。

### 前端设置页改动

**模型下拉**：改用原生 `<select>`（当 models.length > 0 时），同时保留文本输入框（手动输入）。两者联动：select 选中后同步到 input，input 修改后 select 置为空/"自定义"。

**生图模型区块**（折叠/展开，默认折叠）：
- Image Base URL（placeholder：同聊天模型，留空则复用）
- Image API Key（password，留空则复用聊天 Key）
- Image Model（文本输入，如 `gpt-image-1`、`imagen-3`）

**多配置管理区块**：
- 顶部下拉：列出所有已保存的 profile 名称，选中后自动填充下方所有字段。
- 「保存为新配置」按钮：弹出 prompt 输入名称 → 生成 profile → 追加到列表。
- 每个 profile 旁有删除按钮（×）。
- 切换 profile 后不自动覆盖当前工作区，需手动「保存」才写入 AppConfig（当前生效配置）。

---

## 后端改动
- `commands/config.rs`：
  - `AppConfig` 加 `image_base_url`、`image_api_key`、`image_model`（camelCase serde，store key image_xxx）。
  - 新增 `get_profiles(app) -> Result<Vec<ConfigProfile>, String>`：读 store key `config_profiles`，JSON 数组。
  - 新增 `set_profiles(app, profiles: Vec<ConfigProfile>) -> Result<(), String>`：写 store key `config_profiles`。
  - `ConfigProfile` 结构（Serialize + Deserialize + Clone，camelCase）。
- `lib.rs`：注册 `get_profiles`、`set_profiles`。

## 前端改动
- `api/types.ts`：AppConfig 加三个 image 字段；新增 `ConfigProfile` 接口。
- `api/index.ts`：新增 `getProfiles()`、`setProfiles(profiles)` 包装。
- `store/index.ts`：`useConfigStore` 加 profiles 管理（profiles / loadProfiles / saveProfiles）。
- `pages/Settings.tsx`：重构，加上述三块 UI。

## 验收标准
- 获取到模型后，下拉展示全部模型，可选择。
- 生图模型字段存在于设置页，保存写入 AppConfig。
- 可保存多套配置，切换后字段自动填充，可删除。
- `cargo check` ✅，`npx tsc --noEmit` ✅，无 `any`。
