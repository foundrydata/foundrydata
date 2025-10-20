/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */
/**
 * Compliance Validator using AJV for JSON Schema validation
 * Ensures 100% schema compliance with detailed error reporting
 */

/* eslint-disable max-lines */
import Ajv from 'ajv';
import Ajv2019 from 'ajv/dist/2019.js';
import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction, JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';
import draft2019Formats from 'ajv-formats-draft2019';

import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import {
  ValidationError,
  ValidationFailure,
  createValidationFailure,
} from '../types/errors.js';
import { resolveOptions } from '../types/options.js';

/** Simple LRU map used to bound cache size per AJV instance */
class LRUMap<K, V> {
  private readonly map = new Map<K, V>();
  constructor(private readonly capacity: number) {}
  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }
  }
  clear(): void {
    this.map.clear();
  }
  get size(): number {
    return this.map.size;
  }
}

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
  strict?: boolean | 'log';
  allErrors?: boolean;
  verbose?: boolean;
  removeAdditional?: boolean;
  useDefaults?: boolean;
  coerceTypes?: boolean;
  validateFormats?: boolean;
  strictTypes?: boolean | 'log';
  strictNumbers?: boolean | 'log';
  strictRequired?: boolean | 'log';
  /** Validate meta-schema keywords strictly (unknown keywords, etc.) */
  strictSchema?: boolean | 'log';
  /** Allow non-standard union types like "string|number" */
  allowUnionTypes?: boolean;
  maxErrors?: number;
  /** Force a specific JSON Schema draft instead of auto-detection */
  draft?: 'draft-07' | '2019-09' | '2020-12';
  /** Control AJV's tuple strictness checks */
  strictTuples?: boolean | 'log';
}

/**
 * High-performance compliance validator using AJV
 * Uses singleton AJV instance with WeakMap caching for optimal performance
 */
export class ComplianceValidator {
  // Lazily created AJV instances per draft
  private ajv07?: Ajv;
  private ajv2019?: Ajv;
  private ajv2020?: Ajv;
  // Per-AJV caches
  private compiledValidators = new Map<
    Ajv,
    WeakMap<object, ValidateFunction>
  >();
  private schemaKeyMap = new Map<Ajv, LRUMap<string, object>>();
  private performanceMetrics = {
    totalValidations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalValidationTime: 0,
  };
  private readonly opts: ComplianceValidatorOptions;
  private readonly schemaLRUCapacity: number;

  constructor(options: ComplianceValidatorOptions = {}) {
    // Store options for later AJV initialization (lazy per-draft)
    this.opts = options;
    // Use generous default to avoid test flakiness; still bounded (SPEC §14)
    this.schemaLRUCapacity = Math.max(1024, resolveOptions().cache.lruSize);
  }

  /** Create or return an AJV instance for the given draft */
  private getAjvForDraft(draft: '2020-12' | '2019-09' | 'draft-07'): Ajv {
    const baseOptions = {
      strict: this.opts.strict ?? true,
      allErrors: this.opts.allErrors ?? true,
      verbose: this.opts.verbose ?? true,
      strictSchema: this.opts.strictSchema ?? true,
      // Allow standard union type arrays (e.g., type: ["object","boolean"]).
      // This does NOT enable non-standard "string|number" syntax.
      allowUnionTypes: this.opts.allowUnionTypes ?? true,
      // Tuple strictness: configurable; default tolerates concise tuple schemas
      strictTuples: this.opts.strictTuples ?? false,
      strictTypes: this.opts.strictTypes ?? true,
      strictNumbers: this.opts.strictNumbers ?? true,
      strictRequired: this.opts.strictRequired ?? false,
      removeAdditional: this.opts.removeAdditional ?? false,
      useDefaults: this.opts.useDefaults ?? false,
      coerceTypes: this.opts.coerceTypes ?? false,
      validateFormats: this.opts.validateFormats ?? true,
      addUsedSchema: true,
      inlineRefs: true,
      passContext: false,
      messages: true,
      logger: false,
    } as const;

    const ensureFormats = (
      ajv: Ajv,
      d: '2020-12' | '2019-09' | 'draft-07'
    ): Ajv => {
      addFormats(ajv);
      if (d !== 'draft-07') {
        // Add draft-2019+ specific formats (idn-*, iri, etc.)
        try {
          draft2019Formats(ajv);
        } catch {
          // Optional dependency; ignore if unavailable
        }
      }
      this.addSecureFormatsTo(ajv);
      // Register embedded meta-schema fragments used by example files
      this.addEmbeddedMetaSchemas(ajv, d);
      return ajv;
    };

    if (draft === '2020-12') {
      if (!this.ajv2020) {
        this.ajv2020 = ensureFormats(
          new Ajv2020(baseOptions) as unknown as Ajv,
          draft
        );
      }
      return this.ajv2020;
    }
    if (draft === '2019-09') {
      if (!this.ajv2019) {
        this.ajv2019 = ensureFormats(
          new Ajv2019(baseOptions) as unknown as Ajv,
          draft
        );
      }
      return this.ajv2019;
    }
    // draft-07
    if (!this.ajv07) {
      this.ajv07 = ensureFormats(new Ajv(baseOptions), draft);
    }
    return this.ajv07;
  }

