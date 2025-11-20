import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_CODES } from '../../diag/codes.js';
import { compose, type ComposeInput } from '../composition-engine.js';
import type { NormalizerNote } from '../schema-normalizer.js';

function makeInput(
  schema: unknown,
  notes: NormalizerNote[] = [],
  ptrEntries: Array<[string, string]> = []
): ComposeInput {
  const ptrMap = new Map<string, string>(ptrEntries);
  const revPtrMap = new Map<string, string[]>();
  for (const [canon, origin] of ptrEntries) {
    const existing = revPtrMap.get(origin);
    if (existing) {
      existing.push(canon);
      existing.sort();
    } else {
      revPtrMap.set(origin, [canon]);
    }
  }
  return {
    schema,
    ptrMap,
    revPtrMap,
    notes,
  };
}

describe('anchored-subset lifting integration', () => {
  it('derives a non-empty safe set from literal alternations under AP:false presence pressure', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      patternProperties: {
        'foo|bar': {},
      },
    } as const;

    const result = compose(makeInput(schema));
    const warnCodes = result.diag?.warn?.map((entry) => entry.code) ?? [];
    expect(warnCodes).not.toContain(
      DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX
    );

    const entry = result.coverageIndex.get('');
    expect(entry).toBeDefined();
    expect(entry?.has('foo')).toBe(true);
    expect(entry?.has('bar')).toBe(true);
    expect(entry?.enumerate?.()).toEqual(['bar', 'foo']);
  });

  it('prefers strict lifting for quantified character classes, keeping coverage safe', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: false,
      minProperties: 1,
      patternProperties: {
        '[a-z]{3}': {},
      },
    } as const;

    const result = compose(makeInput(schema));
    const warnCodes = result.diag?.warn?.map((entry) => entry.code) ?? [];
    expect(warnCodes).not.toContain(
      DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX
    );

    const entry = result.coverageIndex.get('');
    expect(entry).toBeDefined();
    expect(entry?.has('abc')).toBe(true);
    expect(entry?.has('zzz')).toBe(true);
  });
});
