import { describe, it, expect, beforeEach } from 'vitest';
/**
 * Tests for Error hierarchy
 * Comprehensive coverage of all error types and ErrorReporter
 */

import {
  FoundryError,
  SchemaError,
  GenerationError,
  ValidationError,
  ConfigError,
  ParseError,
  ValidationFailure,
  ErrorReporter,
  isFoundryError,
  createValidationFailure,
} from '../errors';
import { ErrorCode, getExitCode } from '../../errors/codes';

describe('Error Hierarchy', () => {
  describe('FoundryError base class', () => {
    class TestError extends FoundryError {
      constructor(message: string, context?: Record<string, any>) {
        super({ message, errorCode: ErrorCode.INTERNAL_ERROR, context });
      }
    }

    it('creates error with new params object', () => {
      const error = new TestError('Test message');

      expect(error.message).toBe('Test message');
      expect(error.errorCode).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.severity).toBe('error');
      expect(error.name).toBe('TestError');
    });

    it('includes context and supports cause', () => {
      const cause = new Error('root cause');
      const error = new (class extends FoundryError {})({
        message: 'Higher level',
        errorCode: ErrorCode.CONFIGURATION_ERROR,
        context: { field: 'test', value: { password: 'secret123' } },
        cause,
      });

      expect(error.context).toMatchObject({ field: 'test' });
      expect(error.cause?.message).toBe('root cause');
    });

    it('serializes differently for dev and prod', () => {
      const error = new (class extends FoundryError {})({
        message: 'Serialize me',
        errorCode: ErrorCode.CONFIGURATION_ERROR,
        context: { value: { password: 'secret123', safe: 'ok' } },
      });

      const devJson = error.toJSON('dev');
      const prodJson = error.toJSON('prod');

      // dev includes stack and full value
      expect(devJson.stack).toBeDefined();
      expect(devJson.context?.value).toMatchObject({
        password: 'secret123',
        safe: 'ok',
      });

      // prod excludes stack and redacts sensitive fields
      expect(prodJson.stack).toBeUndefined();
      expect(prodJson.context?.value).toMatchObject({
        password: '[REDACTED]',
        safe: 'ok',
      });
    });

    it('returns exit code mapping from ErrorCode', () => {
      const error = new (class extends FoundryError {})({
        message: 'Exit please',
        errorCode: ErrorCode.PARSE_ERROR,
      });

      expect(error.getExitCode()).toBe(getExitCode(ErrorCode.PARSE_ERROR));
    });

    it('maintains proper prototype chain', () => {
      const error = new TestError('Test message');
      expect(error).toBeInstanceOf(TestError);
      expect(error).toBeInstanceOf(FoundryError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('SchemaError', () => {
    it('creates schema error with required schemaPath and default code', () => {
      const error = new SchemaError({
        message: 'Invalid schema',
        context: { schemaPath: '#/properties/name' },
      });

      expect(error.message).toBe('Invalid schema');
      expect(error.errorCode).toBe(ErrorCode.INVALID_SCHEMA_STRUCTURE);
      expect(error.context?.schemaPath).toBe('#/properties/name');
    });

    it('includes optional ref and serializes context', () => {
      const error = new SchemaError({
        message: 'Ref missing',
        context: { schemaPath: '#/defs/Address', ref: 'file://schema.json' },
      });
      const json = error.toJSON('dev');
      expect(json.context!.schemaPath).toBe('#/defs/Address');
      expect((json.context as any)!.ref).toBe('file://schema.json');
    });
  });

  describe('GenerationError', () => {
    it('creates generation error with context and default code', () => {
      const error = new GenerationError({
        message: 'Cannot generate value',
        context: { field: 'email', constraint: 'pattern' },
      });

      expect(error.message).toBe('Cannot generate value');
      expect(error.errorCode).toBe(ErrorCode.CONSTRAINT_VIOLATION);
      expect(error.context?.field).toBe('email');
      expect(error.context?.constraint).toBe('pattern');
    });

    it('handles missing field and constraint gracefully', () => {
      const error = new GenerationError({ message: 'General error' });
      expect(error.message).toBe('General error');
      expect(error.errorCode).toBe(ErrorCode.CONSTRAINT_VIOLATION);
    });
  });

  describe('ValidationError', () => {
    const mockFailures: ValidationFailure[] = [
      {
        path: '/name',
        message: 'Required property missing',
        keyword: 'required',
        schemaPath: '/required',
      },
      {
        path: '/age',
        message: 'Must be integer',
        keyword: 'type',
        schemaPath: '/properties/age/type',
      },
    ];

    it('creates validation error with failures and default code', () => {
      const error = new ValidationError({
        message: 'Validation failed',
        failures: mockFailures,
      });

      expect(error.message).toBe('Validation failed');
      expect(error.errorCode).toBe(ErrorCode.COMPLIANCE_VALIDATION_FAILED);
      expect(error.failures).toEqual(mockFailures);
    });

    it('handles single failure and carries failureCount in context', () => {
      const singleFailure: ValidationFailure[] = [mockFailures[0]!];
      const error = new ValidationError({
        message: 'Single error',
        failures: singleFailure,
      });
      const json = error.toJSON('dev');
      expect((json.context as any).failureCount).toBe(1);
    });
  });

  describe('ConfigError', () => {
    it('creates config error with optional setting and default code', () => {
      const error = new ConfigError({
        message: 'Invalid setting',
        context: { setting: 'maxRows' },
      });

      expect(error.message).toBe('Invalid setting');
      expect(error.errorCode).toBe(ErrorCode.CONFIGURATION_ERROR);
      expect(error.context?.setting).toBe('maxRows');
    });
  });

  describe('ParseError', () => {
    it('creates parse error with input and position in context and default code', () => {
      const error = new ParseError({
        message: 'Unexpected token',
        context: { input: '{"invalid": }', position: 12 },
      });

      expect(error.message).toBe('Unexpected token');
      expect(error.errorCode).toBe(ErrorCode.PARSE_ERROR);
      expect(error.context?.input).toBe('{"invalid": }');
      expect(error.context?.position).toBe(12);
    });
  });

  describe('ValidationFailure utility', () => {
    it('should create validation failure with all properties', () => {
      const failure = createValidationFailure(
        '/user/email',
        'Invalid email format',
        'format',
        '/properties/user/properties/email/format',
        'invalid-email',
        { format: 'email' }
      );

      expect(failure.path).toBe('/user/email');
      expect(failure.message).toBe('Invalid email format');
      expect(failure.keyword).toBe('format');
      expect(failure.schemaPath).toBe(
        '/properties/user/properties/email/format'
      );
      expect(failure.value).toBe('invalid-email');
      expect(failure.params).toEqual({ format: 'email' });
    });

    it('should create validation failure with minimal properties', () => {
      const failure = createValidationFailure(
        '/name',
        'Required',
        'required',
        '/required'
      );

      expect(failure.path).toBe('/name');
      expect(failure.message).toBe('Required');
      expect(failure.keyword).toBe('required');
      expect(failure.schemaPath).toBe('/required');
      expect(failure.value).toBeUndefined();
      expect(failure.params).toBeUndefined();
    });
  });

  describe('isFoundryError utility', () => {
    it('should identify FoundryError instances', () => {
      const foundryError = new SchemaError('Test', '/path');
      const regularError = new Error('Regular error');
      const notError = 'not an error';

      expect(isFoundryError(foundryError)).toBe(true);
      expect(isFoundryError(regularError)).toBe(false);
      expect(isFoundryError(notError)).toBe(false);
      expect(isFoundryError(null)).toBe(false);
      expect(isFoundryError(undefined)).toBe(false);
    });
  });

  describe('ErrorReporter', () => {
    let reporter: ErrorReporter;

    beforeEach(() => {
      reporter = new ErrorReporter();
    });

    describe('formatError', () => {
      it('formats SchemaError with emoji and message (suggestions optional)', () => {
        const error = new SchemaError({
          message: 'Invalid type',
          context: { schemaPath: '#/properties/name' },
        });
        // Attach suggestions explicitly to simulate enrichment
        error.suggestions = ['Use string type'];
        const formatted = reporter.formatError(error);

        expect(formatted).toContain('📋');
        expect(formatted).toContain('Invalid type');
        expect(formatted).toContain('💡 Suggestions:');
        expect(formatted).toContain('• Use string type');
      });

      it('formats GenerationError with context displayed', () => {
        const error = new GenerationError({
          message: 'Cannot generate',
          context: { field: 'email', constraint: 'pattern', regex: '/test/' },
        });
        const formatted = reporter.formatError(error);

        expect(formatted).toContain('🔧');
        expect(formatted).toContain('Cannot generate');
        expect(formatted).toContain('Context:');
        expect(formatted).toContain('field: email');
        expect(formatted).toContain('constraint: pattern');
        expect(formatted).toContain('regex: /test/');
      });

      it('formats ValidationError with failure details', () => {
        const failures: ValidationFailure[] = [
          {
            path: '/name',
            message: 'Required',
            keyword: 'required',
            schemaPath: '/required',
          },
          {
            path: '/age',
            message: 'Must be number',
            keyword: 'type',
            schemaPath: '/properties/age/type',
          },
        ];
        const error = new ValidationError({
          message: 'Multiple failures',
          failures,
        });
        const formatted = reporter.formatError(error);

        expect(formatted).toContain('✅');
        expect(formatted).toContain('📋 Validation Failures:');
        expect(formatted).toContain('• /name: Required');
        expect(formatted).toContain('• /age: Must be number');
      });

      it('should limit validation failures display', () => {
        const failures: ValidationFailure[] = Array.from(
          { length: 7 },
          (_, i) => ({
            path: `/field${i}`,
            message: `Error ${i}`,
            keyword: 'test',
            schemaPath: `/properties/field${i}`,
          })
        );
        const error = new ValidationError('Many failures', failures);
        const formatted = reporter.formatError(error);

        expect(formatted).toContain('... and 2 more failure(s)');
      });
    });

    describe('formatErrors', () => {
      it('should handle empty error array', () => {
        const formatted = reporter.formatErrors([]);

        expect(formatted).toBe('✅ No errors found');
      });

      it('should format single error', () => {
        const error = new SchemaError('Test error', '/test');
        const formatted = reporter.formatErrors([error]);

        expect(formatted).toContain('📋');
        expect(formatted).not.toContain('Found 1 errors:');
      });

      it('should format multiple errors with numbering', () => {
        const errors = [
          new SchemaError('Schema error', '/schema'),
          new GenerationError('Generation error', undefined, 'field'),
        ];
        const formatted = reporter.formatErrors(errors);

        expect(formatted).toContain('❌ Found 2 errors:');
        expect(formatted).toContain('1. 📋');
        expect(formatted).toContain('2. 🔧');
      });
    });

    describe('createSummary', () => {
      it('should create error summary with counts and suggestions', () => {
        const e1 = new SchemaError('Schema error 1', '/path1');
        const e2 = new SchemaError('Schema error 2', '/path2');
        const e3 = new GenerationError('Generation error', undefined, 'field');
        const e4 = new ValidationError('Validation error', []);
        // Provide suggestions via enrichment to align with new contract
        e1.suggestions = ['Check schema syntax'];
        e3.suggestions = ['Relax constraint'];
        const errors = [e1, e2, e3, e4];

        const summary = reporter.createSummary(errors);

        expect(summary.total).toBe(4);
        expect(summary.byType['SchemaError']).toBe(2);
        expect(summary.byType['GenerationError']).toBe(1);
        expect(summary.byType['ValidationError']).toBe(1);

        expect(summary.mostCommon[0]).toEqual({
          type: 'SchemaError',
          count: 2,
        });
        expect(summary.suggestions.size).toBeGreaterThan(0);
      });

      it('should handle empty error array in summary', () => {
        const summary = reporter.createSummary([]);

        expect(summary.total).toBe(0);
        expect(Object.keys(summary.byType)).toHaveLength(0);
        expect(summary.mostCommon).toHaveLength(0);
        expect(summary.suggestions.size).toBe(0);
      });
    });

    describe('emoji selection', () => {
      it('should use appropriate emojis for each error type', () => {
        const errors = [
          new SchemaError('Schema', '/path'),
          new GenerationError('Generation'),
          new ValidationError('Validation', []),
          new ConfigError('Config'),
          new ParseError('Parse'),
        ];

        const emojis = errors.map((error) => {
          const formatted = reporter.formatError(error);
          return formatted.split(' ')[0];
        });

        expect(emojis[0]).toBe('📋'); // SchemaError
        expect(emojis[1]).toBe('🔧'); // GenerationError
        expect(emojis[2]).toBe('✅'); // ValidationError
        expect(emojis[3]).toBe('⚙️'); // ConfigError
        expect(emojis[4]).toBe('📝'); // ParseError
      });
    });
  });

  describe('Error inheritance and polymorphism', () => {
    it('should maintain instanceof relationships', () => {
      const schemaError = new SchemaError('Test', '/path');
      const generationError = new GenerationError('Test');
      const validationError = new ValidationError('Test', []);

      expect(schemaError instanceof FoundryError).toBe(true);
      expect(schemaError instanceof Error).toBe(true);
      expect(generationError instanceof FoundryError).toBe(true);
      expect(validationError instanceof FoundryError).toBe(true);
    });

    it('should work with polymorphic arrays', () => {
      const errors: FoundryError[] = [
        new SchemaError('Schema', '/path'),
        new GenerationError('Generation'),
        new ValidationError('Validation', []),
      ];

      errors.forEach((error) => {
        const maybeUserMsg = (error as any).getUserMessage?.() ?? error.message;
        const maybeSuggestions = (error as any).getSuggestions?.() ?? [];
        expect(typeof maybeUserMsg).toBe('string');
        expect(Array.isArray(maybeSuggestions)).toBe(true);
        expect(error.toJSON('dev')).toBeDefined();
      });
    });
  });
});
