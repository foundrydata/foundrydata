# Claude AI Development Guide - FoundryData Project

> **Purpose**: This document provides comprehensive instructions for Claude AI when assisting with FoundryData development. 
> It can be used in any Claude interface (web, API, or Claude Code CLI).

## 🚀 TL;DR - FoundryData in 30 seconds
- **What**: JSON Schema → Test Data Generator with 100% compliance guarantee
- **Why**: Generate 10,000 perfectly valid records in <200ms, including edge cases
- **How**: `foundrydata generate --schema user.json --rows 10000`
- **Unique**: **Only OSS tool with scenario-based generation for edge cases and stress tests**
- **Philosophy**: "Generate deterministic, schema-true data with explicit limits"

## 🎯 Killer Feature: Scenario-Based Generation

**The ONLY open source tool with built-in scenario generation:**

```bash
# Standard generation - realistic data
foundrydata generate --schema user.json --rows 100

# Edge cases - min/max values, boundary conditions, empty arrays
foundrydata generate --schema user.json --rows 100 --scenario edge-cases

# Stress test - uncommon values, max arrays, near-boundary values  
foundrydata generate --schema user.json --rows 100 --scenario stress-test

# Error conditions - invalid formats, missing required fields (for testing error handlers)
foundrydata generate --schema user.json --rows 100 --scenario errors
```

**Why this matters**: Stop manually creating edge cases. Find bugs before production.

---

## 📋 Project Overview

### Core Value Proposition
> "Stop wasting hours on test data that breaks your API. Generate 10,000 perfectly valid records in 1 second. Plus edge cases and stress tests that actually break things."

### Target User (Crystal Clear)
**Frontend/Backend Developer at Small Startup**
- 2-5 years experience, 10-50 employee company
- **Pain**: Wastes 2+ hours/week creating test fixtures
- **Budget**: €0-100/month for dev tools  
- **Current solution**: Manual JSON files or broken Faker.js scripts
- **Trust factor**: Prefers open source tools

### MVP Constraints (v0.1)
- **Code**: Maximum 3000 lines
- **Performance**: <200ms for 1000 rows, <100MB for 10,000 records
- **Bundle**: <1MB (core package)
- **Architecture**: Single Node.js process, works offline

### What Works 100% (v0.1)
✅ **Fully Supported**
```json
{
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "name": {"type": "string", "minLength": 1, "maxLength": 100},
    "age": {"type": "integer", "minimum": 18, "maximum": 99},
    "active": {"type": "boolean"},
    "role": {"type": "string", "enum": ["admin", "user"]},
    "tags": {
      "type": "array",
      "items": {"type": "string"},
      "minItems": 1, "maxItems": 5
    }
  },
  "required": ["id", "name"]
}
```

Note: Arrays of flat objects are supported; nested object properties in root objects are not (until v0.3).

❌ **NOT Supported (v0.1)**
- Nested objects in properties (coming v0.3)
- Complex patterns (regex validation)
- Schema composition (allOf, oneOf, anyOf)
- References ($ref, $id)
- Advanced formats (uri, hostname, ipv4)

---

## 🏗️ Technical Architecture

### Core Principles
1. **Functional Core, Imperative Shell** - Pure functions in core, I/O at boundaries
2. **Parse, Don't Validate** - Transform inputs into strongly-typed domain models
3. **Make Invalid States Unrepresentable** - Use TypeScript's type system fully
4. **Fail Fast with Context** - Early validation with helpful error messages

### Package Structure (Monorepo)
```
packages/
├── core/                    # Domain logic (AJV, Faker only)
│   ├── generator/           # Generation engine (types, formats, constraints)
│   ├── validator/           # Schema validation
│   ├── parser/              # Schema parsing (JSON Schema, OpenAPI)
│   ├── registry/            # Extensibility (format, type, validator registries)
│   └── types/               # Core types (Schema, Result, errors)
├── cli/                     # CLI application (Commander.js)
├── shared/                  # Shared utilities and types
└── api/                     # REST API (future)
```

