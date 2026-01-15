export type EventObject = {
  type: string;
  // allow payload fields
  [k: string]: unknown;
};

export type Snapshot<C = unknown> = {
  /** 当前活跃叶子状态的路径（如 "root.dragging"）。 */
  value: string;
  context: C;
  changed: boolean;
  lastEvent?: EventObject;
};

export type GuardArgs<C, E extends EventObject> = {
  context: C;
  event: E;
  state: Snapshot<C>;
};

export type Guard<C, E extends EventObject> = (args: GuardArgs<C, E>) => boolean;

export type ActionArgs<C, E extends EventObject> = {
  context: C;
  event: E;
  state: Snapshot<C>;
  /**
   * 立刻在同一轮中插入一个内部事件（类似 raise），会优先于队列中的 send。
   * 注意：为避免深递归，解释器内部有最大步数保护。
   */
  raise: (event: E) => void;
  /** 把事件放入队列，当前事件处理结束后再处理。 */
  send: (event: E) => void;
};

export type Action<C, E extends EventObject> = (args: ActionArgs<C, E>) => void | Promise<void>;

export type AssignAction<C, E extends EventObject> = {
  kind: 'assign';
  assign: (args: { context: C; event: E; state: Snapshot<C> }) => Partial<C>;
};

export type AnyAction<C, E extends EventObject> = Action<C, E> | AssignAction<C, E>;

export type TransitionDef<C, E extends EventObject> = {
  /**
   * 目标状态：
   * - 支持绝对路径："root.a.b"
   * - 支持相对路径："b"（相对到声明该 transition 的节点）
   */
  target?: string;
  guard?: Guard<C, E> | Array<Guard<C, E>>;
  actions?: Array<AnyAction<C, E>>;
  /** internal: true 表示不触发 exit/entry，仅执行 actions（用于内部更新） */
  internal?: boolean;
  /** 便于调试 */
  description?: string;
};

export type StateNodeConfig<C, E extends EventObject> = {
  /** 当前节点的键名（通常由父 states 的 key 提供），root 可省略 */
  id?: string;
  initial?: string;
  states?: Record<string, StateNodeConfig<C, E>>;
  on?: Record<string, TransitionDef<C, E> | Array<TransitionDef<C, E>>>;
  entry?: Array<AnyAction<C, E>>;
  exit?: Array<AnyAction<C, E>>;
};

export type Machine<C, E extends EventObject> = {
  id: string;
  /** root 初始叶子状态的全路径 */
  initial: string;
  /** 扁平化后的 path->node */
  nodes: Record<string, NormalizedNode<C, E>>;
};

export type NormalizedNode<C, E extends EventObject> = {
  id: string; // full path
  parent?: string; // full path
  initialChild?: string; // child key (not full path)
  children?: string[]; // child keys
  on?: Record<string, Array<TransitionDef<C, E>>>;
  entry?: Array<AnyAction<C, E>>;
  exit?: Array<AnyAction<C, E>>;
};

export type InterpretOptions<C> = {
  context: C;
};

export type SendResult = {
  handled: boolean;
};

export type UnhandledListener<C, E extends EventObject> = (args: {
  snapshot: Snapshot<C>;
  event: E;
}) => void;

