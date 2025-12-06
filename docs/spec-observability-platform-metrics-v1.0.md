# FoundryData — Observability & Platform Metrics (SPEC)
Version: v1.0 (Draft)  
Audience: engine integrators, CI/platform owners, test/tooling maintainers

This document specifies the **observable outputs** (diagnostics, metrics, and reports) emitted by the FoundryData pipeline, and the **platform-level KPIs / gates** built on top of them.

It complements, but does not replace:
- **spec-canonical-json-schema-generator.md** (normative for pipeline phases, diagnostics envelope, determinism, and `diag.metrics` keys)
- **spec-coverage-aware-v1.0.md** (normative for `coverage-report/v1` and coverage planning/measurement)
- **Known-Limits.md / Features.md / Invariants.md** (product reference; expected gaps must not be “filled” by inventing KPIs)

Normative keywords: **MUST**, **MUST NOT**, **SHOULD**, **MAY**.

---

## 1. Scope

### 1.1 In-scope
This SPEC defines, for a single pipeline invocation (“run”):

1) **Core diagnostics & metrics** in `diag` (including `diag.metrics`).  
2) **Coverage observability** through `coverage-report/v1`.  
3) **Resolver (R1) observability** via run-level diagnostics (`Compose.diag.run`).  
4) **Platform KPIs / CI gates** computed from (1)–(3).  
5) **Traceability requirements**: each gate MUST be backed by an automated test that asserts the signal.

### 1.2 Out-of-scope
- Generator semantics, repair semantics, JSON Schema semantics (defined in the canonical SPEC).
- UI/dashboard implementation details (Grafana/Datadog/etc.).
- Long-term storage schema for time-series metrics (this SPEC defines the source-of-truth payloads only).

---

## 2. Observability Surfaces (Outputs)

A run may produce the following payloads:

### 2.1 Pipeline result payload (canonical)
A run MUST return a result object including a `diag` envelope as defined by the canonical SPEC. At minimum, platform tooling consumes:
- `diag.fatal[]` and `diag.warn[]` diagnostics
- `diag.metrics` numeric metrics (when enabled / present)
- `diag.run[]` (run-level diagnostics) when resolver R1 is enabled

### 2.2 Coverage report payload (`coverage-report/v1`) (coverage-aware)
When coverage mode is enabled, the run MUST produce a coverage report conforming to `spec-coverage-aware-v1.0.md`.
The coverage report is the source of truth for:
- coverage ratios (overall, byDimension, byOperation)
- target universe, target statuses, planned/unplanned evidence
- planner caps and unsatisfied hints diagnostics

### 2.3 Optional human-facing summaries (non-normative)
CLIs MAY emit compact summaries (stderr), but MUST NOT omit or contradict the JSON payloads from §2.1–§2.2.

### 2.4 Derived reporter/platform view (standardized; not a source of truth)
Repository tooling MAY emit a derived JSON summary intended for CI logs and test assertions (“Reporter/Platform View”).
When emitted, it MUST be derived from §2.1 (`diag`) and (when applicable) §2.2 (`coverage-report/v1`) without introducing new semantics.
Its normative shape is defined in Appendix A.

---

## 3. Global Principles

### 3.1 Observability must be side-effect free
Enabling metrics, coverage reporting, or resolver diagnostics MUST NOT change:
- the chosen branches / generator decisions,
- the generated instance stream,
- the final validation outcome,
for a fixed determinism tuple defined by the canonical SPEC.

Observability MAY add diagnostics (warn/info) and MAY add metrics fields, but MUST NOT alter behavior.

### 3.2 Deterministic vs environment-dependent signals
Signals are classified as:

- **Deterministic counters/IDs**: MUST be identical for a fixed determinism tuple.
  Examples: counts of attempted repairs, planned/unplanned tags, stable target IDs, deterministic timings that do not use wall-clock.
- **Performance SLIs**: environment-dependent, not required to be identical across hosts.
  Examples: `p50LatencyMs`, `p95LatencyMs`, `memoryPeakMB`.

Platform tooling MUST NOT treat performance SLIs as determinism regressions.

### 3.3 Cost controls
Each observability surface must be cost-aware:
- Coverage target materialization and planning is subject to caps and budgets.
- Decision logs and evaluation traces are only recorded when metrics are enabled.
- Resolver observability must not force network fetch; offline runs must remain deterministic for a fixed registry fingerprint.

---

## 4. Core Diagnostics & Metrics (`diag`)

### 4.1 Diagnostics envelope (recap)
All diagnostics in `diag.fatal[]`, `diag.warn[]`, and `diag.run[]` MUST follow the canonical Diagnostic schema (code, phase, canonPath, instancePath, details).

