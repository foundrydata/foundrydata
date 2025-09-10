# Error and Diagnostics Documentation

Comprehensive catalog of error codes, diagnostic messages, and troubleshooting information for FoundryData.

## 📋 Diagnostic Code Reference {#diagnostic-code-reference}

### Code Classification System

| Code Range      | Type    | Severity | Description                                                      |
| --------------- | ------- | -------- | ---------------------------------------------------------------- |
| **E001-E799**   | Error   | Error    | Blocking errors that prevent successful generation               |
| **W001-W999**   | Warning | Warning  | Issues that may affect quality but don't block generation        |
| **N001-N999**   | Note    | Info     | Informational diagnostics about processing decisions             |
| **Named Codes** | Various | Various  | Semantic diagnostic names (e.g., `AP_FALSE_INTERSECTION_APPROX`) |

### V2.2 Diagnostic Code Mapping

| Numeric Code | Named Code                                | Description                                                       |
| ------------ | ----------------------------------------- | ----------------------------------------------------------------- |
| `E012`       | `EXTERNAL_REF_UNRESOLVED`                  | External `$ref` cannot be dereferenced (no network); Strict=error, Lax=warn |
| `E311`       | `CONTAINS_UNSAT_BY_SUM`                   | Contains needs exceed maxItems capacity                           |
| `E550`       | `UNSAT_BUDGET_EXHAUSTED`                  | No repair progress after configured cycles                        |
| `E221`       | `UNSAT_PATTERN_PNAMES`                    | Pattern properties incompatible with property names               |
| `E222`       | `UNSAT_DEPENDENT_REQUIRED_AP_FALSE`       | Dependent required properties cannot be satisfied with AP\:false  |
| `N210`       | `COMPLEXITY_CAP_ONEOF`                    | OneOf branch selection degraded due to complexity                 |
| `N211`       | `COMPLEXITY_CAP_ANYOF`                    | AnyOf branch selection degraded due to complexity                 |
| `N212`       | `COMPLEXITY_CAP_PATTERNS`                 | Pattern overlap analysis skipped                                  |
| `N213`       | `COMPLEXITY_CAP_ENUM`                     | Enum cardinality exceeded limits                                  |
| `N214`       | `COMPLEXITY_CAP_CONTAINS`                 | Contains bag size exceeded limits                                 |
| `N215`       | `COMPLEXITY_CAP_SCHEMA_SIZE`              | Schema byte size exceeded limits                                  |
| `W100`       | `PERFORMANCE_DEGRADED`                    | Generation performance below SLO targets                          |
| `W101`       | `REPAIR_RATE_HIGH`                        | High repair rate indicates generation issues                      |
| `N001`       | `DYNAMIC_PRESENT`                         | Schema contains dynamic references                                |
| `N002`       | `RAT_FALLBACK_DECIMAL`                    | Rational arithmetic fell back to decimal                          |
| `N003`       | `RAT_FALLBACK_FLOAT`                      | Rational arithmetic fell back to float aligned with AJV tolerance |
| `N004`       | `RAT_LCM_BITS_CAPPED`                     | LCM calculation exceeded bit length limits                        |
| `N005`       | `RAT_DEN_CAPPED`                          | Rational denominator exceeded configured cap                      |
| `N006`       | `TRIALS_SKIPPED_LARGE_ONEOF`              | Branch trials skipped due to large oneOf                          |
| `N007`       | `AP_FALSE_INTERSECTION_APPROX`            | Pattern recognition approximated for AP\:false                    |
| `N008`       | `CONTAINS_BAG_COMBINED`                   | Multiple contains constraints combined into bag                   |
| `N009`       | `IF_REWRITE_DOUBLE_NOT`                   | Conditional rewritten using double negation                       |
| `N010`       | `IF_REWRITE_SKIPPED_UNEVALUATED`          | Conditional rewrite skipped due to unevaluated properties         |
| `N011`       | `PNAMES_COMPLEX`                          | Complex propertyNames not rewritten                               |
| `N012`       | `DEPENDENCY_GUARDED`                      | Dependency rewriting guarded by unevaluated properties            |
| `N013`       | `DEFS_TARGET_MISSING`                     | Reference target not found in definitions                         |
| `N014`       | `EXCLMIN_IGNORED_NO_MIN`                  | exclusiveMinimum\:true ignored without paired minimum             |
| `N015`       | `EXCLMAX_IGNORED_NO_MAX`                  | exclusiveMaximum\:true ignored without paired maximum             |
| `N016`       | `OAS_NULLABLE_KEEP_ANNOT`                 | OpenAPI nullable kept as annotation                               |
| `N017`       | `NOT_DEPTH_CAPPED`                        | Nested not depth exceeded configured limit                        |
| `N042`       | `SCHEMA_SMELL_UNTYPED_NUMERIC`            | Untyped numeric constraints (schema smell)                        |
| `N043`       | `IF_AWARE_HINT_APPLIED`                   | Conditional generation hints successfully applied                 |
| `N044`       | `IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO` | Conditional hints skipped due to insufficient context             |
| —            | `IF_REWRITE_DISABLED_ANNOTATION_RISK`     | If/then/else rewrite disabled due to annotation propagation risk  |
| —            | `ANNOTATION_IN_SCOPE_IF_REWRITE_SKIPPED`  | If/then/else rewrite skipped because annotations are in scope     |

