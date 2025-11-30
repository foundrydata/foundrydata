# FoundryData Comprehensive Feature Support

> **Status**: Aligned with [Feature Support Simplification Plan](spec-canonical-json-schema-generator.md) — see Controlled Limitations / Known Limits for the remaining guarded areas.

## JSON Schema Features - Comprehensive Support

### ✅ Core Logic & Composition
- **`allOf`** - Domain-aware merging with type intersection, exact rational arithmetic  
- **`anyOf` / `oneOf`** - Deterministic branch selection with discriminant-first scoring
- **`not`** - Schema inversion with complexity guards and depth capping
- **Early unsat detection** - Short-circuit impossible schemas before generation

### ✅ Conditionals & Smart Generation  
- **`if` / `then` / `else`** - If-aware-lite strategy with configurable satisfaction levels
- **Safe rewriting** - Optional double-negation transform with strict annotation guards  
- **Conservative generation** - Pre-evaluate conditions on partial instances, minimal backtracking

### ✅ Advanced Object Features
- **`properties` / `patternProperties`** - Anchored-safe pattern coverage with overlap analysis; under `AP:false`, unsafe/non-anchored or complexity-capped patterns trigger Strict fail-fast (Lax warns) when presence pressure holds, otherwise they remain gating-only
- **`additionalProperties`** - Must-cover intersection algorithm for `false` across `allOf`
- **`unevaluatedProperties`** - Conservative effective view, preserved for AJV validation
- **`propertyNames`** - Pattern-based key validation; when §7 preconditions hold (no `unevaluated*` in scope, permissive/empty `additionalProperties`, anchored-safe & non-capped patterns) the normalizer emits `PNAMES_REWRITE_APPLIED` and injects synthetic anchored-safe `patternProperties` plus canonical `additionalProperties:false` for coverage/must-cover only (original schema unchanged); otherwise gating-only for must-cover
- **`dependencies` / `dependentRequired` / `dependentSchemas`** - Full dependency support with guards

### ✅ Advanced Array Features  
- **`prefixItems` / `items` / `additionalItems`** - Full tuple support with implicit max length
- **`contains` / `minContains` / `maxContains`** - Bag semantics across `allOf` with independent needs
- **`uniqueItems`** - Structural hashing with collision detection and contains re-satisfaction

### ✅ Numeric Precision & Exact Arithmetic
- **`multipleOf`** - Exact rational arithmetic with configurable bit-length caps
- **Rational fallbacks** - Decimal quantization or float alignment when caps exceeded  
- **Bounds handling** - `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`
- **Performance protection** - Configurable caps prevent arithmetic explosion

### ✅ Schema Organization & References
- **`$ref`** - In-document references with cycle detection; core blocks remote deref unless the pre-pipeline resolver extension is enabled (Compose/Validate stay offline); Lax can skip final validation with a diagnostic when remote refs remain unresolved
- **`$recursiveRef` / `$recursiveAnchor`** - Pass-through for AJV (Draft 2019-09)
- **`$dynamicRef` / `$dynamicAnchor`** - Bounded in-document scope resolution (conservative) with AJV pass-through for validation  
- **`definitions` / `$defs`** - Legacy and modern support with normalization
- **`$id`** - Schema identifiers with cache integration

### ✅ String Formats & Patterns
- **Standard formats**: `email`, `uri`, `uuid`, `date-time` with optional validation
- **Regex patterns**: Basic to moderate complexity with Unicode support and ReDoS protection; compose performs a global `RegExp('u')` preflight and emits non-fatal `REGEX_COMPILE_ERROR{context:'preflight'}` diagnostics for un-compilable patterns
- **Format behavior**: Draft-aware (Assertive vs Annotative) with policy compliance

### ⚠️ Controlled Limitations

These features have **configurable behavior** rather than hard blocks:

