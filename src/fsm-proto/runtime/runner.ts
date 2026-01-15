// 可选：一个轻量 smoke runner（主要给手动调试用）。
// 注意：仓库 tsconfig 为 noEmit，通常不直接用 node 跑 TS；建议用 vitest 执行单测。

import { makeDemoService } from '../runner/demoMachine';

export async function runSmoke() {
  const svc = makeDemoService();
  await svc.send({ type: 'GO_EDIT' });
  await svc.send({ type: 'TYPE', text: 'x' });
  await svc.send({ type: 'COMMIT' });

  const snap = svc.getSnapshot();
  if (snap.value !== 'root.view') {
    throw new Error(`unexpected state: ${snap.value}`);
  }
  return snap.context;
}

