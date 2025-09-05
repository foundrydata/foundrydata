import { describe, it, expect } from 'vitest';

// Import the core entrypoint to set up the lazy initializer on the global default registry
import '../../index';
import { defaultFormatRegistry } from '../format-registry';

describe('defaultFormatRegistry lazy init via core entrypoint', () => {
  it('does not register formats on import (initializes on first use)', () => {
    const registry = defaultFormatRegistry;

    let initialized = false;

    // Override initializer to observe when it runs (and avoid registering real formats)
    registry.setInitializer(() => {
      initialized = true;
      // Intentionally do not register any formats here
    });

    // Before any call that triggers ensureInitialized(), initializer must not have run
    expect(initialized).toBe(false);

    // First use triggers ensureInitialized() and runs our test initializer
    // We expect no built-in format to be available since we didn't register any
    expect(registry.supports('uuid')).toBe(false);
    expect(initialized).toBe(true);
  });
});
