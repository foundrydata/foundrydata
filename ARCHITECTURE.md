# FoundryData Architecture

## Core Principles
- Functional Core, Imperative Shell
- Result<T,E> pattern (no exceptions in core)
- Registry pattern for extensibility
- Zero side effects in business logic

## Structure
```
foundrydata/
├── packages/
│   ├── core/                    # Domain logic (zero dependencies)
│   │   ├── src/
│   │   │   ├── generator/       # Generation engine
│   │   │   ├── validator/       # Schema validation
│   │   │   ├── parser/          # Schema parsing
│   │   │   ├── registry/        # Extensibility
│   │   │   └── types/           # Core types
│   │   └── package.json
│   │
│   ├── cli/                     # CLI application
│   │   ├── src/
│   │   │   ├── commands/        # CLI commands
│   │   │   └── utils/           # CLI utilities
│   │   └── package.json
│   │
│   └── shared/                  # Shared utilities
│       └── src/
│           ├── types/           # Shared types
│           └── utils/           # Shared utilities
```

## Extension Points
- Format Registry: Add custom formats
- Type Registry: Add custom types
- Validator Registry: Add custom validators

## Key Design Decisions
- **Result<T,E> Pattern**: All operations return Result types instead of throwing exceptions
- **Registry Pattern**: Extensible format and type system
- **Modular Structure**: Clear separation of concerns with dependency injection
- **Type Safety**: Comprehensive TypeScript with branded types
- **Pipeline Architecture**: Parse → Validate → Generate → Verify → Format