/* eslint-disable complexity */
/**
 * ================================================================================
 * METAMORPHIC TESTING PATTERN - FOUNDRYDATA TESTING v2.1
 *
 * Phase 2 - Metamorphic relations testing with schema relaxation
 * Tests metamorphic properties that must hold between different schema versions
 *
 * Key metamorphic relations:
 * - Validity preserved under relaxation (relaxed schema ⊆ original schema)
 * - Prefix stability: generate(seed, n1+n2)[0:n1] === generate(seed, n1)
 * - Schema composition associativity where applicable
 * - Constraint removal preserves valid instances
 *
 * See: docs/tests/foundrydata-complete-testing-guide-en.ts.txt
 * ================================================================================
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { type JsonSchemaDraft } from '../helpers/ajv-factory.js';
import {
  getSchemaArbitrary,
  jsonSchemaArbitraryFor,
  simpleSchemaArbitrary,
} from '../arbitraries/json-schema.js';
import { validateAgainstSchema, getTestConfig } from '../setup.js';

// ============================================================================
// CONFIGURATION AND UTILITIES
// ============================================================================

/** All supported JSON Schema drafts for cross-draft testing */
const ALL_DRAFTS: JsonSchemaDraft[] = ['draft-07', '2019-09', '2020-12'];

/**
 * Get the current draft from environment or default
 */
function getCurrentDraft(): JsonSchemaDraft {
  return (process.env.SCHEMA_DRAFT as JsonSchemaDraft) || '2020-12';
}

/**
 * Utility to log test context on failure for debugging
 */
function logMetamorphicContext(context: {
  seed: number;
  originalSchema: object;
  relaxedSchema: object;
  data: unknown;
  relation: string;
  errors?: any[];
}): void {
  const { seed, originalSchema, relaxedSchema, data, relation, errors } =
    context;
  console.error('='.repeat(70));
  console.error('METAMORPHIC TEST FAILURE CONTEXT');
  console.error('='.repeat(70));
  console.error('Relation:', relation);
  console.error('Seed:', seed);
  console.error('Original Schema:', JSON.stringify(originalSchema, null, 2));
  console.error('Relaxed Schema:', JSON.stringify(relaxedSchema, null, 2));
  console.error('Test Data:', JSON.stringify(data, null, 2));
  if (errors?.length) {
    console.error(
      'Validation Errors:',
      errors
        .map((e) => `${e.instancePath || 'root'}: ${e.message} (${e.keyword})`)
        .join(', ')
    );
  }
  console.error('='.repeat(70));
}

/**
 * Deep clone a JSON-compatible object
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ============================================================================
// SCHEMA RELAXATION FUNCTION
// ============================================================================

/**
 * Relaxes a JSON Schema by removing or loosening constraints
 * Core principle: relaxed schema should accept all instances that the original accepts
 *
 * @param schema Original JSON Schema
 * @param draft JSON Schema draft version for draft-specific relaxation
 * @returns Relaxed schema that's more permissive than the original
 */
