# FoundryData – “Coverage‑aware” Requirements

> **Status:** Draft V1 (coverage‑aware)
> **Audience:** FoundryData core / CLI / reporter maintainers, platform & API teams
> **Scope:** JSON Schema + OpenAPI 3.1, AJV‑first, deterministic core

---

## 1. Context & goals

FoundryData is an AJV‑first, deterministic test data engine for JSON Schema and OpenAPI 3.1. It generates instances through the existing 5‑stage pipeline:

```text
Normalize → Compose → Generate → Repair → Validate
```

Every instance that leaves the pipeline is validated by AJV against the original schema; the same `(schema, seed, options)` produces the same instances. 

The “coverage‑aware” work extends FoundryData from a “plain generator of valid instances” to a **contract test suite generator**:

1. **Measure** which parts of a schema or OpenAPI contract are actually exercised by generated instances.
2. **Guide** generation toward explicit coverage objectives under a fixed budget (instances, time).
3. **Track** coverage over time (multi‑run, CI baselines and diffs).

The coverage layer must **not** change validation semantics: AJV remains the oracle, and the existing Normalize→Compose→Generate→Repair→Validate pipeline remains the source of truth.

---

## 2. Scope & non‑goals

### 2.1 In scope for V1 (M0/M1/M2)

**Phase M0 – measurement‑only core**

* CoverageGraph derived from the canonical view produced by `Normalize/Compose`.
* Definition and materialization of CoverageTargets.
* Passive measurement of coverage for:

  * schemas / subschemas (`SCHEMA_NODE`),
  * presence of optional properties (`PROPERTY_PRESENT`),
  * simple branches (`ONEOF_BRANCH`, `ANYOF_BRANCH`, `CONDITIONAL_PATH`),
  * enum values (`ENUM_VALUE_HIT`).
* Coverage computed **from final instances** (after Repair + Validate).
* JSON coverage report (versioned) + CLI summary.
* `coverage=measure` mode; generator behavior unchanged vs today.

**Phase M1 – guided generation (core V1)**

* CoveragePlanner that proposes deterministic **TestUnits**:

  * derived seeds from a master seed,
  * a bounded number of instances per TestUnit,
  * a set of hints (`preferBranch`, `ensurePropertyPresence`, `coverEnumValue`).
* `coverage=guided` mode:

  * coverage‑oriented hints applied in the generator,
  * hints reconciled with existing generator heuristics and with Repair.
* `minCoverage` threshold (overall) with a dedicated non‑zero exit code when not met.
* Streaming instrumentation for coverage (no full post‑pass re‑parse in steady state).

**Phase M2 – extensions within V1**

* Coverage of simple boundaries:

  * `NUMERIC_MIN_HIT`, `NUMERIC_MAX_HIT`,
  * `STRING_MIN_LENGTH_HIT`, `STRING_MAX_LENGTH_HIT`,
  * `ARRAY_MIN_ITEMS_HIT`, `ARRAY_MAX_ITEMS_HIT`.
* Coverage per OpenAPI operation:

  * `OP_REQUEST_COVERED`, `OP_RESPONSE_COVERED`,
  * `coverage.byOperation`.
* Simple multi‑run comparison:

  * diff between two reports (N vs N‑1),
  * detection of coverage regressions and new uncovered targets.

### 2.2 Explicit non‑goals for V1 (V2+ candidates)

The design must leave room for, but **does not implement** in V1:

* Contract scenarios across multiple operations (`create → get → update → delete`).
* Negative coverage (targeted invalid instances).
* Risk‑based / weighted coverage (beyond inert `weight` fields).
* Advanced multi‑run aggregation (N seeds / N runs).
* HTTP executors (MSW, Prism, etc.) – they live outside the core.
* Rich distribution coverage (numeric/string buckets, value distributions) beyond enums.

---

## 3. Coverage model

### 3.1 Inputs & CoverageGraph

The **CoverageGraph** is derived from the canonical view and artifacts produced by `Normalize/Compose` (canonical schema, `ptrMap`, `planDiag`, `CoverageIndex`, etc.), not from the raw schema text. It **must not** re‑implement JSON Schema semantics.

Coverage events and hit semantics are derived from this canonical view plus instrumentation in `Compose` / `Generate` / `Repair`. AJV remains the oracle for final validity in `Validate`, but the coverage layer is not required to trace AJV’s internal evaluation paths and MUST treat AJV primarily as a yes/no validity check over the final instances.

**Nodes (conceptual):**

* `SchemaNode`
  Any schema / subschema node in the canonical view (including resolved `$ref` in the view).
* `PropertyNode`
  Object properties (`user.name`), including declared properties and, where applicable, AP:false coverage via `CoverageIndex`.
* `BranchNode`
  One branch of a logical structure (`oneOf`, `anyOf`, `allOf`, `if/then/else`, `dependentSchemas`).
* `ConstraintNode`
  Simple boundaries (min/max, minLength/maxLength, minItems/maxItems, etc.) where coverage is defined.
* `EnumNode`
  Individual value of an `enum` or per‑value logical equivalent (e.g. small `const` sets).
* `OperationNode`
  OpenAPI entries for a request or response schema attached to an operation.

**Edges (selected):**

* Structural: `schema → property`, `schema → branch`, `schema → constraint`, `schema → enum`.
* Logical: `oneOf → branch i`, `if → then/else`, `dependentSchemas` links.
* Reference: `$ref` to canonical target; the canonical view collapses followable refs.
* OpenAPI usage:

  * Operation → request schema,
  * Operation → response schemas per `(status, contentType)`.

Operation keys are:

```text
operationKey = operationId || "<METHOD> <path>"
```

(e.g. `GET /users/{id}` when `operationId` is absent).

The CoverageGraph is **deterministic** and **canonical** for a given canonical view (no RNG, no order‑of‑insertion effects).

### 3.2 CoverageTargets

A **CoverageTarget** is a unit of coverage defined on a node (or small tuple of nodes) in a given **dimension**.

**Shape (simplified):**

```ts
type CoverageTarget = {
  id: string; // stable within a FoundryData major + report format version
  dimension: CoverageDimension;
  kind: string; // e.g. "SCHEMA_NODE", "PROPERTY_PRESENT", "ONEOF_BRANCH"
  canonPath: string; // canonical JSON Pointer
  operationKey?: string; // for API-linked targets
  params?: Record<string, unknown>; // e.g. { branchIndex: 1 }, { enumIndex: 2 }

  status?: 'active' | 'unreachable' | 'deprecated';
  weight?: number; // reserved for risk-based coverage (V2+)
  polarity?: 'positive' | 'negative'; // reserved (positive vs negative coverage)
  meta?: Record<string, unknown>; // diagnostics-only annotations
};

type CoverageTargetReport = CoverageTarget & {
  hit: boolean;
};
```

**ID stability**

* `id` **must** be stable across runs for a fixed tuple:

  * canonical schema,
  * OpenAPI mapping (if any),
  * FoundryData **major version**,
  * coverage report **format major**.

  Enabling or disabling coverage dimensions only changes **which subset of targets is materialized** in a given run; it MUST NOT change the `id` of any target that exists when its dimension is enabled, nor renumber existing targets in other dimensions. In other words, `dimensionsEnabled` is a projection/filter over a stable target universe, not an input into ID generation.
* In V1, `id` generation MUST NOT depend on:

  * runtime coverage results (`hit` flags, coverage bitmaps),
  * `status` (`active` / `unreachable` / `deprecated`),
  * `weight` or `polarity`,
  * `meta`,
  * `dimensionsEnabled`,
  * `excludeUnreachable`,
  * planner decisions (caps, hints, TestUnit boundaries).

  Implementations MAY use `(dimension, kind, canonPath, operationKey?, params?)` and other canonical, static information as inputs to `id` generation, but MUST treat coverage configuration and runtime outcomes as orthogonal.
