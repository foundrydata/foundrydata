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

    const index = classifyGValid(schema);
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
          provenance: [{} as any],
        },
      ],
    ]);

    const index = classifyGValid(schema, { coverageIndex });
    const root = index.get('#');

    expect(root).toBeDefined();
    expect(root?.isGValid).toBe(false);
    expect(root?.motif).toBe(GValidMotif.ApFalseMustCover);
  });

  it('treats AP:false objects with patternProperties as non-G_valid via CoverageIndex', () => {
    const schema = {
      type: 'object',
      patternProperties: {
        '^x_': { type: 'string' },
      },
      additionalProperties: false,
    };

    const coverageIndex: CoverageIndex = new Map([
      [
        '#',
        {
          has: () => true,
          provenance: [{} as any],
        },
      ],
    ]);

    const index = classifyGValid(schema, { coverageIndex });
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

    const containsBag = new Map([['#', [{ schema: schema.contains, min: 1 }]]]);
    const index = classifyGValid(schema, { containsBag });
    const root = index.get('#');

    expect(root).toBeDefined();
    expect(root?.isGValid).toBe(true);
    expect(root?.motif).toBe(GValidMotif.ArrayContainsSimple);
  });

  it('excludes arrays with uniqueItems from baseline G_valid v1', () => {
    const schema = {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string' },
      contains: { const: 'x' },
    };

    const containsBag = new Map([['#', [{ schema: schema.contains, min: 1 }]]]);
    const index = classifyGValid(schema, { containsBag });
    const root = index.get('#');

    expect(root).toBeDefined();
    expect(root?.isGValid).toBe(false);
    expect(root?.motif).toBe(GValidMotif.None);
  });

  it('excludes arrays with contains bags spread across allOf from baseline G_valid v1', () => {
    const schema = {
      type: 'array',
      items: { type: 'integer' },
      allOf: [{ contains: { const: 1 } }, { contains: { const: 2 } }],
    };

    const containsBag = new Map([
      [
        '#',
        [
          { schema: { const: 1 }, min: 1 },
          { schema: { const: 2 }, min: 1 },
        ],
      ],
    ]);

    const index = classifyGValid(schema, { containsBag });
    const root = index.get('#');

    expect(root).toBeDefined();
    expect(root?.isGValid).toBe(false);
    expect(root?.motif).toBe(GValidMotif.ComplexContains);
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

    const index = classifyGValid(schema);
    const root = index.get('#');
    const child = index.get('#/allOf/1/properties/child');

    expect(root).toBeDefined();
    expect(root?.isGValid).toBe(false);
    expect(root?.motif).toBe(GValidMotif.None);

    expect(child).toBeDefined();
    expect(child?.isGValid).toBe(false);
    expect(child?.motif).toBe(GValidMotif.None);
  });

  it('excludes arrays with unevaluatedItems guards from baseline G_valid v1', () => {
    const schema = {
      type: 'array',
      items: { type: 'string' },
      contains: { const: 'x' },
      unevaluatedItems: false,
    };

    const containsBag = new Map([['#', [{ schema: schema.contains, min: 1 }]]]);
    const index = classifyGValid(schema, { containsBag });
    const root = index.get('#');

    expect(root).toBeDefined();
    expect(root?.isGValid).toBe(false);
    expect(root?.motif).toBe(GValidMotif.None);
  });

  it('is deterministic for fixed canonical schemas and insensitive to simple allOf ordering at root', () => {
    const baseObject = {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    } as const;

    const schemaA = {
      allOf: [{}, baseObject],
    };

    const schemaB = {
      allOf: [baseObject, {}],
    };

    const indexA = classifyGValid(schemaA);
    const indexB = classifyGValid(schemaB);

    const rootA = indexA.get('#');
    const rootB = indexB.get('#');

    expect(rootA).toBeDefined();
    expect(rootB).toBeDefined();
    expect(rootA?.motif).toBe(rootB?.motif);
    expect(rootA?.isGValid).toBe(rootB?.isGValid);
  });

  it('excludes arrays with multi-need contains bags from G_valid', () => {
    const schema = {
      type: 'array',
      items: { type: 'integer' },
      contains: { const: 1 },
      allOf: [{ contains: { const: 2 } }],
    };

    const index = classifyGValid(schema, {
      containsBag: new Map([
        [
          '#',
          [
            { schema: { const: 1 }, min: 1 },
            { schema: { const: 2 }, min: 1 },
          ],
        ],
      ]),
    });

    const root = index.get('#');
    expect(root).toBeDefined();
    expect(root?.isGValid).toBe(false);
    expect(root?.motif).toBe(GValidMotif.ComplexContains);
  });

  it('classifies simple objects assembled via allOf when no guards are present', () => {
    const schema = {
      allOf: [
        {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
          },
          required: ['id'],
        },
      ],
    };

    const index = classifyGValid(schema);
    const root = index.get('#');

    expect(root).toBeDefined();
    expect(root?.isGValid).toBe(true);
    expect(root?.motif).toBe(GValidMotif.SimpleObjectRequired);
  });
});
