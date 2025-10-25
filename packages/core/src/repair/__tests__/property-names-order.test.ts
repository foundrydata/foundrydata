import { describe, it, expect } from 'vitest';
import {
  repairItemsAjvDriven,
  runRenamePreflightCheck,
} from '../../repair/repair-engine';
import { DIAGNOSTIC_CODES } from '../../diag/codes';

type CoverageEntry = { has: (name: string) => boolean };

type EffectiveOptions = {
  coverage?: Map<string, CoverageEntry> | null;
  canonicalSchema?: unknown;
  revPtrEntries?: Array<[string, string[]]>;
};

function createEffective(schema: unknown, options: EffectiveOptions = {}): any {
  const defaultRevPtrs: Array<[string, string[]]> = [
    ['', ['']],
    ['#', ['#']],
  ];
  return {
    canonical: {
      schema: options.canonicalSchema ?? schema,
      ptrMap: new Map<string, string>(),
      revPtrMap: new Map<string, string[]>(
        options.revPtrEntries ?? defaultRevPtrs
      ),
      notes: [],
    },
    containsBag: new Map<string, unknown[]>(),
    coverageIndex:
      options.coverage === undefined
        ? new Map<string, CoverageEntry>()
        : options.coverage,
  };
}

describe('Repair Engine — propertyNames ordering & preflight', () => {
  it('renames offenders in deterministic UTF-16 order', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      propertyNames: { enum: ['alpha', 'beta'] },
    } as const;
    const coverage = new Map<string, CoverageEntry>([
      [
        '',
        {
          has: (name: string) => name === 'alpha' || name === 'beta',
        },
      ],
      [
        '#',
        {
          has: (name: string) => name === 'alpha' || name === 'beta',
        },
      ],
    ]);
    const effective = createEffective(schema, { coverage });
    const input = { zebra: 1, apple: 2 };
    const out = repairItemsAjvDriven([input], { schema, effective }, {});
    const repaired = out.items[0] as Record<string, number>;
    expect(Object.keys(repaired).sort()).toEqual(['alpha', 'beta']);
    expect(repaired.alpha).toBe(2);
    expect(repaired.beta).toBe(1);
  });

  it('treats literal-alternation patterns as pseudo-enums', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      propertyNames: { pattern: '^(?:bar|foo)$' },
    } as const;
    const coverage = new Map<string, CoverageEntry>([
      [
        '',
        {
          has: (name: string) => name === 'bar' || name === 'foo',
        },
      ],
      [
        '#',
        {
          has: (name: string) => name === 'bar' || name === 'foo',
        },
      ],
    ]);
    const effective = createEffective(schema, { coverage });
    const out = repairItemsAjvDriven([{ baz: 7 }], { schema, effective }, {});
    const repaired = out.items[0] as Record<string, number>;
    expect(repaired.bar).toBe(7);
    const patternDiag = out.diagnostics.find(
      (diag) => diag.code === DIAGNOSTIC_CODES.REPAIR_PNAMES_PATTERN_ENUM
    );
    expect(patternDiag).toBeTruthy();
    expect((patternDiag?.details as any)?.to).toBe('bar');
  });

  it('rejects renames that would trigger dependentRequired violations', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      propertyNames: { enum: ['allowed'] },
      dependencies: { allowed: ['buddy'] },
    } as const;
    const coverage = new Map<string, CoverageEntry>([
      ['', { has: (name: string) => ['allowed', 'guard'].includes(name) }],
      ['#', { has: (name: string) => ['allowed', 'guard'].includes(name) }],
    ]);
    const effective = createEffective(schema, { coverage });
    const out = repairItemsAjvDriven([{ bad: 1 }], { schema, effective }, {});
    const diag = out.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.REPAIR_RENAME_PREFLIGHT_FAIL
    );
    expect((diag?.details as any)?.reason).toBe('dependent');
    const repaired = out.items[0] as Record<string, unknown>;
    expect(repaired).not.toHaveProperty('allowed');
    expect(repaired).not.toHaveProperty('bad');
  });

  it('rejects renames that would trigger dependentSchemas violations', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      propertyNames: { enum: ['allowed', 'guard'] },
      properties: {
        allowed: { type: 'number' },
        guard: { const: true },
      },
      dependentSchemas: {
        allowed: {
          properties: { guard: { const: true } },
          required: ['guard'],
        },
      },
    } as const;
    const coverage = new Map<string, CoverageEntry>([
      ['', { has: (name: string) => ['allowed', 'guard'].includes(name) }],
      ['#', { has: (name: string) => ['allowed', 'guard'].includes(name) }],
    ]);
    const effective = createEffective(schema, { coverage });
    const out = repairItemsAjvDriven([{ bad: 1 }], { schema, effective }, {});
    const diag = out.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.REPAIR_RENAME_PREFLIGHT_FAIL
    );
    expect((diag?.details as any)?.reason).toBe('dependent');
    const repaired = out.items[0] as Record<string, unknown>;
    expect(repaired).not.toHaveProperty('allowed');
    expect(repaired).not.toHaveProperty('bad');
  });

  it('preflight emits branch failure diagnostics when validator surfaces oneOf errors', () => {
    const validator = ((_: unknown) => {
      (validator as any).errors = [
        {
          keyword: 'oneOf',
          instancePath: '',
          schemaPath: '#/oneOf',
          params: {},
        },
      ];
      return false;
    }) as any;
    const outcome = runRenamePreflightCheck({
      validator,
      current: { bonus: 1 },
      objectPtr: '',
      from: 'bonus',
      candidate: 'slotB',
      canonPath: '/obj',
      baselineDependentKeys: new Set(),
    });
    expect(outcome.ok).toBe(false);
    expect((outcome.diagnostics?.[0]?.details as any)?.reason).toBe('branch');
  });

  it('preflight ignores baseline oneOf errors when unchanged', () => {
    const validator = ((_: unknown) => {
      (validator as any).errors = [
        {
          keyword: 'oneOf',
          instancePath: '',
          schemaPath: '#/oneOf',
          params: {},
        },
      ];
      return false;
    }) as any;
    const baselineKey = 'oneOf::::#/oneOf';
    const outcome = runRenamePreflightCheck({
      validator,
      current: { bonus: 1 },
      objectPtr: '',
      from: 'bonus',
      candidate: 'slotB',
      canonPath: '/obj',
      baselineDependentKeys: new Set(),
      baselineOneOfKeys: new Set([baselineKey]),
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.diagnostics).toBeUndefined();
  });

  it('distributes unique targets deterministically when offenders collide', () => {
    const schema = {
      type: 'object',
      propertyNames: { enum: ['slotA', 'slotB', 'slotC'] },
    } as const;
    const coverage = new Map<string, CoverageEntry>([
      [
        '',
        { has: (name: string) => ['slotA', 'slotB', 'slotC'].includes(name) },
      ],
      [
        '#',
        { has: (name: string) => ['slotA', 'slotB', 'slotC'].includes(name) },
      ],
    ]);
    const effective = createEffective(schema, { coverage });
    const out = repairItemsAjvDriven(
      [{ zebra: 1, alpha: 2, slotC: 3 }],
      { schema, effective },
      {}
    );
    const repaired = out.items[0] as Record<string, number>;
    expect(repaired).toMatchObject({ slotA: 2, slotB: 1, slotC: 3 });
    expect(repaired).not.toHaveProperty('alpha');
    expect(repaired).not.toHaveProperty('zebra');
  });

  it('does not treat non-anchored patterns as pseudo-enums', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      propertyNames: { pattern: '(?:foo|bar)' },
    } as const;
    const coverage = new Map<string, CoverageEntry>([
      ['', { has: () => true }],
      ['#', { has: () => true }],
    ]);
    const effective = createEffective(schema, { coverage });
    const out = repairItemsAjvDriven([{ baz: 1 }], { schema, effective }, {});
    const diag = out.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.REPAIR_PNAMES_PATTERN_ENUM
    );
    expect(diag).toBeUndefined();
    const repaired = out.items[0] as Record<string, unknown>;
    expect(repaired).not.toHaveProperty('baz');
  });

  it('requires must-cover predicate when AP:false is only in the canonical view', () => {
    const schema = {
      type: 'object',
      allOf: [{ additionalProperties: false }],
      propertyNames: { enum: ['foo'] },
    } as const;
    const canonicalSchema = { ...schema, additionalProperties: false };
    const effective = createEffective(schema, {
      canonicalSchema,
      coverage: null,
    });
    const out = repairItemsAjvDriven([{ other: 3 }], { schema, effective }, {});
    const diag = out.diagnostics.find(
      (d) => d.code === DIAGNOSTIC_CODES.MUSTCOVER_INDEX_MISSING
    );
    expect(diag).toBeTruthy();
    const repaired = out.items[0] as Record<string, unknown>;
    expect(repaired).not.toHaveProperty('foo');
  });
});
