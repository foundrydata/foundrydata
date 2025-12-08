import { describe, expect, it } from 'vitest';

import { executePipeline } from '../../packages/core/src/pipeline/orchestrator.js';
import extendedFixtures from '../fixtures/g-valid-extended.json';

describe('Acceptance — extended G_valid motifs contract', () => {
  it('enforces Generator vs Repair contract for simple conditional objects in strict G_valid posture', async () => {
    const schema = extendedFixtures.gvalid_simple_conditional_object
      .schema as unknown;

    const result = await executePipeline(schema, {
      mode: 'strict',
      generate: {
        count: 10,
        seed: 7,
        planOptions: { gValid: true },
      },
      validate: { validateFormats: false },
      repair: {
        attempts: 3,
      },
      metrics: { enabled: true },
      coverage: { mode: 'off' },
    });

    expect(result.status).toBe('completed');
    expect(result.artifacts.validation?.valid).toBe(true);

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
        expect(obj.valueB).toBeUndefined();
      } else {
        expect(typeof obj.valueB).toBe('string');
        expect(obj.valueA).toBeUndefined();
      }
    }

    const actions = result.artifacts.repairActions ?? [];
    expect(actions.length).toBe(0);

    const diagnostics = result.artifacts.repairDiagnostics ?? [];
    const diagCodes = diagnostics.map((d) => d.code);
    expect(diagCodes).not.toContain('REPAIR_GVALID_STRUCTURAL_ACTION');
    expect(diagCodes).not.toContain('REPAIR_TIER_DISABLED');
  });

  it('enforces Generator vs Repair contract for discriminated union objects in strict G_valid posture', async () => {
    const schema = extendedFixtures.gvalid_discriminated_union_object
      .schema as unknown;

    const result = await executePipeline(schema, {
      mode: 'strict',
      generate: {
        count: 10,
        seed: 17,
        planOptions: { gValid: true },
      },
      validate: { validateFormats: false },
      repair: {
        attempts: 3,
      },
      metrics: { enabled: true },
      coverage: { mode: 'off' },
    });

    expect(result.status).toBe('completed');
    expect(result.artifacts.validation?.valid).toBe(true);

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
        expect(obj.valueB).toBeUndefined();
      } else {
        expect(typeof obj.valueB).toBe('string');
        expect(obj.valueA).toBeUndefined();
      }
    }

    const actions = result.artifacts.repairActions ?? [];
    expect(actions.length).toBe(0);

    const diagnostics = result.artifacts.repairDiagnostics ?? [];
    const diagCodes = diagnostics.map((d) => d.code);
    expect(diagCodes).not.toContain('REPAIR_GVALID_STRUCTURAL_ACTION');
    expect(diagCodes).not.toContain('REPAIR_TIER_DISABLED');
  });
});