### Generation Pipeline
```typescript
parse(input) -> validate(schema) -> plan() -> generate() -> verify() -> format()
```

### Module System & TypeScript
- **ESM only**: `"type": "module"` in all package.json
- **TypeScript**: `"module": "ESNext"` targeting ES2022
- **Imports**: Always use explicit extensions (.js for compiled)
- **Build**: `npm run build` builds all workspace packages
- **Typecheck**: `npm run typecheck` validates with test config (tsconfig.test.json)
- **Typecheck Build**: `npm run typecheck:build` validates build config only

### Error Handling
```typescript
abstract class FoundryError extends Error
├── SchemaError      // Invalid schema structure
├── GenerationError  // Data generation failures  
├── ValidationError  // Compliance validation failures
└── ParseError       // Input parsing failures
```

#### Error Codes (v0.1)
Recommended public API usage for stable error codes and mappings.

```ts
// Preferred: root helpers and enum
import { ErrorCode, getExitCode, getHttpStatus } from '@foundrydata/core';

const code = ErrorCode.NESTED_OBJECTS_NOT_SUPPORTED; // 'E001'
const exit = getExitCode(code);   // e.g., 10
const http = getHttpStatus(code); // e.g., 400
```

Advanced (internal) access to raw mappings if needed:

```ts
import { EXIT_CODES, HTTP_STATUS_BY_CODE } from '@foundrydata/core/errors/codes';

EXIT_CODES[ErrorCode.INTERNAL_ERROR];      // 99
HTTP_STATUS_BY_CODE[ErrorCode.PARSE_ERROR]; // 400
```

Notes:
- Root API only exposes `ErrorCode`, `Severity`, `getExitCode`, `getHttpStatus` to keep the public surface stable.
- Raw mappings are subject to change; prefer helpers in application code.

---

## 🧪 Testing Architecture

### Zero Tolerance Testing Philosophy
- **100% schema compliance** via AJV oracle validation
- **Deterministic generation** with fixed seed (424242)
- **No retries** - tests must pass consistently
- **Multi-draft support** - Draft-07, 2019-09, 2020-12

### Test Structure
```
test/
├── arbitraries/             # Fast-check generators
├── fixtures/                # Test data
├── helpers/                 # AJV factory by draft
├── matchers/                # Custom Vitest matchers (toMatchJsonSchema, etc.)
├── patterns/                # Property-based test patterns
│   ├── invariant-testing.test.ts
│   ├── metamorphic-testing.test.ts
│   └── stateful-testing.test.ts
├── performance/             # Benchmarks (p50, p95, p99 targets)
└── setup.ts                 # Global configuration
```

### Test Commands
```bash
npm run test                 # All tests (root Vitest config)
npm run test:matchers        # test/**/* only (test config)
npm run test:watch           # Watch mode (root)
npm run test:watch:matchers  # Watch mode for matchers
npm run test:benchmarks      # Performance benchmarks
npm run test:regression      # Regression suite
npm run test:performance     # All performance tests
npm run test:gen:compliance  # Generator compliance tests
npm run test:gen:compliance:extra # Generator compliance with extra assertions
npm run test:coverage        # Run tests with coverage
```

### Performance Targets
| Records | Time | Memory | Percentile |
|---------|------|--------|------------|
| 100     | <20ms | <10MB | p95 |
| 1,000   | <200ms | <50MB | p95 |
| 10,000  | <2s | <100MB | p95 |

---

## 🔧 Development Workflow

### Scripts Overview
- **`npm run build`** - Build all workspace packages
- **`npm run dev`** - Development mode for all workspaces
- **`npm run clean`** - Remove dist directories
- **`npm run format`** - Format code with Prettier
- **`npm run prepare`** - Setup Husky for git hooks

