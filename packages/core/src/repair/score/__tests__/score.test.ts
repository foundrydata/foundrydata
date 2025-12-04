import { describe, expect, it } from 'vitest';
import type { PtrMapping } from '../../../util/ptr-map.js';
import { createPtrMapping } from '../../../util/ptr-map.js';
import type { AjvErrorObject } from '../error-signature.js';
import { computeScore } from '../score.js';

function makeError(partial: Partial<AjvErrorObject>): AjvErrorObject {
  return {
    keyword: 'type',
    instancePath: '',
    schemaPath: '',
    params: {},
    ...partial,
  };
}

describe('computeScore', () => {
  it('returns 0 for empty or null error lists', () => {
    expect(computeScore([], undefined)).toBe(0);
    expect(computeScore(null as unknown as AjvErrorObject[])).toBe(0);
    expect(computeScore(undefined as unknown as AjvErrorObject[])).toBe(0);
  });

  it('counts distinct error signatures', () => {
    const errors: AjvErrorObject[] = [
      makeError({
        keyword: 'type',
        instancePath: '/foo',
        schemaPath: '#/properties/foo/type',
        params: { type: 'string' },
      }),
      makeError({
        keyword: 'minimum',
        instancePath: '/bar',
        schemaPath: '#/properties/bar/minimum',
        params: { limit: 0 },
      }),
    ];

    const score = computeScore(errors);
    expect(score).toBe(2);
  });

  it('deduplicates identical error signatures', () => {
    const base = makeError({
      keyword: 'type',
      instancePath: '/foo',
      schemaPath: '#/properties/foo/type',
      params: { type: 'string' },
    });
    const duplicate = { ...base };

    const score = computeScore([base, duplicate]);
    expect(score).toBe(1);
  });

  it('deduplicates errors that differ only by params key order', () => {
    const e1 = makeError({
      keyword: 'type',
      instancePath: '/foo',
      schemaPath: '#/properties/foo/type',
      params: { type: 'string', extra: 1 },
    });
    const e2 = makeError({
      keyword: 'type',
      instancePath: '/foo',
      schemaPath: '#/properties/foo/type',
      params: { extra: 1, type: 'string' },
    });

    const score = computeScore([e1, e2]);
    expect(score).toBe(1);
  });

  it('can use PtrMapping to influence canonPath(e) without affecting determinism', () => {
    const mapping: PtrMapping = createPtrMapping([
      ['/properties/foo/type', '/properties/foo/type'],
    ]);

    const e1 = makeError({
      keyword: 'type',
      instancePath: '/foo',
      schemaPath: '/properties/foo/type',
      params: { type: 'string' },
    });
    const e2 = makeError({
      keyword: 'type',
      instancePath: '/foo',
      schemaPath: '/properties/foo/type',
      params: { type: 'string' },
    });

    const scoreWithMapping = computeScore([e1, e2], mapping);
    const scoreWithoutMapping = computeScore([e1, e2], undefined);

    expect(scoreWithMapping).toBe(1);
    expect(scoreWithoutMapping).toBe(1);
  });
});
