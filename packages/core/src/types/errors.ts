/* eslint-disable max-lines */
/**
 * Error hierarchy for FoundryData
 * Provides structured error handling with context and suggestions
 */

import {
  ErrorCode,
  type Severity,
  getExitCode as _getExitCode,
} from '../errors/codes';

/**
 * Typed error context shared across error types
 * Note: path vs schemaPath semantics are enforced by subclasses (next tasks)
 */
export interface ErrorContext {
  path?: string; // JSON Pointer for instance data (e.g., '/users/0/name')
  schemaPath?: string; // JSON Schema pointer (e.g., '#/properties/name')
  ref?: string; // External reference URI
  value?: unknown; // Problematic value (may contain PII)
  valueExcerpt?: string; // Safe excerpt of value
  limitationKey?: string; // Registry key for known limitations
  availableIn?: string; // Version when feature becomes available
  // Allow unknown extras for backward-compatibility with existing callers
  [key: string]: unknown;
}

export interface SerializedError {
  name: string;
  message: string;
  code?: string; // legacy code
  errorCode: ErrorCode; // stable error code
  severity: Severity;
  context?: ErrorContext;
  stack?: string;
  cause?: { name: string; message: string } | undefined;
}

export interface UserError {
  message: string;
  code: ErrorCode;
  severity: Severity;
  path?: string;
  schemaPath?: string;
}

/**
 * Base error class for all FoundryData errors
 */
export abstract class FoundryError extends Error {
  // Legacy string code (kept for backward-compatibility until subclasses are refactored)
  public readonly code!: string;
  // New stable error code
  public readonly errorCode: ErrorCode;
  public readonly severity: Severity;
  public readonly context?: ErrorContext;
  public readonly cause?: Error;

  // Optional enrichment fields (populated by future systems like limitations registry)
  public suggestions?: string[];
  public documentation?: string;
  public limitationKey?: string;
  public availableIn?: string;

  // Overloads: keep legacy signature while introducing the new params object
  constructor(message: string, code: string, context?: Record<string, any>);
  constructor(params: {
    message: string;
    errorCode: ErrorCode;
    severity?: Severity;
    context?: ErrorContext;
    cause?: Error;
  });
  constructor(
    arg1:
      | string
      | {
          message: string;
          errorCode: ErrorCode;
          severity?: Severity;
          context?: ErrorContext;
          cause?: Error;
        },
    arg2?: string,
    arg3?: Record<string, any>
  ) {
    // Determine which overload we are using
    if (typeof arg1 === 'string') {
      // Legacy signature
      const message = arg1;
      const legacyCode = arg2 ?? 'INTERNAL_ERROR';
      const legacyContext = (arg3 ?? {}) as ErrorContext;

      super(message);
      this.name = this.constructor.name;
      // Preserve legacy string code
      (this as any).code = legacyCode;
      // Map to stable code conservatively (default to INTERNAL_ERROR)
      this.errorCode = ErrorCode.INTERNAL_ERROR;
      this.severity = 'error';
      this.context = legacyContext;

      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      }
      return;
    }

    // New params object signature
    const { message, errorCode, severity = 'error', context, cause } = arg1;
    super(message, { cause });
    this.name = this.constructor.name;
    // Keep a legacy code string for compatibility until subclasses are updated
    (this as any).code = (this as any).code ?? undefined;
    this.errorCode = errorCode;
    this.severity = severity;
    this.context = context;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error to JSON for logging and debugging
   * - dev: includes stack and full context
   * - prod: excludes stack and applies basic PII redaction to context.value
   */
  toJSON(env: 'dev' | 'prod' = 'dev'): SerializedError {
    const base: SerializedError = {
      name: this.name,
      message: this.message,
      code: (this as any).code,
      errorCode: this.errorCode,
      severity: this.severity,
      context:
        env === 'prod' ? this.#redactContext(this.context) : this.context,
      cause: this.cause
        ? { name: this.cause.name, message: this.cause.message }
        : undefined,
    };

    if (env !== 'prod') {
      base.stack = this.stack;
    }
    return base;
  }

  /** Return a minimal, safe structure for external exposure */
  toUserError(): UserError {
    return {
      message: this.message,
      code: this.errorCode,
      severity: this.severity,
      path: this.context?.path as string | undefined,
      schemaPath: this.context?.schemaPath as string | undefined,
    };
  }

  /** Resolve the process exit code associated with this error */
  getExitCode(): number {
    return _getExitCode(this.errorCode);
  }

  // Basic PII redaction for production serialization
  #redactContext(context?: ErrorContext): ErrorContext | undefined {
    if (!context) return context;
    const SENSITIVE_KEYS = new Set([
      'password',
      'apiKey',
      'secret',
      'token',
      'ssn',
      'creditCard',
    ]);

