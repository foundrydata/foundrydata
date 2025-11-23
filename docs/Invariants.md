# FoundryData Invariants

This note captures the cross-phase guarantees implemented inside `packages/core` so that documentation, tooling, and downstream consumers can rely on the same contracts that drove tasks 4–18.

## Pipeline contract

- The orchestrator (`packages/core/src/pipeline/orchestrator.ts`) always executes `Normalize → Compose → Generate → Repair → Validate`; when any stage fails, later stages are marked skipped. Final validation uses the original schema and Source AJV; in Lax mode, unresolved external `$ref` can return a skipped validate result instead of hard failure, per the SPEC modes contract.
- Planning and Source AJV instances are built together (`util/ajv-planning.ts`, `util/ajv-source.ts`) and checked by `checkAjvStartupParity` before Compose/Generate run. Parity covers `unicodeRegExp`, `validateFormats` plus formats-plugin presence, discriminator flags, `multipleOfPrecision`, `allowUnionTypes`, and the expected `strictSchema`/`strictTypes` roles, as well as resolver registry fingerprints; the same Source AJV settings are reused for final validation.
- Plan options are resolved where they are needed: the orchestrator resolves them up front for resolver/AJV/parity inputs, while Compose/Generate/Repair resolve their own snapshots from `planOptions` for each run. Each stage treats its resolved snapshot as read-only during that run to keep outcomes deterministic.

## Normalizer invariants

- Canonical schemas keep a pointer map back to the user schema; diagnostics always reference a stable `canonPath` so later stages can attach additional evidence (`schema-normalizer.ts`).
- Conditional rewrites follow the safe-double-negation guardrails. When annotations would be lost, the normalizer emits `IF_REWRITE_DISABLED_ANNOTATION_RISK` and leaves the input untouched, ensuring observability instead of silent rewrites.
- Dependency guards follow the SPEC unevaluated* rule: guards are inserted only when no `unevaluated*` applies; if an `unevaluated*` keyword blocks the insertion, the normalizer emits `DEPENDENCY_GUARDED{reason:'UNEVALUATED_IN_SCOPE'}` and keeps the original mapping (`schema-normalizer.ts`).
- `propertyNames` rewrites run only when unevaluated* is absent at or above the object and the local `additionalProperties` is either missing/`true`/`{}`; anchored-safe patterns or string enums succeed and add `PNAMES_REWRITE_APPLIED`, while blocked cases (including unevaluated* or non-string enums) record `PNAMES_COMPLEX` without altering the original schema (planning-only additions; AJV still sees the original).

## Compose invariants

- Coverage entries always honor “enum/const beats type”: literals discovered via `const`/`enum` are emitted through `CoverageEntry.enumerate`, and broad type-only information never replaces them (`composition-engine.ts#getLiteralSet`).
- `additionalProperties: false` schemas build must-cover sets that include canonical names, anchored-safe `patternProperties`, and §7 synthetic patterns. When presence pressure is active but coverage is provably empty, Compose emits `UNSAT_AP_FALSE_EMPTY_COVERAGE` and stops early; unsafe reliance on non-anchored patterns surfaces as `AP_FALSE_UNSAFE_PATTERN`.
- The `contains` pipeline runs with bag semantics. Each `contains` clause is normalized into a need (`makeContainsNeed`), tracked per canonical pointer, trimmed for subsumption and capped count, and Compose always emits `CONTAINS_BAG_COMBINED` describing the (possibly trimmed) bag. The generator enforces the trimmed bag and surfaces `CONTAINS_UNSAT_BY_SUM` when the bag’s minima cannot fit within effective `maxItems`, keeping independent requirements observable.
- Pattern overlap analysis emits diagnostics only when two anchored patterns can compete for the same key, ensuring that downstream bag semantics and repairs keep the same evaluation graph.

## Generation invariants

- All randomness flows through `XorShift32` seeded by `normalizeSeed(seed) ^ fnv1a32(canonPath)`. Score-only selection records `scoreDetails.tiebreakRand` even when a branch set has a single element; exclusivity tweaks record `scoreDetails.exclusivityRand` instead of overwriting the tie-break draw.
- `if-aware-lite` honors discriminants and minimum satisfaction levels exactly as resolved plan options dictate. When insufficient information exists, the generator records `IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO`.
- Bag semantics from Compose are enforced item-by-item: each `contains` need contributes independent sampling goals, and failures in generation escalate to `CONTAINS_UNSAT_BY_SUM` when minima/maxima cannot be satisfied; `CONTAINS_BAG_COMBINED` remains the Compose-time signal describing the trimmed bag size.
- Structural hashing (`util/struct-hash.ts`) supplies stable digests for enforcing `uniqueItems` and for repair-side comparisons; it is not used to gate or limit the number of tweak attempts.

## Repair + Validate invariants

- The repair engine is AJV-driven: each attempted fix replays validation against a Source AJV compiled with `allErrors:true`, and diagnostics like `REPAIR_PNAMES_PATTERN_ENUM` capture renames or deletions required to preserve must-cover guarantees.
- `UNSAT_BUDGET_EXHAUSTED` surfaces when repair/validate cycles stagnate; per-action budgets are recorded on diagnostics that SPEC marks budgeted, but the stagnation guard itself reports its cycle/error counts in `details`.
- Validation reuses the source AJV instance with the same flags checked at startup. External references remain blocked—`EXTERNAL_REF_UNRESOLVED` is emitted with policy, mode, optional `failingRefs`, and `skippedValidation` evidence when configured to warn or ignore.

## Observability & determinism

- Every diagnostic is validated against `packages/core/src/diag/schemas.ts` before leaving a stage. Forbidden keys (`canonPath`, `canonPtr`) cannot leak into `details`, ensuring a consistent envelope shape for docs/error.md.
- Seed, pattern witness attempts, and metrics (`validationsPerRow`, `repairPassesPerRow`, `p95LatencyMs`, `memoryPeakMB`) are carried through the pipeline; `p95LatencyMs` and `memoryPeakMB` are populated by the bench harness, while regular pipeline snapshots expose the fields but leave them at zero.
- Decision logs (e.g., property source traces via `EVALTRACE_PROP_SOURCE`) are only recorded when metrics collection is enabled, keeping normal runs lightweight while leaving a precise breadcrumb trail during audits.
