/**
 * Data Generator Base Class and Context
 * Provides the foundation for all primitive type generators
 */

import { faker } from '@faker-js/faker';
import type { Result } from '../types/result';
import type { GenerationError } from '../types/errors';
import type { Schema } from '../types/schema';
import type { FormatRegistry } from '../registry/format-registry';

/**
 * Generation context passed to all generators
 * Contains shared state and configuration for the generation process
 */
export interface GeneratorContext {
  /** The schema being processed */
  schema: Schema;
  
  /** Random seed for deterministic generation */
  seed?: number;
  
  /** Locale for localized data generation */
  locale?: string;
  
  /** Generation scenario for different data patterns */
  scenario?: 'normal' | 'edge' | 'peak' | 'error';
  
  /** Cache for memoization and performance */
  cache: Map<string, any>;
  
  /** Format registry for string format generation */
  formatRegistry: FormatRegistry;
  
  /** Current path in the schema (for error reporting) */
  path: string;
  
  /** Maximum depth for nested structures (prevent infinite recursion) */
  maxDepth: number;
  
  /** Current depth in generation */
  currentDepth: number;
}

/**
 * Configuration options for individual generators
 */
export interface GenerationConfig {
  /** Override default generator behavior */
  override?: boolean;
  
  /** Custom generation function */
  customGenerator?: (context: GeneratorContext) => any;
  
  /** Additional metadata for generator */
  metadata?: Record<string, any>;
}

/**
 * Abstract base class for all data generators
 * Each primitive type extends this to implement type-specific generation logic
 */
export abstract class DataGenerator {
  /**
   * Check if this generator can handle the given schema
   */
  abstract supports(schema: Schema): boolean;

  /**
   * Generate data according to the schema and context
   * Returns a Result type for functional error handling
   */
  abstract generate(
    schema: Schema,
    context: GeneratorContext,
    config?: GenerationConfig
  ): Result<any, GenerationError>;

  /**
   * Get the priority of this generator (higher = more specific)
   * Used when multiple generators support the same schema
   */
  getPriority(): number {
    return 0;
  }

  /**
   * Validate generated data against schema constraints
   * Override for type-specific validation beyond basic type checking
   */
  validate(value: any, _schema: Schema): boolean {
    // Default implementation - just check if value exists
    return value !== undefined && value !== null;
  }

  /**
   * Get example values that this generator might produce
   * Useful for documentation and testing
   */
  getExamples(_schema: Schema): any[] {
    return [];
  }

  /**
   * Initialize or configure the Faker instance for deterministic generation
   */
  protected prepareFaker(context: GeneratorContext): typeof faker {
    if (context.seed !== undefined) {
      faker.seed(context.seed);
    }

    if (context.locale) {
      // Set locale if different from default
      // Note: This would require locale-specific faker instances in a full implementation
    }

    return faker;
  }

  /**
   * Helper to create cache keys for memoization
   */
  protected createCacheKey(schema: Schema, prefix: string = ''): string {
    const key = `${prefix}:${JSON.stringify(schema)}`;
    return key;
  }

  /**
   * Helper to check if generation should use edge cases
   */
  protected shouldUseEdgeCase(context: GeneratorContext): boolean {
    return context.scenario === 'edge' || 
           context.scenario === 'peak' ||
           (Math.random() < 0.1); // 10% chance for normal scenario
  }

  /**
   * Helper to get constraint value with edge case consideration
   */
  protected getConstraintValue(
    normalValue: any,
    edgeValue: any,
    context: GeneratorContext
  ): any {
    return this.shouldUseEdgeCase(context) ? edgeValue : normalValue;
  }

  /**
   * Helper to validate numeric ranges
   */
  protected validateNumericRange(min?: number, max?: number): void {
    if (min !== undefined && max !== undefined && min > max) {
      throw new Error(`Invalid range: minimum (${min}) cannot be greater than maximum (${max})`);
    }
  }

