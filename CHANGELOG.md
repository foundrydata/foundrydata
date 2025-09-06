# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project adheres to Semantic Versioning where applicable.

## Unreleased

### Added
- Stable error code infrastructure: `ErrorCode` enum with durable codes (E001–E599).
- Mappings and helpers: `getExitCode(code)` and `getHttpStatus(code)` exported from `@foundrydata/core`.
- `ErrorPresenter` (pure presentation layer) with:
  - `formatForCLI(error)` returning a CLI view object
  - `formatForAPI(error)` returning an RFC 7807 style object with `type=https://foundrydata.dev/errors/{code}`
  - `formatForProduction(error)` for safe logging with redaction and no stack in production
- Error code documentation stub (`docs/errors/README.md`) listing all codes with meanings and mappings.

- Parser: draft‑07 tuple items (`items: []`) and `additionalItems` (boolean | schema).
- Parser: conditional keywords `if/then/else` parsed and preserved.
- Generator: pre‑planning heuristics for `if/then/else` (top‑level + one level nested) and post‑gen repair.
- Format: built‑in `format: "regex"` with generation + validation.

### Changed
- `FoundryError` base class refactor:
  - New constructor params signature: `{ message, errorCode, severity?, context?, cause? }`
  - `toJSON(env)` now omits stack in production and redacts sensitive values in `context.value`
  - `toUserError()` returns a minimal, safe structure for user surfaces
  - `getExitCode()` resolves the process exit code from `ErrorCode`
- Domain error subclasses updated to prefer the new params constructor and typed `ErrorContext` semantics (`path` vs `schemaPath`).

- Composition in planning: `allOf` (merged), `anyOf`/`oneOf` (deterministic branch), `not` (inverted).
- Strict mode: fail‑fast now only for conditional keywords; composition/object keywords proceed normally.

### Removed
- `ErrorReporter` removed in favor of the new `ErrorPresenter`. All formatting goes through `ErrorPresenter`.
- Deprecated ad‑hoc formatting helpers were removed or inlined behind presenter usage where applicable.

### Migration Notes (Breaking)
- Replace legacy `new FoundryError(message, code, context)` calls with the params object signature and an `ErrorCode` enum value.
- Replace any usage of `ErrorReporter` with `ErrorPresenter`. For CLI/UI, render the `CLIErrorView` returned by `formatForCLI()`.
- For API responses, use `formatForAPI()` and propagate `status` and `type` fields directly to clients.
- Ensure any consumer code expecting `error.code: string` is migrated to `error.errorCode: ErrorCode`.
