import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_CODES } from '../../src/diag/codes.js';
import { runPipelineStages } from './test-helpers.js';

const codePointLen = (value: string): number => Array.from(value).length;

describe('Foundry generator compliance', () => {
  it('respects Unicode code point bounds for strings', () => {
    const schema = {
      type: 'string',
      minLength: 1,
      maxLength: 1,
    };
    const { generate } = runPipelineStages(schema, {
      planOptions: { patternWitness: { alphabet: '😀' } },
    });
    const value = generate.items[0];
    expect(typeof value).toBe('string');
    expect(value).toBe('😀');
    expect(codePointLen(value as string)).toBe(1);
  });

  it('honors oneOf evaluation under unevaluatedProperties guard', () => {
    const schema = {
      type: 'object',
      properties: {
        kind: { const: 'primary' },
      },
      required: ['kind'],
      unevaluatedProperties: false,
      additionalProperties: false,
      allOf: [
        {
          oneOf: [
            {
              properties: {
                payload: { type: 'string', minLength: 1 },
              },
              required: ['payload'],
            },
            {
              properties: {
                fallback: { type: 'string' },
              },
              required: ['fallback'],
            },
          ],
        },
      ],
    };
    const { generate } = runPipelineStages(schema);
    const result = generate.items[0];
    expect(result).toBeTypeOf('object');
    expect(result).toHaveProperty('kind');
    const hasPayload = Object.prototype.hasOwnProperty.call(result, 'payload');
    const hasFallback = Object.prototype.hasOwnProperty.call(
      result,
      'fallback'
    );
    expect(hasPayload || hasFallback).toBe(true);
    const key = hasPayload ? 'payload' : 'fallback';
    expect(typeof (result as Record<string, unknown>)[key]).toBe('string');
  });

  it('applies if-aware-lite hints and emits diagnostics', () => {
    const schema = {
      type: 'object',
      properties: {
        kind: { enum: ['alpha', 'beta'] },
        payload: { type: 'object' },
      },
      required: ['kind'],
      if: {
        properties: { kind: { const: 'alpha' } },
      },
      then: {
        required: ['payload'],
        properties: {
          payload: {
            type: 'object',
            minProperties: 0,
          },
        },
      },
      else: {
        properties: {},
      },
    };
    const { generate } = runPipelineStages(schema);
    const item = generate.items[0] as Record<string, unknown>;
    expect(item.kind).toBe('alpha');
    expect(item).toHaveProperty('payload');
    const diagCodes = new Set(generate.diagnostics.map((d) => d.code));
    expect(diagCodes.has(DIAGNOSTIC_CODES.IF_AWARE_HINT_APPLIED)).toBe(true);
  });

  it('respects items:false cap for arrays', () => {
    const schema = {
      type: 'array',
      prefixItems: [{ const: 'a' }, { const: 'b' }],
      items: false,
      minItems: 1,
    };
    const { generate } = runPipelineStages(schema);
    const arr = generate.items[0] as unknown[];
    expect(arr).toEqual(['a', 'b']);
  });

  it('produces deterministic unique fillers without sentinels', () => {
    const schema = {
      type: 'array',
      minItems: 2,
      items: { type: 'string', minLength: 1 },
      uniqueItems: true,
    };
    const { generate } = runPipelineStages(schema, {
      planOptions: { patternWitness: { alphabet: 'ab' } },
    });
    const arr = generate.items[0] as string[];
    expect(arr.length).toBe(2);
    expect(new Set(arr).size).toBe(2);
    expect(arr.every((value) => typeof value === 'string')).toBe(true);
    expect(arr).toEqual(['a', 'b']);
  });

  it('emits COMPLEXITY_CAP_PATTERNS when generator-local analysis flags regex complexity', () => {
    const schema = {
      type: 'object',
      minProperties: 1,
      patternProperties: {
        '^(ab)+$': { type: 'number' },
      },
    };
    const { generate } = runPipelineStages(schema);
    const diag = generate.diagnostics.find(
      (entry) => entry.code === DIAGNOSTIC_CODES.COMPLEXITY_CAP_PATTERNS
    );
    expect(diag).toBeDefined();
    expect(diag?.details).toMatchObject({ reason: 'regexComplexity' });
    expect(diag?.budget).toMatchObject({ reason: 'complexityCap' });
    expect(generate.metrics.patternWitnessTried).toBeUndefined();
  });

  it('draws optional keys from propertyNames enum when additionalProperties are allowed', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
      },
      required: ['a'],
      minProperties: 2,
      additionalProperties: true,
      propertyNames: { enum: ['a', 'b'] },
    };
    const { generate } = runPipelineStages(schema);
    const result = generate.items[0] as Record<string, unknown>;
    expect(result).toHaveProperty('a');
    expect(result).toHaveProperty('b');
    expect(Object.keys(result)).toEqual(['a', 'b']);
  });

  it('does not expand propertyNames enum under additionalProperties:false without rewrite evidence', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'number' },
      },
      required: ['a'],
      minProperties: 2,
      additionalProperties: false,
      propertyNames: { enum: ['a', 'b'] },
    };
    const { generate } = runPipelineStages(schema);
    const result = generate.items[0] as Record<string, unknown>;
    expect(result).toEqual({ a: 0 });
    expect(result).not.toHaveProperty('b');
  });

  it('emits properties sourced through in-document $ref under unevaluatedProperties guard', () => {
    const schema = {
      $defs: {
        payload: {
          type: 'object',
          properties: {
            payload: { type: 'string', minLength: 1 },
          },
          required: ['payload'],
        },
      },
      type: 'object',
      properties: {
        kind: { const: 'relay' },
      },
      required: ['kind'],
      allOf: [{ $ref: '#/$defs/payload' }],
      additionalProperties: false,
      unevaluatedProperties: false,
    };

    const { generate } = runPipelineStages(schema, {
      planOptions: { metrics: true },
    });
    const result = generate.items[0] as Record<string, unknown>;
    expect(result).toMatchObject({ kind: 'relay' });
    expect(result).toHaveProperty('payload');
    expect(typeof result.payload).toBe('string');
    expect((result.payload as string).length).toBeGreaterThanOrEqual(1);
    const evalTrace = generate.diagnostics.filter(
      (entry) => entry.code === DIAGNOSTIC_CODES.EVALTRACE_PROP_SOURCE
    );
    expect(
      evalTrace.some(
        (entry) =>
          entry.details &&
          (entry.details as { name?: string; via?: string[] }).name ===
            'payload' &&
          Array.isArray((entry.details as { via?: string[] }).via) &&
          (entry.details as { via?: string[] }).via?.includes('allOf')
      )
    ).toBe(true);
  });

  it('selects earliest ranked type when generating union fillers', () => {
    const schema = {
      type: 'array',
      minItems: 1,
      items: { type: ['string', 'integer'] },
    };

    const { generate } = runPipelineStages(schema);
    const arr = generate.items[0] as unknown[];
    expect(arr.length).toBe(1);
    expect(typeof arr[0]).toBe('number');
    expect(arr[0]).toBe(0);
  });
});
