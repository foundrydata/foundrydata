# Architecture Brief — Guided Coverage Strategy & Target Prioritization

## 1. Purpose & Context

_Conformance: Informative (context and scope only)._

This document frames the architectural decisions around the **guided coverage
strategy** in FoundryData: how `coverage=guided` prioritizes coverage targets,
consumes hints, and allocates a finite budget of instances across schemas and
operations.

The coverage‑aware SPEC defines:

- what `coverage=guided` is allowed to influence (structure/branches/enum),
- the minimal hint set and their local priority,
- determinism guarantees and non‑regression vs `coverage=measure`,
- how planner caps and budgets must be surfaced.

However, it intentionally leaves open the **global strategy**: how to order
targets, how to share budget across operations, and how to trade off breadth
vs depth. This brief outlines the design space for FoundryData without
changing SPEC‑level semantics.

### Terminology & Scope

_Conformance: Informative (terminology definitions for this brief)._

This brief uses a few core terms:

- **CoverageTarget** — a single element in the coverage graph / `targets[]`
  array for a schema or OpenAPI operation, with dimension, status and
  per‑target metadata.
- **TestUnit** — the atomic planning unit produced by the coverage planner; a
  TestUnit attempts one or more targets under a specific combination of hints
  and a slice of the global budget.
- **Operation / scope** — for OpenAPI, an operation is a stable `(path,
  method)` pair; for plain JSON Schemas, an analogous “scope” is a top‑level
  property or named sub‑schema used for fairness and reporting.
- **Motif** — a recurring schema pattern relevant to coverage, such as a
  top‑level `oneOf` on responses, an `additionalProperties:false` object with
  `propertyNames`, or a deeply nested `enum`.
- **Budget** — the finite instance budget visible to guided coverage, modelled
  primarily as `maxInstances` plus per‑dimension caps.

Guided strategy lives in the coverage‑aware layer on top of the canonical
`Normalize → Compose → Generate → Repair → Validate` pipeline. It consumes
targets from the CoverageAnalyzer, orchestrates TestUnits in the
CoveragePlanner, and steers the generator via hints and caps while leaving
AJV validation semantics unchanged.

---

## 2. Problem Statement

_Conformance: Informative (describes current behaviour and pain points)._

Today, guided mode exists but its **global behaviour** is largely an
implementation detail:

- Some targets may receive more attention than others without an explicit
  notion of fairness or priority.
- There is no clear story for how budgets (`maxInstances`, caps) translate
  into coverage expectations per schema/operation.
- When coverage is disappointing on complex specs, it is hard to explain
  *why* guided made its choices, or how to tune it.

We need a strategy that:

- remains fully SPEC‑compliant,
- is deterministic and explainable,
- and can be tuned or profiled (`quick` / `balanced` / `thorough`) without
  surprising behaviour.

---

## 3. Goals

_Conformance: Informative (design intent and success criteria, not individually testable)._

The guided strategy should aim for:

1. **Spec‑aligned invariants**
   - Never emit invalid instances.
   - Respect non‑regression vs measure on `branches` and `enum` for the same
     schema, options, budget, and seed.
   - Honour hint ordering and conflict resolution rules.

2. **Predictable coverage improvements**
   - Given a fixed budget, guided should make “reasonable” choices about which
     targets to cover first and which to leave as uncovered with clear reasons
     (caps, unreachable, conflicting constraints).

3. **Fairness across operations / areas**
   - Avoid pathological cases where a single operation or area of a schema
     monopolizes the guided budget at the expense of others.

4. **Explainability & observability**
   - It should be possible to answer “why did guided cover these branches and
     not those?” using planner diagnostics and metrics.

5. **Profile‑aware behaviour**
   - Guided should integrate cleanly with CLI profiles (`quick` /
     `balanced` / `thorough`) and any future data profiles, without exploding
     the configuration space.

---

## 4. Constraints from the SPEC

_Conformance: Normative for FoundryData; guided coverage implementations must satisfy these constraints in addition to the coverage‑aware SPEC._

Any guided strategy must respect the following constraints:

- **Validity first**  
  Hints and heuristics may never cause invalid instances to be emitted.

- **Hint scope and priority**  
  - Hints apply only to the `structure`, `branches`, and `enum` dimensions
    in V1.
	  - `coverEnumValue` takes precedence over `preferBranch`, which takes
	    precedence over `ensurePropertyPresence` at the same schema node.
	  - Within a hint kind, ordering must be stable and deterministic.

