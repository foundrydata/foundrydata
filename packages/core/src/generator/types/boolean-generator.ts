/**
 * Boolean Generator
 * Generates boolean values with support for const, enum, and weighted selection
 */

import { Result, ok, err } from '../../types/result.js';
import { GenerationError } from '../../types/errors.js';
import type { Schema, BooleanSchema } from '../../types/schema.js';
import {
  DataGenerator,
  GeneratorContext,
  GenerationConfig,
} from '../data-generator.js';

/**
 * Options for boolean generation
 */
export interface BooleanGenerationOptions {
  /** Probability of generating true (0.0 to 1.0) */
  trueProbability?: number;

  /** Force deterministic output */
  deterministic?: boolean;

  /** Weighted selection based on scenario */
  useScenarioWeighting?: boolean;
}

export class BooleanGenerator extends DataGenerator {
  supports(schema: Schema): boolean {
    return (
      typeof schema === 'object' && schema !== null && schema.type === 'boolean'
    );
  }

  generate(
    schema: Schema,
    context: GeneratorContext,
    config?: GenerationConfig
  ): Result<boolean, GenerationError> {
    if (!this.supports(schema)) {
      return err(
        new GenerationError(
          `BooleanGenerator does not support schema type: ${typeof schema === 'object' && schema !== null ? schema.type : 'unknown'}`,
          undefined,
          context.path,
          'type'
        )
      );
    }

    const booleanSchema = schema as BooleanSchema;

    try {
      // Handle const values first (highest priority)
      if (booleanSchema.const !== undefined) {
        const constValue = this.toBoolean(booleanSchema.const);
        if (constValue === null) {
          return err(
            new GenerationError(
              `Invalid const value for boolean: ${booleanSchema.const}`,
              'Const value must be a valid boolean',
              context.path,
              'const'
            )
          );
        }
        return ok(constValue);
      }

      // Handle enum values
      if (booleanSchema.enum) {
        return this.generateFromEnum(booleanSchema.enum, context);
      }

      // Handle default values
      if (booleanSchema.default !== undefined) {
        const defaultValue = this.toBoolean(booleanSchema.default);
        if (defaultValue !== null) {
          return ok(defaultValue);
        }
      }

      // Handle example values
      if (booleanSchema.examples && booleanSchema.examples.length > 0) {
        const fakerInstance = this.prepareFaker(context);
        const example = fakerInstance.helpers.arrayElement(
          booleanSchema.examples
        );
        const exampleValue = this.toBoolean(example);
        if (exampleValue !== null) {
          return ok(exampleValue);
        }
      }

      // Generate boolean with scenario-based logic
      return this.generateWithScenario(booleanSchema, context, config);
    } catch (error) {
      return err(
        new GenerationError(
          `Failed to generate boolean: ${String(error)}`,
          'Check boolean constraints',
          context.path,
          'boolean-generation',
          { error: String(error) }
        )
      );
    }
  }

  /**
   * Convert value to boolean, return null if invalid
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic type conversion requires any
  private toBoolean(value: any): boolean | null {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      if (
        lower === 'true' ||
        lower === '1' ||
        lower === 'yes' ||
        lower === 'on'
      ) {
        return true;
      }
      if (
        lower === 'false' ||
        lower === '0' ||
        lower === 'no' ||
        lower === 'off' ||
        lower === ''
      ) {
        return false;
      }
    }

    if (typeof value === 'number') {
      if (value === 1) return true;
      if (value === 0) return false;
    }

    return null;
  }

  /**
   * Generate boolean from enum values
   */
  private generateFromEnum(
    enumValues: any[], // eslint-disable-line @typescript-eslint/no-explicit-any -- Enum values can be of any type
    context: GeneratorContext
  ): Result<boolean, GenerationError> {
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
    const booleanValue = this.toBoolean(selectedValue);

    if (booleanValue === null) {
      return err(
        new GenerationError(
          `Non-boolean value in enum: ${selectedValue}`,
          'All enum values must be valid booleans',
          context.path,
          'enum'
        )
      );
    }

    return ok(booleanValue);
  }

