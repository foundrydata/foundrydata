# Feature Support Simplification Plan - Canonical Spec 

**Status:** Implementation spec
**Audience:** JSON Schema & AJV practitioners, library contributors

---

## 1) Goal

Broaden supported JSON Schema features while simplifying code paths and avoiding scattered “is this supported?” branches.

## 2) Scope

Parser, normalization, composition/planning, generation, repair, validation, documentation, benchmarking.

---

## 3) Project Philosophy (Core Values)

* **100% Schema Compliance** — Every generated row is validated against the **original** schema by AJV.
* **Guaranteed or Transparent** — If we can’t guarantee compliance, we say why and when support is expected.
* **Deterministic** — Same seed ⇒ same data. Reproducible and CI‑friendly.
* **Performance** — Meet documented SLO/SLI targets with budgets and graceful degradation.
* **Developer Friendly** — Clear errors and diagnostics. No hidden magic.
* **Open Source First** — MIT. Auditable. Contributable. Runnable offline.
* **Correctness over Features** — Add complexity only when guarantees hold.

---

## 4) Guiding Principles

* **AJV is the oracle** — Validate against the original schema, not internal transforms.
* **Pipeline simplicity** — `Normalize → Compose → Generate → Repair → Validate`.
* **Separation of concerns** — Narrow, testable responsibilities per phase.
* **Determinism** — Bounded attempts, local seeded RNG, no global state.
* **Observability** — Metrics, budgets, diagnostics are first‑class.

---

## 5) Configuration Overview

All knobs are optional; defaults are conservative.

```ts
type PlanOptions = {
  // Normalization
  rewriteConditionals?: 'never' | 'safe' | 'aggressive'; // default: 'never'
  debugFreeze?: boolean;                                  // default: false

  // Composition / numeric math
  rational?: {
    maxRatBits?: number;           // cap on bit-length of numerator/denominator; default: 128
    maxLcmBits?: number;           // cap on bit-length of LCM; default: 128
    qCap?: number;                 // optional denominator cap; default: undefined
    fallback?: 'decimal' | 'float';// default: 'decimal' (controlled rounding)
    decimalPrecision?: number;     // digits for decimal fallback; default: 12 (aligns with AJV tolerance)
  };

  // Output encoding
  encoding?: {
    bigintJSON?: 'string' | 'number' | 'error'; // default: 'string' (applies to data outputs, not logs)
  };

  // Branch trials
  trials?: {
    perBranch?: number;                // default: 2
    maxBranchesToTry?: number;         // default: 12 (Top‑K)
    skipTrialsIfBranchesGt?: number;   // default: 50 (score-only selection)
    skipTrials?: boolean;              // default: false
  };

  // Guards
  guards?: {
    maxGeneratedNotNesting?: number;   // default: 2 (normalizer)
  };

  // Cache
  cache?: {
    preferWeakMap?: boolean;      // default: true
    useId?: boolean;              // default: true ($id if present)
    hashIfBytesLt?: number;       // default: 1_000_000
    lruSize?: number;             // default: 64 compiled validators
  };

  // Metrics & toggles
  metrics?: boolean;                 // default: true
  disablePatternOverlapAnalysis?: boolean; // default: false
  disableDeepFreeze?: boolean;       // default: false (overrides debugFreeze)

  // Complexity caps & fail-fast
  complexity?: {
    maxOneOfBranches?: number;       // default: 200
    maxAnyOfBranches?: number;       // default: 500
    maxPatternProps?: number;        // default: 64
    maxEnumCardinality?: number;     // default: 10_000
    maxContainsNeeds?: number;       // default: 16  // after bagging
    maxSchemaBytes?: number;         // default: 2_000_000 // ~2MB
    bailOnUnsatAfter?: number;       // default: 12 // gen→repair→validate cycles (stagnation guard)
  };
  failFast?: {
    externalRefStrict?: 'error'|'warn'|'ignore'; // default: 'error'
    dynamicRefStrict?: 'warn'|'note';            // default: 'note'
  };

  // Conditionals generation behavior
  conditionals?: {
    // Default is coupled to `rewriteConditionals` (see mapping below).
    strategy?: 'rewrite' | 'if-aware-lite' | 'repair-only';
    minThenSatisfaction?: 'discriminants-only'|'required-only'|'required+bounds'; // default: 'required-only'
  };
};
```

**Default mapping between `rewriteConditionals` and `conditionals.strategy`:**

* `rewriteConditionals: 'never'`  ⇒ `conditionals.strategy: 'if-aware-lite'`
* `rewriteConditionals: 'safe' | 'aggressive'` ⇒ `conditionals.strategy: 'rewrite'`
* An explicit `conditionals.strategy` overrides this mapping.

---

## 6) High‑Level Architecture