* Cross‑major changes **may** change IDs and/or target sets; such changes **must** bump the coverage report `version` and be documented.

**Status semantics**

* `status: 'active'` (default)
  Target is considered in scope and reachable; it contributes to coverage metrics.
* `status: 'unreachable'`
  Implementation believes the target cannot be exercised (e.g. statically UNSAT, contradictory constraints).

  * V1 may mark targets as `unreachable` based on heuristics; it is not required to detect all impossible targets.
  * In V1, `unreachable` SHOULD primarily be derived from existing UNSAT and guardrail diagnostics produced by Normalize / Compose / `CoverageIndex` and recorded in `planDiag` (for example `UNSAT_*`, `CONTAINS_UNSAT_BY_SUM`, `UNSAT_NUMERIC_BOUNDS`, `UNSAT_AP_FALSE_EMPTY_COVERAGE`). CoverageAnalyzer MUST NOT introduce a separate global proof engine beyond these existing analyses; any additional heuristics MUST be conservative (never misclassify a reachable target as `unreachable`) and SHOULD be documented.
* `status: 'deprecated'`
  Targets that are structurally present but intentionally ignored for metrics. In V1 this includes, in particular,
  diagnostic-only targets that MUST remain visible in reports but MUST NOT contribute to coverage metrics or threshold
  enforcement (e.g. `SCHEMA_REUSED_COVERED` in the inter-schema / API coverage dimension). Future versions MAY refine
  this usage, but the invariant that `status:'deprecated'` excludes a target from all coverage denominators MUST hold.

Interaction with metrics is defined in §3.5.

**Weight & polarity**

* In V1, `weight` and `polarity` are **present but inert**:

  * they **do not** affect `coverage.overall`, `coverage.byDimension`, or enforcement of `minCoverage`;
  * they exist only to support risk‑based and negative coverage in future versions without breaking the report format.

### 3.3 Dimensions (V1)

V1 defines the following coverage dimensions; some are active in M0/M1, others are planned for M2+. Each dimension has a
stable string key used in `CoverageTarget.dimension`, `run.dimensionsEnabled` and `metrics.byDimension`:

```ts
type CoverageDimension =
  | 'structure'
  | 'branches'
  | 'enum'
  | 'boundaries'
  | 'operations';
```

1. **Structural coverage** (`dimension: 'structure'`)

  * Questions:

     * “Was this schema / subschema instantiated at least once?”
     * “Was this optional property ever present?”
   * Targets:

     * `SCHEMA_NODE` – schema or subschema instantiated ≥ 1 time.
     * `PROPERTY_PRESENT` – optional property present ≥ 1 time.
   * For V1:

   * `SCHEMA_NODE` is defined over canonical schema nodes in the composed view. At runtime, a `SCHEMA_NODE` is hit when at least one instance that **successfully passed Validate** has been produced through generation/repair paths that include that canonical node, and the generator / Repair instrumentation emits a coverage event attached to that node. Implementations MUST derive `SCHEMA_NODE` hits from the canonical view and Compose artifacts (e.g. `ptrMap`, `planDiag`) and from instrumentation in `Generate` / `Repair`; they MUST NOT require tracing AJV’s internal evaluation paths, and MUST NOT re‑interpret JSON Schema semantics by reparsing the raw schema.
     * Implementations MAY buffer per‑instance coverage events and only mark targets as hit once the corresponding instance has passed `Validate`. When Repair modifies an instance before `Validate`, all `SCHEMA_NODE` and related target hits MUST be derived from the instance as it emerges from Repair and successfully passes `Validate`, not from earlier, pre‑repair snapshots; coverage is always defined with respect to the final, AJV‑accepted instance.
     * `PROPERTY_PRESENT` applies to declared properties (`properties` / `required`) and, for AP:false objects, to property names that are provably generable according to the existing `CoverageIndex`. In V1, `PROPERTY_PRESENT` for undeclared names under AP:false MUST use `CoverageIndex.has` / `CoverageIndex.enumerate` as its sole source of truth; the coverage layer MUST NOT introduce additional approximations that diverge from `CoverageIndex` semantics and MUST NOT attempt a separate automaton for `patternProperties` beyond that.

2. **Branches & simple conditionals** (`dimension: 'branches'`)

   * Questions:

     * “Was each `oneOf` / `anyOf` branch exercised at least once?”
     * “Were both `if/then` and `if/else` paths observed where applicable?”
   * Targets:

     * `ONEOF_BRANCH`, `ANYOF_BRANCH` – by branch index.
     * `CONDITIONAL_PATH` – e.g. `if+then`, `if+else`, activated vs non‑activated `dependentSchemas`.
   * V1 focuses on simple conditionals that are already handled safely in Compose / Generate. V1 does **not** define branch‑level coverage for `allOf`; schemas combined via `allOf` are covered indirectly through `SCHEMA_NODE`, constraints, and properties defined on the canonical nodes involved.

3. **Enum / small discrete values** (`dimension: 'enum'`)

   * Questions:

     * “Was each member of an enum used at least once?”
   * Targets:

     * `ENUM_VALUE_HIT` – per value in an `enum`.
   * Large enums:

     * For very large enumerations, implementations **may** deterministically subsample and record this in `meta` and in coverage diagnostics (for example via `meta.enumSubsampled:true` and/or a record of skipped indices). Subsampling MUST be deterministic for a fixed canonical view and options; repeated runs with the same `(canonical schema, options)` MUST select the same subset of enum values for CoverageTargets.

4. **Boundaries (M2)** (`dimension: 'boundaries'`)

   * Targets defined but not required in M0/M1:

     * `NUMERIC_MIN_HIT`, `NUMERIC_MAX_HIT`,
     * `STRING_MIN_LENGTH_HIT`, `STRING_MAX_LENGTH_HIT`,
     * `ARRAY_MIN_ITEMS_HIT`, `ARRAY_MAX_ITEMS_HIT`.
   * V1 does **not** require exhaustive combination coverage of constraints; boundaries are scoped to simple, locally testable cases.
   * Semantics:

     * Inclusive numeric bounds (`minimum`, `maximum`) are hit when the emitted value is exactly equal to the bound.
     * Exclusive numeric bounds (`exclusiveMinimum`, `exclusiveMaximum`) are hit when the emitted value is the **boundary representative** selected by the numeric generation rules for that node: a deterministic value strictly inside the domain that satisfies all applicable numeric constraints (including `multipleOf`), but not necessarily the mathematically closest possible one. Implementations MUST align this representative with the numeric planning / generation rules already used in Compose / Generate and MUST document the strategy; the coverage layer MUST NOT require a separate global optimality notion beyond those rules.
     * When `min == max` (or `minLength == maxLength`, `minItems == maxItems`), implementations MAY model this as a single logical boundary target, or as two targets that are always hit together; in all cases, the chosen strategy MUST be deterministic for a given canonical schema.
     * **Reachability and `multipleOf`:**
       * When Compose can prove that an inclusive bound itself is not in the admissible domain (for example because of `multipleOf` or other numeric constraints), implementations MUST NOT keep a corresponding `NUMERIC_MIN_HIT` / `NUMERIC_MAX_HIT` target as `status:'active'` for that unreachable value. They MUST either avoid materializing such a target altogether, or materialize it with `status:'unreachable'`.
       * When the domain is non‑empty but the exact inclusive bound is not generable and a boundary representative is used instead, coverage for that boundary is defined with respect to that representative value as chosen by the numeric planning / generation rules. The coverage layer MUST NOT require a different representative than the one already used by numeric planning.

