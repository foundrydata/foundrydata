/**
 * Format Registry System for FoundryData
 * Provides extensible format generation and validation for string formats
 */

import { Result, err } from '../types/result';
import { GenerationError } from '../types/errors';
import type { StringFormat } from '../types/schema';

/**
 * Options for format generation
 */
export interface FormatOptions {
  locale?: string;
  seed?: number;
  [key: string]: unknown;
}

/**
 * Interface for format generators
 * Each generator can produce values for one or more string formats
 */
export interface FormatGenerator {
  readonly name: string;

  /**
   * Check if this generator supports a given format
   */
  supports(format: string): boolean;

  /**
   * Generate a value for the format
   */
  generate(options?: FormatOptions): Result<string, GenerationError>;

  /**
   * Validate if a value conforms to this format
   */
  validate(value: string): boolean;

  /**
   * Get example values for this format (for documentation/testing)
   */
  getExamples(): string[];
}

/**
 * Registry for format generators with lazy initialization
 * Supports format lookup by name and pattern matching
 */
export class FormatRegistry {
  private readonly formats = new Map<string, FormatGenerator>();
  private initialized = false;

  // Lazy initialization function
  private initializer?: () => void;

  /**
   * Set the initialization function (called once on first use)
   */
  setInitializer(init: () => void): void {
    this.initializer = init;
  }

  /**
   * Ensure registry is initialized before use
   */
  private ensureInitialized(): void {
    if (!this.initialized && this.initializer) {
      this.initializer();
      this.initialized = true;
      this.initializer = undefined; // Free the reference
    }
  }

  /**
   * Register a format generator
   */
  register(generator: FormatGenerator): void {
    this.formats.set(generator.name, generator);

    // Also register common aliases
    const aliases = this.getAliases(generator.name);
    for (const alias of aliases) {
      if (!this.formats.has(alias)) {
        this.formats.set(alias, generator);
      }
    }
  }

  /**
   * Get common aliases for format names
   */
  private getAliases(name: string): string[] {
    const aliasMap: Record<string, string[]> = {
      uuid: ['guid'],
      'date-time': ['datetime', 'dateTime'],
      email: ['e-mail'],
      uri: ['url'],
      ipv4: ['ip', 'ip-address'],
      ipv6: ['ipv6-address'],
    };

    return aliasMap[name] || [];
  }

  /**
   * Get a format generator by name or pattern
   */
  get(format: string): FormatGenerator | null {
    this.ensureInitialized();

    // Try exact match first
    const exact = this.formats.get(format);
    if (exact) return exact;

    // Try case-insensitive match
    const lowerFormat = format.toLowerCase();
    for (const [key, generator] of Array.from(this.formats.entries())) {
      if (key.toLowerCase() === lowerFormat) {
        return generator;
      }
    }

    // Try pattern matching
    for (const generator of Array.from(this.formats.values())) {
      if (generator.supports(format)) {
        return generator;
      }
    }

    return null;
  }

  /**
   * Check if a format is supported
   */
  supports(format: string): boolean {
    return this.get(format) !== null;
  }

  /**
   * Generate a value for the given format
   */
  generate(
    format: string,
    options?: FormatOptions
  ): Result<string, GenerationError> {
    const generator = this.get(format);

    if (!generator) {
      // Provide helpful error message
      const available = this.getRegisteredFormats();
      const suggestion = this.findSimilarFormat(format, available);

      return err(
        new GenerationError(
          `No generator found for format: "${format}"`,
          suggestion ? `Did you mean "${suggestion}"?` : undefined,
          undefined, // field
          'format', // constraint
          {
            format,
            available: available.slice(0, 10), // Show first 10 available formats
          }
        )
      );
    }

    return generator.generate(options);
  }

  /**
   * Find similar format name (for error suggestions)
   */
  private findSimilarFormat(
    format: string,
    available: string[]
  ): string | null {
    const lower = format.toLowerCase();

    // Exact case-insensitive match
    const exact = available.find((f) => f.toLowerCase() === lower);
    if (exact) return exact;

    // Partial match
    const partial = available.find(
      (f) => f.toLowerCase().includes(lower) || lower.includes(f.toLowerCase())
    );
    if (partial) return partial;

    // Levenshtein distance for typos (simplified)
    const closeMatch = available.find((f) => {
      const distance = this.levenshteinDistance(lower, f.toLowerCase());
      return distance <= 2; // Allow 2 character differences
    });

    return closeMatch || null;
  }

