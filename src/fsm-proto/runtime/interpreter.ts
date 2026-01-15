/**
 * interpreter.ts
 *
 * 状态机解释器实现（Interpreter 类）：
 * - 管理 machine 实例的运行时：start/stop/subscribe/send；
 * - 使用内部队列（send/raise）串行处理事件，防止 reentrancy 导致不确定行为；
 * - 实现 transition 的查找与执行：支持 internal transitions（仅 actions）与外部 transition（exit/actions/enter）；
 * - runActions 支持函数 action 与 assign action（不可变更新 context），并支持 raise/send 将事件入队；
 * - emit 提供 snapshot 广播给订阅者，onUnhandled 回调用于处理未被处理的事件。
 */
import { ancestorsFromLeaf, lcaPath } from '../core/ids';
import {
  type AnyAction,
  type EventObject,
  type InterpretOptions,
  type Machine,
  type SendResult,
  type Snapshot,
  type TransitionDef,
  type UnhandledListener,
} from '../core/types';
import { assertMachineWellFormed, resolveInitialLeaf, resolveTargetPath, pathChain } from '../core/machine';

type Listener<C> = (snapshot: Snapshot<C>) => void;

type QueueItem<E extends EventObject> = {
  kind: 'send' | 'raise';
  event: E;
};

export class Interpreter<C, E extends EventObject> {
  private machine: Machine<C, E>;
  private context: C;
  private value: string;
  private listeners: Set<Listener<C>> = new Set();
  private running = false;
  private queue: Array<QueueItem<E>> = [];
  private processing = false;
  private onUnhandled?: UnhandledListener<C, E>;

  constructor(machine: Machine<C, E>, options: InterpretOptions<C>) {
    assertMachineWellFormed(machine);
    this.machine = machine;
    this.context = options.context;
    this.value = machine.initial;
  }

  start() {
    if (this.running) return this;
    this.running = true;

    // enter from root to initial leaf
    const chain = pathChain(this.value);
    const initEvent = { type: '__init' } as E;
    this.runEnter(chain, initEvent);

    this.emit(false, initEvent);
    return this;
  }

  stop() {
    this.running = false;
    this.listeners.clear();
    this.queue = [];
  }

  subscribe(listener: Listener<C>) {
    this.listeners.add(listener);
    listener({ value: this.value, context: this.context, changed: false });
    return () => this.listeners.delete(listener);
  }

  setUnhandledListener(listener?: UnhandledListener<C, E>) {
    this.onUnhandled = listener;
  }

  getSnapshot(): Snapshot<C> {
    return { value: this.value, context: this.context, changed: false };
  }

  async send(event: E): Promise<SendResult> {
    if (!this.running) return { handled: false };
    this.enqueue({ kind: 'send', event });
    return this.drain();
  }

  private enqueue(item: QueueItem<E>) {
    if (item.kind === 'raise') {
      this.queue.unshift(item);
    } else {
      this.queue.push(item);
    }
  }

  private async drain(): Promise<SendResult> {
    if (this.processing) {
      // 已经在 drain 过程中，直接返回“可能已处理”，调用方不依赖它。
      return { handled: true };
    }

    this.processing = true;
    let lastHandled = false;
    try {
      let steps = 0;
      while (this.queue.length) {
        if (steps++ > 1000) throw new Error('FSM exceeded max steps in one drain (possible infinite raise loop)');
        const item = this.queue.shift()!;
        const handled = await this.step(item.event);
        lastHandled = lastHandled || handled;
      }
    } finally {
      this.processing = false;
    }

    return { handled: lastHandled };
  }

  private async step(event: E): Promise<boolean> {
    const prevValue = this.value;

    const match = this.findTransition(event);
    if (!match) {
      this.onUnhandled?.({ snapshot: this.getSnapshot(), event });
      return false;
    }

    const { sourcePath, transition } = match;

    // internal transition: only actions
    if (transition.internal || !transition.target) {
      await this.runActions(transition.actions ?? [], event);
      const changed = this.value !== prevValue;
      this.emit(changed, event);
      return true;
    }

    const targetAbs0 = resolveTargetPath(sourcePath, transition.target);

    // target 可能是 compound，需展开到 leaf
    const targetAbs = resolveInitialLeaf(this.machine.nodes, targetAbs0);

    if (targetAbs === this.value) {
      await this.runActions(transition.actions ?? [], event);
      this.emit(false, event);
      return true;
    }

    const lca = lcaPath(this.value, targetAbs);

    // exit: leaf -> (excluding lca)
    await this.runExit(this.value, lca, event);

    // transition actions
    await this.runActions(transition.actions ?? [], event);

    // update current value before entry (so entry can see new state)
    this.value = targetAbs;

    // enter: (lca child) -> target leaf
    await this.runEnterBetween(lca, targetAbs, event);

    this.emit(true, event);
    return true;
  }

