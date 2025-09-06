import { describe, it, expect } from 'vitest';
import {
  didYouMean,
  calculateDistance,
  getAlternative,
  proposeSchemaFix,
  getWorkaround,
} from '../../errors/suggestions';
import { SchemaError } from '../../types/errors';

describe('Suggestion Helpers', () => {
  it('didYouMean finds close matches with simple distance', () => {
    const out = didYouMean('stirng', ['string', 'number', 'boolean']);
    expect(out).toEqual(['string']);
  });

  it('calculateDistance behaves reasonably for basics', () => {
    expect(calculateDistance('abc', 'abc')).toBe(0);
    expect(calculateDistance('abc', 'ab')).toBe(1);
    expect(calculateDistance('', 'abcd')).toBe(4);
  });

  it('getAlternative returns workaround/example/doc for known limitation', () => {
    const alt = getAlternative('regexPatterns');
    expect(alt).not.toBeNull();
    expect(alt?.workaround).toContain('enum');
    expect(alt?.example).toBeTruthy();
    expect(alt?.documentation).toContain('#keywords-not-supported');
  });

  it('getWorkaround returns null for unknown limitation', () => {
    const res = getWorkaround('zzz-unknown');
    expect(res).toBeNull();
  });

  it('getWorkaround returns description and availableIn for known limitation', () => {
    const res = getWorkaround('nestedObjects');
    expect(res).not.toBeNull();
    expect(res?.description).toContain('Flatten nested objects');
    expect(res?.availableIn).toBe('0.3.0');
  });

  it('proposeSchemaFix uses limitationKey in error context', () => {
    const err = new SchemaError({
      message: 'Nested objects not supported',
      context: {
        schemaPath: '#/properties/address',
        path: '/properties/address',
        limitationKey: 'nestedObjects',
      },
    });

    const fix = proposeSchemaFix(err)!;
    expect(fix).toBeTruthy();
    expect(fix.path).toBe('/properties/address');
    expect(fix.explanation.length).toBeGreaterThan(5);
    expect(typeof fix.example === 'string' && fix.example.length > 5).toBe(
      true
    );
  });
});
