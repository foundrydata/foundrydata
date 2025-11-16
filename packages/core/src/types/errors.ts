/* eslint-disable max-lines */
/**
 * Error hierarchy for FoundryData
 * Provides structured error handling with context and suggestions
 */

import {
  ErrorCode,
  type Severity,
  getExitCode as _getExitCode,
} from '../errors/codes.js';

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
  // Legacy overload
  constructor(
    message: string,
    path: string,
    suggestion?: string,
    context?: Record<string, any>
  );
  constructor(params: {
    message: string;
    errorCode?: ErrorCode;
    context: ErrorContext & { schemaPath: string; ref?: string };
    severity?: Severity;
    cause?: Error;
  });
  constructor(
    arg1:
      | string
      | {
          message: string;
          errorCode?: ErrorCode;
          context: ErrorContext & { schemaPath: string; ref?: string };
          severity?: Severity;
          cause?: Error;
        },
    path?: string,
    suggestion?: string,
    context?: Record<string, any>
  ) {
    if (typeof arg1 === 'string') {
      const message = arg1;
      super({
        message,
        errorCode: ErrorCode.INVALID_SCHEMA_STRUCTURE,
        context: { schemaPath: path as string, suggestion, ...(context ?? {}) },
      });
      (this as any).code = 'SCHEMA_ERROR';
      return;
    }
    const params = arg1;
    super({
      message: params.message,
      errorCode: params.errorCode ?? ErrorCode.INVALID_SCHEMA_STRUCTURE,
      context: params.context,
      severity: params.severity,
      cause: params.cause,
    });
  }

  // Backward-compatible getters
  get path(): string | undefined {
    return this.context?.schemaPath as string | undefined;
  }
  get suggestion(): string | undefined {
    return this.context?.suggestion as string | undefined;
  }
}

/**
 * Data generation errors (constraints, type mismatches, impossible requirements)
 */
export class GenerationError extends FoundryError {
  // Legacy overload
  constructor(
    message: string,
    suggestion?: string,
    field?: string,
    constraint?: string,
    context?: Record<string, any>
  );
  constructor(params: {
    message: string;
    errorCode?: ErrorCode;
    context?: ErrorContext & { field?: string; constraint?: string };
    severity?: Severity;
    cause?: Error;
  });
  constructor(
    arg1:
      | string
      | {
          message: string;
          errorCode?: ErrorCode;
          context?: ErrorContext & { field?: string; constraint?: string };
          severity?: Severity;
          cause?: Error;
        },
    suggestion?: string,
    field?: string,
    constraint?: string,
    context?: Record<string, any>
  ) {
    if (typeof arg1 === 'string') {
      const message = arg1;
      super({
        message,
        errorCode: ErrorCode.CONSTRAINT_VIOLATION,
        context: { field, constraint, suggestion, ...(context ?? {}) },
      });
      (this as any).code = 'GENERATION_ERROR';
      return;
    }
    const params = arg1;
    super({
      message: params.message,
      errorCode: params.errorCode ?? ErrorCode.CONSTRAINT_VIOLATION,
      context: params.context,
      severity: params.severity,
      cause: params.cause,
    });
  }

  // Backward-compatible getters
  get field(): string | undefined {
    return this.context?.field as string | undefined;
  }
  get constraint(): string | undefined {
    return this.context?.constraint as string | undefined;
  }
  get suggestion(): string | undefined {
    return this.context?.suggestion as string | undefined;
  }
}

/**
 * Validation errors (compliance checking, AJV errors, data integrity)
 */
export class ValidationError extends FoundryError {
  public readonly failures: ValidationFailure[];
  // Legacy overload
  constructor(
    message: string,
    failures: ValidationFailure[],
    context?: Record<string, any>
  );
  constructor(params: {
    message: string;
    failures: ValidationFailure[];
    errorCode?: ErrorCode;
    context?: ErrorContext;
    severity?: Severity;
    cause?: Error;
  });
  constructor(
    arg1:
      | string
      | {
          message: string;
          failures: ValidationFailure[];
          errorCode?: ErrorCode;
          context?: ErrorContext;
          severity?: Severity;
          cause?: Error;
        },
    failures?: ValidationFailure[],
    context?: Record<string, any>
  ) {
    if (typeof arg1 === 'string') {
      const message = arg1;
      const f = failures ?? [];
      super({
        message,
        errorCode: ErrorCode.COMPLIANCE_VALIDATION_FAILED,
        context: { failureCount: f.length, ...(context ?? {}) },
      });
      (this as any).code = 'VALIDATION_ERROR';
      this.failures = f;
      return;
    }
    const params = arg1;
    super({
      message: params.message,
      errorCode: params.errorCode ?? ErrorCode.COMPLIANCE_VALIDATION_FAILED,
      context: {
        failureCount: params.failures.length,
        ...(params.context ?? {}),
      },
      severity: params.severity,
      cause: params.cause,
    });
    this.failures = params.failures;
  }
}

/**
 * Configuration and setup errors
 */
export class ConfigError extends FoundryError {
  // Legacy overload
  constructor(message: string, setting?: string, context?: Record<string, any>);
  constructor(params: {
    message: string;
    errorCode?: ErrorCode;
    context?: ErrorContext & { setting?: string };
    severity?: Severity;
    cause?: Error;
  });
  constructor(
    arg1:
      | string
      | {
          message: string;
          errorCode?: ErrorCode;
          context?: ErrorContext & { setting?: string };
          severity?: Severity;
          cause?: Error;
        },
    setting?: string,
    context?: Record<string, any>
  ) {
    if (typeof arg1 === 'string') {
      const message = arg1;
      super({
        message,
        errorCode: ErrorCode.CONFIGURATION_ERROR,
        context: { setting, ...(context ?? {}) },
      });
      (this as any).code = 'CONFIG_ERROR';
      return;
    }
    const params = arg1;
    super({
      message: params.message,
      errorCode: params.errorCode ?? ErrorCode.CONFIGURATION_ERROR,
      context: params.context,
      severity: params.severity,
      cause: params.cause,
    });
  }

  // Backward-compatible getter
  get setting(): string | undefined {
    return this.context?.setting as string | undefined;
  }
}

/**
 * Parser errors (JSON Schema parsing, OpenAPI conversion)
 */
export class ParseError extends FoundryError {
  // Legacy overload
  constructor(
    message: string,
    input?: string,
    position?: number,
    context?: Record<string, any>
  );
  constructor(params: {
    message: string;
    errorCode?: ErrorCode;
    context?: ErrorContext & { input?: string; position?: number };
    severity?: Severity;
    cause?: Error;
  });
  constructor(
    arg1:
      | string
      | {
          message: string;
          errorCode?: ErrorCode;
          context?: ErrorContext & { input?: string; position?: number };
          severity?: Severity;
          cause?: Error;
        },
    input?: string,
    position?: number,
    context?: Record<string, any>
  ) {
    if (typeof arg1 === 'string') {
      const message = arg1;
      super({
        message,
        errorCode: ErrorCode.PARSE_ERROR,
        context: { input, position, ...(context ?? {}) },
      });
      (this as any).code = 'PARSE_ERROR';
      return;
    }
    const params = arg1;
    super({
      message: params.message,
      errorCode: params.errorCode ?? ErrorCode.PARSE_ERROR,
      context: params.context,
      severity: params.severity,
      cause: params.cause,
    });
  }

  // Backward-compatible getters
  get input(): string | undefined {
    return this.context?.input as string | undefined;
  }
  get position(): number | undefined {
    return this.context?.position as number | undefined;
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
// ErrorReporter removed in favor of ErrorPresenter (pure presentation layer)

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
