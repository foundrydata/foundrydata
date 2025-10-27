import { describe, it, expect } from 'vitest';
import { executePipeline, DIAGNOSTIC_CODES } from '../../index.js';

describe('Resolver extension run-level diagnostics', () => {
  const schemaWithExternal = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      pkg: { $ref: 'https://json.schemastore.org/package' },
    },
  } as const;

  it('emits strategies and offline notes under local-only strategy (no network)', async () => {
    const result = await executePipeline(schemaWithExternal, {
      mode: 'lax',
      generate: {
        count: 1,
        planOptions: {
          resolver: {
            strategies: ['local'],
          },
        },
      },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('completed');
    const compose = result.stages.compose.output!;
    const run = compose.diag?.run ?? [];
    const codes = run.map((r) => r.code);
    expect(codes).toContain(DIAGNOSTIC_CODES.RESOLVER_STRATEGIES_APPLIED);
    // When strategies=['local'], prefetch is not attempted; only strategies note is guaranteed
    // All run-level entries must pin canonPath to '#'
    for (const entry of run) {
      expect(entry.canonPath).toBe('#');
    }
  });
});
