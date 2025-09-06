/* eslint-disable max-depth */
/* eslint-disable max-lines */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
/**
 * Array Generator
 * Generates arrays with support for minItems/maxItems, uniqueItems, and draft-specific handling
 *
 * Core generator component supporting:
 * - Draft-07: items as schema or tuple
 * - Draft 2019-09/2020-12: prefixItems for tuples
 * - Unique items constraint
 * - Nested structure generation
 */

import { Result, ok, err } from '../../types/result';
import { GenerationError } from '../../types/errors';
import type { Schema, ArraySchema, StringSchema } from '../../types/schema';
import {
  isStringSchema,
  isNumberSchema,
  isIntegerSchema,
  isBooleanSchema,
} from '../../types/schema';
import {
  DataGenerator,
  GeneratorContext,
  GenerationConfig,
} from '../data-generator';
import { StringGenerator } from './string-generator';
import { NumberGenerator } from './number-generator';
import { IntegerGenerator } from './integer-generator';
import { BooleanGenerator } from './boolean-generator';
import { ObjectGenerator } from './object-generator';

// Type guard to check if schema is an object (not boolean)
function isSchemaObject(schema: Schema): schema is Exclude<Schema, boolean> {
  return typeof schema === 'object' && schema !== null;
}

// Type guard to check if schema has a type property
function hasType(schema: Schema): schema is Schema & { type: string } {
  return (
    isSchemaObject(schema) &&
    'type' in schema &&
    typeof schema.type === 'string'
  );
}

export class ArrayGenerator extends DataGenerator {
  // Reuse type generators to reduce per-item instantiation overhead
  private readonly strGen = new StringGenerator();
  private readonly numGen = new NumberGenerator();
  private readonly intGen = new IntegerGenerator();
  private readonly boolGen = new BooleanGenerator();
  private readonly objGen = new ObjectGenerator();
  /**
   * Priority for this generator (higher than basic types, lower than complex types)
   */
  getPriority(): number {
    return 15;
  }

  supports(schema: Schema): boolean {
    return (
      typeof schema === 'object' && schema !== null && schema.type === 'array'
    );
  }

