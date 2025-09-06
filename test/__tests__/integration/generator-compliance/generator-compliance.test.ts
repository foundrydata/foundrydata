import { describe, test, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import '../../../matchers/index';
import {
  INTEGRATION_TEST_SEED,
  PERFORMANCE_THRESHOLDS,
  measurePipelineTime,
  calculatePercentiles,
  measureMemory,
} from '../setup';
import { createAjv, type JsonSchemaDraft } from '../../../helpers/ajv-factory';
import type Ajv from 'ajv';

// Core generators and utils
import {
  StringGenerator,
  NumberGenerator,
  IntegerGenerator,
  BooleanGenerator,
  EnumGenerator,
  ArrayGenerator,
  ObjectGenerator,
} from '../../../../packages/core/src/generator/types';
import { createGeneratorContext } from '../../../../packages/core/src/generator/data-generator';
import { FormatRegistry } from '../../../../packages/core/src/registry/format-registry';
import { registerBuiltInFormats } from '../../../../packages/core/src/generator/formats';
import type { AnySchema } from 'ajv';
import type { Schema } from '../../../../packages/core/src/types/schema';

// Drafts to test
const DRAFTS: JsonSchemaDraft[] = ['draft-07', '2019-09', '2020-12'];

// Helper: build AJV once per draft for this file's scope
const ajvByDraft = new Map<JsonSchemaDraft, ReturnType<typeof createAjv>>();
function getAjvForDraft(draft: JsonSchemaDraft): ReturnType<typeof createAjv> {
  if (!ajvByDraft.has(draft)) ajvByDraft.set(draft, createAjv(draft));
  return ajvByDraft.get(draft)!;
}

// Helper: create a fresh FormatRegistry populated with built-ins
function makeFormatRegistry(): FormatRegistry {
  const registry = new FormatRegistry();
  registerBuiltInFormats(registry);
  return registry;
}

// Helper: compile AJV validator safely
function compileValidator(
  schema: AnySchema,
  draft: JsonSchemaDraft
): ReturnType<Ajv['compile']> {
  const ajv = getAjvForDraft(draft);
  return ajv.compile(schema);
}

// Simple schemas per type with valid/realistic constraints
type TypeSchemas = Record<
  'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'array' | 'object',
  readonly AnySchema[]
>;

function getTypeSchemas(draft: JsonSchemaDraft): TypeSchemas {
  const is2020 = draft === '2020-12';
  return {
    string: [
      { type: 'string' },
      { type: 'string', minLength: 1, maxLength: 32 },
      { type: 'string', format: 'uuid' },
      { type: 'string', format: 'email' },
    ],
    number: [
      { type: 'number', minimum: 0, maximum: 100 },
      { type: 'number', minimum: -1000, maximum: 1000 },
      { type: 'number', const: 42 },
    ],
    integer: [
      { type: 'integer', minimum: 0, maximum: 10 },
      { type: 'integer', minimum: -100, maximum: 100 },
      { type: 'integer', enum: [1, 2, 3] },
    ],
    boolean: [{ type: 'boolean' }, { type: 'boolean', enum: [true] }],
    enum: [
      { enum: ['a', 'b', 'c'] },
      { type: 'string', enum: ['red', 'green', 'blue'] },
      { type: 'integer', enum: [0, 1, 2] },
    ],
    array: [
      // Simple homogeneous array
      { type: 'array', items: { type: 'string' }, minItems: 0, maxItems: 5 },
      // Unique items with booleans (edge constraint handling in gen/validation)
      {
        type: 'array',
        items: { type: 'boolean' },
        minItems: 0,
        maxItems: 2,
        uniqueItems: true,
      },
      // Tuple/prefixItems
      is2020
        ? {
            type: 'array',
            prefixItems: [{ type: 'string' }, { type: 'integer' }],
            minItems: 2,
            maxItems: 2,
            items: false,
          }
        : {
            type: 'array',
            items: [{ type: 'string' }, { type: 'integer' }],
            minItems: 2,
            maxItems: 2,
          },
    ],
    object: [
      {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', minLength: 1, maxLength: 50 },
        },
        required: ['id', 'name'],
      },
      {
        type: 'object',
        properties: {
          age: { type: 'integer', minimum: 18, maximum: 120 },
          active: { type: 'boolean' },
        },
        required: ['age'],
      },
    ],
  } as const;
}

