# Architecture Brief — Observability & Platform Metrics

## 1. Purpose & Context

This document frames how FoundryData approaches **observability and metrics**
across the pipeline (`Normalize → Compose → Generate → Repair → Validate`) and
the coverage‑aware layer (`coverage=off|measure|guided`).

The canonical SPEC already defines:

- required `diag.metrics` fields (per‑phase timings, `validationsPerRow`,
  `repairPassesPerRow`, latency and memory SLI) and their semantics;
- coverage metrics (`coverage.overall`, `coverage.byDimension`,
  `coverage.byOperation`) and their relationship to `targets[]`;
- how caps and budgets must be reported in diagnostics.

What it does **not** prescribe is:

- which additional metrics an implementation may collect,
- how to aggregate them into platform‑level KPIs,
- and how to expose them to users for day‑to‑day operation.

This brief defines that higher‑level observability story for FoundryData
without changing SPEC semantics.

---

## 2. Problem Statement

Today we have:

- a solid, SPEC‑aligned foundation (`diag.metrics`, coverage metrics), and
- some ad‑hoc logs or snapshots (e.g. coverage reports, bench outputs).

But we lack a coherent **observability model** that answers:

- How expensive is coverage (per phase, per profile, per schema)?
- How much do we rely on Repair vs Generator in practice?
- How does guided distribute its budget across operations?
- Which motifs or schemas are most fragile or under‑tested?

Without clear metrics and views, it is hard to:

- tune budgets and profiles,
- prioritize work on motifs or performance,
- and build trust in FoundryData as a testing/tooling platform.

---

## 3. Goals

Our observability & metrics layer should:

1. **Stay SPEC‑compliant and compatible**  
   Never reinterpret normative metrics; only extend them with additional,
   clearly labelled fields and views.

2. **Bridge implementation and UX**  
   Make internal decisions (Generator vs Repair, guided strategy, caps)
   visible and explainable to users and tests.

3. **Support tuning and regression detection**  
   Allow us to see the impact of changes on performance, coverage and
   “health” of the schema zoo over time.

4. **Remain lightweight and deterministic**  
   Metrics must be cheap enough for CI and reproducible across runs given
   the same inputs and seed.

---

## 4. Metrics Layers

We distinguish three layers of metrics:

### 4.1 Core `diag.metrics` (SPEC‑level)

Already defined by the SPEC, and treated as the **source of truth**:

- Per‑phase timings: `normalizeMs`, `composeMs`, `generateMs`, `repairMs`,
  `validateMs`, and optionally `compileMs`.
- Workload counters: `validationsPerRow`, `repairPassesPerRow`,
  `branchTrialsTried`, `patternWitnessTried`.
- Performance SLIs: `memoryPeakMB`, `p50LatencyMs`, `p95LatencyMs`.
- Optional observability fields (`branchCoverageOneOf`, `enumUsage`,
  `repairActionsPerRow`, `evalTraceChecks`, `evalTraceProved`).

These metrics are **owned by the SPEC**; we must compute and interpret them
as described there.

### 4.2 Coverage metrics & caps

Also SPEC‑level:

- `coverage.overall`, `coverage.byDimension`, `coverage.byOperation`,
  `targetsByStatus`, `metrics.targetsByStatus.deprecated`, etc.
- Caps and budgets surfaced through diagnostics and per‑target metadata
  (`planned`, `unplanned`, reasons for unplanned/uncovered).

We treat these as the canonical view of **schema‑level exploration** under
the chosen coverage options and budgets.

### 4.3 Platform metrics (FoundryData‑specific)

Built on top of the two layers above, these are not mandated by the SPEC but
are valuable for operating FoundryData as a platform. Examples:

- **Pipeline balance**
  - ratio of time spent in coverage vs core phases,
  - per‑profile latency and memory distributions beyond the SPEC gates.

