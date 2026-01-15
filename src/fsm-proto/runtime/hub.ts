/**
 * hub.ts
 *
 * 多层服务事件分发中心（Hub）：
 * - 支持按优先级注册多个 service（layer），并提供两种分发模式：
 *   1) 'first'：按优先级顺序发送，任一层处理后停止传播（可用于拦截/覆盖语义）；
 *   2) 'broadcast'：并行广播给所有层，返回是否有任一层处理。
 * - 提供 register/unregister/dispatch API，返回 unregister 用于注销。
 * - 设计用于在多组件/多机器场景下协调事件分发（例如高优先级的全局快捷键拦截）。
 */
import type { EventObject, SendResult } from '../core/types';

type Service<E extends EventObject = EventObject> = {
  send: (event: E) => Promise<SendResult>;
};

type Layer = {
  name: string;
  priority: number;
  service: Service;
};

export function createHub() {
  const layers: Layer[] = [];

  function register(name: string, service: Service, priority = 0) {
    layers.push({ name, service, priority });
    layers.sort((a, b) => b.priority - a.priority);
    return () => unregister(name);
  }

  function unregister(name: string) {
    const idx = layers.findIndex(l => l.name === name);
    if (idx >= 0) layers.splice(idx, 1);
  }

  /**
   * mode:
   * - 'first': 按优先级依次发送，某层 handled 即停止
   * - 'broadcast': 所有层都发送（并行）
   */
  async function dispatch(event: EventObject, mode: 'first' | 'broadcast' = 'first') {
    if (mode === 'broadcast') {
      const results = await Promise.all(layers.map(l => l.service.send(event)));
      const handled = results.some(r => r.handled);
      return { handled };
    }

    for (const l of layers) {
      const r = await l.service.send(event);
      if (r.handled) return { handled: true, layer: l.name } as const;
    }
    return { handled: false } as const;
  }

  return {
    register,
    unregister,
    dispatch,
  };
}
