# delivered support letter: main-ui -> matheshop

## Delivery Metadata

- relation: `support`
- source_project: `main-ui`
- target_project: `matheshop`
- source_path: `/Users/ethan/CoreFiles/ProjectsFile/main-ui/docs/mailbox/relay/updates/outbox/matheshop/matheshop.md`
- delivered_at: `2026-08-28T07:24:52+00:00`
- content_hash: `49db774590d0c696f32d7be43b001999c5ad682546b628b5a4e1ca07553cc29d`

## Letter Content

# support advice (updates-outbox): main-ui -> matheshop

## Context

`main-ui` supports `matheshop` because `matheshop` depends on `main-ui`.

本信件为 **main-ui 0.6.0 世代发布通知 + 从 0.1.1 到 0.6.0 的完整升级改造计划**，随附联合改造任务组邀请。请通读后再行动；任何一步有疑问，通过 `feedback/outbox/main-ui/` 回信即可。

---

## 1. 发布摘要

- **发布物**：`main-ui-0.6.0.tgz`（位于 `/Users/ethan/CoreFiles/ProjectsFile/main-ui/main-ui-0.6.0.tgz`），包内携带全套文档（见 §8）。
- **版本跨度**：`matheshop` 当前依赖 `main-ui: workspace:^0.1.1`，本次跨越 **0.2.0 / 0.3.0 / 0.4.0 / 0.5.0 / 0.6.0 五个世代**。
- **兼容性结论**：五个世代全部遵循「公开 API 只增不改、持久化自动迁移」原则。`matheshop` 既有接入**理论上零破坏升级**；真正的工作量在「是否消费新能力」（见 §5 改造线）。
- **主包版本号**：`main-ui` 主包从 `0.4.0` 统一升至 `0.6.0`（与模板库世代对齐），导出面与行为无任何差异。

## 2. 五个世代发生了什么（速览）

| 世代 | 主题 | 对 matheshop 的关键点 |
|---|---|---|
| 0.2.0 | 契约先行 + 工程底座 | 仓库转 monorepo（包名/导出面不变）；`viewport-2d-kit` 改名 `@main-ui/viewport-2d-kit`；主题根属性 `data-mui-theme`；快照降级占位；Tab 溢出收纳 |
| 0.3.0 | 浮动窗口 + 模板一期 | 浮动窗口（Window 层）；`view-tree / view-inspector / view-2d / view-table` 四个官方模板（**view-inspector 即贵方 PRD FR-452 点名的检查器**）；持久化升至 v3（自动迁移） |
| 0.4.0 | 停靠引导 + 模板二期 | 五向停靠引导指示器 + Ghost 预览；`view-form / view-node / view-console`；`@main-ui/core` 表单基座；主题密度变量 `data-mui-density` |
| 0.5.0 | 模板库大规模建设 | **`@main-ui/view-flow`（流程/状态机文档编辑器）**；虚拟滚动基座；`EmbeddedViewHost` 嵌套保护；schema 数组字段 + 条件显隐 |
| 0.6.0 | 旗舰复合模板 | **`@main-ui/view-sandbox`（自由沙盘画布）**、**`@main-ui/view-host-engine`（外部引擎桥接）** |

## 3. 双线改造模型（必读）

- **升级线（低风险，预计半天内）**：仅换版本号 + 安装 + 验证，既有功能行为不变。见 §4。
- **改造线（深度、自愿、分批）**：用官方模板库与停靠新能力重构自研部分。见 §5。**建议放入联合改造任务组执行（§7）。**

## 4. 升级线：详细步骤（0.1.1 → 0.6.0）

1. **改依赖版本**：`matheshop/package.json` 中 `"main-ui": "workspace:^0.1.1"` → `"workspace:^0.6.0"`。
2. **安装**：`pnpm install`（`matheshop/pnpm-workspace.yaml` 已含 `../main-ui`，workspace 解析不变）。
3. **安装官方模板包（按需）**：模板包为独立包。推荐把 monorepo 内模板包纳入贵方 workspace 解析：在 `matheshop/pnpm-workspace.yaml` 追加 `- "../main-ui/packages/*"`，然后 `pnpm add workspace:@main-ui/view-inspector`（其余同理）；或 `"@main-ui/view-inspector": "file:../main-ui/packages/view-inspector"` 直链。
4. **验证**：`pnpm typecheck && pnpm test && pnpm build`，另跑一遍 Electron 主流程冒烟（工作区切换、布局保存/恢复、KaTeX 公式渲染面板）。
5. **必须检查项**：
   - **持久化**：`WorkbenchDocument.version` 现为 `3`（新增 `floatingWindows` 字段）。自实现持久化层且做严格 schema 校验时需接受该字段；旧快照自动迁移。
   - **主题变量**：新代码应消费 `--mui-*` 令牌；旧变量名仍兼容，无强制迁移。
   - **demo 端口**：main-ui demo 端口已改为 **4183**（仅影响联调脚本）。
   - **行为增强感知**：未注册视图类型渲染占位表面（不再丢弃）；Tab 超宽出现滚动/溢出菜单。均属增强。