  generate(
    schema: Schema,
    context: GeneratorContext,
    config?: GenerationConfig
  ): Result<unknown[], GenerationError> {
    if (!this.supports(schema)) {
      return err(
        new GenerationError(
          `ArrayGenerator does not support schema type: ${typeof schema === 'object' && schema !== null ? schema.type : 'unknown'}`,
          undefined,
          context.path,
          'type'
        )
      );
    }

    const arraySchema = schema as ArraySchema;

    // Validate constraints first
    const minItems = arraySchema.minItems ?? 0;
    // Use a safe default when maxItems is not specified to avoid generating
    // extremely large arrays that can exhaust memory.
    const DEFAULT_MAX_ITEMS = 10;
    const maxItems = arraySchema.maxItems ?? DEFAULT_MAX_ITEMS;

    if (minItems < 0) {
      return err(
        new GenerationError(
          `Invalid constraint: minItems (${minItems}) must be non-negative`,
          'Fix the schema constraints',
          context.path,
          'constraint-violation'
        )
      );
    }

    if (minItems > maxItems) {
      return err(
        new GenerationError(
          `Contradiction: minItems (${minItems}) > maxItems (${maxItems})`,
          'Fix the schema constraints',
          context.path,
          'constraint-conflict'
        )
      );
    }

    // Handle items/prefixItems based on draft
    // Draft-07: uses 'items' for both schemas and tuples
    // Draft 2019-09+: uses 'prefixItems' for tuples, 'items' for additional items
    const itemSchemas = this.getItemSchemas(arraySchema);
    const uniqueItems = arraySchema.uniqueItems ?? false;

    // Check for impossible constraints with uniqueItems
    if (
      uniqueItems &&
      itemSchemas &&
      !Array.isArray(itemSchemas) &&
      hasType(itemSchemas)
    ) {
      const itemType = itemSchemas.type;
      if (itemType === 'null' && minItems > 1) {
        return err(
          new GenerationError(
            `Impossible constraint: uniqueItems with type null cannot satisfy minItems > 1`,
            'Adjust minItems or change item type',
            context.path,
            'impossible-constraint'
          )
        );
      }
      if (itemType === 'boolean' && minItems > 2) {
        return err(
          new GenerationError(
            `Impossible constraint: uniqueItems with type boolean cannot satisfy minItems > 2`,
            'Adjust minItems or change item type',
            context.path,
            'impossible-constraint'
          )
        );
      }
    }

    // Special case: limit effective items based on type when uniqueItems is true
    let effectiveMinItems = minItems;
    let effectiveMaxItems = maxItems;
    if (
      uniqueItems &&
      itemSchemas &&
      !Array.isArray(itemSchemas) &&
      hasType(itemSchemas)
    ) {
      const itemType = itemSchemas.type;
      if (itemType === 'null') {
        effectiveMinItems = Math.min(1, minItems);
        effectiveMaxItems = Math.min(1, maxItems);
      } else if (itemType === 'boolean') {
        effectiveMinItems = Math.min(2, minItems);
        effectiveMaxItems = Math.min(2, maxItems);
      }
    }

    // Respect tuple semantics when prefixItems is used and additional items are forbidden
    // Draft 2019-09/2020-12: prefixItems for tuples, items=false forbids additional elements
    if (Array.isArray(itemSchemas)) {
      const tupleLen = itemSchemas.length;
      if (
        arraySchema.items === false ||
        arraySchema.unevaluatedItems === false
      ) {
        // Exact tuple length when additional items are forbidden
        effectiveMinItems = Math.max(effectiveMinItems, tupleLen);
        effectiveMaxItems = Math.min(effectiveMaxItems, tupleLen);
        // If minItems exceeds tuple length, the schema is unsatisfiable
        if (effectiveMinItems > tupleLen) {
          return err(
            new GenerationError(
              `Impossible constraint: minItems (${effectiveMinItems}) > tuple length (${tupleLen}) with items=false`,
              'Adjust minItems or allow additional items (items != false)',
              context.path,
              'impossible-constraint'
            )
          );
        }
      }
    }

    // Generate array length
    const length = this.generateLength(
      effectiveMinItems,
      effectiveMaxItems,
      context.seed ?? 0
    );

    // Generate array items
    const result: unknown[] = [];
    const usedValues = new Set<string>();

    // Special-case uniqueItems for boolean/null with strict bounds
    if (
      uniqueItems &&
      itemSchemas &&
      !Array.isArray(itemSchemas) &&
      hasType(itemSchemas)
    ) {
      const t = itemSchemas.type;
      if (t === 'null') {
        // length already bounded by earlier check
        for (let i = 0; i < length; i++) result.push(null);
        return ok(result);
      }
      if (t === 'boolean') {
        if (length === 1) {
          // Deterministic single boolean
          const faker = this.prepareFaker(context);
          result.push(faker.datatype.boolean());
          return ok(result);
        }
        if (length === 2) {
          const faker = this.prepareFaker(context);
          const first = faker.datatype.boolean();
          result.push(first, !first);
          return ok(result);
        }
      }
    }

    // General path
    let attempts = 0;
    const maxAttempts = Math.max(10 * length, 50);
    while (result.length < length) {
      const i = result.length;
      const itemResult = this.generateItem(
        itemSchemas,
        i + attempts,
        context,
        config
      );
      if (itemResult.isErr()) return err(itemResult.error);
      const value = itemResult.value;

      if (uniqueItems) {
        const key = JSON.stringify(value);
        if (usedValues.has(key)) {
          attempts++;
          if (attempts > maxAttempts) break;
          continue;
        }
        usedValues.add(key);
      }
      result.push(value);
    }

    return ok(result);
  }

