/**
 * String Generator
 * Generates strings with format support, length constraints, pattern matching, and enum handling
 *
 * Core generator component - complexity and line limits are disabled
 * for cohesion and performance per CLAUDE.md guidelines
 */

/* eslint-disable max-lines-per-function, complexity, @typescript-eslint/no-explicit-any */

import { Result, ok, err } from '../../types/result';
import { GenerationError } from '../../types/errors';
import type { Schema, StringSchema } from '../../types/schema';
import {
  DataGenerator,
  GeneratorContext,
  GenerationConfig,
} from '../data-generator';

export class StringGenerator extends DataGenerator {
  supports(schema: Schema): boolean {
    return (
      typeof schema === 'object' && schema !== null && schema.type === 'string'
    );
  }

  generate(
    schema: Schema,
    context: GeneratorContext,
    _config?: GenerationConfig
  ): Result<string, GenerationError> {
    if (!this.supports(schema)) {
      return err(
        new GenerationError(
          `StringGenerator does not support schema type: ${typeof schema === 'object' && schema !== null ? schema.type : 'unknown'}`,
          undefined,
          context.path,
          'type'
        )
      );
    }

    const stringSchema = schema as StringSchema;

    try {
      // Handle enum values first (highest priority)
      if (stringSchema.enum) {
        return this.generateFromEnum(stringSchema.enum, context);
      }

      // Handle const values
      if (stringSchema.const !== undefined) {
        return ok(String(stringSchema.const));
      }

      // Handle format-based generation
      if (stringSchema.format) {
        const formatResult = this.generateFromFormat(
          stringSchema.format,
          context
        );
        if (formatResult.isOk()) {
          // Validate format result against length constraints
          const value = formatResult.value;
          if (this.meetsLengthConstraints(value, stringSchema)) {
            return formatResult;
          }
          // If format doesn't meet constraints, fall back to pattern/random generation
        }
        // If format generation fails, continue to other methods
      }

      // Handle pattern-based generation
      if (stringSchema.pattern) {
        return this.generateFromPattern(
          stringSchema.pattern,
          stringSchema,
          context
        );
      }

      // Handle default/example values
      if (stringSchema.default !== undefined) {
        const defaultValue = String(stringSchema.default);
        if (this.meetsLengthConstraints(defaultValue, stringSchema)) {
          return ok(defaultValue);
        }
      }

      if (stringSchema.examples && stringSchema.examples.length > 0) {
        const example = this.prepareFaker(context).helpers.arrayElement(
          stringSchema.examples
        );
        const exampleValue = String(example);
        if (this.meetsLengthConstraints(exampleValue, stringSchema)) {
          return ok(exampleValue);
        }
      }

      // Generate random string with length constraints
      return this.generateRandomString(stringSchema, context);
    } catch (error) {
      return err(
        new GenerationError(
          `Failed to generate string: ${String(error)}`,
          'Try simplifying constraints or using a different format',
          context.path,
          'string-generation',
          { error: String(error) }
        )
      );
    }
  }

  /**
   * Generate string from enum values
   */
  private generateFromEnum(
    enumValues: any[],
    context: GeneratorContext
  ): Result<string, GenerationError> {
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
    return ok(String(selectedValue));
  }

  /**
   * Generate string using format registry
   */
  private generateFromFormat(
    format: string,
    context: GeneratorContext
  ): Result<string, GenerationError> {
    return context.formatRegistry.generate(format, {
      locale: context.locale,
      seed: context.seed,
    });
  }

  /**
   * Generate string from regex pattern
   */
  private generateFromPattern(
    pattern: string,
    schema: StringSchema,
    context: GeneratorContext
  ): Result<string, GenerationError> {
    try {
      const fakerInstance = this.prepareFaker(context);

      // Use faker's helpers.fromRegExp if available, otherwise use a simplified approach
      if (fakerInstance.helpers.fromRegExp) {
        const regex = new RegExp(pattern);
        let value = fakerInstance.helpers.fromRegExp(regex);

        // Ensure length constraints are met
        if (this.meetsLengthConstraints(value, schema)) {
          return ok(value);
        }

        // Try a few more times with different seeds
        for (let attempt = 0; attempt < 5; attempt++) {
          value = fakerInstance.helpers.fromRegExp(regex);
          if (this.meetsLengthConstraints(value, schema)) {
            return ok(value);
          }
        }
      }

      // Fallback: generate simple pattern-like strings
      return this.generatePatternFallback(pattern, schema, context);
    } catch (error) {
      return err(
        new GenerationError(
          `Invalid regex pattern: ${pattern}`,
          'Verify the regex pattern is valid and not too complex',
          context.path,
          'pattern',
          { pattern, error: String(error) }
        )
      );
    }
  }

  /**
   * Fallback pattern generation for simple cases
   */
  private generatePatternFallback(
    pattern: string,
    schema: StringSchema,
    context: GeneratorContext
  ): Result<string, GenerationError> {
    const fakerInstance = this.prepareFaker(context);

    // Handle some common simple patterns
    if (pattern === '^[a-zA-Z]+$') {
      return ok(fakerInstance.string.alpha(this.getTargetLength(schema)));
    }

    if (pattern === '^[0-9]+$' || pattern === '^\\d+$') {
      return ok(fakerInstance.string.numeric(this.getTargetLength(schema)));
    }

    if (pattern === '^[a-zA-Z0-9]+$') {
      return ok(
        fakerInstance.string.alphanumeric(this.getTargetLength(schema))
      );
    }

    // For complex patterns, generate random string that meets length constraints
    return this.generateRandomString(schema, context);
  }

