# Claude Code Instructions

## Context7 MCP - External Documentation
**Access to latest documentation for project dependencies and standards using Context7.**
- AJV JSON Schema validation library
- @faker-js/faker data generation library (v10.0.0+ API and patterns)
- JSON Schema specification and best practices
- TypeScript patterns and configurations
- Node.js CLI development with Commander.js
- Testing frameworks and patterns (Jest, property-based testing)
- Performance optimization techniques

## FoundryData Architecture Overview

### Core Principles
- **Functional Core, Imperative Shell**: Pure functions in core, I/O at boundaries
- **Parse, Don't Validate**: Transform inputs into strongly-typed domain models
- **Make Invalid States Unrepresentable**: Use TypeScript's type system fully
- **Fail Fast with Context**: Early validation with helpful error messages

### Package Structure (Monorepo)
```
packages/
├── core/                    # Domain logic (AJV, Faker only)
│   ├── generator/           # Generation engine
│   │   ├── types/           # Type generators (string, number, etc.)
│   │   ├── formats/         # Format generators (uuid, email, etc.)
│   │   └── constraints/     # Constraint handlers
│   ├── validator/           # Schema validation
│   ├── parser/              # Schema parsing (JSON Schema, OpenAPI)
│   ├── registry/            # Extensibility (format, type, validator registries)
│   └── types/               # Core types (Schema, Result, errors)
├── cli/                     # CLI application (Commander.js)
└── api/                     # REST API (future)
```

### Module System
**ESM (ECMAScript Modules) Configuration:**
- All packages use `"type": "module"` in package.json
- TypeScript configured with `"module": "ESNext"` targeting ES2022
- Use import/export syntax, not require/module.exports
- All file extensions must be explicit in imports (.js for compiled output)

### TypeScript Configuration Strategy
**Separate configurations for different purposes:**
- **Build (`tsc --build`)**: Uses `packages/*/tsconfig.json` - excludes test files for production builds
- **Type checking (`npm run typecheck`)**: Uses root `tsconfig.test.json` - includes all files including tests
- **VS Code**: Automatically uses `tsconfig.test.json` for comprehensive error reporting
- **Quality gates**: `task-ready` script runs `typecheck` before `build` to catch all TypeScript errors

This ensures:
- ✅ VS Code shows TypeScript errors in test files  
- ✅ Production builds exclude test files
- ✅ CI/CD catches all type errors before deployment
- ✅ Consistent behavior between IDE and command line

### Key Types & Patterns
```typescript
// Result type for error handling (no exceptions)
type Result<T, E> = Ok<T> | Err<E>;

// Core schema types
type Schema = ObjectSchema | ArraySchema | StringSchema | NumberSchema | BooleanSchema;

// Generation pipeline stages
parse(input) -> validate(schema) -> plan() -> generate() -> verify() -> format()
```

### Registry Pattern for Extensibility
- **FormatRegistry**: Custom string formats (uuid, email, etc.)
- **TypeRegistry**: Custom type generators
- **ValidatorRegistry**: Custom validation rules

### Error Handling Hierarchy
```typescript
abstract class FoundryError extends Error
├── SchemaError      // Invalid schema structure
├── GenerationError  // Data generation failures  
├── ValidationError  // Compliance validation failures
└── ParseError       // Input parsing failures
```

**For complete implementation details:** See foundrydata-strategy/MVP/foundrydata-architecture.md

## MVP Constraints & Limitations (v0.1)

### Technical Constraints
- **Maximum 3000 lines of code** for v1
- **Performance**: <200ms for 1000 rows generation
- **Memory usage**: <100MB for 10,000 records
- **Bundle size**: <1MB (core package)
- **Single Node.js process** (MVP limitation)
- **Must work offline**

### Supported Schema Features
- **Basic types**: string, number, integer, boolean, array
- **String formats**: uuid, email, date, date-time only
- **Constraints**: minimum/maximum, minLength/maxLength, minItems/maxItems, enum, required
- **Arrays**: Primitives + flat objects only
- **Objects**: Flat structure only (no nesting in properties)