#### Severity policy (platform)
- A non-empty `diag.fatal[]` MUST cause the run to be treated as failed by platform tooling.
- `diag.warn[]` MUST be treated as “degraded” signals, and MAY be escalated to failures by CI gates (see §7).

### 4.2 `diag.metrics` — required keys (core)
The keys below are the **platform baseline**. They are defined by the canonical SPEC; this document fixes interpretation and consumer expectations.

#### 4.2.1 Phase timings (milliseconds)
When present, timings MUST represent elapsed time for the phase:
- `normalizeMs`
- `composeMs`
- `compileMs`
- `generateMs`
- `repairMs`
- `validateMs`

Constraints:
- Timings SHOULD be measured using a monotonic clock.
- Timings MAY be zero when the corresponding phase is skipped or when the runtime does not collect the metric.

#### 4.2.2 Core counters (run-level)
- `validationsPerRow` — average AJV validation executions per generated row (float).
- `repairPassesPerRow` — average repair passes per row (float).
- `repairActionsPerRow` — average repair actions per row (float).
- `branchTrialsTried` — total attempted branch trials (integer).
- `patternWitnessTried` — total attempted pattern witness candidates (integer).
- `evalTraceChecks` — number of trace checks evaluated (integer).
- `evalTraceProved` — number of trace checks proven (integer).

Constraints:
- Counters MUST be deterministic for a fixed determinism tuple.
- When metrics collection is disabled, counters MAY be absent or set to 0 per implementation policy (but MUST be consistent within a given binary/version).

#### 4.2.3 Performance SLIs (benchmark harness only)
These three fields exist to support the benchmark harness:
- `p50LatencyMs`
- `p95LatencyMs`
- `memoryPeakMB`

Constraints:
- In regular (non-benchmark) runs, these values MAY remain 0.
- In a benchmark harness run, all three MUST be populated with measured values.

### 4.3 Repair-tier observability
When repair metrics are enabled, the engine MUST expose tier usage via deterministic counters:
- `repair_tier1_actions`
- `repair_tier2_actions`
- `repair_tier3_actions`
- `repair_tierDisabled`

The run MUST surface policy blocks with the diagnostic `REPAIR_TIER_DISABLED` (canonical).

### 4.4 G_valid “no-repair zone” metrics
The canonical SPEC defines G_valid motifs. For each motif `<motif>`, the implementation SHOULD expose:
- `gValid_<motif>_items` — number of items emitted in that motif
- `gValid_<motif>_itemsWithRepair` — number of items that required repair/validate cycles
- `gValid_<motif>_actions` — number of repair actions applied within that motif

Rules:
- In G_valid zones, structural repair attempts on structural keywords are considered exceptional; default policy should block them and emit `REPAIR_GVALID_STRUCTURAL_ACTION` (canonical).
- Platform gates MUST treat increased `*_itemsWithRepair` or `*_actions` as a regression signal (see §7.3).

Extended (optional) metrics:
- Implementations MAY add `gValid_<motif>_repairUsageByMotif` maps if they need per-repair-keyword attribution for debugging and acceptance tests.

---

## 5. Coverage Observability (`coverage-report/v1`)

### 5.1 Source of truth
Coverage observability MUST be read from `coverage-report/v1`, not inferred from `diag.metrics`.

### 5.2 Required report fields (recap)
The report MUST include:
- `version = "coverage-report/v1"`
- `engine` metadata
- `run` metadata (including seed, options, selected operations if any)
- `metrics.coverage` (overall, byDimension, byOperation when enabled)
- `targets[]` plus `uncoveredTargets[]` (or equivalent split) with stable IDs
- `diagnostics[]` (coverage-specific or forwarded)

### 5.3 Planning caps and planned/unplanned auditing
When caps prevent planning some targets:
- Targets MUST still be materialized with stable IDs.
- Such targets MUST carry `meta.planned:false`.
- Reports MUST include planner-cap summaries under `diagnostics.plannerCapsHit` so consumers can distinguish “not covered” vs “not planned”.
- Each entry in `diagnostics.plannerCapsHit[]` MUST include `totalTargets`, `plannedTargets`, and `unplannedTargets` for the affected `(dimension, scopeType, scopeKey)` tuple.

### 5.4 Guided-vs-measure invariants (platform)
The platform MUST treat the following as invariants for CI comparisons:
- In a fixed determinism setup, `coverage=measure` MUST keep the instance stream identical to `coverage=off`.
- `coverage=guided` MUST NOT underperform `coverage=measure` on branch and enum dimensions (guided ≥ measure) unless excluded/unreachable logic differs.

---

## 6. Resolver (Extension R1) Observability

