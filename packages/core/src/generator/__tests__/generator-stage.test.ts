import { describe, expect, it } from 'vitest';

import { normalize } from '../../transform/schema-normalizer';
import { compose } from '../../transform/composition-engine';
import { generateFromCompose } from '../foundry-generator';

function composeSchema(schema: unknown): ReturnType<typeof compose> {
  const normalized = normalize(schema);
  return compose(normalized);
}

describe('Foundry generator stage', () => {
  it('honors minimal width policy and pattern witness selection', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { const: 1 },
      },
      patternProperties: {
        '^[ab]$': { type: 'string', minLength: 1 },
      },
      minProperties: 2,
    };

    const effective = composeSchema(schema);
    const output = generateFromCompose(effective, {
      planOptions: {
        patternWitness: {
          alphabet: 'ab',
          maxLength: 1,
          maxCandidates: 16,
        },
      },
    });

    expect(output.items).toHaveLength(1);
    const instance = output.items[0];
    expect(instance).toBeTypeOf('object');
    const record = instance as Record<string, unknown>;
    expect(record.id).toBe(1);
    expect(Object.keys(record)).toHaveLength(2);
    expect(record.a ?? record.b).toBeDefined();
    expect(output.metrics.patternWitnessTried ?? 0).toBeGreaterThan(0);
  });

  it('emits pattern witness caps when alphabet is empty', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { const: 1 },
      },
      patternProperties: {
        '^z$': { type: 'number' },
      },
      minProperties: 2,
    };

    const effective = composeSchema(schema);
    const output = generateFromCompose(effective, {
      planOptions: {
        patternWitness: {
          alphabet: '',
          maxLength: 1,
          maxCandidates: 4,
        },
      },
    });

    const cap = output.diagnostics.find(
      (diag) => diag.code === 'COMPLEXITY_CAP_PATTERNS'
    );
    expect(cap).toBeDefined();
    expect(cap?.details).toMatchObject({
      reason: 'witnessDomainExhausted',
    });
  });

  it('satisfies contains bag requirements and minimal length for arrays', () => {
    const schema = {
      type: 'array',
      minItems: 3,
      contains: { const: 5 },
      prefixItems: [{ const: 1 }],
    };

    const effective = composeSchema(schema);
    const output = generateFromCompose(effective);
    expect(output.items).toHaveLength(1);
    const array = output.items[0];
    expect(Array.isArray(array)).toBe(true);
    const values = array as unknown[];
    const occurrences = values.filter((value) => value === 5).length;
    expect(values.length).toBeGreaterThanOrEqual(3);
    expect(occurrences).toBeGreaterThanOrEqual(1);
  });

  it('respects enum/const precedence over type for primitives', () => {
    // string enum outranks type
    const sSchema = {
      type: 'string',
      enum: ['alpha', 'beta'],
      minLength: 1,
    };
    const sEff = composeSchema(sSchema);
    const sOut = generateFromCompose(sEff);
    expect(typeof sOut.items[0]).toBe('string');
    expect(sOut.items[0]).toBe('alpha');

    // number const outranks type
    const nSchema = { type: 'number', const: 3 };
    const nEff = composeSchema(nSchema);
    const nOut = generateFromCompose(nEff);
    expect(nOut.items[0]).toBe(3);

    // integer enum outranks type
    const iSchema = { type: 'integer', enum: [7, 9] };
    const iEff = composeSchema(iSchema);
    const iOut = generateFromCompose(iEff);
    expect(iOut.items[0]).toBe(7);
  });

  it('generates common string formats (uuid/email) with minimal validity', () => {
    const uuidSchema = { type: 'string', format: 'uuid' };
    const uuidOut = generateFromCompose(composeSchema(uuidSchema));
    const uuid = uuidOut.items[0] as string;
    expect(typeof uuid).toBe('string');
    expect(uuid).toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );

    const emailSchema = { type: 'string', format: 'email' };
    const emailOut = generateFromCompose(composeSchema(emailSchema));
    const email = emailOut.items[0] as string;
    expect(typeof email).toBe('string');
    expect(email.includes('@')).toBe(true);
  });

  it('applies minLength/maxLength bounds to formatted strings (trimming/padding)', () => {
    // Trim a uuid to 8 chars via maxLength
    const trimmedSchema = { type: 'string', format: 'uuid', maxLength: 8 };
    const trimmed = generateFromCompose(composeSchema(trimmedSchema))
      .items[0] as string;
    expect(typeof trimmed).toBe('string');
    expect(trimmed.length).toBeLessThanOrEqual(8);

    // Pad an email-like string to minLength via repeat
    const paddedSchema = { type: 'string', format: 'email', minLength: 10 };
    const padded = generateFromCompose(composeSchema(paddedSchema))
      .items[0] as string;
    expect(typeof padded).toBe('string');
    expect(padded.length).toBeGreaterThanOrEqual(10);
  });

  it('enforces uniqueItems and preserves minimal length with stable fillers', () => {
    const schema = {
      type: 'array',
      uniqueItems: true,
      minItems: 2,
      prefixItems: [{ const: 1 }, { const: 1 }],
      items: { const: 2 },
    };
    const eff = composeSchema(schema);
    const out = generateFromCompose(eff);
    const arr = out.items[0] as unknown[];
    expect(Array.isArray(arr)).toBe(true);
    // uniqueItems ⇒ no duplicate 1s
    const ones = arr.filter((v) => v === 1).length;
    expect(ones).toBeLessThanOrEqual(1);
    // minimal length respected (fillers may be used)
    expect(arr.length).toBeGreaterThanOrEqual(2);
  });

  it('leaves unsatisfiable uniqueItems domains without inventing sentinel fillers', () => {
    const schema = {
      type: 'array',
      uniqueItems: true,
      minItems: 2,
      prefixItems: [{ const: 1 }, { const: 1 }],
      items: { const: 1 },
    };
    const eff = composeSchema(schema);
    const out = generateFromCompose(eff);
    const arr = out.items[0] as unknown[];
    expect(Array.isArray(arr)).toBe(true);
    // Dedup leaves the only satisfiable candidate; generator defers unsat to downstream stages
    expect(arr).toEqual([1]);
  });

  it('handles anyOf by choosing the first branch deterministically', () => {
    const schema = {
      anyOf: [
        { type: 'string', const: 'x' },
        { type: 'number', const: 7 },
      ],
    };
    const out = generateFromCompose(composeSchema(schema));
    expect(out.items[0]).toBe('x');
  });

  it('merges allOf numeric constraints for simple types', () => {
    const schema = {
      allOf: [
        { type: 'integer', minimum: 1 },
        { minimum: 5, maximum: 5 },
      ],
    };
    const out = generateFromCompose(composeSchema(schema));
    expect(out.items[0]).toBe(5);
  });

  it('emits false as the stable boolean minimum when unconstrained', () => {
    const schema = { type: 'boolean' };
    const out = generateFromCompose(composeSchema(schema));
    expect(out.items[0]).toBe(false);
  });

  it('applies dependentRequired when trigger key is present', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: { a: { const: 1 }, b: { const: 2 } },
      required: ['a'],
      dependentRequired: { a: ['b'] },
    };
    const out = generateFromCompose(composeSchema(schema));
    const obj = out.items[0] as Record<string, unknown>;
    expect(obj.a).toBe(1);
    expect(obj.b).toBe(2);
  });

  it('aligns integer to multipleOf with exclusiveMinimum', () => {
    const schema = { type: 'integer', exclusiveMinimum: 2, multipleOf: 2 };
    const out = generateFromCompose(composeSchema(schema));
    expect(out.items[0]).toBe(4);
  });

  it('aligns number to multipleOf with exclusiveMinimum', () => {
    const schema = { type: 'number', exclusiveMinimum: 0.1, multipleOf: 0.2 };
    const out = generateFromCompose(composeSchema(schema));
    const n = out.items[0] as number;
    expect(n).toBeCloseTo(0.2, 6);
  });

  it('restricts names under unevaluatedProperties:false to evaluated sources', () => {
    const schema = {
      type: 'object',
      unevaluatedProperties: false,
      additionalProperties: false,
      required: ['id'],
      properties: { id: { const: 1 }, opt: { const: 2 } },
      minProperties: 2,
    };
    const out = generateFromCompose(composeSchema(schema));
    const obj = out.items[0] as Record<string, unknown>;
    expect(Object.keys(obj).sort()).toEqual(['id', 'opt']);
  });

  it('resolves additionalProperties schema when required key not in properties/patternProperties', () => {
    const schema = {
      type: 'object',
      additionalProperties: { const: 5 },
      required: ['x'],
    };
    const out = generateFromCompose(composeSchema(schema));
    const obj = out.items[0] as Record<string, unknown>;
    expect(obj.x).toBe(5);
  });
});
