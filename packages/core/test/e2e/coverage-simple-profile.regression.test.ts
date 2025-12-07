import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { executePipeline } from '@foundrydata/core';

const SIMPLE_SCHEMA_PATH = resolve('profiles/simple.json');
const SIMPLE_SCHEMA = JSON.parse(readFileSync(SIMPLE_SCHEMA_PATH, 'utf8'));

describe('coverage-guided regression — profiles/simple.json', () => {
  // eslint-disable-next-line complexity
  it('should produce valid instances and honor conditional metadata.tier when kind=service', async () => {
    const result = await executePipeline(SIMPLE_SCHEMA, {
      mode: 'strict',
      generate: { count: 25, seed: 42 },
      validate: { validateFormats: true },
      repair: { attempts: 3 },
      metrics: { enabled: true },
      coverage: { mode: 'guided', excludeUnreachable: false },
    });

    // Regression guard: pipeline should complete and validate all instances.
    expect(result.status).toBe('completed');
    expect(result.artifacts.validation?.valid).toBe(true);

    const instances: unknown[] = Array.isArray(result.artifacts.repaired)
      ? result.artifacts.repaired
      : (result.artifacts.generated?.items ?? []);

    // Assert conditional requirement: when kind=service, metadata.tier must be present.
    for (const [idx, instance] of instances.entries()) {
      if (
        instance &&
        typeof instance === 'object' &&
        (instance as { kind?: unknown }).kind === 'service'
      ) {
        const metadata = (instance as { metadata?: unknown }).metadata;
        expect(metadata, `instance ${idx} missing metadata`).toBeDefined();
        const tier =
          metadata && typeof metadata === 'object'
            ? (metadata as { tier?: unknown }).tier
            : undefined;
        expect(
          tier,
          `instance ${idx} missing metadata.tier when kind=service`
        ).toBeTypeOf('string');
      }
    }
  });
});