* **Normalize** — Draft‑aware canonicalization; keep original for AJV.
* **Compose** — Build an **effective view** by resolving composition (merge/select/invert) without mutating canonical.
* **Generate** — Consume effective constraints and discriminants; deterministic seeded generation.
* **Repair** — AJV‑driven corrections via `(keyword → action)` registry; idempotent and budgeted.
* **Validate** — AJV (cached) validation against the original schema; pipeline fails on non‑compliance.

---

## 7) Schema Normalizer (Canonicalization)

### Contract

**Input**: JSON Schema (draft‑04..2020‑12+). Local `$ref` only.
**Output**:

```ts
{
  schema: object,                   // canonical 2020-12-like shape (non-destructive)
  ptrMap: Map<string, string>,      // canonical JSON Pointer -> original Pointer
  revPtrMap: Map<string, string[]>, // original Pointer -> [canonical Pointers...]
  notes: Array<{ path: string; code: string; details?: unknown }>
}
```

### Pass Order

1. **Draft unification**

   * `definitions`→`$defs`; `id`→`$id`.
   * Draft‑04 booleans: `exclusiveMinimum/Maximum:true` → numeric exclusives only when paired; else note `EXCLMIN_IGNORED_NO_MIN`, `EXCLMAX_IGNORED_NO_MAX`.
   * Tuples: `items:[...]`→`prefixItems:[...]`; `additionalItems:false`→`items:false`; `additionalItems:S`→`items:S`.
   * OpenAPI interop: `nullable:true` + `type` ⇒ `type:[..., "null"]`; else keep as annotation `OAS_NULLABLE_KEEP_ANNOT`.

2. **References**

   * Preserve local `#...`; rewrite `#/definitions/...`→`#/$defs/...` if target exists; note `DEFS_TARGET_MISSING` otherwise.
   * Don’t cross `$id` boundaries; keep anchors/dynamic anchors intact; no cycle expansion.

3. **Boolean / trivial simplifications**

   * Fold `allOf/anyOf/oneOf` with `true/false`; drop empties.
   * Normalize `enum`↔`const` (size‑1) for planning only.

4. **Conditionals (`if/then/else`)**

   * **Default**: no rewrite (`rewriteConditionals:'never'`).
   * **`safe` rewrite** (double negation) only when strictly safe:

     * **Block** if any `unevaluatedProperties/unevaluatedItems` is in scope or ancestor scope.
     * **Block** if evaluation‑affecting keywords are present at the nearest object/array or inside `then/else`:
       `unevaluated*`, `properties`, `patternProperties`, `additionalProperties`,
       `items`, `prefixItems`, `contains`, `propertyNames`, `dependentSchemas`.
     * Transform to:

       ```json
       { "anyOf": [
         { "allOf": [ { "not": { "not": S } }, T ] },
         { "allOf": [ { "not": S }, E ] }
       ] }
       ```

       Note `IF_REWRITE_DOUBLE_NOT`.
   * Partial forms: keep `if`‑only and `then`/`else`‑only as‑is.
   * Cap nested `not` by `guards.maxGeneratedNotNesting` (note `NOT_DEPTH_CAPPED`).

5. **Dependencies / dependents**

   * Guard with object type if rewriting via conditionals; otherwise provide annotation‑safe alternative with `anyOf` guards.
   * Don’t rewrite when any `unevaluated*` is in scope. Note `DEPENDENCY_GUARDED`.

6. **Object keywords**

   * Preserve `patternProperties`, `propertyNames`, `additionalProperties`.
   * Rewrite `propertyNames` only when strictly equivalent (pattern or closed enum) and no `unevaluated*` involvement; else note `PNAMES_COMPLEX`.

7. **Pass‑through**

   * `$dynamicRef/$dynamicAnchor/$recursiveRef` untouched; note `DYNAMIC_PRESENT`.

8. **Dev safety**

   * Optional deep‑freeze when `debugFreeze` and not `disableDeepFreeze`.

**Normalizer note codes (non‑exhaustive)**:
`IF_REWRITE_DOUBLE_NOT`, `IF_REWRITE_SKIPPED_UNEVALUATED`, `ANNOTATION_IN_SCOPE_IF_REWRITE_SKIPPED`,
`IF_REWRITE_DISABLED_ANNOTATION_RISK`, `PNAMES_COMPLEX`, `DEPENDENCY_GUARDED`, `DYNAMIC_PRESENT`,
`DEFS_TARGET_MISSING`, `EXCLMIN_IGNORED_NO_MIN`, `EXCLMAX_IGNORED_NO_MAX`, `OAS_NULLABLE_KEEP_ANNOT`,
`NOT_DEPTH_CAPPED`.

---

## 8) Composition Engine

### Responsibilities

* Build an **effective view** used by the generator.
* Provide diagnostics for testing/debugging:

