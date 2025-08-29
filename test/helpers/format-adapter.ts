/* eslint-disable max-lines */
/**
 * ================================================================================
 * FORMAT ADAPTER - FOUNDRYDATA TESTING v2.1
 *
 * Bridges FormatRegistry generation capabilities with AJV validation standards.
 * Implements the Adapter Pattern per ADR in format-registry-ajv-integration-decision.md
 *
 * See: docs/tests/foundrydata-complete-testing-guide-en.ts.txt
 * ================================================================================
 */

import { getAjv, type JsonSchemaDraft } from './ajv-factory';
import {
  FormatRegistry,
  type FormatOptions,
  defaultFormatRegistry,
} from '../../packages/core/src/registry/format-registry';
import { Result, err } from '../../packages/core/src/types/result';
import { GenerationError } from '../../packages/core/src/types/errors';

/**
 * Format mapping between FormatRegistry names and AJV format specifications
 * Ensures consistent behavior across both systems
 */
const FORMAT_MAPPING: Record<string, string> = {
  // Direct mappings (same name in both systems)
  uuid: 'uuid',
  email: 'email',
  date: 'date',
  'date-time': 'date-time',
  time: 'time',
  uri: 'uri',
  'uri-reference': 'uri-reference',
  hostname: 'hostname',
  ipv4: 'ipv4',
  ipv6: 'ipv6',
  regex: 'regex',

  // Alias mappings (FormatRegistry aliases → AJV standard names)
  guid: 'uuid',
  datetime: 'date-time',
  dateTime: 'date-time',
  'e-mail': 'email',
  url: 'uri',
  ip: 'ipv4',
  'ip-address': 'ipv4',
  'ipv6-address': 'ipv6',

  // Extended AJV formats not in FormatRegistry
  duration: 'duration',
  iri: 'iri',
  'iri-reference': 'iri-reference',
  'idn-email': 'idn-email',
  'idn-hostname': 'idn-hostname',

  // Annotative formats (always pass validation per Policy v2.2)
  'json-pointer': 'json-pointer',
  'relative-json-pointer': 'relative-json-pointer',
  'uri-template': 'uri-template',
};

/**
 * Options for format adapter operations
 */
export interface FormatAdapterOptions {
  /** JSON Schema draft version for AJV validation */
  draft?: JsonSchemaDraft;
  /** FormatRegistry options for generation */
  formatOptions?: FormatOptions;
  /** Registry instance to use (defaults to defaultFormatRegistry) */
  registry?: FormatRegistry;
}

/**
 * Format Adapter class implementing the bridge pattern
 * Routes validation through AJV while preserving FormatRegistry generation
 */
export class FormatAdapter {
  private readonly registry: FormatRegistry;
  private readonly defaultDraft: JsonSchemaDraft;

  constructor(
    registry: FormatRegistry = defaultFormatRegistry,
    defaultDraft: JsonSchemaDraft = '2020-12'
  ) {
    this.registry = registry;
    this.defaultDraft = defaultDraft;
  }

  /**
   * Validate a value against a format using AJV as single source of truth
   * @param format Format name (supports both FormatRegistry and AJV names)
   * @param value Value to validate
   * @param options Adapter options
   * @returns true if valid according to AJV, false otherwise
   */
  validate(
    format: string,
    value: string,
    options: FormatAdapterOptions = {}
  ): boolean {
    const { draft = this.defaultDraft } = options;

    // Map format name to AJV standard
    const ajvFormat = this.mapFormatName(format);
    if (!ajvFormat) {
      return false; // Unknown format
    }

    // Create minimal schema for format validation
    const schema = {
      type: 'string',
      format: ajvFormat,
    } as const;

    try {
      const ajv = getAjv(draft);
      const validate = ajv.compile(schema);
      return validate(value);
    } catch {
      // AJV compilation failed - format not supported in this draft
      return false;
    }
  }

  /**
   * Generate a value for the format using FormatRegistry
   * Preserves FormatRegistry's superior generation capabilities
   * @param format Format name
   * @param options Adapter options
   * @returns Generated value or error
   */
  generate(
    format: string,
    options: FormatAdapterOptions = {}
  ): Result<string, GenerationError> {
    const { formatOptions } = options;

    // Try FormatRegistry generation first (preserves existing UX)
    const registryResult = this.registry.generate(format, formatOptions);
    if (registryResult.isOk()) {
      return registryResult;
    }

    // If FormatRegistry doesn't support it, but AJV does, provide helpful error
    const ajvFormat = this.mapFormatName(format);
    if (ajvFormat && this.isFormatSupportedByAjv(ajvFormat, options.draft)) {
      return err(
        new GenerationError(
          `Format "${format}" is supported for validation but not generation`,
          `FormatRegistry can validate "${format}" via AJV but cannot generate values`,
          undefined,
          'format',
          {
            format,
            ajvFormat,
            suggestion: 'Use a format generator or provide sample values',
          }
        )
      );
    }

    // Return original FormatRegistry error
    return registryResult;
  }