5. **Inter‑schema / API coverage (M2)** (`dimension: 'operations'`)

   * Questions:

     * “Did we generate at least one request / response for each operation?”
     * “Are shared schemas actually instantiated in at least one operation context?”
   * Targets:

     * `OP_REQUEST_COVERED`, `OP_RESPONSE_COVERED` – per `operationKey`.
     * `SCHEMA_REUSED_COVERED` – schema used in multiple operations and instantiated at least once.

   * Schema selection rules for OpenAPI:

     * Requests – when multiple request body content types are present, the implementation MUST select the first JSON media type when content types are sorted lexicographically by media type (e.g. `application/json`, `application/problem+json`, …).
     * Responses – when multiple responses and content types are present:

       * if a `200` response with a JSON media type exists, it MUST be selected;
       * otherwise, the implementation MUST select the first `2xx` response with a JSON media type when response codes are sorted ascending and media types are sorted lexicographically;
       * if no `2xx` JSON responses exist, the implementation MUST select the first `(status, mediaType)` pair whose media type is JSON when sorted lexicographically by status code and media type.

   * For V1, `OP_RESPONSE_COVERED` is defined with respect to 2xx JSON responses only. Other status codes and content types are excluded from coverage metrics.
   * In V1, `SCHEMA_REUSED_COVERED` is diagnostic‑only: implementations MUST emit these targets with `status:'deprecated'` and `dimension:'operations'`. They MAY appear in `targets[]`, `uncoveredTargets[]` and diagnostics, but they do not contribute to `coverage.overall`, `coverage.byDimension` or `coverage.byOperation` and MUST NOT affect `minCoverage` enforcement; they are counted only in `metrics.targetsByStatus.deprecated`.
   * **Operation scope for a run:**

     * When the engine is invoked against an OpenAPI document but only a subset of operations is explicitly targeted (for example via CLI selection flags), the coverage report MUST set `run.operationsScope:'selected'` and list the operation keys that were actually in scope in `run.selectedOperations`.
     * In that case, `coverage.byOperation` is defined only for the in‑scope operations, and only their associated targets contribute to `activeTargetsTotal`, `coverage.overall`, and `minCoverage` enforcement. Operations outside this scope MAY be omitted entirely from `coverage.byOperation` for the run.
     * When all operations from the spec are in scope, implementations SHOULD set `run.operationsScope:'all'` and MAY omit `run.selectedOperations`.

6. **Value distribution (V2+)**

   * Rich distribution metrics (numeric buckets, string length buckets, pattern diversity) are explicitly postponed to V2+.
   * V1 focuses on structural, branches, enums, and simple boundaries.

### 3.4 Example of CoverageTargets

Given this (simplified) schema:

```json
{
  "$id": "User",
  "type": "object",
  "properties": {
    "kind": {
      "type": "string",
      "enum": ["admin", "member", "guest"]
    },
    "email": {
      "type": "string",
      "format": "email"
    },
    "age": {
      "type": "integer"
    }
  },
  "required": ["kind"],
  "oneOf": [
    { "properties": { "age": { "minimum": 0 } } },
    { "properties": { "age": { "minimum": 18 } } }
  ]
}
```

A minimal set of targets could be:

```json
[
  {
    "id": "struct:User",
    "dimension": "structure",
    "kind": "SCHEMA_NODE",
    "canonPath": "#",
    "status": "active"
  },
  {
    "id": "prop:User/email:present",
    "dimension": "structure",
    "kind": "PROPERTY_PRESENT",
    "canonPath": "#/properties/email",
    "status": "active"
  },
  {
    "id": "branch:User:oneOf:0",
    "dimension": "branches",
    "kind": "ONEOF_BRANCH",
    "canonPath": "#/oneOf",
    "params": { "branchIndex": 0 },
    "status": "active"
  },
  {
    "id": "branch:User:oneOf:1",
    "dimension": "branches",
    "kind": "ONEOF_BRANCH",
    "canonPath": "#/oneOf",
    "params": { "branchIndex": 1 },
    "status": "active"
  },
  {
    "id": "enum:User/kind:0",
    "dimension": "enum",
    "kind": "ENUM_VALUE_HIT",
    "canonPath": "#/properties/kind",
    "params": { "enumIndex": 0, "value": "admin" },
    "status": "active"
  }
]
```

### 3.5 Metrics & semantics

At minimum, the coverage system must compute:

* `coverage.overall`
  Global ratio of covered targets:

  ```text
  coverage.overall = activeTargetsHit / activeTargetsTotal
  ```

  where:

  * `activeTargetsTotal` includes **only** targets:

    * whose `dimension` is enabled for this run, and
    * whose `status` is **not** `'deprecated'`, and
    * whose `status` is:

      * `'active'`, or
      * optionally `'unreachable'` if the “exclude unreachable” policy is disabled (see below).

  `coverage.overall` is therefore a **flat average** over all active targets across all enabled dimensions — effectively a global diagnostic score. It can be useful as a coarse guardrail (e.g. for `minCoverage`), but it mixes targets of very different criticality (e.g. `SCHEMA_NODE` vs `ONEOF_BRANCH`). Consumers SHOULD treat `coverage.overall` as an aggregate signal only and SHOULD rely primarily on `coverage.byDimension` (in particular branches and enums) to assess the quality of coverage. A high `coverage.overall` with low `coverage.byDimension['branches']` MUST NOT be interpreted as “fully covered”. Future versions are expected to add explicit per‑dimension thresholds to better capture nuanced coverage objectives.

* `coverage.byDimension[dimension]`
  Same definition, but restricted to targets with the given `dimension`.

* `coverage.byOperation[operationKey]`
  Ratio over all targets that are:

  * attached directly to an operation (`OP_*`), **and**
  * schema‑level targets reachable via that operation (e.g. `ONEOF_BRANCH`, `ENUM_VALUE_HIT` on the request/response schema), and
  * whose `dimension` is present in `run.dimensionsEnabled`.

  Operation-level targets (`OP_REQUEST_COVERED`, `OP_RESPONSE_COVERED`) are considered part of the `'operations'`
  dimension. When `'operations'` is not enabled, these targets MUST NOT be materialized for the run and MUST NOT
  contribute to `coverage.byOperation`; per-operation ratios are then computed only over schema-level targets from the
  enabled dimensions that are reachable from the operation.

    A single `CoverageTarget` may therefore contribute to multiple `coverage.byOperation[operationKey]` entries;
    `coverage.byOperation` is a projection over operations, not a disjoint partition, and the sum (or any aggregation)
    of per‑operation coverage ratios is **not** expected to match `coverage.overall`. Consumers MUST NOT attempt to
    reconstruct `coverage.overall` by summing or averaging `coverage.byOperation` metrics.

* `coverage.details`
  Explicit listing of uncovered targets ordered by priority (dimension, `weight`, type, path).

> **Important – Interpretation of coverage metrics**
>
> * Coverage metrics (`coverage.overall`, `coverage.byDimension`, `coverage.byOperation`) measure how many **coverage targets** were hit in the enabled dimensions under the configured budget (`maxInstances`, planner caps, `excludeUnreachable`), not the intrinsic quality of the implementation or the tests that consume the generated data.
> * A value `coverage.overall = 1.0` MUST be read as: *all targets considered reachable by the engine in the enabled dimensions for this run were hit at least once*. It does **not** prove that:
>   * the schema is fully satisfiable (parts of the contract may be UNSAT but not detected by current analyses), or
>   * all business‑level behaviors of the system under test have been exercised.
> * Consumers SHOULD treat coverage metrics as guardrails on **schema‑level exploration by the generator** and combine them with independent signals (e.g. code coverage, business assertions, manual scenarios) when assessing overall test quality.