### NOT Supported (v0.1)
- ❌ **Nested objects** in properties (Coming v0.3)
- ❌ **Complex patterns** (regex validation)
- ❌ **Schema composition** (allOf, oneOf, anyOf)
- ❌ **References** ($ref, $id)
- ❌ **Advanced formats** (uri, hostname, ipv4, ipv6)

## Scenario-Based Generation (Killer Feature)

**The only open source tool with scenario-based generation for edge cases and stress tests:**

```bash
# Standard generation
foundrydata generate --schema user.json --rows 100

# Edge cases: min/max values, boundary conditions
foundrydata generate --schema user.json --rows 100 --scenario edge-cases

# Stress test: uncommon values, max arrays, near-boundary values
foundrydata generate --schema user.json --rows 100 --scenario stress-test

# Error conditions: invalid formats, missing required fields
foundrydata generate --schema user.json --rows 100 --scenario errors
```

## JSON Schema Version Support

| Version | Status | Notes |
|---------|--------|-------|
| **Draft-07** | ✅ Full Support | Primary version (OpenAPI 3.0 compatible) |
| **Draft 2019-09** | ✅ Full Support | Modern features (AsyncAPI compatible) |
| **Draft 2020-12** | ✅ Full Support | Latest stable (OpenAPI 3.1 compatible) |
| **Draft-04** | ❌ Not Supported | Legacy - Use migration: `npx swagger2openapi` |
| **Draft-06** | ⚠️ Partial | Works via Draft-07 compatibility |

## Target Persona & Business Context

### Primary User
**Frontend/Backend Developer at Small Startup**
- 2-5 years experience, 10-50 employee company
- **Pain point**: Wastes 2+ hours/week creating test fixtures
- **Budget**: €0-100/month for dev tools
- **Current solution**: Manual JSON files or broken Faker.js scripts
- **Trust factor**: Prefers open source tools

### Core Value Proposition
**"Stop wasting hours on test data that breaks your API. Generate 10,000 perfectly valid records in 1 second. Plus edge cases and stress tests that actually break things."**

### Philosophy
> "Do one thing well: Generate simple test data that actually matches the schema."

We'd rather support 10% of schemas perfectly than 100% of schemas poorly.

## Feature Support Matrix

### ✅ 100% Supported (v0.1)
```json
// Works perfectly - flat object with basic types
{
  "type": "object",
  "properties": {
    "id": {"type": "string", "format": "uuid"},
    "name": {"type": "string", "minLength": 1, "maxLength": 100},
    "age": {"type": "integer", "minimum": 18, "maximum": 99},
    "active": {"type": "boolean"},
    "role": {"type": "string", "enum": ["admin", "user", "guest"]},
    "tags": {
      "type": "array",
      "items": {"type": "string"},
      "minItems": 1, "maxItems": 5
    }
  },
  "required": ["id", "name"]
}
```

### ❌ NOT Supported (v0.1)
```json
// Won't work - has nested object in properties
{
  "type": "object",
  "properties": {
    "user": {
      "type": "object",  // ← NOPE! Nested in properties
      "properties": {"name": {"type": "string"}}
    }
  }
}
```

### ✅ Arrays of Flat Objects (Supported)
```json
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": {"type": "string"},
      "name": {"type": "string"}  // ← Flat objects only!
    }
  }
}
```

## Roadmap (If We Get Traction)

| Version | Timeline | Features | Requirement |
|---------|----------|----------|-------------|
| **v0.1** | Now | Basic types, CLI only, 100% compliance | MVP |
| **v0.2** | Month 2 | Pattern validation, additional formats | 100+ users |
| **v0.3** | Month 4 | Nested objects (1 level), CSV output, API | 10+ paying |
| **v1.0** | Month 6 | Full nested objects, schema composition | 25+ paying |

### Never (Too Complex for Solo Dev)
- Circular references, Custom plugins, GUI/Web interface, Multi-tenant SaaS

## Compliance Guarantee

### What we guarantee
- ✅ **100% schema compliance** for supported features
- ✅ **AJV strict mode validation**
- ✅ **Deterministic generation** with --seed parameter