- **Generator vs Repair usage**
  - average `repairActionsPerRow` per motif (e.g. “array+contains”,
    “AP:false object”, “simple object with required”),
  - counts of instances where Repair was skipped entirely vs applied.
  - **G_valid contract metrics**:
    - baseline motif `array-contains-simple`, with:
      - `diag.metrics.gValid_arrayContainsSimple_items`,
      - `diag.metrics.gValid_arrayContainsSimple_itemsWithRepair`,
      - `diag.metrics.gValid_arrayContainsSimple_actions`,
    - additional `gValid_*` motifs MAY be added (e.g. simple objects with `required`) but MUST follow the same “items / itemsWithRepair / actions” pattern and remain derived from the canonical SPEC (`G_valid` classification in §6).

- **Guided behaviour**
  - distribution of instances per operation/scope in guided runs,
  - coverage gains vs `measure` by dimension and by operation,
  - hint application and unsatisfied hint statistics.

- **Schema zoo health**
  - number of motifs covered by micro‑schemas,
  - tracking of which schemas/tests hit which motifs and invariants.

These metrics can be surface‑level (e.g. in reports or CLI summaries) or
internal (for tuning and CI dashboards).

---

## 5. Views & Consumers

Different users need different views:

- **Developers working on core code**  
  - want detailed `diag.metrics` and motif‑level repair/guided stats,
  - need to see the impact of changes on performance and invariants.

- **Test & QA engineers**  
  - care about coverage metrics, per‑operation coverage, and whether guided
    is “doing its job” under given budgets,
  - may also want simple summaries (e.g. “X operations untouched”, “Y%
    branch coverage in guided vs measure”).

- **Operators / CI**  
  - focus on SLIs: latencies, memory, failure rates, thresholds per profile.

We should keep raw metrics machine‑friendly (JSON) while making sure at
least one human‑readable layer exists (CLI summary, reporter views).

---

## 6. Principles & Constraints

Observability must respect a few principles:

- **No silent semantics change**  
  Metrics must not redefine what “valid” means. For example, `coverage.overall`
  must remain the ratio defined by the coverage‑aware SPEC, not a weighted
  score or a compound KPI.

- **Deterministic metrics**  
  Values should not depend on non‑deterministic sources beyond the seeded
  RNG and the schema/options; repeated runs under the same conditions should
  yield the same metrics.

- **Cost awareness**  
  Collecting metrics must not dominate the cost of the pipeline; where
  necessary, we can gate expensive metrics behind flags or CI profiles.

- **Explicit profiles & thresholds**  
  Performance thresholds (SLIs/SLAs) and coverage gates should be configured
  per profile and clearly documented; they are a layer on top of the SPEC,
  not part of conformance.

---

## 7. Integration with Testing & Traceability

Metrics and observability should integrate with existing docs:

- `docs/testing-strategy.md`  
  - reference which metrics are used as gates (e.g. p95 latency, coverage
    thresholds) and how they map to tests.

- `docs/tests-traceability.md`  
  - link motifs and invariants to relevant metrics (e.g. repair usage,
    guided ≥ measure on branches/enum, per‑operation coverage).

Tests can then assert:

- that key metrics stay within expected ranges for core fixtures,
- that guided behaviour (vs measure) respects non‑regression invariants,
- that certain motifs (e.g. `G_valid` zone) maintain low Repair usage.

---

## 8. Next Steps & Open Questions

Open questions:

- Which platform metrics provide the best signal‑to‑noise ratio for day‑to‑day
  tuning (e.g. a small set of “golden” KPIs)?
- How should we expose metrics to users (CLI flags, reporter views, JSON
  endpoints) without overwhelming them?
- Where do we draw the line between “always on” metrics and CI‑only or
  debug‑only metrics?

Suggested next steps:

1. Enumerate current metrics already computed in code and map them to this
   brief (core vs coverage vs platform).
2. Identify 3–5 high‑value platform KPIs (e.g. guided gain vs measure,
   Repair usage per motif) and implement them with minimal overhead.
3. Wire these KPIs into a small number of tests and/or CI dashboards so that
   regressions become visible.
4. Iterate based on real usage, adjusting which metrics are collected by
   default and which are only enabled in dedicated profiles or debug modes.
