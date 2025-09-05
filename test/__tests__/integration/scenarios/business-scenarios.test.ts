import { describe, test, expect } from '../setup';
import '../../../matchers/index';
import { JSONSchemaParser } from '../../../../packages/core/src/parser/json-schema-parser';
import { ObjectGenerator } from '../../../../packages/core/src/generator/types/object-generator';
import { createGeneratorContext } from '../../../../packages/core/src/generator/data-generator';
import { FormatRegistry } from '../../../../packages/core/src/registry/format-registry';
import { createAjv } from '../../../helpers/ajv-factory';
import {
  INTEGRATION_TEST_SEED,
  type DraftVersion,
  DRAFT_VERSIONS,
} from '../setup';
import fs from 'node:fs';
import path from 'node:path';
import type { JSONSchema7 } from 'json-schema';
import type {
  Schema,
  ObjectSchema,
} from '../../../../packages/core/src/types/schema';

// Helper to load example schemas from docs/examples
function loadSchema(relativePath: string): JSONSchema7 {
  const full = path.resolve(process.cwd(), 'docs/examples', relativePath);
  const raw = fs.readFileSync(full, 'utf-8');
  return JSON.parse(raw) as JSONSchema7;
}

// Normalize draft label from integration setup to ajv-factory format
function normalizeDraft(
  draft: DraftVersion
): 'draft-07' | '2019-09' | '2020-12' {
  return draft.replace('draft/', '') as 'draft-07' | '2019-09' | '2020-12';
}

describe('Business Scenario Integration (real example schemas)', () => {
  const EXAMPLE_SCHEMAS: Array<{ name: string; file: string }> = [
    { name: 'ecommerce', file: 'ecommerce-schema.json' },
    { name: 'saas-user', file: 'saas-user-schema.json' },
    { name: 'api-transaction', file: 'api-transaction-schema.json' },
    { name: 'team-with-users', file: 'team-with-users-schema.json' },
  ];

  for (const { name, file } of EXAMPLE_SCHEMAS) {
    test(`pipeline end-to-end with ${name} schema across drafts`, () => {
      const schema = loadSchema(file);

      // Parse
      const parser = new JSONSchemaParser();
      const parseResult = parser.parse(schema);
      expect(parseResult.isOk()).toBe(true);
      if (!parseResult.isOk()) return;

      // Generate a moderate batch deterministically
      const generator = new ObjectGenerator();
      const formatRegistry = new FormatRegistry();
      const context = createGeneratorContext(
        parseResult.value as Schema,
        formatRegistry,
        { seed: INTEGRATION_TEST_SEED }
      );

      const count = 100; // balanced for integration
      const items: unknown[] = [];
      for (let i = 0; i < count; i++) {
        const result = generator.generate(
          parseResult.value as ObjectSchema,
          context
        );
        if (result.isOk()) items.push(result.value);
      }

      // Validate via custom matcher (AJV oracle under the hood) for each draft
      // Note: team-with-users contains nested object arrays beyond MVP capabilities.
      // For that case, we perform relaxed validation per MVP_LIMITATIONS.
      const isUnsupportedNested = name === 'team-with-users';

      if (!isUnsupportedNested) {
        for (const draft of DRAFT_VERSIONS) {
          const normalized = normalizeDraft(draft);
          for (const item of items) {
            expect(item).toMatchJsonSchema(schema, normalized);
          }
        }
        // Cross-check with direct AJV compile for primary draft to ensure parity
        const ajv = createAjv('2020-12');
        const validate = ajv.compile(schema);
        for (const item of items) {
          expect(validate(item)).toBe(true);
        }
      } else {
        // Relaxed assertions respecting MVP limitations
        // - Validate top-level fields only
        for (const item of items) {
          const obj = item as any;
          expect(typeof obj.teamId).toBe('string');
          expect(typeof obj.teamName).toBe('string');
          expect(['startup', 'growth', 'enterprise']).toContain(obj.plan);
          expect(typeof obj.isActive).toBe('boolean');
          expect(typeof obj.createdAt).toBe('string');
          expect(Array.isArray(obj.members)).toBe(true);
        }
      }
    });
  }
});
