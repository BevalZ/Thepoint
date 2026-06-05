# Step 8: 行为统计图表

## 目标
基于 `explore_actions` 表已记录的深挖行为数据，展示可视化统计图表，让用户量化自己的探索模式。

## 背景
- Step 7 已实现 `explore_actions` 记录（id/point_id/action_type/detail/created_at）。
- `action_type` 值：`explain` | `counter` | `followup` | `similar` | `framework`；framework 时 `detail` = 模型 key。
- 前端已有 `echarts` ^5.5.0 + `echarts-for-react` ^3.0.2。
- 产品规格（`docs/product-spec.md` 第八节）定义了5个统计维度 + 雷达图/折线图可视化。

## 统计维度（MVP，基于现有数据）

| 维度 | 计算 |
|------|------|
| 深度指数 | 总子 Point 数 / 总根 Point 数（parent_id IS NULL 的 points）|
| 反方关注度 | `counter` 次数 / 总 actions 次数 |
| 追问率 | `followup` 次数 / 总 actions 次数 |
| 解释偏好 | `explain` 次数 / 总 actions 次数 |
| 框架使用率 | `framework` 次数 / 总 actions 次数 |

这 5 个维度刚好对应**雷达图**的 5 个轴，数值归一化到 0-1。

折线图：按日期聚合每日 action 总次数（趋势图），展示探索活跃度变化。

## 功能需求

### 后端
新增 `commands/analytics.rs`，提供一个命令：
- `get_analytics(app) -> Result<AnalyticsData, String>`

`AnalyticsData`（camelCase serde）：
```rust
pub struct AnalyticsData {
    pub total_points: i64,        // points 总数
    pub total_actions: i64,       // explore_actions 总数
    pub explain_count: i64,
    pub counter_count: i64,
    pub followup_count: i64,
    pub similar_count: i64,
    pub framework_count: i64,
    pub total_child_points: i64,  // parent_id IS NOT NULL 的 points 数
    pub daily_actions: Vec<DailyActions>, // 最近 30 天每日 action 数
}

pub struct DailyActions {
    pub date: String,   // "YYYY-MM-DD"
    pub count: i64,
}
```

SQL：所有统计用单次 SELECT + SUM/COUNT，不做多次查询；daily_actions 用 `substr(created_at, 1, 10)` 按日分组，WHERE created_at >= date('now', '-30 days')。全部读操作，不需要事务，放 spawn_blocking。

注册到 `commands/mod.rs` 和 `lib.rs`。

### 前端
新增 `pages/Analytics.tsx`：
- 顶部：总览数字（总 Points、总深挖次数）
- 主体左：**雷达图**（echarts-for-react）—— 5 维度归一化后可视化；无数据时显示空态提示。
- 主体右：**折线图**（echarts-for-react）—— 近 30 天每日深挖次数趋势。
- 下方：各 action_type 分类计数（简单数字卡片即可）。
- 挂载时调 `getAnalytics()`，loading 态。

`api/types.ts` 加 `AnalyticsData` / `DailyActions`。
`api/index.ts` 加 `getAnalytics()` 包装。

`App.tsx` 导航加「统计」入口（lucide 图标 `BarChart2`）。

ECharts 配色用暗色主题 token（背景透明，文字 `#a0a0b0`，线/雷达轴 `#2a2a3a`，accent `#6366f1`）。

## 验收标准
- `cargo check` 通过（MSVC 环境）。
- `npx tsc --noEmit` 通过，无 `any`。
- 统计页正常渲染；有 action 数据时雷达图/折线图显示；无数据时显示友好空态。
- 所有 invoke 经 `api/index.ts`；类型在 `api/types.ts`；用 `cn()`；暗色风格一致。

## 非目标
- 会话/项目维度的分别统计（后续）。
- 探索结束报告（后续）。
- 导出 PNG（后续）。