### 6.1 Run-level diagnostics
Resolver behavior MUST be surfaced under `Compose.diag.run` as run-level diagnostics (canonPath `"#"`), at least for:
- `RESOLVER_CACHE_HIT`
- `RESOLVER_CACHE_MISS_FETCHED`
- `RESOLVER_OFFLINE_UNAVAILABLE`
- `RESOLVER_STRATEGIES_APPLIED`
- `EXTERNAL_REF_UNRESOLVED` / `EXTERNAL_REF_STUBBED` (where relevant)

### 6.2 Determinism and comparability
When resolver R1 is active:
- A `resolver.registryFingerprint` MUST be included in the determinism tuple and in outputs sufficient to compare runs.
- Coverage comparisons/diffs MUST treat reports as incompatible when they were produced under different registry fingerprints.
For OpenAPI-aware runs, coverage comparisons/diffs MUST also treat reports as incompatible when:
- `run.operationsScope` differs, OR
- when applicable, the sorted `run.selectedOperations` sets differ.

---

## 7. Platform KPIs & CI Gates

This section is normative for FoundryData repository gates and for “platform mode” integrations.

### 7.1 Gate categories
Platform gates fall into:
1) **Hard-fail gates**: always fail the run.
2) **Quality gates**: fail in CI/release channels, warn elsewhere.
3) **Trend gates**: record-only (for dashboards), no immediate failure.

### 7.2 Hard-fail gates (MUST)
A run MUST be considered failed when any of the following holds:

- `diag.fatal[]` is non-empty.
- Coverage threshold gate fails (coverage-report indicates `metrics.coverageStatus:"minCoverageNotMet"`, or the canonical “coverage threshold not met” exit condition is raised).
- Determinism integrity diagnostics indicate invalid setup (e.g., AJV posture mismatch as per canonical SPEC).
- Unsatisfiable conditions are detected and surfaced as fatal diagnostics (e.g., numeric domain collapse / unsatisfiable bounds).

### 7.3 Quality gates (SHOULD fail in CI)
#### 7.3.1 G_valid no-repair zone
For each G_valid motif used by the implementation:
- `gValid_<motif>_itemsWithRepair` SHOULD be 0.
- `gValid_<motif>_actions` SHOULD be 0.
- Any `REPAIR_GVALID_STRUCTURAL_ACTION` diagnostic MUST fail CI unless an explicit opt-in configuration is set for that run.

Rationale: G_valid exists to keep generation AJV-valid without relying on Repair as a structural crutch.

#### 7.3.2 Repair progress regressions
The following are degradation signals and SHOULD fail in CI:
- `UNSAT_BUDGET_EXHAUSTED` (run exhausted repair/gen budget while still invalid).
- High rates of `REPAIR_REVERTED_NO_PROGRESS` (repair mutation does not reduce Score and is reverted).

#### 7.3.3 Planner caps / large-unplanned share
If `plannerCapsHit` is non-empty or `unplannedTargets` is large relative to `plannedTargets`, CI SHOULD:
- fail if minimum coverage thresholds are mandated for the project, OR
- warn with an actionable message explaining which cap was hit.

### 7.4 Performance gates (benchmark harness)
In the curated benchmark suite:
- `p95LatencyMs` MUST be ≤ the project threshold (default: 120ms).
- `memoryPeakMB` MUST be ≤ the project threshold (default: 512MB).

These are environment-dependent and apply only to the benchmark harness pipeline.

---

## 8. Profiles & Defaults

### 8.1 Metrics enablement
Metrics collection is controlled by the PlanOptions flag (`metrics` in the canonical SPEC).

- “Minimal” profiles SHOULD disable metrics by default.
- “Realistic/Strict” profiles SHOULD enable metrics by default when used in CI, because CI gates depend on deterministic counters and gValid observability.

Regardless of defaults, platform tooling MUST persist the explicit value of the metrics flag in run artifacts, so comparisons remain explainable.

### 8.2 Coverage dimensions
Coverage `dimensionsEnabled` and `excludeUnreachable` materially affect denominators and thresholds.
For OpenAPI-aware runs, `run.operationsScope` and (when applicable) `run.selectedOperations` affect projections/diffs.
Platform tooling MUST treat two runs as comparable only when these settings match, and MUST treat registryFingerprint mismatches as non-comparable when resolver R1 is active.

---

## 9. Traceability to Tests (normative)

Every MUST/SHOULD gate above MUST map to a test suite entry. At minimum, the repository MUST include automated tests that:
- Assert gValid no-repair usage (itemsWithRepair/actions at 0 on curated schemas).
- Assert guided ≥ measure invariants on branches/enums for curated fixtures.
- Assert coverage-report stability and planned/unplanned tagging under caps.
- Assert resolver offline determinism when registry snapshots are used.
- Assert benchmark thresholds in the curated bench harness.

