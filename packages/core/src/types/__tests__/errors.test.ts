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

describe('Error Hierarchy', () => {
  describe('FoundryError base class', () => {
    class TestError extends FoundryError {
      constructor(message: string, context?: Record<string, any>) {
        super(message, 'TEST_ERROR', context);
      }

      getUserMessage(): string {
        return `Test error: ${this.message}`;
      }

      getSuggestions(): string[] {
        return ['This is a test suggestion'];
      }
    }

    it('should create error with message and code', () => {
      const error = new TestError('Test message');

      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.name).toBe('TestError');
    });

    it('should include context in error', () => {
      const context = { field: 'test', value: 123 };
      const error = new TestError('Test message', context);

      expect(error.context).toEqual(context);
    });

    it('should serialize to JSON', () => {
      const error = new TestError('Test message', { field: 'test' });
      const json = error.toJSON();

      expect(json.name).toBe('TestError');
      expect(json.message).toBe('Test message');
      expect(json.code).toBe('TEST_ERROR');
      expect(json.context).toEqual({ field: 'test' });
      expect(json.stack).toBeDefined();
    });

    it('should maintain proper prototype chain', () => {
      const error = new TestError('Test message');

      expect(error).toBeInstanceOf(TestError);
      expect(error).toBeInstanceOf(FoundryError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('SchemaError', () => {
    it('should create schema error with path', () => {
      const error = new SchemaError(
        'Invalid schema',
        '/properties/name',
        'Use string type'
      );

      expect(error.message).toBe('Invalid schema');
      expect(error.code).toBe('SCHEMA_ERROR');
      expect(error.path).toBe('/properties/name');
      expect(error.suggestion).toBe('Use string type');
    });

    it('should provide user-friendly message', () => {
      const error = new SchemaError('Type mismatch', '/properties/age');
      const userMessage = error.getUserMessage();

      expect(userMessage).toBe(
        'Schema error at "/properties/age": Type mismatch'
      );
    });

    it('should provide relevant suggestions', () => {
      const error = new SchemaError(
        'Invalid format',
        '/properties/email',
        'Use email format'
      );
      const suggestions = error.getSuggestions();

      expect(suggestions).toContain('Use email format');
      expect(suggestions).toContain(
        'Check the JSON Schema specification for valid syntax'
      );
      expect(suggestions).toContain(
        'Validate your schema using a JSON Schema validator'
      );
    });

    it('should include context in serialization', () => {
      const error = new SchemaError(
        'Test error',
        '/test/path',
        'Test suggestion',
        { extra: 'data' }
      );
      const json = error.toJSON();

      expect(json.context.path).toBe('/test/path');
      expect(json.context.suggestion).toBe('Test suggestion');
      expect(json.context.extra).toBe('data');
    });
  });

  describe('GenerationError', () => {
    it('should create generation error with field and constraint', () => {
      const error = new GenerationError(
        'Cannot generate value',
        undefined, // suggestion
        'email', // field
        'pattern' // constraint
      );

      expect(error.message).toBe('Cannot generate value');
      expect(error.code).toBe('GENERATION_ERROR');
      expect(error.field).toBe('email');
      expect(error.constraint).toBe('pattern');
    });

    it('should provide detailed user message', () => {
      const error = new GenerationError(
        'Value too large',
        undefined,
        'age',
        'maximum'
      );
      const userMessage = error.getUserMessage();

      expect(userMessage).toBe(
        'Generation failed for field "age": Value too large (constraint: maximum)'
      );
    });

    it('should provide constraint-specific suggestions', () => {
      const minLengthError = new GenerationError(
        'Length conflict',
        undefined, // suggestion
        'name', // field
        'minLength' // constraint
      );
      const suggestions = minLengthError.getSuggestions();

      expect(suggestions).toContain(
        'Check that minLength <= maxLength for string constraints'
      );
    });

    it('should handle missing field and constraint', () => {
      const error = new GenerationError('General error');
      const userMessage = error.getUserMessage();

      expect(userMessage).toBe('Generation failed: General error');
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

    it('should create validation error with failures', () => {
      const error = new ValidationError('Validation failed', mockFailures);

      expect(error.message).toBe('Validation failed');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.failures).toEqual(mockFailures);
    });

    it('should provide user message with failure count', () => {
      const error = new ValidationError('Multiple errors', mockFailures);
      const userMessage = error.getUserMessage();

      expect(userMessage).toBe(
        'Validation failed with 2 failures: Multiple errors'
      );
    });

    it('should provide keyword-specific suggestions', () => {
      const error = new ValidationError('Validation failed', mockFailures);
      const suggestions = error.getSuggestions();

      expect(suggestions).toContain(
        'Ensure all required fields are present in the generated data'
      );
      expect(suggestions).toContain(
        'Check that generated values match the expected types'
      );
    });

    it('should handle single failure', () => {
      const singleFailure = [mockFailures[0]];
      const error = new ValidationError('Single error', singleFailure);
      const userMessage = error.getUserMessage();

      expect(userMessage).toBe(
        'Validation failed with 1 failure: Single error'
      );
    });
  });

  describe('ConfigError', () => {
    it('should create config error with setting', () => {
      const error = new ConfigError('Invalid setting', 'maxRows');

      expect(error.message).toBe('Invalid setting');
      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.setting).toBe('maxRows');
    });

    it('should provide user message with setting', () => {
      const error = new ConfigError('Value out of range', 'timeout');
      const userMessage = error.getUserMessage();

      expect(userMessage).toBe(
        'Configuration error (setting: timeout): Value out of range'
      );
    });

    it('should provide generic suggestions', () => {
      const error = new ConfigError('Invalid config');
      const suggestions = error.getSuggestions();

      expect(suggestions).toContain('Check your configuration file syntax');
      expect(suggestions).toContain(
        'Verify all required settings are provided'
      );
      expect(suggestions).toContain(
        'Consult the documentation for valid configuration options'
      );
    });
  });

  describe('ParseError', () => {
    it('should create parse error with input and position', () => {
      const error = new ParseError('Unexpected token', '{"invalid": }', 12);

      expect(error.message).toBe('Unexpected token');
      expect(error.code).toBe('PARSE_ERROR');
      expect(error.input).toBe('{"invalid": }');
      expect(error.position).toBe(12);
    });

    it('should provide user message with position', () => {
      const error = new ParseError('Missing comma', undefined, 25);
      const userMessage = error.getUserMessage();

      expect(userMessage).toBe('Parse error at position 25: Missing comma');
    });

    it('should provide parsing suggestions', () => {
      const error = new ParseError('Invalid JSON');
      const suggestions = error.getSuggestions();

      expect(suggestions).toContain('Validate your JSON syntax');
      expect(suggestions).toContain(
        'Check for missing commas, brackets, or quotes'
      );
      expect(suggestions).toContain(
        'Use a JSON formatter to identify syntax issues'
      );
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
      it('should format SchemaError with emoji and suggestions', () => {
        const error = new SchemaError(
          'Invalid type',
          '/properties/name',
          'Use string type'
        );
        const formatted = reporter.formatError(error);

        expect(formatted).toContain('📋');
        expect(formatted).toContain(
          'Schema error at "/properties/name": Invalid type'
        );
        expect(formatted).toContain('💡 Suggestions:');
        expect(formatted).toContain('• Use string type');
      });

      it('should format GenerationError with context', () => {
        const error = new GenerationError(
          'Cannot generate',
          undefined, // suggestion
          'email', // field
          'pattern', // constraint
          { regex: '/test/' }
        );
        const formatted = reporter.formatError(error);

        expect(formatted).toContain('🔧');
        expect(formatted).toContain(
          'Generation failed for field "email": Cannot generate (constraint: pattern)'
        );
        expect(formatted).toContain('Context:');
        expect(formatted).toContain('regex: /test/');
      });

      it('should format ValidationError with failure details', () => {
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
        const error = new ValidationError('Multiple failures', failures);
        const formatted = reporter.formatError(error);

        expect(formatted).toContain('✅');
        expect(formatted).toContain('Validation failed with 2 failures');
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
        const errors = [
          new SchemaError('Schema error 1', '/path1'),
          new SchemaError('Schema error 2', '/path2'),
          new GenerationError('Generation error', undefined, 'field'),
          new ValidationError('Validation error', []),
        ];

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
        expect(typeof error.getUserMessage()).toBe('string');
        expect(error.getSuggestions()).toBeInstanceOf(Array);
        expect(error.toJSON()).toBeDefined();
      });
    });
  });
});