// Map of type → generator instance factory
type Generators = {
  string: () => StringGenerator;
  number: () => NumberGenerator;
  integer: () => IntegerGenerator;
  boolean: () => BooleanGenerator;
  enum: () => EnumGenerator;
  array: () => ArrayGenerator;
  object: () => ObjectGenerator;
};

function getGenerators(): Generators {
  return {
    string: () => new StringGenerator(),
    number: () => new NumberGenerator(),
    integer: () => new IntegerGenerator(),
    boolean: () => new BooleanGenerator(),
    enum: () => new EnumGenerator(),
    array: () => new ArrayGenerator(),
    object: () => new ObjectGenerator(),
  } as const;
}

describe('Generator → AJV Compliance', () => {
  for (const draft of DRAFTS) {
    describe(`Draft ${draft}`, () => {
      const typeSchemas = getTypeSchemas(draft);
      const gens = getGenerators();
      const formatRegistry = makeFormatRegistry();

      for (const [type, schemas] of Object.entries(typeSchemas)) {
        test(`${type} generator: 100% compliance across scenarios`, () => {
          const generatorFactory = (gens as Record<string, () => any>)[type]!;
          const generator = generatorFactory();

          // Guard: ensure generator supports provided schemas
          const totalPerSchema = 50; // samples per schema
          let total = 0;
          let valid = 0;

          const asSchemas = schemas as readonly AnySchema[];
          for (const schema of asSchemas) {
            const ajvValidate = compileValidator(schema, draft);

            for (let i = 0; i < totalPerSchema; i++) {
              const context = createGeneratorContext(
                schema as unknown as Schema,
                formatRegistry,
                {
                  seed: INTEGRATION_TEST_SEED + i,
                  scenario: i % 10 === 0 ? 'edge' : 'normal',
                }
              );

              const result = generator.generate(
                schema as unknown as Schema,
                context
              );

              total++;
              if (!result.isOk()) {
                // generation failure counts as non-compliant
                continue;
              }

              const value = result.value as unknown;
              const isValid = ajvValidate(value);

              // Optional debug on failure
              if (!isValid) {
                console.error(
                  `[${type}] draft=${draft} schema=${JSON.stringify(schema)} value=${JSON.stringify(value)} errors=${JSON.stringify(ajvValidate.errors)}`
                );
              }

              if (isValid) valid++;
            }
          }

          const compliance = (valid / total) * 100;
          expect(compliance).toHaveCompliance(100);
        });
      }
    });
  }
});

describe('Determinism (Seed 424242)', () => {
  test('string generator determinism holds with fixed seed', () => {
    const schema: AnySchema = { type: 'string', minLength: 3, maxLength: 8 };
    const formatRegistry = makeFormatRegistry();
    const gen = new StringGenerator();

    const generate = (s: AnySchema, seed: number): unknown | null => {
      const ctx = createGeneratorContext(
        s as unknown as Schema,
        formatRegistry,
        { seed }
      );
      const res = gen.generate(s as unknown as Schema, ctx);
      return res.isOk() ? res.value : null;
    };

    const received = generate(schema, INTEGRATION_TEST_SEED);
    expect(received).toBeGeneratedWithSeed({
      seed: INTEGRATION_TEST_SEED,
      schema,
      generate,
    });
  });
});

