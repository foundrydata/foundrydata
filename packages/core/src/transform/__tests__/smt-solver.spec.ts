import { describe, expect, it, vi } from 'vitest';

import {
  LocalSmtSolver,
  probeLocalSmtUsage,
  type QfLiaProblem,
  type LocalSmtResult,
  type LocalSmtBackend,
} from '../smt/solver.js';

const dummyProblem: QfLiaProblem = {
  kind: 'qf_lia',
  constraints: [],
};

describe('LocalSmtSolver', () => {
  it('returns disabled when local SMT is not enabled', async () => {
    const backendFactory = vi.fn();
    const solver = new LocalSmtSolver({
      enableLocalSMT: false,
      solverTimeoutMs: 10,
      backendFactory,
    });

    const outcome = await solver.solveWithTimeout(dummyProblem);
    expect(outcome.kind).toBe('disabled');
    expect(backendFactory).not.toHaveBeenCalled();
  });

  it('returns unavailable when no backend factory is provided', async () => {
    const solver = new LocalSmtSolver({
      enableLocalSMT: true,
      solverTimeoutMs: 10,
    });

    const outcome = await solver.solveWithTimeout(dummyProblem);
    expect(outcome.kind).toBe('unavailable');
  });

  it('returns timeout when backend does not resolve within the budget', async () => {
    const slowBackendFactory = vi.fn<() => Promise<LocalSmtBackend>>(
      async () => ({
        solveQfLia: (_problem: QfLiaProblem) =>
          new Promise<LocalSmtResult>(() => {
            // Intentionally never resolve to trigger timeout
          }),
      })
    );

    const solver = new LocalSmtSolver({
      enableLocalSMT: true,
      solverTimeoutMs: 5,
      backendFactory: slowBackendFactory,
    });

    const outcome = await solver.solveWithTimeout(dummyProblem, {
      timeoutMs: 5,
    });

    expect(outcome.kind).toBe('timeout');
  });

  it('returns ok when backend resolves before the timeout', async () => {
    const backendFactory = vi.fn<() => Promise<LocalSmtBackend>>(async () => ({
      solveQfLia: async (_problem: QfLiaProblem) => ({
        outcome: 'sat',
        model: { x: 1 },
      }),
    }));

    const solver = new LocalSmtSolver({
      enableLocalSMT: true,
      solverTimeoutMs: 20,
      backendFactory,
    });

    const outcome = await solver.solveWithTimeout(dummyProblem);

    expect(outcome.kind).toBe('ok');
    expect(outcome.result?.outcome).toBe('sat');
    expect(outcome.result?.model).toEqual({ x: 1 });
  });
});

describe('probeLocalSmtUsage', () => {
  it('reports disabled when the feature flag is off', () => {
    const result = probeLocalSmtUsage({
      enableLocalSMT: false,
      solverTimeoutMs: 25,
    });
    expect(result).toBe('disabled');
  });

  it('reports unknown when the feature flag is on', () => {
    const result = probeLocalSmtUsage({
      enableLocalSMT: true,
      solverTimeoutMs: 25,
    });
    expect(result).toBe('unknown');
  });
});
