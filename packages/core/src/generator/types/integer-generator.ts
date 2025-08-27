/**
 * Integer Generator
 * Generates whole numbers (integers) with constraint support
 * Similar to NumberGenerator but ensures integer values
 */

import { faker } from '@faker-js/faker';
import { Result, ok, err } from '../../types/result';
import { GenerationError } from '../../types/errors';
import type { Schema, NumberSchema } from '../../types/schema';
import {
  DataGenerator,
  GeneratorContext,
  GenerationConfig,
} from '../data-generator';

export class IntegerGenerator extends DataGenerator {
  supports(schema: Schema): boolean {
    if (typeof schema !== 'object' || schema === null || schema.type !== 'integer') {
      return false;
    }
    
    const integerSchema = schema as NumberSchema;
    
    // Reject Draft-04 boolean exclusive bounds (Draft-07+ only supports numeric)
    if (typeof integerSchema.exclusiveMinimum === 'boolean' || 
        typeof integerSchema.exclusiveMaximum === 'boolean') {
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

    const integerSchema = schema as NumberSchema;

    try {
      // Handle enum values first (highest priority)
      if (integerSchema.enum) {
        return this.generateFromEnum(integerSchema.enum, context);
      }

      // Handle const values
      if (integerSchema.const !== undefined) {
        const constValue = this.toInteger(integerSchema.const);
        if (constValue === null) {
          return err(
            new GenerationError(
              `Invalid const value for integer: ${integerSchema.const}`,
              'Const value must be a valid integer',
              context.path,
              'const'
            )
          );
        }
        return ok(constValue);
      }

      // Handle default values
      if (integerSchema.default !== undefined) {
        const defaultValue = this.toInteger(integerSchema.default);
        if (defaultValue !== null && this.meetsConstraints(defaultValue, integerSchema)) {
          return ok(defaultValue);
        }
      }

      // Handle example values
      if (integerSchema.examples && integerSchema.examples.length > 0) {
        const fakerInstance = this.prepareFaker(context);
        const example = fakerInstance.helpers.arrayElement(integerSchema.examples);
        const exampleValue = this.toInteger(example);
        if (exampleValue !== null && this.meetsConstraints(exampleValue, integerSchema)) {
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
   * Generate integer from enum values
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

    const fakerInstance = this.prepareFaker(context);
    const selectedValue = fakerInstance.helpers.arrayElement(enumValues);
    const integerValue = this.toInteger(selectedValue);
    
    if (integerValue === null) {
      return err(
        new GenerationError(
          `Non-integer value in enum: ${selectedValue}`,
          'All enum values must be valid integers',
          context.path,
          'enum'
        )
      );
    }

    return ok(integerValue);
  }

  /**
   * Generate integer within schema constraints
   */
  private generateWithinConstraints(
    schema: NumberSchema,
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

    let min = Math.ceil(bounds.min ?? Number.MIN_SAFE_INTEGER);
    let max = Math.floor(bounds.max ?? Number.MAX_SAFE_INTEGER);

    // Ensure we have valid integer bounds
    min = Math.max(min, Number.MIN_SAFE_INTEGER);
    max = Math.min(max, Number.MAX_SAFE_INTEGER);

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

    // Apply multipleOf constraint for integers
    if (schema.multipleOf !== undefined && schema.multipleOf > 0) {
      const multipleOfInt = Math.max(1, Math.round(schema.multipleOf));
      value = this.applyMultipleOf(value, multipleOfInt);
      
      // Ensure multipleOf result is still within bounds
      if (value < min || value > max) {
        // Find nearest valid multiple within bounds
        value = this.findNearestValidMultiple(min, max, multipleOfInt);
      }
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
    schema: NumberSchema,
    fakerInstance: typeof faker
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

    // Add values based on multipleOf
    if (schema.multipleOf !== undefined && schema.multipleOf > 0) {
      const multipleOfInt = Math.max(1, Math.round(schema.multipleOf));
      const multiple = Math.ceil(min / multipleOfInt) * multipleOfInt;
      if (multiple <= max) {
        edgeCases.push(multiple);
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
    fakerInstance: typeof faker
  ): number {
    // Use reasonable bounds for normal generation
    const effectiveMin = Math.max(min, -1000000);
    const effectiveMax = Math.min(max, 1000000);
    
    return fakerInstance.number.int({
      min: effectiveMin,
      max: effectiveMax,
    });
  }

  /**
   * Find nearest valid integer multiple within bounds
   */
  private findNearestValidMultiple(min: number, max: number, multipleOf: number): number {
    const lowerMultiple = Math.ceil(min / multipleOf) * multipleOf;
    const upperMultiple = Math.floor(max / multipleOf) * multipleOf;

    if (lowerMultiple <= max) {
      return lowerMultiple;
    }
    if (upperMultiple >= min) {
      return upperMultiple;
    }

    // No valid multiple exists within range
    return min;
  }

  /**
   * Check if integer value meets all schema constraints
   */
  private meetsConstraints(value: number, schema: NumberSchema): boolean {
    // Must be an integer
    if (!Number.isInteger(value)) {
      return false;
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
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
      return false;
    }

    // Check exclusive maximum constraint
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) {
      return false;
    }

    // Check multipleOf constraint
    if (schema.multipleOf !== undefined && schema.multipleOf > 0) {
      const multipleOfInt = Math.max(1, Math.round(schema.multipleOf));
      if (value % multipleOfInt !== 0) {
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

    const integerSchema = schema as NumberSchema;
    return this.meetsConstraints(value, integerSchema);
  }

  getExamples(schema: Schema): number[] {
    if (!this.supports(schema)) {
      return [];
    }

    const integerSchema = schema as NumberSchema;

    // Return enum values if available
    if (integerSchema.enum) {
      return integerSchema.enum
        .map(v => this.toInteger(v))
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
        .map(v => this.toInteger(v))
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

    let min = Math.ceil(bounds.min ?? -100);
    let max = Math.floor(bounds.max ?? 100);

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

    // Add multipleOf examples
    if (integerSchema.multipleOf !== undefined && integerSchema.multipleOf > 0) {
      const multipleOfInt = Math.max(1, Math.round(integerSchema.multipleOf));
      const multiple = Math.ceil(min / multipleOfInt) * multipleOfInt;
      if (multiple <= max) {
        examples.push(multiple);
      }
    }

    return [...new Set(examples)].filter(n => this.meetsConstraints(n, integerSchema));
  }

  getPriority(): number {
    return 10; // Standard priority for integer generation
  }
}