### External Documentation Access
**Context7 MCP** provides latest documentation for:
- AJV JSON Schema validation
- @faker-js/faker v10.0.0+ API
- JSON Schema specification
- TypeScript patterns
- Commander.js CLI development
- Jest/Vitest testing frameworks

**Note**: If using Claude Code CLI, these dependencies are automatically accessible through the MCP integration.

### Task Master Integration
**Import TaskMaster workflow:** @./.taskmaster/CLAUDE.md

**CRITICAL: Task Completion Protocol**
- **ALWAYS** use `/complete-task <id>` command
- **NEVER** use `task-master set-status --status=done` directly
- Quality checks (lint, typecheck, tests) must pass before completion

### Quality Gates
```bash
npm run task-ready           # Full validation suite (lint + typecheck + build + test)
npm run task-complete        # Same as task-ready with success message
npm run typecheck            # TypeScript validation (no emit, test config)
npm run typecheck:build      # TypeScript build validation
npm run lint                 # ESLint check
npm run lint:fix             # ESLint with auto-fix
npm run test                 # All tests must pass
```

---

## 📐 Code Quality Standards

### 🚫 Absolute Bans

#### TypeScript Hacks = BANNED
```typescript
❌ (schema as any).type      // Masks type issues
❌ // @ts-ignore              // Hides problems  
❌ value!                     // Unsafe assertions

✅ // Instead: Fix root causes, use proper type guards
```

#### Deletion Without Investigation = BANNED
```typescript
❌ // See unused variable → Delete immediately
✅ // Instead: Understand purpose → Fix implementation → Then evaluate
```

### 🧠 Implementation Bias Prevention

#### Framework Bypass = CRITICAL ANTI-PATTERN
**Scenario**: TypeScript errors with existing framework functions

```typescript
❌ BAD REFLEX: "Fix" by avoiding the framework
// TypeScript error with getSchemaArbitrary().filter()?
// → Create manual arbitraries instead
const customArbitrary = fc.oneof(...)  // WRONG!

✅ CORRECT APPROACH: Fix the framework integration
// Understand WHY the framework has type issues
// → Add proper type guards or improve the framework
getSchemaArbitrary().filter().map(schema => schema as unknown as SpecificType)
```

**Root Cause**: Cognitive bias toward "easy local fix" instead of "correct architectural fix"

**Prevention Protocol**:
1. **STOP** when bypassing existing framework
2. **ASK**: "Why does the framework have this limitation?"
3. **INVESTIGATE**: Read framework docs and existing usage patterns
4. **FIX**: Improve framework integration, don't replace it
5. **VERIFY**: Check if other similar code has the same pattern

**Example**: Task 19 Boolean Generator
- ❌ Created manual `fc.oneof()` arbitraries
- ✅ Should use `getSchemaArbitrary().filter()` as prescribed
- **Lesson**: Framework patterns exist for multi-draft support and consistency

#### Framework Performance = CRITICAL UNDERSTANDING
**Scenario**: Overusing `getSchemaArbitrary().filter()` for simple constants

```typescript
❌ PERFORMANCE KILLER: Over-filtering for constants
getSchemaArbitrary()
  .filter(s => s.type === 'number' && s.multipleOf > 0)  // 0.7% success rate
  .chain(() => fc.constantFrom(0.1, 0.01, 1))           // Ignores generated schema!
// Result: 14,300 schema generations for 100 test runs = MINUTES

✅ CORRECT: Use simple patterns for simple values
fc.oneof(fc.constant(0.1), fc.constant(0.01), fc.constant(1))
// Result: 100 constant generations for 100 test runs = MILLISECONDS
```

**Performance Rules**:
1. **`getSchemaArbitrary()` only for complex schema testing** - Multi-draft validation, full schema properties
2. **`fc.oneof()` for simple constants** - Known values like `0.1, 1, 2.5`
3. **Filter probability matters** - `type === 'number'` (14%) vs `type + multipleOf + > 0` (0.7%)
4. **Use generated schemas** - Don't filter then ignore with `.chain(() => constants)`

