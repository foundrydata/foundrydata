# Error Handling & User Experience Implementation Plan

## 📋 Overview
Implementation of comprehensive error system with clear user-facing messages for FoundryData MVP.

**Task ID**: 9  
**Priority**: High  
**Estimated**: 4 hours  
**Status**: In Progress  
**Version**: 4.0 (Final - Task Master Integrated)  
**Last Update**: 2025-09-05

## 🎯 Objectives
- Transform technical errors into helpful user guidance
- Provide clear workarounds for unsupported features
- Include examples and suggestions for error resolution
- Document MVP limitations transparently
- **NEW**: Stable error codes for traceability
- **NEW**: Precise error localization with JSON Pointer
- **NEW**: Security-aware PII redaction

## 🚨 Codebase Alignment Notes

### Current Structure
- **Existing**: `packages/core/src/types/errors.ts` - Domain error classes
- **Existing**: `ErrorReporter` class for formatting (to be replaced by `ErrorPresenter`)
- **New Location**: `packages/core/src/errors/` (not `packages/core/errors/`)
- **Breaking changes**: Acceptable per project requirements

### Key Refactors Required
1. Replace `code: string` with `errorCode: ErrorCode` enum
2. Remove `getUserMessage()`/`getSuggestions()` from domain errors
3. Replace `ErrorReporter` with new `ErrorPresenter` (zero imports in production)
4. Enforce typed `ErrorContext` with proper path semantics:
   - `path`: Instance data path (ValidationError - AJV instancePath)
   - `schemaPath`: Schema definition path (SchemaError - JSON Schema pointer)

## 🏗️ Implementation Plan

### Phase 1: Error System Analysis
**Location**: `packages/core/src/types/errors.ts`

- [x] Audit existing `FoundryError` base class
- [x] Identify error emission points (parser/reference-resolver.ts)
- [ ] Map error types to user scenarios
- [ ] Document current error hierarchy gaps
- [ ] Map error codes to exit codes and HTTP status

### Phase 2: Error Hierarchy with Stable Codes

Update (2025-09-06): Implemented with backward compatibility
- FoundryError now supports both the new params constructor and a legacy signature to enable progressive migration.
- Legacy `code: string` remains temporarily for compatibility; `errorCode: ErrorCode` is authoritative.
- Added `toJSON(env)` with production PII redaction, `toUserError()`, and `getExitCode()`.
- Removed: ErrorReporter (replaced by ErrorPresenter)

#### Error Code Registry (`packages/core/src/errors/codes.ts`)
```typescript
export enum ErrorCode {
  // Schema Errors (E001-E099)
  NESTED_OBJECTS_NOT_SUPPORTED = 'E001',
  REGEX_PATTERNS_NOT_SUPPORTED = 'E002',
  SCHEMA_COMPOSITION_NOT_SUPPORTED = 'E003',
  INVALID_SCHEMA_STRUCTURE = 'E010',
  SCHEMA_PARSE_FAILED = 'E011',
  CIRCULAR_REFERENCE_DETECTED = 'E012', // For reference-resolver.ts
  
  // Generation Errors (E100-E199)
  CONSTRAINT_VIOLATION = 'E100',
  GENERATION_LIMIT_EXCEEDED = 'E101',
  
  // Validation Errors (E200-E299)
  COMPLIANCE_VALIDATION_FAILED = 'E200',
  
  // Config Errors (E300-E399)
  CONFIGURATION_ERROR = 'E300',
  
  // Parse Errors (E400-E499)
  PARSE_ERROR = 'E400',
  
  // Internal Errors (E500-E599)
  INTERNAL_ERROR = 'E500', // Fallback for uncategorized errors
}

export type Severity = 'info' | 'warn' | 'error';

// Exit code mapping with TypeScript exhaustiveness check
export const EXIT_CODES = {
  [ErrorCode.NESTED_OBJECTS_NOT_SUPPORTED]: 10,
  [ErrorCode.REGEX_PATTERNS_NOT_SUPPORTED]: 11,
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

// HTTP status mapping with TypeScript exhaustiveness check
export const HTTP_STATUS_BY_CODE = {
  [ErrorCode.NESTED_OBJECTS_NOT_SUPPORTED]: 400,
  [ErrorCode.REGEX_PATTERNS_NOT_SUPPORTED]: 400,
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
```

