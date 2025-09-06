/**
 * Built-in Format Generators
 * Export and register all built-in format generators
 */

export { UUIDGenerator } from './uuid-generator';
export { EmailGenerator } from './email-generator';
export { DateGenerator } from './date-generator';
export { DateTimeGenerator } from './datetime-generator';
export { RegexGenerator } from './regex-generator';

// Re-export types for convenience
export type {
  FormatGenerator,
  FormatOptions,
} from '../../registry/format-registry';

import { UUIDGenerator } from './uuid-generator';
import { EmailGenerator } from './email-generator';
import { DateGenerator } from './date-generator';
import { DateTimeGenerator } from './datetime-generator';
import { RegexGenerator } from './regex-generator';
import type { FormatRegistry } from '../../registry/format-registry';

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
