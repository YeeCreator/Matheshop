import { describe, expect, test } from 'vitest';
import { createMachine } from './core/machine';
import { interpret, assign } from './runtime/interpreter';
import { createHub } from './runtime/hub';

type Ctx = { n: number; trace: string[] };

type Ev =
  | { type: 'INC' }
  | { type: 'GO_A' }
  | { type: 'GO_B' }
  | { type: 'PING' };

describe('fsm-proto', () => {
  test('initial 展开到最深 leaf', () => {
    const m = createMachine<Ctx, Ev>({
      id: 'root',
      initial: 'a',
      states: {
        a: {
          initial: 'a1',
          states: {
            a1: {},
          },
        },
        b: {},
      },
    });

    const svc = interpret(m, { context: { n: 0, trace: [] } }).start();
    expect(svc.getSnapshot().value).toBe('root.a.a1');
  });

  test('祖先 on 查找 + LCA exit/enter', async () => {
    const m = createMachine<Ctx, Ev>({
      id: 'root',
      initial: 'a',
      states: {
        a: {
          initial: 'a1',
          exit: [({ context }) => context.trace.push('exit a')],
          on: {
            GO_B: { target: 'root.b' },
          },
          states: {
            a1: {
              entry: [({ context }) => context.trace.push('enter a1')],
              exit: [({ context }) => context.trace.push('exit a1')],
            },
          },
        },
        b: {
          entry: [({ context }) => context.trace.push('enter b')],
        },
      },
    });

    const svc = interpret(m, { context: { n: 0, trace: [] } }).start();
    expect(svc.getSnapshot().value).toBe('root.a.a1');

    await svc.send({ type: 'GO_B' });
    expect(svc.getSnapshot().value).toBe('root.b');

    // exit a1 -> exit a -> enter b
    expect(svc.getSnapshot().context.trace).toEqual(['enter a1', 'exit a1', 'exit a', 'enter b']);
  });

  test('internal transition 不触发 exit/enter，仅 actions', async () => {
    const m = createMachine<Ctx, Ev>({
      id: 'root',
      initial: 'a',
      states: {
        a: {
          entry: [({ context }) => context.trace.push('enter a')],
          on: {
            INC: {
              internal: true,
              actions: [assign(({ context }) => ({ n: context.n + 1 }))],
            },
          },
        },
      },
    });

    const svc = interpret(m, { context: { n: 0, trace: [] } }).start();
    await svc.send({ type: 'INC' });
    await svc.send({ type: 'INC' });
    expect(svc.getSnapshot().value).toBe('root.a');
    expect(svc.getSnapshot().context.n).toBe(2);
    expect(svc.getSnapshot().context.trace).toEqual(['enter a']);
  });

  test('hub priority：first 模式下高优先级先处理并拦截', async () => {
    const hub = createHub();

    const m1 = createMachine<Ctx, Ev>({
      id: 'm1',
      initial: 'idle',
      states: {
        idle: {
          on: {
            PING: {
              internal: true,
              actions: [assign(({ context }) => ({ trace: [...context.trace, 'm1'] }))],
            },
          },
        },
      },
    });

    const m2 = createMachine<Ctx, Ev>({
      id: 'm2',
      initial: 'idle',
      states: {
        idle: {
          on: {
            PING: {
              internal: true,
              actions: [assign(({ context }) => ({ trace: [...context.trace, 'm2'] }))],
            },
          },
        },
      },
    });

    const s1 = interpret(m1, { context: { n: 0, trace: [] } }).start();
    const s2 = interpret(m2, { context: { n: 0, trace: [] } }).start();

    hub.register('low', s1, 1);
    hub.register('high', s2, 10);

    await hub.dispatch({ type: 'PING' }, 'first');

    expect(s2.getSnapshot().context.trace).toEqual(['m2']);
    expect(s1.getSnapshot().context.trace).toEqual([]);
  });

  test('hub broadcast：所有层都会收到', async () => {
    const hub = createHub();

    const mk = (id: string) =>
      createMachine<Ctx, Ev>({
        id,
        initial: 'idle',
        states: {
          idle: {
            on: {
              PING: {
                internal: true,
                actions: [assign(({ context }) => ({ trace: [...context.trace, id] }))],
              },
            },
          },
        },
      });

    const s1 = interpret(mk('a'), { context: { n: 0, trace: [] } }).start();
    const s2 = interpret(mk('b'), { context: { n: 0, trace: [] } }).start();

    hub.register('a', s1, 0);
    hub.register('b', s2, 0);

    await hub.dispatch({ type: 'PING' }, 'broadcast');

    expect(s1.getSnapshot().context.trace).toEqual(['a']);
    expect(s2.getSnapshot().context.trace).toEqual(['b']);
  });
});