Public API exposure and helpers:

```ts
// Root public API (recommended)
import { ErrorCode, getExitCode, getHttpStatus, type Severity } from '@foundrydata/core';

// Advanced (internal) mappings if needed
import { EXIT_CODES, HTTP_STATUS_BY_CODE } from '@foundrydata/core/errors/codes';
```

#### Task 4 Alignment: Error Emission Points (2025-09-06)
- Reference resolver now emits `SchemaError` with params constructor and precise context.
  - Circular reference: `ErrorCode.CIRCULAR_REFERENCE_DETECTED` with `schemaPath` set to the `$ref`/fragment and `ref` set to the URI when present.
  - Max depth exceeded: `ErrorCode.INVALID_SCHEMA_STRUCTURE` with `schemaPath` set to the active `$ref`.
  - Invalid/missing JSON Pointer: `ErrorCode.INVALID_SCHEMA_STRUCTURE` with `schemaPath` set to the pointer.
  - Missing external schema: `ErrorCode.SCHEMA_PARSE_FAILED` with `schemaPath` reflecting the reference location and `ref` set.
  - Semantics: For `SchemaError`, only `schemaPath`/`ref` are populated (leave `path` undefined).
- JSON Schema parser now emits `ParseError` via params constructor with codes and JSON Pointers.
  - Unsupported regex `pattern`: `ErrorCode.REGEX_PATTERNS_NOT_SUPPORTED` at `schemaPath` `#/.../pattern`.
  - Nested objects not supported: `ErrorCode.NESTED_OBJECTS_NOT_SUPPORTED` at `schemaPath` `#/properties/<key>`.
  - Unsupported/invalid type: `ErrorCode.INVALID_SCHEMA_STRUCTURE` with `schemaPath` for the node.
  - Cannot determine type / no suitable parser / generic parse failure: `ErrorCode.SCHEMA_PARSE_FAILED` at `schemaPath` `#`.
- Helper added to convert internal paths to JSON Pointer: `toSchemaPointer()` in the JSON Schema parser.
- Suggestions moved into `context.suggestion`; message remains user-friendly and descriptive.
- Tests not yet migrated; tracked in Task 8.

#### Refactored Error Classes (`packages/core/src/types/errors.ts`)