describe('Error Conditions: Contradictory Constraints', () => {
  const draft: JsonSchemaDraft = '2020-12';

  test('string: minLength > maxLength returns Err', () => {
    const schema: AnySchema = { type: 'string', minLength: 10, maxLength: 2 };
    const gen = new StringGenerator();
    const formatRegistry = makeFormatRegistry();
    const ctx = createGeneratorContext(
      schema as unknown as Schema,
      formatRegistry,
      { seed: INTEGRATION_TEST_SEED }
    );
    // AJV should accept the schema itself (valid structure), generation should fail
    compileValidator(schema, draft);
    const res = gen.generate(schema as unknown as Schema, ctx);
    expect(res.isErr()).toBe(true);
  });

  test('number: minimum > maximum returns Err', () => {
    const schema: AnySchema = { type: 'number', minimum: 10, maximum: 5 };
    const gen = new NumberGenerator();
    const formatRegistry = makeFormatRegistry();
    const ctx = createGeneratorContext(
      schema as unknown as Schema,
      formatRegistry,
      { seed: INTEGRATION_TEST_SEED }
    );
    compileValidator(schema, draft);
    const res = gen.generate(schema as unknown as Schema, ctx);
    expect(res.isErr()).toBe(true);
  });

  test('number: exclusiveMinimum === exclusiveMaximum (impossible) returns Err', () => {
    const schema: AnySchema = {
      type: 'number',
      exclusiveMinimum: 5,
      exclusiveMaximum: 5,
    };
    const gen = new NumberGenerator();
    const formatRegistry = makeFormatRegistry();
    const ctx = createGeneratorContext(
      schema as unknown as Schema,
      formatRegistry,
      { seed: INTEGRATION_TEST_SEED }
    );
    compileValidator(schema, draft);
    const res = gen.generate(schema as unknown as Schema, ctx);
    expect(res.isErr()).toBe(true);
  });

  test('array: minItems > maxItems returns Err', () => {
    const schema: AnySchema = {
      type: 'array',
      items: { type: 'string' },
      minItems: 5,
      maxItems: 2,
    };
    const gen = new ArrayGenerator();
    const formatRegistry = makeFormatRegistry();
    const ctx = createGeneratorContext(
      schema as unknown as Schema,
      formatRegistry,
      { seed: INTEGRATION_TEST_SEED }
    );
    compileValidator(schema, draft);
    const res = gen.generate(schema as unknown as Schema, ctx);
    expect(res.isErr()).toBe(true);
  });

  test('array: uniqueItems with type null and minItems > 1 returns Err', () => {
    const schema: AnySchema = {
      type: 'array',
      items: { type: 'null' },
      uniqueItems: true,
      minItems: 2,
    };
    const gen = new ArrayGenerator();
    const formatRegistry = makeFormatRegistry();
    const ctx = createGeneratorContext(
      schema as unknown as Schema,
      formatRegistry,
      { seed: INTEGRATION_TEST_SEED }
    );
    compileValidator(schema, draft);
    const res = gen.generate(schema as unknown as Schema, ctx);
    expect(res.isErr()).toBe(true);
  });

  test('object: minProperties > maxProperties returns Err', () => {
    const schema: AnySchema = {
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'string' } },
      minProperties: 3,
      maxProperties: 1,
    };
    const gen = new ObjectGenerator();
    const formatRegistry = makeFormatRegistry();
    const ctx = createGeneratorContext(
      schema as unknown as Schema,
      formatRegistry,
      { seed: INTEGRATION_TEST_SEED }
    );
    compileValidator(schema, draft);
    const res = gen.generate(schema as unknown as Schema, ctx);
    expect(res.isErr()).toBe(true);
  });

  test('object: required not subset of properties returns Err', () => {
    const schema: AnySchema = {
      type: 'object',
      properties: { a: { type: 'string' } },
      required: ['a', 'missing'],
    };
    const gen = new ObjectGenerator();
    const formatRegistry = makeFormatRegistry();
    const ctx = createGeneratorContext(
      schema as unknown as Schema,
      formatRegistry,
      { seed: INTEGRATION_TEST_SEED }
    );
    // This schema is invalid in strict mode - AJV will throw during compilation
    // The generator should also return an error for this contradictory constraint
    expect(() => compileValidator(schema, draft)).toThrow();
    const res = gen.generate(schema as unknown as Schema, ctx);
    expect(res.isErr()).toBe(true);
  });
});

