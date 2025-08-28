/**
 * ================================================================================
 * CUSTOM MATCHERS TESTS - FOUNDRYDATA TESTING v2.1
 *
 * Comprehensive test suite for all custom Vitest matchers.
 * Uses property-based testing with fast-check for robustness.
 *
 * See: docs/tests/foundrydata-complete-testing-guide-en.ts.txt
 * ================================================================================
 */

import { describe, test, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import '../index'; // Import to register matchers
import { getAjv, createAjv } from '../../helpers/ajv-factory';
import type { AnySchema } from 'ajv';

// ================================================================================
// TEST SETUP
// ================================================================================

beforeAll(() => {
  // Ensure matchers are loaded and AJV is initialized
  const ajv = getAjv();
  expect(ajv).toBeDefined();
});

// ================================================================================
// HELPER FUNCTIONS
// ================================================================================

// Mock generator function for determinism testing
/**
 * Deterministic PRNG using Linear Congruential Generator (Park-Miller)
 * Replaces unreliable Math.sin() approach with proper pseudo-random generation
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    // Ensure positive seed within valid range
    this.seed = Math.abs(seed) % 0x7fffffff || 1;
  }

  next(): number {
    // Linear Congruential Generator (Park-Miller implementation)
    this.seed = (this.seed * 16807) % 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

function mockGenerator(schema: AnySchema, seed: number): unknown {
  const rng = new SeededRandom(seed);

  if (typeof schema === 'object' && schema !== null && 'type' in schema) {
    switch (schema.type) {
      case 'string':
        return `test-${rng.nextInt(0, 9999)}`;
      case 'number':
        return rng.nextInt(0, 100);
      case 'boolean':
        return rng.next() > 0.5;
      case 'array':
        return [1, 2, 3]; // Fixed array for consistency
      default:
        return { id: rng.nextInt(0, 9999) };
    }
  }

  return { id: rng.nextInt(0, 9999) };
}

// ================================================================================
// TOMATCHJSONSCHEMA MATCHER TESTS
// ================================================================================

describe('toMatchJsonSchema', () => {
  test('should validate data against JSON schema', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number', minimum: 0 },
      },
      required: ['name'],
    };

    const validData = { name: 'Alice', age: 30 };
    const invalidData = { age: -5 }; // missing required name, invalid age

    expect(validData).toMatchJsonSchema(schema);
    expect(invalidData).not.toMatchJsonSchema(schema);
  });

  test('should handle different schema drafts', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'string',
      format: 'uuid',
    };

    const validUUID = '550e8400-e29b-41d4-a716-446655440000';
    const invalidUUID = 'not-a-uuid';

    expect(validUUID).toMatchJsonSchema(schema, '2020-12');
    expect(invalidUUID).not.toMatchJsonSchema(schema, '2020-12');
  });

  test('should provide detailed error messages', () => {
    const schema = {
      type: 'object',
      properties: {
        count: { type: 'integer', minimum: 1 },
      },
      required: ['count'],
    };

    const invalidData = { count: -1 };

    try {
      expect(invalidData).toMatchJsonSchema(schema);
    } catch (error) {
      expect((error as Error).message).toContain('count');
      expect((error as Error).message).toContain('>=');
    }
  });

  test('property-based: any valid JSON should validate against permissive schema', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (data) => {
        const permissiveSchema = {}; // Empty schema accepts anything
        expect(data).toMatchJsonSchema(permissiveSchema);
      }),
      { numRuns: 50 } // Reduced for performance
    );
  });

  test('should use different AJV instances for different drafts', () => {
    // Create AJV instances for different drafts
    const ajvDraft07 = createAjv('draft-07');
    const ajv201909 = createAjv('2019-09');
    const ajv202012 = createAjv('2020-12');
    const ajvDefault = getAjv();

    // Verify they are different instances
    expect(ajvDraft07).not.toBe(ajv201909);
    expect(ajv201909).not.toBe(ajv202012);
    expect(ajvDraft07).not.toBe(ajv202012);

    // The default singleton should be different from the new created instances
    expect(ajvDefault).not.toBe(ajvDraft07);
    expect(ajvDefault).not.toBe(ajv201909);
    expect(ajvDefault).not.toBe(ajv202012);
  });

  test('should use draft-specific AJV instance when draft parameter is provided', () => {
    const schema = {
      type: 'string',
      format: 'uuid',
    };
    const validUUID = '550e8400-e29b-41d4-a716-446655440000';

    // Test that the matcher works with different drafts
    expect(validUUID).toMatchJsonSchema(schema, 'draft-07');
    expect(validUUID).toMatchJsonSchema(schema, '2019-09');
    expect(validUUID).toMatchJsonSchema(schema, '2020-12');

    // Test that it falls back to default AJV when no draft is specified
    expect(validUUID).toMatchJsonSchema(schema);
  });

  test('should throw error for invalid schemas', () => {
    const validData = { name: 'Alice' };

    // Test null schema
    expect(() => expect(validData).toMatchJsonSchema(null as any)).toThrow(
      'Invalid schema provided to toMatchJsonSchema: expected object, got object'
    );

    // Test undefined schema
    expect(() => expect(validData).toMatchJsonSchema(undefined as any)).toThrow(
      'Invalid schema provided to toMatchJsonSchema: expected object, got undefined'
    );

    // Test primitive schema
    expect(() =>
      expect(validData).toMatchJsonSchema('not-a-schema' as any)
    ).toThrow(
      'Invalid schema provided to toMatchJsonSchema: expected object, got string'
    );

    // Test number schema
    expect(() => expect(validData).toMatchJsonSchema(42 as any)).toThrow(
      'Invalid schema provided to toMatchJsonSchema: expected object, got number'
    );

    // Test array schema
    expect(() =>
      expect(validData).toMatchJsonSchema(['not', 'a', 'schema'] as any)
    ).toThrow(
      'Invalid schema provided to toMatchJsonSchema: schema cannot be an array'
    );

    // Test malformed schema that AJV can't compile
    expect(() =>
      expect(validData).toMatchJsonSchema({ type: 'invalid-type' } as any)
    ).toThrow('Invalid schema provided to toMatchJsonSchema:');
  });
});

// ================================================================================
// TOBEWITHINRANGE MATCHER TESTS
// ================================================================================

describe('toBeWithinRange', () => {
  test('should validate numbers within range', () => {
    expect(5).toBeWithinRange(1, 10);
    expect(1).toBeWithinRange(1, 10); // inclusive
    expect(10).toBeWithinRange(1, 10); // inclusive
    expect(0).not.toBeWithinRange(1, 10);
    expect(11).not.toBeWithinRange(1, 10);
  });

  test('should reject non-numbers', () => {
    expect('5').not.toBeWithinRange(1, 10);
    expect(null).not.toBeWithinRange(1, 10);
    expect(undefined).not.toBeWithinRange(1, 10);
    expect(NaN).not.toBeWithinRange(1, 10);
  });

  test('should handle edge cases', () => {
    expect(0).toBeWithinRange(0, 0); // zero range
    expect(-5).toBeWithinRange(-10, -1); // negative range
    expect(Number.MAX_SAFE_INTEGER).toBeWithinRange(
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER
    );
  });

  test('property-based: generated numbers should be within expected bounds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
        (a, b) => {
          const min = Math.min(a, b);
          const max = Math.max(a, b);
          const value = min + Math.random() * (max - min);

          expect(value).toBeWithinRange(min, max);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ================================================================================
// TOHAVECOMPLIANCE MATCHER TESTS
// ================================================================================

describe('toHaveCompliance', () => {
  test('should validate compliance scores', () => {
    expect(95).toHaveCompliance(90);
    expect(90).toHaveCompliance(90); // exact match
    expect(85).not.toHaveCompliance(90);
    expect(100).toHaveCompliance(99);
  });

  test('should reject invalid compliance scores', () => {
    expect(-1).not.toHaveCompliance(90);
    expect(101).not.toHaveCompliance(90);
    expect('95%').not.toHaveCompliance(90);
    expect(null).not.toHaveCompliance(90);
  });

  test('property-based: valid compliance scores should pass when above threshold', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        (score, threshold) => {
          if (score >= threshold) {
            expect(score).toHaveCompliance(threshold);
          } else {
            expect(score).not.toHaveCompliance(threshold);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ================================================================================
// VALIDATION MATCHERS TESTS
// ================================================================================

describe('toBeValidUUID', () => {
  test('should validate UUID v4 format', () => {
    const validUUIDs = [
      '550e8400-e29b-41d4-a716-446655440000',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    ];

    validUUIDs.forEach((uuid) => {
      expect(uuid).toBeValidUUID();
    });
  });

  test('should reject invalid UUIDs', () => {
    const invalidUUIDs = [
      'not-a-uuid',
      '550e8400-e29b-41d4-a716', // too short
      '550e8400-e29b-41d4-a716-446655440000-extra', // too long
      '550e8400-e29b-41d4-a716-44665544000g', // invalid character
      123456789, // not a string
      null,
      undefined,
    ];

    invalidUUIDs.forEach((uuid) => {
      expect(uuid).not.toBeValidUUID();
    });
  });
});

describe('toBeValidEmail', () => {
  test('should validate email addresses', () => {
    const validEmails = [
      'test@example.com',
      'user.name@domain.co.uk',
      'user+tag@example.org',
      'a@b.co',
    ];

    validEmails.forEach((email) => {
      expect(email).toBeValidEmail();
    });
  });

  test('should reject invalid emails', () => {
    const invalidEmails = [
      'not-an-email',
      '@example.com', // missing user part
      'user@', // missing domain
      'user@domain', // missing TLD
      'user space@domain.com', // space in user part
      123456789, // not a string
      null,
      undefined,
    ];

    invalidEmails.forEach((email) => {
      expect(email).not.toBeValidEmail();
    });
  });
});

describe('toBeValidISO8601', () => {
  test('should validate ISO8601 datetime formats', () => {
    const validDates = [
      '2023-12-25T10:30:00Z',
      '2023-12-25T10:30:00.123Z',
      '2023-12-25T10:30:00+02:00',
      '2023-12-25T10:30:00-05:00',
    ];

    validDates.forEach((date) => {
      expect(date).toBeValidISO8601();
    });
  });

  test('should reject invalid ISO8601 formats', () => {
    const invalidDates = [
      '2023-12-25', // date only
      '10:30:00', // time only
      '2023/12/25 10:30:00', // wrong separators
      '2023-12-25T10:30:00', // missing timezone
      'not-a-date',
      123456789, // not a string
      null,
      undefined,
    ];

    invalidDates.forEach((date) => {
      expect(date).not.toBeValidISO8601();
    });
  });
});

// ================================================================================
// TOBEDISTINCT MATCHER TESTS
// ================================================================================

describe('toBeDistinct', () => {
  test('should validate distinct primitive arrays', () => {
    expect([1, 2, 3]).toBeDistinct();
    expect(['a', 'b', 'c']).toBeDistinct();
    expect([true, false]).toBeDistinct();

    expect([1, 2, 2]).not.toBeDistinct();
    expect(['a', 'b', 'a']).not.toBeDistinct();
    expect([1, '1']).toBeDistinct(); // different types are distinct
  });

  test('should handle deep equality for objects', () => {
    const arr1 = [{ a: 1 }, { b: 2 }];
    const arr2 = [{ a: 1 }, { a: 1 }]; // duplicate objects

    expect(arr1).toBeDistinct(true);
    expect(arr2).not.toBeDistinct(true);
  });

  test('should handle circular references without stack overflow', () => {
    // Create objects with circular references
    const obj1: { a: number; self?: unknown } = { a: 1 };
    obj1.self = obj1;

    const obj2: { a: number; self?: unknown } = { a: 1 };
    obj2.self = obj2;

    const obj3: { b: number; self?: unknown } = { b: 2 };
    obj3.self = obj3;

    // Array with circular objects should not crash
    const arr1 = [obj1, obj3];
    const arr2 = [obj1, obj1]; // duplicate circular objects

    expect(() => {
      expect(arr1).toBeDistinct(true);
    }).not.toThrow();

    expect(() => {
      expect(arr2).not.toBeDistinct(true);
    }).not.toThrow();
  });

  test('should handle nested circular references', () => {
    // Create more complex circular structures
    const parent: { name: string; child?: unknown } = { name: 'parent' };
    const child: { name: string; parent?: unknown } = { name: 'child' };
    parent.child = child;
    child.parent = parent;

    const parent2: { name: string; child?: unknown } = { name: 'parent2' }; // Different name for distinctness
    const child2: { name: string; parent?: unknown } = { name: 'child2' }; // Different name for distinctness
    parent2.child = child2;
    child2.parent = parent2;

    const arr = [parent, parent2];

    // Should handle nested circular references without crashing
    expect(() => {
      expect(arr).toBeDistinct(true);
    }).not.toThrow();

    // The assertion should pass because the objects are actually distinct (different names)
    expect(arr).toBeDistinct(true);
  });

  test('should detect identical circular references as duplicates', () => {
    // Create identical circular structures
    const createCircular = (
      name: string
    ): { name: string; child?: unknown } => {
      const parent: { name: string; child?: unknown } = { name };
      const child: { name: string; parent?: unknown } = { name: 'child' };
      parent.child = child;
      child.parent = parent;
      return parent;
    };

    const obj1 = createCircular('parent');
    const obj2 = createCircular('parent'); // Same structure, should be considered duplicate

    const arr = [obj1, obj2];

    // Should handle circular references without crashing
    expect(() => {
      expect(arr).not.toBeDistinct(true);
    }).not.toThrow();

    // The assertion should pass - these should be detected as duplicates
    expect(arr).not.toBeDistinct(true);
  });

  test('should properly handle objects without deep=true', () => {
    const obj1 = { a: 1 };
    const obj2 = { a: 1 }; // Same structure
    const obj3 = { b: 2 }; // Different structure

    // Without deep=true, objects with same content should be detected as duplicates
    expect([obj1, obj2]).not.toBeDistinct();
    expect([obj1, obj2]).not.toBeDistinct(false);

    // Objects with different content should be distinct
    expect([obj1, obj3]).toBeDistinct();
    expect([obj1, obj3]).toBeDistinct(false);
  });

  test('should handle mixed primitives and objects without deep=true', () => {
    const obj1 = { value: 1 };
    const obj2 = { value: 1 }; // Same structure as obj1
    const obj3 = { value: 2 }; // Different structure

    const mixedArray = [1, '1', obj1, obj2, obj3];

    // Primitives 1 and '1' are different types so distinct
    // obj1 and obj2 have same structure so duplicates
    // obj3 is different so distinct
    expect(mixedArray).not.toBeDistinct(); // Should detect obj1/obj2 as duplicates
  });

  test('should differentiate between objects and primitives in non-deep mode', () => {
    // Array with various types
    const arr = [
      1, // number
      '1', // string - different from number 1
      true, // boolean
      null, // null
      undefined, // undefined
      { a: 1 }, // object
      { a: 1 }, // same object content - should be duplicate
      [1, 2], // array
      [1, 2], // same array content - should be duplicate
    ];

    // Should detect object and array duplicates
    expect(arr).not.toBeDistinct();

    // Different primitive types should be distinct
    expect([1, '1', true, null, undefined]).toBeDistinct();
  });

  test('should reject non-arrays', () => {
    expect('not-array').not.toBeDistinct();
    expect(123).not.toBeDistinct();
    expect({ length: 3 }).not.toBeDistinct();
    expect(null).not.toBeDistinct();
  });

  test('property-based: arrays with unique elements should be distinct', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 0, maxLength: 20 }),
        (arr) => {
          const uniqueArr = [...new Set(arr)];
          expect(uniqueArr).toBeDistinct();

          // If array has duplicates, it should not be distinct
          if (arr.length !== uniqueArr.length) {
            expect(arr).not.toBeDistinct();
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ================================================================================
// TOHAVEERRORRATE MATCHER TESTS
// ================================================================================

describe('toHaveErrorRate', () => {
  test('should validate error rates within tolerance', () => {
    expect(0.1).toHaveErrorRate(0.1, 0.05); // exact match
    expect(0.12).toHaveErrorRate(0.1, 0.05); // within tolerance
    expect(0.08).toHaveErrorRate(0.1, 0.05); // within tolerance
    expect(0.16).not.toHaveErrorRate(0.1, 0.05); // outside tolerance
    expect(0.04).not.toHaveErrorRate(0.1, 0.05); // outside tolerance
  });

  test('should use default tolerance', () => {
    expect(0.12).toHaveErrorRate(0.1); // default 0.05 tolerance
    expect(0.16).not.toHaveErrorRate(0.1); // outside default tolerance
  });

  test('should reject invalid error rates', () => {
    expect(-0.1).not.toHaveErrorRate(0.1);
    expect(1.1).not.toHaveErrorRate(0.1);
    expect('0.1').not.toHaveErrorRate(0.1);
    expect(null).not.toHaveErrorRate(0.1);
    expect({ errors: 10, total: 100 }).not.toHaveErrorRate(0.1); // object should use toHaveErrorStats
  });

  test('property-based: valid error rates should pass within tolerance', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: 0.5, noNaN: true }), // tolerance
        (rate, tolerance) => {
          const testRate = rate + (Math.random() - 0.5) * tolerance; // within tolerance
          const clampedRate = Math.max(0, Math.min(1, testRate));

          if (Math.abs(clampedRate - rate) <= tolerance) {
            expect(clampedRate).toHaveErrorRate(rate, tolerance);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ================================================================================
// TOHAVEERRORSTATS MATCHER TESTS
// ================================================================================

describe('toHaveErrorStats', () => {
  test('should validate error statistics within tolerance', () => {
    expect({ errors: 10, total: 100 }).toHaveErrorStats(0.1, 0.05); // exact match
    expect({ errors: 12, total: 100 }).toHaveErrorStats(0.1, 0.05); // within tolerance
    expect({ errors: 8, total: 100 }).toHaveErrorStats(0.1, 0.05); // within tolerance
    expect({ errors: 16, total: 100 }).not.toHaveErrorStats(0.1, 0.05); // outside tolerance
    expect({ errors: 4, total: 100 }).not.toHaveErrorStats(0.1, 0.05); // outside tolerance
  });

  test('should use default tolerance', () => {
    expect({ errors: 12, total: 100 }).toHaveErrorStats(0.1); // default 0.05 tolerance
    expect({ errors: 16, total: 100 }).not.toHaveErrorStats(0.1); // outside default tolerance
  });

  test('should reject invalid error stats objects', () => {
    expect({ errors: '10', total: 100 }).not.toHaveErrorStats(0.1);
    expect({ errors: 10, total: '100' }).not.toHaveErrorStats(0.1);
    expect({ errors: 10, total: 0 }).not.toHaveErrorStats(0.1);
    expect({ errors: 10 }).not.toHaveErrorStats(0.1);
    expect({ total: 100 }).not.toHaveErrorStats(0.1);
    expect('not-an-object').not.toHaveErrorStats(0.1);
    expect(null).not.toHaveErrorStats(0.1);
    expect(0.1).not.toHaveErrorStats(0.1); // number should use toHaveErrorRate
  });

  test('should calculate error rate correctly', () => {
    expect({ errors: 5, total: 50 }).toHaveErrorStats(0.1); // 5/50 = 0.1
    expect({ errors: 1, total: 10 }).toHaveErrorStats(0.1); // 1/10 = 0.1
    expect({ errors: 25, total: 250 }).toHaveErrorStats(0.1); // 25/250 = 0.1
    expect({ errors: 0, total: 100 }).toHaveErrorStats(0); // 0/100 = 0
  });

  test('property-based: valid error stats should pass within tolerance', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }), // total
        fc.float({ min: 0, max: 1, noNaN: true }), // expected rate
        fc.float({ min: 0, max: 0.5, noNaN: true }), // tolerance
        (total, expectedRate, tolerance) => {
          const errors = Math.floor(total * expectedRate);
          const actualRate = errors / total;

          if (Math.abs(actualRate - expectedRate) <= tolerance) {
            expect({ errors, total }).toHaveErrorStats(expectedRate, tolerance);
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ================================================================================
// TOBEGENERATEDWITHSEED MATCHER TESTS
// ================================================================================

describe('toBeGeneratedWithSeed', () => {
  test('should validate deterministic generation', () => {
    const schema = { type: 'string' };
    const seed = 12345;

    const generated = mockGenerator(schema, seed);

    expect(generated).toBeGeneratedWithSeed({
      seed,
      schema,
      generate: mockGenerator,
    });
  });

  test('should detect non-deterministic generation', () => {
    const schema = { type: 'string' };
    const seed = 12345;

    // Non-deterministic generator
    const randomGenerator = (): string => Math.random().toString();

    const generated = randomGenerator();

    expect(generated).not.toBeGeneratedWithSeed({
      seed,
      schema,
      generate: randomGenerator,
    });
  });

  test('should handle generation errors', () => {
    const schema = { type: 'string' };
    const seed = 12345;

    const errorGenerator = (): never => {
      throw new Error('Generation failed');
    };

    const data = 'some-data';

    expect(data).not.toBeGeneratedWithSeed({
      seed,
      schema,
      generate: errorGenerator,
    });
  });

  test('should validate different data types', () => {
    const testCases = [
      { schema: { type: 'string' }, seed: 1 },
      { schema: { type: 'number' }, seed: 2 },
      { schema: { type: 'boolean' }, seed: 3 },
      { schema: { type: 'array' }, seed: 4 },
      { schema: { type: 'object' }, seed: 5 },
    ];

    testCases.forEach(({ schema, seed }) => {
      const generated = mockGenerator(schema, seed);
      expect(generated).toBeGeneratedWithSeed({
        seed,
        schema,
        generate: mockGenerator,
      });
    });
  });
});

// ================================================================================
// INTEGRATION TESTS
// ================================================================================

describe('Matchers Integration', () => {
  test('should work together in complex scenarios', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string', format: 'email' },
        score: { type: 'number', minimum: 0, maximum: 100 },
        tags: {
          type: 'array',
          items: { type: 'string' },
          uniqueItems: true,
        },
      },
      required: ['id', 'email', 'score'],
    };

    const validData = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'user@example.com',
      score: 85,
      tags: ['premium', 'verified'],
    };

    // Test multiple matchers on the same data
    expect(validData).toMatchJsonSchema(schema);
    expect(validData.id).toBeValidUUID();
    expect(validData.email).toBeValidEmail();
    expect(validData.score).toBeWithinRange(0, 100);
    expect(validData.score).toHaveCompliance(80);
    expect(validData.tags).toBeDistinct();
  });

  test('should handle edge cases consistently', () => {
    // Empty values
    expect([]).toBeDistinct();
    expect(0).toBeWithinRange(0, 100);
    expect(100).toHaveCompliance(100);

    // Boundary conditions
    expect(Number.MIN_SAFE_INTEGER).toBeWithinRange(Number.MIN_SAFE_INTEGER, 0);
    expect(Number.MAX_SAFE_INTEGER).toBeWithinRange(0, Number.MAX_SAFE_INTEGER);
  });
});