### What we DON'T guarantee
- ❌ Realistic looking data (names might be "Lorem ipsum")
- ❌ Business logic validation (dates in chronological order)
- ❌ Performance for complex schemas
- ❌ Support for all JSON Schema features

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

### CRITICAL: Task Completion Protocol
**ALWAYS use the `/complete-task <id>` command when marking any TaskMaster task as complete.**
- NEVER manually use `task-master set-status --status=done` 
- ALWAYS use `/complete-task <id>` which runs all quality checks first
- Only mark tasks as complete after lint, typecheck, and tests pass
- This ensures code quality is maintained throughout development

## Testing Architecture v2.1 - Reference Documentation

**When working on testing tasks (tag: testing-v2), ALWAYS reference these comprehensive technical documents:**

### Core Testing References
- **`docs/tests/foundrydata-complete-testing-guide-en.ts.txt`** - Complete implementation guide with:
  - Exact Vitest configuration (platform-specific pools, deterministic settings)
  - Fast-check global configuration (seed=424242, environment-based numRuns)
  - AJV factory patterns for multi-draft support (draft-07, 2019-09, 2020-12)
  - Custom matchers implementation (toMatchJsonSchema, toBeDistinct, etc.)
  - Property-based testing patterns and arbitraries
  - Complete code examples and configuration files

- **`docs/tests/foundrydata-testing-architecture-doc-en.md`** - Testing philosophy and strategy:
  - Zero tolerance policy (100% compliance via AJV oracle)
  - Determinism-first approach (fixed seeds, no retries)
  - Multi-draft JSON Schema support strategy
  - Performance targets (percentiles: p50, p95, p99)
  - Testing patterns (invariant, metamorphic, stateful, oracle)
  - Environmental configuration and CI/CD pipeline requirements

### Key Implementation Principles from References
- **Fixed seed 424242** - Never use Date.now() or random seeds
- **AJV as single source of truth** - Cached singleton with WeakMap validators
- **No schema contradictions** - Use createBounds() helper, ensure required ⊆ properties
- **Platform-aware configuration** - Windows uses 'threads', others use 'forks'
- **Environment-driven settings** - TEST_SEED, FC_NUM_RUNS, SCHEMA_DRAFT variables
- **Percentile-based performance** - Use p95 targets, not averages

