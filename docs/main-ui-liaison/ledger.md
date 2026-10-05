# 驻场台账 — matheshop

## 批次进度

| 批次 | 内容 | 状态 | 日期 |
|------|------|------|------|
| 0 | 升级线 + 批次 2-4 + 驻场四步补齐 | ✅ 完成 | 2026-09-01 |

## 待办

- [ ] KaTeX × view-2d 联合设计（已并入 2026-10-03 反馈信，等待 main-ui 回信裁决方案 A/B/C）
- [ ] main-ui 官方画布模板（view-canvas）就绪后，移除 flow-graph-kit-vue 依赖并回信落地报告

## 工作日志

### 2026-10-03
- 修正批次 4「短期保留 flow-graph-kit-vue」结论：决定彻底移除，改由 main-ui 承接
- 源码评估：FlowGraphEditorSurface 净价值 ≈ viewport-2d-kit 薄壳 + SVG 连线层；view-node / view-flow / view-world 均不能原样替代（详见信件 §1-§2）
- 反馈信已写并投递：`feedback/outbox/main-ui/main-ui-20261003204413.md` → main-ui `feedback/inbox/matheshop/`（需求规格 R-1~R-6 + 方案 A/B/C，建议与 KaTeX 联合设计合并回信）

### 2026-09-01
- 驻场四步补齐（此前升级线 + 批次 2-4 已在 2026-08 完成）
- view-inspector 兑现 FR-452、view-console + view-table 已接入
- KaTeX 联合设计信已发出（三方案 + 推荐混合模式），等待反馈