##### New Constructor Signatures
```typescript
// Context type for all errors
interface ErrorContext {
  path?: string;           // JSON Pointer: '/properties/address'
  schemaPath?: string;     // Schema path: '#/properties/address'  
  ref?: string;            // Reference URI
  value?: unknown;         // Problematic value (redacted in prod)
  valueExcerpt?: string;   // Safe excerpt of value
  limitationKey?: string;  // Links to limitation registry
  availableIn?: string;    // Version when feature available
}

// Base class refactor
class FoundryError extends Error {
  constructor(params: {
    message: string;
    errorCode: ErrorCode;
    severity?: Severity;
    context?: ErrorContext;
    cause?: Error;
  });
  // Legacy overload kept during migration
  constructor(message: string, code: string, context?: Record<string, any>);
  
  // Remove these methods (moved to presenter):
  // ❌ getUserMessage()
  // ❌ getSuggestions()
  
  // Add these methods:
  toJSON(env: 'dev' | 'prod'): SerializedError;
  toUserError(): UserError;
  getExitCode(): number;
}

// SchemaError refactor (CORRECTED)
class SchemaError extends FoundryError {
  constructor(params: {
    message: string;
    errorCode?: ErrorCode; // Default: INVALID_SCHEMA_STRUCTURE
    context: ErrorContext & {
      schemaPath: string;   // REQUIRED: Schema location (not path!)
      ref?: string;         // Optional: External reference URI
    };
    severity?: Severity;
    cause?: Error;
  });
  // Legacy overload for incremental migration
  constructor(message: string, path: string, suggestion?: string, context?: Record<string, any>);
}

// GenerationError refactor  
class GenerationError extends FoundryError {
  constructor(params: {
    message: string;
    errorCode?: ErrorCode; // Default: CONSTRAINT_VIOLATION
    context?: ErrorContext & {
      field?: string;
      constraint?: string;
    };
    severity?: Severity;
    cause?: Error;
  });
  // Legacy overload for incremental migration
  constructor(message: string, suggestion?: string, field?: string, constraint?: string, context?: Record<string, any>);
}

// ValidationError refactor
class ValidationError extends FoundryError {
  constructor(params: {
    message: string;
    failures: ValidationFailure[];
    errorCode?: ErrorCode; // Default: COMPLIANCE_VALIDATION_FAILED
    context?: ErrorContext;
    severity?: Severity;
    cause?: Error;
  });
  // Legacy overload for incremental migration
  constructor(message: string, failures: ValidationFailure[], context?: Record<string, any>);
}

// ConfigError refactor
class ConfigError extends FoundryError {
  constructor(params: {
    message: string;
    errorCode?: ErrorCode; // Default: CONFIGURATION_ERROR
    context?: ErrorContext & {
      setting?: string;
    };
    severity?: Severity;
    cause?: Error;
  });
  // Legacy overload for incremental migration
  constructor(message: string, setting?: string, context?: Record<string, any>);
}

// ParseError refactor
class ParseError extends FoundryError {
  constructor(params: {
    message: string;
    errorCode?: ErrorCode; // Default: PARSE_ERROR
    context?: ErrorContext & {
      input?: string;
      position?: number;
    };
    severity?: Severity;
    cause?: Error;
  });
  // Legacy overload for incremental migration
  constructor(message: string, input?: string, position?: number, context?: Record<string, any>);
}

### Phase 3: Error Presenter (Separation of Concerns)
**Location**: `packages/core/src/errors/presenter.ts`

```typescript
// Pure presentation layer - no business logic
import { getHttpStatus } from '@foundrydata/core';

class ErrorPresenter {
  constructor(
    private readonly env: 'dev' | 'prod',
    private readonly options: {
      colors?: boolean;        // CLI colors (respects NO_COLOR, FORCE_COLOR)
      terminalWidth?: number;   // For wrapping
      locale?: string;          // Future i18n
      redactKeys?: string[];    // PII keys to redact
    }
  ) {}
  
  // Format methods return presentation objects, not strings
  formatForCLI(error: FoundryError): CLIErrorView {
    return {
      title: this.formatTitle(error),
      location: this.formatLocation(error.context),
      excerpt: this.formatValueExcerpt(error.context),
      workaround: this.formatWorkaround(error),
      documentation: this.formatDocLink(error),
      eta: error.availableIn,
      code: error.errorCode
    };
  }
  
  formatForAPI(error: FoundryError): APIErrorView {
    return {
      status: getHttpStatus(error.errorCode),
      type: `https://foundrydata.dev/errors/${error.errorCode}`,
      title: error.message,
      detail: this.getDetail(error),
      instance: this.getRequestId(),
      code: error.errorCode,
      path: error.context.path,
      suggestions: error.suggestions || []
    };
  }
  
  formatForProduction(error: FoundryError): ProductionView {
    // No stack, redacted values, include requestId
    return this.redact(this.stripSensitive(error));
  }
  
  // Helper methods
  private formatLocation(ctx: ErrorContext): string {
    if (!ctx.path) return '';
    return `📍 Location: ${ctx.path}`;
  }
  
  private redact(view: any): any {
    // Apply redaction rules to context.value
    return applyRedaction(view, this.options.redactKeys);
  }
}
```

**Key Features (Implemented)**:
- **NO business logic** - purely presentation
- **Environment-aware** - dev vs prod formatting, `requestId` propagation
- **CLI-friendly** - respects NO_COLOR, FORCE_COLOR, terminal width metadata
- **Security-first** - automatic PII redaction; presenter supports extra `redactKeys`
- **Testable** - returns objects, not formatted strings

Note (2025-09-06): Implemented. ErrorReporter has been removed. All formatting now flows through `ErrorPresenter`; CLI uses a small renderer utility.

### Phase 4: Example Integration with Localization

#### Unsupported Nested Object
```
❌ Error E001: Nested objects not supported in MVP

