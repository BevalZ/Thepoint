# PRD — 深挖趋势热力图（GitHub 风格）

## 目标

将 `Analytics.tsx` 中"近 30 天深挖趋势"折线图替换为 GitHub 代码贡献热力图风格的日历格子图，外观和交互与 GitHub contributions graph 相似。

## 功能范围

### 前端 — 热力图组件

新建 `components/HeatmapChart.tsx`，接收 `dailyActions: DailyActions[]`，渲染：

- **布局**：按周列排列，每列 7 格（周一至周日），从左（最早）到右（今天）
- **范围**：过去 365 天（或数据覆盖范围，取较小值）
- **格子颜色**：4 级强度，基于 accent 色系（空=`bg-bg-elevated`，低/中/高/最高渐进饱和度）
- **交互**：hover 显示 tooltip（日期 + 次数）
- **月份标签**：列顶部显示月份缩写
- **周标签**：左侧显示 Mon/Wed/Fri

不使用 ECharts，用纯 Tailwind + SVG 或 div 格子实现，保持轻量。

### 后端 — 数据范围扩展

`commands/analytics.rs` 中 `get_analytics` 返回的 `dailyActions` 当前取近 30 天，扩展为近 365 天（SQL 改 `date('now', '-365 days')`）。

`AnalyticsData` 和 `types.ts` 中 `dailyActions` 字段不变，仅数据范围扩大。

### Analytics 页面改动

将现有折线图 (`lineOption`) 替换为 `<HeatmapChart dailyActions={data.dailyActions} />`，移除 `lineOption` 函数。

## 样式参考

```
    Jan   Feb   Mar ...
Mon  □ □ □ □ □ □ □
Wed  □ ■ □ □ ▪ □ □
Fri  □ □ □ ▪ □ □ □
```

格子尺寸：约 12×12px，间距 2px，圆角 2px。

## 不在本任务内

- 点击格子跳转到当日详情
- 切换不同统计维度（只统计深挖动作总次数）
