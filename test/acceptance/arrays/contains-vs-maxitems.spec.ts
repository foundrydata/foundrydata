import { describe, expect, it } from 'vitest';

import { executePipeline } from '../../../packages/core/src/pipeline/orchestrator.js';
import fixtures from '../../fixtures/g-valid-arrays.json';
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

describe('Acceptance — arrays: G_valid vs non-G_valid motifs', () => {
  it('emits G_valid UUID+contains arrays without structural Repair for required fields', async () => {
    const schema = fixtures.gvalid_uuid_contains_order_items.schema as unknown;

    const result = await executePipeline(schema, {
      mode: 'strict',
      generate: {
        count: 3,
        seed: 123,
        planOptions: { gValid: true },
      },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('completed');

    const finalItems =
      result.artifacts.repaired ?? result.artifacts.generated?.items ?? [];

    expect(Array.isArray(finalItems)).toBe(true);
    expect(finalItems.length).toBeGreaterThan(0);

    for (const arr of finalItems as unknown[]) {
      expect(Array.isArray(arr)).toBe(true);
      for (const elem of arr as any[]) {
        expect(elem).toBeTruthy();
        expect(typeof elem).toBe('object');
        expect(typeof elem.id).toBe('string');
        expect(typeof elem.isGift).toBe('boolean');
      }
    }

    const actions = result.artifacts.repairActions ?? [];
    expect(actions.length).toBe(0);
  });

  it('keeps non-G_valid uniqueItems+contains arrays stable when toggling G_valid flag', async () => {
    const schema = fixtures.nongvalid_unique_items_contains_strings
      .schema as unknown;

    const baseOptions = {
      mode: 'strict',
      generate: { count: 4, seed: 37 },
      validate: { validateFormats: false },
    } as const;

    const off = await executePipeline(schema, {
      ...baseOptions,
      generate: {
        ...baseOptions.generate,
        planOptions: { gValid: false },
      },
    });

    const on = await executePipeline(schema, {
      ...baseOptions,
      generate: {
        ...baseOptions.generate,
        planOptions: { gValid: true },
      },
    });

    expect(off.status).toBe('completed');
    expect(on.status).toBe('completed');

    const finalOff =
      off.artifacts.repaired ?? off.artifacts.generated?.items ?? [];
    const finalOn =
      on.artifacts.repaired ?? on.artifacts.generated?.items ?? [];

    expect(finalOn).toEqual(finalOff);
  });
});
