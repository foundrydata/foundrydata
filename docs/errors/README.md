# FoundryData Error Codes

This page lists the stable error codes emitted by FoundryData. Each code is durable and maps to a CLI exit code and an HTTP status for API-style responses. Detailed pages will live at `https://foundrydata.dev/errors/{CODE}`.

- Source of truth: `packages/core/src/errors/codes.ts`
- Public API: `ErrorCode`, `getExitCode(code)`, `getHttpStatus(code)` from `@foundrydata/core`

## Schema Errors (E001–E099)

- E001 — NESTED_OBJECTS_NOT_SUPPORTED
  - Meaning: Deeply nested objects beyond the supported depth are not allowed.
  - Exit: 10 • HTTP: 400
  - Docs: https://foundrydata.dev/errors/E001

- E002 — COMPLEX_REGEX_PATTERNS_NOT_SUPPORTED
  - Meaning: Complex `pattern` constraints with ReDoS risk are not supported. Basic patterns are supported.
  - Exit: 11 • HTTP: 400
  - Docs: https://foundrydata.dev/errors/E002

- E003 — SCHEMA_COMPOSITION_NOT_SUPPORTED (deprecated)
  - Meaning: Historical code when composition wasn’t supported. Composition is supported now: `allOf` (merged),
    `anyOf`/`oneOf` (deterministic branch), and `not` (inverted). This code is no longer emitted.
  - Exit: 12 • HTTP: 400
  - Docs: https://foundrydata.dev/errors/E003

- E010 — INVALID_SCHEMA_STRUCTURE
  - Meaning: The schema has an invalid or unsupported structure.
  - Exit: 20 • HTTP: 400
  - Docs: https://foundrydata.dev/errors/E010

- E011 — SCHEMA_PARSE_FAILED
  - Meaning: Failed to parse the provided schema.
  - Exit: 21 • HTTP: 422
  - Docs: https://foundrydata.dev/errors/E011

- E012 — CIRCULAR_REFERENCE_DETECTED
  - Meaning: A circular `$ref` or reference loop was detected.
  - Exit: 22 • HTTP: 400
  - Docs: https://foundrydata.dev/errors/E012

## Generation Errors (E100–E199)

- E100 — CONSTRAINT_VIOLATION
  - Meaning: Constraints cannot be satisfied simultaneously.
  - Exit: 30 • HTTP: 400
  - Docs: https://foundrydata.dev/errors/E100

- E101 — GENERATION_LIMIT_EXCEEDED
  - Meaning: A safety or generation limit was exceeded.
  - Exit: 31 • HTTP: 400
  - Docs: https://foundrydata.dev/errors/E101

## Validation Errors (E200–E299)

- E200 — COMPLIANCE_VALIDATION_FAILED
  - Meaning: Generated data failed compliance validation.
  - Exit: 40 • HTTP: 422
  - Docs: https://foundrydata.dev/errors/E200

## Configuration Errors (E300–E399)

- E300 — CONFIGURATION_ERROR
  - Meaning: Invalid or missing configuration detected.
  - Exit: 50 • HTTP: 500
  - Docs: https://foundrydata.dev/errors/E300

## Parse Errors (E400–E499)

- E400 — PARSE_ERROR
  - Meaning: Generic parse error when reading inputs.
  - Exit: 60 • HTTP: 400
  - Docs: https://foundrydata.dev/errors/E400

## Internal Errors (E500–E599)

- E500 — INTERNAL_ERROR
  - Meaning: Unexpected internal failure; please open an issue with steps to reproduce.
  - Exit: 99 • HTTP: 500
  - Docs: https://foundrydata.dev/errors/E500

---

Notes:
- In production, stack traces are suppressed and sensitive values in `context.value` are redacted.
- For CLI rendering, use `ErrorPresenter('dev'|'prod').formatForCLI(error)` and render the returned view.
- For API responses (RFC 7807 style), use `formatForAPI(error)`, which sets `type` to the documentation URL above.