📍 Location: /properties/address
Schema path: #/properties/address

Your schema contains:
  "address": {
    "type": "object",
    "properties": { ... }
  }

✅ Workaround: Flatten the structure
  "addressStreet": { "type": "string" },
  "addressCity": { "type": "string" }

📅 Full support coming in v0.3
📖 See: https://foundrydata.dev/errors/E001
```

#### Invalid Pattern
```
❌ Error E002: Regex patterns not supported in MVP

📍 Location: /properties/productCode/pattern
Schema path: #/properties/productCode/pattern
Value excerpt: "^[A-Z]{2}-\\d{4}$"

✅ Alternative: Use enum for fixed values
  "enum": ["US-1234", "CA-5678", "UK-9012"]

Or use format validation:
  "format": "uuid"  // Supported formats: uuid, email, date, date-time

📅 Pattern support coming in v0.2
💡 Open issue: https://github.com/foundrydata/issues/new?template=pattern-support
```

### Phase 5: Suggestion System (Pure Functions)
Implemented (2025-09-06)
**Location**: `packages/core/src/errors/suggestions.ts`

```typescript
// Pure functions for testability - NO classes, NO state
export {
  didYouMean,
  getAlternative,
  proposeSchemaFix,
  getWorkaround,
  calculateDistance,
};

// Typo detection with simple distance algorithm (MVP)
export function didYouMean(
  input: string, 
  validOptions: string[],
  maxDistance = 3
): string[] {
  return validOptions
    .map(option => ({
      option,
      distance: calculateDistance(input, option)
    }))
    .filter(({ distance }) => distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(({ option }) => option);
}

// Feature alternatives from central limitations registry (MVP)
export function getAlternative(
  unsupportedFeature: string
): Alternative | null {
  const lim = LIMITATIONS_REGISTRY[unsupportedFeature];
  return lim
    ? {
        workaround: lim.workaround,
        example: lim.workaroundExample,
        documentation:
          `https://github.com/foundrydata/foundrydata/blob/main/docs/MVP_LIMITATIONS.md#${lim.docsAnchor}`,
      }
    : null;
}

// Schema correction proposals
export function proposeSchemaFix(
  error: SchemaError
): SchemaFix | null {
  const { path, limitationKey } = error.context as { path?: string; limitationKey?: string };
  const limitation = limitationKey ? LIMITATIONS_REGISTRY[limitationKey] : null;

  if (!limitation) return null;

  return {
    path,
    explanation: limitation.workaround,
    example: limitation.workaroundExample, // string example in MVP
  };
}

// Workaround retrieval from central registry
export function getWorkaround(
  limitationKey: string
): Workaround | null {
  const limitation = LIMITATIONS_REGISTRY[limitationKey];
  return limitation ? {
    description: limitation.workaround,
    example: limitation.workaroundExample,
    availableIn: limitation.availableIn
  } : null;
}

// Simple edit distance for MVP (no Levenshtein complexity)
export function calculateDistance(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return shorter.length;
  if (shorter.length === 0) return longer.length;
  let distance = Math.abs(a.length - b.length);
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] !== longer[i]) distance++;
  }
  return distance;
}
```

**Design Principles (Applied)**:
- **Pure functions only** - no side effects, fully testable
- **Simple algorithms for MVP** - optimize in v0.2
- **Registry-based** - centralized limitation knowledge
- **Null-safe** - always return null for unknown features

Integration notes (MVP):
- `FormatRegistry` uses `didYouMean` to suggest close format names.
- `getAlternative`/`getWorkaround` pull from `LIMITATIONS_REGISTRY` to keep CLI/API consistent with docs.
- Helpers are exported via root API in `packages/core/src/index.ts`.
- Tests live in `packages/core/src/errors/__tests__/suggestions.test.ts`.

Roadmap note (Task 7/9):
- For richer “schema fix proposals”, `proposeSchemaFix` may evolve to return structured examples with `{ before, after }` objects and an optional `diff`. The registry could adopt a union type for `workaroundExample` (string | { before: unknown; after: unknown }). MVP stays string-based for simplicity.

### Phase 6: MVP Limitations Registry (Single Source of Truth)
**Location**: `packages/core/src/errors/limitations.ts` (exported via root API)

```typescript
// Centralized registry with stable keys and rich metadata
export const LIMITATIONS_REGISTRY: Record<
  'nestedObjects' | 'regexPatterns' | 'schemaComposition',
  {
    key: string;
    title: string;
    errorCode: ErrorCode;
    availableIn: string; // e.g. '0.3.0'
    workaround: string;
    workaroundExample: string;
    docsAnchor: string; // anchor in MVP_LIMITATIONS.md
    featureExamples: string[];
  }