```ts
{
  schema: Schema,
  containsBag?: Array<{ schema:any; min?:number; max?:number }>,
  diag?: {
    unsatHints?: string[],
    chosenBranch?: { kind:'anyOf'|'oneOf', index:number, score:number },
    overlap?: { kind:'oneOf', passing: number[] },
    overlaps?: { patterns?: Array<{ key: string, patterns: string[] }> },
    scoreDetails?: unknown,
    budget?: { tried: number, limit: number, skipped?: boolean, reason?: string },
    metrics?: { /* see §15 */ },
    caps?: string[] // triggers of complexity caps
  }
}
```

### `allOf` merge (domain‑aware)

* **Type** — Intersect sets (including unions with `"null"`). Empty ⇒ unsat.

* **Enum/Const** — Intersect `enum`; conflicting `const` ⇒ unsat. In generation, `enum/const` outrank broad `type`.

* **Numbers**

  * Bounds — Take most restrictive `minimum/maximum` and exclusives.
  * `multipleOf` — Exact rational:

    * Integers: intersection multiple is `lcm(a,b)`.
    * Rationals (reduced `p/q`): intersection multiple is `lcm(p1,p2)/gcd(q1,q2)`.
    * **Caps** — If `bitLen(p|q)` > `maxRatBits`, or `bitLen(lcm)` > `maxLcmBits`, or `qCap` exceeded:

      * `fallback:'decimal'` ⇒ quantize to `decimalPrecision` digits; note `RAT_FALLBACK_DECIMAL`.
      * `fallback:'float'`   ⇒ use float math aligned with AJV tolerance; note `RAT_FALLBACK_FLOAT`.
      * Note `RAT_LCM_BITS_CAPPED` / `RAT_DEN_CAPPED` as applicable.

* **Objects — `additionalProperties` exactness**

  * If **any** conjunct has `additionalProperties:false`, then any key **not covered** by that conjunct’s
    `properties/patternProperties` is forbidden, regardless of others.
  * **Must‑cover** algorithm:

    * For each conjunct `Ci` with `additionalProperties:false`, compute a recognizer of keys it covers:

      * Named keys from `properties`.
      * Names accepted by **anchored** `patternProperties` (conservative recognition).
    * The globally safe set of generable keys is the **intersection** of recognizers across all such `Ci`.
    * For complex or non‑anchored patterns, apply conservative approximation and note `AP_FALSE_INTERSECTION_APPROX`.
  * If a conjunct supplies a schema (not `false`) for extras, enforce that schema **in addition** to the must‑cover restriction.

* **Objects — other**

  * Merge `properties`; union `required`.
  * Conjunct `patternProperties`; record overlaps in `diag.overlaps.patterns`. Respect `disablePatternOverlapAnalysis`.

* **Arrays**

  * **Tuple / `items:false`** implicit maximum length:

    ```
    maxLen(A) = itemsA === false ? len(prefixA) : +∞
    maxLen(B) = itemsB === false ? len(prefixB) : +∞
    maxLen(allOf) = min(maxLen(A), maxLen(B))
    ```

  * For `i < min(len(prefixA), len(prefixB))`: effective item = `allOf` of both.

  * For `minLen ≤ i < max(prefixLens)`: keep available `prefixItems[i]` only if `i < maxLen(allOf)`.

  * `items`: keep as `allOf` of present `items` (no collapse).

  * **`contains` (bag semantics)**:

    * Model as a **bag** of independent needs:

      ```ts
      type ContainsNeed = { schema: any; min?: number; max?: number };
      type ContainsBag = ContainsNeed[];
      ```
    * In `allOf`, **concatenate** bags; optional subsumption (if `schemaA ⊆ schemaB`).
    * **Unsat checks**:

      * `sum(min_i) > (maxItems ?? +∞)` ⇒ `CONTAINS_UNSAT_BY_SUM`.
      * Need with `min > maxItems` ⇒ unsat.
      * If needs are provably disjoint and a need has `max=0` while another has `min>0` ⇒ unsat.
    * Diagnostics: `CONTAINS_BAG_COMBINED`.

### Early unsat checks (short‑circuit)

* Disjoint types; empty enum intersection; conflicting const.
* Numeric/object/array bounds:

  * `minimum > maximum`; `exclusiveMinimum ≥ maximum`; `exclusiveMaximum ≤ minimum`.
  * `minItems > maxItems`; `minProperties > maxProperties`.
  * Tuples: `minItems > maxLen(allOf)`.
  * `maxContains === 0 && minContains > 0` (single need).
  * **Pattern vs `propertyNames`**: closed enum of names incompatible with all patterns ⇒ `UNSAT_PATTERN_PNAMES`.
  * **`dependentRequired` + `additionalProperties:false` across `allOf`**:

    * If the **must‑cover intersection** cannot include required dependents for any possible key ⇒ `UNSAT_DEPENDENT_REQUIRED_AP_FALSE`.

### Branch selection (`anyOf` / `oneOf`)

