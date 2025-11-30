# FoundryData Known Limits

This document lists deliberate constraints that keep the pipeline deterministic, auditable, and performant. All limits below are already enforced in code and surfaced through diagnostics so callers can decide whether to relax guardrails or reshape schemas.

## Schema ingestion & referencing

- **External `$ref` (core)**: Only in‑document references are compiled by core phases. Any external URI produces `EXTERNAL_REF_UNRESOLVED` (see `packages/core/src/util/modes.ts`). Policy is `error` or `warn`; Strict always hard‑stops on unresolved externals, and Lax may skip final validation only when ExternalRefSkipEligibility passes. Core phases never perform remote I/O; the optional resolver pre‑phase is the only place that may fetch/cache.
- **`$dynamicRef` / `$recursiveRef`**: These keywords are passed through to AJV. Resolution depth is capped by `guards.maxDynamicScopeHops` (default `2`), preventing runaway scope expansion.
- **`not` nesting**: Conditional rewrites are skipped when `guards.maxGeneratedNotNesting` (default `2`) is too low; the normalizer emits `NOT_DEPTH_CAPPED` and leaves the original `if/then/else` intact instead of aborting planning.

## Composition & coverage

- **`AP:false` coverage**: Must-cover proofs rely on explicit properties, anchored-safe `patternProperties`, or `propertyNames` rewrites that emitted `PNAMES_REWRITE_APPLIED`. Raw `propertyNames.enum` values never expand coverage without the rewrite note, and unsafe reliance on non-anchored patterns becomes `AP_FALSE_UNSAFE_PATTERN`.
- **Presence pressure**: When `minProperties`, `required`, or `dependentRequired` demand coverage but no safe sources exist, Compose halts with `UNSAT_AP_FALSE_EMPTY_COVERAGE`. Under presence pressure, approximations are recorded so downstream tooling knows coverage became conservative.
- **`contains` needs**: The bag is trimmed to `complexity.maxContainsNeeds` (default `16`). When more independent needs exist, low-priority entries are dropped and `CONTAINS_BAG_COMBINED` is emitted to document the approximation.
- **Pattern overlap analysis**: The `complexity.maxPatternProps` option defaults to `64`, but the current overlap analysis does not apply this cap; all patterns are considered.
- **Coverage target caps**: Coverage-aware planning applies caps to the number of targets per dimension/schema/operation to avoid combinatorial explosion. When caps are hit, some low-priority targets may not be materialised, and planner diagnostics capture the limitation (for example via `plannerCapsHit` and unsatisfied hints). Metrics and `coverage-report/v1` remain deterministic but may reflect a truncated target universe for capped dimensions.

## Generation

- **Deterministic RNG**: The generator uses `XorShift32` seeded via `normalizeSeed`. Callers who omit a seed receive the default `123456789`, so identical schemas plus defaults always yield identical data.
- **Pattern witness search**: Witness synthesis follows `patternWitness` defaults (`alphabet = a-z0-9_-`, `maxLength = 12`, `maxCandidates = 32768`). Exhausting the budget produces `COMPLEXITY_CAP_PATTERNS` with `reason = 'witnessDomainExhausted'`, `candidateBudget`, or `regexComplexity`.
- **Branch trials (Compose)**: `trials.perBranch` defaults to `2`, `maxBranchesToTry` to `12`, and `skipTrialsIfBranchesGt` to `50`. Compose applies these caps, switches to score-only selection when triggered, and records `TRIALS_SKIPPED_*` with the specific reason; the generator consumes the chosen branch.
- **Numeric precision**: The pipeline uses `rational.maxRatBits = 128` and `maxLcmBits = 128` defaults alongside `decimalPrecision = 12` for the ε-based `multipleOf` tolerance; the current implementation does not emit `RAT_*` diagnostics, even when caps would apply.

## Repair & validation

- **Rename guards**: Under `AP:false`, repair refuses to introduce property names that are not provably covered. Removal or renaming emits `REPAIR_PNAMES_PATTERN_ENUM` and respects the `mustCoverGuard` option (default `true`).
- **Budget caps**: Repair loops obey `failFast` budgets surfaced through `budget.tried/limit/reason` and escalate to `UNSAT_BUDGET_EXHAUSTED` when convergence is impossible.
- **AJV parity**: Both planning and validation AJV instances must enable `unicodeRegExp`, share the same `validateFormats` posture, and align on `multipleOfPrecision`. `AJV_FLAGS_MISMATCH` is fatal and prevents generation so the pipeline never emits artifacts validated under mismatched rules.

## Coverage-aware limits