    const redactValue = (val: unknown): unknown => {
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) return val.map(redactValue);
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
          out[k] = SENSITIVE_KEYS.has(k) ? '[REDACTED]' : redactValue(v);
        }
        return out;
      }
      return val;
    };

    const redacted: ErrorContext = { ...context };
    if ('value' in redacted) {
      redacted.value = redactValue(redacted.value);
    }
    return redacted;
  }
}

/**
 * Schema-related errors (parsing, validation, format issues)
 */
export class SchemaError extends FoundryError {
  constructor(
    message: string,
    public readonly path: string,
    public readonly suggestion?: string,
    context?: Record<string, any>
  ) {
    super(message, 'SCHEMA_ERROR', { path, suggestion, ...context });
  }

  getUserMessage(): string {
    return `Schema error at "${this.path}": ${this.message}`;
  }

  getSuggestions(): string[] {
    const suggestions: string[] = [];

    if (this.suggestion) {
      suggestions.push(this.suggestion);
    }

    suggestions.push('Check the JSON Schema specification for valid syntax');
    suggestions.push('Validate your schema using a JSON Schema validator');

    return suggestions;
  }
}

/**
 * Data generation errors (constraints, type mismatches, impossible requirements)
 */
export class GenerationError extends FoundryError {
  constructor(
    message: string,
    public readonly suggestion?: string,
    public readonly field?: string,
    public readonly constraint?: string,
    context?: Record<string, any>
  ) {
    super(message, 'GENERATION_ERROR', {
      field,
      constraint,
      suggestion,
      ...context,
    });
  }

  getUserMessage(): string {
    const fieldPart = this.field ? ` for field "${this.field}"` : '';
    const constraintPart = this.constraint
      ? ` (constraint: ${this.constraint})`
      : '';
    return `Generation failed${fieldPart}: ${this.message}${constraintPart}`;
  }

  getSuggestions(): string[] {
    const suggestions: string[] = [];

    // Add explicit suggestion if provided
    if (this.suggestion) {
      suggestions.push(this.suggestion);
    }

    if (this.constraint === 'minLength' || this.constraint === 'maxLength') {
      suggestions.push(
        'Check that minLength <= maxLength for string constraints'
      );
    }

    if (this.constraint === 'minimum' || this.constraint === 'maximum') {
      suggestions.push('Check that minimum <= maximum for number constraints');
    }

    if (this.constraint === 'pattern') {
      suggestions.push(
        'Verify that the regex pattern is valid and not too restrictive'
      );
    }

    suggestions.push('Review your schema constraints for conflicts');
    suggestions.push('Consider using more flexible constraints or formats');

    return suggestions;
  }
}

/**
 * Validation errors (compliance checking, AJV errors, data integrity)
 */
export class ValidationError extends FoundryError {
  constructor(
    message: string,
    public readonly failures: ValidationFailure[],
    context?: Record<string, any>
  ) {
    super(message, 'VALIDATION_ERROR', {
      failureCount: failures.length,
      ...context,
    });
    this.failures = failures;
  }

  getUserMessage(): string {
    const count = this.failures.length;
    const plural = count === 1 ? 'failure' : 'failures';
    return `Validation failed with ${count} ${plural}: ${this.message}`;
  }

  getSuggestions(): string[] {
    const suggestions: string[] = [];

    // Analyze common failure patterns
    const errorTypes = new Set(this.failures.map((f) => f.keyword));

    if (errorTypes.has('required')) {
      suggestions.push(
        'Ensure all required fields are present in the generated data'
      );
    }

    if (errorTypes.has('type')) {
      suggestions.push('Check that generated values match the expected types');
    }

    if (errorTypes.has('format')) {
      suggestions.push('Verify that format generators produce valid values');
    }

    if (errorTypes.has('minimum') || errorTypes.has('maximum')) {
      suggestions.push('Check numeric constraints and ranges');
    }

    suggestions.push('Review the first few validation failures for patterns');
    suggestions.push('Test with a smaller dataset to isolate issues');

    return suggestions;
  }
}

/**
 * Configuration and setup errors
 */
export class ConfigError extends FoundryError {
  constructor(
    message: string,
    public readonly setting?: string,
    context?: Record<string, any>
  ) {
    super(message, 'CONFIG_ERROR', { setting, ...context });
  }

  getUserMessage(): string {
    const settingPart = this.setting ? ` (setting: ${this.setting})` : '';
    return `Configuration error${settingPart}: ${this.message}`;
  }

  getSuggestions(): string[] {
    return [
      'Check your configuration file syntax',
      'Verify all required settings are provided',
      'Consult the documentation for valid configuration options',
    ];
  }
}

/**
 * Parser errors (JSON Schema parsing, OpenAPI conversion)
 */