* **Deterministic, discriminant‑first scoring**:

  * +1000: same property across branches with disjoint `const/enum` (tag).
  * +200: `required + const/enum` on same key.
  * +50: anchored, disjoint `patternProperties` (e.g., `^foo$` vs `^bar$`).
  * +10: disjoint `type`.
  * − small: estimated overlaps (wide unions, non‑anchored patterns).
  * Ties: stable index; then RNG tiebreaker seeded by `(globalSeed ⊕ hash(schemaPath))`.

* **Trials policy**:

  * Score all branches; try Top‑K `maxBranchesToTry`. Attempt generation up to `trials.perBranch` times per branch (default 2).
  * If branch count > `skipTrialsIfBranchesGt` or `skipTrials=true` ⇒ choose by score only.
  * Record trial budget in `diag.budget`. Emit `TRIALS_SKIPPED_LARGE_ONEOF` when `oneOf.length > skipTrialsIfBranchesGt` **or** `trials.skipTrials === true`.

* **`oneOf` exclusivity**:

  * After selection/generation, validate against all branches.
  * If >1 pass, attempt **non‑destructive refinement** first; then bounded tweaks (numeric nudge; string char injection).
  * Record `diag.overlap`.

### Complexity caps & degradation

* If caps are exceeded (see `PlanOptions.complexity`), enable **graceful degradation**:

  * Force `skipTrials=true`, reduce Top‑K, or skip pattern overlap analysis.
  * Emit diagnostics: `COMPLEXITY_CAP_ONEOF`, `COMPLEXITY_CAP_ANYOF`, `COMPLEXITY_CAP_PATTERNS`, `COMPLEXITY_CAP_ENUM`, `COMPLEXITY_CAP_CONTAINS`, `COMPLEXITY_CAP_SCHEMA_SIZE`.

---

## 9) Generator

* Consume the effective view; honor type constraints, lengths, patterns, enums.

* **`enum/const` outrank `type`** when both present.

* **Strings** — Measure length in Unicode code points; regex in Unicode mode (`unicodeRegExp:true`).

* **Formats** — Default annotate‑only (`validateFormats:false`). Optional `validateFormats:true` + `ajv-formats` for (email|uri|uuid|date‑time) minimal generators.

* **Objects** —

  * When any conjunct has `additionalProperties:false`, respect the **must‑cover intersection** from Compose.
  * With `unevaluatedProperties:false` in the effective view, generate only keys evaluated by `properties|patternProperties|dependentSchemas`.
  * Stable property order: required first, then lexical.

* **Numbers** — Prefer `type:"integer"` over `number+multipleOf:1`.

* **Arrays** —

  * Respect tuple semantics and implicit max length from `items:false`.
  * **Satisfy bagged `contains`**: generate targeted, distinct items per need; then ensure `uniqueItems` if present.

### Conditionals strategy when not rewriting

* **Default when `rewriteConditionals:'never'` is in effect:** `conditionals.strategy = 'if-aware-lite'`.

  1. **Pre‑evaluate** `if` on the **partial instance** being built (best‑effort).
  2. If `if` appears satisfied, bias generation to satisfy a **minimal subset** of `then` according to `minThenSatisfaction`
     (`'discriminants-only' | 'required-only' | 'required+bounds'`, default `'required-only'`).
  3. If `if` appears unsatisfied, prefer choices that avoid activating `then` (e.g., omit discriminant).
  4. No heavy backtracking; rely on Repair if AJV still raises `then` violations.

* Diagnostics: `IF_AWARE_HINT_APPLIED`, `IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO`.

---

## 10) Repair Engine (AJV‑Driven)

### Mapping (keyword → action)

* `required` → add missing props via `default` if present; else minimal generation for sub‑schema.
* `type` → regenerate field for target type; for unions, use BranchSelector.
* `enum` → pick first stable member.
* `const` → set const value.
* `minLength`/`maxLength` → pad/truncate by code points.
* `pattern` → constrained string generator if feasible; else fallback + re‑validate.
* `minimum`/`maximum` → clamp.
* `exclusiveMinimum`/`exclusiveMaximum` → nudge to `bound ± ε` (rational or ±1 for integers).
* `multipleOf` → rational snap; align fallback tolerance with AJV version.
* `minItems`/`maxItems` → grow/shrink arrays respecting `prefixItems/items` and **all** bagged `contains` needs.
* `uniqueItems` → de‑duplicate via **structural hashing** (hash→bucket→`deepEqual`); re‑satisfy contains needs if de‑dup breaks them.
* `additionalProperties:false` / `unevaluatedProperties:false` → remove extras; rename only when safe; never rename keys required by `dependent*`.
* `propertyNames` → rename only keys not governed by `properties/patternProperties`; preserve `dependent*`.

### Process

* **Order** — shape (`type`/`required`) → bounds (`min*`/`max*`) → semantics (`pattern`/`multipleOf`/`format`) → sweep (`additional*`/`unevaluated*`).
* **Budgets** — per‑node attempt counter (1–3) + seen‑set `(instancePath, keyword, normalizedParams)` to avoid loops.
* **Stagnation guard** — If over `complexity.bailOnUnsatAfter` gen→repair→validate **cycles** errors don’t decrease or oscillate on the same keys ⇒ `UNSAT_BUDGET_EXHAUSTED`.
* **Idempotence** — Repeating the same action is a no‑op.
* **Logging** — Optional `{ item, changed, actions:[...] }`.

