# MAIN_UI_HOST_INTEGRATION_DESIGN

本文档定义 `matheshop` 作为宿主项目时，如何组合 `main-ui` 与 `viewport-2d-kit`，并明确迁移期的实施边界。

## 0. 实施前必须完成的规范阅读

`matheshop` 在继续推进 `main-ui` 壳层接入或 `viewport-2d-kit` 视口整合前，必须先阅读并遵守以下规范：

1. `main-ui/docs/DEVELOPER_GUIDE.md`
2. `main-ui/docs/HOST_INTEGRATION_GUIDE.md`
3. `main-ui/docs/HOST_PROFILE_VALIDATION.md`
4. `viewport-2d-kit/docs/DEVELOPER_GUIDE.md`
5. `viewport-2d-kit/docs/MAIN_UI_INTEGRATION_GUIDE.md`

必须先确认的硬约束：

1. `CanvasBoard` 业务交互与数学对象语义留在宿主侧。
2. `main-ui` 不恢复 React 运行时导出。
3. `viewport-2d-kit` 只负责 camera、坐标与 viewport foundation。
4. 未完成规范阅读时，不应直接开始新的宿主接入改造。

## 1. 当前状态

`matheshop` 当前仍处于过渡接入阶段：

1. 宿主侧保留 React 过渡壳层承载顶部工具条、左右面板与中心内容区。
2. `main-ui` 以本地依赖方式接入，但不恢复 React 运行时导出。
3. `CanvasBoard` 继续作为中心强交互 surface，不做业务语义下沉。
4. 相机与视口交互已经迁移到 `viewport-2d-kit`，作为当前唯一权威 camera 来源。

结论：`matheshop` 的接入重点不是重写画布，而是把主界面壳层与画布底座的边界稳定下来。

## 2. 角色划分

### 2.1 `main-ui` 的角色

`main-ui` 负责：

1. 工作台壳层。
2. workspace、tab、overlay 生命周期。
3. 对工具面板、属性面板、设置面板的通用承载。

### 2.2 `viewport-2d-kit` 的角色

`viewport-2d-kit` 负责：

1. `CanvasBoard` 内部的 camera。
2. 平移、缩放、触控缩放与 world/screen 坐标换算。
3. 通用 2D 视口基础能力。

### 2.3 `matheshop` 的角色

`matheshop` 继续负责：

1. `CanvasBoard` 业务交互。
2. 网格规则、公式对象与对象选择逻辑。
3. Inspector、工具面板、图层与历史记录。
4. 符号计算引擎路由。
5. React 过渡壳层。

## 3. 推荐接入结构

### 3.1 workspace

推荐维持单主 workspace：

1. `math-canvas-workspace`

### 3.2 editor

推荐稳定拆成以下 editor：

1. `formula-canvas`
2. `math-tools`
3. `formula-inspector`
4. `layer-list`
5. `engine-settings`

### 3.3 renderer 与 adapter 策略

推荐策略：

1. 中心 `formula-canvas` 通过宿主自己的 React 过渡层或 mount adapter 承载。
2. `CanvasBoard` 内部继续使用 `viewport-2d-kit` 作为 camera foundation。
3. `main-ui` 不直接理解 `CanvasBoard` 的业务语义。
4. Inspector、工具面板、设置页可逐步演进为更稳定的宿主 renderer。

## 4. 边界约束

以下约束必须保持：

1. 中心 2D 视口不做语义重写。
2. `main-ui` 不重新引入 React 运行时导出。
3. `viewport-2d-kit` 不承载 `matheshop` 的网格规则、对象语义或 Inspector 状态。
4. 旧 legacy camera 只作为迁移期兼容层，长期应逐步清理。

## 5. 共享状态建议

推荐结构：

1. 画布文档 id、工具状态引用、引擎选择引用进入 editor payload。
2. 真正的对象数据、网格规则、选择状态与历史记录仍由宿主自己管理。
3. 若通过 mount adapter 承载 React 内容，adapter 只负责生命周期，不负责业务存储。

## 6. 最小验收标准

本设计落地后，应满足：

1. 中心画布仍保持当前缩放、平移与编辑体验。
2. `viewport-2d-kit` 继续作为唯一权威 camera 来源。
3. `main-ui` 只承载壳层与编辑器生命周期，不接管业务逻辑。
4. 工具面板、Inspector 与设置面板能作为独立 editor surface 表达。
5. 升级 `main-ui` 时不要求恢复 React 导出。

## 7. 下一轮建议

下一轮优先做以下收敛：

1. 逐步清理 legacy camera 兼容层。
2. 明确哪些 React 面板应转为稳定 mount adapter。
3. 把 `math-tools`、`formula-inspector`、`engine-settings` 的接入口径固定到正式文档中。