- **Dimensions & reachable targets**  
  - `dimensionsEnabled` decides which coverage dimensions materialise
    `CoverageTarget` entries; guided cannot invent new dimensions or reinterpret
    their meaning.
  - For any enabled dimension, `CoverageTarget.id` and the ordering of
    `targets[]` for that dimension must remain stable across coverage modes and
    profiles; they may not depend on `maxInstances`, guided vs measure, or
    `excludeUnreachable`.
  - `excludeUnreachable` only affects denominators in coverage metrics; targets
    marked `status:'unreachable'` must remain visible and keep their IDs
    regardless of this flag.

- **Determinism**  
  - No new RNG sources may be introduced by coverage. Guided must reuse the
    same seeded RNG model as the generator (or pure derived seeds) so that
    for a fixed tuple `(schema, options, seed, AJV major, registryFingerprint)`
	    behaviour is stable.
	
	- **Non‑regression vs measure**  
	  For fixed options and budget, guided must not reduce `branches` or `enum`
	  coverage compared to measure. When improvement is impossible, targets must
	  still appear with appropriate diagnostics / `unsatisfiedHints`. At the
	  strategy level, guided should behave as a monotone extension of measure:
	  reuse the same RNG stream and baseline exploration as measure, and layer
	  hints on top so that they can only maintain or increase effective coverage
	  for branches and enums. When planner attempts for a target keep failing
	  (caps, conflicting constraints), guided must stop before consuming
	  disproportionate budget and leave measure‑equivalent coverage intact.

- **Budget and caps reporting**  
  - `maxInstances` is a hard upper bound.
  - Planner caps must be reflected in diagnostics and in per‑target metadata
    (`planned` vs `unplanned`).

Within these constraints, the SPEC does not prescribe how to **order**
targets or distribute the budget — that is the design space for this brief.

---

## 5. High‑Level Strategy

_Conformance: Informative (suggested structuring of the planner; concrete algorithms may evolve)._

We view guided strategy as three cooperating decisions:

1. **Target ordering (global priority)**  
   - How to linearize / partition the set of coverage targets into a worklist
     that the planner will attempt to assign to TestUnits.

2. **Budget allocation**  
   - How to distribute the global budget (`maxInstances`, caps per dimension)
     across targets, schemas, and operations.

3. **Hint application policy**  
   - How aggressively hints should be used to steer generation, and when to
     “give up” on a target to avoid over‑spending budget.

The concrete algorithms can evolve, but they should adhere to a few
principles:

- Prefer **breadth first** at the start (cover at least one branch/enum per
  area) before attempting deep coverage of a single complex region.
- Avoid re‑targeting the same already‑covered targets unless needed for
  determinism or diversity.
- Use simple, stable scoring functions (e.g. weight by dimension, then by
  operation name, then by structural depth) to keep behaviour explainable.

### Canonical scoring shape (proposal)

_Conformance: Informative (example scoring model; not a hard requirement)._

Conceptually, we can treat target ordering as sorting by a stable tuple:

- `dimensionWeight[target.dimension]` — prioritise `branches` and `enum`
  before pure `structure` once basic structural coverage is reached.
- `operationOrder[target.operationKey]` — a stable index derived from
  `(path, method)` for OpenAPI or from scope identifiers for JSON Schema.
- `structuralDepth(target.canonPath)` — shallower targets first to favour
  broad exploration.
- `target.localIndex` — a stable tie‑breaker within the same scope.

Profiles may adjust weights but must preserve stability and fairness
invariants described below.

---

## 6. Fairness & Prioritization

_Conformance: Informative (recommended fairness heuristics; numeric thresholds are not yet normative)._

We propose to make target prioritization explicit along two axes:

1. **Dimension and motif priority**
   - Branches and enums are the primary guided dimensions in V1; within a
     schema, they should generally be prioritized over pure structure once
     basic structural coverage is reached.
   - Some motifs (e.g. `oneOf` branches on top‑level responses) may be given
     higher priority than deep nested enums, depending on profile.

2. **Operation / scope fairness**
   - For OpenAPI specs, operations (`path + method`) should receive a fair
     share of attention. Simple strategies include:
     - round‑robin scheduling of operations in the planner,
     - per‑operation caps on instances to prevent starvation.
   - For pure JSON Schemas, analogous notions of “scope” can be defined
     (e.g. top‑level properties or major subtrees).
   - Fairness guardrails:
     - under any profile with a budget above a minimal threshold, no operation
       or scope with reachable targets should end the run with zero `planned`
       targets if some other operation has more than a small constant `K`
       planned targets;
     - once every reachable operation/scope has at least one planned target,
       additional budget can be allocated proportionally to target count or
       structural complexity.
     These guardrails are currently informative guidelines; the exact `K` and the minimal budget threshold are subject to tuning and may be tightened into normative requirements in a future SPEC revision.