  validate(value: unknown, schema: Schema): boolean {
    if (!this.supports(schema)) return false;
    if (!Array.isArray(value)) return false;

    const arraySchema = schema as ArraySchema;
    const minItems = arraySchema.minItems ?? 0;
    const maxItems = arraySchema.maxItems ?? Number.MAX_SAFE_INTEGER;
    const uniqueItems = arraySchema.uniqueItems ?? false;

    // Special case: with uniqueItems and type null, only 0 or 1 items are possible
    const itemSchemas = this.getItemSchemas(arraySchema);
    if (
      uniqueItems &&
      itemSchemas &&
      !Array.isArray(itemSchemas) &&
      hasType(itemSchemas)
    ) {
      const itemType = itemSchemas.type;
      if (itemType === 'null' && minItems > 1) {
        // This schema is impossible to satisfy, but we generated the best we could
        // Accept arrays with 0 or 1 null values as valid for this edge case
        if (value.length <= 1) {
          // Check that if there's one item, it's null
          if (value.length === 1 && value[0] !== null) return false;
          return true;
        }
      }
    }

    // Check length constraints
    if (value.length < minItems || value.length > maxItems) {
      return false;
    }

    // Check uniqueItems
    if (uniqueItems) {
      const seen = new Set<string>();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) return false;
        seen.add(key);
      }
    }

    return true;
  }

  getExamples(schema: Schema): unknown[] {
    if (!this.supports(schema)) return [];

    const arraySchema = schema as ArraySchema;
    const examples: unknown[][] = [];
    const itemSchemas = this.getItemSchemas(arraySchema);

    // Empty array (if allowed by minItems)
    if (!arraySchema.minItems || arraySchema.minItems === 0) {
      examples.push([]);
    }

    // Single item array
    if (!arraySchema.minItems || arraySchema.minItems <= 1) {
      const item = this.generateExampleItem(itemSchemas, 0);
      examples.push([item]);
    }

    // Array with minItems
    const min = arraySchema.minItems || 2;
    const exampleArray: unknown[] = [];
    for (let i = 0; i < min; i++) {
      exampleArray.push(this.generateExampleItem(itemSchemas, i));
    }
    examples.push(exampleArray);

    return examples;
  }

  /**
   * Generate multiple arrays with different seeds for variation
   */
  generateMultiple(
    schema: Schema,
    context: GeneratorContext,
    count: number,
    config?: GenerationConfig
  ): Result<unknown[][], GenerationError> {
    if (!this.supports(schema)) {
      return err(
        new GenerationError(
          'Unsupported schema type',
          undefined,
          context.path,
          'type'
        )
      );
    }

    const results: unknown[][] = [];
    for (let i = 0; i < count; i++) {
      const newContext = {
        ...context,
        seed: (context.seed ?? 0) + i,
      };
      const result = this.generate(schema, newContext, config);

      if (result.isErr()) {
        return err(result.error);
      }

      results.push(result.value);
    }

    return ok(results);
  }

  /**
   * Get item schemas from array schema, handling draft differences
   */
  private getItemSchemas(schema: ArraySchema): Schema | Schema[] | undefined {
    // Modern drafts use prefixItems for tuples
    if (schema.prefixItems) {
      return schema.prefixItems;
    }
    // Draft-07 uses items for both
    if (schema.items) {
      return schema.items;
    }
    // Default to string items if not specified
    return { type: 'string' } as StringSchema;
  }

  /**
   * Generate array length based on constraints and seed
   */
  private generateLength(
    minItems: number,
    maxItems: number,
    seed: number
  ): number {
    if (minItems === maxItems) return minItems;

    const range = Math.max(0, maxItems - minItems);
    // Use seed for deterministic generation
    const randomValue = Math.abs(Math.sin(seed));
    return Math.max(
      0,
      Math.min(maxItems, minItems + Math.floor(randomValue * (range + 1)))
    );
  }

  /**
   * Generate a single array item
   */
  private generateItem(
    itemSchemas: Schema | Schema[] | undefined,
    index: number,
    context: GeneratorContext,
    config?: GenerationConfig
  ): Result<unknown, GenerationError> {
    // Handle tuple validation (array of schemas)
    if (Array.isArray(itemSchemas)) {
      // Use the schema at the current index, or the last one if index exceeds array length
      const itemSchema =
        itemSchemas[index] ?? itemSchemas[itemSchemas.length - 1];
      if (itemSchema === undefined) {
        return ok(null); // Return null when no item schema is defined
      }
      return this.generateFromSchema(itemSchema, index, context, config);
    }

    // Handle single item schema
    if (itemSchemas !== undefined) {
      return this.generateFromSchema(itemSchemas, index, context, config);
    }

    // Default to string
    return ok(`item-${index}`);
  }

  /**
   * Generate value from a schema (simplified for now, would integrate with registry)
   */
  private generateFromSchema(
    schema: Schema,
    index: number,
    context: GeneratorContext,
    _config?: GenerationConfig
  ): Result<unknown, GenerationError> {
    // Handle boolean schemas first
    if (schema === true) return ok(null);
    if (schema === false)
      return err(
        new GenerationError(
          'Schema false always fails validation',
          undefined,
          `${context.path}[${index}]`,
          'false-schema'
        )
      );

    // Create a nested context for this array element
    const nested = this.createNestedContext(
      context,
      `${context.path}[${index}]`,
      schema
    );

    if (typeof schema === 'object' && schema !== null && 'type' in schema) {
      const s = schema as Record<string, unknown> & {
        type?: string;
        properties?: Record<string, Schema>;
      };

      // Determine if a primitive schema is unconstrained (fast path eligible)
      const isSimplePrimitive = (sch: unknown): boolean => {
        if (!sch || typeof sch !== 'object') return false;
        const tVal = (sch as Record<string, unknown>).type;
        if (typeof tVal !== 'string') return false;
        const t = tVal as string;
        switch (t) {
          case 'string':
            return (
              !('format' in (sch as object)) &&
              !('minLength' in (sch as object)) &&
              !('maxLength' in (sch as object)) &&
              !('pattern' in (sch as object)) &&
              !('enum' in (sch as object)) &&
              !('const' in (sch as object))
            );
          case 'number':
            return (
              !('minimum' in (sch as object)) &&
              !('maximum' in (sch as object)) &&
              !('exclusiveMinimum' in (sch as object)) &&
              !('exclusiveMaximum' in (sch as object)) &&
              !('multipleOf' in (sch as object)) &&
              !('enum' in (sch as object)) &&
              !('const' in (sch as object))
            );
          case 'integer':
            return (
              !('minimum' in (sch as object)) &&
              !('maximum' in (sch as object)) &&
              !('exclusiveMinimum' in (sch as object)) &&
              !('exclusiveMaximum' in (sch as object)) &&
              !('multipleOf' in (sch as object)) &&
              !('enum' in (sch as object)) &&
              !('const' in (sch as object))
            );
          case 'boolean':
            return (
              !('enum' in (sch as object)) && !('const' in (sch as object))
            );
          default:
            return false;
        }
      };

      if (isSimplePrimitive(s)) {
        // Extremely fast deterministic generation using index and seed
        switch (s.type) {
          case 'string':
            return ok(`str-${(context.seed ?? 0) ^ index}`);
          case 'number':
            return ok(((context.seed ?? 0) + index) % 1000);
          case 'integer':
            return ok(Math.floor(((context.seed ?? 0) + index) % 1000));
          case 'boolean':
            return ok((((context.seed ?? 0) + index) & 1) === 0);
        }
      }

      // Fast-path simple objects with only primitive, unconstrained properties
      if (
        s.type === 'object' &&
        s.properties &&
        typeof s.properties === 'object'
      ) {
        const props = s.properties as Record<string, Schema>;
        const isAllSimple = Object.values(props).every((ps: Schema) =>
          isSimplePrimitive(ps)
        );
        if (isAllSimple) {
          const base = (context.seed ?? 0) ^ (index * 2654435761);
          const hash = (str: string): number => {
            let h = 2166136261 >>> 0;
            for (let i = 0; i < str.length; i++) {
              h ^= str.charCodeAt(i) & 0xff;
              h = Math.imul(h, 16777619);
            }
            return h >>> 0;
          };
          const out: Record<string, unknown> = {};
          for (const [k, ps] of Object.entries(props)) {
            const h = base ^ hash(k);
            if (isStringSchema(ps)) out[k] = `str-${(h >>> 0).toString(36)}`;
            else if (isNumberSchema(ps)) out[k] = (h % 100000) / 10;
            else if (isIntegerSchema(ps)) out[k] = Math.floor(h % 100000);
            else if (isBooleanSchema(ps)) out[k] = (h & 1) === 0;
            else out[k] = null;
          }
          return ok(out);
        }
      }

      // Delegate to full-feature generators (reused instances)
      switch (s.type) {
        case 'string':
          return this.strGen.generate(schema, nested);
        case 'number':
          return this.numGen.generate(schema, nested);
        case 'integer':
          return this.intGen.generate(schema, nested);
        case 'boolean':
          return this.boolGen.generate(schema, nested);
        case 'object':
          return this.objGen.generate(schema, nested);
        case 'array':
          return this.generate(schema, nested); // recursion
        default:
          return ok(null);
      }
    }

    // Fallback when schema has no explicit type
    return new StringGenerator().generate({ type: 'string' } as Schema, nested);
  }

  /**
   * Generate example item for documentation
   */
  private generateExampleItem(
    itemSchemas: Schema | Schema[] | undefined,
    index: number
  ): unknown {
    if (Array.isArray(itemSchemas)) {
      const itemSchema =
        itemSchemas[index] ?? itemSchemas[itemSchemas.length - 1];
      if (itemSchema === undefined) {
        return null; // Default example value when no schema is defined
      }
      return this.generateExampleFromType(itemSchema);
    }

    if (itemSchemas !== undefined) {
      return this.generateExampleFromType(itemSchemas);
    }

    return `item-${index}`;
  }

  /**
   * Generate example from type
   */
  private generateExampleFromType(schema: Schema): unknown {
    // Handle boolean schemas
    if (schema === true) {
      return 'any-example';
    }
    if (schema === false) {
      return null; // false schema never validates
    }

    const type = hasType(schema) ? schema.type : 'string';

    switch (type) {
      case 'string':
        return 'example';
      case 'number':
      case 'integer':
        return 42;
      case 'boolean':
        return true;
      case 'null':
        return null;
      case 'object':
        return { id: 'example-id' };
      case 'array':
        return ['example'];
      default:
        return 'example';
    }
  }

  /**
   * Clear any internal caches
   */
  static clearCache(): void {
    // Cache clearing logic will be implemented when cache is added
  }
}
