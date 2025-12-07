import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';

import type { AjvErrorObject, ErrorSignature } from '../error-signature.js';
import { buildErrorSignature } from '../error-signature.js';
import { computeScore } from '../score.js';

function validateAndCollectErrors(): AjvErrorObject[] {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const schema = {
    type: 'object',
    required: ['name'],
    properties: {
      age: { type: 'integer', minimum: 1 },
      tags: { type: 'array', contains: { const: 'x' } },
    },
    additionalProperties: false,
  };
  const data = { age: 0, tags: [], extra: 'boom' };
  const validate = ajv.compile(schema);
  validate(data);
  return (validate.errors ?? []) as AjvErrorObject[];
}

function serializeSignature(sig: ErrorSignature): string {
  return JSON.stringify(sig);
}

describe('sig(e) + Score(x) golden fixtures', () => {
  it('computes canonical signatures for representative AJV errors', () => {
    const errors = validateAndCollectErrors();
    const serialized = errors
      .map((e) => buildErrorSignature(e))
      .map(serializeSignature)
      .sort();

    expect(serialized).toStrictEqual([
      '{"keyword":"additionalProperties","canonPath":"#/additionalProperties","instancePath":"","paramsKey":"{\\"additionalProperty\\":\\"extra\\"}"}',
      '{"keyword":"contains","canonPath":"#/properties/tags/contains","instancePath":"/tags","paramsKey":"{\\"minContains\\":1}"}',
      '{"keyword":"minimum","canonPath":"#/properties/age/minimum","instancePath":"/age","paramsKey":"{\\"comparison\\":\\">=\\",\\"limit\\":1}"}',
      '{"keyword":"required","canonPath":"#/required","instancePath":"","paramsKey":"{\\"missingProperty\\":\\"name\\"}"}',
    ]);
    expect(computeScore(errors)).toBe(4);
  });

  it('remains deterministic across runs and error ordering', () => {
    const firstErrors = validateAndCollectErrors();
    const secondErrors = validateAndCollectErrors();

    const forward = firstErrors
      .map((e) => serializeSignature(buildErrorSignature(e)))
      .sort();
    const reversed = [...secondErrors]
      .reverse()
      .map((e) => serializeSignature(buildErrorSignature(e)))
      .sort();

    expect(forward).toStrictEqual(reversed);
    expect(computeScore(firstErrors)).toBe(computeScore(secondErrors));
    expect(computeScore(firstErrors)).toBe(
      computeScore([...secondErrors].reverse())
    );
  });
});