**Example**: Number Generator Performance Fix
- ❌ Added framework pattern everywhere → Tests took minutes
- ✅ Rollback to simple patterns → Tests take 522ms  
- **Lesson**: Framework complexity requires framework-appropriate problems

### ESLint Guidelines
**DO NOT blindly follow ESLint** - use judgment:

**IGNORE ESLint when:**
- Critical components need cohesion over line limits
- Performance requires single-pass algorithms
- Complex business logic belongs together
- Generic utilities need `any` types

**FOLLOW ESLint for:**
- Simple utility functions
- UI components
- Test files
- Documentation

**Principle**: Optimize for readability and performance, not ESLint compliance.

### 🚨 Hiding Problems = CRITICAL ANTI-PATTERN

**Never modify tests to pass instead of fixing the actual problem**

```typescript
❌ BAD: Test fails → Remove/simplify the failing part
❌ BAD: Parser rejects valid schema → Change schema to avoid the issue
❌ BAD: Feature doesn't work → Remove feature from tests

✅ CORRECT: Test fails → Investigate root cause → Fix implementation
✅ CORRECT: Parser rejects valid schema → Fix parser or document limitation
✅ CORRECT: Feature doesn't work → Fix it or explicitly mark as unsupported
```

**Protocol when tests fail:**
1. **INVESTIGATE** - Understand exactly what's failing and why
2. **DOCUMENT** - If it's a known limitation, document it clearly
3. **FIX** - Either fix the implementation or the test expectations
4. **NEVER HIDE** - Don't sweep problems under the rug

**Example**: Integration tests failing
- ❌ Removed `multipleOf: 0.5` and `additionalProperties: false` to make tests pass
- ✅ Should investigate why parser rejects these valid JSON Schema features
- ✅ Should fix parser or document these as unsupported in MVP

---

## 📚 JSON Schema Support

### Version Compatibility
| Version | Status | Notes |
|---------|--------|-------|
| **Draft-07** | ✅ Full | Primary (OpenAPI 3.0) |
| **Draft 2019-09** | ✅ Full | Modern (AsyncAPI) |
| **Draft 2020-12** | ✅ Full | Latest (OpenAPI 3.1) |
| **Draft-04** | ❌ None | Use `npx swagger2openapi` |
| **Draft-06** | ⚠️ Partial | Via Draft-07 compatibility |

### String Formats (v0.1)
- ✅ **Supported**: uuid, email, date, date-time
- ❌ **Not supported**: uri, hostname, ipv4, ipv6, regex patterns

---

## 📖 Technical References

### Testing Documentation
When working on testing (tag: testing-v2), reference:
- **`docs/tests/foundrydata-complete-testing-guide-en.ts.txt`** - Implementation guide with Vitest config, Fast-check setup, AJV patterns
- **`docs/tests/foundrydata-testing-architecture-doc-en.md`** - Testing philosophy and strategy

For concrete fast-check configuration and the unified `propertyTest` wrapper (timeouts, shrinking, failure context), see the section “Property-Based Testing v2.1 (Fast-check + Vitest)” below.

### Format Handling (Normative)
For JSON Schema format validation:
- **`docs/tests/policy_json_schema_formats_by_draft_v_2.md`** - Single source of truth for Assertive vs Annotative behavior
- **`docs/tests/reference_json_schema_format_v_2.md`** - Technical specification (non-normative)

**Critical Rules:**
1. Policy document is normative
2. Different drafts have different format rules
3. Never assume format validation behavior
4. Unknown formats degrade to Annotative with logging

---

## 🧪 Property-Based Testing v2.1 (Fast-check + Vitest)