**Dimensions enabled**

The report must include:

```json
{
  "dimensionsEnabled": ["structure", "branches", "enum"]
}
```

Only these dimensions:

* are included in `activeTargetsTotal`,
* appear in `coverage.byDimension`,
* contribute to `coverage.byOperation` (including operation-level targets when `'operations'` is present),
* are considered when enforcing `minCoverage` in V1.

In V1, dimensions that are **not** listed in `dimensionsEnabled` MUST NOT produce `CoverageTarget` entries and MUST NOT appear in `targets[]`. This keeps reports focused on the active dimensions used for metrics and CI enforcement; a future version MAY introduce an optional “full introspection” mode that materializes all dimensions while still filtering metrics by `dimensionsEnabled`.
This constraint applies to the default coverage modes (`coverage=measure` / `coverage=guided`) and the standard `reportMode` values; an implementation MAY add a clearly labelled debug or introspection mode that emits additional targets while still treating `dimensionsEnabled` as the sole filter for metrics and threshold enforcement.
`dimensionsEnabled` MUST NOT influence the assignment or format of `targets[].id` for dimensions that remain enabled.

**Unreachable targets policy**

Because some targets may be logically impossible to satisfy:

* A target can be flagged `status:'unreachable'` when the engine can prove or strongly suspect UNSAT.
* The coverage report must:

  * expose counts per status (e.g. `targetsByStatus`),
  * include enough information to inspect unreachable cases.

  In `coverage-report/v1`, unreachable targets are represented as entries in `targets` and `uncoveredTargets` whose
  `status` is `'unreachable'`. There is no dedicated `unreachableTargets` top-level field; tooling obtains an
  unreachable view by filtering on the `status` field.
* A configuration flag (e.g. `coverage.excludeUnreachable`) controls whether `unreachable` targets are:

  * **excluded** from the denominator (default in CI), or
  * **included** (strict accounting).

Implementations MUST treat `status:'unreachable'` as a conservative label: a target SHOULD only be marked `unreachable` when there is a proof or very strong signal (e.g. explicit UNSAT diagnostics from Compose, clearly contradictory constraints). When in doubt, implementations MUST prefer leaving a target `active` (and potentially uncovered) rather than misclassifying it as `unreachable`, and SHOULD document the heuristics and signals used to infer `unreachable`. Test suites SHOULD include cases that catch false‑positive `unreachable` markings as quality issues.

For V1, the **recommended default** is `excludeUnreachable:true` for CLI and CI integrations; strict accounting (`excludeUnreachable:false`) SHOULD be treated as an opt‑in, diagnostic mode. Operators SHOULD be aware that `coverage.overall=1.0` under `excludeUnreachable:true` does **not** prove that the schema is fully satisfiable; it means that all targets deemed reachable under the current heuristics and diagnostics were hit at least once.

The behavior and flag name are part of the implementation; the requirement is to support both interpretations and make them explicit in the report header.

---

## 4. Architecture & components

Coverage‑aware behavior fits into the existing pipeline as:

```text
Normalize → Compose → CoverageAnalyzer → CoveragePlanner → Generate* → Repair → Validate → CoverageEvaluator
```

Where `Generate*` is the existing generator, instrumented for coverage and hints.

### 4.1 CoverageAnalyzer

**Input:**

* Canonical schema(s) and Compose artifacts:

  * `canonSchema`,
  * `ptrMap`,
  * `CoverageIndex` (for AP:false objects),
  * `planDiag` (diagnostics, complexity caps, UNSAT hints),
* Optional OpenAPI context (operations, request/response mapping).

**Output:**

* `CoverageGraph` – structural graph over schema nodes, properties, branches, enums, constraints, operations.
* Exhaustive list of `CoverageTarget` for the enabled dimensions.

**Requirements:**

* Uses only canonical view / Compose outputs; does not re‑parse the raw schema.
* Must be deterministic for fixed inputs; no RNG or time‑dependent behavior.
* May mark some targets as `status:'unreachable'` using:

  * UNSAT diagnostics (e.g. contradictory constraints),
  * branch pruning information from Compose,
  * internal heuristics.

### 4.2 CoveragePlanner

**Input:**

* `CoverageGraph` and full `CoverageTarget` set.
* Coverage objectives:

  * enabled dimensions,
  * target priorities (structure vs branches vs enums vs boundaries),
  * budget:

    * `maxInstances` (or `--n`),
    * optional soft time cap.

**Output:**

* Deterministic sequence of **TestUnits**:

  ```ts
  type TestUnit = {
    id: string;
    seed: number;
    count: number; // planned number of instances (upper bound)
    hints: Hint[];
    scope?: {
      operationKey?: string;
      schemaPaths?: string[];
    };
  };
  ```

**Planner properties:**

* **Greedy & static in V1**

  * Planner builds all TestUnits up front based on the initial `CoverageTarget` set.
  * It does not require feedback from the run, other than coverage results used for reporting.
  * This does not forbid a future adaptive, deterministic planner; the V1 spec chooses static for simplicity.

* **Prioritization strategy (informative default):**

  1. Operations (if OpenAPI context is present), to avoid starving smaller endpoints.
  2. Dimensions (when enabled): branches → enums → structure → boundaries, unless overridden by non‑default `weight`.
  3. Within each dimension, sort targets deterministically, using `weight` (when used) followed by lexical order of `canonPath`; the sort MUST be stable for a given canonical schema and options.

* **Budget semantics:**

  * `maxInstances` (and CLI `--n`) is an **upper bound**, not a strict requirement:

    * The planner **may generate fewer instances** if:

      * all active targets are covered, or
      * remaining targets are `unreachable` / too costly given configured caps.
  * The planner must document when it stops early because:

    * objectives are satisfied,
    * complexity caps or internal limits were hit.

* **Scaling behavior:**

  * For large target sets, the planner may:

    * cap targets per dimension / per schema / per operation in a deterministic way,
    * drop lowest‑priority targets within those caps, while still materializing them in the Analyzer’s `CoverageTarget` set so they remain visible in `targets[]` even when not planned.
  * Any such caps must:

    * be deterministic,
    * be surfaced in diagnostics and/or the coverage report (e.g. `plannerCapsHit` summary).

* **Target explosion & budget:**

  * When caps are applied in `coverage=guided` mode, every target that is not selected by the Planner for any `TestUnit` MUST still appear in `targets[]` and MUST carry `meta.planned:false`.
  * In `coverage=guided` mode, `diagnostics.plannerCapsHit` MUST summarize the effect of caps for each affected `(dimension, scopeType, scopeKey)` tuple, including counts of `totalTargets`, `plannedTargets`, and `unplannedTargets`.
  * When caps are hit, the implementation MUST favor deterministic, bounded behavior over attempting exhaustive coverage; the coverage report MUST make it explicit where and how targets were left unplanned (via `meta.planned:false` and `plannerCapsHit` entries), so that this degradation under constraint is fully auditable.

### 4.3 Generator instrumentation

The existing generator is extended to:

* Accept **hints** (see §5) in the `GenerationContext`.
* Emit coverage events during generation and repair, in a streaming fashion.
* Maintain a per-instance, implementation-defined **hint trace** that records which hints were actually applied to which
  values or structures, and make this trace available to both `Generate` and `Repair` for the purpose of emitting
  `unsatisfiedHints` (see §5.3).