  private findTransition(event: E): { sourcePath: string; transition: TransitionDef<C, E> } | null {
    // leaf->root 查找
    const chain = ancestorsFromLeaf(this.value);
    const snapshot: Snapshot<C> = { value: this.value, context: this.context, changed: false, lastEvent: event };

    for (const sourcePath of chain) {
      const node = this.machine.nodes[sourcePath];
      const list = node?.on?.[event.type] ?? [];
      for (const t of list) {
        if (!t.guard) return { sourcePath, transition: t };
        const guards = Array.isArray(t.guard) ? t.guard : [t.guard];
        const ok = guards.every(g => g({ context: this.context, event, state: snapshot }));
        if (ok) return { sourcePath, transition: t };
      }
    }

    return null;
  }

  private emit(changed: boolean, lastEvent?: E) {
    const snapshot: Snapshot<C> = {
      value: this.value,
      context: this.context,
      changed,
      lastEvent,
    };
    for (const l of Array.from(this.listeners)) l(snapshot);
  }

  private async runActions(actions: Array<AnyAction<C, E>>, event: E) {
    for (const act of actions) {
      if (typeof act === 'function') {
        await act({
          context: this.context,
          event,
          state: { value: this.value, context: this.context, changed: false, lastEvent: event },
          raise: (e: E) => this.enqueue({ kind: 'raise', event: e }),
          send: (e: E) => this.enqueue({ kind: 'send', event: e }),
        });
      } else if (act.kind === 'assign') {
        const patch = act.assign({ context: this.context, event, state: { value: this.value, context: this.context, changed: false, lastEvent: event } });
        this.context = { ...(this.context as any), ...(patch as any) };
      }
    }
  }

  private runEnter(chain: string[], event: E) {
    // root -> leaf
    for (const p of chain) {
      const node = this.machine.nodes[p];
      const entry = node?.entry ?? [];
      // entry 允许 async，但 start() 目前是 sync；这里保持 sync 语义，async action 会变成 unhandled promise。
      // 后续如需严格 async，可把 start() 也改成 async。
      for (const act of entry) {
        if (typeof act === 'function') {
          void act({
            context: this.context,
            event,
            state: { value: this.value, context: this.context, changed: false, lastEvent: event },
            raise: (e: E) => this.enqueue({ kind: 'raise', event: e }),
            send: (e: E) => this.enqueue({ kind: 'send', event: e }),
          });
        } else if (act.kind === 'assign') {
          const patch = act.assign({ context: this.context, event, state: { value: this.value, context: this.context, changed: false, lastEvent: event } });
          this.context = { ...(this.context as any), ...(patch as any) };
        }
      }
    }
  }

  private async runExit(fromLeaf: string, stopAt: string, event: E) {
    const chain = ancestorsFromLeaf(fromLeaf);
    for (const p of chain) {
      if (p === stopAt) break;
      const node = this.machine.nodes[p];
      const exit = node?.exit ?? [];
      await this.runActions(exit, event);
    }
  }

  private async runEnterBetween(lca: string, targetLeaf: string, event: E) {
    const chain = pathChain(targetLeaf);
    const startIdx = lca ? chain.indexOf(lca) + 1 : 0;
    const toEnter = chain.slice(Math.max(0, startIdx));
    for (const p of toEnter) {
      const node = this.machine.nodes[p];
      await this.runActions(node?.entry ?? [], event);
    }
  }
}

export function interpret<C, E extends EventObject>(machine: Machine<C, E>, options: InterpretOptions<C>) {
  return new Interpreter<C, E>(machine, options);
}

export function assign<C, E extends EventObject>(
  updater: (args: { context: C; event: E; state: Snapshot<C> }) => Partial<C>
) {
  return {
    kind: 'assign' as const,
    assign: updater,
  };
}