  /**
   * Provide minimal embedded schemas for commonly referenced meta fragments
   * so that AJV can resolve refs like "meta/validation#/$defs/stringArray" without network.
   */
  private addEmbeddedMetaSchemas(
    ajv: Ajv,
    draft: '2020-12' | '2019-09' | 'draft-07'
  ): void {
    // meta/validation: define $defs.stringArray used by drafts
    ajv.addSchema(
      {
        $id: 'meta/validation',
        $defs: {
          stringArray: {
            type: 'array',
            items: { type: 'string' },
            minItems: 0,
            uniqueItems: true,
            default: [],
          },
        },
      },
      'meta/validation'
    );

    // meta/core: anchorString and uriReferenceString are referenced in 2020-12
    ajv.addSchema(
      {
        $id: 'meta/core',
        $defs: {
          anchorString: { type: 'string' },
          uriReferenceString: { type: 'string' },
        },
      },
      'meta/core'
    );

    // meta/applicator: common applicator keywords referencing schemas
    const applicator = {
      $id: 'meta/applicator',
      type: ['object', 'boolean'],
      properties: {
        // Array applicators
        items: {
          anyOf: [
            {
              type: 'array',
              items: { type: ['object', 'boolean'] },
              minItems: 0,
            },
            { type: ['object', 'boolean'] },
          ],
        },
        additionalItems: { type: ['object', 'boolean', 'boolean'] },
        contains: { type: ['object', 'boolean'] },
        prefixItems: {
          type: 'array',
          items: { type: ['object', 'boolean'] },
          minItems: 0,
        },
        // Object applicators
        properties: {
          type: 'object',
          additionalProperties: { type: ['object', 'boolean'] },
        },
        patternProperties: {
          type: 'object',
          additionalProperties: { type: ['object', 'boolean'] },
        },
        additionalProperties: { type: ['object', 'boolean', 'boolean'] },
        dependentSchemas: {
          type: 'object',
          additionalProperties: { type: ['object', 'boolean'] },
        },
        // Composition
        allOf: {
          type: 'array',
          items: { type: ['object', 'boolean'] },
          minItems: 0,
        },
        anyOf: {
          type: 'array',
          items: { type: ['object', 'boolean'] },
          minItems: 0,
        },
        oneOf: {
          type: 'array',
          items: { type: ['object', 'boolean'] },
          minItems: 0,
        },
        not: { type: ['object', 'boolean'] },
        if: { type: ['object', 'boolean'] },
        then: { type: ['object', 'boolean'] },
        else: { type: ['object', 'boolean'] },
      },
      additionalProperties: true,
    } as const;
    try {
      ajv.addSchema(applicator, 'meta/applicator');
    } catch {
      // ignore collisions
    }

    // meta/unevaluated (2020-12): unevaluatedItems/unevaluatedProperties
    if (draft === '2020-12') {
      const unevaluated = {
        $id: 'meta/unevaluated',
        type: ['object', 'boolean'],
        properties: {
          unevaluatedItems: { type: ['object', 'boolean', 'boolean'] },
          unevaluatedProperties: { type: ['object', 'boolean', 'boolean'] },
        },
        additionalProperties: true,
      } as const;
      try {
        ajv.addSchema(unevaluated, 'meta/unevaluated');
      } catch {
        // ignore
      }
    }

    // Provide stubs for less critical fragments (still stricter than true-schemas)
    const lite = (id: string): object => ({
      $id: id,
      type: ['object', 'boolean'],
    });
    const addLite = (id: string): void => {
      try {
        ajv.addSchema(lite(id), id);
      } catch {
        // ignore collisions
      }
    };
    if (draft !== 'draft-07') {
      addLite('meta/meta-data');
      addLite('meta/format');
      addLite('meta/content');
      if (draft === '2020-12') {
        addLite('meta/format-annotation');
      }
    }
  }

  /** Detect schema draft via $schema or keywords; default to 2020-12 */
  private detectDraft(schema: unknown): '2020-12' | '2019-09' | 'draft-07' {
    if (this.opts.draft) return this.opts.draft;
    const sObj = (schema as Record<string, unknown>) || {};
    const sch = sObj.$schema as string | undefined;
    if (typeof sch === 'string') {
      const s = sch.toLowerCase();
      if (s.includes('2020-12')) return '2020-12';
      if (s.includes('2019-09')) return '2019-09';
      if (s.includes('draft-07')) return 'draft-07';
    }
    // Heuristics
    if (
      '$defs' in sObj ||
      'prefixItems' in sObj ||
      'unevaluatedItems' in sObj
    ) {
      return '2020-12';
    }
    if ('definitions' in sObj) {
      return 'draft-07';
    }
    return '2020-12';
  }