**Streaming vs post-pass:**

* In `coverage=guided` mode, coverage marking MUST be streaming and MUST NOT require reparsing emitted instances.
* Steady‑state V1 behavior must **not** require a full second parse of all generated instances to compute coverage; in particular, the implementation MUST NOT re‑parse the already‑emitted JSON stream solely to compute coverage.
* Coverage state MAY be accumulated per instance as it flows through `Generate` and `Repair`; implementations MAY buffer per‑instance coverage events and only commit hits once `Validate` has accepted the instance.
* “No full post‑pass re‑parse” therefore means “no second JSON parse of the output stream”, not “no per‑instance state” or “no buffering”.
* Coverage must be updated **as instances are generated and repaired**, with finalization after validation, using in-memory bitmaps or equivalent.
* M0 may implement a temporary post-pass over the generated instances, but this is an implementation detail; the target architecture is streaming only.

**Hint trace semantics:**

* The hint trace MAY be stored in `GenerationContext` or an equivalent internal structure; its representation is
  implementation-defined and MUST remain purely diagnostic.
* The hint trace MUST at minimum allow the engine to associate, for each applied hint, its `(kind, canonPath, params)`
  with one or more `instancePath` values where the hint influenced generation.
* The presence of the hint trace MUST NOT change JSON output shape, AJV validity, RNG sequences, or any externally
  observable behavior other than the contents of `CoverageReport.unsatisfiedHints`.

**Complexity & overhead:**

