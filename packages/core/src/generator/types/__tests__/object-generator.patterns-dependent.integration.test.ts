import { describe, it, expect } from 'vitest';
import '../../../../../../test/matchers/index';
import { ObjectGenerator } from '../object-generator';
import { createGeneratorContext } from '../../data-generator';
import { FormatRegistry } from '../../../registry/format-registry';

describe('ObjectGenerator – patternProperties/propertyNames (Phase 2) + dependentSchemas interactions', () => {
  const formatRegistry = new FormatRegistry();

  it('generates keys for multiple patternProperties with overlapping patterns and respects propertyNames', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      // Names: 1–5 chars, start lower-case, may include digits
      propertyNames: { pattern: '^[a-z][a-z0-9]{0,4}$' },
      // Two overlapping patterns: any lower-case key → integer; keys starting with id → string
      patternProperties: {
        '^[a-z]+$': { type: 'integer', minimum: 0 },
        '^id[a-z0-9]*$': { type: 'string', minLength: 1 },
      },
      additionalProperties: false,
      minProperties: 3,
    } as const;

    const gen = new ObjectGenerator();
    const ctx = createGeneratorContext(schema as any, formatRegistry, {
      seed: 424242,
    });
    const res = gen.generate(schema as any, ctx);
    expect(res.isOk()).toBe(true);
    if (!res.isOk()) return;
    const obj = res.value as Record<string, unknown>;
    // Validate via AJV (matcher)
    expect(obj).toMatchJsonSchema(schema, 'draft-07');

    // Spot checks: at least 3 props and all keys satisfy propertyNames
    expect(Object.keys(obj).length).toBeGreaterThanOrEqual(3);
    for (const k of Object.keys(obj)) {
      expect(k).toMatch(/^[a-z][a-z0-9]{0,4}$/);
    }
  });

  it('applies dependentSchemas: adds pattern-based keys with strict propertyNames and forbids additional properties', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        credit_card: { type: 'number' },
      },
      required: ['credit_card'],
      // When credit_card is present, we require at least one extra property matching the dependent patterns
      dependentSchemas: {
        credit_card: {
          // Mark credit_card as evaluated within this scope to satisfy unevaluatedProperties:false
          properties: { credit_card: true },
          // Allow base key 'credit_card' plus dependent keys of 1–3 lowercase letters
          propertyNames: { pattern: '^(credit_card|[a-z]{1,3})$' },
          // Any lower-case key is allowed and must be a non-empty string
          patternProperties: {
            '^[a-z]+$': { type: 'string', minLength: 1 },
          },
          // Forbid unevaluated properties across applicators while preserving evaluated ones (credit_card)
          unevaluatedProperties: false,
        },
      },
      // Force at least one dependent key in addition to credit_card
      minProperties: 2,
    } as const;

    const gen = new ObjectGenerator();
    const ctx = createGeneratorContext(schema as any, formatRegistry, {
      seed: 7,
    });
    const res = gen.generate(schema as any, ctx);
    expect(res.isOk()).toBe(true);
    if (!res.isOk()) return;
    const obj = res.value as Record<string, unknown>;
    // Should validate against 2020-12
    expect(obj).toMatchJsonSchema(schema, '2020-12');
    // Ensure dependent key(s) exist and follow propertyNames
    const keys = Object.keys(obj).filter((k) => k !== 'credit_card');
    expect(keys.length).toBeGreaterThanOrEqual(1);
    for (const k of keys) {
      expect(k).toMatch(/^[a-z]{1,3}$/);
      expect(typeof obj[k]).toBe('string');
      expect((obj[k] as string).length).toBeGreaterThan(0);
    }
  });
});
