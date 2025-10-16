/**
 * Number Generator
 * Generates floating-point numbers with JSON Schema Draft 7+ constraint support
 *
 * Features:
 * - Supports minimum, maximum, exclusiveMinimum, exclusiveMaximum constraints
 * - Handles multipleOf with floating-point precision awareness
 * - Draft 7+ compliance: rejects NaN/Infinity constraints, multipleOf must be > 0
 * - Enum and const value generation with constraint validation
 * - Scenario-based generation (normal, edge) with deterministic seed support
 *
 * Limitations:
 * - Extremely small ranges (< 1e-300) may not be handled reliably due to
 *   JavaScript floating-point precision limits
 * - Subnormal values near Number.MIN_VALUE may have reduced accuracy
 * - MultipleOf validation uses epsilon tolerance for floating-point comparisons
 * - MultipleOf with irrational numbers (π, e, √2) may have precision issues
 * - For multipleOf < 1e-15, validation tolerance may cause edge case inconsistencies
 *
 * Core generator component - complexity and line limits are disabled
 * for cohesion and performance per CLAUDE.md guidelines
 */

/* eslint-disable max-lines, max-lines-per-function, complexity, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */

import { Result, ok, err } from '../../types/result.js';
import { GenerationError } from '../../types/errors.js';
import type { Schema, NumberSchema } from '../../types/schema.js';
import {
  DataGenerator,
  GeneratorContext,
  GenerationConfig,
} from '../data-generator.js';

export class NumberGenerator extends DataGenerator {
  // Default bounds constants for consistent behavior across methods
  private static readonly DEFAULT_MIN_BOUND = -1000000;
  private static readonly DEFAULT_MAX_BOUND = 1000000;
  private static readonly EXAMPLE_MIN_BOUND = -100;
  private static readonly EXAMPLE_MAX_BOUND = 100;

