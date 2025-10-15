import { describe, it, expect } from 'vitest';
/**
 * Sentinel tests documenting current MVP gaps against JSON Schema features
 * These are not failures of the system; they act as executable docs until
 * full support is implemented. Once implemented, flip expectations accordingly.
 */

import { ObjectGenerator } from '../object-generator';
import { ArrayGenerator } from '../array-generator';
import { StringGenerator } from '../string-generator';
import { FormatRegistry } from '../../../registry/format-registry';
import { createGeneratorContext } from '../../data-generator';
import '../../../../../../test/matchers/index';
import { normalize } from '../../../transform/schema-normalizer';
import { compose } from '../../../transform/composition-engine';
import { generateFromCompose } from '../../foundry-generator';
import { createAjv } from '../../../../../../test/helpers/ajv-factory';

function generateItems(schema: unknown, count = 5): unknown[] {
  const normalized = normalize(schema);
  const effective = compose(normalized);
  const output = generateFromCompose(effective, { count });
  return output.items;
}

describe('Sentinel Compliance (MVP gaps)', () => {
  const formatRegistry = new FormatRegistry();

  describe('Composition: allOf (supported via merge)', () => {
    it('merges numeric constraints and validates via AJV', () => {
      const schema = {
        allOf: [
          { type: 'number', minimum: 5 },
          { type: 'number', maximum: 10, multipleOf: 0.5 },
        ],
      } as const;
      // Use generator pipeline to handle composition
      const items = generateItems(schema as object);
      const ajv = createAjv('2020-12');
      const validate = ajv.compile(schema as object);
      for (const value of items) {
        expect(validate(value)).toBe(true);
      }
    });
  });

  describe('Composition: anyOf/oneOf/not (supported)', () => {
    it('anyOf: selects a deterministic branch, AJV validates', () => {
      const schema = {
        anyOf: [
          { type: 'string', minLength: 2 },
          { type: 'integer', minimum: 0 },
        ],
      } as const;
      const items = generateItems(schema as object);
      const ajv = createAjv('2020-12');
      const validate = ajv.compile(schema as object);
      for (const value of items) {
        expect(validate(value)).toBe(true);
      }
    });

    it('oneOf: selects a deterministic branch, AJV validates', () => {
      const schema = {
        oneOf: [
          { type: 'string', minLength: 2 },
          { type: 'integer', minimum: 0 },
        ],
      } as const;
      const items = generateItems(schema as object);
      const ajv = createAjv('2020-12');
      const validate = ajv.compile(schema as object);
      for (const value of items) {
        expect(validate(value)).toBe(true);
      }
    });

    it('not: generates values outside prohibited schema, AJV validates', () => {
      const schema = {
        not: { type: 'number' },
      } as const;
      const items = generateItems(schema as object);
      const ajv = createAjv('2020-12');
      const validate = ajv.compile(schema as object);
      for (const value of items) {
        expect(validate(value)).toBe(true);
      }
    });
  });

  describe('Conditionals: if/then/else', () => {
    it('ObjectGenerator: top-level if/then/else without type is not supported', () => {
      const generator = new ObjectGenerator();
      const schema = {
        if: { properties: { flag: { const: true } }, required: ['flag'] },
        then: { required: ['foo'] },
        else: { required: ['bar'] },
      } as const;
      expect(generator.supports(schema as any)).toBe(false);
    });
  });

  describe('References: $ref via $defs', () => {
    it('ObjectGenerator: does not resolve $ref yet (sentinel)', () => {
      const generator = new ObjectGenerator();
      const schema = {
        $id: 'http://example.test/s',
        type: 'object',
        properties: {
          user: { $ref: '#/$defs/user' },
        },
        required: ['user'],
        additionalProperties: false,
        $defs: {
          user: {
            type: 'object',
            properties: { id: { type: 'string', format: 'uuid' } },
            required: ['id'],
            additionalProperties: false,
          },
        },
      } as const;

      const ctx = createGeneratorContext(schema as any, formatRegistry, {
        seed: 42,
      });
      const res = generator.generate(schema as any, ctx);

      // Current behavior: generates an object with `user: null` (no $ref resolution)
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const value = res.unwrap();
        // Document the gap: AJV validation should fail until $ref is supported
        expect(value).not.toMatchJsonSchema(schema, '2020-12');
      }
    });
  });

  describe('References: $anchor / $dynamicRef', () => {
    it('ObjectGenerator: does not resolve $dynamicRef with $dynamicAnchor (2020-12)', () => {
      const generator = new ObjectGenerator();
      const schema = {
        $id: 'https://example.test/s',
        type: 'object',
        properties: {
          child: { $dynamicRef: '#node' },
        },
        required: ['child'],
        additionalProperties: false,
        $defs: {
          nodeType: {
            $dynamicAnchor: 'node',
            type: 'object',
            properties: { id: { type: 'string' } },
            required: ['id'],
            additionalProperties: false,
          },
        },
        // Bind the dynamic anchor into the current scope
        allOf: [{ $ref: '#/$defs/nodeType' }],
      } as const;

      const ctx = createGeneratorContext(schema as any, formatRegistry, {
        seed: 77,
      });
      const res = generator.generate(schema as any, ctx);

      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        // Expect failure until $dynamicRef resolution is implemented
        expect(res.unwrap()).not.toMatchJsonSchema(schema, '2020-12');
      }
    });
  });

  describe('Arrays: contains/minContains/maxContains (sentinel)', () => {
    it('ArrayGenerator: does not guarantee contains semantics yet (minContains)', () => {
      const generator = new ArrayGenerator();
      const schema = {
        type: 'array',
        items: { type: 'integer', minimum: 0, maximum: 5 },
        contains: { const: -999 }, // impossible with items constraints
        minContains: 1,
        minItems: 3,
      } as const;

      const ctx = createGeneratorContext(schema as any, formatRegistry, {
        seed: 7,
      });
      const res = generator.generate(schema as any, ctx);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        // AJV should fail because contains cannot be satisfied
        expect(res.value).not.toMatchJsonSchema(schema, '2020-12');
      }
    });

    it('ArrayGenerator: maxContains sentinel with items const', () => {
      const generator = new ArrayGenerator();
      const schema = {
        type: 'array',
        items: { const: 1 },
        contains: { const: 1 },
        // Set minContains=0 to make schema valid in strict mode with maxContains=0
        minContains: 0,
        maxContains: 0,
        minItems: 1,
      } as const;

      const ctx = createGeneratorContext(schema as any, formatRegistry, {
        seed: 8,
      });
      const res = generator.generate(schema as any, ctx);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).not.toMatchJsonSchema(schema, '2020-12');
      }
    });
  });

  describe('Objects: patternProperties-only with minProperties (supported)', () => {
    it('ObjectGenerator: synthesizes keys for patternProperties-only', () => {
      const generator = new ObjectGenerator();
      const schema = {
        type: 'object',
        propertyNames: { pattern: '^[a-z]{1,5}$' },
        patternProperties: {
          '^[a-z]+$': { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
        minProperties: 1,
      } as const;

      const ctx = createGeneratorContext(schema as any, formatRegistry, {
        seed: 9,
      });
      const res = generator.generate(schema as any, ctx);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.value).toMatchJsonSchema(schema, 'draft-07');
      }
    });
  });

  describe('Arrays: contains/minContains/maxContains (supported)', () => {
    it('ArrayGenerator: enforces contains and min/maxContains (2020-12)', () => {
      const generator = new ArrayGenerator();
      const schema = {
        type: 'array',
        items: { type: 'integer', minimum: 0, maximum: 10 },
        contains: { const: 3 },
        minContains: 1,
        maxContains: 2,
        minItems: 3,
        maxItems: 6,
      } as const;

      const ctx = createGeneratorContext(schema as any, formatRegistry, {
        seed: 7,
      });
      const res = generator.generate(schema as any, ctx);

      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const arr = res.unwrap();
        expect(arr).toMatchJsonSchema(schema, '2020-12');
      }
    });
  });

  describe('Draft-07 Tuple: items:[...] + additionalItems:false', () => {
    it('ArrayGenerator: returns Err for unsatisfiable tuple (minItems > tupleLen)', () => {
      const generator = new ArrayGenerator();
      const schema = {
        type: 'array',
        // Draft-07 tuple form
        items: [{ type: 'string' }, { type: 'number' }],
        additionalItems: false,
        minItems: 3,
        maxItems: 3,
      } as const;

      const ctx = createGeneratorContext(schema as any, formatRegistry, {
        seed: 123,
      });
      const res = generator.generate(schema as any, ctx);
      expect(res.isErr()).toBe(true);
    });

    it('ArrayGenerator: honors tuple length when additionalItems=false', () => {
      const generator = new ArrayGenerator();
      const schema = {
        type: 'array',
        items: [{ type: 'string' }, { type: 'number' }],
        additionalItems: false,
        minItems: 2,
        maxItems: 2,
      } as const;

      const ctx = createGeneratorContext(schema as any, formatRegistry, {
        seed: 456,
      });
      const res = generator.generate(schema as any, ctx);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        const arr = res.unwrap();
        expect(Array.isArray(arr)).toBe(true);
        expect(arr.length).toBe(2);
        expect(arr).toMatchJsonSchema(schema, 'draft-07');
      }
    });
  });

  describe('Objects: patternProperties/propertyNames (supported)', () => {
    it('ObjectGenerator: generates keys matching patternProperties and propertyNames', () => {
      const generator = new ObjectGenerator();
      const schema = {
        type: 'object',
        propertyNames: { pattern: '^[a-z]{1,5}$' },
        patternProperties: {
          '^[a-z]+$': { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
        minProperties: 1,
      } as const;

      const ctx = createGeneratorContext(schema as any, formatRegistry, {
        seed: 9,
      });
      const res = generator.generate(schema as any, ctx);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.unwrap()).toMatchJsonSchema(schema, '2020-12');
      }
    });
  });

  describe('Union types: type: ["string","null"]', () => {
    it('StringGenerator: union type not yet supported by supports()', () => {
      const generator = new StringGenerator();
      const schema = { type: ['string', 'null'] } as const;

      expect(generator.supports(schema as any)).toBe(false);
    });
  });

  describe('Objects: dependentSchemas (supported - phase 1)', () => {
    it('ObjectGenerator: applies dependentSchemas required/properties', () => {
      const generator = new ObjectGenerator();
      const schema = {
        type: 'object',
        properties: {
          credit_card: { type: 'number' },
          billing: {
            type: 'object',
            properties: { zip: { type: 'string', minLength: 5 } },
            required: ['zip'],
            additionalProperties: false,
          },
        },
        required: ['credit_card'],
        dependentSchemas: {
          credit_card: {
            properties: { billing: { $ref: '#/properties/billing' } },
            required: ['billing'],
          },
        },
        additionalProperties: false,
      } as const;

      const ctx = createGeneratorContext(schema as any, formatRegistry, {
        seed: 21,
      });
      const res = generator.generate(schema as any, ctx);
      expect(res.isOk()).toBe(true);
      if (res.isOk()) {
        expect(res.unwrap()).toMatchJsonSchema(schema, '2020-12');
      }
    });
  });

  describe('Strings: Unicode code point length', () => {
    it('validate() uses Unicode code points for minLength/maxLength', () => {
      const generator = new StringGenerator();
      const schema = { type: 'string', minLength: 1, maxLength: 1 } as const;

      const emoji = '😀'; // 1 code point, 2 UTF-16 code units
      // Now validate() aligns with AJV (code points)
      expect(generator.validate(emoji, schema as any)).toBe(true);
      expect(emoji).toMatchJsonSchema(schema, '2020-12');
    });
  });
});
