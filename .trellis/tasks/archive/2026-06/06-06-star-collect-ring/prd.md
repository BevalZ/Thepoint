# PRD: 星星采集交互增强（进度圆环）

## 背景

当前 PointCard 无收藏/标记功能。本需求在主题块星星卡片体系（06-06-theme-block-star-card）基础上，
增加「采集」语义：用户双击星星将该块标记为已采集，触发飞行动画，圆环进度实时更新。

---

## 核心决策（已确认）

| 问题 | 决策 |
|------|------|
| 采集语义 | 一次性标记（starred/unstarred 切换），取消后可重新采集 |
| 星星可见性 | 始终可见，不需要悬停 |
| 飞行动画 | CSS clone 方案：fixed 定位 clone 节点 + cubic-bezier 曲线轨迹 |
| 圆环计数基准 | 全局累计：DB 中 `starred=true` 的 point 总数 |
| 触发手势 | 双击星星图标 |

---

## 数据层变更

### DB schema
`points` 表新增字段：
```sql
ALTER TABLE points ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
```

### 新 Tauri command
- `star_point(id: String) -> Result<u32>` — 标记并返回最新 starred 总数
- `unstar_point(id: String) -> Result<u32>` — 取消标记并返回最新 starred 总数
- `get_starred_count() -> Result<u32>` — 初始化时获取总数

### StoredPoint 类型扩展
```typescript
starred: boolean
```

---

## 进度圆环规格

位置：屏幕右下角固定悬浮（`position: fixed; bottom: 24px; right: 24px`）

### SVG 三段式视觉

```
阶段 1：0 → 10 点
  stroke-dashoffset 从 100% → 0（弧线从缺口到完全闭合）
  stroke-width 固定 3px
  fill 透明

阶段 2：10 → 50 点
  弧线保持闭合
  stroke-width 3px → 8px（线性插值）
  fill opacity 0 → 0.4（内部渐变趋近实心）

阶段 3：50+ 点
  固定最大态：stroke-width 8px，fill opacity 0.4，持续微弱闪烁（pulse animation）
  10 点时达到闭合后也启用 pulse
```

圆环内部显示数字（starred 总数）。

### 点击行为
- 满 10 点后，点击圆环跳转到探索页 AI 图片生成入口

---

## 飞行动画规格

1. 双击时，`getBoundingClientRect()` 获取星星图标坐标
2. clone 星星节点，`position: fixed`，设置起始坐标
3. CSS keyframe：`translate(0,0) scale(1)` → `translate(Δx, Δy) scale(0.3)`，同时 `opacity: 1 → 0`
4. 曲线：`cubic-bezier(0.25, 0.46, 0.45, 0.94)` + 中间控制点用 `offset-path` 或两段动画模拟抛物线
5. 动画时长 600ms，结束后移除 clone 节点，圆环触发吸收动效（scale 1 → 1.15 → 1，80ms）

---

## 异常处理

- 当前页面无可采集星星：双击空白区域时不处理（无提示，避免干扰）
- 已 starred 的星星：双击视为取消采集，圆环数 -1，动画反向（圆环飞出到星星位置）

---

## 不在本任务范围内

- 圆环点击后的 AI 生图流程（见 06-06-ai-gallery）
- 行为路径埋点（后续独立任务）
