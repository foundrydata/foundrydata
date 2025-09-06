import { describe, it, expect } from 'vitest';
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
