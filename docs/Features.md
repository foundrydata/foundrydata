# FoundryData Feature Matrix

| Capability | Status | Implementation notes |
| --- | --- | --- |
| `allOf` / `anyOf` / `oneOf` / `not` | ✓ | Compose scores every branch and records `tiebreakRand` in score-only/tie paths; oneOf exclusivity uses a fresh `exclusivityRand` (same canonPath seed) while honoring the Compose-chosen branch. `NOT_DEPTH_CAPPED` fires when the safe conditional rewrite would exceed `guards.maxGeneratedNotNesting` (default 2); guard-blocked cases emit the `IF_REWRITE_SKIPPED_*` notes instead. Repair stays deterministic and does not add RNG metadata. |
| Conditionals (`if` / `then` / `else`) | ✓ | Default `rewriteConditionals: 'never'`; safe rewrites are opt-in. Generator runs `if-aware-lite` hints and emits `IF_AWARE_HINT_APPLIED` or `IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO` when discriminants are unavailable. |
| Tuples, `items`, `additionalItems` | ✓ | When `items:false`, `prefixItems` imply an implicit max length used in Compose (e.g., for `contains` caps) and enforced in generation; `uniqueItems` is handled via structural hashing. |
| `patternProperties` / `propertyNames` | ✓ | Only strict equivalence rewrites land as coverage sources; guarded/unsafe shapes stay gating-only, with `PNAMES_REWRITE_APPLIED` / `PNAMES_COMPLEX` explaining the decision. |
| `dependentSchemas` / `dependentRequired` | ✓ | Normalizer wraps dependentRequired with guards; Compose treats required antecedents as presence pressure so AP:false must-cover honors those dependents, while non-required antecedents remain gating-only. |
| `contains` with `minContains` / `maxContains` | ✓ | Compose stores independent needs in the contains bag and generator enforces them with bag semantics; conflicts surface as `CONTAINS_UNSAT_BY_SUM` or `CONTAINS_BAG_COMBINED`, and `CONTAINS_NEED_MIN_GT_MAX` fires when a need has `max < min`. |
| `multipleOf` / numeric bounds | ~ | Numeric bounds contradictions are detected in Compose; generation snaps to multiples with an epsilon derived from `rational.decimalPrecision`, but rational caps/fallbacks do not yet emit the `RAT_*` diagnostics required by the SPEC. |
| `unevaluatedProperties` / `unevaluatedItems` | ✓ | Compose keeps conservative effective views and generation records evaluation traces (when metrics are on) so validation knows which branches were visited. |
| In-document `$ref` | ✓ | Canonical schema retains `$id`/pointer metadata (including `#/definitions` → `#/$defs` rewrites) with cycle checks and cache keys derived from `$id`/hash. |
| External `$ref` | ⚠️ (policy) | No remote fetches in core; `EXTERNAL_REF_UNRESOLVED` carries mode/policy and optional `failingRefs` and only skips validation in Lax when skip-eligibility holds. |
| `$dynamicRef` / `$dynamicAnchor` / `$recursiveRef` | ~ | Normalizer/Compose leave them untouched, but the generator currently resolves `$dynamicRef` chains (bounded hops) before generation—this diverges from the SPEC pass-through stance and leaves final behavior to AJV. |

**Legend**: ✓ full support, ~ partial / passthrough, ⚠️ guarded behavior (feature available but subject to policy or diagnostics).

## Coverage-aware features (V1)

| Capability | Status | Implementation notes |
| --- | --- | --- |
| Coverage measurement (structure/branches/enum) | ✓ | `coverage=measure` mode is implemented for JSON Schema and OpenAPI entrypoints; it materialises coverage targets for structure, branches and enums while keeping the generated instances identical to coverage=off for a fixed `(schema, options, seed, ajv posture)` tuple. Metrics and coverage-report/v1 are available, and diagnostic-only targets (e.g. SCHEMA_REUSED_COVERED) are excluded from denominators and thresholds. |
| Guided coverage (structure/branches/enum) | ~ | `coverage=guided` mode uses CoveragePlanner and hints to steer generation toward uncovered targets under a deterministic budget; guided runs respect the invariants guided ≥ measure on branches/enum and reuse the same AJV oracle and AP:false constraints. Some acceptance criteria (e.g. full branch/enum saturation on simple schemas) remain best-effort rather than hard guarantees in V1. |
| Boundaries coverage (min/max, numeric/string/array) | ~ | Boundaries coverage dimension is implemented as part of coverage-report/v1 and byDimension metrics, focusing on min/max-style constraints. It is considered M2 and may be disabled in default profiles; enabling it can increase target counts and is subject to documented caps/limits in the coverage-aware spec and Known-Limits.md. |
| Per-operation coverage (OpenAPI operations) | ✓ | OpenAPI-aware CoverageAnalyzer and CoverageEvaluator project schema-level targets onto operations; `coverage.byOperation` and OP_* targets are available when the operations dimension is enabled. CLI supports coverage for `foundrydata openapi` with per-operation metrics and compatibility with coverage diff. |

## Coverage in CI

Coverage in CI is intended as an observation layer on top of the canonical pipeline: the same instances are generated as with `coverage=off`, and coverage reports/thresholds are used to gate builds.

### Recommended baseline profile (conceptual)

At a high level, the recommended baseline for CI is:

- `coverage=measure` to keep the instance stream identical to `coverage=off` for a fixed `(schema, options, seed, ajv posture)` tuple, while still emitting coverage targets and metrics.
- A balanced coverage profile that enables structure/branches/enum and uses a moderate budget (`maxInstances`) and caps, as described in the coverage-aware spec’s budget/profile section.
- A minimum overall coverage threshold (`minCoverage`) applied to the enabled dimensions, enforced via coverage-report/v1 `metrics.coverageStatus` and the dedicated coverage exit codes.
- A JSON coverage report (coverage-report/v1) consumed by downstream tooling, plus a single stderr line of the form `[foundrydata] coverage: …` summarising overall, per-dimension/per-operation coverage, targets by status, and counts of planner caps and unsatisfied hints.

Concrete CLI examples for JSON Schema and OpenAPI (including coverage flags and profiles) live in the use-case documentation under `docs/use-cases/product-scenarios.md` and the examples README; `Features.md` focuses on the feature model rather than specific commands.