- **External `$ref`** - Core: error on remote; optional pre-pipeline resolver extension enables cached/allowlisted HTTP(S) with warn/error policy; Compose/Validate remain offline and Lax may skip final validation with a diagnostic when refs stay unresolved
- **Complex regex patterns** - Heuristic generation with safety limits, configurable ReDoS protection
- **Deep schema nesting** - Configurable complexity caps trigger graceful degradation  
- **Large compositions** - Complexity caps (200+ oneOf branches, 500+ anyOf branches, 10K+ enum values)

### ❌ Not Supported (By Design)

- **Remote `$ref` without the resolver extension** - Security/offline core requirement
- **Draft-04 exclusive features** - Use `npx swagger2openapi` for migration  
- **`$data` references** - Not part of JSON Schema specification
- **`contentSchema`** - Out of scope for test data generation

### Known Limits (per spec)
- Under `AP:false`, unsafe or complexity-capped patterns used for must-cover trigger Strict fail-fast and Lax warnings when presence pressure holds; raw `propertyNames.pattern` remains gating-only unless rewritten.
- `$dynamicRef/$dynamicAnchor` handled conservatively with bounded in-document binding; validation relies on AJV.
- External deref beyond the resolver extension stays disabled by default.

### Coverage-aware behavior (V1)

Coverage-aware features build on top of the same JSON Schema support and invariants described above. They reuse the existing pipeline and AJV as oracle, and introduce a coverage model with dimensions and targets:

- **Dimensions & targets**
  - Coverage is organised by dimensions such as `structure`, `branches`, `enum`, `boundaries` and `operations`. These dimensions project over existing behavior:
    - `structure` reuses object/array composition (allOf, additionalProperties, prefixItems/items/contains),
    - `branches` builds targets for `anyOf`/`oneOf` decisions,
    - `enum` tracks which enum values are exercised,
    - `boundaries` (M2) focuses on min/max constraints for numbers, strings and arrays,
    - `operations` (OpenAPI) projects targets onto operation keys.
  - `dimensionsEnabled` selects which coverage dimensions are active for a given run: only the listed dimensions materialise `CoverageTarget` entries and participate in metrics for that run. Turning a dimension on or off does not renumber existing targets in other dimensions; for a given dimension, IDs remain stable as long as `(canonical schema, options, seed, AJV posture, registryFingerprint)` stays the same.

- **AP:false & must-cover**
  - Under `additionalProperties:false`, the coverage layer consumes the existing must-cover/CoverageIndex semantics: `PROPERTY_PRESENT` targets for undeclared names are only considered under AP:false when backed by `CoverageIndex.has`/`CoverageIndex.enumerate`.
  - When presence pressure holds but CoverageIndex proves emptiness, targets are treated as unreachable or remain uncovered rather than being “guessed” as covered.

- **Arrays, contains and conditionals**
  - Coverage for `contains`/`minContains`/`maxContains` builds on bag semantics across `allOf`; targets reflect bagged needs and unsat diagnostics (`CONTAINS_UNSAT_BY_SUM`) rather than redefining array semantics.
  - Conditionals (`if`/`then`/`else`) contribute to branch and property presence targets but still follow the same if-aware-lite strategy and safe rewrite rules as described above.

- **Boundaries and operations**
  - Boundaries coverage (M2) adds targets around documented min/max-style constraints without changing validation behavior; when disabled, those targets remain absent from metrics but the underlying constraints still apply.
  - Operations coverage for OpenAPI projects existing schema-level targets and dedicated `OP_REQUEST_COVERED` / `OP_RESPONSE_COVERED` entries onto operation keys; it reuses the same schemas and AJV posture as the core engine.

- **Diagnostic-only targets**
  - Some coverage targets, such as `SCHEMA_REUSED_COVERED`, are emitted purely for diagnostics/insight and use `status:'deprecated'`. These targets never contribute to coverage denominators or thresholds (`minCoverage`) even when present in `targets` / `uncoveredTargets`.

For full details of the coverage model, dimensions and reports, see the coverage-aware V1 specification and the dedicated coverage sections in `Invariants.md`, `ARCHITECTURE.md` and the coverage docs.

## 5-Stage Pipeline Architecture

