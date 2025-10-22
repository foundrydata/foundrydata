import { describe, expect, it } from 'vitest';

import { composeEffective } from './test-helpers.js';
import { DIAGNOSTIC_CODES } from '../../src/diag/codes.js';
import { ENUM_CAP } from '../../src/constants.js';

describe('§8 Composition coverage index', () => {
  it('T-ENUM-PP-01 enumerates anchored-safe patternProperties literals', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      patternProperties: {
        '^(?:a|b)$': {},
      },
    };

    const { canonical } = composeEffective(schema);
    const entry = canonical.coverageIndex.get('');

    expect(entry).toBeDefined();
    expect(entry?.provenance).toEqual(['patternProperties']);
    expect(entry?.enumerate?.()).toEqual(['a', 'b']);
    expect(entry?.has('a')).toBe(true);
    expect(entry?.has('b')).toBe(true);
  });

  it('T-ENUM-PP-CAP-01 suppresses enumerate() and records COMPLEXITY_CAP_ENUM when literal count exceeds cap', () => {
    const literals = Array.from(
      { length: ENUM_CAP + 1 },
      (_, index) => `k${index}`
    );
    const properties: Record<string, unknown> = {};
    for (const key of literals) {
      properties[key] = { type: 'number' };
    }
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties,
    };

    const { canonical } = composeEffective(schema);
    const entry = canonical.coverageIndex.get('');

    expect(entry?.enumerate).toBeUndefined();
    const warn = canonical.diag?.warn ?? [];
    const capWarn = warn.find(
      (w) => w.code === DIAGNOSTIC_CODES.COMPLEXITY_CAP_ENUM
    );
    expect(capWarn).toBeDefined();
    expect(capWarn?.details).toMatchObject({
      limit: ENUM_CAP,
      observed: ENUM_CAP + 1,
    });
  });

  it('T-ENUM-PP-REGEX-01 treats quantified pattern literals as unsafe and omits enumeration', () => {
    const pattern = '^(?:a|b)+$';
    const schema = {
      type: 'object',
      additionalProperties: false,
      patternProperties: {
        [pattern]: {},
      },
    };

    const { canonical } = composeEffective(schema);
    const entry = canonical.coverageIndex.get('');
    expect(entry?.enumerate).toBeUndefined();
    const warn = canonical.diag?.warn ?? [];
    const regexWarn = warn.find(
      (w) => w.code === DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED
    );
    expect(regexWarn).toBeDefined();
    expect(regexWarn?.details).toMatchObject({
      patternSource: pattern,
      context: 'coverage',
    });
  });

  it('T-PTR-PNAMES-SYN-01 preserves propertyNames coverage proof for must-cover guard', () => {
    const schema = {
      type: 'object',
      propertyNames: {
        enum: ['alpha', 'beta'],
      },
    };

    const { canonical } = composeEffective(schema);
    const entry = canonical.coverageIndex.get('');

    expect(entry).toBeDefined();
    expect(entry?.provenance).toEqual(['propertyNamesSynthetic']);
    expect(entry?.has('alpha')).toBe(true);
    expect(entry?.has('beta')).toBe(true);
    expect(entry?.enumerate?.()).toEqual(['alpha', 'beta']);
  });
});
