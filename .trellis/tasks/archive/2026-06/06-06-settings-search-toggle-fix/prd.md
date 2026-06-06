# PRD: 设置页「启用搜索模型」开关样式修正

## 背景

`frontend/src/pages/Settings.tsx:470-475` 的搜索启用 toggle 滑钮位置不对：
- 轨道 `h-6 w-11`（24×44px）
- 圆钮 `h-5 w-5`（20×20px）+ `top-0.5`（top 2px，留底 2px ✓）
- 开启 `translate-x-5`（20px）、关闭 `translate-x-0.5`（2px）

问题：开启时圆钮右侧距轨道右沿 `44 - 2 - 20 - 20 = 2px`（应≈2px ✓但行程是 18px 而非对称的「44-20-2-2=20」）；关闭时左侧 2px 居中。视觉上开启态略偏左、未贴右，给人"没拨到位"感。

## 决策

按 GitHub-style toggle 标准比例修正：
- 轨道 `h-5 w-9`（20×36px）
- 圆钮 `h-4 w-4`（16×16px）+ `top-0.5`（2px）
- 关闭 `translate-x-0.5`（2px）、开启 `translate-x-[18px]` 或 `translate-x-4 + 2`（即左 18px → 距右沿 2px，对称）

修后行程对称、圆钮垂直居中。

---

## 实现

仅改 `Settings.tsx` 中"启用搜索模型"那一块的 toggle button className（约 470-475 行）：

```tsx
<button
  onClick={() => setSearchEnabled(e => !e)}
  className={cn('relative h-5 w-9 rounded-full transition-colors', searchEnabled ? 'bg-accent' : 'bg-border')}
>
  <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', searchEnabled ? 'translate-x-[18px]' : 'translate-x-0.5')} />
</button>
```

---

## 验收

- [ ] 关闭态：圆钮左间隙 = 右间隙 = 2px
- [ ] 开启态：圆钮右间隙 = 2px，与关闭态左间隙相等（视觉对称）
- [ ] 圆钮 4px 上下均等
- [ ] 切换动画顺滑（transition-transform 已有）
- [ ] 无其他 toggle 受影响（确认仅改这一处）
- [ ] `npx tsc` 通过

---

## 不在本任务范围内

- 抽出通用 `<Toggle>` 组件（本仓库目前只有这一处 toggle，未到抽组件时机）
- 其他 Settings 页样式问题