> = {
  nestedObjects: {
    key: 'nestedObjects',
    title: 'Nested Objects Not Supported',
    errorCode: ErrorCode.NESTED_OBJECTS_NOT_SUPPORTED,
    availableIn: '0.3.0',
    workaround: 'Flatten nested objects into top-level properties.',
    workaroundExample: "Use addressStreet/addressCity instead of nested 'address' object.",
    docsAnchor: 'nested-objects',
    featureExamples: ["{ type: 'object', properties: { address: { type: 'object' } } }"],
  },
  regexPatterns: {
    key: 'regexPatterns',
    title: 'Regex Patterns Not Supported',
    errorCode: ErrorCode.REGEX_PATTERNS_NOT_SUPPORTED,
    availableIn: '0.2.0',
    workaround: 'Use enum or supported format constraints instead of custom regex.',
    workaroundExample: "Prefer { format: 'email' } or enum over 'pattern'.",
    docsAnchor: 'keywords-not-supported',
    featureExamples: ["{ type: 'string', pattern: '^[A-Z]{3}$' }"],
  },
  schemaComposition: {
    key: 'schemaComposition',
    title: 'Schema Composition Not Supported',
    errorCode: ErrorCode.SCHEMA_COMPOSITION_NOT_SUPPORTED,
    availableIn: '1.0.0',
    workaround: 'Manually merge constraints from composition keywords.',
    workaroundExample: 'Inline the combined constraints and remove allOf/anyOf/oneOf.',
    docsAnchor: 'keywords-not-supported',
    featureExamples: [
      "{ allOf: [{ type: 'string' }, { minLength: 3 }] }",
      "{ anyOf: [{ type: 'string' }, { type: 'number' }] }",
    ],
  },
};

// Helper functions (publicly exported)
export function getLimitation(key: string): Limitation | null;
export function compareVersions(a: string, b: string): number;
export function isSupported(key: string, version: string): boolean; // unknown → false
export function enrichErrorWithLimitation(error: FoundryError, key: string): FoundryError;
export const CURRENT_VERSION = '0.1.0';

// Presenter consumes these enrichments:
// - error.suggestions[0]  → CLI "Workaround"
// - error.documentation   → CLI "More info" link
// - error.availableIn     → CLI "Available in"
```

Public API exposure:
- `packages/core/src/index.ts` re-exports: `LIMITATIONS_REGISTRY`, `CURRENT_VERSION`, `getLimitation`, `compareVersions`, `isSupported`, `enrichErrorWithLimitation`, types `Limitation`, `LimitationKey`.

Doc linkage strategy:
- Documentation URL points to `docs/MVP_LIMITATIONS.md#<docsAnchor>` in-repo for now (GitHub URL in MVP).

### Phase 7: Testing Strategy

#### Error Code & Exit Code Mapping Tests
```typescript
describe('Error Codes', () => {
  test('each error has unique stable code', () => {
    const codes = Object.values(ErrorCode);
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });
  
  test('error codes map to exit codes', () => {
    const error = new UnsupportedFeatureError('nestedObjects');
    expect(error.getExitCode()).toBe(10);
  });
  
  test('error codes map to HTTP status', () => {
    const error = new InvalidSchemaError('...');
    const presenter = new ErrorPresenter('prod', {});
    const apiView = presenter.formatForAPI(error);
    expect(apiView.status).toBe(400);
  });
});
```

