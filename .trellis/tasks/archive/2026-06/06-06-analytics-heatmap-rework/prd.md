# PRD: 统计页热力图改造（绝对分桶 + 通栏布局）

## 背景

当前 `frontend/src/components/HeatmapChart.tsx` 用相对 max 比例的 5 级色阶，且与雷达图并排塞在 `flex-1` 半栏（52 周 × 12px ≈ 760px），布局别扭、跨期不可比。改造为 GitHub 贡献图风格 + 绝对次数分桶。本任务是 `explore-suggestions-log` 的前置依赖——后者要把"飞星动画"落到热力图当天格子上，需要稳定的坐标基准先就绪。

---

## 核心决策（已确认）

| 项 | 决策 |
|---|---|
| 色阶档数 | 10 档（0 = 无填充 + 9 级填充） |
| 分桶阈值 | 0 / 1 / 2 / 4 / 8 / 16 / 32 / 64 / 128 / >128 — 绝对次数，跨日期可比 |
| 色阶取色 | 0 = `bg-bg-elevated border border-border/50`（保持当前空态视觉）；1~9 = 强调色逐档加深 opacity（0.10 → 0.95，9 级近线性 ramp） |
| 布局 | 雷达图与热力图**各占一行**（不再并排）；热力图通栏，52 周固定 |
| 格子尺寸 | 响应式：随容器宽度自适配（CSS grid `repeat(52, minmax(0, 1fr))` + `aspect-ratio: 1`），永不溢出裁切 |
| 图例 | 显示 10 档刻度，与档位阈值对齐（0, 1, 2, 4, 8, 16, 32, 64, 128, 128+） |

---

## 实现规格

### `HeatmapChart.tsx`

1. **替换 `getLevel`**：
   ```ts
   function getLevel(count: number): 0|1|2|3|4|5|6|7|8|9 {
     if (count <= 0) return 0
     if (count >= 128) return 9
     // thresholds: 1, 2, 4, 8, 16, 32, 64, 128
     return (Math.floor(Math.log2(count)) + 1) as 1|2|3|4|5|6|7|8
   }
   ```
   - 完全去掉 `max` 参数与相对比例。

2. **替换 `LEVEL_CLASSES`**：保留 0 档当前样式；1~9 档用强调色加 opacity，通过内联 style 而非 Tailwind class（10 档全枚举太冗余）：
   ```ts
   const FILL_OPACITY = [0, 0.10, 0.20, 0.30, 0.40, 0.50, 0.62, 0.74, 0.86, 0.95]
   ```
   渲染时 `style={{ backgroundColor: level === 0 ? undefined : \`color-mix(in srgb, var(--color-accent) ${FILL_OPACITY[level]*100}%, transparent)\` }}`。

3. **改 grid 布局**：
   - 外层 `<div>` 改为 `display: grid; grid-template-columns: repeat(52, minmax(0, 1fr)); gap: 2px;`。
   - 每格 `aspect-ratio: 1`，去掉固定 `h-3 w-3`。
   - 星期标签列保留（左侧 7 行），月份标签按 col 索引绝对定位（保留现有思路）。

4. **图例**：10 档色块横排，标签 0 / 1 / 2 / 4 / 8 / 16 / 32 / 64 / 128 / 128+（无需每档都标，挑 0/1/8/64/128+ 显示即可，参考 GitHub Less—More）。

### `Analytics.tsx`

- 把 `<ReactECharts radar>` 和 `<HeatmapChart>` 从原来的 `<div className="flex gap-4">` 拆出，各自独占一行（`<div className="rounded-lg border ... p-4">` 包裹）。
- 热力图块上 `<HeatmapChart>` 的容器去掉 `flex-1`，改为 `w-full`。
- 标题"近 365 天深挖趋势"保留。

---

## 暴露给后续任务的契约

为 `explore-suggestions-log` 的飞星动画 + 标记预留接口：

1. **格子坐标可查**：每个 `<div>` 格子加 `data-date={iso}` 属性（取代当前的 onMouseEnter 内部状态），方便外部 `document.querySelector(\`[data-date="2026-06-06"]\`)` 拿到 DOMRect。
2. **可选 marker slot**：`HeatmapChart` 新增可选 prop `markedDates?: Set<string>`，被标记的格子右下角渲染一个 4×4px 强调色 dot（绝对定位 + `pointer-events-none`）。本任务内默认为空，UI 仅渲染骨架；标记数据由后续任务通过 prop 传入。
3. **可选点击回调**：`HeatmapChart` 新增 `onCellClick?: (date: string) => void`。本任务实现回调透传，但 Analytics 不传——后续任务用它弹出当天文档列表。

---

## 验收

- [ ] 单日次数 = 1/2/4/8/16/32/64/128/200 时分别命中 1/2/3/4/5/6/7/8/9 档（手动构造数据测试或在 daily_actions mock 中验证）
- [ ] 窗口宽度 800px / 1200px / 1600px 下热力图均无溢出、无裁切
- [ ] 雷达图与热力图各自独占一行
- [ ] 图例 10 档色块从无到强渐变可见
- [ ] `data-date` 属性正确写出
- [ ] `npx tsc` 通过

---

## 不在本任务范围内

- 探索建议归档与日志（见 `explore-suggestions-log`）
- 当天格子的星点标记**填充**（本任务只留 prop，不渲染数据）
- 当天格子点击弹文档列表（同上）
