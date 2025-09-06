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
export {
  ErrorPresenter,
  type CLIErrorView,
  type APIErrorView,
  type ProductionView,
} from './errors/presenter';

// Limitations registry and helpers (Task 6)
export {
  LIMITATIONS_REGISTRY,
  type Limitation,
  type LimitationKey,
  CURRENT_VERSION,
  getLimitation,
  compareVersions,
  isSupported,
  enrichErrorWithLimitation,
} from './errors/limitations';

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