The tests-traceability document is the authoritative index for this mapping; this SPEC requires it to stay in sync with gate definitions.

Reporter/Platform View (Appendix A) is the stable surface for CI assertions involving `metrics.repairUsageByMotif`, including the “no-repair zone” invariants.

---

## 10. Versioning & Extension Rules

- Adding new metric keys is allowed (append-only). Removing or renaming existing keys is a breaking change.
- New diagnostics codes MUST be documented in the canonical SPEC (or in an extension spec that it references).
- Any new gate MUST be backed by a test and added to traceability mapping.

---

## Appendix A — Reporter/Platform View (v1) (derived artifact)

This appendix standardizes a **derived** JSON view emitted by repo tooling (CLI/reporters) for:
1) compact CI summaries, and
2) stable test assertions (traceability).

It is **NOT** a source of truth:
- If a field conflicts with `diag` or `coverage-report/v1`, consumers MUST trust the canonical artifacts.
- The derived view MUST NOT introduce new semantics; it can only copy or aggregate existing signals.

### A.1 Envelope (logical schema)

```ts
type ReporterPlatformViewV1 = {
  version: "reporter-platform-view/v1";

  engine: {
    name: "foundrydata";
    version: string;
    ajvMajor: number;
  };

  // Comparability metadata (to avoid misleading diffs)
  run: {
    seed?: number;

    // Resolver comparability (R1)
    registryFingerprint?: string;

    // Coverage comparability (when coverage is on)
    coverage?: {
      mode: "off" | "measure" | "guided";
      dimensionsEnabled?: string[];
      excludeUnreachable?: boolean;

      // OpenAPI-only comparability
      operationsScope?: "all" | "selected";
      selectedOperations?: string[]; // MUST be stable-sorted when present
    };
  };

  metrics: {
    // Derived view for tests/CI. Optional unless explicitly required by repo tooling/tests.
    repairUsageByMotif?: RepairUsageByMotifEntry[];

    // Optional coverage summary (lossy by design; full truth remains coverage-report/v1)
    coverage?: {
      coverageStatus?: "ok" | "minCoverageNotMet" | "error";
      overall?: number;
      byDimension?: Record<string, number>;
      byOperation?: Record<string, number>;
      thresholds?: { overall?: number };
      targetsByStatus?: Record<string, number>;

      // Explicit planned/unplanned evidence (do not collapse to “capsHitCount” only)
      planning?: {
        plannedTargetsTotal?: number;
        unplannedTargetsTotal?: number;
        plannerCapsHit?: Array<{
          dimension: string;
          scopeType?: "schema" | "operation";
          scopeKey?: string;
          totalTargets: number;
          plannedTargets: number;
          unplannedTargets: number;
        }>;
      };
    };
  };
};

type RepairUsageByMotifEntry = {
  motif: string;
  canonPath?: string;

  // Deterministic counters
  items: number;
  itemsWithRepair: number;
  actions: number;

  // Optional breakdown when the implementation can attribute tiers deterministically
  tiers?: { tier1?: number; tier2?: number; tier3?: number; disabled?: number };
};
```

### A.2 `metrics.repairUsageByMotif` (normative rules)

When `metrics.repairUsageByMotif` is present:

1) The array MUST be stable-sorted lexicographically by `(canonPath ?? "")`, then by `motif`.
2) All counters MUST be non-negative integers.
3) `itemsWithRepair <= items` MUST hold.
4) `actions == 0` MUST imply `itemsWithRepair == 0`.

### A.3 Coverage planned/unplanned (normative rules)

When `metrics.coverage.planning` is present:

1) The values MUST be derived from the source `coverage-report/v1` data:
   - planned/unplanned totals are aggregates of `diagnostics.plannerCapsHit[].{plannedTargets,unplannedTargets}` when caps were hit,
   - per-entry `plannerCapsHit[]` MUST preserve `{totalTargets, plannedTargets, unplannedTargets}` as reported by coverage.
2) `run.coverage.selectedOperations` (when present) MUST be stable-sorted to ensure deterministic JSON, and MUST match the effective coverage report run metadata when both are emitted.

### A.4 Comparability contract (consumer rule)

Consumers computing diffs MUST treat two Reporter/Platform View objects as **non-comparable** when:
- `run.registryFingerprint` differs (resolver active), OR
- `run.coverage.operationsScope` differs, OR
- when applicable, the sorted `run.coverage.selectedOperations` sets differ, OR
- `run.coverage.dimensionsEnabled` / `excludeUnreachable` differ.

In that case, tooling MUST return an “incompatible reports” outcome instead of emitting potentially misleading deltas.
