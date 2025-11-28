import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock commander to avoid real CLI execution side-effects
class FakeCommand {
  name(): this {
    return this;
  }
  description(): this {
    return this;
  }
  argument(): this {
    return this;
  }
  version(): this {
    return this;
  }
  command(): this {
    return this;
  }
  option(): this {
    return this;
  }
  action(): this {
    return this;
  }
  parseAsync(): Promise<void> {
    return Promise.resolve();
  }
}

vi.mock('commander', () => ({ Command: FakeCommand }));

// Avoid accidental process.exit when error paths are exercised
beforeAll(() => {
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? 0}) intercepted in tests`);
  }) as never);
});

describe('CLI index smoke — imports without executing actions', () => {
  it('imports CLI module successfully with mocked commander', async () => {
    // Dynamic import executes top-level program definition and mocked parseAsync
    const mod = await import('../index');
    expect(mod).toBeTruthy();
  });
});
