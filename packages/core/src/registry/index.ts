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

// Initialize built-in formats
import { registerBuiltInFormats } from '../generator/formats/index';
import { defaultFormatRegistry } from './format-registry';

// Register built-in formats immediately
registerBuiltInFormats(defaultFormatRegistry);