## 5. 改造线：针对 matheshop 的建议（自愿、分批）

基于对 `matheshop` 技术栈的调研（flow-graph-kit-vue、katex、viewport-2d-kit、electron）：

| 自研现状（推测） | 官方替代/增强 | 收益 |
|---|---|---|
| 检查器面板（PRD FR-452） | **`@main-ui/view-inspector`**（schema 驱动，三态注入，意图抛出） | 直接满足 FR-452；与 `@main-ui/core` 校验纯函数共用 |
| flow-graph-kit-vue 知识图谱/流程展示 | `@main-ui/view-flow`（L2 无头内核 + FSM 层）或 `@main-ui/view-node`（@vue-flow 薄封装，peer `^1.48`） | 视图状态随布局保存/恢复；flow-graph-kit 可保留，经 `view-host-engine` 桥接亦可 |
| 参数/题目配置表单 | `view-form`（schema 驱动 + 数组字段 + 条件显隐） | 条件显隐天然适合「按题型动态出字段」 |
| 公式/题目浏览列表 | `view-tree` / `view-table`（虚拟滚动，万级条目不卡） | 省去虚拟滚动自研维护 |
| 构建/运行日志 | `view-console`（等级过滤、自动跟随） | 开箱即用 |
| 数学画布（2D 图形演示） | `view-2d`（基于 `@main-ui/viewport-2d-kit` + pixi.js ^8，贵方已有 2d-kit 依赖，迁入成本极低） | 与停靠/视图状态体系打通 |

**KaTeX 说明**：模板库不内置公式渲染，`view-2d` / `view-sandbox` 均支持自定义元素渲染，KaTeX 产物可作为自定义图层接入；接入细节由联合任务组共同设计。

## 6. 建议的分批节奏

- **批次 1（升级线）**：本信件 §4，独立可完成，半天内。
- **批次 2（检查器落地）**：`view-inspector` 接入（FR-452），优先级最高。
- **批次 3（表单与列表）**：`view-form` + `view-tree` / `view-table` / `view-console`。
- **批次 4（图与画布）**：`view-flow` / `view-node` 评估 + `view-2d` 数学画布试点。

## 7. 联合改造任务组邀请

我方（main-ui 项目组）提议：**派出项目联络人驻场 `matheshop`，临时组建独立改造任务组**（与其他 5 家下游完全隔离、互不干扰），共同执行 §5/§6 的改造线。我方承诺：

- 提供本信件所述全部计划的落地支持、代码级适配协助与回归验证；
- 改造过程中发现的 main-ui 缺陷，最高优先级修复；
- 贵方随时可叫停任何批次，升级线成果不受影响。

回复方式：通过 `feedback/outbox/main-ui/` 回信（写明接受/暂缓 + 期望启动批次），我方即安排联络人。

## 8. 发布包内文档清单（均在 `main-ui-0.6.0.tgz` 的 `docs/` 下）

`USER_MANUAL.md`（用户使用指南）、`API_MANUAL.md`、`DEVELOPER_GUIDE.md`、`HOST_INTEGRATION_GUIDE.md`、`HOST_ADAPTER_GUIDE.md`、`PRESET_VIEWS_GUIDE.md`、`DEVELOPMENT_LOG.md`（完整开发日志）、`MIGRATION_GUIDE_0.1.0.md` ~ `MIGRATION_GUIDE_0.6.0.md`（五份世代迁移指南）、`HOST_UPGRADE_CHECKLIST_TEMPLATE.md`（升级检查清单模板）。本项目开源（MIT），文档可自由分发。

## Suggested Steps

- Required change: 升级线 §4（`workspace:^0.1.1` → `workspace:^0.6.0` + 安装 + 验证）；改造线自愿分批。
- Compatibility note: 公开 API、`rendererKey` 契约、`WorkbenchDocument` schema 只增不改；持久化自动迁移；无破坏性变更。
- Validation command: `pnpm typecheck && pnpm test && pnpm build`。
- Deadline or release note: 无强制期限；建议先完成升级线。联合改造任务组邀请见 §7。