### Global Configuration
- Deterministic seed: `TEST_SEED=424242`
- Fast-check global: `endOnFailure: true`, `interruptAfterTimeLimit: 10000`, `markInterruptAsFailure: true`
- Verbosity: CI=0 (minimal), Dev=2 (detailed), otherwise 1
- Test timeout: 30s global (covers properties and shrinking)

Sources:
- `test/setup.ts` → `configureFastCheck()`, `propertyTest()`, and utilities
- `vitest.config.ts` → timeouts and projects (packages + test/)

### Wrapper `propertyTest`
Purpose: enforce timeouts/shrinking, log complete failure context, and keep tests deterministic.

Signature:
```ts
propertyTest(
  name: string,
  property: fc.IProperty<any>,
  options?: {
    parameters?: fc.Parameters<any>; // seed, numRuns, verbose, etc.
    samples?: fc.Arbitrary<unknown>[]; // samples for logs
    context?: Record<string, unknown>; // debug metadata
  }
): Promise<void>
```

Example:
```ts
import fc from 'fast-check';
import { propertyTest } from '../setup';

test('string length respects bounds', () => {
  return propertyTest(
    'bounds:string',
    fc.property(fc.tuple(fc.integer({min:0,max:5}), fc.integer({min:5,max:10})), ([min,max]) => {
      const s = 'a'.repeat(min);
      expect(s.length).toBeGreaterThanOrEqual(min);
      expect(s.length).toBeLessThanOrEqual(max);
    }),
    { parameters: { seed: 424242, numRuns: 50 }, context: { invariant: 'bounds', type: 'string' } }
  );
});
```

### Failure context and metrics
- Logs: seed, numRuns, counterexample, shrinking path, duration, timeout breach, samples.
- Soft cap for shrinking: CI=1000, Dev=500 (noted in failure context when exceeded).
- Shrinking time‑guard: 10s via `interruptAfterTimeLimit` (prevents infinite loops).

### Shrinking progress (optional)
- For fine-grained progress, use `fc.asyncProperty` and pass `parameters.asyncReporter` to `propertyTest`.
- Note: do not use `asyncReporter` with synchronous properties (fast-check forbids it).

### CI vs Local
- CI: strict (verbosity 0, shrinking caps, strict performance thresholds)
- Local: relaxed performance thresholds to avoid machine variability; everything else is identical.

---

## 🚀 Roadmap (If We Get Traction)

| Version | Timeline | Features | Success Metric |
|---------|----------|----------|----------------|
| **v0.1** | Now | Basic types, CLI, 100% compliance | MVP Launch |
| **v0.2** | Month 2 | Pattern validation, more formats | 100+ users |
| **v0.3** | Month 4 | Nested objects (1 level), CSV, API | 10+ paying |
| **v1.0** | Month 6 | Full nesting, schema composition | 25+ paying |

---

## ✅ Compliance Guarantee

### What We Guarantee
- ✅ **100% schema compliance** for supported features
- ✅ **AJV strict mode validation**
- ✅ **Deterministic generation** with --seed

### What We DON'T Guarantee
- ❌ Realistic looking data (might be "Lorem ipsum")
- ❌ Business logic validation
- ❌ Performance for complex schemas
- ❌ Support for all JSON Schema features

---

## 📝 Implementation Details

### Registry Pattern for Extensibility
- **FormatRegistry**: Custom string formats
- **TypeRegistry**: Custom type generators
- **ValidatorRegistry**: Custom validation rules

### Core Types
```typescript
// Result type for error handling (no exceptions)
type Result<T, E> = Ok<T> | Err<E>;

// Core schema types
type Schema = ObjectSchema | ArraySchema | StringSchema | NumberSchema | BooleanSchema;
```

### Complete Architecture Reference
**For full implementation details:** See `foundrydata-strategy/MVP/foundrydata-architecture.md`

---

## 💡 About This Document

This is a **project-specific guide** for Claude AI to assist with FoundryData development. It contains:
- Business context and technical constraints
- Architecture decisions and code standards  
- Testing philosophy and quality gates
- Task management integration
