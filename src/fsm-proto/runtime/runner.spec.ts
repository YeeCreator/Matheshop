import { test, expect } from 'vitest';
import { runSmoke } from './runner';

test('smoke runner', async () => {
  const ctx = await runSmoke();
  expect(ctx.log).toContain('commit');
});

