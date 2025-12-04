import { describe, it, expect, vi } from 'vitest';
import { repairItemsAjvDriven } from '../../repair/repair-engine';
import { classifyGValid } from '../../transform/g-valid-classifier';
import type { ComposeResult } from '../../transform/composition-engine';
import { createSourceAjv } from '../../util/ajv-source';
import { MetricsCollector } from '../../util/metrics';
import * as scoreModule from '../score/score.js';

function eff(): ComposeResult {
  const canonical = {
    schema: {},
    ptrMap: new Map<string, string>(),
    revPtrMap: new Map<string, string[]>(),
    notes: [],
  };
  const effective = {
    canonical,
    containsBag: new Map(),
    coverageIndex: new Map(),
  } as unknown as ComposeResult;
  return effective;
}

function valid(schema: unknown, data: unknown): boolean {
  const ajv = createSourceAjv({ dialect: '2020-12' }, {});
  const v = ajv.compile(schema as any);
  return !!v(data);
}

describe('Repair Engine — §10 mapping repairs (basic)', () => {
  it('repairs enum by choosing first member', () => {
    const schema = { type: 'string', enum: ['A', 'B', 'C'] };
    const out = repairItemsAjvDriven(
      ['x'],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(out.items[0]).toBe('A');
    expect(valid(schema, out.items[0])).toBe(true);
  });

  it('repairs const by setting the const value', () => {
    const schema = { const: 42 };
    const out = repairItemsAjvDriven(
      ['nope'],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(out.items[0]).toBe(42);
    expect(valid(schema, out.items[0])).toBe(true);
  });

  it('repairs type using minimal representative', () => {
    const schema = { type: 'integer' };
    const out = repairItemsAjvDriven(
      ['bad'],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(out.items[0]).toBe(0);
    expect(valid(schema, out.items[0])).toBe(true);
  });

  it('repairs pattern with simple alternation by picking first literal', () => {
    const schema = { type: 'string', pattern: '^(?:alpha|beta)$' };
    const out = repairItemsAjvDriven(
      ['zzz'],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(out.items[0]).toBe('alpha');
    expect(valid(schema, out.items[0])).toBe(true);
  });

  it('repairs pattern with word-class and exact quantifier {m}', () => {
    const schema = { type: 'string', pattern: '^\\w{3}$' };
    const out = repairItemsAjvDriven(
      [''],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(typeof out.items[0]).toBe('string');
    expect((out.items[0] as string).length).toBe(3);
    expect(valid(schema, out.items[0])).toBe(true);
  });

  it('repairs pattern with digit class and range quantifier {2,4}', () => {
    const schema = { type: 'string', pattern: '^\\d{2,4}$' };
    const out = repairItemsAjvDriven(
      ['x'],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(typeof out.items[0]).toBe('string');
    expect((out.items[0] as string).length).toBeGreaterThanOrEqual(2);
    expect(valid(schema, out.items[0])).toBe(true);
  });

  it('de-duplicates uniqueItems arrays and shrinks by maxItems', () => {
    const schema = { type: 'array', uniqueItems: true, maxItems: 2 };
    const out = repairItemsAjvDriven(
      [[1, 1, 2, 2]],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    expect(Array.isArray(out.items[0])).toBe(true);
    const arr = out.items[0] as number[];
    expect(arr.length).toBe(2);
    expect(new Set(arr).size).toBe(arr.length);
    expect(valid(schema, arr)).toBe(true);
  });

  it('grows arrays to satisfy minItems when possible', () => {
    const schema = {
      type: 'array',
      items: { type: 'integer', default: 1 },
      minItems: 3,
    };
    const out = repairItemsAjvDriven(
      [[1]],
      { schema, effective: eff() },
      { attempts: 2 }
    );
    const arr = out.items[0] as number[];
    expect(arr.length).toBe(3);
    expect(valid(schema, arr)).toBe(true);
  });

  it('emits G_valid structural diagnostics and skips addRequired in G_valid objects by default', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        id: { type: 'integer', minimum: 0 },
        title: { type: 'string', minLength: 1 },
      },
      required: ['id', 'title'],
    } as const;
    const canonical = {
      schema,
      ptrMap: new Map<string, string>(),
      revPtrMap: new Map<string, string[]>(),
      notes: [],
    };
    const coverageIndex = new Map();
    const gValidIndex = classifyGValid(schema, coverageIndex, undefined);
    const effective = {
      canonical,
      containsBag: new Map(),
      coverageIndex,
    } as unknown as ComposeResult;

    const out = repairItemsAjvDriven(
      // Missing required "title"
      [{ id: -1 }],
      {
        schema,
        effective,
        planOptions: { gValid: true },
        gValidIndex,
      },
      { attempts: 2 }
    );

    expect(Array.isArray(out.items)).toBe(true);
    const repairedItem = out.items[0] as Record<string, unknown>;
    // id may still be nudged for minimum, but title should not be synthesized.
    expect(repairedItem).not.toHaveProperty('title');

    const diagCodes = (out.diagnostics ?? []).map((d) => d.code);
    expect(diagCodes).toContain('REPAIR_GVALID_STRUCTURAL_ACTION');
  });

  it('allows structural repairs when allowStructuralInGValid is true', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        id: { type: 'integer', minimum: 0 },
        title: { type: 'string', minLength: 1 },
      },
      required: ['id', 'title'],
    } as const;
    const canonical = {
      schema,
      ptrMap: new Map<string, string>(),
      revPtrMap: new Map<string, string[]>(),
      notes: [],
    };
    const coverageIndex = new Map();
    const gValidIndex = classifyGValid(schema, coverageIndex, undefined);
    const effective = {
      canonical,
      containsBag: new Map(),
      coverageIndex,
    } as unknown as ComposeResult;

    const out = repairItemsAjvDriven(
      [{ id: -1 }],
      {
        schema,
        effective,
        planOptions: {
          gValid: true,
          repair: { allowStructuralInGValid: true },
        },
        gValidIndex,
      },
      { attempts: 2 }
    );

    const repairedItem = out.items[0] as Record<string, unknown>;
    expect(repairedItem).toHaveProperty('title');

    const diagCodes = (out.diagnostics ?? []).map((d) => d.code);
    expect(diagCodes).not.toContain('REPAIR_GVALID_STRUCTURAL_ACTION');
  });

  it('records motif-tagged repair usage metrics for G_valid and non-G_valid motifs on the same run', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        id: { type: 'integer', minimum: 0 },
        title: { type: 'string', minLength: 1 },
      },
      required: ['id', 'title'],
    } as const;
    const canonical = {
      schema,
      ptrMap: new Map<string, string>(),
      revPtrMap: new Map<string, string[]>(),
      notes: [],
    };
    const coverageIndex = new Map();
    const gValidIndex = classifyGValid(schema, coverageIndex, undefined);
    const effective = {
      canonical,
      containsBag: new Map(),
      coverageIndex,
    } as unknown as ComposeResult;

    const metrics = new MetricsCollector({ now: () => 0 });

    const out = repairItemsAjvDriven(
      [
        // Item in a G_valid simple object motif; missing required "title"
        // and invalid "id" to trigger both structural and numeric repairs.
        { id: -1 },
      ],
      {
        schema,
        effective,
        planOptions: {
          gValid: true,
          repair: { allowStructuralInGValid: true },
        },
        gValidIndex,
      },
      { attempts: 2, metrics }
    );

    expect(out.items.length).toBe(1);

    const snapshot = metrics.snapshotMetrics({ verbosity: 'ci' });
    const usage = snapshot.repairUsageByMotif ?? [];
    expect(usage.length).toBeGreaterThan(0);

    const hasGValidBucket = usage.some((entry) => entry.gValid === true);
    const hasNonGValidBucket = usage.some((entry) => entry.gValid === false);

    expect(hasGValidBucket).toBe(true);
    expect(hasNonGValidBucket).toBe(true);
  });

  it('wires Score(x) computation into AJV-driven repair attempts', () => {
    const schema = { type: 'string', minLength: 3 };
    const spy = vi.spyOn(scoreModule, 'computeScore');

    const out = repairItemsAjvDriven(
      ['x'],
      { schema, effective: eff() },
      { attempts: 2 }
    );

    expect(out.items[0]).toBeDefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reverts deterministically when Score(x) does not improve', () => {
    const schema = { type: 'string', minLength: 3 } as const;
    const original = 'x';

    const spy = vi
      .spyOn(scoreModule, 'computeScore')
      .mockImplementation((errors: unknown) => {
        // Force Score(x) to appear unchanged (no improvement), even when
        // the underlying AJV errors would disappear after Repair.
        if (!errors || !Array.isArray(errors) || errors.length === 0) {
          return 1;
        }
        return 1;
      });

    const out = repairItemsAjvDriven(
      [original],
      { schema, effective: eff() },
      { attempts: 2 }
    );

    expect(out.items[0]).toBe(original);
    const revertDiag = (out.diagnostics ?? []).find(
      (d) => d.code === 'REPAIR_REVERTED_NO_PROGRESS'
    );
    expect(revertDiag).toBeDefined();
    expect(revertDiag?.phase).toBe('repair');
    expect(revertDiag?.details).toMatchObject({
      keyword: expect.any(String),
      scoreBefore: 1,
      scoreAfter: 1,
    });
    spy.mockRestore();
  });
});
