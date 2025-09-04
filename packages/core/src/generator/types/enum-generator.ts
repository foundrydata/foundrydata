/**
 * Enum Generator
 * Handles enum value selection with caching, weighted distribution, and deterministic selection
 * Works for any schema type that has enum constraints
 *
 * Note: Uses `any` types extensively for generic enum value handling,
 * which is appropriate for this use case per CLAUDE.md guidelines.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { faker } from '@faker-js/faker';
import { Result, ok, err } from '../../types/result';
import { GenerationError } from '../../types/errors';
import type { Schema } from '../../types/schema';
import {
  DataGenerator,
  GeneratorContext,
  GenerationConfig,
} from '../data-generator';

/**
 * Options for enum generation
 */
export interface EnumGenerationOptions {
  /** Weights for each enum value (must match enum array length) */
  weights?: number[];

  /** Enable caching of enum selections */
  enableCaching?: boolean;

  /** Cache key prefix for this enum */
  cacheKeyPrefix?: string;

  /** Force deterministic selection */
  deterministic?: boolean;

  /** Distribution strategy */
  distribution?: 'uniform' | 'weighted' | 'round-robin' | 'first' | 'last';

  /** Round-robin state key for maintaining position */
  roundRobinKey?: string;
}

/**
 * Cache entry for enum selections
 */
interface EnumCacheEntry {
  selectedValue: any;
  timestamp: number;
  selectionCount: number;
  roundRobinIndex?: number;
}

export class EnumGenerator extends DataGenerator {
  private static enumCache = new Map<string, EnumCacheEntry>();
  private static roundRobinCounters = new Map<string, number>();

  supports(schema: Schema): boolean {
    return (
      typeof schema === 'object' &&
      schema !== null &&
      Array.isArray(schema.enum) &&
      schema.enum.length > 0
    );
  }

  generate(
    schema: Schema,
    context: GeneratorContext,
    config?: GenerationConfig
  ): Result<any, GenerationError> {
    if (!this.supports(schema)) {
      return err(
        new GenerationError(
          'EnumGenerator requires a schema with non-empty enum array',
          'Ensure the schema has an "enum" property with at least one value',
          context.path,
          'enum'
        )
      );
    }

    const enumValues = (schema as any).enum;
    const options = this.extractOptions(config);

    try {
      // Validate weights if provided
      if (options.weights && options.weights.length !== enumValues.length) {
        return err(
          new GenerationError(
            `Weights array length (${options.weights.length}) does not match enum length (${enumValues.length})`,
            'Provide weights array with same length as enum array',
            context.path,
            'weights'
          )
        );
      }

      // Check cache first if caching is enabled
      if (options.enableCaching) {
        const cached = this.getCachedValue(schema, options, context);
        if (cached !== null) {
          return ok(cached);
        }
      }

      // Generate new value based on distribution strategy
      const selectedValue = this.generateByDistribution(
        enumValues,
        options,
        context
      );

      // Cache the result if caching is enabled
      if (options.enableCaching) {
        this.cacheValue(schema, options, context, selectedValue);
      }

      return ok(selectedValue);
    } catch (error) {
      return err(
        new GenerationError(
          `Failed to generate enum value: ${String(error)}`,
          'Check enum values and generation options',
          context.path,
          'enum-generation',
          { error: String(error) }
        )
      );
    }
  }

  /**
   * Generate value based on distribution strategy
   */
  private generateByDistribution(
    enumValues: any[],
    options: EnumGenerationOptions,
    context: GeneratorContext
  ): any {
    const fakerInstance = this.prepareFaker(context);

    switch (options.distribution) {
      case 'first':
        return enumValues[0];

      case 'last':
        return enumValues[enumValues.length - 1];

      case 'round-robin':
        return this.generateRoundRobin(enumValues, options, context);

      case 'weighted':
        if (options.weights) {
          return this.generateWeighted(
            enumValues,
            options.weights,
            fakerInstance
          );
        }
        // Fall through to uniform if no weights
        return fakerInstance.helpers.arrayElement(enumValues);

      case 'uniform':
      default:
        if (options.deterministic && context.seed !== undefined) {
          return this.generateDeterministic(enumValues, context.seed);
        }
        return fakerInstance.helpers.arrayElement(enumValues);
    }
  }

  /**
   * Generate using round-robin distribution
   */
  private generateRoundRobin(
    enumValues: any[],
    options: EnumGenerationOptions,
    context: GeneratorContext
  ): any {
    const key = options.roundRobinKey || `${context.path}:round-robin`;

    const currentIndex = EnumGenerator.roundRobinCounters.get(key) || 0;
    const selectedValue = enumValues[currentIndex];

    // Update counter for next time
    EnumGenerator.roundRobinCounters.set(
      key,
      (currentIndex + 1) % enumValues.length
    );

    return selectedValue;
  }

  /**
   * Generate using weighted distribution
   */
  private generateWeighted(
    enumValues: any[],
    weights: number[],
    fakerInstance: typeof faker
  ): any {
    // Normalize weights to ensure they sum to 1
    const totalWeight = weights.reduce(
      (sum, weight) => sum + Math.max(0, weight),
      0
    );

    if (totalWeight === 0) {
      // All weights are 0 or negative, fall back to uniform
      return fakerInstance.helpers.arrayElement(enumValues);
    }

    const normalizedWeights = weights.map((w) => Math.max(0, w) / totalWeight);

    // Generate weighted selection using seeded RNG via faker
    const random = fakerInstance.number.float({ min: 0, max: 1 });
    let cumulativeWeight = 0;

    for (let i = 0; i < enumValues.length; i++) {
      cumulativeWeight += normalizedWeights[i] || 0;
      if (random <= cumulativeWeight) {
        return enumValues[i];
      }
    }

    // Fallback to last element (shouldn't happen with proper normalization)
    return enumValues[enumValues.length - 1];
  }