## 📊 Diagnostics Catalog {#diagnostics-catalog}

### Invariants

* **Stable Error Codes**: Error codes remain consistent across versions for programmatic handling
* **Human-Readable Messages**: Every error includes clear, actionable description
* **Structured Information**: Errors contain structured details for debugging
* **Hierarchical Organization**: Errors organized by pipeline stage and severity

### Algorithm

1. **Error Classification** - Categorize errors by type (parse, validation, generation, etc.)
2. **Code Assignment** - Assign stable, unique codes to each error condition
3. **Message Generation** - Create clear, actionable error messages
4. **Context Preservation** - Include relevant context (schema path, values, etc.)

### Example

```javascript
// Structured diagnostic with stable code
{
  "errorCode": "N042",
  "type": "SCHEMA_SMELL_UNTYPED_NUMERIC",
  "message": "Numeric constraints used without explicit 'type'",
  "details": {
    "schemaPath": "/$defs/User",
    "suggestion": "Consider adding 'type': 'number' or 'integer'"
  },
  "severity": "note"
}
```

### Diagnostics

* **Error Frequency**: Most common error codes encountered
* **Resolution Success**: Which errors are successfully resolved vs require user action
* **Context Quality**: How often error context leads to successful debugging

## 🏗️ Parse Errors (E001-E099) {#parse-errors}

### Schema Structure Errors

**E001: INVALID\_JSON\_SCHEMA**

* **Description**: Schema is not valid JSON or doesn't conform to JSON Schema specification
* **Algorithm**: JSON parsing → JSON Schema structure validation
* **Example**: `{ "typ": "string" }` (typo in 'type')
* **Resolution**: Fix schema structure, validate against JSON Schema meta-schema

**E002: UNSUPPORTED\_DRAFT**

* **Description**: JSON Schema draft version not supported
* **Algorithm**: `$schema` field analysis → supported draft check
* **Example**: `{ "$schema": "http://json-schema.org/draft-03/schema#" }`
* **Resolution**: Upgrade schema to supported draft (07, 2019-09, 2020-12)

### Reference Resolution Errors

**E010: EXTERNAL\_REF\_NOT\_ALLOWED**

* **Description**: External `$ref` not supported in current mode
* **Algorithm**: `$ref` analysis → external reference detection
* **Example**: `{ "$ref": "https://example.com/schema.json" }`
* **Resolution**: Switch to lax mode (policy: `failFast.externalRefStrict: 'warn'|'ignore'`)
  or vendor-resolve external refs offline before running.
  Remote dereferencing is not supported.

**E011: REF\_RESOLUTION\_FAILED**

* **Description**: `$ref` could not be resolved to target schema
* **Algorithm**: Reference following → target existence check
* **Example**: `{ "$ref": "#/$defs/NonExistent" }`
* **Resolution**: Ensure referenced schema exists or fix reference path

## 🔄 Normalization Errors (E100-E199) {#normalization-errors}

