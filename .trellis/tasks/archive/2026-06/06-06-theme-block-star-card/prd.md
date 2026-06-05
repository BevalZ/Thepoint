# PRD: 主题块星星卡片

## 背景

当前 Explore 页对每句话产生 point 并划线，point 数量过多且颗粒度过细。
本需求将 point 体系替换为"主题块 + 星星卡片"模式。

---

## 核心交互

1. 内容导入后，AI 按阅读难度将文本分割为若干主题块（参考现有分块字数规则）
2. 每个主题块独立渲染为一个文本区域，右侧悬浮一颗星星图标 ⭐
3. 星星在块加载完成后出现（流式，每块就绪即显示）
4. 点击星星展开卡片，卡片包含三个内容区：
   - **总结**：该主题块的一句话核心总结
   - **辣评**：由 AI 以用户配置的评论员风格生成的评论
   - **信息分类标签**：五大类 + 子类标签（见下）

---

## 卡片内容规格

### 总结
- 一句话，20-60字
- 用原文语言

### 辣评
- 由 AI 生成，风格由设置中的"评论员"配置决定
- 评论员配置项（存入 AppConfig）：
  - `commentator_name`: 名称，默认"鲁迅"
  - `commentator_style`: 风格描述，默认"犀利讽刺，言简意赅，擅用反讽"
  - `commentator_emoji`: 头像 Emoji，从预设列表选择，默认"🧐"
- 预设 Emoji 列表（可在设置页选择）：🧐 🤨 😤 🙃 🫠 👀 💀 🐉 🦊 🤖 📢 🎭

### 信息分类标签
- AI 从以下五大类中判断，每类可标注 1 个最匹配的子类
- 一个主题块可有多个标签（不同类型并存）
- 五大类及其子类枚举（用于 prompt 和前端展示）：

```
事实: 硬事实 | 历史事实 | 统计事实 | 科学共识 | 案例事实 | 制度事实 | 元事实 | 法律事实 | 技术/参数事实 | 存在事实
观点: 价值判断 | 个人偏好 | 建议与呼吁 | 预测 | 信念与信仰 | 假说与推测 | 分类/定义性判断 | 比较性评价 | 审美判断 | 解释性观点
中间混淆形态: 推断性陈述 | 选择性事实 | 预测伪装成事实 | 价值判断伪装 | 匿名权威 | 情绪化标签 | 预设伪装成事实 | 因果归因伪装 | 整体断言伪装
规范性/分析性: 道德/法律规范 | 逻辑/数学真理 | 定义约定 | 语法规则 | 同义反复 | 先验真理
修辞性: 隐喻 | 类比 | 夸张 | 反问 | 反讽/讽刺 | 委婉表达 | 思想实验
```

---

## 技术方案

### 后端新增

**AI 函数** `analyze_chunk(chunk, commentator_config) -> ChunkCard`：
- 一次 AI 调用，返回 `{ summary, hot_take, labels: [{ category, sub }] }`
- Prompt 内嵌完整分类手册（压缩版）

**新 Tauri command** `analyze_text_streaming(text)`：
- 先调用现有 `split_chunks` 分块
- 每块并发调用 `analyze_chunk`，完成后 emit `"chunk_card"` 事件
- 完成后 emit `"chunk_cards_done"`

**新类型** `ChunkCard`：
```rust
pub struct ChunkCard {
    pub text: String,       // 原始块文本
    pub summary: String,
    pub hot_take: String,
    pub labels: Vec<Label>,
}
pub struct Label {
    pub category: String,  // 五大类
    pub sub: String,       // 子类
}
```

**AppConfig 新增字段**：
- `commentator_name: String`（默认 "鲁迅"）
- `commentator_style: String`（默认 "犀利讽刺，言简意赅，擅用反讽"）
- `commentator_emoji: String`（默认 "🧐"）

### 前端

**Explore 页重构**：
- 移除当前 AnnotatedText + PointCard 渲染
- 改为 `ThemeBlockList`：每个块 = 文本区域 + 右侧星星
- 星星状态：loading（转圈）→ ready（⭐ 可点击）→ open（卡片展开）
- 卡片为 Popover/抽屉，展示总结 + 辣评（含评论员 Emoji + 名称）+ 标签徽章

**设置页新增"评论员"区块**：
- 名称输入框
- 风格描述输入框
- Emoji 选择器（12 个预设）

**Store**：
- `useExploreStore` 替换 `points[]` 为 `chunkCards: ChunkCard[]`
- 监听 `chunk_card` 事件追加

---

## 输入区重构

- **任何输入形式（文件/URL/粘贴）导入后，不再显示文本框**
- 直接进入分块解析结果视图
- 解析期间：每完成一块，该块文本 + 星星以动画浮现（从右侧 slide-in + fade-in）
- 星星以 spring 弹出动画出现（scale 0→1，略微过冲）
- 整个页面无滚动条（overflow hidden），块列表区域内部滚动

## 动画规格

使用项目已有的 **framer-motion**（不引入 GSAP/Anime.js）：
- 每个主题块：`initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}`，stagger 效果（每块延迟 0.08s）
- 星星：`initial={{ scale: 0 }} animate={{ scale: 1 }}`，`type: "spring", stiffness: 400, damping: 15`
- 卡片展开：`initial={{ opacity: 0, scale: 0.95, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }}`

## 卡片展开方式

- 点击星星 → 从屏幕**右侧滑入抽屉**（固定宽度约 360px）
- 所有块共用同一个抽屉，切换块时内容替换
- 点击抽屉外部关闭

## 滚动行为

- 块列表区域：可滚动，但**隐藏滚动条样式**（`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`）
- 抽屉打开时块列表**仍可独立滚动**，两者互不干扰

---

## 不在本任务范围内
- 用户上传自定义头像图片
- 保存 ChunkCard 到知识库（下一期）
- 移动端适配
