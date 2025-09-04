/**
 * Compliance Validator using AJV for JSON Schema validation
 * Ensures 100% schema compliance with detailed error reporting
 */

/* eslint-disable max-lines */
import Ajv from 'ajv';
import type { ErrorObject, ValidateFunction, JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';

import type { Result } from '../types/result';
import { ok, err } from '../types/result';
import {
  ValidationError,
  ValidationFailure,
  createValidationFailure,
} from '../types/errors';

/**
 * Individual validation result for a single data item
 */
export interface ComplianceValidationResult {
  index: number;
  valid: boolean;
  errors: ValidationFailure[];
  path: string;
}

/**
 * Compliance report for a batch of validated data
 */
export interface ComplianceReport {
  compliant: boolean;
  score: number; // Percentage (0-100)
  passed: number;
  failed: number;
  total: number;
  details: ComplianceValidationResult[];
  duration?: number; // Validation time in milliseconds
  summary?: ComplianceSummary;
}

/**
 * Summary of compliance issues by type
 */
export interface ComplianceSummary {
  commonErrors: Array<{ keyword: string; count: number; message: string }>;
  failuresByPath: Array<{ path: string; count: number }>;
  topIssues: string[];
}

/**
 * Configuration options for ComplianceValidator
 */
export interface ComplianceValidatorOptions {
  strict?: boolean;
  allErrors?: boolean;
  verbose?: boolean;
  removeAdditional?: boolean;
  useDefaults?: boolean;
  coerceTypes?: boolean;
  validateFormats?: boolean;
  strictTypes?: boolean | 'log';
  strictNumbers?: boolean;
  strictRequired?: boolean;
  maxErrors?: number;
}

/**
 * High-performance compliance validator using AJV
 * Uses singleton AJV instance with WeakMap caching for optimal performance
 */
export class ComplianceValidator {
  private ajv: Ajv;
  private compiledValidators = new WeakMap<object, ValidateFunction>();
  private schemaKeyMap = new Map<string, object>();
  private performanceMetrics = {
    totalValidations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalValidationTime: 0,
  };

  constructor(options: ComplianceValidatorOptions = {}) {
    // Create AJV instance with configured options
    this.ajv = new Ajv({
      // Core validation options
      strict: options.strict ?? true,
      allErrors: options.allErrors ?? true,
      verbose: options.verbose ?? true,

      // Strict mode configuration
      strictTypes: options.strictTypes ?? true,
      strictNumbers: options.strictNumbers ?? true,
      strictRequired: options.strictRequired ?? false,

      // Data modification options (disabled by default for strict compliance)
      removeAdditional: options.removeAdditional ?? false,
      useDefaults: options.useDefaults ?? false,
      coerceTypes: options.coerceTypes ?? false,

      // Format validation
      validateFormats: options.validateFormats ?? true,

      // Performance and debugging
      addUsedSchema: true,
      inlineRefs: true,
      passContext: false,

      // Error handling
      messages: true,
      logger: false, // Disable console logging
    });

    // Add format validators from ajv-formats
    addFormats(this.ajv);

    // Add custom secure formats that are more restrictive
    this.addSecureFormats();
  }

  /**
   * Helper method to get or compile a validator with caching
   */
  private getOrCompileValidator(schema: object): ValidateFunction {
    // Check WeakMap cache first
    let validate = this.compiledValidators.get(schema);

    if (validate) {
      this.performanceMetrics.cacheHits++;
      return validate;
    }

    // Check if we have a cached schema object for this key
    const schemaKey = this.getSchemaKey(schema);
    const cachedSchema = this.schemaKeyMap.get(schemaKey);

    if (cachedSchema) {
      validate = this.compiledValidators.get(cachedSchema);
      if (validate) {
        this.performanceMetrics.cacheHits++;
        return validate;
      }
    }

    // Cache miss - compile new validator
    this.performanceMetrics.cacheMisses++;
    validate = this.ajv.compile(schema);
    this.compiledValidators.set(schema, validate);
    this.schemaKeyMap.set(schemaKey, schema);
    return validate;
  }

  /**
   * Add secure format validators to prevent ReDoS and other security issues
   */
  // eslint-disable-next-line max-lines-per-function
  private addSecureFormats(): void {
    // More restrictive email format to prevent ReDoS
    this.ajv.addFormat('email', {
      type: 'string',
      validate: (email: string) => {
        // Simple, fast email validation without complex regex
        if (email.length > 320) return false; // RFC 5321 limit

        const parts = email.split('@');
        if (parts.length !== 2) return false;

        const [local, domain] = parts;
        if (!local || !domain) return false;
        if (local.length > 64) return false; // RFC 5321 local part limit
        if (domain.length > 253) return false; // RFC 5321 domain limit

        // Basic character validation
        const localRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
        const domainRegex =
          /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

        return localRegex.test(local) && domainRegex.test(domain);
      },
    });

    // Secure URI format with length limits
    this.ajv.addFormat('uri', {
      type: 'string',
      validate: (uri: string) => {
        if (uri.length > 2048) return false; // Prevent extremely long URIs

        try {
          const url = new URL(uri);
          return ['http:', 'https:', 'ftp:', 'ftps:'].includes(url.protocol);
        } catch {
          return false;
        }
      },
    });

    // IPv4 with stricter validation
    this.ajv.addFormat('ipv4', {
      type: 'string',
      validate: (ip: string) => {
        if (ip.length > 15) return false; // Max IPv4 length

        const parts = ip.split('.');
        if (parts.length !== 4) return false;

        return parts.every((part) => {
          const num = parseInt(part, 10);
          return (
            !isNaN(num) && num >= 0 && num <= 255 && part === num.toString()
          );
        });
      },
    });
  }

  /**
   * Validate a batch of data items against a schema
   */
  // eslint-disable-next-line max-lines-per-function, @typescript-eslint/no-explicit-any
  public validate<T = any>(
    data: T[],
    schema: JSONSchemaType<T> | object
  ): Result<ComplianceReport, ValidationError> {
    const startTime = Date.now();
    this.performanceMetrics.totalValidations++;

    try {
      // Get or compile validator using WeakMap cache
      const validate = this.getOrCompileValidator(schema);

      const results: ComplianceValidationResult[] = [];
      let passedCount = 0;

      // Validate each item
      for (let index = 0; index < data.length; index++) {
        const item = data[index];
        const valid = validate(item);

        const validationResult: ComplianceValidationResult = {
          index,
          valid,
          errors: [],
          path: `[${index}]`,
        };

        if (!valid && validate.errors) {
          validationResult.errors = this.formatErrors(
            validate.errors,
            `[${index}]`
          );
        }

        if (valid) {
          passedCount++;
        }

        results.push(validationResult);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;
      this.performanceMetrics.totalValidationTime += duration;

      // Enforce 100% compliance invariant for testing
      const compliance =
        data.length > 0 ? (passedCount / data.length) * 100 : 100;

      // Create compliance report
      const report: ComplianceReport = {
        compliant: compliance === 100,
        score: Math.round(compliance),
        passed: passedCount,
        failed: data.length - passedCount,
        total: data.length,
        details: results,
        duration,
        summary: this.generateSummary(results),
      };

      return ok(report);
    } catch (ajvError) {
      const error =
        ajvError instanceof Error ? ajvError : new Error(String(ajvError));

      return err(
        new ValidationError(`AJV validation failed: ${error.message}`, [], {
          originalError: error.message,
          schemaPreview: JSON.stringify(schema).slice(0, 200),
        })
      );
    }
  }

  /**
   * Validate a single data item
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public validateSingle<T = any>(
    data: T,
    schema: JSONSchemaType<T> | object
  ): Result<ComplianceValidationResult, ValidationError> {
    const batchResult = this.validate([data], schema);

    if (batchResult.isErr()) {
      return err(batchResult.error);
    }

    const firstResult = batchResult.value.details[0];
    if (!firstResult) {
      return err(new ValidationError('No validation result returned', []));
    }

    return ok(firstResult);
  }

  /**
   * Check if data is compliant without detailed error information
   * Optimized for performance when only pass/fail result is needed
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public isCompliant<T = any>(
    data: T[],
    schema: JSONSchemaType<T> | object
  ): Result<boolean, ValidationError> {
    try {
      // Use the same caching mechanism as validate
      const validate = this.getOrCompileValidator(schema as object);

      // Check all items - fail fast
      for (const item of data) {
        if (!validate(item)) {
          return ok(false);
        }
      }

      return ok(true);
    } catch (ajvError) {
      const error =
        ajvError instanceof Error ? ajvError : new Error(String(ajvError));

      return err(
        new ValidationError(`Compliance check failed: ${error.message}`, [], {
          originalError: error.message,
        })
      );
    }
  }

  /**
   * Get performance metrics for the validator
   */
  public getMetrics(): {
    compiledSchemas: number;
    cacheHitRate: number;
    averageValidationTime?: number;
    totalValidations: number;
    cacheHits: number;
    cacheMisses: number;
  } {
    const cacheHitRate =
      this.performanceMetrics.totalValidations > 0
        ? this.performanceMetrics.cacheHits /
          this.performanceMetrics.totalValidations
        : 0;

    const averageValidationTime =
      this.performanceMetrics.totalValidations > 0
        ? this.performanceMetrics.totalValidationTime /
          this.performanceMetrics.totalValidations
        : undefined;

    return {
      compiledSchemas: this.schemaKeyMap.size,
      cacheHitRate,
      averageValidationTime,
      totalValidations: this.performanceMetrics.totalValidations,
      cacheHits: this.performanceMetrics.cacheHits,
      cacheMisses: this.performanceMetrics.cacheMisses,
    };
  }

  /**
   * Clear the compiled validator cache
   */
  public clearCache(): void {
    // WeakMap doesn't have a clear method, so we need to reset references
    this.compiledValidators = new WeakMap<object, ValidateFunction>();
    this.schemaKeyMap.clear();
    // Reset performance metrics on cache clear
    this.performanceMetrics = {
      totalValidations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalValidationTime: 0,
    };
  }

  /**
   * Format AJV errors into our ValidationFailure format
   */
  private formatErrors(
    errors: ErrorObject[],
    basePath: string
  ): ValidationFailure[] {
    return errors.map((error) => {
      const path = basePath + (error.instancePath || '');
      const message = error.message || 'Validation failed';

      return createValidationFailure(
        path,
        message,
        error.keyword,
        error.schemaPath,
        error.data,
        error.params || {}
      );
    });
  }

  /**
   * Generate a cache key for schema compilation
   */
  private getSchemaKey(schema: object): string {
    // Use JSON string as cache key - not perfect but simple and effective
    return JSON.stringify(schema);
  }

  /**
   * Generate summary statistics for compliance report
   */
  // eslint-disable-next-line max-lines-per-function -- Summary generation requires comprehensive statistics
  private generateSummary(
    results: ComplianceValidationResult[]
  ): ComplianceSummary {
    const errorCounts = new Map<string, number>();
    const pathCounts = new Map<string, number>();
    const messageCounts = new Map<
      string,
      { keyword: string; count: number; message: string }
    >();

    // Analyze all errors in single pass for performance

    for (const result of results) {
      if (!result.valid) {
        for (const error of result.errors) {
          // Count by keyword
          errorCounts.set(
            error.keyword,
            (errorCounts.get(error.keyword) || 0) + 1
          );

          // Count by path
          pathCounts.set(error.path, (pathCounts.get(error.path) || 0) + 1);

          // Count by message
          const messageKey = `${error.keyword}:${error.message}`;
          // eslint-disable-next-line max-depth
          if (!messageCounts.has(messageKey)) {
            messageCounts.set(messageKey, {
              keyword: error.keyword,
              count: 0,
              message: error.message,
            });
          }
          messageCounts.get(messageKey)!.count++;
        }
      }
    }

    // Sort and take top items
    const commonErrors = Array.from(messageCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const failuresByPath = Array.from(pathCounts.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topIssues = Array.from(errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([keyword, count]) => `${keyword} (${count} failures)`);

    return {
      commonErrors,
      failuresByPath,
      topIssues,
    };
  }
}

/**
 * Create a pre-configured compliance validator with security-focused settings
 */
export function createSecureValidator(
  options: Partial<ComplianceValidatorOptions> = {}
): ComplianceValidator {
  return new ComplianceValidator({
    strict: true,
    allErrors: true,
    verbose: true,
    validateFormats: true,
    strictTypes: true,
    strictNumbers: true,
    strictRequired: true,
    removeAdditional: false,
    useDefaults: false,
    coerceTypes: false,
    ...options,
  });
}

/**
 * Create a performance-optimized validator for high-throughput scenarios
 */
export function createFastValidator(
  options: Partial<ComplianceValidatorOptions> = {}
): ComplianceValidator {
  return new ComplianceValidator({
    strict: true,
    allErrors: false, // Stop at first error
    verbose: false,
    validateFormats: true,
    strictTypes: 'log', // Log instead of throwing
    strictNumbers: false,
    strictRequired: false,
    ...options,
  });
}