export class ParseError extends FoundryError {
  constructor(
    message: string,
    public readonly input?: string,
    public readonly position?: number,
    context?: Record<string, any>
  ) {
    super(message, 'PARSE_ERROR', { input, position, ...context });
  }

  getUserMessage(): string {
    const positionPart =
      this.position !== undefined ? ` at position ${this.position}` : '';
    return `Parse error${positionPart}: ${this.message}`;
  }

  getSuggestions(): string[] {
    return [
      'Validate your JSON syntax',
      'Check for missing commas, brackets, or quotes',
      'Use a JSON formatter to identify syntax issues',
    ];
  }
}

/**
 * Individual validation failure details
 */
export interface ValidationFailure {
  path: string;
  message: string;
  keyword: string;
  schemaPath: string;
  value?: any;
  params?: Record<string, any>;
}

/**
 * Error reporter for user-friendly error formatting
 */
export class ErrorReporter {
  /**
   * Format a single error for display
   */
  formatError(error: FoundryError): string {
    const lines: string[] = [];

    // Error header with emoji
    const emoji = this.getErrorEmoji(error);
    const userMessage = (error as any).getUserMessage?.() ?? error.message;
    lines.push(`${emoji} ${userMessage}`);

    // Context information
    if (error.context && Object.keys(error.context).length > 0) {
      lines.push('');
      lines.push('Context:');
      for (const [key, value] of Object.entries(error.context)) {
        if (key !== 'suggestion' && value !== undefined) {
          lines.push(`  ${key}: ${String(value)}`);
        }
      }
    }

    // Suggestions
    const suggestions =
      (error as any).getSuggestions?.() ?? error.suggestions ?? [];
    if (suggestions.length > 0) {
      lines.push('');
      lines.push('💡 Suggestions:');
      for (const suggestion of suggestions) {
        lines.push(`  • ${suggestion}`);
      }
    }

    // Detailed failures for ValidationError
    if (error instanceof ValidationError && error.failures.length > 0) {
      lines.push('');
      lines.push('📋 Validation Failures:');

      // Show first 5 failures to avoid overwhelming output
      const displayFailures = error.failures.slice(0, 5);
      for (const failure of displayFailures) {
        lines.push(`  • ${failure.path}: ${failure.message}`);
      }

      if (error.failures.length > 5) {
        const remaining = error.failures.length - 5;
        lines.push(`  ... and ${remaining} more failure(s)`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Format multiple errors for batch display
   */
  formatErrors(errors: FoundryError[]): string {
    if (errors.length === 0) {
      return '✅ No errors found';
    }

    if (errors.length === 1) {
      const firstError = errors[0];
      if (firstError) {
        return this.formatError(firstError);
      }
    }

    const lines: string[] = [];
    lines.push(`❌ Found ${errors.length} errors:`);
    lines.push('');

    for (let i = 0; i < errors.length; i++) {
      const error = errors[i];
      if (error) {
        lines.push(`${i + 1}. ${this.formatError(error)}`);
        if (i < errors.length - 1) {
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Get appropriate emoji for error type
   */
  private getErrorEmoji(error: FoundryError): string {
    if (error instanceof SchemaError) return '📋';
    if (error instanceof GenerationError) return '🔧';
    if (error instanceof ValidationError) return '✅';
    if (error instanceof ConfigError) return '⚙️';
    if (error instanceof ParseError) return '📝';
    return '❌';
  }

  /**
   * Create a summary report for multiple errors
   */
  createSummary(errors: FoundryError[]): ErrorSummary {
    const summary: ErrorSummary = {
      total: errors.length,
      byType: {},
      mostCommon: [],
      suggestions: new Set(),
    };

    // Count by type
    for (const error of errors) {
      const type = error.constructor.name;
      summary.byType[type] = (summary.byType[type] || 0) + 1;

      // Collect suggestions
      const suggs =
        (error as any).getSuggestions?.() ?? error.suggestions ?? [];
      for (const suggestion of suggs) {
        summary.suggestions.add(suggestion);
      }
    }

    // Find most common error types
    summary.mostCommon = Object.entries(summary.byType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([type, count]) => ({ type, count }));

    return summary;
  }
}

/**
 * Error summary for reporting and analytics
 */
export interface ErrorSummary {
  total: number;
  byType: Record<string, number>;
  mostCommon: Array<{ type: string; count: number }>;
  suggestions: Set<string>;
}

/**
 * Utility functions for error handling
 */
export function isFoundryError(error: unknown): error is FoundryError {
  return error instanceof FoundryError;
}

export function createValidationFailure(
  path: string,
  message: string,
  keyword: string,
  schemaPath: string,
  value?: any,
  params?: Record<string, any>
): ValidationFailure {
  return {
    path,
    message,
    keyword,
    schemaPath,
    value,
    params,
  };
}
