/**
 * Built-in Format Generators
 * Export and register all built-in format generators
 */

export { UUIDGenerator } from './uuid-generator.js';
export { EmailGenerator } from './email-generator.js';
export { DateGenerator } from './date-generator.js';
export { DateTimeGenerator } from './datetime-generator.js';
export { RegexGenerator } from './regex-generator.js';

// Re-export types for convenience
export type {
  FormatGenerator,
  FormatOptions,
} from '../../registry/format-registry.js';

import { UUIDGenerator } from './uuid-generator.js';
import { EmailGenerator } from './email-generator.js';
import { DateGenerator } from './date-generator.js';
import { DateTimeGenerator } from './datetime-generator.js';
import { RegexGenerator } from './regex-generator.js';
import type { FormatRegistry } from '../../registry/format-registry.js';

/**
 * Register all built-in formats with a registry
 */
export function registerBuiltInFormats(registry: FormatRegistry): void {
  registry.register(new UUIDGenerator());
  registry.register(new EmailGenerator());
  registry.register(new DateGenerator());
  registry.register(new DateTimeGenerator());
  registry.register(new RegexGenerator());
}
