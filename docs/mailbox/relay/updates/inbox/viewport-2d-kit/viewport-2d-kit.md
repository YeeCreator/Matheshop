# delivered support letter: viewport-2d-kit -> matheshop

## Delivery Metadata

- relation: `support`
- source_project: `viewport-2d-kit`
- target_project: `matheshop`
- source_path: `/Users/ethan/CoreFiles/ProjectsFile/viewport-2d-kit/docs/mailbox/relay/updates/outbox/matheshop/matheshop.md`
- delivered_at: `2026-08-28T07:24:52+00:00`
- content_hash: `b7c89b55075407f9e73e86d9f3fb0a1befa33a2e6657b1386ac9b30738b6d99c`

## Letter Content

# support advice (out-down): viewport-2d-kit -> matheshop

## Context

`viewport-2d-kit` supports `matheshop` because `matheshop` depends on `viewport-2d-kit`.

## Adaptation Advice

**viewport-2d-kit 已发布 pixi 内核化（方案 B 定稿，2026-08-26）。** 架构对齐
V3D（three.js 内核 + 薄壳）：渲染/交互/功能全部由 pixi.js 内核（`PixiViewport`）
唯一承载，V2D 对外只是能放进 main-ui 标签页的薄连接器（`ViewportMainUiEditor`）。

对 matheshop 的影响（公式画布等强指针交互 surface）：

1. `formula-canvas` 若使用 `Viewport2DCanvas`（CSS transform + slot）：该路径为历史兼容层，
   新画布请迁移到 `viewport-2d-kit/pixi` 的 `PixiViewportCanvas`，公式对象以世界坐标 Graphics/Sprite 绘制进 `world` 容器。
2. 若使用 React 过渡层：新增 `viewport-2d-kit/react-pixi` 的 `PixiViewportReact`。
3. 交互语义保持一致：`getCamera` / `setCamera` / `fitToBounds` / `screenToWorld` / `worldToScreen`；
   新增 `setViewBox` / `getSize` / `onInteractingChange`。
4. 新依赖：`pixi.js@^8` 为 peerDependency，需自行安装。

## Suggested Steps

- Required change: 升级 `viewport-2d-kit` 依赖；`pixi.js` 加入依赖。
- Compatibility note: 相机/坐标 API 与 core 一致，迁移主要把“slot 内容”改为“world 容器内容”。
- Validation command: `pnpm typecheck && pnpm build`；验证公式画布平移/缩放/fit 与指针命中。
- Deadline or release note: 无强制截止；建议在下一个画布改造迭代内完成切换。

