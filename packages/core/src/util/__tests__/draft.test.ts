import { describe, it, expect } from 'vitest';

import {
  detectDialect,
  detectDialectInfo,
  resolveDynamicRefBinding,
} from '../../util/draft';

describe('detectDialect', () => {
  it('honors explicit $schema draft declarations', () => {
    const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema' };
    expect(detectDialect(schema)).toBe('2020-12');
  });

  it('infers 2019-09 via recursive keywords when $schema missing', () => {
    const schema = { $recursiveRef: '#', type: 'object' };
    expect(detectDialect(schema)).toBe('2019-09');
  });

  it('identifies draft-04 via legacy id usage', () => {
    const schema = { id: 'http://example.com/schema', type: 'string' };
    expect(detectDialect(schema)).toBe('draft-04');
  });

  it('falls back to provided default when no signals are present', () => {
    const schema = { type: 'string' };
    expect(detectDialect(schema, 'draft-07')).toBe('draft-07');
  });

  it('exposes matching Ajv class label alongside dialect', () => {
    const info = detectDialectInfo({
      $schema: 'https://json-schema.org/draft/2019-09/schema',
    });
    expect(info).toEqual({
      dialect: '2019-09',
      ajvClass: 'Ajv2019',
    });
  });
});

describe('resolveDynamicRefBinding', () => {
  it('binds to nearest in-scope anchor within hop limit', () => {
    const schema = {
      $dynamicAnchor: 'root',
      properties: {
        container: {
          $dynamicAnchor: 'slot',
          properties: {
            ref: { $dynamicRef: '#slot' },
          },
        },
      },
    };

    const result = resolveDynamicRefBinding(
      schema,
      '#/properties/container/properties/ref',
      '#slot',
      { maxHops: 3 }
    );

    expect(result).toEqual({
      code: 'DYNAMIC_SCOPE_BOUNDED',
      name: 'slot',
      depth: 2,
      ref: '#/properties/container',
    });
  });

  it('respects hop bounds and leaves dynamic ref untouched when exceeded', () => {
    const schema = {
      properties: {
        container: {
          $dynamicAnchor: 'slot',
          properties: {
            nested: {
              properties: {
                ref: { $dynamicRef: '#slot' },
              },
            },
          },
        },
      },
    };

    const result = resolveDynamicRefBinding(
      schema,
      '#/properties/container/properties/nested/properties/ref',
      '#slot',
      { maxHops: 1 }
    );

    expect(result).toEqual({ code: 'DYNAMIC_PRESENT' });
  });

  it('refuses binding when ancestor path contains $ref boundary', () => {
    const schema = {
      properties: {
        container: {
          $dynamicAnchor: 'slot',
          $ref: '#/$defs/container',
          properties: {
            ref: { $dynamicRef: '#slot' },
          },
        },
      },
      $defs: {
        container: { type: 'object' },
      },
    };

    const result = resolveDynamicRefBinding(
      schema,
      '#/properties/container/properties/ref',
      '#slot'
    );

    expect(result).toEqual({ code: 'DYNAMIC_PRESENT' });
  });

  it('refuses binding when another anchor with same name exists above', () => {
    const schema = {
      $dynamicAnchor: 'slot',
      properties: {
        container: {
          $dynamicAnchor: 'slot',
          properties: {
            ref: { $dynamicRef: '#slot' },
          },
        },
      },
    };

    const result = resolveDynamicRefBinding(
      schema,
      '#/properties/container/properties/ref',
      '#slot'
    );

    expect(result).toEqual({ code: 'DYNAMIC_PRESENT' });
  });
});
