import { describe, expect, it } from 'vitest';
import type { PtrMapping } from '../../../util/ptr-map.js';
import { createPtrMapping } from '../../../util/ptr-map.js';
import type { AjvErrorObject } from '../error-signature.js';
import { buildErrorSignature, canonPathFromError } from '../error-signature.js';

function makeError(partial: Partial<AjvErrorObject>): AjvErrorObject {
  return {
    keyword: 'type',
    instancePath: '',
    schemaPath: '',
    params: {},
    ...partial,
  };
}

describe('canonPathFromError', () => {
  it('returns schemaPath when no mapping is provided', () => {
    const err = makeError({ schemaPath: '#/properties/foo/type' });
    const canon = canonPathFromError(err);
    expect(canon).toBe('#/properties/foo/type');
  });

  it('uses PtrMapping.revPtrMap when available', () => {
    const mapping: PtrMapping = createPtrMapping([
      ['/properties/foo/type', '#/properties/foo/type'],
    ]);
    const err = makeError({ schemaPath: '#/properties/foo/type' });

    const canon = canonPathFromError(err, mapping);
    expect(canon).toBe('/properties/foo/type');
  });

  it('falls back to schemaPath when no matching canonical path exists', () => {
    const mapping: PtrMapping = createPtrMapping([
      ['/properties/bar/type', '#/properties/bar/type'],
    ]);
    const err = makeError({ schemaPath: '#/properties/foo/type' });

    const canon = canonPathFromError(err, mapping);
    expect(canon).toBe('#/properties/foo/type');
  });
});

describe('buildErrorSignature', () => {
  it('builds signature components using canonPathFromError and stableParamsKey', () => {
    const mapping: PtrMapping = createPtrMapping([
      ['/properties/foo/type', '#/properties/foo/type'],
    ]);
    const err = makeError({
      keyword: 'type',
      instancePath: '/foo',
      schemaPath: '#/properties/foo/type',
      params: { type: 'string', extra: 1 },
    });

    const sig = buildErrorSignature(err, mapping);

    expect(sig.keyword).toBe('type');
    expect(sig.instancePath).toBe('/foo');
    expect(sig.canonPath).toBe('/properties/foo/type');

    const sigWithReorderedParams = buildErrorSignature(
      makeError({
        keyword: 'type',
        instancePath: '/foo',
        schemaPath: '#/properties/foo/type',
        params: { extra: 1, type: 'string' },
      }),
      mapping
    );

    expect(sig.paramsKey).toBe(sigWithReorderedParams.paramsKey);
  });
});
