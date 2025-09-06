/**
 * Error Code Infrastructure
 * Stable error codes, exit codes, and HTTP status mappings.
 */

// Severity levels used across the system
export type Severity = 'info' | 'warn' | 'error';

// Stable error codes grouped by domain
export enum ErrorCode {
  // Schema Errors (E001–E099)
  NESTED_OBJECTS_NOT_SUPPORTED = 'E001',
  COMPLEX_REGEX_PATTERNS_NOT_SUPPORTED = 'E002',
  SCHEMA_COMPOSITION_NOT_SUPPORTED = 'E003',
  INVALID_SCHEMA_STRUCTURE = 'E010',
  SCHEMA_PARSE_FAILED = 'E011',
  CIRCULAR_REFERENCE_DETECTED = 'E012',

  // Generation Errors (E100–E199)
  CONSTRAINT_VIOLATION = 'E100',
  GENERATION_LIMIT_EXCEEDED = 'E101',

  // Validation Errors (E200–E299)
  COMPLIANCE_VALIDATION_FAILED = 'E200',

  // Configuration Errors (E300–E399)
  CONFIGURATION_ERROR = 'E300',

  // Parse Errors (E400–E499)
  PARSE_ERROR = 'E400',

  // Internal Errors (E500–E599)
  INTERNAL_ERROR = 'E500',
}

// CLI exit codes mapping
export const EXIT_CODES = {
  [ErrorCode.NESTED_OBJECTS_NOT_SUPPORTED]: 10,
  [ErrorCode.COMPLEX_REGEX_PATTERNS_NOT_SUPPORTED]: 11,
  [ErrorCode.SCHEMA_COMPOSITION_NOT_SUPPORTED]: 12,
  [ErrorCode.INVALID_SCHEMA_STRUCTURE]: 20,
  [ErrorCode.SCHEMA_PARSE_FAILED]: 21,
  [ErrorCode.CIRCULAR_REFERENCE_DETECTED]: 22,
  [ErrorCode.CONSTRAINT_VIOLATION]: 30,
  [ErrorCode.GENERATION_LIMIT_EXCEEDED]: 31,
  [ErrorCode.COMPLIANCE_VALIDATION_FAILED]: 40,
  [ErrorCode.CONFIGURATION_ERROR]: 50,
  [ErrorCode.PARSE_ERROR]: 60,
  [ErrorCode.INTERNAL_ERROR]: 99,
} satisfies Record<ErrorCode, number>;

// HTTP status mapping for API responses
export const HTTP_STATUS_BY_CODE = {
  [ErrorCode.NESTED_OBJECTS_NOT_SUPPORTED]: 400,
  [ErrorCode.COMPLEX_REGEX_PATTERNS_NOT_SUPPORTED]: 400,
  [ErrorCode.SCHEMA_COMPOSITION_NOT_SUPPORTED]: 400,
  [ErrorCode.INVALID_SCHEMA_STRUCTURE]: 400,
  [ErrorCode.SCHEMA_PARSE_FAILED]: 422,
  [ErrorCode.CIRCULAR_REFERENCE_DETECTED]: 400,
  [ErrorCode.CONSTRAINT_VIOLATION]: 400,
  [ErrorCode.GENERATION_LIMIT_EXCEEDED]: 400,
  [ErrorCode.COMPLIANCE_VALIDATION_FAILED]: 422,
  [ErrorCode.CONFIGURATION_ERROR]: 500,
  [ErrorCode.PARSE_ERROR]: 400,
  [ErrorCode.INTERNAL_ERROR]: 500,
} satisfies Record<ErrorCode, number>;

// Stable helper functions (preferred over direct mapping usage via root API)
export function getExitCode(code: ErrorCode): number {
  return EXIT_CODES[code];
}

export function getHttpStatus(code: ErrorCode): number {
  return HTTP_STATUS_BY_CODE[code];
}