---

## 11) Modes

### Strict (default)

* Fail early only on non‑normalizable constructs or explicit policy cases.
* `$ref` external: behavior controlled by `failFast.externalRefStrict` (default `error`).
* `$dynamic*`: note `DYNAMIC_PRESENT` (no error).
* Compose & object keywords proceed without feature gates; complexity caps may degrade behavior but never skip validation.

### Lax

* Proceed best‑effort even when some features are partial; still validate with AJV.
* External `$ref`: default `warn` **then attempt generation without resolving remote refs** (no network I/O). Generation proceeds on local parts only; final AJV validation still runs against the original schema and may fail when unresolved refs are structurally required.
* `$dynamic*` noted.

### Strict vs Lax (summary)

| Situation                                                  | Strict                          | Lax                            |
| ---------------------------------------------------------- | ------------------------------- | ------------------------------ |
| External `$ref`                                            | `error` \*                      | `warn` then attempt (no deref) |
| `$dynamicRef` present                                      | `note DYNAMIC_PRESENT`          | `note DYNAMIC_PRESENT`         |
| Complexity caps                                            | Degrade + diagnostics           | Degrade + diagnostics          |
| Conditionals strategy (when `rewriteConditionals:'never'`) | `if-aware-lite`                 | Same                           |
| Budget exhausted                                           | `UNSAT_BUDGET_EXHAUSTED` (fail) | Same                           |

\* configurable via `failFast.externalRefStrict`.

---

## 12) Draft Handling

* **Detection** — `$schema` + AJV draft settings.
* **Internal canon** — 2020‑12‑like shape; **always** validate against the original schema.
* **Refs** — Only in‑document refs resolved; **no network I/O**.
* **Dynamic refs** — `$dynamicRef/$dynamicAnchor/$recursiveRef` preserved; generation conservative. Note `DYNAMIC_PRESENT`.
* **Effective view** — Preserves `unevaluated*` semantics for the final validation stage.

---

## 13) AJV Configuration

Two distinct AJV instances/configs:

1. **Source (original schema) compilation**

   * `strictSchema:false` (tolerate vendor `x-*`, `example`)
   * `allowUnionTypes:true`
   * `unicodeRegExp:true`, `useDefaults:false`, `removeAdditional:false`, `coerceTypes:false`
   * `allErrors:true` **only** for repair
   * `validateFormats:false` (default). Optional: `validateFormats:true` with `ajv-formats`.

2. **Planning/Generation**

   * `strictSchema:true`, `strictTypes:true`, `allErrors:false`
   * `validateFormats` aligned with the policy above

Cache keys must include AJV **major version** and flags (`validateFormats`, `allowUnionTypes`, `strictTypes`).

---

## 14) Cache Strategy

Hierarchical:

1. `WeakMap` by object identity
2. `$id` when present and trusted
3. `stableHash(schema)` **only if** estimated size < `hashIfBytesLt` (skip hashing otherwise)

LRU bounded by `lruSize`. Include AJV version + critical flags in the cache key.
(Clarification: separate LRU spaces for the two AJV instances are recommended.)

---

## 15) Performance, Determinism & Metrics

* **RNG** — Local (e.g., xorshift32) seeded by `(globalSeed ⊕ hash(schemaPath))`. No global state.
* **Trials** — Bounded by `trials`; Top‑K; optional skip on large `oneOf`.
* **Pattern overlap** — Heuristic; can be disabled.
* **Complexity caps** — Trigger degradations (score‑only selection, analysis skips) with explicit diagnostics.

### Metrics (reported in `diag.metrics` — subset of this shape)

```ts
{
  normalizeMs?: number;
  composeMs?: number;
  generateMs?: number;
  repairMs?: number;
  validateMs?: number;
  validationsPerRow?: number;   // AJV validations / generated row
  repairPassesPerRow?: number;  // repair loops / row
  branchTrialsTried?: number;
  memoryPeakMB?: number;        // optional, from bench harness
  p50LatencyMs?: number;        // optional, CI only
  p95LatencyMs?: number;        // optional, CI only
}
```

### SLO/SLI (documented targets, not hard guarantees)

* **Simple/medium schemas** (typical web/API models):

  * `~1000 rows`: p50 ≈ 200–400 ms; `validationsPerRow ≤ 3`; `repairPassesPerRow ≤ 1`.

* **Pathological schemas** (deep `allOf`, large `oneOf`, heavy regex/patterns):

  * Degradation paths engaged; may trigger `UNSAT_BUDGET_EXHAUSTED` when appropriate.

---

## 16) Implementation Plan

### Phase P0