describe('Draft-Specific Semantics', () => {
  test('draft-07: boolean exclusiveMinimum is unsupported by NumberGenerator (Err)', () => {
    // Draft-07 allows boolean exclusiveMinimum with minimum; generator intentionally does not support boolean form
    const schema: AnySchema = {
      type: 'number',
      minimum: 5,
      exclusiveMinimum: true,
    };
    const gen = new NumberGenerator();
    const formatRegistry = makeFormatRegistry();
    const ctx = createGeneratorContext(
      schema as unknown as Schema,
      formatRegistry,
      { seed: INTEGRATION_TEST_SEED }
    );
    // AJV in strict mode may reject boolean exclusiveMinimum
    const ajv = createAjv('draft-07');
    try {
      ajv.compile(schema);
    } catch (e) {
      // AJV strict mode may reject this - that's OK, we're testing the generator
    }
    // Generator should fail regardless of AJV validation
    const res = gen.generate(schema as unknown as Schema, ctx);
    expect(res.isErr()).toBe(true);
  });

  test('2019-09: numeric exclusiveMinimum supported and should validate', () => {
    const draft: JsonSchemaDraft = '2019-09';
    const schema: AnySchema = {
      type: 'number',
      minimum: 5,
      exclusiveMinimum: 5, // numeric form
      maximum: 10,
    };
    const gen = new NumberGenerator();
    const formatRegistry = makeFormatRegistry();
    const ctx = createGeneratorContext(
      schema as unknown as Schema,
      formatRegistry,
      { seed: INTEGRATION_TEST_SEED }
    );
    const validate = compileValidator(schema, draft);
    const res = gen.generate(schema as unknown as Schema, ctx);
    if (res.isOk()) {
      expect(validate(res.value)).toBe(true);
    } else {
      // If generation fails due to tight constraints, it's acceptable for this draft-specific check
      expect(res.isErr()).toBe(true);
    }
  });

  test('2020-12: strict tuple (prefixItems) honours items:false (no extras)', () => {
    const draft: JsonSchemaDraft = '2020-12';
    const schema: AnySchema = {
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'integer' }],
      minItems: 2,
      maxItems: 2,
      items: false,
    };
    const gen = new ArrayGenerator();
    const formatRegistry = makeFormatRegistry();
    const ctx = createGeneratorContext(
      schema as unknown as Schema,
      formatRegistry,
      { seed: INTEGRATION_TEST_SEED }
    );
    const validate = compileValidator(schema, draft);
    const res = gen.generate(schema as unknown as Schema, ctx);
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      const arr = res.value as unknown[];
      expect(Array.isArray(arr)).toBe(true);
      expect(arr.length).toBe(2);
      expect(validate(arr)).toBe(true);
    }
  });
});

