// @foundrydata/core entry point

export { Generator } from './generator';
export * from './parser';
export * from './types';
export * from './registry';
export * from './generator/formats';
export * from './validator';
export * from '@foundrydata/shared';
export {
  ErrorCode,
  type Severity,
  getExitCode,
  getHttpStatus,
} from './errors/codes';

// Initialize built-in formats to avoid circular dependencies
import {
  defaultFormatRegistry,
  initializeBuiltInFormats,
} from './registry/format-registry';
import {
  UUIDGenerator,
  EmailGenerator,
  DateGenerator,
  DateTimeGenerator,
} from './generator/formats';

// Set up lazy initialization for the default registry
defaultFormatRegistry.setInitializer(() => {
  initializeBuiltInFormats(defaultFormatRegistry, [
    new UUIDGenerator(),
    new EmailGenerator(),
    new DateGenerator(),
    new DateTimeGenerator(),
  ]);
});
