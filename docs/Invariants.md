# FoundryData Invariants

This note captures the cross-phase guarantees implemented inside `packages/core` so that documentation, tooling, and downstream consumers can rely on the same contracts that drove tasks 4–18.

## Pipeline contract

- The orchestrator (`packages/core/src/pipeline/orchestrator.ts`) always executes `Normalize → Compose → Generate → Repair → Validate` and never skips validation of the source schema. Every artifact validated at the end of the run uses the original schema and the source AJV instance, so no canonicalized view can diverge from the contract that clients author.
- Planning and source AJV instances are created side-by-side (`util/ajv-planning.ts`, `util/ajv-source.ts`) and gated by `checkAjvStartupParity`. Unicode regex support, `validateFormats`, discriminator flags, and `multipleOfPrecision` values must match before generation begins.
- Plan options are resolved exactly once per run (`resolveOptions`) and stored inside the generator/repair engines. This keeps configuration deterministic and avoids per-item mutations.

## Normalizer invariants

- Canonical schemas keep a pointer map back to the user schema; diagnostics always reference a stable `canonPath` so later stages can attach additional evidence (`schema-normalizer.ts`).
- Conditional rewrites follow the safe-double-negation guardrails. When annotations would be lost, the normalizer emits `IF_REWRITE_DISABLED_ANNOTATION_RISK` and leaves the input untouched, ensuring observability instead of silent rewrites.
- Dependency rewrites never invent new coverage sources. Whenever `dependentRequired` is inferred, the normalizer records `DEPENDENCY_GUARDED` to show which keys triggered the guard.
- `propertyNames` rewrites require anchored patterns or literal enums. Successful rewrites add `PNAMES_REWRITE_APPLIED`, while unbounded or lossy attempts flag `PNAMES_COMPLEX`, ensuring later stages know whether must-cover constraints are anchored.

## Compose invariants

- Coverage entries always honor “enum/const beats type”: literals discovered via `const`/`enum` are emitted through `CoverageEntry.enumerate`, and broad type-only information never replaces them (`composition-engine.ts#getLiteralSet`).
- `additionalProperties: false` schemas build must-cover sets that include canonical names, anchored-safe `patternProperties`, and §7 synthetic patterns. When presence pressure is active but coverage is provably empty, Compose emits `UNSAT_AP_FALSE_EMPTY_COVERAGE` and stops early; unsafe reliance on non-anchored patterns surfaces as `AP_FALSE_UNSAFE_PATTERN`.
- The `contains` pipeline runs with bag semantics. Each `contains` clause is normalized into a need (`makeContainsNeed`), tracked per canonical pointer, trimmed for subsumption, and later enforced by the generator so independent requirements stay independent.
- Pattern overlap analysis emits diagnostics only when two anchored patterns can compete for the same key, ensuring that downstream bag semantics and repairs keep the same evaluation graph.

## Generation invariants

- All randomness flows through `XorShift32` seeded by `normalizeSeed(seed) ^ fnv1a32(canonPath)`. Score-only selection records `scoreDetails.tiebreakRand` even when a branch set has a single element; exclusivity tweaks record `scoreDetails.exclusivityRand` instead of overwriting the tie-break draw.
- `if-aware-lite` honors discriminants and minimum satisfaction levels exactly as resolved plan options dictate. When insufficient information exists, the generator records `IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO`.
- Bag semantics from Compose are enforced item-by-item: each `contains` need contributes independent sampling goals, and failures escalate to `CONTAINS_UNSAT_BY_SUM` or `CONTAINS_BAG_COMBINED` with the original bag size attached.
- Structural hashing (`util/struct-hash.ts`) enforces `uniqueItems`, ensures tweak targets only mutate values once, and supports repair decisions across the pipeline.

## Repair + Validate invariants

- The repair engine is AJV-driven: each attempted fix replays validation against the planning AJV before accepting the mutation, and diagnostics like `REPAIR_PNAMES_PATTERN_ENUM` capture any renames or deletions that were required to preserve must-cover guarantees.
- Repair budgets (`budget.tried`, `budget.limit`, `budget.reason`) are always recorded when a guard prevents convergence, and `UNSAT_BUDGET_EXHAUSTED` is emitted before items are surfaced to Validate.
- Validation reuses the source AJV instance with the same flags checked at startup. External references remain blocked—`EXTERNAL_REF_UNRESOLVED` is emitted with policy, mode, and `skippedValidation` evidence when configured to warn or ignore.

## Observability & determinism

- Every diagnostic is validated against `packages/core/src/diag/schemas.ts` before leaving a stage. Forbidden keys (`canonPath`, `canonPtr`) cannot leak into `details`, ensuring a consistent envelope shape for docs/error.md.
- Seed, pattern witness attempts, and metrics (`validationsPerRow`, `repairPassesPerRow`, `p95LatencyMs`, `memoryPeakMB`) are carried through the pipeline so benchmark gates (`benchGate.schema.json`) cover real executions.
- Decision logs (e.g., property source traces via `EVALTRACE_PROP_SOURCE`) are only recorded when metrics collection is enabled, keeping normal runs lightweight while leaving a precise breadcrumb trail during audits.
