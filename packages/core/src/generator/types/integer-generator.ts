/**
 * Integer Generator
 * Generates whole numbers (integers) with constraint support
 * Similar to NumberGenerator but ensures integer values
 *
 * Core generator component - complexity and line limits are disabled
 * for cohesion and performance per CLAUDE.md guidelines
 */

/* eslint-disable max-lines, max-lines-per-function, complexity, @typescript-eslint/no-explicit-any */

import { Result, ok, err } from '../../types/result';
import { GenerationError } from '../../types/errors';
import type { Schema, IntegerSchema } from '../../types/schema';
import {
  DataGenerator,
  GeneratorContext,
  GenerationConfig,
} from '../data-generator';

// Default bounds for integer generation when not specified
const DEFAULT_INTEGER_MIN = -1000000;
const DEFAULT_INTEGER_MAX = 1000000;

export class IntegerGenerator extends DataGenerator {
  supports(schema: Schema): boolean {
    if (typeof schema !== 'object' || schema === null) {
      return false;
    }

    const schemaType = schema.type;
    const hasInteger =
      schemaType === 'integer' ||
      (Array.isArray(schemaType) && schemaType.includes('integer'));

    if (!hasInteger) {
      return false;
    }

    const integerSchema = schema as IntegerSchema;
    // Reject Draft-04 boolean exclusive bounds
    if (
      typeof integerSchema.exclusiveMinimum === 'boolean' ||
      typeof integerSchema.exclusiveMaximum === 'boolean'
    ) {
      return false;
    }

    return true;
  }

  generate(
    schema: Schema,
    context: GeneratorContext,
    _config?: GenerationConfig
  ): Result<number, GenerationError> {
    if (!this.supports(schema)) {
      return err(
        new GenerationError(
          `IntegerGenerator does not support schema type: ${typeof schema === 'object' && schema !== null ? schema.type : 'unknown'}`,
          undefined,
          context.path,
          'type'
        )
      );
    }

    const integerSchema = schema as IntegerSchema;

    try {
      // Handle enum values first (highest priority)
      if (integerSchema.enum) {
        return this.generateFromEnum(integerSchema.enum, context);
      }

      // Handle const values
      if (integerSchema.const !== undefined) {
        const constValue = this.toStrictInteger(integerSchema.const);
        if (constValue === null) {
          return err(
            new GenerationError(
              `Invalid const value for integer: ${JSON.stringify(integerSchema.const)}`,
              'Const must be exactly an integer (no coercion)',
              context.path,
              'const'
            )
          );
        }
        // Vérifier que const respecte les autres contraintes
        if (!this.meetsConstraints(constValue, integerSchema)) {
          return err(
            new GenerationError(
              `Const value ${constValue} violates schema constraints`,
              'Check minimum, maximum, exclusiveMinimum, exclusiveMaximum, or multipleOf',
              context.path,
              'const-constraints'
            )
          );
        }
        return ok(constValue);
      }

      // Handle default values
      if (integerSchema.default !== undefined) {
        const defaultValue = this.toInteger(integerSchema.default);
        if (
          defaultValue !== null &&
          this.meetsConstraints(defaultValue, integerSchema)
        ) {
          return ok(defaultValue);
        }
      }

      // Handle example values
      if (integerSchema.examples && integerSchema.examples.length > 0) {
        const fakerInstance = this.prepareFaker(context);
        const example = fakerInstance.helpers.arrayElement(
          integerSchema.examples
        );
        const exampleValue = this.toInteger(example);
        if (
          exampleValue !== null &&
          this.meetsConstraints(exampleValue, integerSchema)
        ) {
          return ok(exampleValue);
        }
      }

      // Generate integer within constraints
      return this.generateWithinConstraints(integerSchema, context);
    } catch (error) {
      return err(
        new GenerationError(
          `Failed to generate integer: ${String(error)}`,
          'Check integer constraints and ensure valid ranges',
          context.path,
          'integer-generation',
          { error: String(error) }
        )
      );
    }
  }