  /**
   * Generate boolean with scenario-based weighting
   */
  private generateWithScenario(
    _schema: BooleanSchema,
    context: GeneratorContext,
    config?: GenerationConfig
  ): Result<boolean, GenerationError> {
    const fakerInstance = this.prepareFaker(context);
    const options = this.extractOptions(config);

    let trueProbability = options.trueProbability ?? 0.5; // Default 50/50

    // Adjust probability based on scenario
    if (options.useScenarioWeighting !== false) {
      switch (context.scenario) {
        case 'edge':
          // For edge cases, prefer extreme values more often
          trueProbability = fakerInstance.datatype.boolean() ? 0.1 : 0.9;
          break;

        case 'peak':
          // For peak testing, slightly bias toward true
          trueProbability = 0.6;
          break;

        case 'error':
          // For error scenarios, use seeded random
          trueProbability = fakerInstance.number.float({ min: 0, max: 1 });
          break;

        case 'normal':
        default:
          // Keep default probability
          break;
      }
    }

    // Generate boolean with the calculated probability
    const value = options.deterministic
      ? trueProbability >= 0.5
      : fakerInstance.datatype.boolean({ probability: trueProbability });

    return ok(value);
  }

  /**
   * Extract boolean generation options from config
   */
  private extractOptions(config?: GenerationConfig): BooleanGenerationOptions {
    const options: BooleanGenerationOptions = {};

    if (config?.metadata) {
      if (typeof config.metadata.trueProbability === 'number') {
        options.trueProbability = Math.max(
          0,
          Math.min(1, config.metadata.trueProbability)
        );
      }

      if (typeof config.metadata.deterministic === 'boolean') {
        options.deterministic = config.metadata.deterministic;
      }

      if (typeof config.metadata.useScenarioWeighting === 'boolean') {
        options.useScenarioWeighting = config.metadata.useScenarioWeighting;
      }
    }

    return options;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Validation requires accepting any input type
  validate(value: any, schema: Schema): boolean {
    if (typeof value !== 'boolean') {
      return false;
    }

    if (!this.supports(schema)) {
      return false;
    }

    const booleanSchema = schema as BooleanSchema;

    // Check enum constraint
    if (
      booleanSchema.enum &&
      !booleanSchema.enum.some((v) => this.toBoolean(v) === value)
    ) {
      return false;
    }

    // Check const constraint
    if (booleanSchema.const !== undefined) {
      const constValue = this.toBoolean(booleanSchema.const);
      if (constValue !== value) {
        return false;
      }
    }

    return true;
  }

  getExamples(schema: Schema): boolean[] {
    if (!this.supports(schema)) {
      return [];
    }

    const booleanSchema = schema as BooleanSchema;

    // Return enum values if available
    if (booleanSchema.enum) {
      return booleanSchema.enum
        .map((v) => this.toBoolean(v))
        .filter((v): v is boolean => v !== null);
    }

    // Return const value if available
    if (booleanSchema.const !== undefined) {
      const constValue = this.toBoolean(booleanSchema.const);
      return constValue !== null ? [constValue] : [];
    }

    // Return schema examples if available
    if (booleanSchema.examples && booleanSchema.examples.length > 0) {
      return booleanSchema.examples
        .map((v) => this.toBoolean(v))
        .filter((v): v is boolean => v !== null);
    }

    // Return both possible boolean values
    return [true, false];
  }

  getPriority(): number {
    return 10; // Standard priority for boolean generation
  }

  /**
   * Generate weighted boolean (convenience method)
   */
  generateWeighted(
    trueProbability: number,
    context: GeneratorContext
  ): boolean {
    const fakerInstance = this.prepareFaker(context);
    return fakerInstance.datatype.boolean({
      probability: Math.max(0, Math.min(1, trueProbability)),
    });
  }

  /**
   * Generate deterministic boolean based on seed
   */
  generateDeterministic(seed: number): boolean {
    // Use a simple hash-like function to make it deterministic
    const hash = ((seed * 9301 + 49297) % 233280) / 233280;
    return hash >= 0.5;
  }
}