#### Localization & Context Tests
```typescript
describe('Error Localization', () => {
  test('includes JSON Pointer path', () => {
    const error = new UnsupportedFeatureError('nestedObjects', {
      path: '/properties/address',
      schemaPath: '#/properties/address'
    });
    expect(error.context.path).toBe('/properties/address');
  });
  
  test('provides value excerpt without PII', () => {
    const error = new ValidationError('...', {
      value: { ssn: '123-45-6789', name: 'John' },
      valueExcerpt: '{ name: "J...", ... }'
    });
    expect(error.context.valueExcerpt).not.toContain('123-45-6789');
  });
});
```

#### Production vs Development Tests (Updated)
```typescript
describe('Environment-aware Formatting', () => {
  test('production hides stack trace and includes requestId', () => {
    const error = new SchemaError('Invalid');
    const presenter = new ErrorPresenter('prod', { requestId: 'req-123' });
    const view = presenter.formatForProduction(error);
    expect((view as any).stack).toBeUndefined();
    expect((view as any).requestId).toBe('req-123');
  });
  
  test('development shows cause chain', () => {
    const cause = new Error('Original');
    const error = new SchemaError('Wrapped', { cause });
    const presenter = new ErrorPresenter('dev', {});
    const view = presenter.formatForCLI(error);
    expect(view).toHaveProperty('cause');
  });
  
  test('production redacts sensitive values', () => {
    const error = new ValidationError('...', {
      value: { password: 'secret123' }
    });
    const presenter = new ErrorPresenter('prod', {
      redactKeys: ['password', 'ssn', 'apiKey']
    });
    const view = presenter.formatForProduction(error);
    expect(JSON.stringify(view)).not.toContain('secret123');
    expect(JSON.stringify(view)).toContain('[REDACTED]');
  });
});
```

#### Snapshot Tests for CLI Format (Updated)
```typescript
describe('CLI Output Snapshots', () => {
  test('nested object error format', () => {
    const error = enrichErrorWithLimitation(
      new UnsupportedFeatureError('nestedObjects', {
        path: '/properties/address'
      }),
      'nestedObjects'
    );
    const presenter = new ErrorPresenter('dev', { colors: false });
    const output = renderCLIView(presenter.formatForCLI(error));
    
    // Strip ANSI for snapshot
    const clean = stripAnsi(output);
    expect(clean).toMatchSnapshot();
  });

  test('wrap respects terminalWidth and keeps doc URL on one line', () => {
    const presenter = new ErrorPresenter('dev', { colors: false });
    const view = presenter.formatForCLI(error);
    (view as any).terminalWidth = 30; // simulate narrow terminal
    const output = renderCLIView(view);
    const clean = stripAnsi(output);
    expect(clean).toMatchSnapshot();
  });
});
```

#### Suggestion System Tests
```typescript
describe('Pure Suggestion Functions', () => {
  test('didYouMean with simple distance', () => {
    const suggestions = didYouMean('stirng', ['string', 'number', 'boolean']);
    expect(suggestions).toEqual(['string']);
  });
  
  test('getAlternative from registry', () => {
    const alt = getAlternative('regexPatterns');
    expect(alt).toMatchObject({
      workaround: 'Use enum or format validators'
    });
  });
  
  test('proposeSchemaFix returns explanation and example', () => {
    const error = new SchemaError({
      message: 'Nested objects not supported',
      context: { schemaPath: '#/properties/address', path: '/properties/address', limitationKey: 'nestedObjects' },
    });
    const fix = proposeSchemaFix(error)!;
    expect(fix).toMatchObject({
      path: '/properties/address',
      explanation: expect.any(String),
      example: expect.any(String),
    });
  });
  
  test('handles unknown limitations gracefully', () => {
    const workaround = getWorkaround('unknownFeature');
    expect(workaround).toBeNull();
  });
});
```

#### CLI Color & Terminal Tests
```typescript
describe('CLI Formatting', () => {
  test('respects NO_COLOR env variable', () => {
    process.env.NO_COLOR = '1';
    const presenter = new ErrorPresenter('dev', {});
    const err = new SchemaError({ message: 'Test', context: { schemaPath: '#' } });
    const view = presenter.formatForCLI(err);
    expect(view.colors).toBe(false);
  });
  
  test('respects FORCE_COLOR env variable', () => {
    process.env.FORCE_COLOR = '1';
    const presenter = new ErrorPresenter('prod', {});
    const err = new SchemaError({ message: 'Test', context: { schemaPath: '#' } });
    const view = presenter.formatForCLI(err);
    expect(view.colors).toBe(true);
  });
  
  test('wraps text to terminal width', () => {
    const presenter = new ErrorPresenter('dev', { terminalWidth: 40 });
    const view = presenter.formatForCLI(longError);
    const lines = view.message.split('\n');
    lines.forEach(line => {
      expect(stripAnsi(line).length).toBeLessThanOrEqual(40);
    });
  });
});
```