  /**
   * Convert value to integer, return null if invalid
   */
  private toInteger(value: any): number | null {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? value : Math.trunc(value);
    }

    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? null : parsed;
    }

    return null;
  }

  /**
   * Convert value to integer with strict validation (no coercion)
   */
  private toStrictInteger(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isInteger(value) ? value : null;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^-?\d+$/.test(trimmed)) {
        const num = Number(trimmed);
        return Number.isSafeInteger(num) ? num : null;
      }
    }
    return null;
  }

  /**
   * Generate integer from enum values, respecting other constraints
   */
  private generateFromEnum(
    enumValues: any[],
    context: GeneratorContext
  ): Result<number, GenerationError> {
    if (enumValues.length === 0) {
      return err(
        new GenerationError(
          'Enum array is empty',
          'Provide at least one enum value',
          context.path,
          'enum'
        )
      );
    }

    const integerSchema = context.schema as IntegerSchema;

    // Filtrer : garder seulement les entiers valides
    const validIntegers = enumValues
      .map((v) => this.toStrictInteger(v))
      .filter((v): v is number => v !== null)
      .filter((v) => this.meetsConstraints(v, integerSchema));

    if (validIntegers.length === 0) {
      // Détail pour debug
      const integerCount = enumValues
        .map((v) => this.toStrictInteger(v))
        .filter((v) => v !== null).length;

      return err(
        new GenerationError(
          `No valid enum values: ${integerCount} integers found, 0 meet constraints`,
          `Enum values: ${JSON.stringify(enumValues)}`,
          context.path,
          'enum-constraints'
        )
      );
    }

    const fakerInstance = this.prepareFaker(context);
    return ok(fakerInstance.helpers.arrayElement(validIntegers));
  }

  /**
   * Generate integer within schema constraints
   */
  private generateWithinConstraints(
    schema: IntegerSchema,
    context: GeneratorContext
  ): Result<number, GenerationError> {
    const fakerInstance = this.prepareFaker(context);

    // Normalize exclusive bounds to inclusive bounds and ensure integers
    const bounds = this.normalizeExclusiveBounds(
      schema.exclusiveMinimum,
      schema.exclusiveMaximum,
      schema.minimum,
      schema.maximum
    );

    let min = Math.ceil(bounds.min ?? DEFAULT_INTEGER_MIN);
    let max = Math.floor(bounds.max ?? DEFAULT_INTEGER_MAX);

    // Ensure we have valid integer bounds - be more conservative with safe integers
    min = Math.max(min, Number.MIN_SAFE_INTEGER);
    max = Math.min(max, Number.MAX_SAFE_INTEGER);

    // Additional safety check to ensure values are actually safe integers
    if (!Number.isSafeInteger(min)) {
      min = Number.MIN_SAFE_INTEGER;
    }
    if (!Number.isSafeInteger(max)) {
      max = Number.MAX_SAFE_INTEGER;
    }

    // Validate range
    if (min > max) {
      return err(
        new GenerationError(
          `Invalid integer range: minimum (${min}) > maximum (${max})`,
          'Ensure minimum <= maximum for integer constraints',
          context.path,
          'range'
        )
      );
    }

    let value: number;

    if (context.scenario === 'edge') {
      // Generate edge case values
      value = this.generateEdgeValue(min, max, schema, fakerInstance);
    } else {
      // Generate normal values within range
      value = this.generateNormalValue(min, max, fakerInstance);
    }

    // Apply multipleOf constraint for integers (Draft-07+ compliant)
    if (schema.multipleOf !== undefined) {
      // Validation selon spec Draft-07+
      if (schema.multipleOf <= 0) {
        return err(
          new GenerationError(
            `multipleOf must be > 0, got: ${schema.multipleOf}`,
            'JSON Schema requires multipleOf to be a positive number',
            context.path,
            'multipleOf'
          )
        );
      }

      // Optimisation pour multipleOf entier >= 1
      if (Number.isInteger(schema.multipleOf) && schema.multipleOf >= 1) {
        const minMultiple = Math.ceil(min / schema.multipleOf);
        const maxMultiple = Math.floor(max / schema.multipleOf);

        if (minMultiple > maxMultiple) {
          return err(
            new GenerationError(
              `No valid multiple of ${schema.multipleOf} between ${min} and ${max}`,
              'Adjust bounds or multipleOf constraint',
              context.path,
              'multipleOf-range'
            )
          );
        }

        const selectedMultiple = fakerInstance.number.int({
          min: minMultiple,
          max: maxMultiple,
        });
        return ok(selectedMultiple * schema.multipleOf);
      }

      // Pour multipleOf décimal, collecter les entiers valides
      const validIntegers: number[] = [];
      const step = Math.max(1, Math.floor(schema.multipleOf));

      // Parcourir efficacement en commençant par les multiples proches
      for (let i = min; i <= max && validIntegers.length < 100; i += step) {
        for (let offset = 0; offset < step && i + offset <= max; offset++) {
          const candidate = i + offset;
          const division = candidate / schema.multipleOf;
          // Vérifier si division donne un entier (tolérance pour float)
          if (Math.abs(division - Math.round(division)) < 1e-10) {
            validIntegers.push(candidate);
          }
        }
      }

      if (validIntegers.length === 0) {
        return err(
          new GenerationError(
            `No integer satisfies multipleOf ${schema.multipleOf} in range [${min}, ${max}]`,
            'No valid integer values for this multipleOf constraint',
            context.path,
            'multipleOf-range'
          )
        );
      }

      return ok(fakerInstance.helpers.arrayElement(validIntegers));
    }

    // Ensure final value is an integer
    value = Math.round(value);

    // Final validation
    if (!this.meetsConstraints(value, schema)) {
      return err(
        new GenerationError(
          `Generated value ${value} does not meet integer constraints`,
          'Integer constraints may be too restrictive or conflicting',
          context.path,
          'constraints'
        )
      );
    }

    return ok(value);
  }

  /**
   * Generate edge case integer values
   */
  private generateEdgeValue(
    min: number,
    max: number,
    schema: IntegerSchema,
    fakerInstance: any
  ): number {
    const edgeCases: number[] = [];

    // Add boundary values
    edgeCases.push(min, max);

    // Add zero if it's within range
    if (min <= 0 && max >= 0) {
      edgeCases.push(0);
    }

    // Add ±1 from boundaries if within range
    if (min + 1 <= max) {
      edgeCases.push(min + 1);
    }
    if (max - 1 >= min) {
      edgeCases.push(max - 1);
    }

    // Add small positive/negative values if in range
    if (min <= 1 && max >= 1) {
      edgeCases.push(1);
    }
    if (min <= -1 && max >= -1) {
      edgeCases.push(-1);
    }

    // Add values based on multipleOf (Draft-07+ compliant)
    if (schema.multipleOf !== undefined && schema.multipleOf > 0) {
      // Ajouter le premier et dernier multiple valide
      for (const candidate of [min, min + 1, max - 1, max]) {
        if (candidate >= min && candidate <= max) {
          const division = candidate / schema.multipleOf;
          if (Math.abs(division - Math.round(division)) < 1e-10) {
            edgeCases.push(candidate);
            break; // Un seul suffit pour les edge cases
          }
        }
      }
    }

    // Remove duplicates
    const uniqueEdgeCases = Array.from(new Set(edgeCases));

    if (uniqueEdgeCases.length > 0) {
      return fakerInstance.helpers.arrayElement(uniqueEdgeCases);
    }

    // Fallback to normal generation
    return this.generateNormalValue(min, max, fakerInstance);
  }

  /**
   * Generate normal integer values within range
   */
  private generateNormalValue(
    min: number,
    max: number,
    fakerInstance: any
  ): number {
    // Use the actual bounds - don't artificially restrict them
    // If min/max are extreme values, faker can handle them
    const effectiveMin = Number.isFinite(min) ? Math.ceil(min) : -1000000;
    const effectiveMax = Number.isFinite(max) ? Math.floor(max) : 1000000;

    // Ensure we have valid bounds
    if (effectiveMin > effectiveMax) {
      return effectiveMin; // Edge case: single valid value
    }

    return fakerInstance.number.int({
      min: effectiveMin,
      max: effectiveMax,
    });
  }

  /**
   * Normalize exclusive bounds to inclusive bounds for integers
   */
  protected normalizeExclusiveBounds(
    exclusiveMinimum?: number,
    exclusiveMaximum?: number,
    minimum?: number,
    maximum?: number
  ): { min?: number; max?: number } {
    let min = minimum;
    let max = maximum;

    // Convert exclusive bounds to inclusive for integers
    if (typeof exclusiveMinimum === 'number') {
      const inclusiveMin = Math.floor(exclusiveMinimum) + 1;
      min = min === undefined ? inclusiveMin : Math.max(min, inclusiveMin);
    }

    if (typeof exclusiveMaximum === 'number') {
      const inclusiveMax = Math.ceil(exclusiveMaximum) - 1;
      max = max === undefined ? inclusiveMax : Math.min(max, inclusiveMax);
    }

    return { min, max };
  }

  /**
   * Check if integer value meets all schema constraints
   */
  private meetsConstraints(value: number, schema: IntegerSchema): boolean {
    // Must be an integer and a safe integer
    if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
      return false;
    }

    // Check enum constraint first - if enum exists, value must be in enum
    if (schema.enum) {
      const enumMatch = schema.enum.some((enumValue) => {
        const integerValue = this.toInteger(enumValue);
        return integerValue !== null && value === integerValue;
      });
      if (!enumMatch) {
        return false;
      }
      // If enum matches, still check other constraints if they exist
      // (enum values should satisfy all constraints)
    }

    // Check const constraint - if const exists, value must match const
    if (schema.const !== undefined) {
      const constValue = this.toInteger(schema.const);
      if (constValue === null || value !== constValue) {
        return false;
      }
      // If const matches, still check other constraints if they exist
      // (const value should satisfy all constraints)
    }

    // Check minimum constraint
    if (schema.minimum !== undefined && value < schema.minimum) {
      return false;
    }

    // Check maximum constraint
    if (schema.maximum !== undefined && value > schema.maximum) {
      return false;
    }

    // Check exclusive minimum constraint
    if (
      typeof schema.exclusiveMinimum === 'number' &&
      value <= schema.exclusiveMinimum
    ) {
      return false;
    }

    // Check exclusive maximum constraint
    if (
      typeof schema.exclusiveMaximum === 'number' &&
      value >= schema.exclusiveMaximum
    ) {
      return false;
    }

    // Check multipleOf constraint (Draft-07 compliance)
    if (schema.multipleOf !== undefined) {
      // multipleOf must be > 0 (can be decimal for integers)
      if (schema.multipleOf <= 0) {
        return false; // Invalid constraint
      }

      // Draft-07: value / multipleOf must result in an integer
      const division = value / schema.multipleOf;
      const epsilon = 1e-10; // Tolerance for floating point errors
      if (Math.abs(division - Math.round(division)) > epsilon) {
        return false;
      }
    }

    return true;
  }

  validate(value: any, schema: Schema): boolean {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return false;
    }

    if (!this.supports(schema)) {
      return false;
    }

    const integerSchema = schema as IntegerSchema;
    return this.meetsConstraints(value, integerSchema);
  }

  getExamples(schema: Schema): number[] {
    if (!this.supports(schema)) {
      return [];
    }

    const integerSchema = schema as IntegerSchema;

    // Return enum values if available
    if (integerSchema.enum) {
      return integerSchema.enum
        .map((v) => this.toInteger(v))
        .filter((v): v is number => v !== null);
    }

    // Return const value if available
    if (integerSchema.const !== undefined) {
      const constValue = this.toInteger(integerSchema.const);
      return constValue !== null ? [constValue] : [];
    }

    // Return schema examples if available
    if (integerSchema.examples && integerSchema.examples.length > 0) {
      return integerSchema.examples
        .map((v) => this.toInteger(v))
        .filter((v): v is number => v !== null);
    }

    // Generate examples based on constraints
    const examples: number[] = [];

    const bounds = this.normalizeExclusiveBounds(
      integerSchema.exclusiveMinimum,
      integerSchema.exclusiveMaximum,
      integerSchema.minimum,
      integerSchema.maximum
    );

    const min = Math.ceil(bounds.min ?? -100);
    const max = Math.floor(bounds.max ?? 100);

    // Add boundary examples
    examples.push(min, max);

    // Add middle value
    const mid = Math.floor((min + max) / 2);
    examples.push(mid);

    // Add zero if within range
    if (min <= 0 && max >= 0) {
      examples.push(0);
    }

    // Add small values
    if (min <= 1 && max >= 1) {
      examples.push(1);
    }
    if (min <= -1 && max >= -1) {
      examples.push(-1);
    }

    // Add multipleOf examples (Draft-07 compliant)
    if (
      integerSchema.multipleOf !== undefined &&
      integerSchema.multipleOf > 0
    ) {
      // Find valid integer multiples
      const minMultiple = Math.ceil(min / integerSchema.multipleOf);
      const maxMultiple = Math.floor(max / integerSchema.multipleOf);

      for (let m = minMultiple; m <= maxMultiple && examples.length < 20; m++) {
        const multiple = m * integerSchema.multipleOf;
        if (Number.isInteger(multiple) && multiple >= min && multiple <= max) {
          examples.push(multiple);
        }
      }
    }

    return [...new Set(examples)].filter((n) =>
      this.meetsConstraints(n, integerSchema)
    );
  }

  getPriority(): number {
    return 10; // Standard priority for integer generation
  }
}
