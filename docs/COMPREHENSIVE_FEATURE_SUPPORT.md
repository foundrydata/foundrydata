# FoundryData Comprehensive Feature Support

> **Status**: Aligned with [Feature Support Simplification Plan](spec-canonical-json-schema-generator.md) — see Controlled Limitations / Known Limits for the remaining guarded areas.

This document describes engine-level support for JSON Schema / OpenAPI features in FoundryData. All behaviors are in service of the core guarantees described in `README.md`: contract-true AJV validation, deterministic fixtures, and contract-level coverage.

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
- **`properties` / `patternProperties`** - Anchored-safe pattern coverage with overlap analysis; under `AP:false` (short-hand for `additionalProperties:false`), unsafe/non-anchored or complexity-capped patterns trigger Strict fail-fast (Lax warns) when presence pressure holds (i.e. the schema actively demands declared properties and forbids unbounded extras), otherwise they remain gating-only
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

See **Known Limits (per spec)** below for detailed behavior when these caps and guarded semantics apply.

### ❌ Not Supported (By Design)

- **Remote `$ref` without the resolver extension** - Security/offline core requirement
- **Draft-04 exclusive features** - Use `npx swagger2openapi` for migration  
- **`$data` references** - Not part of JSON Schema specification
- **`contentSchema`** - Out of scope for test data generation

### Known Limits (per spec)
- Under `AP:false` (see Advanced Object Features above), unsafe or complexity-capped patterns used for must-cover trigger Strict fail-fast and Lax warnings when presence pressure holds; raw `propertyNames.pattern` remains gating-only unless rewritten.
- `$dynamicRef/$dynamicAnchor` handled conservatively with bounded in-document binding; validation relies on AJV.
- External deref beyond the resolver extension stays disabled by default.

### Coverage-aware behavior (V1)

Coverage is a **contract-level** metric: it tells you which parts of a JSON Schema or OpenAPI contract are exercised by generated instances; it complements, but does not replace, code coverage or business-level test metrics.

Coverage-aware features build on top of the same JSON Schema support and invariants described above. They reuse the existing pipeline and AJV as oracle, and introduce a coverage model with dimensions and targets:

- **Dimensions & targets**
  - Coverage is organised by dimensions such as `structure`, `branches`, `enum`, `boundaries` and `operations`. These dimensions project over existing behavior:
    - `structure` reuses object/array composition (allOf, additionalProperties, prefixItems/items/contains),
    - `branches` builds targets for `anyOf`/`oneOf` decisions,
    - `enum` tracks which enum values are exercised,
    - `boundaries` (Milestone 2, “M2”) focuses on min/max-style constraints for numbers, strings and arrays and is subject to additional caps on very large or heavily constrained schemas (see Known Limits),
    - `operations` (OpenAPI) projects targets onto operation keys.
  - `dimensionsEnabled` selects which coverage dimensions are active for a given run: only the listed dimensions materialise `CoverageTarget` entries (the internal representation of a single contract-level coverage target) and participate in metrics for that run. Turning a dimension on or off does not renumber existing targets in other dimensions; for a given dimension, IDs remain stable as long as `(canonical schema, options, seed, AJV posture, registryFingerprint)` stays the same.

- **AP:false & must-cover**
  - Under `additionalProperties:false`, the coverage layer consumes the existing must-cover/CoverageIndex semantics (CoverageIndex is the internal index of declared property keys used for must-cover): `PROPERTY_PRESENT` targets for undeclared names are only considered under AP:false when backed by `CoverageIndex.has`/`CoverageIndex.enumerate`.
  - When presence pressure holds but CoverageIndex proves emptiness, targets are treated as unreachable or remain uncovered rather than being “guessed” as covered.

- **Arrays, contains and conditionals**
  - Coverage for `contains`/`minContains`/`maxContains` builds on bag semantics across `allOf`; targets reflect bagged needs and unsat diagnostics (`CONTAINS_UNSAT_BY_SUM`) rather than redefining array semantics.
  - Conditionals (`if`/`then`/`else`) contribute to branch and property presence targets but still follow the same if-aware-lite strategy and safe rewrite rules as described above.

- **Boundaries and operations**
  - Boundaries coverage (M2) adds targets around documented min/max-style constraints without changing validation behavior; when disabled, those targets remain absent from metrics but the underlying constraints still apply. Boundaries coverage is part of the M2 coverage milestone; on large or heavily constrained schemas, the number of boundary targets can be high and some caps are best-effort rather than strict guarantees (see Known Limits).
  - Operations coverage for OpenAPI projects existing schema-level targets and dedicated `OP_REQUEST_COVERED` / `OP_RESPONSE_COVERED` entries onto operation keys; it reuses the same schemas and AJV posture as the core engine.

- **Diagnostic-only targets**
  - Some coverage targets, such as `SCHEMA_REUSED_COVERED`, are emitted purely for diagnostics/insight and use `status:'deprecated'`. These targets never contribute to coverage denominators or thresholds (`minCoverage`) even when present in `targets` / `uncoveredTargets`.

For full details of the coverage model, dimensions and reports, see the coverage-aware V1 specification (`spec-coverage-aware-v1.0.md`) and the dedicated coverage sections in `Invariants.md`, `ARCHITECTURE.md` and the coverage docs.

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

High-level CLI flags (`--mode`, `--coverage`, resolver options, etc.) map onto `PlanOptions` under the hood; see the CLI usage sections in `README.md` and `examples/README.md` for concrete mappings.

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
- **Development / Debug**: `rewriteConditionals: 'never'`, `debugFreeze: true`, verbose diagnostics and generous budgets for investigation.
- **CI / Contract & Coverage**: strict AJV posture and stable seeds, `coverage=measure` or `coverage=guided` with balanced profiles, metrics enabled for tracking `validationsPerRow` and `repairPassesPerRow`.
- **Production-like / Performance-sensitive**: `rewriteConditionals: 'safe'` where allowed by policy, resolver and complexity caps tuned for throughput, conservative diagnostics.

### G_valid & Repair Strictness (CLI)

G_valid-related behavior is exposed at the CLI level via a small set of flags that map directly to `PlanOptions.gValid` and `PlanOptions.repair.allowStructuralInGValid`:

- `--gvalid` on `generate` / `openapi` enables classification/enforcement for locations that the planner deems G_valid, wiring `PlanOptions.gValid = true` while keeping defaults unchanged when the flag is omitted.
- `--gvalid-profile <profile>` provides coarse presets for common workflows:
  - `compat` (default) keeps G_valid disabled and preserves the historical behavior.
  - `strict` enables G_valid but keeps structural Repair disabled in G_valid zones.
  - `relaxed` enables G_valid and allows structural Repair in G_valid zones by setting `repair.allowStructuralInGValid = true`.
- `--gvalid-relax-repair` can be used explicitly to request the relaxed behavior regardless of the selected profile; explicit flags take precedence over profile defaults.

These flags do not affect coverage or resolver behavior and are designed so that existing invocations without G_valid options remain stable while making the Generator vs Repair contract and G_valid zones configurable for advanced users.

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
- **Deterministic Generation**: For a given `(canonical schema, options, AJV posture, resolver configuration)`, the same seed ⇒ identical output.  
- **Performance Protection**: Designed for graceful degradation on complex schemas; degradation paths are preferred over hard failures whenever possible.
- **Correctness over Features**: Add complexity only when guarantees hold

---

**Next**: See [Architecture](../ARCHITECTURE.md) for implementation details or [Feature Simplification Plan](spec-canonical-json-schema-generator.md) for complete specification.
