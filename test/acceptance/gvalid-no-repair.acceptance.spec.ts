import { describe, expect, it } from 'vitest';

import { executePipeline } from '../../packages/core/src/pipeline/orchestrator.js';
import objectFixtures from '../fixtures/g-valid-objects.json';
import arrayFixtures from '../fixtures/g-valid-arrays.json';

describe('Acceptance — G_valid no-repair metrics', () => {
  it('honours no-repair zone invariants for G_valid nested customer objects', async () => {
    const schema = objectFixtures.gvalid_nested_customer_profile
      .schema as unknown;

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

    const actions = result.artifacts.repairActions ?? [];
    expect(actions.length).toBe(0);

    const usage = result.metrics.repairUsageByMotif ?? [];
    expect(usage.length).toBe(0);
  });

  it('honours no-repair zone invariants for G_valid UUID+contains arrays', async () => {
    const schema = arrayFixtures.gvalid_uuid_contains_order_items
      .schema as unknown;

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
    }

    const actions = result.artifacts.repairActions ?? [];
    expect(actions.length).toBe(0);

    const usage = result.metrics.repairUsageByMotif ?? [];
    expect(usage.length).toBe(0);
  });
});