## 📊 Success Metrics
- [ ] 100% of errors have user-friendly messages
- [ ] All unsupported features have documented workarounds  
- [ ] Zero stack traces in production mode
- [ ] Every error includes at least one suggestion
- [ ] All MVP limitations documented with timeline
- [ ] **NEW**: Stable error codes for all error types
- [ ] **NEW**: JSON Pointer paths for precise localization
- [ ] **NEW**: PII redaction in production logs
- [ ] **NEW**: Exit code mapping for CLI integration
- [ ] **NEW**: NO_COLOR/FORCE_COLOR compliance

## 📋 Task Master Integration

**Tag**: `error-system-v3`  
**Total Tasks**: 9 main tasks, 20 subtasks  
**Dependencies**: Properly sequenced for safe implementation

### Task List Summary
1. **Create Error Code Infrastructure** → ErrorCode enum, mappings, tests
2. **Refactor FoundryError Base Class** → New constructor, serialization
3. **Update Error Subclasses** → SchemaError with schemaPath, etc.
4. **Update Error Emission Points** → reference-resolver.ts migrations
5. **Create ErrorPresenter Class** → CLI/API/Production formatting
6. **Create Limitations Registry** → MVP limitations centralized
7. **Create Suggestion System** → Pure functions for suggestions
8. **Migrate and Update Tests** → ErrorReporter removal, snapshots
9. **Final Quality Checks** → Documentation, linting, breaking changes

## 🔄 Implementation Order (Séquencé et Sûr)

### Étape 1: Introduire l'infrastructure codes (30 min)
- [x] Créer `packages/core/src/errors/codes.ts` avec ErrorCode enum incluant E500
- [x] Ajouter EXIT_CODES et HTTP_STATUS_BY_CODE avec `satisfies Record<ErrorCode, number>`
- [x] Définir type Severity = 'info' | 'warn' | 'error'
- [x] Inclure CIRCULAR_REFERENCE_DETECTED = 'E012' explicitement
- [x] Exposer via API racine: `ErrorCode`, `Severity`, `getExitCode()`, `getHttpStatus()`
- [x] Laisser les mappings bruts via sous-chemin `@foundrydata/core/errors/codes`

### Étape 2: Refondre la base d'erreurs (45 min)
- [x] Refactorer FoundryError avec nouveau constructeur params
- [x] Ajouter errorCode, severity, context typé, cause
- [x] Implémenter toJSON(env), getExitCode()
- [x] Supprimer getUserMessage() et getSuggestions()
- [x] Conserver une surcharge legacy (message, code, context?) pour migration progressive

### Étape 3: Mettre à jour les sous-classes (45 min)
- [x] SchemaError: nouveau constructeur avec context.schemaPath REQUIS (pas path!)
- [x] GenerationError: nouveau constructeur avec field/constraint
- [x] ValidationError: garder failures, utiliser path pour instancePath
- [x] ConfigError: ajouter setting dans context
- [x] ParseError: ajouter input/position dans context
- [x] Ajouter des surcharges legacy pour migration progressive et getters de compat (path, field, constraint, setting, input/position, suggestion)

### Étape 4: Mettre à jour les points d'émission (30 min)
- [x] parser/reference-resolver.ts: utiliser schemaPath (pas path!) et ref
  - Référence circulaire → CIRCULAR_REFERENCE_DETECTED (E012)
  - Profondeur max → INVALID_SCHEMA_STRUCTURE
  - JSON Pointer invalide → INVALID_SCHEMA_STRUCTURE
  - Schéma externe manquant → SCHEMA_PARSE_FAILED