The exact scoring function is left as an implementation choice, but it should
be stable and documented so that planner diagnostics can surface it when
needed.

---

## 7. Profiles & Budget Interaction

_Conformance: Mixed. Baseline integration with CLI profiles and the non‑regression requirement are normative; specific numeric presets and presets table below are informative._

Guided strategy must integrate with CLI coverage profiles and budgets:

- `quick`  
  - small `maxInstances`, aggressive caps,
  - favour breadth over depth: try to hit at least one branch/enum per major
    scope; accept that many targets remain unplanned but visible.

- `balanced`  
  - moderate `maxInstances`, moderate caps,
  - aim for good coverage on branches and enums across most operations.

- `thorough`  
  - large `maxInstances`, minimal caps (except global safety),
  - aim to exhaust branch/enum targets where feasible; may enable additional
    dimensions once available.

The planner should treat profiles as presets for:

- `maxInstances`,
- per‑dimension caps,
- scoring weights (dimension vs scope),
	- and possibly retry strategies.
	
	Profiles must not violate the SPEC’s non‑regression guarantee; they only
	change *how much* improvement guided is allowed to pursue under a given
	budget.

Illustrative defaults (to be refined in SPEC and implementation) could be:

_Conformance: Informative presets only; they illustrate reasonable defaults and do not constrain compliant implementations._

| Profile   | Typical `maxInstances` | Dimensions enabled (V1)                | Notes                                                |
| --------- | ---------------------- | -------------------------------------- | ---------------------------------------------------- |
| `quick`   | ~50–100                | `['structure','branches']`             | strongly breadth‑first; aggressive per‑scope caps    |
| `balanced`| ~200–500               | `['structure','branches','enum']`      | trade‑off breadth vs depth across most operations    |
| `thorough`| ≥1000                  | all V1 dimensions when available       | caps disabled except global safety and bench gates   |

These presets must respect global latency and memory gates defined elsewhere
and remain compatible with the non‑regression invariant vs `coverage=measure`.

---

## 8. Observability & Metrics

_Conformance: Informative (diagnostics and metrics shape; complements the coverage‑aware SPEC and observability brief)._

To make guided strategy auditable, we should introduce:

- **Per‑target planning metadata**
  - whether a target was planned for at least one TestUnit,
  - whether it was covered, unreachable, or blocked by caps/conflicts,
  - a brief reason code for unplanned or uncovered targets.

- **Per‑run metrics**
  - number of TestUnits produced,
  - number of instances used vs `maxInstances`,
  - coverage gain vs measure by dimension,
  - distribution of instances per operation/scope.

- **Hint effectiveness statistics**
  - number of hints applied vs unsatisfied,
  - breakdown by reason (`REPAIR_MODIFIED_VALUE`, conflicting constraints,
    caps, unreachable).

These metrics should be visible in coverage reports and/or in lightweight
debug outputs so that we can tune the strategy and add tests that assert
high‑level invariants (e.g. no operation starved, guided ≥ measure holds).

Per‑target planning metadata (`planned` / `unplanned`, status and reason) can
either extend `CoverageTargetReport` or be surfaced through dedicated
diagnostics with standardised reason codes (for example `CAP_REACHED`,
`CONFLICTING_CONSTRAINTS`, `UNREACHABLE`). The eventual SPEC should normalise
these shapes; this brief only fixes the conceptual states and expected
metrics. For the broader metrics story and consumers, see also
`docs/design-observability-metrics.md`.

---

## 9. Next Steps & Open Questions

_Conformance: Informative (roadmap and questions for future work)._

Open questions:

- What is the minimal scoring model that balances fairness, determinism, and
  explainability?
- How should we expose guided strategy “modes” beyond the core profiles
  (e.g. a debug mode that focuses on a specific operation or dimension)?
- How aggressively should guided attempt diversity within an already covered
  target (e.g. multiple enum values in the same region) vs moving on to new
  targets?

Suggested next steps:

1. Implement basic metrics and per‑target planning metadata to gain visibility
   into current guided behaviour.
2. Prototype a simple, documented target ordering + fairness strategy and
   measure its impact on existing coverage tests.
3. Wire the strategy into CLI profiles (`quick` / `balanced` / `thorough`)
   with clear defaults and document the behaviour in user‑facing docs.
4. Add invariants and tests that explicitly check guided ≥ measure on key
   schemas and that no major operation is left entirely untouched under
   reasonable budgets.
