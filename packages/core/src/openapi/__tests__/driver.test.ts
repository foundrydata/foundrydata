import { describe, it, expect } from 'vitest';
import { ParseError } from '../../types/errors.js';
import {
  selectResponseSchemaAndExample,
  type OpenApiDriverOptions,
} from '../driver.js';

function select(
  document: unknown,
  opts: OpenApiDriverOptions
): ReturnType<typeof selectResponseSchemaAndExample> {
  return selectResponseSchemaAndExample(document, opts);
}

describe('OpenAPI driver - selectResponseSchemaAndExample', () => {
  const baseDoc = {
    openapi: '3.1.0',
    paths: {
      '/users': {
        get: {
          operationId: 'getUsers',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { type: 'string' },
                    example: ['alice', 'bob'],
                  },
                },
              },
            },
          },
        },
      },
    },
  } as const;

  it('selects schema and schema.example when present', () => {
    const result = select(baseDoc, { operationId: 'getUsers' });
    expect(result.meta.path).toBe('/users');
    expect(result.meta.method).toBe('get');
    expect(result.meta.status).toBe('200');
    expect(result.meta.contentType).toBe('application/json');
    expect(result.schema).toEqual({
      type: 'array',
      items: { type: 'string' },
      example: ['alice', 'bob'],
    });
    expect(result.example).toEqual(['alice', 'bob']);
    expect(result.exampleSource).toBe('schema.example');
  });

  it('prefers content.example over schema-level examples', () => {
    const doc = {
      ...baseDoc,
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { type: 'string', example: 'from-schema' },
                    example: 'from-content',
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = select(doc, { operationId: 'getUsers' });
    expect(result.example).toBe('from-content');
    expect(result.exampleSource).toBe('content.example');
  });

  it('prefers content.examples.default.value when available', () => {
    const doc = {
      ...baseDoc,
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { type: 'string' },
                    examples: {
                      default: { value: 'default-example' },
                      alt: { value: 'alt-example' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = select(doc, { operationId: 'getUsers' });
    expect(result.example).toBe('default-example');
    expect(result.exampleSource).toBe('content.examples.default');
  });

  it('falls back to named content.examples.*.value when default is absent', () => {
    const doc = {
      ...baseDoc,
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { type: 'string' },
                    examples: {
                      alt: { value: 'alt-example' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = select(doc, { operationId: 'getUsers' });
    expect(result.example).toBe('alt-example');
    expect(result.exampleSource).toBe('content.examples.named');
  });

  it('supports selection via (path, method) when operationId is absent', () => {
    const doc = {
      openapi: '3.1.0',
      paths: {
        '/status': {
          get: {
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { type: 'string', example: 'ok' },
                  },
                },
              },
            },
          },
        },
      },
    } as const;

    const result = select(doc, { path: '/status', method: 'GET' });
    expect(result.meta.path).toBe('/status');
    expect(result.meta.method).toBe('get');
    expect(result.example).toBe('ok');
  });

  it('throws ParseError when operationId is not found', () => {
    expect(() => select(baseDoc, { operationId: 'missingOperation' })).toThrow(
      ParseError
    );
  });

  it('throws ParseError when selection is ambiguous without operationId', () => {
    const doc = {
      openapi: '3.1.0',
      paths: {
        '/a': {
          get: {
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        '/b': {
          get: {
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    };

    expect(() => select(doc, {})).toThrow(ParseError);
  });
});