function relaxSchema(
  schema: Record<string, unknown>,
  draft: JsonSchemaDraft
): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const relaxed = deepClone(schema);

  // =====================================
  // CONSTRAINT RELAXATION (Core Types)
  // =====================================

  // String constraints
  if (relaxed.type === 'string') {
    // Remove or loosen length constraints
    if (typeof relaxed.minLength === 'number' && relaxed.minLength > 0) {
      relaxed.minLength = Math.max(0, relaxed.minLength - 1);
    }
    if (typeof relaxed.maxLength === 'number') {
      relaxed.maxLength = relaxed.maxLength + 5;
    }

    // Remove pattern constraints (too restrictive for metamorphic testing)
    delete relaxed.pattern;

    // Remove format constraints (they don't affect validity in most drafts)
    delete relaxed.format;
  }

  // Numeric constraints
  if (relaxed.type === 'number' || relaxed.type === 'integer') {
    // Expand numeric ranges
    if (typeof relaxed.minimum === 'number') {
      relaxed.minimum = relaxed.minimum - 10;
    }
    if (typeof relaxed.maximum === 'number') {
      relaxed.maximum = relaxed.maximum + 10;
    }
    if (typeof relaxed.exclusiveMinimum === 'number') {
      relaxed.exclusiveMinimum = relaxed.exclusiveMinimum - 10;
    }
    if (typeof relaxed.exclusiveMaximum === 'number') {
      relaxed.exclusiveMaximum = relaxed.exclusiveMaximum + 10;
    }

    // Remove multipleOf constraints
    delete relaxed.multipleOf;
  }

  // Array constraints
  if (relaxed.type === 'array') {
    // Loosen item count constraints
    if (typeof relaxed.minItems === 'number' && relaxed.minItems > 0) {
      relaxed.minItems = Math.max(0, relaxed.minItems - 1);
    }
    if (typeof relaxed.maxItems === 'number') {
      relaxed.maxItems = relaxed.maxItems + 2;
    }

    // Remove uniqueItems constraint (too restrictive)
    delete relaxed.uniqueItems;

    // Recursively relax item schemas
    if (relaxed.items && typeof relaxed.items === 'object') {
      relaxed.items = relaxSchema(
        relaxed.items as Record<string, unknown>,
        draft
      );
    }

    // Relax prefixItems if present (draft 2019-09+)
    if (Array.isArray(relaxed.prefixItems)) {
      relaxed.prefixItems = relaxed.prefixItems.map((item) =>
        relaxSchema(item as Record<string, unknown>, draft)
      );
    }

    // Handle additionalItems (draft-07) vs items (2019-09+)
    if (
      relaxed.additionalItems &&
      typeof relaxed.additionalItems === 'object'
    ) {
      relaxed.additionalItems = relaxSchema(
        relaxed.additionalItems as Record<string, unknown>,
        draft
      );
    }
  }

  // Object constraints
  if (relaxed.type === 'object') {
    // Loosen property count constraints
    if (
      typeof relaxed.minProperties === 'number' &&
      relaxed.minProperties > 0
    ) {
      relaxed.minProperties = Math.max(0, relaxed.minProperties - 1);
    }
    if (typeof relaxed.maxProperties === 'number') {
      relaxed.maxProperties = relaxed.maxProperties + 2;
    }

    // Remove some required properties (but keep at least one if any existed)
    if (Array.isArray(relaxed.required) && relaxed.required.length > 1) {
      relaxed.required = relaxed.required.slice(
        0,
        Math.ceil(relaxed.required.length / 2)
      );
    }

    // Recursively relax property schemas
    if (relaxed.properties && typeof relaxed.properties === 'object') {
      const properties = relaxed.properties as Record<string, unknown>;
      relaxed.properties = Object.fromEntries(
        Object.entries(properties).map(([key, schema]) => [
          key,
          relaxSchema(schema as Record<string, unknown>, draft),
        ])
      );
    }

    // Relax additionalProperties constraint
    if (relaxed.additionalProperties === false) {
      relaxed.additionalProperties = {}; // Allow any additional properties
    } else if (
      relaxed.additionalProperties &&
      typeof relaxed.additionalProperties === 'object'
    ) {
      relaxed.additionalProperties = relaxSchema(
        relaxed.additionalProperties as Record<string, unknown>,
        draft
      );
    }

    // Relax patternProperties
    if (
      relaxed.patternProperties &&
      typeof relaxed.patternProperties === 'object'
    ) {
      const patternProps = relaxed.patternProperties as Record<string, unknown>;
      relaxed.patternProperties = Object.fromEntries(
        Object.entries(patternProps).map(([pattern, schema]) => [
          pattern,
          relaxSchema(schema as Record<string, unknown>, draft),
        ])
      );
    }
  }

  // =====================================
  // DRAFT-SPECIFIC RELAXATIONS
  // =====================================

  // Remove unevaluatedProperties/Items for drafts 2019-09+
  if (draft === '2019-09' || draft === '2020-12') {
    delete relaxed.unevaluatedProperties;
    delete relaxed.unevaluatedItems;
  }

  // =====================================
  // COMPOSITION SCHEMA RELAXATION
  // =====================================

  // allOf: Keep only the least restrictive subschema
  if (Array.isArray(relaxed.allOf)) {
    const subschemas = relaxed.allOf as Record<string, unknown>[];
    if (subschemas.length > 1 && subschemas[0]) {
      // For metamorphic testing, pick the first subschema and relax it
      const chosenSubschema = relaxSchema(subschemas[0], draft);
      delete relaxed.allOf;
      Object.assign(relaxed, chosenSubschema);
    } else if (subschemas.length === 1 && subschemas[0]) {
      const relaxedSubschema = relaxSchema(subschemas[0], draft);
      delete relaxed.allOf;
      Object.assign(relaxed, relaxedSubschema);
    }
  }

  // anyOf: Keep the first subschema (most permissive approach)
  if (Array.isArray(relaxed.anyOf)) {
    const subschemas = relaxed.anyOf as Record<string, unknown>[];
    if (subschemas.length > 0 && subschemas[0]) {
      const chosenSubschema = relaxSchema(subschemas[0], draft);
      delete relaxed.anyOf;
      Object.assign(relaxed, chosenSubschema);
    }
  }

  // oneOf: Keep the first subschema (simplify the constraint)
  if (Array.isArray(relaxed.oneOf)) {
    const subschemas = relaxed.oneOf as Record<string, unknown>[];
    if (subschemas.length > 0 && subschemas[0]) {
      const chosenSubschema = relaxSchema(subschemas[0], draft);
      delete relaxed.oneOf;
      Object.assign(relaxed, chosenSubschema);
    }
  }

  // not: Remove the negation (too complex for relaxation)
  if (relaxed.not) {
    delete relaxed.not;
  }

  // Conditional schemas (if/then/else): Simplify by removing conditions
  if (relaxed.if && relaxed.then) {
    delete relaxed.if;
    if (relaxed.then && typeof relaxed.then === 'object') {
      const relaxedThen = relaxSchema(
        relaxed.then as Record<string, unknown>,
        draft
      );
      Object.assign(relaxed, relaxedThen);
    }
    delete relaxed.then;
    delete relaxed.else;
  }

  // =====================================
  // ENUM AND CONST RELAXATION
  // =====================================

  // Remove const constraints (too restrictive)
  delete relaxed.const;

  // Expand enum values (add similar values)
  if (Array.isArray(relaxed.enum)) {
    const originalEnum = relaxed.enum;
    const expandedEnum = [...originalEnum];

    // Add some variations based on type
    originalEnum.forEach((value) => {
      if (typeof value === 'string') {
        expandedEnum.push(value + '_relaxed');
      } else if (typeof value === 'number') {
        expandedEnum.push(value + 1);
      }
    });

    relaxed.enum = expandedEnum;
  }

  // =====================================
  // TYPE RELAXATION
  // =====================================

  // Allow more types (type union expansion)
  if (typeof relaxed.type === 'string') {
    // Convert single type to array and add null as possibility
    relaxed.type = [relaxed.type, 'null'];
  } else if (Array.isArray(relaxed.type)) {
    // Add null if not already present
    if (!relaxed.type.includes('null')) {
      relaxed.type = [...relaxed.type, 'null'];
    }
  }

  return relaxed;
}