* Complexity caps + diagnostics:
  `COMPLEXITY_CAP_ONEOF`, `COMPLEXITY_CAP_ANYOF`, `COMPLEXITY_CAP_PATTERNS`, `COMPLEXITY_CAP_ENUM`, `COMPLEXITY_CAP_CONTAINS`, `COMPLEXITY_CAP_SCHEMA_SIZE`.
* Stagnation/budget guard: `UNSAT_BUDGET_EXHAUSTED`.
* If‑aware‑lite generation + `conditionals.strategy`, `minThenSatisfaction`.
* Early‑unsat extensions: `UNSAT_DEPENDENT_REQUIRED_AP_FALSE`, `UNSAT_PATTERN_PNAMES`.

**Acceptance (P0)**

* On simple/medium profiles: `validationsPerRow ≤ 3`, `repairPassesPerRow ≤ 1` (p50).
* If‑aware‑lite reduces validations/row vs repair‑only on at least three conditional suites.
* Caps trigger degradations (no crashes); diagnostics emitted.

### Phase P1

* Extra metrics (`validationsPerRow`, `repairPassesPerRow`) wired to bench harness.
* Bench CI: simple/medium/pathological profiles; track p50/p95.
* Docs: `Invariants.md`, `Known‑Limits.md`, Strict vs Lax table.

### Phase P2

* Contains bag subsumption improvements.
* Pattern approximation improvements for must‑cover (anchored unions, simple char classes).
* Diagnostic message hygiene.

---

## 17) Documentation Additions

* **Invariants.md** — Cross‑phase invariants (e.g., “validate against original schema”, “`enum/const` > `type`”, “must‑cover for `AP:false`”, “bag semantics for `contains`”).
* **Known‑Limits.md** — Partial features/approximations (non‑anchored patterns under `AP:false`, `$dynamicRef`).
* **Features Matrix** — See §18.

---

## 18) Features Matrix (✓ / \~)

* `allOf/anyOf/oneOf/not` ✓ (with `oneOf` exclusivity refinement)
* Conditionals ✓ (no rewrite by default; safe rewrite optional; **if‑aware‑lite** in generation)
* Tuples + `additionalItems` ✓ (implicit max length)
* `patternProperties`/`propertyNames` ✓ (strict equivalence rewrites only; guarded by `unevaluated*`)
* `dependentSchemas`/`dependentRequired` ✓ (guarded; early‑unsat with `AP:false`)
* **`contains`** ✓ (**bag semantics** across `allOf`; independent needs)
* `multipleOf` ✓ (exact rational with caps and fallbacks)
* `unevaluated*` ✓ (conservative effective view; preserved for validation)
* In‑document `$ref` ✓; external `$ref` ✗/warn (configurable; **no remote resolution**, generation on local parts only)
* `$dynamicRef/$dynamicAnchor/$recursiveRef` \~ (pass‑through; generation conservative; AJV decides)

---

## 19) Diagnostics (codes)

`IF_REWRITE_DOUBLE_NOT`, `IF_REWRITE_SKIPPED_UNEVALUATED`, `IF_REWRITE_DISABLED_ANNOTATION_RISK`,
`ANNOTATION_IN_SCOPE_IF_REWRITE_SKIPPED`, `PNAMES_COMPLEX`, `DEPENDENCY_GUARDED`, `DYNAMIC_PRESENT`,
`DEFS_TARGET_MISSING`, `EXCLMIN_IGNORED_NO_MIN`, `EXCLMAX_IGNORED_NO_MAX`, `OAS_NULLABLE_KEEP_ANNOT`,
`NOT_DEPTH_CAPPED`, `RAT_LCM_BITS_CAPPED`, `RAT_DEN_CAPPED`, `RAT_FALLBACK_DECIMAL`, `RAT_FALLBACK_FLOAT`,
`TRIALS_SKIPPED_LARGE_ONEOF`, `AP_FALSE_INTERSECTION_APPROX`, `CONTAINS_BAG_COMBINED`, `CONTAINS_UNSAT_BY_SUM`,
`COMPLEXITY_CAP_ONEOF`, `COMPLEXITY_CAP_ANYOF`, `COMPLEXITY_CAP_PATTERNS`,
`COMPLEXITY_CAP_ENUM`, `COMPLEXITY_CAP_CONTAINS`, `COMPLEXITY_CAP_SCHEMA_SIZE`,
`UNSAT_PATTERN_PNAMES`, `UNSAT_DEPENDENT_REQUIRED_AP_FALSE`, `UNSAT_BUDGET_EXHAUSTED`,
`IF_AWARE_HINT_APPLIED`, `IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO`.

---

## 20) Testing Strategy

### Unit

* Normalizer transforms (golden tests, asserted `notes`).

