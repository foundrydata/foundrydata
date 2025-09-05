import { describe, it, expect } from 'vitest';
import { FormatRegistry } from '../format-registry';
import type { FormatGenerator, FormatOptions } from '../format-registry';
import { ok } from '../../types/result';

class DummyFormat implements FormatGenerator {
  readonly name = 'foo';
  supports(format: string): boolean {
    return format === 'foo';
  }
  generate(_options?: FormatOptions): ReturnType<FormatGenerator['generate']> {
    return ok('bar');
  }
  validate(value: string): boolean {
    return value === 'bar';
  }
  getExamples(): string[] {
    return ['bar'];
  }
}

describe('FormatRegistry lazy initialization', () => {
  it('initializes only on first use via ensureInitialized', () => {
    const registry = new FormatRegistry();
    let initialized = false;

    registry.setInitializer(() => {
      initialized = true;
      registry.register(new DummyFormat());
    });

    // Not initialized yet
    expect(initialized).toBe(false);

    // First method call should trigger initializer
    expect(registry.supports('foo')).toBe(true);

    // Now initialized
    expect(initialized).toBe(true);

    // And generation works
    const res = registry.generate('foo');
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value).toBe('bar');
    }
  });
});