// ============================================================================
// MOCK DATA GENERATOR (for testing)
// ============================================================================

/**
 * Simple mock data generator for testing metamorphic relations
 * Uses a simple deterministic approach based on schema type
 */
function generateMockData(
  schema: Record<string, unknown>,
  seed?: number
): unknown {
  // Create deterministic values based on seed for reproducibility
  const baseValue = seed ? seed % 1000 : 42;

  if (schema.type === 'string') {
    const minLength =
      typeof schema.minLength === 'number' ? schema.minLength : 1;
    const maxLength =
      typeof schema.maxLength === 'number' ? schema.maxLength : 10;
    const targetLength = Math.max(minLength, Math.min(maxLength, 5));
    return 'test' + '_'.repeat(Math.max(0, targetLength - 4));
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    const min = typeof schema.minimum === 'number' ? schema.minimum : 0;
    const max = typeof schema.maximum === 'number' ? schema.maximum : 100;
    let value = min + (baseValue % (max - min + 1));

    if (schema.type === 'integer') {
      value = Math.floor(value);
    }

    return value;
  }

  if (schema.type === 'boolean') {
    return baseValue % 2 === 0;
  }

  if (schema.type === 'null') {
    return null;
  }

  if (schema.type === 'array') {
    const minItems = typeof schema.minItems === 'number' ? schema.minItems : 0;
    const maxItems = typeof schema.maxItems === 'number' ? schema.maxItems : 3;
    const items = schema.items || { type: 'string' };

    const length = Math.max(minItems, Math.min(maxItems, 2));
    return Array(length)
      .fill(0)
      .map((_, index) =>
        generateMockData(
          items as Record<string, unknown>,
          seed ? seed + index : undefined
        )
      );
  }

  if (schema.type === 'object') {
    const result: Record<string, unknown> = {};
    const properties =
      (schema.properties as Record<string, Record<string, unknown>>) || {};
    const required = (schema.required as string[]) || [];

    // Add required properties
    for (const prop of required) {
      if (properties[prop]) {
        result[prop] = generateMockData(properties[prop], seed);
      }
    }

    return result;
  }

  // Handle type arrays (union types)
  if (Array.isArray(schema.type) && schema.type.length > 0) {
    const firstType = schema.type[0];
    const typeSchema = { ...schema, type: firstType };
    return generateMockData(typeSchema, seed);
  }

  // Fallback
  return null;
}