### Draft Conversion Issues

**E100: DRAFT\_CONVERSION\_FAILED**

* **Description**: Unable to convert schema to canonical 2020-12 form
* **Algorithm**: Draft-specific transformation → compatibility check
* **Example**: Complex draft-04 exclusive minimum without paired minimum
* **Resolution**: Simplify schema or use draft-specific features properly

**E101: CONDITIONAL\_REWRITE\_BLOCKED**

* **Description**: If/then/else rewrite blocked by unevaluated properties
* **Algorithm**: Conditional analysis → unevaluated scope check
* **Example**: Schema with `unevaluatedProperties` and complex conditionals
* **Resolution**: Simplify conditionals or remove unevaluated constraints

### Property Dependencies

**E110: DEPENDENCY\_CONFLICT**

* **Description**: Property dependencies create unsatisfiable constraints
* **Algorithm**: Dependency graph analysis → constraint satisfaction check
* **Example**: Circular dependencies between required properties
* **Resolution**: Simplify dependency structure or remove conflicts

## 🧩 Composition Errors (E200-E299) {#composition-errors}

### Constraint Conflicts

**E200: UNSAT\_NUMERIC\_BOUNDS**

* **Description**: Numeric constraints create impossible range
* **Algorithm**: Bound intersection → feasibility check
* **Example**: `{ "minimum": 10, "maximum": 5 }`
* **Resolution**: Fix constraint values to create valid range

**E201: UNSAT\_STRING\_LENGTH**

* **Description**: String length constraints create impossible requirements
* **Algorithm**: Length constraint intersection → feasibility check
* **Example**: `{ "minLength": 10, "maxLength": 5 }`
* **Resolution**: Adjust length constraints to valid range

**E202: UNSAT\_ARRAY\_SIZE**

* **Description**: Array size constraints create impossible requirements
* **Algorithm**: Array size constraint analysis → feasibility check
* **Example**: `{ "minItems": 5, "maxItems": 2 }`
* **Resolution**: Fix array size constraints

### Type Conflicts

**E210: DISJOINT\_TYPES**

* **Description**: `allOf` specifies incompatible types
* **Algorithm**: Type intersection → compatibility check
* **Example**: `{ "allOf": [{ "type": "string" }, { "type": "number" }] }`
* **Resolution**: Use `anyOf` or `oneOf` for alternative types

**E211: EMPTY\_ENUM\_INTERSECTION**

* **Description**: Enum constraints result in empty set
* **Algorithm**: Enum value intersection → empty set check
* **Example**: `{ "allOf": [{ "enum": ["a"] }, { "enum": ["b"] }] }`
* **Resolution**: Ensure enum intersections are non-empty

### Pattern Conflicts

**E220: PATTERN\_PROPERTY\_CONFLICT**

* **Description**: Pattern properties create conflicting requirements
* **Algorithm**: Pattern overlap analysis → conflict detection
* **Example**: Overlapping patterns with incompatible schemas
* **Resolution**: Resolve pattern overlaps or make schemas compatible

**E221: UNSAT\_PATTERN\_PNAMES** (`UNSAT_PATTERN_PNAMES`)

* **Description**: Pattern properties incompatible with property names
* **Algorithm**: Pattern matching → property name validation
* **Example**: `propertyNames` enum incompatible with `patternProperties`
* **Resolution**: Align property name constraints with patterns

**E222: UNSAT\_DEPENDENT\_REQUIRED\_AP\_FALSE** (`UNSAT_DEPENDENT_REQUIRED_AP_FALSE`)

* **Description**: Dependent required properties cannot be satisfied with additionalProperties\:false
* **Algorithm**: Must-cover intersection analysis → dependent requirement check
* **Example**: `dependentRequired` needs property not covered by any `additionalProperties:false` conjunct
* **Resolution**: Ensure dependent properties are covered by properties/patternProperties

## 🏭 Generation Errors (E300-E399) {#generation-errors}

### Value Generation Failures

**E300: GENERATION\_TIMEOUT**

* **Description**: Unable to generate valid value within time/attempt limits
* **Algorithm**: Generation loop → timeout/attempt counter
* **Example**: Extremely restrictive constraints making valid values rare
* **Resolution**: Relax constraints or increase generation budget