  /**
   * Check if a format is supported (by either system)
   * @param format Format name
   * @param options Adapter options
   * @returns true if supported for validation or generation
   */
  supports(format: string, options: FormatAdapterOptions = {}): boolean {
    // Check FormatRegistry support first
    if (this.registry.supports(format)) {
      return true;
    }

    // Check AJV support via mapping
    const ajvFormat = this.mapFormatName(format);
    return ajvFormat
      ? this.isFormatSupportedByAjv(ajvFormat, options.draft)
      : false;
  }

  /**
   * Get all supported formats from both systems
   * @param options Adapter options
   * @returns Array of supported format names
   */
  getSupportedFormats(options: FormatAdapterOptions = {}): string[] {
    const { draft = this.defaultDraft } = options;

    // Get FormatRegistry formats
    const registryFormats = new Set(this.registry.getRegisteredFormats());

    // Add AJV-only formats
    const ajvFormats = this.getAjvSupportedFormats(draft);
    for (const ajvFormat of ajvFormats) {
      registryFormats.add(ajvFormat);
    }

    // Add reverse mappings for aliases
    for (const [alias, standard] of Object.entries(FORMAT_MAPPING)) {
      if (registryFormats.has(standard)) {
        registryFormats.add(alias);
      }
    }

    return Array.from(registryFormats).sort();
  }

  /**
   * Map FormatRegistry format name to AJV format name
   * @param format Format name from FormatRegistry or alias
   * @returns AJV standard format name or null if not mappable
   */
  private mapFormatName(format: string): string | null {
    // Direct mapping lookup
    const mapped = FORMAT_MAPPING[format];
    if (mapped) {
      return mapped;
    }

    // Check if it's already a standard AJV format name
    if (Object.values(FORMAT_MAPPING).includes(format)) {
      return format;
    }

    // Case-insensitive search
    const lowerFormat = format.toLowerCase();
    for (const [key, value] of Object.entries(FORMAT_MAPPING)) {
      if (key.toLowerCase() === lowerFormat) {
        return value;
      }
    }

    return null;
  }

  /**
   * Check if AJV supports a format in the given draft
   * @param ajvFormat AJV standard format name
   * @param draft JSON Schema draft version
   * @returns true if supported, false otherwise
   */
  private isFormatSupportedByAjv(
    ajvFormat: string,
    draft: JsonSchemaDraft = this.defaultDraft
  ): boolean {
    try {
      const ajv = getAjv(draft);
      const schema = { type: 'string', format: ajvFormat } as const;
      ajv.compile(schema); // Will throw if format not supported
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get formats supported by AJV in the given draft
   * @param draft JSON Schema draft version
   * @returns Array of AJV-supported format names
   */
  private getAjvSupportedFormats(draft: JsonSchemaDraft): string[] {
    const commonFormats = [
      'date-time',
      'date',
      'time',
      'duration',
      'email',
      'idn-email',
      'hostname',
      'idn-hostname',
      'ipv4',
      'ipv6',
      'uri',
      'uri-reference',
      'iri',
      'iri-reference',
      'uuid',
      'regex',
      'json-pointer',
      'relative-json-pointer',
      'uri-template',
    ];

    // Filter by what's actually supported in this draft
    return commonFormats.filter((format) =>
      this.isFormatSupportedByAjv(format, draft)
    );
  }
}

/**
 * Default format adapter instance using the global FormatRegistry
 */
export const defaultFormatAdapter = new FormatAdapter();

/**
 * Convenience function: Validate using default adapter
 */
export function validateFormat(
  format: string,
  value: string,
  options?: FormatAdapterOptions
): boolean {
  return defaultFormatAdapter.validate(format, value, options);
}

/**
 * Convenience function: Generate using default adapter
 */
export function generateFormat(
  format: string,
  options?: FormatAdapterOptions
): Result<string, GenerationError> {
  return defaultFormatAdapter.generate(format, options);
}

/**
 * Convenience function: Check support using default adapter
 */
export function supportsFormat(
  format: string,
  options?: FormatAdapterOptions
): boolean {
  return defaultFormatAdapter.supports(format, options);
}

/**
 * Convenience function: Get all supported formats using default adapter
 */
export function getSupportedFormats(options?: FormatAdapterOptions): string[] {
  return defaultFormatAdapter.getSupportedFormats(options);
}