* Composition merges:

  * Arrays: tuples, `items:false`, **bagged `contains`** with `min/maxContains` and `uniqueItems`.
  * Numbers: rational `multipleOf` with caps/fallbacks (aligned to AJV tolerance).
  * Objects: **must‑cover** for `AP:false` across `allOf`, pattern overlaps, pattern vs `propertyNames`.

* Early unsat detection (incl. `sum(min_i) > maxItems`, tuple maxLen, pattern/name contradictions).

* Branch selector scoring; determinism; Top‑K selection; skip‑trials path.

* Repair actions (idempotence; error reduction; rational snapping).

* Pointer mapping (longest‑prefix reverse map).

* Structural hashing for `uniqueItems` (collision buckets + `deepEqual`).

### Integration

* Conditionals (with/without `unevaluated*`), nested; verify **no semantic drift** when not rewriting.
* Composition suites validated by AJV (original schema).
* Objects: `patternProperties` / `propertyNames` / `dependentSchemas` / `additionalProperties:false` across `allOf`.
* `oneOf` overlap: selected branch ends exclusive after refinement.

### Bench / CI

* Profiles: **simple**, **medium**, **pathological**.
* Track p50/p95, `validationsPerRow`, `repairPassesPerRow`, caps triggers, memory peak.
* Alert on regressions beyond thresholds.

### Metamorphic / Equivalence

* Compare `conditionals.strategy='if-aware-lite'` vs `'repair-only'` on the same seed:

  * Final instances valid in both modes.
  * Differences allowed only in metrics (fewer validations/row targeted in if‑aware).

---

## 21) Risks & Mitigations

* **Conditional rewrite semantics** → Default no‑rewrite (`rewriteConditionals:'never'`); strict guards; limited `not` depth; AJV final validation.
* **Trials on large `oneOf`** → Top‑K, skip‑trials threshold, budgets/metrics.
* **Rational arithmetic growth** → Bit/LCM/denominator caps; documented fallbacks; diagnostics.
* **Cache hashing cost** → WeakMap → `$id` → size‑gated stableHash; LRU.
* **Pattern overlap complexity** → Heuristic; toggle; diagnostics.
* **`AP:false` across `allOf`** → Must‑cover intersection with conservative approximations (`AP_FALSE_INTERSECTION_APPROX`).
* **`contains` across `allOf`** → Bag semantics, unsat checks (`CONTAINS_UNSAT_BY_SUM`), targeted generation.
* **Budget loops** → Stagnation guard (`UNSAT_BUDGET_EXHAUSTED`).

---

## 22) Deliverables (Code)

* `packages/core/src/transform/schema-normalizer.ts`
* `packages/core/src/transform/composition-engine.ts`
* `packages/core/src/generator/foundry-generator.ts` (wire‑in)
* `packages/core/src/repair/repair-engine.ts`
* `packages/core/src/parser/json-schema-parser.ts` (lean checks)
* `packages/core/src/util/ptr-map.ts` (ptr map + reverse map by path walk)
* `packages/core/src/util/rational.ts` (exact rational helpers with caps/fallback + BigInt‑safe JSON)
* `packages/core/src/util/rng.ts` (seeded RNG; no global state)
* `packages/core/src/util/struct-hash.ts` (structural hashing for `uniqueItems`)
* `packages/core/src/util/metrics.ts` (per‑phase timings, counters, validations/row)
* `packages/core/src/util/stable-hash.ts` (optional; size‑gated)
* Docs: `README.md`, `error.md`, `CHANGELOG.md`, `Invariants.md`, `Known-Limits.md`

---

## 23) Appendix — Minimal Interfaces (illustrative)

```ts
// Plan options 
export interface PlanOptions {
  // Normalization
  rewriteConditionals?: 'never' | 'safe' | 'aggressive'; // default: 'never'
  debugFreeze?: boolean;

  // Arithmetic
  rational?: {
    maxRatBits?: number;
    maxLcmBits?: number;
    qCap?: number;
    fallback?: 'decimal' | 'float';
    decimalPrecision?: number; // default: 12
  };

  // Output encoding
  encoding?: { bigintJSON?: 'string' | 'number' | 'error' };

  // Trials
  trials?: {
    perBranch?: number;              // default: 2
    maxBranchesToTry?: number;       // default: 12
    skipTrialsIfBranchesGt?: number; // default: 50
    skipTrials?: boolean;            // default: false
  };

  // Guards
  guards?: {
    maxGeneratedNotNesting?: number; // default: 2
  };

  // Cache
  cache?: {
    preferWeakMap?: boolean;
    useId?: boolean;
    hashIfBytesLt?: number;
    lruSize?: number;
  };

  // Metrics/toggles
  metrics?: boolean;
  disablePatternOverlapAnalysis?: boolean;
  disableDeepFreeze?: boolean;

  // Complexity & fail-fast
  complexity?: {
    maxOneOfBranches?: number;
    maxAnyOfBranches?: number;
    maxPatternProps?: number;
    maxEnumCardinality?: number;
    maxContainsNeeds?: number;
    maxSchemaBytes?: number;
    bailOnUnsatAfter?: number; // gen→repair→validate cycles
  };
  failFast?: {
    externalRefStrict?: 'error'|'warn'|'ignore';
    dynamicRefStrict?: 'warn'|'note';
  };

  // Conditionals
  conditionals?: {
    strategy?: 'rewrite' | 'if-aware-lite' | 'repair-only';
    minThenSatisfaction?: 'discriminants-only'|'required-only'|'required+bounds';
  };
}
```