**E301: FORMAT\_GENERATION\_FAILED**

* **Description**: Unable to generate value matching required format
* **Algorithm**: Format-specific generation → validation check
* **Example**: Custom format with no registered generator
* **Resolution**: Register format generator or use standard formats

**E302: ENUM\_TYPE\_MISMATCH**

* **Description**: Enum values don't match specified type
* **Algorithm**: Enum value analysis → type compatibility check
* **Example**: `{ "type": "number", "enum": ["string", "value"] }`
* **Resolution**: Ensure enum values match type constraint

### Constraint Satisfaction Errors

**E310: UNIQUEITEMS\_IMPOSSIBLE**

* **Description**: Cannot generate required array length with unique items
* **Algorithm**: Array generation → uniqueness constraint check
* **Example**: `{ "minItems": 10, "uniqueItems": true, "items": { "enum": ["a"] }`
* **Resolution**: Increase enum options or reduce minItems

**E311: CONTAINS\_UNSAT\_BY\_SUM** (`CONTAINS_UNSAT_BY_SUM`)

* **Description**: Contains bag needs cannot be satisfied - sum of minimum contains exceeds maxItems
* **Algorithm**: Contains bag analysis → capacity check (`sum(min_i) > maxItems`)
* **Example**: `{ "allOf": [{"contains": {"type": "string"}, "minContains": 5}, {"contains": {"type": "number"}, "minContains": 4}], "maxItems": 7 }`
* **Resolution**: Reduce minContains values or increase maxItems capacity

## 🔧 Repair Errors (E400-E499, E550) {#repair-errors}

### Repair Process Failures

**E400: REPAIR\_BUDGET\_EXHAUSTED**

* **Description**: Repair attempts exceeded configured limit
* **Algorithm**: Repair loop → budget counter → exhaustion check
* **Example**: Complex schema requiring many repair iterations
* **Resolution**: Increase repair budget or simplify schema

**E550: UNSAT\_BUDGET\_EXHAUSTED** (`UNSAT_BUDGET_EXHAUSTED`)

* **Description**: No repair progress after configured cycles - schema may be unsatisfiable
* **Algorithm**: Repair stagnation tracking → progress analysis → bailout
* **Example**: Schema with contradictory constraints causing repair oscillation
* **Resolution**: Review schema for constraint conflicts or increase `complexity.bailOnUnsatAfter`

**E401: REPAIR\_OSCILLATION**

* **Description**: Repair process stuck in cycle, not converging
* **Algorithm**: Repair state tracking → cycle detection
* **Example**: Conflicting constraints causing repair loop
* **Resolution**: Fix constraint conflicts in schema

**E402: IRREPARABLE\_VIOLATION**

* **Description**: Validation error cannot be repaired automatically
* **Algorithm**: Error analysis → repair strategy lookup → failure
* **Example**: Structural schema violations requiring regeneration
* **Resolution**: Improve generation logic or handle edge case

### Repair Strategy Errors

**E410: UNKNOWN\_KEYWORD\_REPAIR**

* **Description**: No repair strategy available for validation error keyword
* **Algorithm**: AJV error analysis → repair registry lookup
* **Example**: Custom validation keyword without repair handler
* **Resolution**: Register repair handler for custom keywords

## 🎯 Validation Errors (E500-E599) {#validation-errors}

### AJV Validation Failures

**E500: VALIDATION\_FAILED**

* **Description**: Generated data failed final AJV validation
* **Algorithm**: AJV validation → error collection → failure
* **Example**: Generated data doesn't satisfy original schema
* **Resolution**: This indicates bug in generation/repair - report issue

**E501: VALIDATOR\_COMPILATION\_FAILED**

* **Description**: AJV failed to compile schema for validation
* **Algorithm**: AJV compilation → error handling
* **Example**: Schema contains AJV-incompatible features
* **Resolution**: Fix schema compatibility or update AJV version

## ⚙️ Configuration Errors (E600-E699) {#configuration-errors}

### Option Validation

**E600: INVALID\_OPTION\_VALUE**