### Étape 5: Présentation et registre (1 heure)
- [x] Créer `packages/core/src/errors/presenter.ts` avec ErrorPresenter
- [x] Implémenter formatForCLI/API/Production avec redaction
- [x] Créer `packages/core/src/errors/limitations.ts` avec registre
- [x] Créer `packages/core/src/errors/suggestions.ts` avec fonctions pures

### Étape 6: Migration des tests (45 min)
- [ ] Supprimer tests getUserMessage/getSuggestions
- [x] Ajouter tests dans `packages/core/src/errors/__tests__/`
  - presenter.test.ts: env dev/prod, redaction, NO_COLOR
  - codes.test.ts: unicité, mapping exit/http
  - limitations.test.ts: getLimitation, isSupported
  - suggestions.test.ts: fonctions pures
- [x] Mettre à jour tests errors.test.ts pour errorCode
- [x] Remplacer ErrorReporter tests par ErrorPresenter

### Étape 7: Finitions (15 min)
- [ ] Vérifier absence stack/PII en prod
- [ ] Vérifier mapping ErrorCode → exit/http
- [ ] Linter et formatter
- [ ] Documentation des breaking changes

## 🚨 Security & Privacy Considerations

### PII Redaction
- Default redact keys: `password`, `apiKey`, `secret`, `token`, `ssn`, `creditCard`
- Context value scrubbing in production
- Safe value excerpts for debugging
- Request ID for support correlation

### Error Information Disclosure
- Stack traces only in development
- Generic messages for internal errors
- Detailed paths only for schema errors
- Rate limiting on error endpoints (future)

## 📝 Integration Points & Breaking Changes

### Points d'Intégration à Modifier

#### `packages/core/src/parser/reference-resolver.ts`
```typescript
// AVANT
throw new SchemaError(message, pathOrRef, suggestion?);

// APRÈS (CORRIGÉ)
throw new SchemaError({
  message,
  errorCode: ErrorCode.INVALID_SCHEMA_STRUCTURE,
  context: {
    schemaPath: pointer,  // Schema location (JSON Schema pointer)
    ref: refUri          // External reference URI if applicable
    // path: undefined    // NOT used for SchemaError
  }
});
```

### Tests Impactés

#### `packages/core/src/types/__tests__/errors.test.ts`
- Remplacer `error.code === 'SCHEMA_ERROR'` par `error.errorCode === ErrorCode.XXX`
- Supprimer tests `getUserMessage()` et `getSuggestions()`
- Ajouter tests `toJSON('prod')` pour vérifier redaction
- Vérifier que SchemaError utilise `schemaPath` et non `path`
- Vérifier que ValidationError utilise `path` pour instancePath

#### ErrorReporter Migration (Final)
- Décision: Suppression complète, pas de proxy/shim
- **Atteint**: Zéro import `ErrorReporter` en production (vérifié via ripgrep)
- Remplacement: tous les rendus passent par `ErrorPresenter`
- CLI: rendu effectué via `packages/cli/src/render.ts` (`renderCLIView`, `stripAnsi`)

## 🎯 MVP Priorities (v0.1)

### Must Have
- ✅ Error codes (E001-E599 including E500 for internal errors)
- ✅ JSON Pointer localization with proper path semantics
- ✅ Workaround suggestions
- ✅ Limitations registry
- ✅ Production safety (no stacks, PII redaction for nested objects)
- ✅ Replace ErrorReporter with ErrorPresenter (zero imports)
- ✅ TypeScript exhaustiveness with `satisfies Record<ErrorCode, number>`
- ✅ Error documentation URLs (`https://foundrydata.dev/errors/{code}`)
- ✅ Helpers publics pour statut HTTP et exit code (root API)

### Nice to Have (v0.2)
- ⏳ Levenshtein distance for typos
- ⏳ i18n support
- ⏳ application/problem+json
- ⏳ Error analytics
- ⏳ Interactive error fixing

## 🔗 Related Documents
- [MVP Limitations](../docs/mvp-limitations.md)
- [JSON Schema Support](../docs/json-schema-support.md)
- [Roadmap](../docs/roadmap.md)
- [Testing Strategy](../docs/tests/foundrydata-complete-testing-guide-en.ts.txt)
