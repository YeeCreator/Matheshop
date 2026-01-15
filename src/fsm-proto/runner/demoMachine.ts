/**
 * demoMachine.ts
 *
 * 演示用的简单状态机构造器与运行服务：
 * - 用于在示例/测试中快速构建并运行一个小型状态机服务（view <-> editing）。
 * - Context 带有一个 log 数组，用于记录 entry/exit/actions 的顺序，便于断言行为。
 * - 导出 makeDemoService()：返回已 start 的解释器 service（供 demo 或测试使用）。
 */
import { createMachine } from '../core/machine';
import { assign, interpret } from '../runtime/interpreter';

type Ctx = { log: string[] };

type Ev =
  | { type: 'GO_EDIT' }
  | { type: 'GO_VIEW' }
  | { type: 'TYPE'; text: string }
  | { type: 'COMMIT' };

export function makeDemoService() {
  const m = createMachine<Ctx, Ev>({
    id: 'root',
    initial: 'view',
    states: {
      view: {
        entry: [({ context }) => context.log.push('enter view')],
        on: {
          GO_EDIT: { target: 'editing' },
        },
      },
      editing: {
        initial: 'text',
        entry: [({ context }) => context.log.push('enter editing')],
        exit: [({ context }) => context.log.push('exit editing')],
        on: {
          // 祖先转移：在 editing 上定义 COMMIT，子状态也能处理
          COMMIT: {
            target: 'view',
            actions: [({ context }) => context.log.push('commit')],
          },
        },
        states: {
          text: {
            entry: [({ context }) => context.log.push('enter text')],
            on: {
              TYPE: {
                internal: true,
                actions: [
                  assign(({ context, event }) => ({
                    log: [...context.log, `type:${event.text}`],
                  })),
                ],
              },
              GO_VIEW: { target: 'root.view' },
            },
          },
        },
      },
    },
  });

  const svc = interpret(m, { context: { log: [] } }).start();
  return svc;
}
