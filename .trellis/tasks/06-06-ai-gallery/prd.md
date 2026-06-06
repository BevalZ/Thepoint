# PRD: AI 图片生成 + 画廊

## 背景

用户采集 ≥10 个 starred points 后，可触发 AI 图片生成，将个人知识视觉化呈现。
生成记录本地持久化，通过新增"AI 画廊"页面管理浏览。

---

## 核心决策（已确认）

| 问题 | 决策 |
|------|------|
| 图像 API | 支持 OpenAI compatible + Gemini Imagen（nanobananai），独立配置 |
| Prompt 构造 | 先过聊天 LLM 提炼 → 再调图像 API |
| 行为路径数据 | 本次不实现，作为后续独立任务 |
| 本地存储路径 | `{app_data_dir}/gallery/`，文件名 `{timestamp}_{uuid}.png` |
| 缩略图 | 300×169px（16:9），存为 `{uuid}_thumb.webp` |
| 重复生成 | 允许，每次独立记录，不覆盖旧图 |
| 画廊聚合阈值 | 日数 > 7 → 月视图；月数 > 12 → 年视图 |

---

## 1. 图像生成 API 配置

### Settings 面板 image 子 tab 新增

Provider 下拉：
- `openai-compatible`：端点自动补全 `/v1/images/generations`
- `gemini-image`：端点自动补全 `/v1beta/models/{model}:generateContent?key={api_key}`

AppConfig 新增字段（已有 imageBaseUrl/imageApiKey/imageModel，新增）：
```typescript
imageProviderKey: string  // 'openai-compatible' | 'gemini-image'
```

Profiles 已支持保存/加载/编辑 image 配置字段，无需改动。

### Gemini Imagen 请求格式

```
POST {base_url}/v1beta/models/{model}:generateContent?key={api_key}
Body:
{
  "contents": [{"parts": [{"text": "{prompt}"}]}],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": { "aspectRatio": "16:9" }
  }
}
```

### OpenAI compatible 请求格式

```
POST {base_url}/v1/images/generations
Body: { "model": "{model}", "prompt": "{prompt}", "n": 1, "size": "1792x1024" }
```

---

## 2. 数据库

### gallery 表

```sql
CREATE TABLE IF NOT EXISTS gallery (
    id              TEXT PRIMARY KEY,
    file_path       TEXT NOT NULL,
    thumbnail_path  TEXT NOT NULL,
    prompt          TEXT NOT NULL,
    generated_at    TEXT NOT NULL,
    download_status TEXT NOT NULL DEFAULT 'ok',  -- 'ok' | 'failed'
    point_ids       TEXT NOT NULL DEFAULT '[]'   -- JSON array of starred point ids
);
```

---

## 3. 新 Tauri Commands

- `generate_image() -> Result<GalleryItem>` — 读取所有 starred points，过 LLM 生成 prompt，调图像 API，保存文件 + 缩略图，写入 DB
- `list_gallery() -> Result<Vec<GalleryItem>>` — 按 generated_at 倒序
- `delete_gallery_item(id: String) -> Result<()>` — 删除 DB 记录 + 本地文件 + 缩略图
- `retry_download(id: String) -> Result<GalleryItem>` — 重新下载失败的图片

### GalleryItem 类型

```rust
pub struct GalleryItem {
    pub id: String,
    pub file_path: String,
    pub thumbnail_path: String,
    pub prompt: String,
    pub generated_at: String,
    pub download_status: String,
    pub point_ids: Vec<String>,
}
```

### 生成流程（Rust 侧）

1. `list_starred_points()` 获取所有 starred points
2. 用聊天 LLM（现有 openai.rs）生成图像 prompt（system: "你是图像描述专家，将以下知识点融合为一段适合AI绘图的中文描述，风格：数字水彩，构图感强，100字以内"）
3. 根据 `image_provider_key` 路由到对应图像 API
4. 返回 base64 图片数据 → 保存为 PNG → 生成缩略图 webp
5. 写入 gallery 表

---

## 4. 探索页生成入口

位置：探索页右下角圆环（见 06-06-star-collect-ring），点击后触发。

状态机：
- `idle`：按钮可点击（starred ≥ 10）/ 置灰（< 10，tooltip "至少采集 10 个 point"）
- `generating`：进度动画（旋转圆环 + "AI 正在作画…"）
- `done`：展示结果图片，提供下载/删除/查看画廊

---

## 5. AI 画廊页面

### 导航

底部 Tab 栏新增第 4 个 tab，位于"知识库"与"统计"之间：
- 图标：`ImageIcon`（lucide-react）
- 名称："画廊"

### 聚合逻辑

```
日数 ≤ 7：日视图（按日期分组，每组堆叠卡片）
日数 > 7 且月数 ≤ 12：月视图（月卡片，点击展开日堆叠）
月数 > 12：年视图（年卡片，逐级钻取）
```

手动切换：页面顶部分段器 `年 | 月 | 日`

### 堆叠卡片

- 每日最多露出 3 张缩略图边缘（偏移 8px）
- 点击 → 横向滑动展开当日所有图片（Sheet/弹窗）
- 单图全屏：点击进入，支持 pinch-to-zoom，再次点击关闭

### 删除操作

- 全屏查看：右上角删除图标 → 二次确认弹窗
- 展开日视图：左滑单张删除 或 多选删除模式
- 删除同步：本地文件 + gallery DB 记录同步删除

### 下载容错

- `download_status = 'failed'` 的图片显示"重新下载"按钮
- 点击触发 `retry_download` command

---

## 不在本任务范围内

- 行为路径埋点（后续独立任务，见 backlog）
- 云端同步（无云端存储）
- 生成次数限制（本期不限制）
- 移动端适配