- **Dimensions & denominators**: Coverage dimensions (`structure`, `branches`, `enum`, `boundaries`, `operations`, …) are projections over the same conceptual target universe. `dimensionsEnabled` selects which dimensions are active for a run: only enabled dimensions materialise `CoverageTarget` entries and appear in metrics and the JSON report for that run, without renumbering targets in other dimensions. `excludeUnreachable` affects only coverage denominators by removing `status:'unreachable'` targets from ratio calculations; unreachable targets remain present in `targets` / `uncoveredTargets` with stable IDs and statuses.
- **Diagnostic-only targets**: Targets used purely for diagnostics (for example `SCHEMA_REUSED_COVERED` with `status:'deprecated'`) are never counted in coverage denominators or thresholds (`minCoverage`), even when included in `targets` / `uncoveredTargets`. They exist solely to surface insights in reports and CLI summaries.
- **Boundaries dimension**: Boundaries coverage (min/max constraints for numbers, strings and arrays) can significantly increase target counts on large or heavily constrained schemas. Implementations apply deterministic caps and may leave some boundary targets unmaterialised; when this happens, coverage metrics for `boundaries` should be interpreted as best-effort, and the JSON report/diagnostics are the source of truth for which boundaries were actually tracked.
- **AP:false semantics**: Under `additionalProperties:false`, coverage for property presence is limited by the information available in `CoverageIndex`. When CoverageIndex proves emptiness or undecidability for certain names, the corresponding `PROPERTY_PRESENT` targets are treated as unreachable or left uncovered; the engine does not invent additional coverage based on unchecked `propertyNames` patterns. In cases where must-cover cannot be satisfied safely, diagnostics (such as `UNSAT_AP_FALSE_EMPTY_COVERAGE` or `AP_FALSE_UNSAFE_PATTERN`) take precedence over optimistic coverage.
- **Operations scope for byOperation**: Per-operation coverage and coverage diffs are only meaningful when the operations scope is compatible. Reports that differ in `run.operationsScope` or `run.selectedOperations` cannot be diffs of one another; attempting to compare them is treated as an incompatibility and rejected by the diff tooling rather than silently producing misleading `coverage.byOperation` deltas.

## Performance gates

- **Schema size**: Canonicalization refuses documents above `complexity.maxSchemaBytes` (default `2,000,000`). `COMPLEXITY_CAP_SCHEMA_SIZE` documents the observed byte count and the cap.
- **Branch fan-out**: `maxOneOfBranches = 200`, `maxAnyOfBranches = 500`, and `maxPatternProps = 64`. Exceeding any cap emits `COMPLEXITY_CAP_*` diagnostics and prevents further exploration.
- **Bench expectations**: Regression gates (scripts/bench.ts) enforce `p95 ≤ 120ms` and `memory ≤ 512MB` for the curated benchmark suite. Pipelines exceeding either stop the release process until the regression is understood.

## Resolver (R1) — Scope & Limits

The Resolver is an opt‑in, pre‑pipeline step that performs HTTP(S) fetches and populates a local on‑disk cache and an in‑memory registry. Core phases remain strictly I/O‑free and validate against the original schema.

- **I/O scope (normative)**: Only the pre‑phase performs network/filesystem I/O. Normalize → Validate never do.
- **Cache**: Location `resolver.cacheDir` supports POSIX `~` expansion and is canonicalized to an absolute path before I/O. Layout is `cacheDir/sha256(uri)/{content.json,meta.json}` with `meta.json = { uri, contentHash }` and `contentHash = sha256(canonical JSON)`.
- **No TTL**: The pre‑phase uses whatever bytes are present at the start of the run; refreshing is explicit. Bounds may mark entries unavailable for this run.
- **Bounds (defaults)**: `maxDocs=64`, `maxRefDepth=16`, `maxBytesPerDoc=5MiB`, `timeoutMs=8000`, `followRedirects=3`.
- **Strategies & allowlist**:
  - `local` (default) never fetches.
  - `schemastore` permits `json.schemastore.org` only (case‑insensitive).
  - `remote` permits general HTTP(S) hosts, optionally restricted via `allowlist`.
  - Strategies are unioned left‑to‑right. Host matching uses the URL hostname only.
- **Determinism**: Compose/memo keys include a `resolver.registryFingerprint = sha256(join("\n", sort([ uri + " " + contentHash ])))` so outcomes are reproducible for a fixed registry state. The fingerprint is included whenever the registry is non‑empty or `stubUnresolved:'emptySchema'` is active.
- **Diagnostics**:
  - Run‑level: `RESOLVER_STRATEGIES_APPLIED`, `RESOLVER_CACHE_HIT`, `RESOLVER_CACHE_MISS_FETCHED`, `RESOLVER_OFFLINE_UNAVAILABLE` under `compose(...).diag.run[]` with `canonPath:"#"`.
  - Per‑path (planning‑time stubs): `EXTERNAL_REF_STUBBED{ ref, stubKind:'emptySchema' }` (Lax only).
- **CLI mapping**:
  - `--resolve=local[,remote][,schemastore]` and `--cache-dir <path>`
  - `--compat lax --fail-on-unresolved=false` ⇒ Lax + planning stubs enabled.

## Out‑of‑scope / non‑goals

- **Remote dereferencing in core**: Fetching during core phases is unsupported. The optional Resolver pre‑phase confines network I/O and never changes the original schema; core phases consult a read‑only registry only.
- **Scenario/learned distributions**: FoundryData only emits deterministic, spec-compliant data. Any adaptive or learned distributions sit behind future extensions and are not part of the core runtime.
- **Generated data caching**: Items are produced per request; caching artifacts or replay logs would break determinism and remains outside the current scope.