* Overall coverage computation must have complexity **O(#instances + #targets)** for realistic inputs.
* Instrumentation must be bounded and measurable via existing metrics (e.g. per‑phase durations, validations per row). Coverage instrumentation MUST contribute its timing and relevant operation counts to the existing per‑phase metrics (Normalize / Compose / Generate / Repair / Validate) so that the cost of coverage can be monitored and regressed in CI.

### 4.4 CoverageEvaluator

After generation and validation:

* Aggregates coverage across all TestUnits.
* Computes:

  * `coverage.overall`,
  * `coverage.byDimension`,
  * `coverage.byOperation` (when applicable),
  * `targetsByStatus`,
  * `uncoveredTargets` (prioritized).
* Evaluates `minCoverage` (V1 global only, see §7.3) and sets:

  * CLI exit code,
  * Node API status (e.g. `coverageStatus: 'pass' | 'fail'`).

It also aggregates:

* `unsatisfiedHints` (see §5.3),
* planner diagnostics (caps, unreachable targets),
* per‑phase metrics relevant to coverage.

---

## 5. Hints & interaction with Repair

V1 defines a minimal hint set for guided coverage.

### 5.1 Hint types

* `preferBranch(schemaPath, branchIndex)`
  Biases logical choices:

  * `oneOf` / `anyOf` branches,
  * `if/then/else` choice,
  * conditionals such as `dependentSchemas` when modeled as branches.

* `ensurePropertyPresence(schemaPath, property, present: boolean)`

  * `present: true` tries to ensure the property is present at least once in generated instances.
  * `present: false` may be used to test absence when needed (future use).

* `coverEnumValue(schemaPath, valueIndex)`

  * Directly targets a specific enum member.
  * Multiple hints may target different indices for the same enum.

Hints are attached to TestUnits and consumed by the generator in a deterministic way.

**Scope (V1 emphasis)**

* In V1, hints are consumed **only** by the core JSON Schema / OpenAPI generator in `coverage=guided` mode and only to pursue coverage on the `structure`, `branches`, and `enum` dimensions.
* Hints MUST NOT change the behavior of:

  * runs with `coverage=off` or `coverage=measure`, or
  * external drivers / executors (e.g. HTTP mocks, MSW/Prism), which remain outside the core.

* Hints MUST NOT attempt to steer:

  * AP:false name automata or `CoverageIndex` behavior,
  * numeric SMT / proof machinery,
  * negative coverage or scenario‑level flows.

Future versions MAY extend hint usage to additional dimensions or drivers, but V1 implementations SHOULD keep the hint surface minimal and auditable.

### 5.2 Priority & conflict resolution

In `coverage=guided`:

1. **AJV validity is always first.**
   No hint may cause an invalid instance to be emitted (invalid vs original schema).
2. **Hints take precedence over default heuristics** when applicable and not in conflict with validity.
3. **Default generator heuristics** (e.g. branch scoring, if‑aware‑lite strategies) apply only when hints are absent, inapplicable, or unsatisfiable.

Conflicts between hints:

* The resolution strategy (per dimension / per node) must be:

  * deterministic,
  * documented,
  * stable across runs for the same inputs.

* Conforming implementations MUST use a fixed global priority order by hint kind when resolving conflicts on the same schema node, with `coverEnumValue` taking precedence over `preferBranch`, and `preferBranch` taking precedence over `ensurePropertyPresence`.
* Within a given hint kind, implementations MUST apply hints in a stable order; the recommended strategy is “first in `hints[]` wins” for a given `(schemaPath, property/branchIndex)` tuple, so that conflict resolution remains predictable across runs and implementations.

### 5.3 Unsatisfied hints & Repair interaction

Repair may need to adjust values or structures that were initially generated according to hints.

Requirements:

* If a hint leads to a generated value that:

  * is then changed by Repair, or
  * cannot be produced at all due to conflicting constraints,

  it should be recorded as an **unsatisfied hint**.

* Implementations MUST use the hint trace described in §4.3 to know, in `Repair`, which values or structures were
  influenced by which hints. For each modification applied by `Repair`, the engine MUST be able to decide whether the
  modification touches a value/structure associated with one or more applied hints.

* For a given hint and a given occurrence where it was applied, `Repair` SHOULD emit an `UnsatisfiedHint` with
  `reasonCode: 'REPAIR_MODIFIED_VALUE'` **only** when the final AJV-valid instance no longer satisfies the semantics of
  that hint at the relevant `instancePath`. If the hint remains satisfied after Repair (e.g. a property stays present
  for `ensurePropertyPresence(present:true)`), no `UnsatisfiedHint` is required for that occurrence.

* The coverage report must include:

  ```json
  {
    "unsatisfiedHints": [
      {
        "kind": "preferBranch",
        "canonPath": "#/oneOf",
        "params": { "branchIndex": 2 },
        "reasonCode": "UNREACHABLE_BRANCH",
        "reasonDetail": "branch UNSAT under constraints"
      }
    ]
  }
  ```

* In V1, `unsatisfiedHints` are **diagnostic-only**: they do not affect `coverageStatus`, do not change CLI exit codes,
  and do not contribute to `minCoverage` enforcement. Detection is **best-effort**: implementations are not required to
  report every theoretically unsatisfied hint, but when they have enough information (via planner diagnostics, the hint
  trace, or UNSAT signals) they SHOULD emit an entry with the most specific applicable `reasonCode`. A future strict
  mode (e.g. `--coverage-strict-hints`) MAY treat certain classes of unsatisfied hints as failures for CI enforcement.

**Reason code mapping (informative but recommended in V1):**

For a given hint that is not satisfied by any final AJV-valid instance, implementations SHOULD choose
`UnsatisfiedHint.reasonCode` according to the following precedence:

1. `UNREACHABLE_BRANCH` – when the hint is a `preferBranch` whose target branch is marked `status:'unreachable'` based
   on existing UNSAT / guardrail diagnostics from Normalize / Compose / `CoverageIndex` (e.g. `UNSAT_*`,
   `UNSAT_NUMERIC_BOUNDS`, etc.).
2. `PLANNER_CAP` – when the Planner explicitly chose not to plan any `TestUnit` attempting to satisfy this hint because
   of deterministic caps or budget, as summarized in `diagnostics.plannerCapsHit`.
3. `REPAIR_MODIFIED_VALUE` – when Generate applied the hint and `Repair` later modified the corresponding value or
   structure so that the hint semantics no longer hold in the final AJV-valid instance.
4. `CONFLICTING_CONSTRAINTS` – when the engine can prove that the hint is intrinsically impossible to satisfy under the
   current schema constraints, even before `Repair` (for example, a `coverEnumValue` on an out-of-range enum index, or a
   property presence hint contradicting a `false` subschema).
5. `INTERNAL_ERROR` / `UNKNOWN` – for internal failures or cases where the implementation cannot classify the failure
   more precisely.

The above mapping is intended to keep behavior deterministic for a fixed `(canonical schema, options, seed)` while
leaving room for implementations to be conservative: when in doubt, it is preferable to use `UNKNOWN` rather than guess
between `REPAIR_MODIFIED_VALUE` and `CONFLICTING_CONSTRAINTS`.

* Repair must respect the following principle:

  > If a generated value already satisfies both AJV validity and a boundary coverage target (e.g. `NUMERIC_MIN_HIT`), Repair **must not** move it away from the boundary unless this is necessary to satisfy another schema constraint.

This requirement is about not undoing coverage “for free”. When a hint cannot be satisfied, the reason should be observable (unsatisfied hint + diagnostics). More generally, coverage for all targets, including `SCHEMA_NODE`, is defined with respect to the instance as it emerges from Repair and successfully passes Validate, not to intermediate pre‑repair states (see also §3.3.1).

---

## 6. Execution modes & UX

### 6.1 Modes

Three modes are expected:

1. `coverage=off`

   * Current behavior; no CoverageGraph, no instrumentation.
   * Overhead must remain negligible vs current engine.

2. `coverage=measure`

  * Same generation pipeline and data as `coverage=off`.
  * Coverage targets are computed and marked passively.
  * A coverage report is produced at the end of the run.
   * For a fixed `(schema, options, seed)`, the sequence of generated instances in `coverage=measure` mode MUST be byte‑for‑byte identical to `coverage=off`. Any divergence between `coverage=off` and `coverage=measure` on the emitted instances is considered a violation of this specification.
   * The coverage layer MUST NOT introduce any new source of randomness into the pipeline. In particular, `coverage=measure` MUST NOT change the pattern or order of RNG calls used by the existing generator (for example by adding ad‑hoc random probes or alternative generation branches); all randomness remains governed by the existing generator and its seeded, deterministic RNG. Coverage MAY consume randomness only through the same seeded RNG interfaces that the generator already uses, and only in ways that are proven not to perturb existing RNG sequences.

3. `coverage=guided`

   * Planner produces TestUnits and hints within the provided budget.
   * Generator applies hints, subject to validity and constraints.
   * Coverage is optimized but still deterministic.
   * As in `coverage=measure`, the coverage layer MUST NOT introduce any additional RNG source or perturb the generator’s RNG call pattern. All randomness used to derive TestUnit seeds and hint decisions MUST be drawn from the same seeded RNG model already used by the generator (or from pure functions of `(masterSeed, canonPath, target id, TestUnit id, …)`), in a way that remains deterministic for a fixed `(canonical schema, OpenAPI spec, coverage options, seed, AJV.major, registryFingerprint)`.

### 6.2 Budget & profiles

**Budget options:**

* `maxInstances` / `--n` – upper bound on the total number of instances. In coverage‑guided mode, the CLI option `--n` MUST be treated as `maxInstances`. The engine MUST NOT generate more than this number of instances.
* Optional soft time cap.

In `coverage=guided`:

* The Planner may stop **before** `maxInstances` if:

  * all active targets are covered, or
  * remaining targets are `unreachable` or beyond caps.

**Profiles (CLI presets):**

* `quick`
  Smaller budgets, focus on basic structure and branches; useful in fast CI jobs.
* `balanced`
  Default; moderate budget and coverage goals; branches + enums prioritized.
* `thorough`
  Larger budgets; aims for higher coverage, including boundaries when enabled once M2 is available.

Profiles SHOULD also steer caps and target explosion behavior:

* `quick` – MAY apply aggressive caps per dimension/schema/operation to keep runs small and fast (typical `maxInstances` in the 50–100 range, focusing on structure and branches).
* `balanced` – SHOULD apply only moderate caps, preserving coverage breadth on higher‑priority dimensions (branches, enums), with typical `maxInstances` in the 200–500 range.
* `thorough` – SHOULD avoid planner caps entirely, except when required by hard global constraints (e.g. memory or time limits enforced outside the coverage subsystem), and MAY enable boundaries coverage once M2 is available, with `maxInstances` typically ≥ 1000.

Profiles are presets for:

* `maxInstances`,
* enabled dimensions,
* planner priority weights,
* possible caps per dimension.

**CLI flags (informative):**

Implementations are expected to expose coverage options via CLI flags along the following lines:

* `--coverage=off|measure|guided`
* `--coverage-min=<number>` (maps to `minCoverage`)
* `--coverage-report=<file>` (JSON report path)
* `--coverage-dimensions=structure,branches,enum`
* `--coverage-profile=quick|balanced|thorough`
* `--coverage-exclude-unreachable=true|false`

**CLI usage examples (informative):**

```bash
# Simple audit, without changing generation behavior
foundrydata generate schema.json \
  --coverage=measure \
  --coverage-dimensions=structure,branches \
  --coverage-report=coverage.json

# Guided run targeting at least 80% overall coverage
foundrydata generate schema.json \
  --n 200 \
  --seed 4242 \
  --coverage=guided \
  --coverage-dimensions=structure,branches,enum \
  --coverage-min=0.8 \
  --coverage-report=coverage.json
```

---

## 7. Reports, CI & thresholds

### 7.1 JSON coverage report

Every coverage‑aware run in `measure` or `guided` mode must produce a JSON report with a stable, versioned format:

```ts
type PlannerCapHit = {
  dimension: string; // e.g. "branches", "enum", "structure", "boundaries"
  scopeType: 'schema' | 'operation';
  scopeKey: string; // e.g. canonical schema path or operationKey
  totalTargets: number;
  plannedTargets: number;
  unplannedTargets: number;
};

type UnsatisfiedHintReasonCode =
  /**
   * The hint is impossible to satisfy under the current schema constraints, even after taking Repair into
   * account (e.g. enum index out of range, property presence contradicting an always-false subschema).
   */
  | 'CONFLICTING_CONSTRAINTS'
  /**
   * The hint was applied during Generate, but Repair later modified the corresponding value or structure so
   * that the hint semantics no longer hold in the final AJV-valid instance.
   */
  | 'REPAIR_MODIFIED_VALUE'
  /**
   * The hint targets a logical branch (e.g. preferBranch) whose CoverageTarget is marked status:'unreachable'
   * based on existing UNSAT / guardrail diagnostics in the Analyzer / planDiag.
   */
  | 'UNREACHABLE_BRANCH'
  /**
   * The Planner explicitly chose not to plan any TestUnit that attempts to satisfy this hint because of
   * deterministic caps or budget, as summarized in diagnostics.plannerCapsHit.
   */
  | 'PLANNER_CAP'
  /**
   * The engine encountered an internal error while trying to apply the hint or compute its status.
   */
  | 'INTERNAL_ERROR'
  /**
   * Catch-all for cases where the implementation cannot classify the failure more precisely.
   */
  | 'UNKNOWN';

type UnsatisfiedHint = {
  kind: string;
  canonPath: string;
  params?: Record<string, unknown>;
  reasonCode: UnsatisfiedHintReasonCode;
  reasonDetail?: string;
};

type CoverageReport = {
  version: string;
  reportMode: 'full' | 'summary';
  engine: {
    foundryVersion: string;
    coverageMode: 'off' | 'measure' | 'guided';
    ajvMajor: number;
  };
  run: {
    seed: number;
    masterSeed: number;
    maxInstances: number;
    actualInstances: number;
    dimensionsEnabled: string[];
    excludeUnreachable: boolean;
    startedAt: string;
    durationMs: number;
    /**
     * Scope of operations for this run when an OpenAPI context is present.
     * 'all' means all operations in the spec were in scope; 'selected' means
     * only a subset was targeted (for example via CLI filters).
     */
    operationsScope?: 'all' | 'selected';
    /**
     * Optional list of operation keys actually in scope when operationsScope === 'selected'.
     */
    selectedOperations?: string[];
  };
  metrics: {
    coverageStatus: 'ok' | 'minCoverageNotMet';
    overall: number;
    byDimension: Record<string, number>;
    byOperation: Record<string, number>;
    targetsByStatus: Record<string, number>;
    /**
     * Thresholds are forward‑compatible hooks. In V1, only `overall` MAY be populated
     * and only `thresholds.overall` participates in `coverageStatus`; per‑dimension
     * and per‑operation thresholds are reserved and MUST NOT affect behavior yet.
     */
    thresholds?: {
      overall?: number;
      byDimension?: Record<string, number>;
      byOperation?: Record<string, number>;
    };
  };
  targets: CoverageTargetReport[];
  uncoveredTargets: CoverageTargetReport[];
  unsatisfiedHints: UnsatisfiedHint[];
  diagnostics: {
    plannerCapsHit: PlannerCapHit[];
    notes: unknown[];
  };
};

In this schema, unreachable targets are those with `status === 'unreachable'` in `targets` (and therefore possibly
present in `uncoveredTargets` when `hit:false`). Consumers that need a dedicated unreachable view MUST derive it by
filtering these arrays rather than expecting a separate `unreachableTargets` field.

`reportMode` has the following semantics:

* In `full` mode, implementations MUST materialize the complete `targets[]` set for all enabled dimensions, and `uncoveredTargets[]` MUST contain all uncovered targets (possibly sorted for presentation, but not truncated in the JSON report).
* In `summary` mode, implementations MAY cap or omit `targets[]` and MAY truncate `uncoveredTargets[]` (for example to a top‑N per dimension or per schema) to keep reports small on large specs. All aggregate metrics (`coverage.overall`, `coverage.byDimension`, `coverage.byOperation`, `targetsByStatus`) MUST still be computed against the full target universe built by the Analyzer, not against the truncated arrays.
```

```json
{
  "version": "coverage-report/v1",
  "reportMode": "full",
  "engine": {
    "foundryVersion": "1.2.3",
    "coverageMode": "guided",
    "ajvMajor": 8
  },
  "run": {
    "seed": 42,
    "masterSeed": 42,
    "maxInstances": 1000,
    "actualInstances": 820,
    "dimensionsEnabled": ["structure", "branches", "enum"],
    "excludeUnreachable": true,
    "startedAt": "2025-01-01T12:00:00Z",
    "durationMs": 350
  },
  "metrics": {
    "coverageStatus": "ok",
    "overall": 0.87,
    "byDimension": {
      "structure": 0.95,
      "branches": 0.80,
      "enum": 0.75
    },
    "byOperation": {
      "getUser": 0.82,
      "POST /users": 0.91
    },
    "targetsByStatus": {
      "active": 120,
      "unreachable": 5,
      "deprecated": 0
    }
  },
  "targets": [
    {
      "id": "enum:User/kind:0",
      "dimension": "enum",
      "kind": "ENUM_VALUE_HIT",
      "canonPath": "#/components/schemas/User/properties/kind",
      "params": { "enumIndex": 0, "value": "admin" },
      "status": "active",
      "hit": true
    }
    // …
  ],
  "uncoveredTargets": [
    // sorted subset of targets with hit:false and status ∈ {'active','unreachable'}
  ],
  "unsatisfiedHints": [
    // see §5.3
  ],
  "diagnostics": {
    "plannerCapsHit": [],
    "notes": []
  }
}
```

Guarantees:

* The report is **deterministic** for fixed inputs and options.
* `version` is the primary compatibility identifier for downstream tooling.
* `targets[].id` and the full `targets[]` array are stable within a FoundryData **major** and a coverage report format **major**.

`run.seed` and `run.masterSeed` are related as follows in V1:

* `masterSeed` is the **user‑visible seed** that identifies the overall run and is typically passed on the CLI or via the Node API (e.g. `--seed 42`).
* `seed` is the **effective seed** used by the planner/generator for this run; in V1 they are equal (`seed === masterSeed`) and are duplicated only for forward‑compatibility with future scenarios where a single logical run may encompass multiple effective seeds or planner profiles.
* Both fields are part of the determinism contract: for a fixed `(canonical schema, OpenAPI spec, coverage options, seed, ajvMajor, registryFingerprint)`, CoverageGraph, TestUnits, generated instances and coverage reports MUST remain stable across runs.

### 7.2 CLI summary

The CLI must output a human‑readable summary suitable for CI logs. Implementations SHOULD present coverage signals in the following order of importance:

1. **Per‑dimension coverage** — `coverage.byDimension` (especially `branches` and `enum`).
2. **Per‑operation coverage** — `coverage.byOperation`, highlighting the least‑covered operations.
3. **Global coverage** — `coverage.overall` as a coarse aggregate (also used for `minCoverage` in V1).
4. **Targets by status** — e.g. `120 active, 8 unreachable (excluded from coverage)` when `excludeUnreachable:true`.
5. **Planner caps and unsatisfied hints** — a short summary of `diagnostics.plannerCapsHit` and `unsatisfiedHints`, so operators can see where coverage was limited by budget or conflicting constraints.

The intent is that consumers read per‑dimension and per‑operation signals first, and treat `coverage.overall` as a supporting guardrail rather than the primary quality metric.

### 7.3 Thresholds (`minCoverage`)

In V1:

* `minCoverage` applies to **`coverage.overall` only**.
* Failure behavior:

  * CLI exits with a dedicated non‑zero exit code (distinct from other error codes).
  * Node API returns a structured status.

* The `metrics.thresholds` field is already present to make room for per‑dimension and per‑operation thresholds in later versions. In V1:

  * only `thresholds.overall` MAY be populated and used to compute `coverageStatus`,
  * `thresholds.byDimension` and `thresholds.byOperation` are **purely descriptive** and MUST NOT affect exit codes or status.

Future versions MAY start enforcing per‑dimension / per‑operation thresholds via these fields without breaking the `coverage-report/v1` format.

In practice, operators SHOULD calibrate `minCoverage` / `thresholds.overall` as a coarse global gate and combine it with explicit policies over `coverage.byDimension` (especially `branches` and `enum`) when interpreting reports and deciding whether coverage is acceptable. A configuration that passes `minCoverage` while leaving `coverage.byDimension['branches']` or `coverage.byDimension['enum']` very low SHOULD be treated as insufficient coverage, even though the engine only enforces `minCoverage` on `coverage.overall` in V1.

**Node API shape (informative):**

The Node API for generation with coverage is expected to return a structured result along the following lines:

```ts
type GenerateWithCoverageResult = {
  data: AsyncIterable<unknown>;
  coverage: Promise<CoverageReport>;
};

// Typical usage pattern:
//
// const { data, coverage } = await generateWithCoverage(opts);
// for await (const row of data) {
//   // consume instances
// }
// const report = await coverage;
// console.log(report.metrics.overall);
```

### 7.4 Multi‑run diff (M2)

A dedicated command (e.g. `foundrydata coverage diff A.json B.json`) must:

* Compare two coverage reports with the same `version` and compatible engine major.
* Detect and highlight:

  * changes in `coverage.overall`,
  * regressions in `coverage.byOperation`,
  * new uncovered targets (present in B but not in A, or newly uncovered),
  * changes in `status` (e.g. target becoming `unreachable`).

Targets in the diff must be classified as:

* `unchanged` – target present in both reports (A and B) with the same `id` and the same identifying shape (at minimum `dimension`, `kind`, `canonPath`).
* `added` – target present in B but absent from A (by `id`).
* `removed` – target present in A but absent from B (by `id`).
* `statusChanged` – target present in both reports with the same `id` and identifying shape, but with a different `status` (e.g. `active → unreachable` or the reverse).

Coverage deltas MUST be computed over the union of `unchanged` and `statusChanged`. Newly `added` targets that are not covered MUST be reported explicitly as new gaps rather than being silently folded into regressions on existing targets, and `removed` targets MUST NOT be treated as coverage regressions (although they MAY be surfaced in the diff output for auditability).

Diffs are **only** guaranteed to be meaningful within the same coverage report format version and FoundryData major.

---

## 8. Technical constraints & invariants

The coverage layer inherits and must respect the core invariants:

1. **AJV as oracle**

   * Final validation always uses AJV against the **original schema**, not the canonical view.

2. **Determinism**

   For a fixed tuple:

   ```text
   (canonical schema, openapi spec?, coverage options, seed, AJV.major, registryFingerprint)
   ```

   the following must be identical across runs:

   * CoverageGraph,
   * TestUnits and hints,
   * generated instances,
   * coverage report (excluding timestamps and other explicitly non‑deterministic metadata).

3. **No network I/O in core**

   * CoverageAnalyzer, Planner, Generator, Repair, Validate must not perform network calls.
   * Optional resolver / prefetch happens **before** Normalize and is already handled by existing mechanisms. 

4. **Controlled overhead**

   * `coverage=off` must not add measurable overhead beyond minimal feature gating.
   * `coverage=measure` and `coverage=guided` must:

     * run in **O(#instances + #targets)**,
     * avoid second full passes over all generated instances,
     * expose metrics so performance can be monitored and regressed in CI.

5. **Compatibility with existing automata / CoverageIndex**

   * Under AP:false, the coverage layer is a **consumer** of the existing `CoverageIndex` and MUST treat it as the single source of truth for property‑name coverage. Any `PROPERTY_PRESENT` target for undeclared names under AP:false MUST be backed by `CoverageIndex.has` / `CoverageIndex.enumerate`; the CoverageGraph MUST NOT build a parallel name automaton with different semantics.
   * Coverage‑aware features MUST NOT break or bypass existing must‑cover behavior or diagnostics attached to `CoverageIndex` (e.g. emptiness proofs, UNSAT diagnostics). When in doubt, the coverage layer MUST prefer surfacing a target as uncovered rather than trying to “fix” or re‑interpret CoverageIndex decisions.

---

## 9. Phasing & deliverables

### M0 – Measurement only

* CoverageAnalyzer implemented.
* Basic instrumentation, **normative for V1 M0**:

  * `SCHEMA_NODE`,
  * `PROPERTY_PRESENT` (declared properties),
  * `ONEOF_BRANCH`.
* `ENUM_VALUE_HIT` instrumentation is in scope for M0 but MAY be subsampled for very large enums. When subsampling is applied, implementations MUST:

  * keep the subsampling deterministic for a given canonical schema, and
  * record this in `targets[].meta` and/or coverage diagnostics so that consumers can see which enum values were not materialized as individual targets.
* JSON report (`coverage-report/v1`) + CLI summary.
* `coverage=measure` mode.

### M1 – Guided core

* CoveragePlanner implemented (greedy, static).
* Hints wired into generator:

  * `preferBranch`,
  * `ensurePropertyPresence`,
  * `coverEnumValue`.
* Streaming coverage instrumentation.
* `coverage=guided` mode.
* `minCoverage` enforced on `coverage.overall`.

### M2 – Boundaries, OpenAPI & diff

* Boundaries coverage (min/max for numbers, strings, arrays).
* `OP_REQUEST_COVERED` / `OP_RESPONSE_COVERED`.
* `coverage.byOperation`.
* `coverage diff` command.

---

## 10. Acceptance criteria (V1)

1. **OneOf branches**

   * Schema with `oneOf` of 3 branches.
   * `coverage=guided`, sufficient budget:

     * all 3 `ONEOF_BRANCH` targets have `hit:true`,
     * branch coverage for that schema is 100%.

2. **Optional properties**

   * Schema with several optional properties.
   * `coverage=measure`:

     * report indicates, for each property, whether `PROPERTY_PRESENT` was observed.
   * Switching from `coverage=off` to `coverage=measure` must not change instances (values or shape).

3. **Enums**

   * Schema with an enum of 4 values.
   * `coverage=guided`, sufficient budget:

     * all 4 `ENUM_VALUE_HIT` targets are hit, or
     * coverage report clearly explains which ones are not (lack of budget, unsatisfied hints, or `unreachable`).

4. **Coverage threshold**

   * Run with `minCoverage=0.8`; final `coverage.overall=0.6`:

     * CLI exits with defined coverage failure code,
     * summary includes main uncovered zones and possibly major unsatisfied hints.

5. **OpenAPI coverage**

   * OpenAPI document with multiple operations, some sharing schemas.
   * `coverage=guided`, sufficient budget:

     * report includes `coverage.byOperation[operationKey]` for:

       * operations with `operationId`,
       * operations without `operationId` (using `"<METHOD> <path>"` keys),
     * `OP_REQUEST_COVERED` / `OP_RESPONSE_COVERED` targets are set appropriately,
     * schema‑level targets map deterministically to operations.

6. **Reproducibility**

   * Two successive runs with the same:

     * schemas,
     * OpenAPI spec,
     * coverage options (including dimensions and `excludeUnreachable`),
     * seed,
   * produce byte‑identical coverage reports except for timestamp fields.

---

## 11. Future extensions (beyond V1)

Planned but explicitly out of V1 scope:

1. **Contract scenarios (multi‑operation)**

   * Flows such as `create → get → update → delete`.
   * Coverage of specific sequences of status codes, payload shapes, and cross‑operation invariants.

2. **Negative coverage**

   * Targeted generation of invalid instances for specific constraints (e.g. `min-1`, `max+1`, string not matching pattern).
   * Separate positive vs negative coverage metrics and reports (`polarity:'negative'`).

3. **Risk‑based coverage**

   * Targets annotated with `weight` representing risk or business criticality.
   * Weighted coverage metrics (e.g. sum of weights of covered targets / total weight).

4. **Advanced multi‑run aggregation**

   * Aggregation across multiple seeds or different planner profiles.
   * Baseline coverage files versioned in the repo and enforced in CI.

5. **Per‑schema coverage views**

   * `coverage.bySchema[schemaId]` or an equivalent view aggregating coverage metrics per canonical schema, to highlight schemas that are never instantiated or poorly covered across operations.

These extensions should be supported by the current model (targets with `weight`, `polarity`, `status`, `meta`) without breaking backwards compatibility of `coverage-report/v1`.
