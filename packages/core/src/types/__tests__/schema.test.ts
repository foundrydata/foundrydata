/**
 * Tests for Schema types and type guards
 * Comprehensive coverage of schema interfaces and validation
 */

import {
  Schema,
  ObjectSchema,
  ArraySchema,
  StringSchema,
  NumberSchema,
  BooleanSchema,
  NullSchema,
  StringFormat,
  isObjectSchema,
  isArraySchema,
  isStringSchema,
  isNumberSchema,
  isBooleanSchema,
  isNullSchema,
  isUUID,
  isEmail,
  isISO8601DateTime,
  isISO8601Date,
  isIPv4,
  isIPv6,
  getSchemaType,
} from '../schema';

describe('Schema Types', () => {
  describe('Schema interfaces', () => {
    it('should create ObjectSchema with required properties', () => {
      const schema: ObjectSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['id'],
      };

      expect(schema.type).toBe('object');
      expect(schema.properties.id.type).toBe('string');
      expect(schema.required).toEqual(['id']);
    });

    it('should create ArraySchema with items', () => {
      const schema: ArraySchema = {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 10,
        uniqueItems: true,
      };

      expect(schema.type).toBe('array');
      expect(schema.items).toEqual({ type: 'string' });
      expect(schema.minItems).toBe(1);
      expect(schema.maxItems).toBe(10);
      expect(schema.uniqueItems).toBe(true);
    });

    it('should create StringSchema with format', () => {
      const schema: StringSchema = {
        type: 'string',
        format: 'email',
        minLength: 5,
        maxLength: 100,
        pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
      };

      expect(schema.type).toBe('string');
      expect(schema.format).toBe('email');
      expect(schema.minLength).toBe(5);
      expect(schema.maxLength).toBe(100);
      expect(schema.pattern).toBeDefined();
    });

    it('should create NumberSchema with constraints', () => {
      const integerSchema: NumberSchema = {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        multipleOf: 5,
      };

      const numberSchema: NumberSchema = {
        type: 'number',
        exclusiveMinimum: 0,
        exclusiveMaximum: 1,
      };

      expect(integerSchema.type).toBe('integer');
      expect(integerSchema.minimum).toBe(0);
      expect(integerSchema.maximum).toBe(100);

      expect(numberSchema.type).toBe('number');
      expect(numberSchema.exclusiveMinimum).toBe(0);
      expect(numberSchema.exclusiveMaximum).toBe(1);
    });

    it('should create BooleanSchema', () => {
      const schema: BooleanSchema = {
        type: 'boolean',
        description: 'A boolean value',
      };

      expect(schema.type).toBe('boolean');
      expect(schema.description).toBe('A boolean value');
    });

    it('should create NullSchema', () => {
      const schema: NullSchema = {
        type: 'null',
        description: 'A null value',
      };

      expect(schema.type).toBe('null');
      expect(schema.description).toBe('A null value');
    });
  });

  describe('String formats', () => {
    it('should support all defined string formats', () => {
      const formats: StringFormat[] = [
        'uuid',
        'email',
        'date',
        'date-time',
        'time',
        'duration',
        'uri',
        'uri-reference',
        'url',
        'hostname',
        'ipv4',
        'ipv6',
        'regex',
        'json-pointer',
        'relative-json-pointer',
        'password',
        'binary',
        'byte',
        'int32',
        'int64',
        'float',
        'double',
      ];

      formats.forEach((format) => {
        const schema: StringSchema = {
          type: 'string',
          format,
        };

        expect(schema.format).toBe(format);
      });
    });
  });

  describe('Schema type guards', () => {
    const objectSchema: Schema = {
      type: 'object',
      properties: { id: { type: 'string' } },
    };

    const arraySchema: Schema = {
      type: 'array',
      items: { type: 'number' },
    };

    const stringSchema: Schema = {
      type: 'string',
      format: 'email',
    };

    const numberSchema: Schema = {
      type: 'number',
      minimum: 0,
    };

    const integerSchema: Schema = {
      type: 'integer',
      minimum: 0,
    };

    const booleanSchema: Schema = {
      type: 'boolean',
    };

    const nullSchema: Schema = {
      type: 'null',
    };

    const booleanTrueSchema: Schema = true;
    const booleanFalseSchema: Schema = false;

    describe('isObjectSchema', () => {
      it('should identify object schemas', () => {
        expect(isObjectSchema(objectSchema)).toBe(true);
        expect(isObjectSchema(arraySchema)).toBe(false);
        expect(isObjectSchema(stringSchema)).toBe(false);
        expect(isObjectSchema(booleanTrueSchema)).toBe(false);
      });
    });

    describe('isArraySchema', () => {
      it('should identify array schemas', () => {
        expect(isArraySchema(arraySchema)).toBe(true);
        expect(isArraySchema(objectSchema)).toBe(false);
        expect(isArraySchema(stringSchema)).toBe(false);
        expect(isArraySchema(booleanTrueSchema)).toBe(false);
      });
    });

    describe('isStringSchema', () => {
      it('should identify string schemas', () => {
        expect(isStringSchema(stringSchema)).toBe(true);
        expect(isStringSchema(objectSchema)).toBe(false);
        expect(isStringSchema(numberSchema)).toBe(false);
        expect(isStringSchema(booleanTrueSchema)).toBe(false);
      });
    });

    describe('isNumberSchema', () => {
      it('should identify number and integer schemas', () => {
        expect(isNumberSchema(numberSchema)).toBe(true);
        expect(isNumberSchema(integerSchema)).toBe(true);
        expect(isNumberSchema(stringSchema)).toBe(false);
        expect(isNumberSchema(booleanTrueSchema)).toBe(false);
      });
    });

    describe('isBooleanSchema', () => {
      it('should identify boolean schemas', () => {
        expect(isBooleanSchema(booleanSchema)).toBe(true);
        expect(isBooleanSchema(stringSchema)).toBe(false);
        expect(isBooleanSchema(booleanTrueSchema)).toBe(false);
      });
    });

    describe('isNullSchema', () => {
      it('should identify null schemas', () => {
        expect(isNullSchema(nullSchema)).toBe(true);
        expect(isNullSchema(booleanSchema)).toBe(false);
        expect(isNullSchema(booleanTrueSchema)).toBe(false);
      });
    });
  });

  describe('Branded type guards', () => {
    describe('isUUID', () => {
      it('should validate UUIDs correctly', () => {
        const validUUIDs = [
          '550e8400-e29b-41d4-a716-446655440000',
          '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
          '12345678-1234-4234-8234-123456789abc',
        ];

        const invalidUUIDs = [
          'not-a-uuid',
          '550e8400-e29b-41d4-a716-44665544000', // too short
          '550e8400-e29b-41d4-a716-446655440000-extra', // too long
          '550e8400-e29b-41d4-a716-44665544000g', // invalid character
        ];

        validUUIDs.forEach((uuid) => {
          expect(isUUID(uuid)).toBe(true);
        });

        invalidUUIDs.forEach((uuid) => {
          expect(isUUID(uuid)).toBe(false);
        });
      });
    });

    describe('isEmail', () => {
      it('should validate emails correctly', () => {
        const validEmails = [
          'test@example.com',
          'user.name@domain.co.uk',
          'user+tag@example.org',
        ];

        const invalidEmails = [
          'not-an-email',
          '@domain.com',
          'user@',
          'user@domain',
          'user space@domain.com',
        ];

        validEmails.forEach((email) => {
          expect(isEmail(email)).toBe(true);
        });

        invalidEmails.forEach((email) => {
          expect(isEmail(email)).toBe(false);
        });
      });
    });

    describe('isISO8601DateTime', () => {
      it('should validate ISO8601 datetimes correctly', () => {
        const validDateTimes = [
          '2023-12-01T10:30:45Z',
          '2023-12-01T10:30:45.123Z',
          '2023-12-01T10:30:45',
        ];

        const invalidDateTimes = [
          'not-a-datetime',
          '2023-12-01',
          '10:30:45',
          '2023/12/01T10:30:45Z',
        ];

        validDateTimes.forEach((dateTime) => {
          expect(isISO8601DateTime(dateTime)).toBe(true);
        });

        invalidDateTimes.forEach((dateTime) => {
          expect(isISO8601DateTime(dateTime)).toBe(false);
        });
      });
    });

    describe('isISO8601Date', () => {
      it('should validate ISO8601 dates correctly', () => {
        const validDates = ['2023-12-01', '2000-01-01', '9999-12-31'];

        const invalidDates = [
          'not-a-date',
          '2023/12/01',
          '01-12-2023',
          '2023-12-01T10:30:45Z',
        ];

        validDates.forEach((date) => {
          expect(isISO8601Date(date)).toBe(true);
        });

        invalidDates.forEach((date) => {
          expect(isISO8601Date(date)).toBe(false);
        });
      });
    });

    describe('isIPv4', () => {
      it('should validate IPv4 addresses correctly', () => {
        const validIPs = [
          '192.168.1.1',
          '10.0.0.1',
          '127.0.0.1',
          '255.255.255.255',
          '0.0.0.0',
        ];

        const invalidIPs = [
          'not-an-ip',
          '256.1.1.1',
          '192.168.1',
          '192.168.1.1.1',
        ];

        validIPs.forEach((ip) => {
          expect(isIPv4(ip)).toBe(true);
        });

        invalidIPs.forEach((ip) => {
          expect(isIPv4(ip)).toBe(false);
        });
      });
    });

    describe('isIPv6', () => {
      it('should validate IPv6 addresses correctly', () => {
        const validIPs = [
          '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
          '::1',
          '::',
        ];

        const invalidIPs = [
          'not-an-ip',
          '192.168.1.1',
          '2001:0db8:85a3::8a2e:0370:7334:extra',
        ];

        validIPs.forEach((ip) => {
          expect(isIPv6(ip)).toBe(true);
        });

        invalidIPs.forEach((ip) => {
          expect(isIPv6(ip)).toBe(false);
        });
      });
    });
  });

  describe('Utility functions', () => {
    describe('getSchemaType', () => {
      it('should return type for object schemas', () => {
        const schema: ObjectSchema = {
          type: 'object',
          properties: {},
        };

        expect(getSchemaType(schema)).toBe('object');
      });

      it('should return type for primitive schemas', () => {
        expect(getSchemaType({ type: 'string' })).toBe('string');
        expect(getSchemaType({ type: 'number' })).toBe('number');
        expect(getSchemaType({ type: 'boolean' })).toBe('boolean');
        expect(getSchemaType({ type: 'null' })).toBe('null');
      });

      it('should handle boolean schemas', () => {
        expect(getSchemaType(true)).toBe('any');
        expect(getSchemaType(false)).toBe('never');
      });
    });
  });

  describe('Complex schema structures', () => {
    it('should support nested object schemas', () => {
      const schema: ObjectSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              profile: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                },
                required: ['name'],
              },
            },
            required: ['id', 'profile'],
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
          },
        },
        required: ['user'],
      };

      expect(isObjectSchema(schema)).toBe(true);
      expect(isObjectSchema(schema.properties.user)).toBe(true);
      expect(isObjectSchema(schema.properties.user.properties?.profile)).toBe(
        true
      );
      expect(isArraySchema(schema.properties.tags)).toBe(true);
    });

    it('should support JSON Schema meta-properties', () => {
      const schema: ObjectSchema = {
        $id: 'https://example.com/schema',
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        title: 'User Schema',
        description: 'Schema for user objects',
        properties: {
          id: {
            type: 'string',
            $comment: 'Unique identifier',
            examples: ['user-123', 'user-456'],
          },
        },
      };

      expect(schema.$id).toBe('https://example.com/schema');
      expect(schema.$schema).toBe(
        'https://json-schema.org/draft/2020-12/schema'
      );
      expect(schema.title).toBe('User Schema');
      expect(schema.description).toBe('Schema for user objects');
    });

    it('should support conditional schemas', () => {
      const schema: ObjectSchema = {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['personal', 'business'] },
          name: { type: 'string' },
        },
        if: {
          properties: { type: { const: 'business' } },
        },
        then: {
          properties: {
            businessName: { type: 'string' },
            taxId: { type: 'string' },
          },
          required: ['businessName'],
        },
        else: {
          properties: {
            firstName: { type: 'string' },
            lastName: { type: 'string' },
          },
          required: ['firstName', 'lastName'],
        },
      };

      expect(schema.if).toBeDefined();
      expect(schema.then).toBeDefined();
      expect(schema.else).toBeDefined();
    });

    it('should support composition schemas', () => {
      const baseUserSchema: ObjectSchema = {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
      };

      const extendedUserSchema: ObjectSchema = {
        type: 'object',
        allOf: [
          baseUserSchema,
          {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email' },
              age: { type: 'integer', minimum: 0 },
            },
          },
        ],
      };

      expect(extendedUserSchema.allOf).toHaveLength(2);
      expect(extendedUserSchema.allOf?.[0]).toBe(baseUserSchema);
    });
  });
});