  /**
   * Helper to normalize exclusive bounds to inclusive bounds
   */
  protected normalizeExclusiveBounds(
    exclusiveMinimum?: number | boolean,
    exclusiveMaximum?: number | boolean,
    minimum?: number,
    maximum?: number
  ): { min?: number; max?: number } {
    let min = minimum;
    let max = maximum;

    // Handle exclusiveMinimum (can be boolean in older schemas or number in newer)
    if (typeof exclusiveMinimum === 'number') {
      min = exclusiveMinimum + Number.EPSILON;
    } else if (exclusiveMinimum === true && minimum !== undefined) {
      min = minimum + Number.EPSILON;
    }

    // Handle exclusiveMaximum (can be boolean in older schemas or number in newer)
    if (typeof exclusiveMaximum === 'number') {
      max = exclusiveMaximum - Number.EPSILON;
    } else if (exclusiveMaximum === true && maximum !== undefined) {
      max = maximum - Number.EPSILON;
    }

    return { min, max };
  }

  /**
   * Helper to generate values that respect multipleOf constraint
   */
  protected applyMultipleOf(value: number, multipleOf: number): number {
    if (multipleOf <= 0) return value;
    
    return Math.round(value / multipleOf) * multipleOf;
  }

  /**
   * Create a new generator context for nested generation
   */
  protected createNestedContext(
    context: GeneratorContext,
    newPath: string,
    newSchema: Schema
  ): GeneratorContext {
    return {
      ...context,
      schema: newSchema,
      path: newPath,
      currentDepth: context.currentDepth + 1,
    };
  }

  /**
   * Check if we've reached maximum depth (prevent stack overflow)
   */
  protected isMaxDepthReached(context: GeneratorContext): boolean {
    return context.currentDepth >= context.maxDepth;
  }
}

/**
 * Default generator context factory
 */
export function createGeneratorContext(
  schema: Schema,
  formatRegistry: FormatRegistry,
  options: {
    seed?: number;
    locale?: string;
    scenario?: 'normal' | 'edge' | 'peak' | 'error';
    maxDepth?: number;
    path?: string;
  } = {}
): GeneratorContext {
  return {
    schema,
    seed: options.seed,
    locale: options.locale || 'en',
    scenario: options.scenario || 'normal',
    cache: new Map(),
    formatRegistry,
    path: options.path || '$',
    maxDepth: options.maxDepth || 10,
    currentDepth: 0,
  };
}

/**
 * Generator registry for managing and selecting generators
 */
export class GeneratorRegistry {
  private generators = new Map<string, DataGenerator[]>();

  /**
   * Register a generator for a specific type
   */
  register(type: string, generator: DataGenerator): void {
    if (!this.generators.has(type)) {
      this.generators.set(type, []);
    }
    
    const typeGenerators = this.generators.get(type)!;
    typeGenerators.push(generator);
    
    // Sort by priority (highest first)
    typeGenerators.sort((a, b) => b.getPriority() - a.getPriority());
  }

  /**
   * Get the best generator for a schema
   */
  getGenerator(schema: Schema): DataGenerator | null {
    if (typeof schema === 'boolean') {
      return null; // Boolean schemas (true/false) are handled specially
    }

    const typeGenerators = this.generators.get(schema.type);
    if (!typeGenerators) {
      return null;
    }

    // Find the first generator that supports this specific schema
    for (const generator of typeGenerators) {
      if (generator.supports(schema)) {
        return generator;
      }
    }

    return null;
  }

  /**
   * Get all registered generators for a type
   */
  getGenerators(type: string): DataGenerator[] {
    return this.generators.get(type) || [];
  }

  /**
   * Clear all generators (mainly for testing)
   */
  clear(): void {
    this.generators.clear();
  }
}

/**
 * Default generator registry instance
 */
export const defaultGeneratorRegistry = new GeneratorRegistry();