* **Description**: Configuration option has invalid value
* **Algorithm**: Option validation → type/range checking
* **Example**: `{ maxRatBits: -1 }` (negative value)
* **Resolution**: Use valid option values per documentation

**E601: CONFLICTING\_OPTIONS**

* **Description**: Configuration options conflict with each other
* **Algorithm**: Cross-option validation → conflict detection
* **Example**: `strict: true` with unsupported features enabled
* **Resolution**: Use compatible option combinations

## 💾 System Errors (E700-E799) {#system-errors}

### Resource and Runtime Errors

**E700: MEMORY\_LIMIT\_EXCEEDED**

* **Description**: Generation exceeded available memory
* **Algorithm**: Memory monitoring → threshold check
* **Example**: Very large schema or batch size
* **Resolution**: Reduce batch size or increase memory limits

**E701: COMPILATION\_CACHE\_FULL**

* **Description**: Schema compilation cache reached capacity
* **Algorithm**: Cache size monitoring → limit check
* **Example**: Too many unique schemas processed
* **Resolution**: Increase cache size or restart process

**E799: INTERNAL\_ERROR**

* **Description**: Unexpected internal error occurred
* **Algorithm**: Exception handling → error wrapping
* **Example**: Programming error or unexpected condition
* **Resolution**: Report bug with reproduction steps

## 📋 Diagnostic Notes (N001-N999) {#diagnostic-notes}

### Informational Diagnostics

**N001: DYNAMIC\_PRESENT**

* **Description**: Schema contains dynamic references
* **Severity**: Note
* **Impact**: Conservative generation behavior

**N002: RAT\_FALLBACK\_DECIMAL**

* **Description**: Rational arithmetic fell back to decimal
* **Severity**: Note
* **Impact**: Potential precision loss in multipleOf

**N003: RAT\_FALLBACK\_FLOAT**

* **Description**: Rational arithmetic fell back to float aligned with AJV tolerance
* **Severity**: Note
* **Impact**: Potential precision loss in multipleOf

**N004: RAT\_LCM\_BITS\_CAPPED**

* **Description**: LCM calculation exceeded bit length limits
* **Severity**: Note
* **Impact**: Fallback to decimal arithmetic for multipleOf intersection

**N005: RAT\_DEN\_CAPPED**

* **Description**: Rational denominator exceeded configured cap
* **Severity**: Note
* **Impact**: Fallback to decimal or float arithmetic

**N006: TRIALS\_SKIPPED\_LARGE\_ONEOF**

* **Description**: Branch trials skipped due to large oneOf
* **Severity**: Note
* **Impact**: Score-only selection applied instead of trials

**N007: AP\_FALSE\_INTERSECTION\_APPROX**

* **Description**: Pattern recognition approximated for additionalProperties\:false
* **Severity**: Note
* **Impact**: Conservative property generation, may generate fewer properties

**N008: CONTAINS\_BAG\_COMBINED**

* **Description**: Multiple contains constraints combined into bag
* **Severity**: Note
* **Impact**: Independent needs tracked for array generation

**N009: IF\_REWRITE\_DOUBLE\_NOT**

* **Description**: Conditional rewritten using double negation for safety
* **Severity**: Note
* **Impact**: Schema transformed to anyOf with nested not clauses

**N010: IF\_REWRITE\_SKIPPED\_UNEVALUATED**

* **Description**: Conditional rewrite skipped due to unevaluated properties in scope
* **Severity**: Note
* **Impact**: Schema kept as-is, conditional handled during generation/repair

**N011: PNAMES\_COMPLEX**

* **Description**: Complex propertyNames not rewritten due to safety concerns
* **Severity**: Note
* **Impact**: propertyNames handled during generation phase

**N012: DEPENDENCY\_GUARDED**

* **Description**: Dependency rewriting guarded by unevaluated properties
* **Severity**: Note
* **Impact**: Dependencies preserved for generation phase handling

**N013: DEFS\_TARGET\_MISSING**

* **Description**: Reference target not found in definitions/\$defs
* **Severity**: Note
* **Impact**: Reference preserved as-is, may cause generation issues

