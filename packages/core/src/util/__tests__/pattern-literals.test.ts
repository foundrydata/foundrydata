import { describe, expect, it } from 'vitest';
import { synthesizePatternExample } from '../pattern-literals.js';

describe('synthesizePatternExample', () => {
  it('handles literal + digit groups', () => {
    const pattern = '^3\\.1\\.\\d+(-.+)?$';
    expect(synthesizePatternExample(pattern)).toBe('3.1.0');
  });

  it('prefers first alternative deterministically', () => {
    expect(synthesizePatternExample('^(?:foo|bar)$')).toBe('foo');
  });

  it('supports char classes and quantifiers', () => {
    expect(synthesizePatternExample('^[A-Z]{2}\\d{2}$')).toBe('AA00');
  });

  it('returns undefined for lookahead-heavy patterns', () => {
    expect(synthesizePatternExample('^(?=foo).*')).toBeUndefined();
  });
});
