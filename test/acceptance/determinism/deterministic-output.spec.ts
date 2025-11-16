/* eslint-disable complexity */
import { describe, expect, it } from 'vitest';

import { executePipeline } from '../../../packages/core/src/pipeline/orchestrator.js';
import { propertyNamesRewriteEnumSchema } from '../../../packages/core/src/pipeline/__fixtures__/integration-schemas.js';

describe('Acceptance — deterministic output with fixed seed', () => {
  it('produces identical generated items for repeated runs with the same seed and options', async () => {
    const options = {
      mode: 'strict' as const,
      generate: { count: 3, seed: 101 },
      validate: { validateFormats: false },
    };

    const first = await executePipeline(
      propertyNamesRewriteEnumSchema,
      options
    );
    const second = await executePipeline(
      propertyNamesRewriteEnumSchema,
      options
    );

    expect(first.status).toBe('completed');
    expect(second.status).toBe('completed');

    expect(first.artifacts.generated?.items).toEqual(
      second.artifacts.generated?.items
    );

    const firstCoverage =
      first.stages.compose.output?.coverageIndex.get('') ?? null;
    const secondCoverage =
      second.stages.compose.output?.coverageIndex.get('') ?? null;

    expect(firstCoverage).not.toBeNull();
    expect(secondCoverage).not.toBeNull();

    const firstNames = firstCoverage?.enumerate?.() ?? [];
    const secondNames = secondCoverage?.enumerate?.() ?? [];
    expect(firstNames).toEqual(secondNames);
  });
});