### When to Consult These References
- **Setup tasks (#1-#6)**: Configuration details and exact implementation patterns
- **Migration tasks (#19-#23)**: Specific migration strategies from existing patterns
- **Performance tasks (#9, #16)**: Benchmarking methodology and targets
- **CI/CD tasks (#10)**: Matrix testing configuration and environment setup

**These documents contain the precise technical specifications that complement the task orchestration.**

## JSON Schema Format Handling - Normative References

**When working with JSON Schema format validation across different drafts, ALWAYS reference these authoritative documents:**

### Primary Format Policy (Normative)
- **`docs/tests/policy_json_schema_formats_by_draft_v_2.md`** - The single source of truth for format behavior:
  - Definitive classification: **Assertive** (validation-error on mismatch) vs **Annotative** (no validation effect)
  - Cross-draft compatibility matrix for formats (draft-07, 2019-09, 2020-12)
  - Vendor format handling policy (`uuid`, `semver`, etc.)
  - Conformance gates and governance requirements
  - **MUST** be referenced for any format-related implementation or testing decisions

### Format Specification Reference (Non-normative)
- **`docs/tests/reference_json_schema_format_v_2.md`** - Technical specification explanation:
  - Comprehensive list of built-in formats by category (dates, email, URI, etc.)
  - RFC references and semantic definitions
  - Interoperability considerations and partial support policies
  - **Use for understanding format semantics, but defer to policy doc for behavioral decisions**

### Critical Implementation Rules
1. **Policy Precedence**: The policy document is normative; the reference doc is explanatory
2. **Draft-Aware Behavior**: Different JSON Schema drafts have different format rules - always check the policy matrix
3. **Assertive vs Annotative**: Never assume format validation behavior - consult the policy classification
4. **Vendor Format Handling**: Non-standard formats (like `uuid` in draft-07) follow special rules
5. **Unknown Format Degradation**: Unsupported formats MUST degrade to Annotative with logging

### When to Consult Format Documentation
- **Any format validation implementation** - Check policy for Assertive/Annotative behavior
- **Cross-draft compatibility work** - Verify format support across draft versions
- **AJV configuration** - Ensure format-assertion vocabulary is properly configured
- **Test case creation** - Understand which formats should/shouldn't cause validation failures
- **Vendor format support** - Check policy for non-standard format handling rules

**These documents ensure 100% schema compliance with deterministic behavior across all JSON Schema drafts.**

## ESLint and Code Quality Guidelines

**DO NOT blindly follow ESLint rules** - they are guidelines, not absolute laws. Use judgment based on context:

### When to IGNORE ESLint rules:
- **Critical components** (validators, parsers, core generators): Cohesion and performance matter more than arbitrary line limits
- **Performance-sensitive code**: Single-pass algorithms should not be split into multiple functions
- **Complex business logic**: Keep related logic together even if it exceeds line limits  
- **Generic utilities**: `any` types are appropriate for truly generic functions
- **Configuration objects**: Long option interfaces are acceptable and readable

### When to FOLLOW ESLint rules:
- **Simple utility functions**: Should be small and focused
- **UI components**: Usually benefit from smaller, composable pieces
- **Test files**: Can be more verbose and descriptive
- **Documentation**: Should be clear and concise

### Key principle:
**Optimize for readability, maintainability, and performance - not for ESLint compliance.** 
If a rule conflicts with good software engineering practices for the specific context, disable it with a comment explaining why.

### CRITICAL: No Hacks or Quick Fixes
**NEVER use TypeScript hacks like `as any`, `@ts-ignore`, or type assertions to bypass errors.**
- ❌ `(schema as any).type` - This masks real type system issues
- ❌ `// @ts-ignore` - This hides problems that need solving
- ❌ `value!` - Non-null assertions without proper validation

**When you encounter TypeScript errors, investigate systematically:**
1. **Check specification compliance** - Are types missing or incorrect per standards?
2. **Investigate both implementation AND tests** - Both can have issues simultaneously
3. **Validate against external standards** - Use Context7 to verify against official specs
4. **Fix all root causes** - Whether in implementation, tests, or both
5. **Use proper type guards** - Runtime checks with TypeScript narrowing when needed

**Debugging Approach: Systematic Investigation**
When facing TypeScript errors in tests:
1. **Verify specification compliance** - Do types match actual standards (JSON Schema, etc.)?
2. **Check implementation completeness** - Are interfaces/unions missing valid cases?
3. **Validate test correctness** - Are tests calling correct methods with valid data?
4. **Fix everything that's broken** - Don't compromise one to fix the other

**Example from this project:**
- ❌ Bad: `(schema as any).type` to bypass Schema union type error  
- ✅ Good: Fix both issues - Add missing `EnumSchema` interface AND correct test method calls
- 🔍 **Real issues**: Missing `EnumSchema` in Schema union + tests calling non-existent `generateFromEnum()`

**Philosophy**: TypeScript errors often reveal multiple issues. Fix them all properly rather than silencing symptoms.

## Code Quality

**ALWAYS maintain high code quality standards:**

### ESLint Integration
- **Run `npm run lint --fix` after editing any TypeScript/JavaScript files**
- Fix all ESLint errors before completing tasks
- Use `npm run lint:check` to validate without auto-fixing
- Follow project's ESLint configuration strictly

### Quality Gates
- All code changes must pass: `npm run typecheck`, `npm run lint`, `npm run test`
- Use the `task-ready` script for comprehensive validation
- Never commit code with linting errors or TypeScript errors
- Address quality issues immediately, not as technical debt

### Code Standards
- Maintain consistent formatting and style
- Follow existing code patterns and conventions
- Write clear, self-documenting code
- Ensure all functions and classes have proper TypeScript types