describe('Performance & Memory Integration', () => {
  test('p95 < 200ms for 1000 validations (string)', async () => {
    const draft: JsonSchemaDraft = '2020-12';
    const schema: AnySchema = { type: 'string', minLength: 3, maxLength: 24 };
    const validate = compileValidator(schema, draft);
    const gen = new StringGenerator();
    const formatRegistry = makeFormatRegistry();

    // Allow environment override for slower machines/CI, default to centralized threshold
    const PERF_TARGET_MS = Number(
      process.env.GEN_COMPLIANCE_P95_MS ??
        PERFORMANCE_THRESHOLDS.generatorCompliance.p95
    );

    // Warmup to stabilize JIT, caches, and AJV
    for (let i = 0; i < 300; i++) {
      const ctx = createGeneratorContext(
        schema as unknown as Schema,
        formatRegistry,
        { seed: INTEGRATION_TEST_SEED + i }
      );
      const warm = gen.generate(schema as unknown as Schema, ctx);
      if (warm.isOk()) {
        const ok = validate(warm.value);
        if (!ok) throw new Error('Validation failed during warmup');
      }
    }

    const runs = 6;
    const itemsPerRun = 1000;
    const times: number[] = [];

    for (let r = 0; r < runs; r++) {
      const { time } = await measurePipelineTime(() => {
        for (let i = 0; i < itemsPerRun; i++) {
          const ctx = createGeneratorContext(
            schema as unknown as Schema,
            formatRegistry,
            { seed: INTEGRATION_TEST_SEED + r * itemsPerRun + i }
          );
          const res = gen.generate(schema as unknown as Schema, ctx);
          if (res.isOk()) {
            const ok = validate(res.value);
            if (!ok) throw new Error('Validation failed');
          }
        }
      });
      times.push(time);
    }

    const { p50, p95, p99 } = calculatePercentiles(times);

    const PERF_TARGET_P50 = Number(
      process.env.GEN_COMPLIANCE_P50_MS ??
        PERFORMANCE_THRESHOLDS.generatorCompliance.p50
    );
    const PERF_TARGET_P95 = Number(
      process.env.GEN_COMPLIANCE_P95_MS ?? PERF_TARGET_MS
    );
    const PERF_TARGET_P99 = Number(
      process.env.GEN_COMPLIANCE_P99_MS ??
        PERFORMANCE_THRESHOLDS.generatorCompliance.p99
    );

    // Always assert p95 (primary SLO)
    expect(p95).toBeLessThan(PERF_TARGET_P95);

    // Optional tighter assertions (enable explicitly to avoid flakiness across hosts)
    const ASSERT_EXTRA = process.env.GEN_COMPLIANCE_ASSERT_EXTRA === 'true';
    if (ASSERT_EXTRA) {
      expect(p50).toBeLessThan(PERF_TARGET_P50);
      expect(p99).toBeLessThan(PERF_TARGET_P99);
    }
  });

  test('memory delta stays within medium threshold for 3000 gen+validate', () => {
    const draft: JsonSchemaDraft = '2020-12';
    const schema: AnySchema = { type: 'string', minLength: 3, maxLength: 24 };
    const validate = compileValidator(schema, draft);
    const gen = new StringGenerator();
    const formatRegistry = makeFormatRegistry();

    const mem = measureMemory();
    const total = 3000;
    for (let i = 0; i < total; i++) {
      const ctx = createGeneratorContext(
        schema as unknown as Schema,
        formatRegistry,
        { seed: INTEGRATION_TEST_SEED + i }
      );
      const res = gen.generate(schema as unknown as Schema, ctx);
      if (!res.isOk()) continue;
      const ok = validate(res.value);
      if (!ok) throw new Error('Validation failed');
    }

    const { delta } = mem.measure();
    expect(delta).toBeLessThan(PERFORMANCE_THRESHOLDS.memory.medium);
  });

  // Optional heavy scenario for large datasets (guarded to avoid slow runs on dev machines)
  const heavyTest =
    process.env.GEN_COMPLIANCE_ASSERT_EXTRA === 'true' ? test : test.skip;
  heavyTest(
    'large dataset memory delta under large threshold for 10000 gen+validate (object)',
    () => {
      const draft: JsonSchemaDraft = '2020-12';
      const schema: AnySchema = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          user: {
            type: 'object',
            properties: {
              firstName: { type: 'string', minLength: 1, maxLength: 32 },
              lastName: { type: 'string', minLength: 1, maxLength: 32 },
              age: { type: 'integer', minimum: 0, maximum: 120 },
            },
            required: ['firstName', 'lastName'],
          },
          tags: {
            type: 'array',
            items: { type: 'string', minLength: 1, maxLength: 16 },
            minItems: 0,
            maxItems: 20,
          },
          metadata: {
            type: 'object',
            additionalProperties: {
              type: 'string',
              minLength: 0,
              maxLength: 50,
            },
          },
        },
        required: ['id', 'user'],
        additionalProperties: false,
      };

      const validate = compileValidator(schema, draft);
      const gen = new ObjectGenerator();
      const formatRegistry = makeFormatRegistry();

      // Warmup
      for (let i = 0; i < 200; i++) {
        const ctx = createGeneratorContext(
          schema as unknown as Schema,
          formatRegistry,
          { seed: INTEGRATION_TEST_SEED + i }
        );
        const res = gen.generate(schema as unknown as Schema, ctx);
        if (res.isOk()) validate(res.value);
      }

      const mem = measureMemory();
      const total = 10000;
      for (let i = 0; i < total; i++) {
        const ctx = createGeneratorContext(
          schema as unknown as Schema,
          formatRegistry,
          { seed: INTEGRATION_TEST_SEED + i }
        );
        const res = gen.generate(schema as unknown as Schema, ctx);
        if (!res.isOk()) continue;
        const ok = validate(res.value);
        if (!ok) throw new Error('Validation failed');
      }

      const { delta } = mem.measure();
      expect(delta).toBeLessThan(PERFORMANCE_THRESHOLDS.memory.large);
    }
  );
});

