import { describe, expect, it } from 'vitest';

import { executePipeline } from '../../../packages/core/src/pipeline/orchestrator.js';
import { DIAGNOSTIC_CODES } from '../../../packages/core/src/diag/codes.js';

describe('Acceptance — arrays: contains vs maxItems', () => {
  it('fails the pipeline when minContains exceeds maxItems (impossible contains)', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      maxItems: 2,
      minContains: 3,
      contains: {},
    } as const;

    const result = await executePipeline(schema, {
      mode: 'strict',
      // No instances are needed to observe the UNSAT diagnostics.
      generate: { count: 0 },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('failed');
    expect(result.stages.compose.status).toBe('failed');
    expect(result.stages.generate.status).toBe('skipped');
    expect(result.stages.repair.status).toBe('skipped');
    expect(result.stages.validate.status).toBe('skipped');

    const composeOutput = result.stages.compose.output!;
    const fatal =
      composeOutput.diag?.fatal?.filter(
        (entry) =>
          entry.code === DIAGNOSTIC_CODES.CONTAINS_UNSAT_BY_SUM &&
          entry.canonPath === ''
      ) ?? [];

    expect(fatal.length).toBeGreaterThan(0);
    expect(fatal[0]?.details).toMatchObject({
      sumMin: 3,
      maxItems: 2,
    });
  });
});
it('detects unsatisfiable contains bag when independent needs exceed capacity', async () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'array',
    maxItems: 1,
    allOf: [
      { contains: { const: 'left' }, minContains: 1 },
      { contains: { const: 'right' }, minContains: 1 },
    ],
  } as const;

  const result = await executePipeline(schema, {
    mode: 'strict',
    generate: { count: 0 },
    validate: { validateFormats: false },
  });

  const composeOutput = result.stages.compose.output!;
  const fatal = composeOutput.diag?.fatal?.find(
    (entry) =>
      entry.code === DIAGNOSTIC_CODES.CONTAINS_UNSAT_BY_SUM &&
      entry.canonPath === ''
  );

  expect(fatal).toBeDefined();
  expect(fatal?.details).toMatchObject({
    disjointness: 'provable',
  });
});

it('records unsat hints when overlap is unknown while still failing composition', async () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'array',
    maxItems: 1,
    allOf: [
      { contains: { type: 'string' }, minContains: 1 },
      { contains: { type: 'string' }, minContains: 1 },
    ],
  } as const;

  const result = await executePipeline(schema, {
    mode: 'strict',
    generate: { count: 0 },
    validate: { validateFormats: false },
  });

  const composeOutput = result.stages.compose.output!;
  const hint = composeOutput.diag?.unsatHints?.find(
    (entry) =>
      entry.code === DIAGNOSTIC_CODES.CONTAINS_UNSAT_BY_SUM &&
      entry.canonPath === ''
  );

  expect(hint).toBeDefined();
  expect(hint?.provable).toBe(false);
  expect(hint?.reason).toBe('overlapUnknown');
  expect(hint?.details).toMatchObject({
    sumMin: 2,
    maxItems: 1,
  });
});
