# Format Registry - AJV Integration Architecture Decision Record

**Status:** Accepted  
**Date:** 2025-08-29  
**Task:** #12 - Format Registry Integration Strategy  
**Context:** FoundryData Testing Architecture v2.1  

## Problem Statement

The codebase maintains two parallel format validation systems:
- **FormatRegistry**: Custom format generation and validation with 4 formats
- **AJV Formats**: Industry-standard JSON Schema validation with 17+ formats

This duplication creates maintenance overhead and potential inconsistencies in schema compliance validation.

## Context and Requirements

### Testing Architecture v2.1 Requirements
- **100% JSON Schema compliance** via AJV as single source of truth
- **Multi-draft support** (draft-07, 2019-09, 2020-12) per `ajv-factory.ts`
- **Deterministic behavior** aligned with Formats Policy v2.2
- **Backward compatibility** with existing FormatRegistry usage

### Current State Analysis
- **FormatRegistry strengths**: Extensible architecture, alias support, superior error messages, integrated generation
- **AJV advantages**: Industry standard, comprehensive format support, high performance, already used throughout codebase
- **Gap**: FormatRegistry provides generation capabilities that AJV lacks

## Decision

**Implement Adapter Pattern** bridging FormatRegistry generation capabilities with AJV validation standards.

### Implementation Strategy

#### Phase 1: Create Format Adapter
Create `test/helpers/format-adapter.ts` that:
- Maps FormatRegistry format names to AJV format specifications
- Routes all validation calls through AJV instances from `ajv-factory.ts`
- Preserves FormatRegistry's generation and UX features
- Extends supported formats using AJV's comprehensive format set

#### Phase 2: Integration Points
- Update existing tests to use adapter for validation
- Maintain FormatRegistry for generation workflows
- Ensure compliance with Formats Policy v2.2 (Assertive vs Annotative)

## Rationale

1. **Preserve Investment**: Keeps FormatRegistry's superior UX and generation capabilities
2. **Gain Compliance**: Leverages AJV's proven JSON Schema validation
3. **Expand Coverage**: Gains 17+ formats vs current 4 formats
4. **Maintain Compatibility**: No breaking changes to existing code
5. **Single Source of Truth**: AJV becomes the validation authority

## Consequences

### Positive
- ✅ 100% JSON Schema compliance via AJV
- ✅ Expanded format support (uuid, email, date, date-time, uri, ipv4, ipv6, etc.)
- ✅ Alignment with testing architecture v2.1
- ✅ Preserved FormatRegistry UX (aliases, error suggestions)
- ✅ Backward compatibility maintained

### Negative
- ⚠️ Additional abstraction layer (minimal complexity)
- ⚠️ Potential performance overhead (negligible with caching)

### Migration Path
- **Phase 1**: Implement adapter without breaking changes
- **Phase 2**: Gradually migrate tests to use adapter
- **Phase 3**: Consider FormatRegistry deprecation if generation capabilities are no longer needed

## Implementation References

- **AJV Factory**: `test/helpers/ajv-factory.ts` - Multi-draft AJV instances
- **Formats Policy**: `docs/tests/policy_json_schema_formats_by_draft_v_2.md` - Format behavior specification
- **Testing Guide**: `docs/tests/foundrydata-complete-testing-guide-en.ts.txt` - Implementation patterns
- **FormatRegistry**: `packages/core/src/registry/format-registry.ts` - Current implementation

## Future Tasks

Tasks implementing this decision should:
1. Reference this ADR for context
2. Use `ajv-factory.ts` for AJV instances
3. Follow Formats Policy v2.2 for format behavior
4. Maintain FormatRegistry interface compatibility
5. Extend test coverage for new formats

---

*This ADR documents the architectural decision for Task #12 and should be referenced by subsequent implementation tasks.*