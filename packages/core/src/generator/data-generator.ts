/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
/**
 * Data Generator Base Class and Context
 * Provides the foundation for all primitive type generators
 */

// Note: we avoid using '@faker-js/faker' seeding to ensure per-context PRNG
// without global or instance seeding side-effects.
import type { Result } from '../types/result';
import type { GenerationError } from '../types/errors';
import type { Schema } from '../types/schema';
import type { FormatRegistry } from '../registry/format-registry';
import type { ResolvedOptions } from '../types/options';
import { resolveOptions } from '../types/options';

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
  cache: Map<string, unknown>;

  /** Format registry for string format generation */
  formatRegistry: FormatRegistry;

  /** Current path in the schema (for error reporting) */
  path: string;

  /** Maximum depth for nested structures (prevent infinite recursion) */
  maxDepth: number;

  /** Current depth in generation */
  currentDepth: number;

  /** Resolved configuration options */
  options: ResolvedOptions;
}

/**
 * Configuration options for individual generators
 */
export interface GenerationConfig {
  /** Override default generator behavior */
  override?: boolean;

  /** Custom generation function */
  customGenerator?: (context: GeneratorContext) => unknown;

  /** Additional metadata for generator */
  metadata?: Record<string, unknown>;
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
  ): Result<unknown, GenerationError>;

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
  validate(value: unknown, _schema: Schema): boolean {
    // Default implementation - just check if value exists
    return value !== undefined && value !== null;
  }

  /**
   * Get example values that this generator might produce
   * Useful for documentation and testing
   */
  getExamples(_schema: Schema): unknown[] {
    return [];
  }

  /**
   * Initialize or configure the Faker instance for deterministic generation
   */
  // Minimal faker-like interface backed by a per-context seeded RNG
  // This avoids any global seeding and guarantees per-context determinism
  protected prepareFaker(context: GeneratorContext): {
    helpers: {
      arrayElement<T>(items: readonly T[]): T;
      fromRegExp?: (regex: RegExp) => string;
      shuffle<T>(items: T[]): T[];
    };
    datatype: {
      boolean(opts?: { probability?: number }): boolean;
    };
    number: {
      float(opts: { min?: number; max?: number }): number;
      int(opts: { min?: number; max?: number }): number;
    };
    string: {
      alphanumeric(length: number): string;
      alpha(length: number): string;
      numeric(length: number): string;
      sample(length: number): string;
      uuid(): string;
    };
    internet: {
      email(): string;
      url(): string;
      domainName(): string;
      ip(): string;
      ipv6(): string;
    };
    date: {
      recent(): Date;
    };
    lorem: {
      words(count: number): string;
    };
    company: {
      name(): string;
    };
    person: {
      fullName(): string;
    };
  } {
    // Retrieve or initialize a seeded RNG stored in context.cache
    // to provide stable sequences across nested calls.
    type Rng = () => number;

    const RNG_CACHE_KEY = '__fd_rng__';

    let rng: Rng | undefined = context.cache.get(RNG_CACHE_KEY) as
      | Rng
      | undefined;

    if (!rng) {
      // Deterministic, fast PRNG (mulberry32)
      const mulberry32 = (seed: number): Rng => {
        let t = seed >>> 0;
        return () => {
          t += 0x6d2b79f5;
          let r = Math.imul(t ^ (t >>> 15), 1 | t);
          r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
          return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
      };

      // If no seed provided, fall back to a fixed seed to keep tests deterministic
      const seed = typeof context.seed === 'number' ? context.seed : 123456789;
      rng = mulberry32(seed);
      context.cache.set(RNG_CACHE_KEY, rng);
    }

    const next = (): number => rng!();

    const helpers = {
      arrayElement<T>(items: readonly T[]): T {
        if (!items || items.length === 0) {
          // @ts-expect-error rely on callers to provide non-empty arrays; fallback to undefined
          return undefined;
        }
        const idx = Math.floor(next() * items.length);
        return items[idx] as T;
      },
      shuffle<T>(items: T[]): T[] {
        const arr = items.slice();
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const tmp = arr[i];
          arr[i] = arr[j]!;
          arr[j] = tmp!;
        }
        return arr;
      },
    };

    const datatype = {
      boolean(opts?: { probability?: number }): boolean {
        const p =
          typeof opts?.probability === 'number'
            ? Math.max(0, Math.min(1, opts!.probability!))
            : 0.5;
        return next() < p;
      },
    };

    const number = {
      float(opts: { min?: number; max?: number }): number {
        const min = typeof opts.min === 'number' ? opts.min : 0;
        const max = typeof opts.max === 'number' ? opts.max : 1;
        return min + (max - min) * next();
      },
      int(opts: { min?: number; max?: number }): number {
        const min = typeof opts.min === 'number' ? Math.ceil(opts.min) : 0;
        const max = typeof opts.max === 'number' ? Math.floor(opts.max) : 1;
        const range = Math.max(0, max - min);
        return Math.min(max, min + Math.floor(next() * (range + 1)));
      },
    };

    const string = {
      alphanumeric(length: number): string {
        const chars =
          'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let out = '';
        for (let i = 0; i < Math.max(0, length | 0); i++) {
          const idx = Math.floor(next() * chars.length);
          out += chars[idx]!;
        }
        return out;
      },
      alpha(length: number): string {
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let out = '';
        for (let i = 0; i < Math.max(0, length | 0); i++) {
          const idx = Math.floor(next() * chars.length);
          out += chars[idx]!;
        }
        return out;
      },
      numeric(length: number): string {
        const chars = '0123456789';
        let out = '';
        for (let i = 0; i < Math.max(0, length | 0); i++) {
          const idx = Math.floor(next() * chars.length);
          out += chars[idx]!;
        }
        return out;
      },
      sample(length: number): string {
        // Simple sample using alphanumeric for determinism
        return string.alphanumeric(length);
      },
      uuid(): string {
        // Deterministic UUIDv4-like string using RNG
        const hex = '0123456789abcdef';
        const nibble = (): string => hex[Math.floor(next() * 16)]!;
        const section = (len: number): string => {
          let s = '';
          for (let i = 0; i < len; i++) s += nibble();
          return s;
        };
        // Set version (4) and variant (8,9,a,b)
        const ver = '4';
        const variantVals = ['8', '9', 'a', 'b'];
        const variant = variantVals[Math.floor(next() * variantVals.length)]!;
        return `${section(8)}-${section(4)}-${ver}${section(3)}-${variant}${section(3)}-${section(12)}`;
      },
    };

    const internet = {
      email(): string {
        const id = number.int({ min: 0, max: 999999 });
        return `user${id}@example.com`;
      },
      url(): string {
        const path = string.alphanumeric(8).toLowerCase();
        return `https://example.com/${path}`;
      },
      domainName(): string {
        const label = string.alpha(6).toLowerCase();
        const tlds = ['com', 'org', 'net', 'io', 'dev'];
        const tld = helpers.arrayElement(tlds);
        return `${label}.${tld}`;
      },
      ip(): string {
        const octet = (): number => number.int({ min: 1, max: 254 });
        return `${octet()}.${octet()}.${octet()}.${octet()}`;
      },
      ipv6(): string {
        const hex = '0123456789abcdef';
        const group = (): string => {
          let g = '';
          for (let i = 0; i < 4; i++) g += hex[Math.floor(next() * 16)]!;
          return g;
        };
        return `${group()}:${group()}:${group()}:${group()}:${group()}:${group()}:${group()}:${group()}`;
      },
    };

    const date = {
      recent(): Date {
        // Base date deterministic, add up to ~7 days offset
        const base = new Date('2023-01-01T00:00:00.000Z').getTime();
        const offset = Math.floor(next() * 7 * 24 * 60 * 60 * 1000);
        return new Date(base + offset);
      },
    };

    const wordList = (
      'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ' +
      'ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat ' +
      'duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur ' +
      'excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum'
    ).split(/\s+/);

    const pickWord = (): string => helpers.arrayElement(wordList);

    const lorem = {
      words(count: number): string {
        const n = Math.max(1, count | 0);
        const parts: string[] = [];
        for (let i = 0; i < n; i++) parts.push(pickWord());
        return parts.join(' ');
      },
    };

    const company = {
      name(): string {
        const a = string.alpha(6);
        const b = string.alpha(4);
        const suffix = helpers.arrayElement([
          'Ltd',
          'Inc',
          'LLC',
          'GmbH',
          'SARL',
        ]);
        return `${a} ${b} ${suffix}`;
      },
    };

    const person = {
      fullName(): string {
        const first = helpers.arrayElement([
          'Alex',
          'Sam',
          'Jordan',
          'Taylor',
          'Morgan',
          'Jamie',
        ]);
        const last = helpers.arrayElement([
          'Smith',
          'Johnson',
          'Lee',
          'Brown',
          'Garcia',
          'Martin',
        ]);
        return `${first} ${last}`;
      },
    };

    return {
      helpers,
      datatype,
      number,
      string,
      internet,
      date,
      lorem,
      company,
      person,
    };
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
    if (context.scenario === 'edge' || context.scenario === 'peak') {
      return true;
    }
    // 10% chance for normal scenario, using seeded random
    const fakerInstance = this.prepareFaker(context);
    return fakerInstance.number.float({ min: 0, max: 1 }) < 0.1;
  }

  /**
   * Helper to get constraint value with edge case consideration
   */
  protected getConstraintValue(
    normalValue: unknown,
    edgeValue: unknown,
    context: GeneratorContext
  ): unknown {
    return this.shouldUseEdgeCase(context) ? edgeValue : normalValue;
  }

  /**
   * Helper to validate numeric ranges
   */
  protected validateNumericRange(min?: number, max?: number): boolean {
    if (min !== undefined && max !== undefined && min > max) {
      // Do not throw in core logic; return false to let callers decide
      return false;
    }
    return true;
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
    resolvedOptions?: ResolvedOptions;
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
    options: options.resolvedOptions || resolveOptions(),
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

    // Handle schema type - can be string, array of strings, or undefined
    let schemaType: string;
    if (typeof schema.type === 'string') {
      schemaType = schema.type;
    } else if (
      Array.isArray(schema.type) &&
      schema.type.length > 0 &&
      schema.type[0]
    ) {
      schemaType = schema.type[0]; // Use first type for simplicity
    } else {
      return null; // No valid type specified
    }

    const typeGenerators = this.generators.get(schemaType);
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