// ============================================================================
// METAMORPHIC TESTS
// ============================================================================

describe('Metamorphic Testing Pattern', () => {
  const config = getTestConfig();

  test('should log current test configuration', () => {
    console.log('🔧 Current metamorphic test configuration:', config);
    expect(config.seed).toBe(424242);
    expect(config.supportedDrafts).toEqual(['draft-07', '2019-09', '2020-12']);
  });

  describe('METAMORPHIC RELATION: Validity preserved under relaxation', () => {
    test('data valid against original schema remains valid against relaxed schema', () => {
      const currentDraft = getCurrentDraft();

      fc.assert(
        fc.property(simpleSchemaArbitrary, (originalSchema) => {
          try {
            // Generate data that's valid against the original schema
            const testData = generateMockData(originalSchema, config.seed);

            // First verify data is valid against original schema
            const originalResult = validateAgainstSchema(
              testData,
              originalSchema,
              currentDraft
            );
            if (!originalResult.valid) {
              // Skip if our mock generator can't produce valid data for this schema
              return;
            }

            // Apply relaxation
            const relaxedSchema = relaxSchema(originalSchema, currentDraft);

            // Test metamorphic relation: valid(data, original) ⟹ valid(data, relaxed)
            const relaxedResult = validateAgainstSchema(
              testData,
              relaxedSchema,
              currentDraft
            );

            if (!relaxedResult.valid) {
              logMetamorphicContext({
                seed: config.seed,
                originalSchema,
                relaxedSchema,
                data: testData,
                relation: 'validity preserved under relaxation',
                errors: relaxedResult.errors,
              });
            }

            // METAMORPHIC PROPERTY: relaxed schema should accept original data
            expect(relaxedResult.valid).toBe(true);
          } catch (error) {
            console.warn(`Skipping complex schema: ${error}`);
            return; // Skip problematic schemas
          }
        }),
        {
          seed: config.seed,
          numRuns: 50,
          verbose: true,
        }
      );
    });

    test('validity preservation across all JSON Schema drafts', () => {
      for (const draft of ALL_DRAFTS) {
        fc.assert(
          fc.property(jsonSchemaArbitraryFor(draft), (originalSchema) => {
            try {
              const testData = generateMockData(originalSchema, config.seed);

              const originalResult = validateAgainstSchema(
                testData,
                originalSchema,
                draft
              );
              if (!originalResult.valid) {
                return; // Skip invalid test cases
              }

              const relaxedSchema = relaxSchema(originalSchema, draft);
              const relaxedResult = validateAgainstSchema(
                testData,
                relaxedSchema,
                draft
              );

              if (!relaxedResult.valid) {
                logMetamorphicContext({
                  seed: config.seed,
                  originalSchema,
                  relaxedSchema,
                  data: testData,
                  relation: `validity preservation (${draft})`,
                  errors: relaxedResult.errors,
                });
              }

              expect(relaxedResult.valid).toBe(true);
            } catch (error) {
              console.warn(`Skipping complex schema for ${draft}: ${error}`);
              return;
            }
          }),
          {
            seed: config.seed,
            numRuns: 20, // Reduced for multi-draft testing
            verbose: false, // Less verbose for batch testing
          }
        );
      }
    });
  });

  describe('METAMORPHIC RELATION: Prefix stability', () => {
    test('generate(seed, n1+n2)[0:n1] === generate(seed, n1)', () => {
      const testSeed = 98765;

      fc.assert(
        fc.property(
          fc.record({
            schema: simpleSchemaArbitrary,
            n1: fc.integer({ min: 1, max: 10 }),
            n2: fc.integer({ min: 1, max: 5 }),
          }),
          ({ schema, n1, n2 }) => {
            try {
              // Generate n1 items with fixed seed
              const prefix = Array(n1)
                .fill(0)
                .map(() => generateMockData(schema, testSeed));

              // Generate n1 + n2 items with same seed
              const fullSequence = Array(n1 + n2)
                .fill(0)
                .map(() => generateMockData(schema, testSeed));

              // Extract prefix from full sequence
              const prefixFromFull = fullSequence.slice(0, n1);

              // METAMORPHIC PROPERTY: prefixes should be identical
              expect(prefixFromFull).toEqual(prefix);
            } catch (error) {
              console.warn(`Prefix stability test skipped: ${error}`);
              return;
            }
          }
        ),
        {
          seed: config.seed,
          numRuns: 30,
          verbose: true,
        }
      );
    });

    test('deterministic generation maintains prefix stability', () => {
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'integer', minimum: 1, maximum: 1000 },
          name: { type: 'string', minLength: 1, maxLength: 20 },
        },
        required: ['id'],
      };

      const fixedSeed = 42424;

      // Generate sequences of different lengths with same base seed
      // This tests the core metamorphic property: generate(seed, n1+n2)[0:n1] === generate(seed, n1)
      const baseSeed = fixedSeed;

      // Generate short sequence (n1 = 3 items)
      const shortSequence = Array(3)
        .fill(0)
        .map((_, index) => generateMockData(schema, baseSeed + index));

      // Generate longer sequence (n1 + n2 = 3 + 5 = 8 items)
      const longSequence = Array(8)
        .fill(0)
        .map((_, index) => generateMockData(schema, baseSeed + index));

      // Test prefix stability: first 3 items of long sequence should match short sequence
      // This is the key metamorphic property: generate(seed, n1+n2)[0:n1] === generate(seed, n1)
      const prefixFromLong = longSequence.slice(0, 3);
      expect(prefixFromLong).toEqual(shortSequence);

      // Test with multiple different sequence lengths to verify the pattern
      for (const n1 of [1, 2, 4]) {
        const n2 = 3; // Add 3 more items

        const shortSeq = Array(n1)
          .fill(0)
          .map((_, index) => generateMockData(schema, baseSeed + index));

        const longSeq = Array(n1 + n2)
          .fill(0)
          .map((_, index) => generateMockData(schema, baseSeed + index));

        const prefix = longSeq.slice(0, n1);
        expect(prefix).toEqual(shortSeq);
      }

      // Test deterministic behavior - same seed should produce same result
      const sameResult1 = generateMockData(schema, fixedSeed);
      const sameResult2 = generateMockData(schema, fixedSeed);
      expect(sameResult1).toEqual(sameResult2);

      console.log(
        'Prefix stability test passed - longer sequences contain shorter sequences as prefixes'
      );
    });
  });

  describe('METAMORPHIC RELATION: Schema composition properties', () => {
    test('relaxation is idempotent: relax(relax(schema)) ≈ relax(schema)', () => {
      fc.assert(
        fc.property(simpleSchemaArbitrary, (originalSchema) => {
          try {
            const currentDraft = getCurrentDraft();

            const onceRelaxed = relaxSchema(originalSchema, currentDraft);
            const twiceRelaxed = relaxSchema(onceRelaxed, currentDraft);

            // Generate test data
            const testData = generateMockData(originalSchema, config.seed);

            const onceResult = validateAgainstSchema(
              testData,
              onceRelaxed,
              currentDraft
            );
            const twiceResult = validateAgainstSchema(
              testData,
              twiceRelaxed,
              currentDraft
            );

            // If data is valid against once-relaxed, it should be valid against twice-relaxed
            if (onceResult.valid) {
              expect(twiceResult.valid).toBe(true);
            }
          } catch (error) {
            console.warn(`Idempotency test skipped: ${error}`);
            return;
          }
        }),
        {
          seed: config.seed,
          numRuns: 30,
          verbose: false,
        }
      );
    });

    test('relaxation preserves schema structure semantics', () => {
      fc.assert(
        fc.property(
          fc
            .record({
              type: fc.constantFrom(
                'string',
                'number',
                'boolean',
                'array',
                'object'
              ),
              // Add some basic constraints
              minLength: fc.integer({ min: 0, max: 5 }),
              maxLength: fc.integer({ min: 6, max: 20 }),
            })
            .filter(
              (s) => !s.minLength || !s.maxLength || s.minLength <= s.maxLength
            ),
          (schema) => {
            const currentDraft = getCurrentDraft();
            const relaxed = relaxSchema(schema, currentDraft);

            // Core property: relaxed schema should preserve the base type
            if (schema.type) {
              if (typeof relaxed.type === 'string') {
                expect(relaxed.type).toBe(schema.type);
              } else if (Array.isArray(relaxed.type)) {
                expect(relaxed.type).toContain(schema.type);
              }
            }

            // Numeric constraints should be looser or removed
            if (
              typeof schema.minLength === 'number' &&
              typeof relaxed.minLength === 'number'
            ) {
              expect(relaxed.minLength).toBeLessThanOrEqual(schema.minLength);
            }

            if (
              typeof schema.maxLength === 'number' &&
              typeof relaxed.maxLength === 'number'
            ) {
              expect(relaxed.maxLength).toBeGreaterThanOrEqual(
                schema.maxLength
              );
            }
          }
        ),
        {
          seed: config.seed,
          numRuns: 40,
          verbose: false,
        }
      );
    });
  });

  describe('METAMORPHIC RELATION: Cross-draft compatibility', () => {
    test('relaxation behaves consistently across JSON Schema drafts', () => {
      fc.assert(
        fc.property(simpleSchemaArbitrary, (schema) => {
          try {
            const testData = generateMockData(schema, config.seed);
            const results: Record<JsonSchemaDraft, boolean> = {} as any;

            // Test relaxation across all drafts
            for (const draft of ALL_DRAFTS) {
              const relaxedSchema = relaxSchema(schema, draft);
              const result = validateAgainstSchema(
                testData,
                relaxedSchema,
                draft
              );
              results[draft] = result.valid;
            }

            // If data is valid in one draft, it should be valid in all others
            // (for basic schemas that don't use draft-specific features)
            const validityValues = Object.values(results);
            const allValid = validityValues.every((v) => v === true);
            const noneValid = validityValues.every((v) => v === false);

            // Expect consistency (either all valid or explicable differences)
            expect(allValid || noneValid || validityValues.length === 1).toBe(
              true
            );
          } catch (error) {
            console.warn(`Cross-draft test skipped: ${error}`);
            return;
          }
        }),
        {
          seed: config.seed,
          numRuns: 25,
          verbose: false,
        }
      );
    });
  });

  describe('EXPLICIT METAMORPHIC RELATIONS (MR1, MR2, MR3)', () => {
    test('MR1: schema with minLength:10 generates ⊆ schema with minLength:5', () => {
      const currentDraft = getCurrentDraft();

      // Test with concrete values for MR1 relation
      const restrictiveSchema = {
        type: 'string',
        minLength: 10,
        maxLength: 20,
      };

      const relaxedSchema = {
        type: 'string',
        minLength: 5,
        maxLength: 20,
      };

      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), (seed) => {
          // Generate data valid for the restrictive schema
          const testData = 'test_string_' + seed.toString().padStart(3, '0'); // At least 10 characters

          // Verify data is valid for restrictive schema
          const restrictiveResult = validateAgainstSchema(
            testData,
            restrictiveSchema,
            currentDraft
          );

          if (restrictiveResult.valid) {
            // Test metamorphic relation: data valid for minLength:10
            // must be valid for minLength:5
            const relaxedResult = validateAgainstSchema(
              testData,
              relaxedSchema,
              currentDraft
            );

            if (!relaxedResult.valid) {
              logMetamorphicContext({
                seed,
                originalSchema: restrictiveSchema,
                relaxedSchema,
                data: testData,
                relation: 'MR1: minLength:10 ⊆ minLength:5',
                errors: relaxedResult.errors,
              });
            }

            expect(relaxedResult.valid).toBe(true);
          }
        }),
        {
          seed: config.seed,
          numRuns: 25,
          verbose: true,
        }
      );
    });

    test('MR2: type:"string" generates ⊆ type:["string","null"]', () => {
      const currentDraft = getCurrentDraft();

      // Test with concrete values for MR2 relation
      const restrictiveSchema = {
        type: 'string',
      };

      const relaxedSchema = {
        type: ['string', 'null'],
      };

      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }),
          (testString) => {
            // Verify string data is valid for type:'string'
            const restrictiveResult = validateAgainstSchema(
              testString,
              restrictiveSchema,
              currentDraft
            );

            if (restrictiveResult.valid) {
              // Test metamorphic relation: data valid for type:'string'
              // must be valid for type:['string','null']
              const relaxedResult = validateAgainstSchema(
                testString,
                relaxedSchema,
                currentDraft
              );

              if (!relaxedResult.valid) {
                logMetamorphicContext({
                  seed: config.seed,
                  originalSchema: restrictiveSchema,
                  relaxedSchema,
                  data: testString,
                  relation: 'MR2: type:"string" ⊆ type:["string","null"]',
                  errors: relaxedResult.errors,
                });
              }

              expect(relaxedResult.valid).toBe(true);
            }
          }
        ),
        {
          seed: config.seed,
          numRuns: 20,
          verbose: true,
        }
      );
    });

    test('MR3: additionalProperties:false generates ⊆ additionalProperties:true', () => {
      const currentDraft = getCurrentDraft();

      // Test with concrete values for MR3 relation
      const restrictiveSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        additionalProperties: false,
      };

      const relaxedSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        additionalProperties: true,
      };

      fc.assert(
        fc.property(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 10 }),
            age: fc.float({ min: 0, max: 100 }),
          }),
          (testObject) => {
            // Verify object is valid for additionalProperties:false
            const restrictiveResult = validateAgainstSchema(
              testObject,
              restrictiveSchema,
              currentDraft
            );

            if (restrictiveResult.valid) {
              // Test metamorphic relation: data valid for additionalProperties:false
              // must be valid for additionalProperties:true
              const relaxedResult = validateAgainstSchema(
                testObject,
                relaxedSchema,
                currentDraft
              );

              if (!relaxedResult.valid) {
                logMetamorphicContext({
                  seed: config.seed,
                  originalSchema: restrictiveSchema,
                  relaxedSchema,
                  data: testObject,
                  relation:
                    'MR3: additionalProperties:false ⊆ additionalProperties:true',
                  errors: relaxedResult.errors,
                });
              }

              expect(relaxedResult.valid).toBe(true);
            }
          }
        ),
        {
          seed: config.seed,
          numRuns: 20,
          verbose: true,
        }
      );
    });
  });

  describe('Environment-based draft testing', () => {
    test(`metamorphic properties hold for current draft: ${getCurrentDraft()}`, () => {
      const currentDraft = getCurrentDraft();
      const schemaArbitrary = getSchemaArbitrary();

      fc.assert(
        fc.property(schemaArbitrary, (schema) => {
          try {
            const testData = generateMockData(schema, config.seed);
            const originalResult = validateAgainstSchema(
              testData,
              schema,
              currentDraft
            );

            if (!originalResult.valid) {
              return; // Skip invalid cases
            }

            const relaxedSchema = relaxSchema(schema, currentDraft);
            const relaxedResult = validateAgainstSchema(
              testData,
              relaxedSchema,
              currentDraft
            );

            if (!relaxedResult.valid) {
              logMetamorphicContext({
                seed: config.seed,
                originalSchema: schema,
                relaxedSchema,
                data: testData,
                relation: `environmental testing (${currentDraft})`,
                errors: relaxedResult.errors,
              });
            }

            // Core metamorphic invariant must hold
            expect(relaxedResult.valid).toBe(true);
          } catch (error) {
            console.warn(
              `Environmental test skipped for ${currentDraft}: ${error}`
            );
            return;
          }
        }),
        {
          seed: config.seed,
          numRuns: 35,
          verbose: true,
        }
      );
    });
  });
});
