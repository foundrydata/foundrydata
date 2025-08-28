import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAjv,
  getAjv,
  getValidator,
  validateWithErrors,
  clearCache,
  type JsonSchemaDraft,
} from '../ajv-factory.js';
import type Ajv from 'ajv';

describe('AJV Factory', () => {
  beforeEach(() => {
    clearCache();
  });

  describe('createAjv', () => {
    it('should create AJV instance with correct configuration', () => {
      const ajv = createAjv('draft-07');

      expect(ajv).toBeDefined();
      expect(typeof ajv.compile).toBe('function');
      expect(typeof ajv.validate).toBe('function');
    });

    it('should cache AJV instances by draft', () => {
      const ajv1 = createAjv('draft-07');
      const ajv2 = createAjv('draft-07');
      const ajv3 = createAjv('2019-09');

      expect(ajv1).toBe(ajv2); // Same instance for same draft
      expect(ajv1).not.toBe(ajv3); // Different instance for different draft
    });

    it('should support all JSON Schema drafts', () => {
      const drafts: JsonSchemaDraft[] = ['draft-07', '2019-09', '2020-12'];

      drafts.forEach((draft) => {
        const ajv = createAjv(draft);
        expect(ajv).toBeDefined();
      });
    });
  });

  describe('getAjv', () => {
    it('should return the same instance as createAjv', () => {
      const ajv1 = createAjv('draft-07');
      const ajv2 = getAjv('draft-07');

      expect(ajv1).toBe(ajv2);
    });

    it('should default to draft-07', () => {
      const ajv1 = getAjv();
      const ajv2 = getAjv('draft-07');

      expect(ajv1).toBe(ajv2);
    });
  });

  describe('getValidator', () => {
    it('should return a validator function', () => {
      const schema = { type: 'string' };
      const validator = getValidator(schema);

      expect(typeof validator).toBe('function');
      expect(validator('test')).toBe(true);
      expect(validator(123)).toBe(false);
    });

    it('should cache validators by schema', () => {
      const schema = { type: 'string' };
      const validator1 = getValidator(schema);
      const validator2 = getValidator(schema);

      expect(validator1).toBe(validator2);
    });

    it('should work with different drafts', () => {
      const schema = { type: 'string', format: 'uuid' };

      const validator07 = getValidator(schema, 'draft-07');
      const validator2019 = getValidator(schema, '2019-09');

      expect(typeof validator07).toBe('function');
      expect(typeof validator2019).toBe('function');
    });

    it('should validate UUID format correctly', () => {
      const schema = { type: 'string', format: 'uuid' };
      const validator = getValidator(schema, 'draft-07');

      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const invalidUuid = 'not-a-uuid';

      expect(validator(validUuid)).toBe(true);
      expect(validator(invalidUuid)).toBe(false);
    });

    it('should validate email format correctly', () => {
      const schema = { type: 'string', format: 'email' };
      const validator = getValidator(schema, 'draft-07');

      const validEmail = 'test@example.com';
      const invalidEmail = 'not-an-email';

      expect(validator(validEmail)).toBe(true);
      expect(validator(invalidEmail)).toBe(false);
    });
  });

  describe('validateWithErrors', () => {
    it('should return validation result with errors', () => {
      const schema = { type: 'string', minLength: 5 };
      const validData = 'hello world';
      const invalidData = 'hi';

      const validResult = validateWithErrors(schema, validData);
      const invalidResult = validateWithErrors(schema, invalidData);

      expect(validResult.valid).toBe(true);
      expect(validResult.errors).toBeUndefined();

      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toBeDefined();
      expect(Array.isArray(invalidResult.errors)).toBe(true);
    });

    it('should work with different drafts', () => {
      const schema = {
        type: 'object',
        properties: { name: { type: 'string' } },
      };
      const data = { name: 'test' };

      const result07 = validateWithErrors(schema, data, 'draft-07');
      const result2019 = validateWithErrors(schema, data, '2019-09');

      expect(result07.valid).toBe(true);
      expect(result2019.valid).toBe(true);
    });
  });

  describe('clearCache', () => {
    it('should clear AJV instance cache', () => {
      const ajv1 = createAjv('draft-07');
      clearCache();
      const ajv2 = createAjv('draft-07');

      expect(ajv1).not.toBe(ajv2);
    });
  });

  describe('format validation across drafts', () => {
    const testCases = [
      { format: 'email', valid: 'test@example.com', invalid: 'not-email' },
      { format: 'date', valid: '2023-12-25', invalid: '2023-13-45' },
      {
        format: 'date-time',
        valid: '2023-12-25T10:30:00Z',
        invalid: '2023-13-45T25:70:00Z',
      },
      {
        format: 'uuid',
        valid: '550e8400-e29b-41d4-a716-446655440000',
        invalid: 'not-uuid',
      },
    ];

    testCases.forEach(({ format, valid, invalid }) => {
      it(`should validate ${format} format consistently across drafts`, () => {
        const schema = { type: 'string', format };
        const drafts: JsonSchemaDraft[] = ['draft-07', '2019-09', '2020-12'];

        drafts.forEach((draft) => {
          const validator = getValidator(schema, draft);
          expect(validator(valid)).toBe(true);
          expect(validator(invalid)).toBe(false);
        });
      });
    });
  });
});