  /**
   * Generate random string with length constraints
   */
  private generateRandomString(
    schema: StringSchema,
    context: GeneratorContext
  ): Result<string, GenerationError> {
    const fakerInstance = this.prepareFaker(context);
    const targetLength = this.getTargetLength(schema);

    // Use scenario to determine string type
    let value: string;

    if (context.scenario === 'edge') {
      // Generate edge case strings
      if (schema.minLength !== undefined && schema.minLength === 0) {
        value = ''; // Empty string for edge case
      } else {
        value = fakerInstance.string.alpha(targetLength);
      }
    } else {
      // Generate normal strings with variety
      const generators = [
        () =>
          fakerInstance.lorem
            .words(Math.ceil(targetLength / 6))
            .substring(0, targetLength),
        () => fakerInstance.string.alpha(targetLength),
        () => fakerInstance.string.alphanumeric(targetLength),
        () => fakerInstance.company.name().substring(0, targetLength),
        () => fakerInstance.person.fullName().substring(0, targetLength),
      ];

      const generator = fakerInstance.helpers.arrayElement(generators);
      value = generator();
    }

    // Ensure exact length constraints
    value = this.adjustToLengthConstraints(value, schema);

    return ok(value);
  }

  /**
   * Check if string meets length constraints
   */
  private meetsLengthConstraints(value: string, schema: StringSchema): boolean {
    const length = value.length;

    if (schema.minLength !== undefined && length < schema.minLength) {
      return false;
    }

    if (schema.maxLength !== undefined && length > schema.maxLength) {
      return false;
    }

    return true;
  }

  /**
   * Adjust string to meet length constraints
   */
  private adjustToLengthConstraints(
    value: string,
    schema: StringSchema
  ): string {
    let result = value;

    // Handle minLength constraint
    if (schema.minLength !== undefined && result.length < schema.minLength) {
      const padding = 'abcdefghijklmnopqrstuvwxyz'.repeat(
        Math.ceil(schema.minLength / 26)
      );
      result = (result + padding).substring(0, schema.minLength);
    }

    // Handle maxLength constraint
    if (schema.maxLength !== undefined && result.length > schema.maxLength) {
      result = result.substring(0, schema.maxLength);
    }

    return result;
  }

  /**
   * Get target length for generation
   */
  private getTargetLength(schema: StringSchema): number {
    const min = schema.minLength || 1;
    const max = schema.maxLength || 50;

    // Validate constraints
    if (min > max) {
      return min; // Use minimum as fallback
    }

    // For edge cases, use exact boundaries
    if (this.shouldUseEdgeCase({ schema } as GeneratorContext)) {
      return Math.random() < 0.5 ? min : max;
    }

    // For normal cases, use a reasonable length in the range
    const mid = Math.floor((min + max) / 2);
    const variance = Math.floor((max - min) / 4);
    return Math.max(
      min,
      Math.min(max, mid + Math.floor((Math.random() - 0.5) * variance * 2))
    );
  }

  validate(value: any, schema: Schema): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    if (!this.supports(schema)) {
      return false;
    }

    const stringSchema = schema as StringSchema;

    // Check length constraints
    if (!this.meetsLengthConstraints(value, stringSchema)) {
      return false;
    }

    // Check enum constraint
    if (stringSchema.enum && !stringSchema.enum.includes(value)) {
      return false;
    }

    // Check const constraint
    if (stringSchema.const !== undefined && value !== stringSchema.const) {
      return false;
    }

    // Check pattern constraint
    if (stringSchema.pattern) {
      try {
        const regex = new RegExp(stringSchema.pattern);
        if (!regex.test(value)) {
          return false;
        }
      } catch {
        return false;
      }
    }

    // Check format constraint
    if (stringSchema.format) {
      // This would use the format registry for validation
      // For now, we'll skip format validation here as it's handled by format generators
    }

    return true;
  }

  getExamples(schema: Schema): string[] {
    if (!this.supports(schema)) {
      return [];
    }

    const stringSchema = schema as StringSchema;

    // Return enum values if available
    if (stringSchema.enum) {
      return stringSchema.enum.map(String);
    }

    // Return const value if available
    if (stringSchema.const !== undefined) {
      return [String(stringSchema.const)];
    }

    // Return schema examples if available
    if (stringSchema.examples && stringSchema.examples.length > 0) {
      return stringSchema.examples.map(String);
    }

    // Generate example based on constraints
    const examples: string[] = [];

    if (stringSchema.format) {
      // Format-specific examples would come from format generators
      switch (stringSchema.format) {
        case 'email':
          examples.push('user@example.com', 'test.email+tag@domain.co.uk');
          break;
        case 'uuid':
          examples.push('123e4567-e89b-12d3-a456-426614174000');
          break;
        case 'date':
          examples.push('2023-12-25');
          break;
        case 'date-time':
          examples.push('2023-12-25T10:30:00Z');
          break;
        default:
          examples.push('example-value');
      }
    } else {
      // Generate examples based on length constraints
      const minLen = stringSchema.minLength || 1;
      const maxLen = stringSchema.maxLength || 20;

      examples.push(
        'a'.repeat(minLen),
        'example',
        'x'.repeat(Math.min(maxLen, 10))
      );

      if (maxLen > minLen) {
        examples.push('y'.repeat(maxLen));
      }
    }

    return examples;
  }

  getPriority(): number {
    return 10; // Standard priority for string generation
  }
}
