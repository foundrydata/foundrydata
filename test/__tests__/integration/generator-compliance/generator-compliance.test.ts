import { describe, test, expect } from 'vitest';
import '../../../matchers/index.js';
import {
  INTEGRATION_TEST_SEED,
  PERFORMANCE_THRESHOLDS,
  measurePipelineTime,
  calculatePercentiles,
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
});
