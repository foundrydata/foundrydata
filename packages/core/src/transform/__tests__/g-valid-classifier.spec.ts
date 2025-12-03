import { describe, expect, it } from 'vitest';
import type { CoverageIndex } from '../composition-engine.js';
import { GValidMotif, classifyGValid } from '../g-valid-classifier.js';

describe('classifyGValid', () => {
  it('classifies a simple object with required as G_valid v1', () => {
    const schema = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['id'],
    };

    const index = classifyGValid(schema, undefined);
    const root = index.get('#');

    expect(root).toBeDefined();
    expect(root?.isGValid).toBe(true);
    expect(root?.motif).toBe(GValidMotif.SimpleObjectRequired);
  });

  it('marks AP:false objects present in CoverageIndex as non-G_valid', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'string' },
      },
      additionalProperties: false,
    };

    const coverageIndex: CoverageIndex = new Map([
      [
        '#',
        {
          has: () => false,
        },
      ],
    ]);

    const index = classifyGValid(schema, coverageIndex);
    const root = index.get('#');

    expect(root).toBeDefined();
    expect(root?.isGValid).toBe(false);
    expect(root?.motif).toBe(GValidMotif.ApFalseMustCover);
  });

  it('classifies a simple items+contains array as G_valid v1', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          isGift: { type: 'boolean' },
        },
        required: ['id', 'isGift'],
      },
      minItems: 1,
      contains: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          isGift: { const: true },
        },
        required: ['id', 'isGift'],
      },
    };

    const index = classifyGValid(schema, undefined);
    const root = index.get('#');

    expect(root).toBeDefined();
    expect(root?.isGValid).toBe(true);
    expect(root?.motif).toBe(GValidMotif.ArrayItemsContainsSimple);
  });

  it('excludes arrays with uniqueItems from baseline G_valid v1', () => {
    const schema = {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string' },
      contains: { const: 'x' },
    };

    const index = classifyGValid(schema, undefined);
    const root = index.get('#');

    expect(root).toBeDefined();
    expect(root?.isGValid).toBe(false);
    expect(root?.motif).toBe(GValidMotif.None);
  });

  it('propagates unevaluated* guards and keeps nested locations non-G_valid', () => {
    const schema = {
      allOf: [
        {
          unevaluatedProperties: false,
        },
        {
          type: 'object',
          properties: {
            child: {
              type: 'object',
              properties: {
                id: { type: 'string' },
              },
              required: ['id'],
            },
          },
        },
      ],
    };

    const index = classifyGValid(schema, undefined);
    const root = index.get('#');
    const child = index.get('#/allOf/1/properties/child');

    expect(root).toBeDefined();
    expect(root?.isGValid).toBe(false);
    expect(root?.motif).toBe(GValidMotif.None);

    expect(child).toBeDefined();
    expect(child?.isGValid).toBe(false);
    expect(child?.motif).toBe(GValidMotif.None);
  });
});
