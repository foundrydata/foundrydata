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

## MVP Architecture Context
**Review the MVP architecture document to understand the project structure and implementation guidelines.**
@./../foundrydata-strategy/MVP/foundrydata-architecture.md

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

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