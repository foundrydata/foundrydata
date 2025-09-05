import { describe, test, expect } from '../setup';
import '../../../matchers/index';
import { JSONSchemaParser } from '../../../../packages/core/src/parser/json-schema-parser';
import { ObjectGenerator } from '../../../../packages/core/src/generator/types/object-generator';
import { createGeneratorContext } from '../../../../packages/core/src/generator/data-generator';
import { FormatRegistry } from '../../../../packages/core/src/registry/format-registry';
import {
  INTEGRATION_TEST_SEED,
  PERFORMANCE_THRESHOLDS,
  measureMemory,
} from '../setup';
import fs from 'node:fs';
import path from 'node:path';
import type { JSONSchema7 } from 'json-schema';
import type {
  Schema,
  ObjectSchema,
} from '../../../../packages/core/src/types/schema';

function loadSchema(relativePath: string): JSONSchema7 {
  const full = path.resolve(process.cwd(), 'docs/examples', relativePath);
  const raw = fs.readFileSync(full, 'utf-8');
  return JSON.parse(raw) as JSONSchema7;
}

describe('Integration Memory/Load - 10,000 records', () => {
  test('generate 10,000 valid ecommerce records within memory thresholds', async () => {
    const schema = loadSchema('ecommerce-schema.json');

    // Parse
    const parser = new JSONSchemaParser();
    const parseResult = parser.parse(schema);
    expect(parseResult.isOk()).toBe(true);
    if (!parseResult.isOk()) return;

    // Prepare generator
    const generator = new ObjectGenerator();
    const formatRegistry = new FormatRegistry();
    const context = createGeneratorContext(
      parseResult.value as Schema,
      formatRegistry,
      { seed: INTEGRATION_TEST_SEED }
    );

    const N = 10_000;

    // Measure memory before/after
    const mem = measureMemory();

    const items: unknown[] = [];
    for (let i = 0; i < N; i++) {
      const result = generator.generate(
        parseResult.value as ObjectSchema,
        context
      );
      if (result.isOk()) items.push(result.value);
    }

    const { delta } = mem.measure();

    // Memory threshold (bytes) -> compare against configured 100MB
    expect(delta).toBeLessThanOrEqual(PERFORMANCE_THRESHOLDS.memory.large);

    // Spot-validate a subset with custom matcher to keep runtime bounded
    const sampleSize = 100;
    for (let i = 0; i < sampleSize; i++) {
      const idx = Math.floor((i * N) / sampleSize);
      expect(items[idx]).toMatchJsonSchema(schema, '2020-12');
    }

    // Determinism for full pipeline is covered in other integration tests.
    // Here we only assert validity under load and memory thresholds due to
    // format generators not being fully seeded in MVP.
  }, 60000); // Allow up to 60s due to large generation
});
