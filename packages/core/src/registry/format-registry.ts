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
 * Registry for format generators
 * Supports format lookup by name and pattern matching
 */
export class FormatRegistry {
  private readonly formats = new Map<string, FormatGenerator>();

  /**
   * Register a format generator
   */
  register(generator: FormatGenerator): void {
    this.formats.set(generator.name, generator);
  }

  /**
   * Get a format generator by name or pattern
   */
  get(format: string): FormatGenerator | null {
    // Try exact match first
    if (this.formats.has(format)) {
      return this.formats.get(format)!;
    }

    // Try pattern matching - check all generators to see if they support this format
    for (const generator of this.formats.values()) {
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
      return err(
        new GenerationError(
          `No generator found for format: ${format}`,
          undefined,
          'format',
          { format }
        )
      );
    }

    return generator.generate(options);
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
    return Array.from(this.formats.keys()).sort();
  }

  /**
   * Get all supported formats (including pattern-matched ones)
   */
  getAllSupportedFormats(): StringFormat[] {
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
  }

  /**
   * Create a default registry with built-in formats
   */
  static createDefault(): FormatRegistry {
    const registry = new FormatRegistry();

    // Built-in formats will be registered by the caller
    // This avoids circular dependencies during module initialization

    return registry;
  }

  /**
   * Initialize the registry with built-in formats
   * Call this after creating the registry to register built-in formats
   */
  initializeBuiltInFormats(): void {
    // This will be called by the main module to register built-in formats
    // Import here to avoid issues during module loading
    try {
      // We'll handle this in the main index file to avoid circular deps
    } catch (error) {
      console.warn('Failed to initialize built-in formats:', error);
    }
  }
}

/**
 * Global default format registry instance
 * Can be replaced in tests or for custom configurations
 */
export const defaultFormatRegistry = FormatRegistry.createDefault();

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
