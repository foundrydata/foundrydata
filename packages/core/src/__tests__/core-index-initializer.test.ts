import { describe, it, expect } from 'vitest';

// Importing core index re-exports `defaultFormatRegistry` and registers
// the lazy initializer for built-in formats in its module body
import { defaultFormatRegistry } from '../index';

describe('core index initializer — default format registry', () => {
  it('initializes built-in formats lazily on first access', () => {
    // First call should trigger initializer body in packages/core/src/index.ts
    const supportsEmail = defaultFormatRegistry.supports('email');
    expect(supportsEmail).toBe(true);
    const v = defaultFormatRegistry.generate('uuid');
    expect(v.isOk && v.isOk()).toBe(true);
  });
});