**N014: EXCLMIN\_IGNORED\_NO\_MIN**

* **Description**: exclusiveMinimum\:true ignored without paired minimum
* **Severity**: Note
* **Impact**: Draft-04 boolean exclusive ignored per spec compliance

**N015: EXCLMAX\_IGNORED\_NO\_MAX**

* **Description**: exclusiveMaximum\:true ignored without paired maximum
* **Severity**: Note
* **Impact**: Draft-04 boolean exclusive ignored per spec compliance

**N016: OAS\_NULLABLE\_KEEP\_ANNOT**

* **Description**: OpenAPI nullable kept as annotation rather than type union
* **Severity**: Note
* **Impact**: nullable handling deferred to generation phase

**N017: NOT\_DEPTH\_CAPPED**

* **Description**: Nested not depth exceeded configured limit
* **Severity**: Note
* **Impact**: Deep nesting prevented to avoid exponential complexity

**N042: SCHEMA\_SMELL\_UNTYPED\_NUMERIC**

* **Description**: Numeric constraints used without explicit `"type": "number"|"integer"`
* **Severity**: Note
* **Impact**: Type inference may be ambiguous for generation planning

**N043: IF\_AWARE\_HINT\_APPLIED**

* **Description**: Conditional generation hints successfully applied
* **Severity**: Note
* **Impact**: Generation tailored based on condition evaluation

**N044: IF\_AWARE\_HINT\_SKIPPED\_INSUFFICIENT\_INFO**

* **Description**: Conditional hints skipped due to insufficient context
* **Severity**: Note
* **Impact**: Default generation behavior applied

### Named-only Diagnostics

**IF\_REWRITE\_DISABLED\_ANNOTATION\_RISK** {#if-rewrite-disabled-annotation-risk}

* **Description**: If/then/else rewrite disabled due to annotation propagation risk
* **Severity**: Note
* **Impact**: Conservatively avoids rewriting when annotations might leak or change semantics

**ANNOTATION\_IN\_SCOPE\_IF\_REWRITE\_SKIPPED** {#annotation-in-scope-if-rewrite-skipped}

* **Description**: If/then/else rewrite skipped because annotations are in scope
* **Severity**: Note
* **Impact**: Keeps original conditional to preserve annotation behavior

### Performance Diagnostics

**W100: PERFORMANCE\_DEGRADED**

* **Description**: Generation performance below SLO targets
* **Severity**: Warning
* **Impact**: Slower than expected generation

**W101: REPAIR\_RATE\_HIGH**

* **Description**: High repair rate indicates generation issues
* **Severity**: Warning
* **Impact**: Performance impact from excessive repairs

## 🛠️ Troubleshooting Guide {#troubleshooting-guide}

### Common Issue Resolution

**Schema Validation Failures**

1. Validate schema against JSON Schema meta-schema
2. Check for typos in keyword names
3. Ensure proper nesting of schema objects
4. Verify type constraints match value constraints

**Generation Performance Issues**

1. Check for extremely restrictive constraints
2. Consider using larger generation budgets
3. Simplify complex pattern properties
4. Use enum when possible instead of complex constraints

**Memory Usage Problems**

1. Reduce batch size for large generations
2. Clear compilation cache periodically
3. Avoid deeply nested schemas
4. Monitor memory usage with `--print-metrics`

**Determinism Issues**

1. Ensure same seed used across runs
2. Check for platform-specific dependencies
3. Verify no global state interference
4. Use fixed Node.js version for consistency
**E012: EXTERNAL\_REF\_UNRESOLVED** (`EXTERNAL_REF_UNRESOLVED`)

* Description: External `$ref` cannot be dereferenced (no network I/O). Severity depends on mode.
  - Strict: Error (default). Generation aborts.
  - Lax: Warning. Generation attempts proceed using only local constraints; final AJV validation may fail.
* Algorithm: `$ref` analysis → detect external target → apply policy (`failFast.externalRefStrict`) → emit diagnostic
* Example: `{ "$ref": "https://example.com/schemas/address.json" }`
* Resolution: Replace with in‑document refs, vendor-resolve externally before running, or adjust policy to `warn`/`ignore` understanding validation may still fail.
