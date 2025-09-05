/* eslint-disable max-lines-per-function */
/**
 * ================================================================================
 * JSON SCHEMA ARBITRARIES - FOUNDRYDATA TESTING v2.1
 *
 * Fast-check arbitraries for generating valid JSON Schemas without contradictions.
 * Multi-draft support with constraint consistency guarantees.
 * ================================================================================
 */

import * as fc from 'fast-check';
import type { JsonSchemaDraft } from '../helpers/ajv-factory';

// Re-export for convenience
export type { JsonSchemaDraft };

/**
 * Helper to create consistent bounds ensuring min ≤ max
 */
export const createBounds = (
  min: number,
  max: number
): fc.Arbitrary<readonly [number, number]> =>
  fc
    .tuple(fc.integer({ min, max }), fc.integer({ min, max }))
    .map(([a, b]) => (a <= b ? ([a, b] as const) : ([b, a] as const)));

/**
 * Arbitrary for generating valid JSON Schemas by draft
 * Simplified version focusing on core functionality
 */
export function jsonSchemaArbitraryFor(
  draft: JsonSchemaDraft
): fc.Arbitrary<Record<string, unknown>> {
  // Draft-specific schema features
  const isDraft2020 = draft === '2020-12';
  const isDraftModern = draft === '2019-09' || draft === '2020-12';
  // String schema with enum/const support
  const stringSchema = fc.oneof(
    // Basic string schema
    fc.record({
      type: fc.constant('string'),
    }),
    // String with enum (values respect minLength/maxLength constraints)
    createBounds(1, 10).chain(([minLen, maxLen]) =>
      fc.record({
        type: fc.constant('string'),
        minLength: fc.constant(minLen),
        maxLength: fc.constant(maxLen),
        enum: fc.array(fc.string({ minLength: minLen, maxLength: maxLen }), {
          minLength: 1,
          maxLength: 3,
        }),
      })
    ),
    // String with const (value respects constraints)
    createBounds(1, 10).chain(([minLen, maxLen]) =>
      fc.record({
        type: fc.constant('string'),
        minLength: fc.constant(minLen),
        maxLength: fc.constant(maxLen),
        const: fc.string({ minLength: minLen, maxLength: maxLen }),
      })
    )
  );

  // Number schema with enum/const support
  const numberSchema = fc.oneof(
    // Basic number with bounds
    createBounds(0, 100).chain(([min, max]) =>
      fc.record({
        type: fc.constantFrom('number', 'integer'),
        minimum: fc.constant(min),
        maximum: fc.constant(max),
      })
    ),
    // Number with enum (values respect min/max bounds)
    createBounds(0, 100).chain(([min, max]) =>
      fc.record({
        type: fc.constantFrom('number', 'integer'),
        minimum: fc.constant(min),
        maximum: fc.constant(max),
        enum: fc.array(fc.integer({ min, max }), {
          minLength: 1,
          maxLength: 3,
        }),
      })
    ),
    // Number with const (value respects bounds)
    createBounds(0, 100).chain(([min, max]) =>
      fc.record({
        type: fc.constantFrom('number', 'integer'),
        minimum: fc.constant(min),
        maximum: fc.constant(max),
        const: fc.integer({ min, max }),
      })
    )
  );

  // Boolean schema
  const booleanSchema = fc.record({
    type: fc.constant('boolean'),
  });

  // Null schema
  const nullSchema = fc.record({
    type: fc.constant('null'),
  });

  // Array schema (draft-specific item handling)
  const arraySchema = isDraft2020
    ? fc
        .array(
          fc.record({ type: fc.constantFrom('string', 'number', 'boolean') }),
          { minLength: 1, maxLength: 3 }
        )
        .chain((prefixItems) =>
          fc.record({
            type: fc.constant('array'),
            // Draft 2020-12 uses prefixItems with explicit bounds (AJV strict mode requirement)
            prefixItems: fc.constant(prefixItems),
            minItems: fc.constant(prefixItems.length),
            maxItems: fc.constant(prefixItems.length),
            items: fc.constant(false), // No additional items allowed for strict tuples
          })
        )
    : fc.record({
        type: fc.constant('array'),
        // Draft-07 and 2019-09 use items
        items: fc.record({
          type: fc.constantFrom('string', 'number', 'boolean'),
        }),
      });

  // Simple object schema with required ⊆ properties and draft-specific features
  const objectSchema = fc
    .array(
      fc.tuple(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.record({ type: fc.constantFrom('string', 'number', 'boolean') })
      ),
      { minLength: 1, maxLength: 3 }
    )
    .chain((entries) => {
      const properties = Object.fromEntries(entries);
      const propertyNames = Object.keys(properties);

      return fc
        .integer({ min: 0, max: propertyNames.length })
        .map((requiredCount) => {
          const baseSchema = {
            type: 'object',
            properties,
            required: propertyNames.slice(0, requiredCount),
          };

          // Add modern draft features
          if (isDraftModern) {
            return fc
              .boolean()
              .map((addUnevaluated) =>
                addUnevaluated
                  ? { ...baseSchema, unevaluatedProperties: false }
                  : baseSchema
              );
          }

          return fc.constant(baseSchema);
        })
        .chain((schemaArb) => schemaArb);
    });

  // Basic schemas for composition
  const basicSchemas = [stringSchema, numberSchema, booleanSchema, nullSchema];

  // Combined schemas (allOf, anyOf, oneOf, not)
  const combinedSchema = fc.oneof(
    // allOf - intersection
    fc.record({
      allOf: fc.array(fc.oneof(...basicSchemas), {
        minLength: 2,
        maxLength: 2,
      }),
    }),
    // anyOf - union
    fc.record({
      anyOf: fc.array(fc.oneof(...basicSchemas), {
        minLength: 2,
        maxLength: 3,
      }),
    }),
    // oneOf - exclusive union
    fc.record({
      oneOf: fc.array(fc.oneof(...basicSchemas), {
        minLength: 2,
        maxLength: 3,
      }),
    }),
    // not - negation
    fc.record({
      not: fc.oneof(...basicSchemas),
    })
  );

  // Conditional schemas (if/then/else)
  const conditionalSchema = fc.record({
    if: fc.record({ type: fc.constant('string') }),
    then: fc.record({ type: fc.constant('number') }),
    else: fc.record({ type: fc.constant('boolean') }),
  });

  return fc.oneof(
    stringSchema,
    numberSchema,
    booleanSchema,
    nullSchema,
    arraySchema,
    objectSchema,
    combinedSchema,
    conditionalSchema
  );
}

/**
 * Get schema arbitrary based on environment variable
 */
export function getSchemaArbitrary(): fc.Arbitrary<Record<string, unknown>> {
  const draft = (process.env.SCHEMA_DRAFT as JsonSchemaDraft) || '2020-12';
  return jsonSchemaArbitraryFor(draft);
}

/**
 * Simple schema arbitrary for basic testing scenarios
 */
export const simpleSchemaArbitrary: fc.Arbitrary<Record<string, unknown>> =
  fc.oneof(
    fc.record({ type: fc.constant('string') }),
    fc.record({ type: fc.constant('number') }),
    fc.record({ type: fc.constant('boolean') })
  );
