/**
 * Registry initialization and exports
 */

export {
  FormatRegistry,
  defaultFormatRegistry,
  registerFormat,
  generateFormat,
  validateFormat,
} from './format-registry';
export type { FormatGenerator, FormatOptions } from './format-registry';

// Note: Built-in formats are initialized lazily in `packages/core/src/index.ts`
// via `defaultFormatRegistry.setInitializer(...)` to avoid circular deps
// and duplicate registrations. This module only re-exports registry items.
