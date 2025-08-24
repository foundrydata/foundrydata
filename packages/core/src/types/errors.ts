/**
 * Error hierarchy for FoundryData
 * Provides structured error handling with context and suggestions
 */

/**
 * Base error class for all FoundryData errors
 */
export abstract class FoundryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error to JSON for logging and debugging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack,
    };
  }

  /**
   * Get a user-friendly error message
   */
  abstract getUserMessage(): string;

  /**
   * Get suggestions for fixing the error
   */
  abstract getSuggestions(): string[];
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
    public readonly field?: string,
    public readonly constraint?: string,
    context?: Record<string, any>
  ) {
    super(message, 'GENERATION_ERROR', { field, constraint, ...context });
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
    lines.push(`${emoji} ${error.getUserMessage()}`);

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
    const suggestions = error.getSuggestions();
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
      for (const suggestion of error.getSuggestions()) {
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