  // Performance and precision thresholds
  private static readonly LARGE_MULTIPLE_THRESHOLD = 1000000;
  private static readonly SEGMENTATION_SIZE = 1000;
  private static readonly PRECISION_LIMIT = 1e-100;
  supports(schema: Schema): boolean {
    if (
      typeof schema !== 'object' ||
      schema === null ||
      schema.type !== 'number'
    ) {
      return false;
    }

    const numberSchema = schema as NumberSchema;

    // Reject Draft-04 boolean exclusive bounds (Draft-07+ only supports numeric)
    if (
      typeof numberSchema.exclusiveMinimum === 'boolean' ||
      typeof numberSchema.exclusiveMaximum === 'boolean'
    ) {
      return false;
    }

    // Reject multipleOf <= 0 (must be positive number)
    if (numberSchema.multipleOf !== undefined && numberSchema.multipleOf <= 0) {
      return false;
    }

    // Reject non-finite constraints (NaN/Infinity)
    if (
      numberSchema.minimum !== undefined &&
      !Number.isFinite(numberSchema.minimum)
    ) {
      return false;
    }
    if (
      numberSchema.maximum !== undefined &&
      !Number.isFinite(numberSchema.maximum)
    ) {
      return false;
    }
    if (
      typeof numberSchema.exclusiveMinimum === 'number' &&
      !Number.isFinite(numberSchema.exclusiveMinimum)
    ) {
      return false;
    }
    if (
      typeof numberSchema.exclusiveMaximum === 'number' &&
      !Number.isFinite(numberSchema.exclusiveMaximum)
    ) {
      return false;
    }
    if (
      numberSchema.multipleOf !== undefined &&
      !Number.isFinite(numberSchema.multipleOf)
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
          `NumberGenerator does not support schema type: ${typeof schema === 'object' && schema !== null ? schema.type : 'unknown'}`,
          undefined,
          context.path,
          'type'
        )
      );
    }

    const numberSchema = schema as NumberSchema;

    // Validate schema constraints are valid numbers (Draft 7+ compliance)
    if (
      numberSchema.minimum !== undefined &&
      !Number.isFinite(numberSchema.minimum)
    ) {
      return err(
        new GenerationError(
          `Invalid minimum constraint: ${numberSchema.minimum}`,
          'Minimum must be a finite number',
          context.path,
          'minimum'
        )
      );
    }

    if (
      numberSchema.maximum !== undefined &&
      !Number.isFinite(numberSchema.maximum)
    ) {
      return err(
        new GenerationError(
          `Invalid maximum constraint: ${numberSchema.maximum}`,
          'Maximum must be a finite number',
          context.path,
          'maximum'
        )
      );
    }

    if (
      typeof numberSchema.exclusiveMinimum === 'number' &&
      !Number.isFinite(numberSchema.exclusiveMinimum)
    ) {
      return err(
        new GenerationError(
          `Invalid exclusiveMinimum constraint: ${numberSchema.exclusiveMinimum}`,
          'ExclusiveMinimum must be a finite number',
          context.path,
          'exclusiveMinimum'
        )
      );
    }

    if (
      typeof numberSchema.exclusiveMaximum === 'number' &&
      !Number.isFinite(numberSchema.exclusiveMaximum)
    ) {
      return err(
        new GenerationError(
          `Invalid exclusiveMaximum constraint: ${numberSchema.exclusiveMaximum}`,
          'ExclusiveMaximum must be a finite number',
          context.path,
          'exclusiveMaximum'
        )
      );
    }

    if (
      numberSchema.multipleOf !== undefined &&
      (!Number.isFinite(numberSchema.multipleOf) ||
        numberSchema.multipleOf <= 0)
    ) {
      return err(
        new GenerationError(
          `Invalid multipleOf constraint: ${numberSchema.multipleOf}`,
          'MultipleOf must be a finite positive number (Draft 7+ compliance)',
          context.path,
          'multipleOf'
        )
      );
    }

    try {
      // Handle enum values first (highest priority)
      if (numberSchema.enum) {
        return this.generateFromEnum(numberSchema.enum, context);
      }

      // Handle const values
      if (numberSchema.const !== undefined) {
        const constValue = Number(numberSchema.const);
        if (isNaN(constValue) || !Number.isFinite(constValue)) {
          return err(
            new GenerationError(
              `Invalid const value for number: ${numberSchema.const}`,
              'Const value must be a finite number (Draft 7+ compliance)',
              context.path,
              'const'
            )
          );
        }

        // Validate const value against other constraints
        if (!this.meetsConstraints(constValue, numberSchema)) {
          return err(
            new GenerationError(
              `Const value ${constValue} does not satisfy schema constraints`,
              'Ensure const value is compatible with minimum, maximum, multipleOf, and exclusive bounds',
              context.path,
              'const-constraints'
            )
          );
        }

        return ok(constValue);
      }

      // Handle default values
      if (numberSchema.default !== undefined) {
        const defaultValue = Number(numberSchema.default);
        if (
          !isNaN(defaultValue) &&
          this.meetsConstraints(defaultValue, numberSchema)
        ) {
          return ok(defaultValue);
        }
      }

      // Handle example values
      if (numberSchema.examples && numberSchema.examples.length > 0) {
        const fakerInstance = this.prepareFaker(context);
        const example = fakerInstance.helpers.arrayElement(
          numberSchema.examples
        );
        const exampleValue = Number(example);
        if (
          !isNaN(exampleValue) &&
          this.meetsConstraints(exampleValue, numberSchema)
        ) {
          return ok(exampleValue);
        }
      }

      // Generate number within constraints
      return this.generateWithinConstraints(numberSchema, context);
    } catch (error) {
      return err(
        new GenerationError(
          `Failed to generate number: ${String(error)}`,
          'Check numeric constraints and ensure valid ranges',
          context.path,
          'number-generation',
          { error: String(error) }
        )
      );
    }
  }

  /**
   * Generate number from enum values, respecting other constraints
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

    const numberSchema = context.schema as NumberSchema;

    // Validate that all enum values are finite numbers (Draft 7+ compliance)
    for (const value of enumValues) {
      const numericValue = Number(value);

      if (isNaN(numericValue) || !isFinite(numericValue)) {
        return err(
          new GenerationError(
            `Invalid enum value: ${value} (NaN/Infinity not allowed in number enum)`,
            'All enum values must be finite numbers (Draft 7+ compliance)',
            context.path,
            'enum'
          )
        );
      }
    }

    // Filter enum values to only those that satisfy all other constraints
    // Use AJV-compatible strict validation for enum filtering to ensure oracle compliance
    const validEnumValues: number[] = [];

    for (const value of enumValues) {
      const numericValue = Number(value);

      // Check if this enum value satisfies all other constraints using AJV-compatible logic
      if (this.meetsConstraintsStrict(numericValue, numberSchema)) {
        validEnumValues.push(numericValue);
      }
    }

    if (validEnumValues.length === 0) {
      return err(
        new GenerationError(
          'No enum values satisfy the schema constraints',
          'Ensure enum values are compatible with minimum, maximum, multipleOf, and exclusive bounds',
          context.path,
          'enum-constraints'
        )
      );
    }

    const fakerInstance = this.prepareFaker(context);
    const selectedValue = fakerInstance.helpers.arrayElement(validEnumValues);
    return ok(selectedValue);
  }

  /**
   * Generate number within schema constraints
   */
  private generateWithinConstraints(
    schema: NumberSchema,
    context: GeneratorContext
  ): Result<number, GenerationError> {
    // Calculate bounds and validate range
    const boundsResult = this.calculateValidBounds(schema, context);
    if (!boundsResult.isOk()) {
      return boundsResult;
    }
    const { min, max } = boundsResult.value;

    // Handle precision-limited ranges
    const precisionResult = this.handlePrecisionLimitedRange(
      min,
      max,
      schema,
      context
    );
    if (precisionResult !== null) {
      return precisionResult;
    }

    // If multipleOf is set, ensure at least one valid multiple exists in range
    if (schema.multipleOf !== undefined && schema.multipleOf > 0) {
      const minMultiple = Math.ceil(min / schema.multipleOf);
      const maxMultiple = Math.floor(max / schema.multipleOf);
      if (minMultiple > maxMultiple) {
        return err(
          new GenerationError(
            `No valid multiple of ${schema.multipleOf} exists within range [${min}, ${max}]`,
            'Adjust bounds or multipleOf to allow at least one valid value',
            context.path,
            'multipleOf-range'
          )
        );
      }
    }

    // Generate value based on constraints
    const value = this.generateValueByConstraints(min, max, schema, context);

    // Final validation
    if (!this.meetsConstraints(value, schema)) {
      return err(
        new GenerationError(
          `Generated value ${value} does not meet constraints`,
          'Constraints may be too restrictive or conflicting',
          context.path,
          'constraints'
        )
      );
    }

    return ok(value);
  }

  /**
   * Calculate valid bounds from schema constraints
   */
  private calculateValidBounds(
    schema: NumberSchema,
    context: GeneratorContext
  ): Result<{ min: number; max: number }, GenerationError> {
    // Normalize exclusive bounds to inclusive bounds
    const bounds = this.normalizeExclusiveBoundsULP(
      typeof schema.exclusiveMinimum === 'number'
        ? schema.exclusiveMinimum
        : undefined,
      typeof schema.exclusiveMaximum === 'number'
        ? schema.exclusiveMaximum
        : undefined,
      schema.minimum,
      schema.maximum
    );

    const min = bounds.min ?? NumberGenerator.DEFAULT_MIN_BOUND;
    const max = bounds.max ?? NumberGenerator.DEFAULT_MAX_BOUND;

    // Validate range
    if (min > max) {
      return err(
        new GenerationError(
          `Invalid range: minimum (${min}) > maximum (${max})`,
          'Ensure minimum <= maximum',
          context.path,
          'range'
        )
      );
    }

    // Check for impossible exclusive bounds
    if (
      min >= max &&
      (schema.exclusiveMinimum !== undefined ||
        schema.exclusiveMaximum !== undefined)
    ) {
      return err(
        new GenerationError(
          `Impossible exclusive bounds: no value can be both > ${min} and < ${max}`,
          'Adjust exclusive bounds to allow valid range',
          context.path,
          'exclusive-bounds'
        )
      );
    }

    return ok({ min, max });
  }

  /**
   * Handle ranges with precision limitations
   * @returns Result if range needs special handling, null if normal processing should continue
   */
  private handlePrecisionLimitedRange(
    min: number,
    max: number,
    schema: NumberSchema,
    context: GeneratorContext
  ): Result<number, GenerationError> | null {
    // Handle extremely small ranges that are at the limit of floating-point precision
    const isSubnormalRange = max > 0 && max <= NumberGenerator.PRECISION_LIMIT;
    const hasSmallRange = max - min <= NumberGenerator.PRECISION_LIMIT;

    if (!isSubnormalRange && !hasSmallRange) {
      return null; // Continue with normal processing
    }

    // For subnormal or extremely small ranges, use special handling
    const candidates = [min, max, (min + max) / 2, 0];

    for (const candidate of candidates) {
      if (
        Number.isFinite(candidate) &&
        this.meetsConstraints(candidate, schema)
      ) {
        return ok(candidate);
      }
    }

    // If no simple candidate works, generate using safe interpolation
    const safeMin = Math.max(min, -Number.MAX_SAFE_INTEGER / 1e6);
    const safeMax = Math.min(max, Number.MAX_SAFE_INTEGER / 1e6);
    const fakerInstance = this.prepareFaker(context);
    const t = fakerInstance.number.float({ min: 0, max: 1 });
    const value = safeMin + (safeMax - safeMin) * t;

    if (Number.isFinite(value) && this.meetsConstraints(value, schema)) {
      return ok(value);
    }

    // Last resort: return min if it's valid
    if (this.meetsConstraints(min, schema)) {
      return ok(min);
    }

    return err(
      new GenerationError(
        `Range too small for floating-point precision: [${min}, ${max}]`,
        'Adjust bounds to allow representable values',
        context.path,
        'precision-limit'
      )
    );
  }

  /**
   * Generate value based on constraint type priority
   */
  private generateValueByConstraints(
    min: number,
    max: number,
    schema: NumberSchema,
    context: GeneratorContext
  ): number {
    // Handle multipleOf constraint (highest priority after enum/const)
    if (schema.multipleOf !== undefined && schema.multipleOf > 0) {
      return this.generateMultipleOfValue(min, max, schema.multipleOf, context);
    }

    // Special case: when min equals max, return that exact value
    if (min === max) {
      return min;
    }

    const fakerInstance = this.prepareFaker(context);

    if (context.scenario === 'edge') {
      // Generate edge case values
      return this.generateEdgeValue(min, max, schema, fakerInstance);
    } else {
      // Generate normal values within range
      return this.generateNormalValue(min, max, fakerInstance);
    }
  }

  /**
   * Generate value that satisfies multipleOf constraint
   */
  private generateMultipleOfValue(
    min: number,
    max: number,
    multipleOf: number,
    context: GeneratorContext
  ): number {
    const fakerInstance = this.prepareFaker(context);

    // Find the first multiple >= min
    const minMultiple = Math.ceil(min / multipleOf);
    const maxMultiple = Math.floor(max / multipleOf);
    // Precondition: caller ensured there is at least one valid multiple.
    // If not, fall back to min to avoid throwing in core. The caller will
    // validate and return Err if constraints are not met.
    if (minMultiple > maxMultiple) {
      return min;
    }

    const totalMultiples = maxMultiple - minMultiple + 1;

    // Optimization for large intervals: use segmented approach to avoid bias
    if (totalMultiples > NumberGenerator.LARGE_MULTIPLE_THRESHOLD) {
      const segments = NumberGenerator.SEGMENTATION_SIZE;
      const segmentSize = totalMultiples / segments;
      const randomSegment = fakerInstance.number.int({
        min: 0,
        max: segments - 1,
      });
      const segmentStart = Math.floor(
        minMultiple + randomSegment * segmentSize
      );
      const segmentEnd = Math.floor(
        minMultiple + (randomSegment + 1) * segmentSize - 1
      );
      const randomMultipleIndex = fakerInstance.number.int({
        min: segmentStart,
        max: Math.min(segmentEnd, maxMultiple),
      });
      return this.generateValidMultiple(randomMultipleIndex, multipleOf);
    } else {
      // Standard approach for reasonable-sized ranges
      const randomMultipleIndex = fakerInstance.number.int({
        min: minMultiple,
        max: maxMultiple,
      });
      return this.generateValidMultiple(randomMultipleIndex, multipleOf);
    }
  }

  /**
   * Generate edge case values (boundaries, special values)
   */
  private generateEdgeValue(
    min: number,
    max: number,
    schema: NumberSchema,
    fakerInstance: any
  ): number {
    const edgeCases: number[] = [];

    // Add boundary values
    if (min !== Number.MIN_SAFE_INTEGER) {
      edgeCases.push(min);
    }
    if (max !== Number.MAX_SAFE_INTEGER) {
      edgeCases.push(max);
    }

    // Add zero if it's within range
    if (min <= 0 && max >= 0) {
      edgeCases.push(0);
    }

    // Add values near zero but non-zero (Number.EPSILON edge cases)
    if (min < -Number.EPSILON && max > -Number.EPSILON) {
      edgeCases.push(-Number.EPSILON);
    }
    if (min < Number.EPSILON && max > Number.EPSILON) {
      edgeCases.push(Number.EPSILON);
    }

    // Add small values near boundaries (only if range is large enough)
    const delta = 0.1;
    if (max - min >= 2 * delta) {
      if (min !== Number.MIN_SAFE_INTEGER && min < max) {
        edgeCases.push(min + delta);
      }
      if (max !== Number.MAX_SAFE_INTEGER && max > min) {
        edgeCases.push(max - delta);
      }
    }

    // Add values based on multipleOf - including inflection points
    if (schema.multipleOf !== undefined && schema.multipleOf > 0) {
      const minMultipleIndex = Math.ceil(min / schema.multipleOf);
      const maxMultipleIndex = Math.floor(max / schema.multipleOf);

      const nearMin = this.generateValidMultiple(
        minMultipleIndex,
        schema.multipleOf
      );
      const nearMax = this.generateValidMultiple(
        maxMultipleIndex,
        schema.multipleOf
      );

      // Add first valid multiple
      if (nearMin <= max) {
        edgeCases.push(nearMin);
      }

      // Add last valid multiple
      if (nearMax >= min && nearMax !== nearMin) {
        edgeCases.push(nearMax);
      }

      // Add 2nd multiple if it exists (inflection point)
      const secondMultiple = this.generateValidMultiple(
        minMultipleIndex + 1,
        schema.multipleOf
      );
      if (secondMultiple <= max) {
        edgeCases.push(secondMultiple);
      }

      // Add penultimate multiple if it exists (inflection point)
      const penultimateMultiple = this.generateValidMultiple(
        maxMultipleIndex - 1,
        schema.multipleOf
      );
      if (penultimateMultiple >= min && penultimateMultiple !== nearMin) {
        edgeCases.push(penultimateMultiple);
      }
    }

    if (edgeCases.length > 0) {
      return fakerInstance.helpers.arrayElement(edgeCases);
    }

    // Fallback to normal generation
    return this.generateNormalValue(min, max, fakerInstance);
  }

  /**
   * Generate normal values within range
   */
  private generateNormalValue(
    min: number,
    max: number,
    fakerInstance: any
  ): number {
    // Handle extreme ranges that would cause overflow
    const range = max - min;
    if (
      !Number.isFinite(range) ||
      !Number.isFinite(min) ||
      !Number.isFinite(max)
    ) {
      // For extreme bounds, clamp to safe values and interpolate
      const safeMin = Math.max(min, -Number.MAX_SAFE_INTEGER);
      const safeMax = Math.min(max, Number.MAX_SAFE_INTEGER);
      const t = fakerInstance.number.float({ min: 0, max: 1 });
      return safeMin + (safeMax - safeMin) * t;
    }

    // For very small ranges, use direct interpolation
    if (range < NumberGenerator.PRECISION_LIMIT) {
      const t = fakerInstance.number.float({ min: 0, max: 1 });
      return min + range * t;
    }

    try {
      return fakerInstance.number.float({
        min: min,
        max: max,
        fractionDigits: fakerInstance.number.int({ min: 0, max: 6 }),
      });
    } catch (error) {
      // Fallback to direct interpolation using faker's randomness
      const t = fakerInstance.number.float({ min: 0, max: 1 });
      return min + range * t;
    }
  }

  /**
   * Generate a multiple that AJV will validate as correct
   * Uses AJV's exact validation logic as oracle: (value / multipleOf) === parseInt(value / multipleOf)
   * Handles IEEE 754 precision issues by testing candidates before returning
   */
  private generateValidMultiple(index: number, multipleOf: number): number {
    // For integer multipleOf >= 1, direct multiplication is safe
    if (multipleOf >= 1 && Number.isInteger(multipleOf)) {
      return index * multipleOf;
    }

    // Helper function to test if AJV would accept a value
    const wouldAjvAccept = (value: number): boolean => {
      const quotient = value / multipleOf;
      return quotient === Math.floor(quotient);
    };

    // Try the direct calculation first
    let candidate = index * multipleOf;
    if (wouldAjvAccept(candidate)) {
      return candidate;
    }

    // If direct fails, try with toFixed for cleaner decimal representation
    const multipleOfStr = multipleOf.toString();
    if (multipleOfStr.includes('.')) {
      const decimalPlaces = multipleOfStr.split('.')[1]?.length ?? 0;
      candidate = parseFloat((index * multipleOf).toFixed(decimalPlaces));

      if (wouldAjvAccept(candidate)) {
        return candidate;
      }
    }

    // Search nearby indices for an AJV-safe value
    // Some indices produce IEEE 754 errors, others don't
    for (let offset = 1; offset <= 5; offset++) {
      // Try higher index
      candidate = (index + offset) * multipleOf;
      if (wouldAjvAccept(candidate)) {
        return candidate;
      }

      // Try lower index (if positive)
      if (index - offset >= 0) {
        candidate = (index - offset) * multipleOf;
        if (wouldAjvAccept(candidate)) {
          return candidate;
        }
      }
    }

    // Final fallback: return direct multiplication
    // This may fail AJV but will pass our tolerance-based validation
    return index * multipleOf;
  }

  /**
   * Calculate Unit in the Last Place (ULP) for a number
   * ULP represents the spacing between adjacent floating-point numbers
   */
  private ulp(x: number): number {
    if (!Number.isFinite(x)) return Number.NaN;
    const ax = Math.abs(x);
    if (ax === 0) return Number.MIN_VALUE; // plus petit pas > 0
    // ulp(x) ≈ 2^(⌊log2(|x|)⌋ - 52)
    const exp = Math.floor(Math.log2(ax));
    return Math.pow(2, exp - 52);
  }

  /**
   * Get the next representable floating-point number greater than x
   */
  private nextUp(x: number): number {
    if (!Number.isFinite(x)) return x;
    return x + this.ulp(x);
  }

  /**
   * Get the next representable floating-point number less than x
   */
  private nextDown(x: number): number {
    if (!Number.isFinite(x)) return x;
    return x - this.ulp(x);
  }

  /**
   * Convertit bornes exclusives en inclusives en avançant/reculant d'1 ULP
   * Cette approche garantit une précision mathématiquement exacte
   */
  private normalizeExclusiveBoundsULP(
    exclusiveMin?: number | undefined,
    exclusiveMax?: number | undefined,
    minimum?: number | undefined,
    maximum?: number | undefined
  ): { min?: number; max?: number } {
    let min = minimum;
    let max = maximum;

    if (typeof exclusiveMin === 'number') {
      const cand = this.nextUp(exclusiveMin);
      min = min === undefined ? cand : Math.max(min, cand);
    }
    if (typeof exclusiveMax === 'number') {
      const cand = this.nextDown(exclusiveMax);
      max = max === undefined ? cand : Math.min(max, cand);
    }

    // Si min/max sont ±Infinity, on les laisse undefined pour les valeurs par défaut
    if (min !== undefined && !Number.isFinite(min)) min = undefined;
    if (max !== undefined && !Number.isFinite(max)) max = undefined;

    return { min, max };
  }

  /**
   * Check if value is multiple of multipleOf
   * @param value The value to check
   * @param multipleOf The multiple to check against
   * @param strict If true, uses AJV-compatible exact validation; if false, uses ULP-based tolerance for IEEE 754 precision issues
   */
  private isMultipleOfValid(
    value: number,
    multipleOf: number,
    strict: boolean = false
  ): boolean {
    if (
      multipleOf <= 0 ||
      !Number.isFinite(value) ||
      !Number.isFinite(multipleOf)
    )
      return false;

    const quotient = value / multipleOf;

    if (strict) {
      // AJV-compatible strict validation (no tolerance)
      return quotient === Math.floor(quotient);
    } else {
      // ULP-based robust tolerance for IEEE 754 precision issues like 0.1 + 0.2 !== 0.3
      const k = Math.round(quotient);
      const recon = k * multipleOf;
      const absErr = Math.abs(value - recon);

      // Tolerance: sum of 2 relevant ULPs + small relative margin
      const tol =
        this.ulp(value) +
        Math.abs(k) * this.ulp(multipleOf) +
        Math.abs(value) * 1e-15;

      return absErr <= tol;
    }
  }

  /**
   * Check if a value meets constraints using AJV-compatible strict validation
   * Used for enum filtering to ensure oracle compliance
   */
  private meetsConstraintsStrict(value: number, schema: NumberSchema): boolean {
    // Check minimum constraint
    if (schema.minimum !== undefined && value < schema.minimum) {
      return false;
    }

    // Check maximum constraint
    if (schema.maximum !== undefined && value > schema.maximum) {
      return false;
    }

    // Check exclusive minimum constraint (Draft 7+ numeric form only)
    if (
      typeof schema.exclusiveMinimum === 'number' &&
      value <= schema.exclusiveMinimum
    ) {
      return false;
    }
    // Special case: -0 with exclusiveMinimum: 0 should be rejected
    if (schema.exclusiveMinimum === 0 && Object.is(value, -0)) {
      return false; // -0 is not > 0
    }

    // Check exclusive maximum constraint (Draft 7+ numeric form only)
    if (
      typeof schema.exclusiveMaximum === 'number' &&
      value >= schema.exclusiveMaximum
    ) {
      return false;
    }

    // Check multipleOf constraint using AJV's strict logic (no tolerance)
    if (schema.multipleOf !== undefined && schema.multipleOf > 0) {
      if (!this.isMultipleOfValid(value, schema.multipleOf, true)) {
        return false;
      }
    }

    // Check const constraint - if const exists, value must match const
    if (schema.const !== undefined) {
      const constValue = Number(schema.const);
      if (isNaN(constValue)) {
        return false;
      }
      // Use Object.is for strict equality (handles -0 vs 0)
      return Object.is(value, constValue);
    }

    return true;
  }

  /**
   * Check if value meets all schema constraints
   */
  private meetsConstraints(value: number, schema: NumberSchema): boolean {
    // Check enum constraint first - if enum exists, value must be in enum
    if (schema.enum) {
      const enumMatch = schema.enum.some((enumValue) => {
        const numericValue = Number(enumValue);
        if (isNaN(numericValue) || !isFinite(numericValue)) {
          return false;
        }
        // Use === semantics for practical compatibility (-0 === 0 is true)
        return value === numericValue;
      });
      if (!enumMatch) {
        return false;
      }
      // If enum matches, still check other constraints if they exist
      // (enum values should satisfy all constraints)
    }

    // Check const constraint - if const exists, value must match const
    if (schema.const !== undefined) {
      const constValue = Number(schema.const);
      if (isNaN(constValue)) {
        return false;
      }
      // Use === semantics for practical compatibility (-0 === 0 is true)
      if (value !== constValue) {
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

    // Check exclusive minimum constraint (Draft 7+ numeric form only)
    if (
      typeof schema.exclusiveMinimum === 'number' &&
      value <= schema.exclusiveMinimum
    ) {
      return false;
    }
    // Special case: -0 with exclusiveMinimum: 0 should be rejected
    // because -0 is not strictly greater than 0 (Object.is(-0, 0) === false)
    if (schema.exclusiveMinimum === 0 && Object.is(value, -0)) {
      return false; // -0 is not > 0
    }

    // Check exclusive maximum constraint (Draft 7+ numeric form only)
    if (
      typeof schema.exclusiveMaximum === 'number' &&
      value >= schema.exclusiveMaximum
    ) {
      return false;
    }

    // Check multipleOf constraint using tolerance for IEEE 754 compatibility
    if (schema.multipleOf !== undefined && schema.multipleOf > 0) {
      if (!this.isMultipleOfValid(value, schema.multipleOf, false)) {
        return false;
      }
    }

    return true;
  }

  validate(value: any, schema: Schema): boolean {
    if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
      return false;
    }

    if (!this.supports(schema)) {
      return false;
    }

    const numberSchema = schema as NumberSchema;
    return this.meetsConstraints(value, numberSchema);
  }

  getExamples(schema: Schema): number[] {
    if (!this.supports(schema)) {
      return [];
    }

    const numberSchema = schema as NumberSchema;

    // Return enum values if available
    if (numberSchema.enum) {
      return numberSchema.enum.map(Number).filter((n) => !isNaN(n));
    }

    // Return const value if available
    if (numberSchema.const !== undefined) {
      const constValue = Number(numberSchema.const);
      return !isNaN(constValue) ? [constValue] : [];
    }

    // Return schema examples if available
    if (numberSchema.examples && numberSchema.examples.length > 0) {
      return numberSchema.examples.map(Number).filter((n) => !isNaN(n));
    }

    // Generate examples based on constraints
    const examples: number[] = [];

    const bounds = this.normalizeExclusiveBoundsULP(
      typeof numberSchema.exclusiveMinimum === 'number'
        ? numberSchema.exclusiveMinimum
        : undefined,
      typeof numberSchema.exclusiveMaximum === 'number'
        ? numberSchema.exclusiveMaximum
        : undefined,
      numberSchema.minimum,
      numberSchema.maximum
    );

    const min = bounds.min ?? NumberGenerator.EXAMPLE_MIN_BOUND;
    const max = bounds.max ?? NumberGenerator.EXAMPLE_MAX_BOUND;

    // Check for impossible multipleOf constraints
    if (numberSchema.multipleOf !== undefined && numberSchema.multipleOf > 0) {
      const minMultipleIndex = Math.ceil(min / numberSchema.multipleOf);
      const maxMultipleIndex = Math.floor(max / numberSchema.multipleOf);

      const minMultiple = this.generateValidMultiple(
        minMultipleIndex,
        numberSchema.multipleOf
      );
      const maxMultiple = this.generateValidMultiple(
        maxMultipleIndex,
        numberSchema.multipleOf
      );

      // If no valid multiples exist in the range, return empty array
      if (minMultiple > max || maxMultiple < min) {
        return [];
      }

      // Generate multipleOf-based examples
      if (minMultiple <= max) {
        examples.push(minMultiple);
      }
      if (maxMultiple >= min && maxMultiple !== minMultiple) {
        examples.push(maxMultiple);
      }
      // Add a middle multiple if it exists
      const midMultipleIndex = Math.floor(
        (minMultipleIndex + maxMultipleIndex) / 2
      );
      const midMultiple = this.generateValidMultiple(
        midMultipleIndex,
        numberSchema.multipleOf
      );
      if (
        midMultiple >= min &&
        midMultiple <= max &&
        midMultiple !== minMultiple &&
        midMultiple !== maxMultiple
      ) {
        examples.push(midMultiple);
      }
    } else {
      // No multipleOf constraint - generate boundary and middle examples
      examples.push(min, max);
      examples.push((min + max) / 2);
    }

    // Add zero if within range
    if (min <= 0 && max >= 0) {
      examples.push(0);
    }

    // Filter examples and ensure uniqueness
    const filteredExamples = examples.filter((n) =>
      this.meetsConstraints(n, numberSchema)
    );
    return [...new Set(filteredExamples)];
  }

  getPriority(): number {
    return 10; // Standard priority for number generation
  }
}
