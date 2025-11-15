import { describe, it, expect } from 'vitest';

import { DIAGNOSTIC_CODES } from '../../../diag/codes.js';
import { compose, type ComposeInput } from '../../composition-engine.js';
import {
  checkNumericBounds,
  determineNumericKind,
  isNumericLikeSchema,
} from '../../numbers/bounds.js';

function makeInput(schema: unknown): ComposeInput {
  return {
    schema,
    ptrMap: new Map(),
    revPtrMap: new Map(),
    notes: [],
  };
}

describe('numbers/bounds helpers', () => {
  it('detects empty real range when minimum exceeds maximum', () => {
    const result = checkNumericBounds({
      kind: 'number',
      minimum: 2,
      maximum: 1,
    });
    expect(result.contradictory).toBe(true);
    expect(result.reason).toBe('rangeEmpty');
  });

  it('detects empty real range when bounds meet but are exclusive', () => {
    const result = checkNumericBounds({
      kind: 'number',
      minimum: 1,
      exclusiveMaximum: 1,
    });
    expect(result.contradictory).toBe(true);
    expect(result.reason).toBe('rangeEmpty');
  });

  it('detects empty integer domain between bounds', () => {
    const result = checkNumericBounds({
      kind: 'integer',
      exclusiveMinimum: 0,
      exclusiveMaximum: 1,
    });
    expect(result.contradictory).toBe(true);
    expect(result.reason).toBe('integerDomainEmpty');
  });

  it('classifies numeric-like schemas and kinds', () => {
    const schema = {
      type: 'integer',
      minimum: 0,
      maximum: 10,
    };
    expect(isNumericLikeSchema(schema)).toBe(true);
    expect(determineNumericKind(schema)).toBe('integer');
  });
});

describe('CompositionEngine numeric bounds diagnostics', () => {
  it('emits UNSAT_NUMERIC_BOUNDS for empty real range', () => {
    const schema = {
      type: 'number',
      minimum: 2,
      maximum: 1,
    };
    const result = compose(makeInput(schema));
    const fatal = result.diag?.fatal?.find(
      (entry) =>
        entry.code === DIAGNOSTIC_CODES.UNSAT_NUMERIC_BOUNDS &&
        entry.canonPath === ''
    );
    expect(fatal).toBeDefined();
    expect(fatal?.details).toEqual({
      reason: 'rangeEmpty',
      type: 'number',
      minimum: 2,
      maximum: 1,
      exclusiveMinimum: null,
      exclusiveMaximum: null,
    });
  });

  it('emits UNSAT_NUMERIC_BOUNDS for empty integer domain', () => {
    const schema = {
      type: 'integer',
      exclusiveMinimum: 0,
      exclusiveMaximum: 1,
    };
    const result = compose(makeInput(schema));
    const fatal = result.diag?.fatal?.find(
      (entry) =>
        entry.code === DIAGNOSTIC_CODES.UNSAT_NUMERIC_BOUNDS &&
        entry.canonPath === ''
    );
    expect(fatal).toBeDefined();
    expect(fatal?.details).toEqual({
      reason: 'integerDomainEmpty',
      type: 'integer',
      minimum: null,
      maximum: null,
      exclusiveMinimum: 0,
      exclusiveMaximum: 1,
    });
  });
});