  /**
   * Generate deterministic value based on seed
   */
  private generateDeterministic(enumValues: any[], seed: number): any {
    // Simple hash-based selection that's deterministic
    const hash = ((seed * 9301 + 49297) % 233280) / 233280;
    const index = Math.floor(hash * enumValues.length);
    return enumValues[index];
  }

  /**
   * Get cached value if available
   */
  private getCachedValue(
    schema: Schema,
    options: EnumGenerationOptions,
    context: GeneratorContext
  ): any | null {
    const cacheKey = this.createEnumCacheKey(schema, options, context);
    const cached = EnumGenerator.enumCache.get(cacheKey);

    if (cached) {
      // Update selection count
      cached.selectionCount++;
      return cached.selectedValue;
    }

    return null;
  }

  /**
   * Cache a selected value
   */
  private cacheValue(
    schema: Schema,
    options: EnumGenerationOptions,
    context: GeneratorContext,
    value: any
  ): void {
    const cacheKey = this.createEnumCacheKey(schema, options, context);

    EnumGenerator.enumCache.set(cacheKey, {
      selectedValue: value,
      timestamp: Date.now(),
      selectionCount: 1,
    });
  }

  /**
   * Create cache key for enum selection
   */
  private createEnumCacheKey(
    schema: Schema,
    options: EnumGenerationOptions,
    context: GeneratorContext
  ): string {
    const prefix = options.cacheKeyPrefix || 'enum';
    const schemaHash = this.hashSchema(schema);
    const pathKey = context.path.replace(/[^a-zA-Z0-9]/g, '_');

    return `${prefix}:${pathKey}:${schemaHash}`;
  }

  /**
   * Create a simple hash of the schema for caching
   */
  private hashSchema(schema: Schema): string {
    const enumStr = JSON.stringify((schema as any).enum);

    // Simple string hash
    let hash = 0;
    for (let i = 0; i < enumStr.length; i++) {
      const char = enumStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36);
  }

  /**
   * Extract enum generation options from config
   */
  private extractOptions(config?: GenerationConfig): EnumGenerationOptions {
    const options: EnumGenerationOptions = {
      enableCaching: false,
      distribution: 'uniform',
    };

    if (config?.metadata) {
      const meta = config.metadata;

      if (Array.isArray(meta.weights)) {
        options.weights = meta.weights.map(Number);
      }

      if (typeof meta.enableCaching === 'boolean') {
        options.enableCaching = meta.enableCaching;
      }

      if (typeof meta.cacheKeyPrefix === 'string') {
        options.cacheKeyPrefix = meta.cacheKeyPrefix;
      }

      if (typeof meta.deterministic === 'boolean') {
        options.deterministic = meta.deterministic;
      }

      if (typeof meta.distribution === 'string') {
        options.distribution =
          meta.distribution as EnumGenerationOptions['distribution'];
      }

      if (typeof meta.roundRobinKey === 'string') {
        options.roundRobinKey = meta.roundRobinKey;
      }
    }

    return options;
  }

  validate(value: any, schema: Schema): boolean {
    if (!schema || !this.supports(schema)) {
      return false;
    }

    const enumValues = (schema as any).enum;
    return enumValues.some((enumValue: any) => {
      // Deep equality check for objects/arrays
      if (typeof enumValue === 'object' && typeof value === 'object') {
        return JSON.stringify(enumValue) === JSON.stringify(value);
      }
      return enumValue === value;
    });
  }

  getExamples(schema: Schema): any[] {
    if (!this.supports(schema)) {
      return [];
    }

    // Return all enum values as examples
    return [...(schema as any).enum];
  }

  getPriority(): number {
    return 20; // Higher priority since enum is more specific than type-based generation
  }

  /**
   * Clear the enum cache (useful for testing)
   */
  static clearCache(): void {
    this.enumCache.clear();
    this.roundRobinCounters.clear();
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): {
    totalEntries: number;
    totalSelections: number;
    roundRobinKeys: number;
  } {
    const totalSelections = Array.from(this.enumCache.values()).reduce(
      (sum, entry) => sum + entry.selectionCount,
      0
    );

    return {
      totalEntries: this.enumCache.size,
      totalSelections,
      roundRobinKeys: this.roundRobinCounters.size,
    };
  }

  /**
   * Generate multiple enum values with different strategies
   */
  generateMultiple(
    schema: Schema,
    context: GeneratorContext,
    count: number,
    config?: GenerationConfig
  ): Result<any[], GenerationError> {
    if (!this.supports(schema)) {
      return err(
        new GenerationError(
          'EnumGenerator requires a schema with non-empty enum array',
          'Ensure the schema has an "enum" property with at least one value',
          context.path,
          'enum'
        )
      );
    }

    const results: any[] = [];

    for (let i = 0; i < count; i++) {
      const result = this.generate(schema, context, config);
      if (result.isErr()) {
        return result as Result<any[], GenerationError>;
      }
      results.push(result.value);
    }

    return ok(results);
  }
}
