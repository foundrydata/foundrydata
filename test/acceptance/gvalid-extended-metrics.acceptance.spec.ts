import { describe, expect, it } from 'vitest';

import { executePipeline } from '../../packages/core/src/pipeline/orchestrator.js';
import extendedFixtures from '../fixtures/g-valid-extended.json';

describe('Acceptance — extended G_valid motifs metrics', () => {
  // eslint-disable-next-line complexity
  it('honours no-repair invariants and metrics for G_valid simple conditional objects', async () => {
    const schema = extendedFixtures.gvalid_simple_conditional_object
      .schema as unknown;

    const result = await executePipeline(schema, {
      mode: 'strict',
      generate: {
        count: 3,
        seed: 41,
        planOptions: { gValid: true },
      },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('completed');

    const finalItems =
      result.artifacts.repaired ?? result.artifacts.generated?.items ?? [];

    expect(Array.isArray(finalItems)).toBe(true);
    expect(finalItems.length).toBeGreaterThan(0);

    for (const row of finalItems as unknown[]) {
      expect(row).toBeTruthy();
      expect(typeof row).toBe('object');
      const obj = row as {
        kind: string;
        valueA?: unknown;
        valueB?: unknown;
      };
      expect(obj.kind === 'A' || obj.kind === 'B').toBe(true);
      if (obj.kind === 'A') {
        expect(typeof obj.valueA).toBe('number');
      } else {
        expect(typeof obj.valueB).toBe('string');
      }
    }

    const actions = result.artifacts.repairActions ?? [];
    expect(actions.length).toBe(0);

    const usage = result.metrics.repairUsageByMotif ?? [];
    expect(usage.length).toBeGreaterThan(0);
    const motifUsage = usage.filter(
      (entry) =>
        entry.gValid === true && entry.motifId === 'simpleConditionalObject'
    );
    expect(motifUsage.length).toBeGreaterThan(0);
    const totalItems = motifUsage.reduce((sum, entry) => sum + entry.items, 0);
    const totalItemsWithRepair = motifUsage.reduce(
      (sum, entry) => sum + entry.itemsWithRepair,
      0
    );

    expect(
      usage.every(
        (entry) =>
          entry.gValid === true &&
          typeof entry.canonPath === 'string' &&
          entry.canonPath.length > 0 &&
          entry.itemsWithRepair === 0 &&
          entry.actions === 0
      )
    ).toBe(true);

    expect(
      result.metrics.gValid_simpleConditionalObject_items
    ).toBeGreaterThanOrEqual(totalItems);
    expect(
      result.metrics.gValid_simpleConditionalObject_itemsWithRepair ?? 0
    ).toBe(0);
    expect(result.metrics.gValid_simpleConditionalObject_actions ?? 0).toBe(0);
    expect(totalItemsWithRepair).toBe(0);
  });

  // eslint-disable-next-line complexity
  it('honours no-repair invariants and metrics for G_valid discriminated union objects', async () => {
    const schema = extendedFixtures.gvalid_discriminated_union_object
      .schema as unknown;

    const result = await executePipeline(schema, {
      mode: 'strict',
      generate: {
        count: 3,
        seed: 53,
        planOptions: { gValid: true },
      },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('completed');

    const finalItems =
      result.artifacts.repaired ?? result.artifacts.generated?.items ?? [];

    expect(Array.isArray(finalItems)).toBe(true);
    expect(finalItems.length).toBeGreaterThan(0);

    for (const row of finalItems as unknown[]) {
      expect(row).toBeTruthy();
      expect(typeof row).toBe('object');
      const obj = row as {
        kind: string;
        valueA?: unknown;
        valueB?: unknown;
      };
      expect(obj.kind === 'A' || obj.kind === 'B').toBe(true);
      if (obj.kind === 'A') {
        expect(typeof obj.valueA).toBe('number');
      } else {
        expect(typeof obj.valueB).toBe('string');
      }
    }

    const actions = result.artifacts.repairActions ?? [];
    expect(actions.length).toBe(0);

    const usage = result.metrics.repairUsageByMotif ?? [];
    expect(usage.length).toBeGreaterThan(0);
    const motifUsage = usage.filter(
      (entry) =>
        entry.gValid === true && entry.motifId === 'discriminatedUnionObject'
    );
    expect(motifUsage.length).toBeGreaterThan(0);
    const totalItems = motifUsage.reduce((sum, entry) => sum + entry.items, 0);
    const totalItemsWithRepair = motifUsage.reduce(
      (sum, entry) => sum + entry.itemsWithRepair,
      0
    );

    expect(
      usage.every(
        (entry) =>
          entry.gValid === true &&
          typeof entry.canonPath === 'string' &&
          entry.canonPath.length > 0 &&
          entry.itemsWithRepair === 0 &&
          entry.actions === 0
      )
    ).toBe(true);

    expect(
      result.metrics.gValid_discriminatedUnionObject_items
    ).toBeGreaterThanOrEqual(totalItems);
    expect(
      result.metrics.gValid_discriminatedUnionObject_itemsWithRepair ?? 0
    ).toBe(0);
    expect(result.metrics.gValid_discriminatedUnionObject_actions ?? 0).toBe(0);
    expect(totalItemsWithRepair).toBe(0);
  });
});
