/**
 * index.ts
 *
 * fsm-proto 包的对外入口（聚合导出）：
 * - 导出 core/types、core/machine、runtime/interpreter、runtime/hub 等模块，
 *   便于在外部通过 `import * from 'src/fsm-proto'` 使用。
 */
export * from './core/types';
export * from './core/machine';
export * from './runtime/interpreter';
export * from './runtime/hub';
