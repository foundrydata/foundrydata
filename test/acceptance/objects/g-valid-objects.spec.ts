import { describe, expect, it } from 'vitest';

import { executePipeline } from '../../../packages/core/src/pipeline/orchestrator.js';
import {
  DIAGNOSTIC_CODES,
  DIAGNOSTIC_PHASES,
} from '../../../packages/core/src/diag/codes.js';
import fixtures from '../../fixtures/g-valid-objects.json';

describe('Acceptance — objects: G_valid vs non-G_valid motifs', () => {
  it('emits G_valid nested objects without structural Repair for required fields', async () => {
    const schema = fixtures.gvalid_nested_customer_profile.schema as unknown;

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

    for (const row of finalItems as unknown[]) {
      expect(row).toBeTruthy();
      expect(typeof row).toBe('object');
      const obj = row as Record<string, unknown>;
      expect(typeof obj.id).toBe('number');
      expect(obj.profile).toBeTruthy();
      expect(typeof obj.profile).toBe('object');
      const profile = obj.profile as Record<string, unknown>;
      expect(typeof profile.email).toBe('string');
      expect(typeof profile.age).toBe('number');
    }

    const actions = result.artifacts.repairActions ?? [];
    expect(actions.length).toBe(0);
  });

  it('satisfies minProperties and enum/const bounds for G_valid objects without repair', async () => {
    const schema = fixtures.gvalid_minprops_enum_object.schema as unknown;

    const result = await executePipeline(schema, {
      mode: 'strict',
      generate: {
        count: 2,
        seed: 17,
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
      const obj = row as Record<string, unknown>;
      expect(obj).toHaveProperty('code');
      expect(['OK', 'ALT']).toContain(obj.code);
      expect(obj).toHaveProperty('label', 'LBL');
      expect(typeof obj.extra).toBe('number');
      expect(Object.keys(obj).length).toBeGreaterThanOrEqual(3);
    }

    const actions = result.artifacts.repairActions ?? [];
    expect(actions.length).toBe(0);

    const index = result.artifacts.gValidIndex;
    expect(index?.get('#')?.isGValid).toBe(true);
  });

  it('fails validation with clear diagnostics for unsatisfiable G_valid simple object', async () => {
    const schema = fixtures.gvalid_unsat_enum_const_object.schema as unknown;

    const result = await executePipeline(schema, {
      mode: 'strict',
      generate: {
        count: 1,
        seed: 5,
        planOptions: { gValid: true },
      },
      validate: { validateFormats: false },
    });

    expect(result.status).toBe('failed');
    expect(result.stages.validate.status).toBe('completed');
    expect(result.artifacts.validation?.valid).toBe(false);

    const actions = result.artifacts.repairActions ?? [];
    expect(actions.length).toBe(0);

    const diags = result.artifacts.validationDiagnostics ?? [];
    expect(diags.length).toBeGreaterThan(0);
    for (const diag of diags) {
      expect(diag.phase).toBe(DIAGNOSTIC_PHASES.VALIDATE);
    }
    const first = diags[0]!;
    expect(first.code).toBe(DIAGNOSTIC_CODES.VALIDATION_KEYWORD_FAILED);
    expect(first.details).toMatchObject({ keyword: 'enum' });
    expect(String(first.canonPath)).toContain('/properties/code');
  });

  it('keeps non-G_valid AP:false/unevaluated* objects stable when toggling G_valid flag', async () => {
    const schema = fixtures.nongvalid_ap_false_unevaluated_object
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
