/**
 * 画布命令桥接约定。
 *
 * main-ui 的 command 只负责入口与快捷键，业务逻辑仍留在宿主画布 renderer 内。
 * 命令入口通过 `window` 广播该事件，由当前激活的 `MatheshopCanvasEditor` 监听并
 * 调用对应 board 方法，避免命令层直接耦合画布实例。
 */

/** 画布命令事件名。 */
export const MATHESHOP_BOARD_COMMAND_EVENT = 'matheshop:board-command'

/** 画布命令载荷：命令入口通过该结构把意图广播给当前激活的画布 renderer。 */
export type MatheshopBoardCommand = 'clear' | 'toggleLinkMode' | 'deleteSelected' | 'evaluate'

/** 命令事件 detail 结构。 */
export type MatheshopBoardCommandDetail = {
  command: MatheshopBoardCommand
}
