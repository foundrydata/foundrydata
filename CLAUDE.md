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