  /**
   * Helper method to get or compile a validator with caching
   */
  private getOrCompileValidator(schema: object): ValidateFunction {
    const draft = this.detectDraft(schema);
    const ajv = this.getAjvForDraft(draft);

    // Set up per-AJV caches
    let wm = this.compiledValidators.get(ajv);
    if (!wm) {
      wm = new WeakMap<object, ValidateFunction>();
      this.compiledValidators.set(ajv, wm);
    }
    let km = this.schemaKeyMap.get(ajv);
    if (!km) {
      km = new LRUMap<string, object>(this.schemaLRUCapacity);
      this.schemaKeyMap.set(ajv, km);
    }

    // Prepare schema to avoid AJV id collisions with official meta-schema $id
    const prepared = this.prepareSchemaForAjv(schema);

    // Check WeakMap cache for this schema object
    let validate = wm.get(prepared);
    if (validate) {
      this.performanceMetrics.cacheHits++;
      return validate;
    }

    // Check by serialized key to deduplicate equivalent schema objects
    const schemaKey = this.getSchemaKey(prepared);
    const cachedSchemaObj = km.get(schemaKey);
    if (cachedSchemaObj) {
      validate = wm.get(cachedSchemaObj);
      if (validate) {
        this.performanceMetrics.cacheHits++;
        return validate;
      }
    }

    // Cache miss - compile new validator using selected AJV
    this.performanceMetrics.cacheMisses++;
    validate = ajv.compile(prepared as object);
    wm.set(prepared, validate);
    km.set(schemaKey, prepared);
    return validate;
  }

  /**
   * Clone and strip conflicting $id on official meta-schemas to avoid AJV re-add conflicts
   */
  private prepareSchemaForAjv(input: object): object {
    // quick shallow clone; sufficient for top-level $id/$schema handling
    const s = { ...(input as Record<string, unknown>) } as Record<
      string,
      unknown
    >;
    const id = s['$id'];
    if (typeof id === 'string') {
      const lowered = id.toLowerCase();
      if (
        lowered.includes('json-schema.org/draft-07/schema') ||
        lowered.includes('json-schema.org/draft/2019-09/schema') ||
        lowered.includes('json-schema.org/draft/2020-12/schema')
      ) {
        delete s['$id'];
      }
    }
    return s as object;
  }

  /**
   * Add secure format validators to prevent ReDoS and other security issues
   */
  private addSecureFormatsTo(ajv: Ajv): void {
    // More restrictive email format to prevent ReDoS
    const validateEmail = (email: string): boolean => {
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
    };
    ajv.addFormat('email', { type: 'string', validate: validateEmail });

    // Secure URI format with length limits
    const validateUri = (uri: string): boolean => {
      if (uri.length > 2048) return false; // Prevent extremely long URIs
      try {
        const url = new URL(uri);
        return ['http:', 'https:', 'ftp:', 'ftps:'].includes(url.protocol);
      } catch {
        return false;
      }
    };
    ajv.addFormat('uri', {
      type: 'string',
      validate: validateUri,
    });

    // Alias 'url' to same semantics as 'uri' (non-standard but widely used)
    ajv.addFormat('url', { type: 'string', validate: validateUri });

    // Aliases for date-time
    const validateDateTime = (s: string): boolean => {
      // Keep simple/rfc3339-like check: must include a 'T' separator and parse as Date
      if (!/T/.test(s)) return false;
      const t = Date.parse(s);
      return Number.isFinite(t);
    };
    ajv.addFormat('datetime', { type: 'string', validate: validateDateTime });
    ajv.addFormat('dateTime', { type: 'string', validate: validateDateTime });

    // Alias 'e-mail' to 'email'
    ajv.addFormat('e-mail', { type: 'string', validate: validateEmail });

    // Alias 'guid' to 'uuid'
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    ajv.addFormat('guid', {
      type: 'string',
      validate: (s: string) => uuidRegex.test(s),
    });

    // IPv4 with stricter validation
    ajv.addFormat('ipv4', {
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
  // @typescript-eslint/no-explicit-any
  public validate<T = unknown>(
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
  public validateSingle<T = unknown>(
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
  public isCompliant<T = unknown>(
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
    // Sum compiled schemas across all AJV instances
    const compiledSchemas = Array.from(this.schemaKeyMap.values()).reduce(
      (acc, m) => acc + m.size,
      0
    );

    return {
      compiledSchemas,
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
    // Reset per-AJV caches
    this.compiledValidators = new Map<Ajv, WeakMap<object, ValidateFunction>>();
    this.schemaKeyMap = new Map<Ajv, LRUMap<string, object>>();
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
  // Summary generation requires comprehensive statistics
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
