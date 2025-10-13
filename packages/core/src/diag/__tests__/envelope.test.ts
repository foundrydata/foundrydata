import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_CODES } from '../codes';
import { assertDiagnosticEnvelope } from '../validate';

describe('assertDiagnosticEnvelope', () => {
  it('accepts a valid envelope with compliant details', () => {
    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED,
        canonPath: '/properties/name',
        details: {
          patternSource: '^foo$',
          context: 'coverage',
        },
      })
    ).not.toThrow();
  });

  it('rejects when details duplicate canonPath key anywhere in the payload', () => {
    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED,
        canonPath: '/properties/name',
        details: {
          nested: { canonPath: '/shadow' },
          patternSource: '^foo$',
          context: 'coverage',
        },
      })
    ).toThrow(/must not contain a canonPath property/);

    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.MUSTCOVER_INDEX_MISSING,
        canonPath: '/properties/title',
        details: [{ canonPtr: '/legacy' }],
      })
    ).toThrow(/must not contain a canonPtr property/);
  });

  it('rejects details that violate the mini-schema for a known code', () => {
    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.COMPLEXITY_CAP_ONEOF,
        canonPath: '/oneOf/0',
        // missing required observed field
        details: { limit: 10 },
      })
    ).toThrow(/do not match the expected shape/);
  });

  it('enforces EXTERNAL_REF_UNRESOLVED constraint when skipping validation', () => {
    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED,
        canonPath: '',
        details: {
          ref: 'file.json#/defs/x',
          skippedValidation: true,
          mode: 'strict',
        },
      })
    ).toThrow(/expected shape/);

    expect(() =>
      assertDiagnosticEnvelope({
        code: DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED,
        canonPath: '',
        details: {
          ref: 'file.json#/defs/x',
          skippedValidation: true,
          mode: 'lax',
        },
      })
    ).not.toThrow();
  });

  it('allows arbitrary details for unknown diagnostic codes while still enforcing the envelope', () => {
    expect(() =>
      assertDiagnosticEnvelope({
        code: 'CUSTOM_NOTE',
        canonPath: '/custom',
        details: { info: 'ok' },
      })
    ).not.toThrow();
  });
});