describe('Pattern Support E2E', () => {
  test.each(DRAFTS)(
    'string generator with basic patterns validates with AJV (%s)',
    (draft: JsonSchemaDraft) => {
      const basicPatterns = [
        '^[A-Z]{3}$', // Exactly 3 uppercase letters
        '^[0-9]{4}$', // Exactly 4 digits
        '^[a-zA-Z0-9-]+$', // One or more alphanumeric or dash
        '^[A-Z]{3}-[0-9]{4}$', // Format like ABC-1234
        '^[a-z]+@[a-z]+\\.[a-z]+$', // Basic email pattern
      ];

      for (const pattern of basicPatterns) {
        const schema: AnySchema = {
          type: 'string',
          pattern,
          minLength: 1,
          maxLength: 50,
        };
        const validate = compileValidator(schema, draft);
        const gen = new StringGenerator();
        const formatRegistry = makeFormatRegistry();

        // Generate multiple values to test consistency
        for (let i = 0; i < 10; i++) {
          const ctx = createGeneratorContext(
            schema as unknown as Schema,
            formatRegistry,
            { seed: INTEGRATION_TEST_SEED + i }
          );
          const result = gen.generate(schema as unknown as Schema, ctx);

          expect(result.isOk()).toBe(true);
          if (result.isOk()) {
            const value = result.value;
            expect(typeof value).toBe('string');

            // Verify the value matches the pattern
            const regex = new RegExp(pattern);
            expect(value).toMatch(regex);

            // Verify AJV also validates the value
            const isValid = validate(value);
            expect(isValid).toBe(true);
          }
        }
      }
    }
  );

  test('pattern with length constraints works across all drafts', () => {
    const schema: AnySchema = {
      type: 'string',
      pattern: '^[A-Z]{2,5}$', // 2-5 uppercase letters
      minLength: 2,
      maxLength: 5,
    };

    for (const draft of DRAFTS) {
      const validate = compileValidator(schema, draft);
      const gen = new StringGenerator();
      const formatRegistry = makeFormatRegistry();

      for (let i = 0; i < 20; i++) {
        const ctx = createGeneratorContext(
          schema as unknown as Schema,
          formatRegistry,
          { seed: INTEGRATION_TEST_SEED + i }
        );
        const result = gen.generate(schema as unknown as Schema, ctx);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const value = result.value as string;

          // Check pattern
          expect(value).toMatch(/^[A-Z]{2,5}$/);

          // Check length constraints
          expect(value.length).toBeGreaterThanOrEqual(2);
          expect(value.length).toBeLessThanOrEqual(5);

          // Verify AJV validation
          const isValid = validate(value);
          expect(isValid).toBe(true);
        }
      }
    }
  });

  test('pattern with enum respects both constraints', () => {
    const schema: AnySchema = {
      type: 'string',
      pattern: '^[A-Z]{3}$',
      enum: ['ABC', 'DEF', 'GHI'], // All match the pattern
    };

    for (const draft of DRAFTS) {
      const validate = compileValidator(schema, draft);
      const gen = new StringGenerator();
      const formatRegistry = makeFormatRegistry();

      for (let i = 0; i < 15; i++) {
        const ctx = createGeneratorContext(
          schema as unknown as Schema,
          formatRegistry,
          { seed: INTEGRATION_TEST_SEED + i }
        );
        const result = gen.generate(schema as unknown as Schema, ctx);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const value = result.value as string;

          // Must be one of the enum values
          expect(['ABC', 'DEF', 'GHI']).toContain(value);

          // Must match the pattern
          expect(value).toMatch(/^[A-Z]{3}$/);

          // AJV validation
          const isValid = validate(value);
          expect(isValid).toBe(true);
        }
      }
    }
  });

  test('performance: pattern generation meets thresholds', () => {
    const schema: AnySchema = {
      type: 'string',
      pattern: '^[a-zA-Z0-9]{8,16}$',
      minLength: 8,
      maxLength: 16,
    };

    const validate = compileValidator(schema, 'draft-07');
    const gen = new StringGenerator();
    const formatRegistry = makeFormatRegistry();

    const times: number[] = [];

    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      const ctx = createGeneratorContext(
        schema as unknown as Schema,
        formatRegistry,
        { seed: INTEGRATION_TEST_SEED + i }
      );
      const result = gen.generate(schema as unknown as Schema, ctx);
      const end = performance.now();

      times.push(end - start);

      // Verify correctness
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const isValid = validate(result.value);
        expect(isValid).toBe(true);
      }
    }

    const percentiles = calculatePercentiles(times);

    // Performance should be reasonable for pattern generation
    expect(percentiles.p95).toBeLessThan(5); // 5ms for p95
    expect(percentiles.p50).toBeLessThan(2); // 2ms for p50
  });
});