**Core Flow**: `Normalize → Compose → Generate → Repair → Validate`

### Stage Benefits
1. **Normalize**: Draft-aware canonicalization with pointer mapping
2. **Compose**: Domain-aware merging with complexity protection  
3. **Generate**: Smart conditional handling with if-aware-lite
4. **Repair**: AJV-driven corrections with budgets and stagnation guards
5. **Validate**: Final compliance check against original schema

## Performance & Complexity Management

### Automatic Protection
- **Complexity caps** trigger graceful degradation (not hard failures)
- **Budget guards** prevent infinite repair loops
- **Memory bounds** with size-gated hashing and LRU caching
- **Performance metrics** track validations/row, repair passes/row

### SLO/SLI Targets (documented guidance)
- **Bench gate (CI)**: `p95LatencyMs ≤ 120ms`, `memoryPeakMB ≤ 512MB` per profile
- **Pathological schemas**: Degradation paths engaged with clear diagnostics
- **Memory & validations**: Track `validationsPerRow`, `repairPassesPerRow`, and surface caps when triggered

## Configuration & Tuning

### PlanOptions (Brief Overview)
Full specification: [Feature Support Simplification Plan](spec-canonical-json-schema-generator.md) §5

```typescript
type PlanOptions = {
  rewriteConditionals?: 'never' | 'safe';
  conditionals?: { strategy?: 'if-aware-lite' | 'repair-only' };
  complexity?: { bailOnUnsatAfter?: number; /* ... */ };
  rational?: { maxRatBits?: number; fallback?: 'decimal' | 'float' };
  // ... plus trials, guards, cache, metrics, encoding
};
```

Default mapping between `rewriteConditionals` and `conditionals.strategy`:
- `rewriteConditionals: 'never'` ⇒ `conditionals.strategy: 'if-aware-lite'`
- `rewriteConditionals: 'safe'` ⇒ `conditionals.strategy: 'if-aware-lite'`
- An explicit `conditionals.strategy` overrides this mapping.

### Configuration Strategies
- **Development**: `rewriteConditionals: 'never'`, `debugFreeze: true`
- **Production**: `rewriteConditionals: 'safe'`, performance optimizations  
- **Testing**: `skipTrials: true`, deterministic branch selection

## Migration from Previous Versions

### v0.1 → Current
- **Schema composition** now fully supported (no workarounds needed)
- **Conditionals** supported with smart generation (remove manual flattening)  
- **Deep nesting** supported with configurable complexity caps
- **Performance** improved with 5-stage pipeline and complexity protection

### Removed Workarounds
- ❌ ~~Manual flattening of nested objects~~ → ✅ Configurable depth limits
- ❌ ~~Avoiding schema composition~~ → ✅ Full `allOf`/`anyOf`/`oneOf` support  
- ❌ ~~Removing conditionals~~ → ✅ If-aware-lite generation
- ❌ ~~Complex pattern avoidance~~ → ✅ ReDoS protection with heuristics

## Testing & Quality

### Multi-Level Testing Strategy
- **Unit**: Per-stage testing (normalizer, composer, generator, repair, validator)
- **Integration**: End-to-end pipeline validation against original schemas
- **Property-based**: Metamorphic testing with fast-check (deterministic seeds exercised in CI, e.g., 202_602/202_603)
- **Benchmark**: SLO/SLI tracking with automated regression detection

### Quality Guarantees
- **AJV-backed Validation**: Generated rows are validated against the original schema; Strict always validates, and Lax may skip only when unresolved external `$ref` meet ExternalRefSkipEligibility (surfaced as `EXTERNAL_REF_UNRESOLVED{skippedValidation:true}`)
- **Deterministic Generation**: Same seed ⇒ identical output  
- **Performance Protection**: Graceful degradation, never crashes on complex schemas
- **Correctness over Features**: Add complexity only when guarantees hold

---

**Next**: See [Architecture](../ARCHITECTURE.md) for implementation details or [Feature Simplification Plan](spec-canonical-json-schema-generator.md) for complete specification.