  /**
   * Simple Levenshtein distance implementation
   */
  private levenshteinDistance(a: string, b: string): number {
    // Initialize matrix with proper dimensions
    const matrix: number[][] = Array(b.length + 1)
      .fill(null)
      .map(() => Array(a.length + 1).fill(0));

    // Initialize first row and column
    for (let i = 0; i <= b.length; i++) {
      matrix[i]![0] = i;
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0]![j] = j;
    }

    // Fill the matrix
    for (let i = 1; i <= b.length; i++) {
      const currentRow = matrix[i]!;
      const prevRow = matrix[i - 1]!;

      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          currentRow[j] = prevRow[j - 1]!;
        } else {
          currentRow[j] = Math.min(
            prevRow[j - 1]! + 1, // substitution
            currentRow[j - 1]! + 1, // insertion
            prevRow[j]! + 1 // deletion
          );
        }
      }
    }

    return matrix[b.length]![a.length]!;
  }

  /**
   * Validate a value against a format
   */
  validate(format: string, value: string): boolean {
    const generator = this.get(format);
    return generator ? generator.validate(value) : false;
  }

  /**
   * Get all registered format names
   */
  getRegisteredFormats(): string[] {
    this.ensureInitialized();
    return Array.from(new Set(this.formats.keys())).sort();
  }

  /**
   * Get all supported formats (including pattern-matched ones)
   */
  getAllSupportedFormats(): StringFormat[] {
    this.ensureInitialized();

    // Start with registered format names
    const formats = new Set<string>(this.formats.keys());

    // Add common format aliases that generators support
    const commonFormats: StringFormat[] = [
      'uuid',
      'email',
      'date',
      'date-time',
      'time',
      'duration',
      'uri',
      'uri-reference',
      'url',
      'hostname',
      'ipv4',
      'ipv6',
      'regex',
      'json-pointer',
      'relative-json-pointer',
      'password',
      'binary',
      'byte',
      'int32',
      'int64',
      'float',
      'double',
    ];

    for (const format of commonFormats) {
      if (this.supports(format)) {
        formats.add(format);
      }
    }

    return Array.from(formats).sort() as StringFormat[];
  }

  /**
   * Clear all registered formats (mainly for testing)
   */
  clear(): void {
    this.formats.clear();
    this.initialized = false;
  }

  /**
   * Create a default registry with built-in formats
   */
  static createDefault(): FormatRegistry {
    const registry = new FormatRegistry();

    // Set lazy initializer to avoid circular deps
    registry.setInitializer(() => {
      // This will be called by the main module
      // to register built-in formats
    });

    return registry;
  }

  /**
   * Initialize the registry with built-in formats
   * Call this after creating the registry to register built-in formats
   * @deprecated Use initializeBuiltInFormats function instead
   */
  initializeBuiltInFormats(): void {
    // This method is kept for backwards compatibility
    // The actual initialization is now handled via lazy loading
    console.warn(
      'FormatRegistry.initializeBuiltInFormats() is deprecated. Use the initializeBuiltInFormats function instead.'
    );
  }
}

/**
 * Global default format registry instance
 * Can be replaced in tests or for custom configurations
 */
export const defaultFormatRegistry = FormatRegistry.createDefault();

/**
 * Initialize the default registry with built-in formats
 * Call this from the main index.ts to avoid circular dependencies
 */
export function initializeBuiltInFormats(
  registry: FormatRegistry,
  generators: FormatGenerator[]
): void {
  for (const generator of generators) {
    registry.register(generator);
  }
}

/**
 * Convenience function to register a format generator globally
 */
export function registerFormat(generator: FormatGenerator): void {
  defaultFormatRegistry.register(generator);
}

/**
 * Convenience function to generate a value using the default registry
 */
export function generateFormat(
  format: string,
  options?: FormatOptions
): Result<string, GenerationError> {
  return defaultFormatRegistry.generate(format, options);
}

/**
 * Convenience function to validate a value using the default registry
 */
export function validateFormat(format: string, value: string): boolean {
  return defaultFormatRegistry.validate(format, value);
}