```ts
// Normalizer
export interface NormalizeOptions {
  rewriteConditionals?: 'never' | 'safe' | 'aggressive';
  debugFreeze?: boolean;
}
export interface NormalizeResult {
  schema: any;
  ptrMap: Map<string, string>;
  revPtrMap: Map<string, string[]>;
  notes: Array<{
    path: string;
    code:
      | 'IF_REWRITE_SKIPPED_UNEVALUATED'
      | 'IF_REWRITE_DOUBLE_NOT'
      | 'IF_REWRITE_DISABLED_ANNOTATION_RISK'
      | 'ANNOTATION_IN_SCOPE_IF_REWRITE_SKIPPED'
      | 'PNAMES_COMPLEX'
      | 'DEPENDENCY_GUARDED'
      | 'DYNAMIC_PRESENT'
      | 'DEFS_TARGET_MISSING'
      | 'EXCLMIN_IGNORED_NO_MIN'
      | 'EXCLMAX_IGNORED_NO_MAX'
      | 'OAS_NULLABLE_KEEP_ANNOT'
      | 'NOT_DEPTH_CAPPED'
      | string;
    details?: any;
  }>;
}
export function normalize(schema: any, opts?: NormalizeOptions): NormalizeResult;
```

```ts
// Composition
export interface BranchSelector {
  pick(
    kind: 'anyOf' | 'oneOf',
    branches: any[],
    ctx: { root: any; seed: number }
  ): { index: number; score: number; details?: unknown };
}
export type ContainsNeed = { schema: any; min?: number; max?: number };

export interface ComposeOptions {
  selector?: BranchSelector;
  seed?: number;
  budget?: number;
  trials?: PlanOptions['trials'];
  guards?: PlanOptions['guards'];
  rational?: PlanOptions['rational'];
  disablePatternOverlapAnalysis?: boolean;
  complexity?: PlanOptions['complexity'];
}

export function compose(schema: any, opts?: ComposeOptions): {
  schema: any;                     // effective view (must-cover + bagged contains)
  containsBag?: ContainsNeed[];
  diag?: {
    unsatHints?: string[];
    chosenBranch?: { kind:'anyOf'|'oneOf', index:number, score:number };
    overlap?: { kind:'oneOf', passing: number[] };
    overlaps?: { patterns?: Array<{ key: string, patterns: string[] }> };
    scoreDetails?: unknown;
    budget?: { tried: number; limit: number; skipped?: boolean; reason?: string };
    metrics?: Record<string, number>; // see §15
    caps?: string[];
  };
};
```

```ts
// Repair
export type AjvErr = {
  keyword: string;
  instancePath: string;
  schemaPath: string;
  params: any;
  message?: string;
};
export interface RepairCtx {
  ajv: any;
  seed: number;
  budgetPerPath: number;
  ptrMap: Map<string, string>;
  rational?: PlanOptions['rational'];
  complexity?: PlanOptions['complexity'];
}
export function repair(
  item: unknown,
  schema: any,
  errors: AjvErr[],
  ctx: RepairCtx
): { item: unknown; changed: boolean; actions?: any[]; diag?: { budgetExhausted?: boolean } };
```

```ts
// BigInt‑safe JSON (diagnostics/logs)
// Note: logging always stringifies BigInt regardless of `encoding.bigintJSON`.
export function jsonSafeReplacer(_k: string, v: unknown) {
  return typeof v === 'bigint' ? v.toString() : v;
}

// Public representation for rationals
type Rat = { p: bigint; q: bigint };           // internal
type RatPublic = { num: string; den: string }; // for logs/notes
export const toJSONSafe = (r: Rat): RatPublic =>
  ({ num: r.p.toString(), den: r.q.toString() });
```

```ts
// Branch Top‑K
function branchesToTry(scored: {idx:number; score:number}[], k: number) {
  return scored.sort((a,b)=>b.score-a.score).slice(0, k);
}
```

```ts
// Longest‑prefix reverse pointer mapping (O(depth))
// mapCanonToOrig: Map<string /* canonical ptr */, string /* original ptr */>
export function toOriginalByWalk(canonPtr: string, mapCanonToOrig: Map<string,string>): string|undefined {
  let p = canonPtr;
  while (true) {
    if (mapCanonToOrig.has(p)) return mapCanonToOrig.get(p)!;
    const i = p.lastIndexOf('/');
    if (i <= 0) return undefined;
    p = p.slice(0, i);
  }
}
```
