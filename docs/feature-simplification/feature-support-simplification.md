# Canonical Specification: JSON Schema Generator (AJV v8) — Determinism, Must‑Cover, and Diagnostics

<a id="s0-status"></a>
**Status:** Implementation spec
<a id="s0-audience"></a>
**Audience:** JSON Schema & AJV practitioners, library contributors

---

<a id="s0-terminology"></a>
<a id="s0-definitions"></a>
## Terminology (preamble — quick ref)

* **AP** — Shorthand for `additionalProperties`.
* **AP\:false** — Shorthand for `additionalProperties:false`.
* **Original schema** — Source of truth for AJV validation. Generation never replaces it.
* **Canonical (2020‑12) view** — Internal 2020‑12‑like shape produced by *Normalize*; non‑destructive.
* **Effective view** — Planning view produced by *Compose*; applies must‑cover under `additionalProperties:false` and “bag `contains`”.
* **Conjunct** — An operand of `allOf`.
* **Must‑cover** — The set of property names considered generable when at least one conjunct imposes `additionalProperties:false`, computed from `properties` plus **anchored‑safe** `patternProperties`. When `PNAMES_REWRITE_APPLIED` is present, also include the **synthetic** anchored‑safe patterns introduced from `propertyNames` by §7. Otherwise, `propertyNames` never increases coverage (it only gates).
* **Anchored‑safe pattern** — Regex whose JSON‑unescaped `source` starts with an unescaped `^` and ends with an unescaped `$`, contains **no** look‑around and **no** back‑references, **and passes the §8 regex complexity cap** (patterns capped are **not** anchored‑safe for coverage). Full rule in §8.
* **Bag `contains`** — Models `contains`/`minContains`/`maxContains` as independent needs `{schema,min?,max?}` that **concatenate** across `allOf` (see §8).
* **Presence pressure** — `effectiveMinProperties > 0` or `effectiveRequiredKeys ≠ ∅`, or a `dependentRequired` antecedent is **forced present** in the **effective view** (post‑`allOf` merge).
  See Glossary for `effectiveMinProperties` / `effectiveRequiredKeys`.
* **Seeded RNG** — Local, deterministic tie‑breaks; no global mutable state (see §15).
* **canonPath** — Canonical JSON Pointer string for a node. Historical alias: \*canonPtr\*. The spec uses \*canonPath\* uniformly; implementations MAY accept \*canonPtr\* as an internal alias.

---

<a id="s1-goal"></a>
## 1) Goal

Extend JSON Schema feature coverage **without** scattering per‑feature branches in code paths, while **always** validating each generated **instance** against the **original schema** with AJV. Keep the pipeline deterministic, observable, and budget‑aware.

<a id="s1-acceptance"></a>
### Acceptance (observable)

* **AJV validation on the original schema** for every instance, **except** when in **Lax** mode and the **Source AJV**
  compilation fails **solely due to unresolved external `$ref`** (see §11). In that case, validation is **skipped** for the
  affected instance(s): emit `EXTERNAL_REF_UNRESOLVED` with `details.skippedValidation:true` and set
  `diag.metrics.validationsPerRow = 0`. In **Strict**, compile failure on external `$ref` remains a hard error and
  generation **MUST NOT** proceed.
  *Signal:* when not skipped, final validation passes; `diag.metrics.validationsPerRow ≥ 1`.
* **No network I/O for external `$ref`** (strict by default).
  *Signal:* `EXTERNAL_REF_UNRESOLVED` (Strict = error; Lax = warn).
* **Deterministic outcomes for a given `(seed, PlanOptionsSubKey, AJV.major, AJV.flags)`** (see §14 for `PlanOptionsSubKey`).
  *Signal:* stable `diag.chosenBranch`, `diag.scoreDetails.tiebreakRand` at the same canonical pointers; **when RNG is used only in `oneOf` step‑4**, record `diag.scoreDetails.exclusivityRand` at the same `canonPath` and **MUST NOT** synthesize/overwrite `tiebreakRand`.
* **Documented budgets with explicit degradations**.
  *Signal:* `COMPLEXITY_CAP_*` diagnostics and populated `diag.budget`.

<a id="s1-bench-sli-gate"></a>
* **Bench SLI gate (CI; normative).**
  The CI **MUST** run the benchmark protocol of §15 and **fail** the run when either:
  `diag.metrics.p95LatencyMs > 120` (ms) on any of the three profiles
  **or** `diag.metrics.memoryPeakMB > 512` on any profile.
  *Signal:* `p95LatencyMs` and `memoryPeakMB` are present in `diag.metrics` for CI runs.

<a id="s1-config-gate"></a>
* **Config gate (normative).**
  Both AJV instances **MUST** satisfy the required flags enumerated in §13 (including `unicodeRegExp:true` for both).
  Any deviation is a hard failure with diagnostic **`AJV_FLAGS_MISMATCH`**.

> **Conventions.** RFC2119/8174 keywords (MUST/SHOULD/MAY) are normative.
> “Instance” = generated JSON value validated against the schema.

---

<a id="s2-scope"></a>
## 2) Scope

<a id="s2-in-scope"></a>
**In‑scope.** Parser, normalization (**canonical view**), composition/planning (**effective view**), generation, repair, validation, documentation, benchmarking.

<a id="s2-non-goals"></a>
**Non‑goals (core).**

* Remote dereferencing of external `$ref` (no network/filesystem I/O).
* Caching of **generated instances** across runs.
* Learned/scenario‑based distributions (optional extensions outside core guarantees).

<a id="s2-environment"></a>
**Environment & drafts.**

* Runtime: Node.js ≥ 18.
* Validator: AJV v8 with `unicodeRegExp:true`.
* Drafts: input schemas may use draft‑04..2020‑12+; internal canonicalization targets a 2020‑12‑like shape; validation always runs against the **original** schema.

<a id="s2-modes"></a>
**Modes (quick view; details §11).**

| Mode   | External `$ref`            | Behavior & signal                                                  |
| ------ | -------------------------- | ------------------------------------------------------------------ |
| Strict | No I/O; unresolved ⇒ error | Emit `EXTERNAL_REF_UNRESOLVED`                                     |
| Lax    | No I/O; unresolved ⇒ warn  | Emit `EXTERNAL_REF_UNRESOLVED` (warn) and attempt local generation |

*Note.* *External* means any `$ref` that is **not** fragment‑only (`#...`) after resolving against the current `$id` base (§11/§12). **No I/O** is performed in any mode.

---

<a id="s3-principles-invariants"></a>
## 3) Principles & Invariants (summary)

<a id="s3-core-principles"></a>
**Core principles (normative).**

* **AJV is the oracle (MUST).** Validate against the **original** schema, not internal transforms.
* **Deterministic (MUST).** Seeded RNG, bounded attempts, no global state.
* **No remote deref (MUST).** External `$ref` never trigger I/O.
* **Simplicity & separation.** A small number of predictable phases; narrow responsibilities per phase.
* **Observability by default.** Metrics, budgets, and diagnostics are first‑class.

<a id="s3-invariants"></a>
**Invariants (introductory; details in §7–§9).**

* **Must‑cover under `additionalProperties:false`.** When any conjunct sets `additionalProperties:false`, keys are drawn from **provable coverage** only: named `properties` plus **anchored‑safe** `patternProperties`. `propertyNames` acts as a **filter** and **only increases coverage via** the §7 additive rewrite when `PNAMES_REWRITE_APPLIED` is present (the rewrite injects **synthetic** anchored‑safe patterns that may be used for coverage). Otherwise, `propertyNames` never increases coverage. See §7–§8.
* **`contains` across `allOf` uses bag semantics.** Independent needs `{schema,min,max}` with early unsat checks. See §8–§9.
* **Determinism boundaries.** No caching of generated data; caching is limited to compiled/plan artifacts and keyed by AJV version/flags and plan options. See §14–§15.

<a id="s3-apfalse-unsafe-pattern-policy"></a>
* **AP:false unsafe‑pattern policy (Strict).**
  When any conjunct enforces `additionalProperties:false` and the must‑cover proof would rely on a pattern that is
  **not anchored‑safe** or is **capped by regex complexity**, implementations **MUST** fail‑fast before generation with
  **`AP_FALSE_UNSAFE_PATTERN`**, **but only when presence pressure holds** (i.e., `effectiveMinProperties > 0` or `effectiveRequiredKeys ≠ ∅`, or some `dependentRequired` antecedent is forced present). In the absence of presence pressure, **MUST NOT** fail‑fast; proceed with conservative exclusion per §8.

  In Lax mode, emit a warning and continue conservatively (§8).
  **Exception (normative):** a raw `propertyNames.pattern` (i.e., without the §7 additive rewrite signaled by
  `PNAMES_REWRITE_APPLIED`) **never** triggers this fail‑fast; treat it as **unknown gating** only (see §8).
  **Safe‑proof preference (normative).** Before emitting `AP_FALSE_UNSAFE_PATTERN`, implementations **MUST** attempt the §8
  safe proof: compute `Safe` by ignoring all non‑anchored and regex‑complexity‑capped patterns (including §7 synthetic ones).
  If `Safe` is **non‑empty**, **MUST NOT** fail‑fast and **MUST** restrict generation to `Safe`. See §8 for details.

> **Note.** The precise definition of **anchored‑safe** regex and the rules for when `propertyNames` can contribute to coverage are normative in §8.

---

<a id="s4-operational-guidance"></a>
## 4) Operational guidance

<a id="s4-pipeline"></a>
* **Pipeline clarity.** `Normalize → Compose → Generate → Repair → Validate`.

  ```
  Original
     │
     ▼
  Normalize (canonical 2020‑12 view)
     │
     ▼
  Compose (effective view: must‑cover, bagged contains)
     │
     ▼
  Generate ──► Repair (budgeted, AJV‑driven) ──► Validate (AJV on original)
  ```

<a id="s4-fail-early"></a>
* **Fail early when provable, degrade gracefully when not.**

<a id="s4-observability"></a>
* **Expose observability.** Per‑phase timings and counts (e.g., validations/instance, repairs/instance).

* **Keep outcomes independent of wall‑clock, locale, and environment.** (See §15.)

---

<a id="s5-options-table"></a>
## 5) Configuration Overview (reader’s map)

Defaults are conservative. Full option types and defaults are in **§23**. Mode behavior is in **§11**.
<a id="s5-pattern-witness"></a>
This table summarizes the “big knobs” and their intent (details and edge‑cases in the referenced sections).

| Area                 | Key option (default)                                 | Intent (one‑liner)                                                                    | Details |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- | ------- |
| Conditionals         | `rewriteConditionals: 'never'`                       | Do not rewrite `if/then/else`; generator is **if‑aware‑lite**                         | §7, §9  |
| Trials & selection   | `trials.perBranch=2`, `maxBranchesToTry=12`, `skipTrialsIfBranchesGt=50` | Deterministic scoring + bounded attempts; tie‑break via seeded RNG                    | §8, §15 |
| Numbers / multipleOf | `rational.decimalPrecision=12`, `fallback:'decimal'` | Exact rationals with caps; AJV‑aligned tolerance on fallback (**`multipleOf` > 0**)   | §8      |
| Output encoding      | `encoding.bigintJSON:'string'`                       | Control BigInt in **data outputs** (logs always stringify)                            | §9, §10 |
| Guards & caps        | `complexity.*` (various)                             | Bound search/analysis; emit diagnostics when capping                                  | §8, §15 |
| Modes                | **Strict** (default)                                 | External `$ref`: error (no I/O). **Lax**: warn then attempt local generation          | §11     |
| Caching              | `cache.*`                                            | Cache compiles/plans (not instances); keys include AJV major + flags + options subkey | §14     |
| Patterns under AP:false | `patternPolicy.unsafeUnderApFalse:'error'`        | **Subject to §8**: Strict fail‑fast **only** under **presence pressure** and only when the **Safe** set is empty; otherwise restrict to Safe. Raw `propertyNames.pattern` never triggers fail‑fast. Lax: warn + conservative exclusion. | §8      |
| Validator config gate    | *(normative, no option)*                    | Enforce AJV flags per §13; fail with `AJV_FLAGS_MISMATCH` on deviation      | §13 |
| Patterns (witness)         | `patternWitness.{alphabet,maxLength,maxCandidates}` | Bounded and deterministic search domain for pattern witness generation            | §9, §23 |
| Repair (must‑cover guard)  | `repair.mustCoverGuard` (default: true)             | Deterministic policy for renaming under AP:false; see §10 and cache key in §14    | §10, §14, §23 |

Clarification: `complexity.maxEnumCardinality` also applies to finite sets derived from exact‑literal `patternProperties` (see §8), in addition to `enum` and §7 synthetic literals.

<a id="s5-precedence"></a>
**Precedence & compatibility.** Mode (Strict/Lax) defines the baseline; specific `failFast` overrides refine it (see §11).
**Note on “aggressive”.** The legacy `rewriteConditionals:'aggressive'` is treated as the same as `'safe'` and is kept for compatibility; the default remains `'never'` (see §7/§23).
**Clarification (normative).** `PlanOptions.conditionals.strategy:'rewrite'` is a **deprecated alias** of `'if‑aware‑lite'`
and **MUST NOT** enable the §7 normalizer rewrite. Only `NormalizeOptions.rewriteConditionals` controls rewrites.
Cache‑key canonicalization for this alias is defined in §14.
**Further clarification (normative).** `PlanOptions.rewriteConditionals` is **deprecated**. When present, it is a
**pass‑through to Normalize** and **MUST** be ignored by Compose/Generate/Repair. It is **excluded** from
`PlanOptionsSubKey` (§14) and **MUST NOT** affect caching/memoization or outcomes outside Normalize.

**Do not confuse (normative).**
`PlanOptions.conditionals.strategy:'rewrite'` is a **deprecated alias** of `'if-aware-lite'`.
It **MUST NOT** trigger any `if/then/else` rewrite in the Normalizer. Only
`NormalizeOptions.rewriteConditionals` controls rewrites (§7).
Examples:
 • Correct: `NormalizeOptions.rewriteConditionals:'safe'` (and `PlanOptions.conditionals.strategy` may remain `'if-aware-lite'`).
 • Incorrect: setting `PlanOptions.conditionals.strategy:'rewrite'` without enabling `NormalizeOptions.rewriteConditionals`.

---

<a id="s6-high-level-architecture"></a>
## 6) High‑Level Architecture

<a id="s6-phases"></a>
**Phases.**

* **Normalize** — Draft‑aware canonicalization to a 2020‑12‑like **canonical view**. The original schema is preserved for validation.
* **Compose** — Build an **effective view** used by the generator: resolve composition, apply must‑cover (`AP:false`) and bag `contains`; do not mutate the canonical view.
* **Generate** — Produce a minimal instance that satisfies the effective constraints; deterministic (seeded) choices.
* **Repair** — AJV‑driven, budgeted corrections with a `(keyword → action)` registry; idempotent.
* **Validate** — Final AJV validation against the **original** schema; the pipeline fails on non‑compliance.

<a id="s6-mini-example-apfalse"></a>
**Mini example (illustrative — AP\:false + conditionals).**

```json
// Original (validated by AJV)
{
  "type": "object",
  "allOf": [
    { "properties": { "kind": { "enum": ["A","B"] } }, "required": ["kind"] },
    { "additionalProperties": false,
      "patternProperties": { "^(?:a1|b1)$": {} } }
  ],
  "if": { "properties": { "kind": { "const": "A" } }, "required": ["kind"] },
  "then": { "required": ["a1"] },
  "else": { "required": ["b1"] }
}
```

* **Normalize** keeps the original and prepares a canonical form (no conditional rewrite by default).
* **Compose** recognizes `AP:false` and computes the **must‑cover** keys `{a1,b1}` from the anchored pattern.
* **Generate** picks `kind` and the matching required key (`a1` or `b1`) deterministically.
* **Validate** runs on the original schema; any drift is caught and repaired within budget.

<a id="s6-mini-example-pnames"></a>
**Mini example (illustrative — `propertyNames` as a gate, not a source).**

```json
{
  "type": "object",
  "allOf": [
    {
      "additionalProperties": false,
      "properties": { "a": {}, "b": {} },
      "propertyNames": { "enum": ["a","b","c"] } // gate superset
    },
    { "required": ["a"] }
  ]
}
```

* **Compose**: must‑cover = `{"a","b"}` (coverage comes from `properties`; `propertyNames` only filters).
* **Normalize**: **no rewrite** because `additionalProperties:false` is present at this object (preconditions in §7 fail); an implementation may log `PNAMES_COMPLEX`.
* **Generate**: emits `a` (required). Adds `b` **only if** needed by `minProperties`. `c` is **never** selected under `AP:false`.

**Mini example (illustrative — `contains` bag).**

```json
{
  "type": "array",
  "allOf": [
    { "contains": { "const": 1 }, "minContains": 2 },
    { "contains": { "type": "integer" }, "maxContains": 3 }
  ]
}
```

* **Compose**: `containsBag = [{schema:{const:1},min:2},{schema:{type:"integer"},max:3}]` with early unsat checks per §8.
* **Generate/Repair**: satisfy needs deterministically; with `uniqueItems:true`, de‑duplicate first, then re‑satisfy (see §8–§9).

<a id="s6-glossary"></a>
<a id="s0-glossary"></a>
**Glossary (summary).**

* **Original schema** — Source of truth for AJV validation.
* **Canonical (2020‑12) view** — Internal shape produced by Normalize; non‑destructive.
* **Effective view** — Composition/planning result used by the generator (must‑cover and `contains` bagging applied).
* **Anchored‑safe pattern** — `^…$` (unescaped) and no look‑around/back‑references (see §8).
* **Presence pressure** — `minProperties > 0` or some `required` keys must appear; used by early‑unsat rules (see §8).
* **Seeded RNG** — Local, deterministic tie‑breaks; no global mutable state (see §15).
* **Exact‑literal‑alternatives** — A regex of the exact form `^(?:L1|...|Lk)$` where each `Li` is a literal string with all metacharacters escaped (no character classes, groups, or quantifiers). Used in §7 to prove that `patternProperties` are a subset of a finite `propertyNames.enum`.
* **User‑authored exact‑literal `patternProperties`.** A `patternProperties` entry whose JSON‑unescaped `source` is exactly of the form `^(?:L1|...|Lk)$`, where each `Li` is a literal string with metacharacters escaped (no character classes, groups, or quantifiers). These patterns may contribute finite literals to enumeration only when anchored‑safe & not complexity‑capped per §8. They remain subject to all §8 gating and caps.
* **propertyNamesSynthetic** — Synthetic anchored‑safe `patternProperties` entries injected by the §7 **propertyNames rewrite** when `PNAMES_REWRITE_APPLIED` is recorded. They exist only in the canonical/effective views to enable must‑cover analysis and early‑unsat proofs; AJV validation always uses the original schema. Diagnostics referring to synthetic patterns MUST name `sourceKind:'propertyNamesSynthetic'`.
* **deepEqual** — Structural equality on JSON values used by this spec: recursive comparison of types and values with number normalization `-0 === 0` (no NaN in JSON). Used in §8 disjointness and as the collision check for `uniqueItems` de‑duplication in §10; aligned with the structural hashing confirmation step.
* **effectiveMinProperties** — The object’s `minProperties` after `allOf` merge (Compose), i.e., the most restrictive bound proven at that canonPath.
* **effectiveRequiredKeys** — The union of `required` across all conjuncts after `allOf` merge at that canonPath.

* **pass (pattern‑witness cycle)** — One full iteration over the **current** ordered set of eligible `patternProperties`
  at an object node during witness synthesis (§9). In each pass, visit patterns in lexicographic order of their
  JSON‑unescaped sources and allocate **at most one** new key per pattern. Subsequent passes re‑evaluate eligibility
  (e.g., because newly added keys may satisfy quotas) but MUST preserve the same ordering rule and determinism.

---

<a id="s7-schema-normalizer"></a>
## 7) Schema Normalizer (Canonicalization)

<a id="s7-contract"></a>
### Contract

**Input**: JSON Schema (draft‑04..2020‑12+). `$ref` MAY be local (`#…`) or external; external refs are not dereferenced and are handled per §11/§12 (no I/O).
**Output**:

```ts
{
  schema: object,                   // canonical 2020-12-like shape (non-destructive)
  ptrMap: Map<string, string>,      // canonical JSON Pointer -> original Pointer
  revPtrMap: Map<string, string[]>, // original Pointer -> [canonical Pointers...]
  notes: Array<{ canonPath: string; code: string; details?: unknown }>
}
```

<a id="s7-pass-order"></a>
### Pass Order

1. **Draft unification**

   * `definitions`→`$defs`; `id`→`$id`.
   * Draft‑04 booleans: `exclusiveMinimum/Maximum:true` → numeric exclusives only when paired; else note `EXCLMIN_IGNORED_NO_MIN`, `EXCLMAX_IGNORED_NO_MAX`.
   * Tuples: `items:[...]`→`prefixItems:[...]`; `additionalItems:false`→`items:false`; `additionalItems:S`→`items:S`; `additionalItems:true`→`items:true`.
   * OpenAPI interop (normative): when `nullable:true` and `type` is present
     - if `type` is a string `t`, set `type:[t,"null"]`;
     - if `type` is an array `T`, **deduplicate by first occurrence preserving input order**, then **append** "null" iff missing; do not reorder existing elements.
     Otherwise keep `nullable:true` as annotation `OAS_NULLABLE_KEEP_ANNOT`.

2. **References**

   * Preserve local `#...`; rewrite `#/definitions/...`→`#/$defs/...` if target exists; note `DEFS_TARGET_MISSING` otherwise.
   * Preserve **external** `$ref` values verbatim; do **not** dereference or rewrite them. Compose/Validate emit `EXTERNAL_REF_UNRESOLVED`
     per §11/§12 (Strict=error, Lax=warn). No network or filesystem I/O is performed.
   * Don’t cross `$id` boundaries; keep anchors/dynamic anchors intact; no cycle expansion.

3. **Boolean / trivial simplifications (normative)**

  > **Guard (normative).** The simplifications in this subsection **MUST NOT** be applied when an `unevaluatedProperties` or `unevaluatedItems` keyword is **present** at the **same canonical object/array** as the operator being simplified **or at any JSON Pointer prefix** (ancestor object/array) in the **canonical view**. This guard is a **purely syntactic presence check**; it **MUST NOT** depend on runtime evaluation or branch outcomes. In such cases the original operator form **MUST** be preserved (no folding). Implementations **SHOULD** record a normalizer note (e.g., `ALLOF_SIMPLIFICATION_SKIPPED_UNEVALUATED`, `ANYOF_SIMPLIFICATION_SKIPPED_UNEVALUATED`, or `ONEOF_SIMPLIFICATION_SKIPPED_UNEVALUATED`) at the operator’s canonical path.

   * **allOf**: remove `true` operands; if any operand is `false`, the result is `false`.
   * **anyOf**: remove `false` operands; if any operand is `true`, the result is `true`.
   * **oneOf**: remove `false` operands. If, after removal, the arity is exactly 1, replace `oneOf [S]` with `S`
     (including `S:true`). Otherwise (**arity ≥ 2**), **MUST NOT** fold when any operand is `true`. Keep `oneOf` unchanged.
   * Drop empty arrays per operator identity: `allOf [] ⇒ true`, `anyOf [] ⇒ false`, `oneOf [] ⇒ false`.
   * Normalize **size‑1 `enum` → `const`** in the canonical view (planning only).
     Preserve the original schema verbatim for AJV validation. Do **not**
     expand `const` to `enum`.

<a id="s7-conditionals-rewrite"></a>
4. **Conditionals (`if/then/else`)**

   * **Default**: no rewrite (`rewriteConditionals:'never'`).
   * **`safe` rewrite** (double negation) only when strictly safe (normative):

     * **Block** if any `unevaluatedProperties/unevaluatedItems` applies to the **same instance location** as the conditional or to any JSON Pointer **prefix** of that location (ancestor objects/arrays). **MUST NOT** rewrite and **MUST** emit `IF_REWRITE_SKIPPED_UNEVALUATED` at the conditional's canonical path.
     * **Block** if evaluation‑affecting keywords are present at the nearest object/array or inside `then/else`:
       `unevaluated*`, `properties`, `patternProperties`, `additionalProperties`,
       `items`, `prefixItems`, `contains`, `propertyNames`, `dependentSchemas`, `dependentRequired`.
     * Transform to:

       ```json
       { "anyOf": [
         { "allOf": [ { "not": { "not": S } }, T ] },
         { "allOf": [ { "not": S }, E ] }
       ] }
       ```

       Note `IF_REWRITE_DOUBLE_NOT`.
   * **Normative example (no‑rewrite)**
     Given:
     ```json
     { "type":"object",
       "unevaluatedProperties": false,
       "if": { "properties": { "kind": { "const":"A" } }, "required":["kind"] },
       "then": { "required": ["a1"] },
       "else": { "required": ["a2"] }
     }
     ```
     Even with `rewriteConditionals: "safe"`, the conditional **is not** rewritten; a note `IF_REWRITE_SKIPPED_UNEVALUATED` is recorded.
   * Partial forms: keep `if`‑only and `then`/`else`‑only as‑is.
   * **`aggressive` rewrite:** **alias of** **`safe`** (identical behavior and guards; no additional rewrites; no extra diagnostics).
   * Cap nested `not` by `guards.maxGeneratedNotNesting` (note `NOT_DEPTH_CAPPED`). **Default: 2** (aligns with §23).

<a id="s7-dependencies-guard"></a>
5. **Dependencies / dependents**

   * **No conditional rewrites.** Do not convert dependents into `if/then/else`. Use only the annotation‑safe `anyOf` guard form.
   * **Normative guard form (dependentRequired):** for each mapping `k -> [d1,...,dn]`, the guarded equivalent is:
     ```json
     { "anyOf": [ { "not": { "required": ["k"] } }, { "required": ["k","d1", "...", "dn"] } ] }
     ```
     Apply only when no `unevaluated*` is in scope.
   * Don’t rewrite when any `unevaluated*` is in scope. Note `DEPENDENCY_GUARDED`.

<a id="s7-object-keywords-pnames-rewrite"></a>
6. **Object keywords**

   * Preserve `patternProperties`, `propertyNames`, `additionalProperties`.
   * `propertyNames` rewrite (only when strictly equivalent and when no `unevaluated*` is in scope). **MUST Preconditions (normative) for equivalence**:
     1) **Global guard:** No `unevaluated*` applies at or above the object (unchanged).
   2) **Closed‑enum form:** Every key in `properties` **and in `required`** is a member of the enum **and** there are no `patternProperties` **or** each existing `patternProperties` pattern is anchored‑safe and provably a subset of the enum via **exact‑literal‑alternatives** (see Glossary): the pattern source, after JSON unescape, is exactly `^(?:L1|...|Lk)$` with each `Li` a literal alternative (metacharacters escaped) and `{L1,...,Lk} ⊆ enum`. If this cannot be proven, **do not rewrite** and emit `PNAMES_COMPLEX` (detail: `REQUIRED_KEYS_NOT_COVERED` when applicable).
       **Additional type precondition (normative):** Every member of `propertyNames.enum` **MUST** be a JSON string. If any non‑string member is present, the rewrite **MUST NOT** occur and the normalizer **MUST** emit `PNAMES_COMPLEX` with `details.reason:"NON_STRING_ENUM_MEMBER"`.
    3) **Anchored‑pattern form:** `P` is anchored‑safe per §8 and not capped by the regex complexity rule; every key in `properties` **and in `required`** matches `P`, and there are **no** `patternProperties`. Otherwise, **do not rewrite** and emit `PNAMES_COMPLEX`; when the failure is due to complexity capping also emit `REGEX_COMPLEXITY_CAPPED`.
   4) **AdditionalProperties safety:** `additionalProperties` at this object is absent, `true`, or `{}`. If `additionalProperties` is present and is **neither `true` nor `{}`** — i.e., it is `false` or a **non‑empty schema object** — **do not rewrite** and emit `PNAMES_COMPLEX` with detail `'ADDITIONAL_PROPERTIES_SCHEMA'`.
       **Rationale (normative clarification):** the empty schema `{}` is permitted because it does not constrain values; any other schema would semantically narrow value constraints and break equivalence.
    5) When the above hold, the rewrite is **additive in the canonical view** (the original `propertyNames` remains alongside the added constraints); otherwise preserve the original `propertyNames` only.
    6) **Logging (normative):** On successful rewrite the normalizer **MUST** record a note `PNAMES_REWRITE_APPLIED` at this object’s canonical path with `details:{ kind:'enum'|'pattern', source?:string }`. Implementations **MAY** include the JSON‑unescaped regex `source` in `details.source` for the pattern case. This signal gates coverage usage in §8.

     **Cross‑conjunct note (normative).** When `propertyNames` occurs in a conjunct **without** `additionalProperties:false`, the rewrite (when allowed by §7 preconditions) **adds** `additionalProperties:false` in the **canonical view of that conjunct only**. Consequently this conjunct **does** contribute to the global must‑cover intersection in §8. This does **not** alter the final validation, which always uses the **original schema**. Only conjuncts that enforce `additionalProperties:false` in the canonical/effective view contribute recognizers.
     * **Closed enum** form (additive canonicalization; **apply only when preconditions (1), (2) & (4) hold**):
       Given `{"propertyNames":{"enum":[n1,...,nk]}}`, **do not modify the original `propertyNames` node**. Let **`E_str`** be exactly the set of **string** members of the enum after **deduplication then UTF‑16 sorting**; if any non‑string member exists, this violates the type precondition above and the rewrite **MUST NOT** occur. Construct a synthetic anchored‑safe alternation from `E_str` by escaping each literal via `escapeRegexLiteral`. **Add only** the following constraints in the **canonical view** (the original `propertyNames` remains as‑is):
       ```json
       {
         "patternProperties": { "^(?:n1|...|nk)$": {} },
         "additionalProperties": false
       }
       ```
    where each `ni` is escaped using **escapeRegexLiteral(ni)** (normative) and the pattern string is JSON‑escaped as needed. Values remain unconstrained by this rewrite.
  **Alternation order (normative):** the alternation `^(?:n1|...|nk)$` **MUST** list names in UTF‑16 lexicographic order after deduplication; each `ni` is escaped via `escapeRegexLiteral(ni)` before joining. This requirement constrains only the synthetic alternation; it **does not** reorder or deduplicate the original `propertyNames` array.
     **Cap:** If the constructed pattern’s JSON‑unescaped source exceeds the §8 regex complexity cap (length or quantified‑group detection, per §8), **do not rewrite**; the original `propertyNames` remains **gating‑only** for must‑cover (no coverage expansion). Emit `REGEX_COMPLEXITY_CAPPED` with `details:{ context:'rewrite', patternSource:P }` alongside `PNAMES_COMPLEX`.
     **Diagnostics (normative):** The emission **MUST** use the §19.1 payload shape with
     `details:{ context:'rewrite', patternSource:P }`, where `P` is the JSON‑unescaped regex source considered.
     
     **Definition — `escapeRegexLiteral(s)` (normative):** return exactly `s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`.
     This escapes each metacharacter so the literal name is safe inside an alternation.
     **Reference literal (JavaScript):** `/[.*+?^${}()|[\]\\]/g` with `RegExp.source` equal to `[.*+?^${}()|[\]\\]`.
     No other transformations are applied. The resulting source is interpreted by JS `RegExp` with the `u` flag (see §13).
        **Equivalence note (validation semantics):** Under preconditions (2)–(4), `propertyNames` already forbids any non‑member key; adding `additionalProperties:false` is semantically redundant **for AJV validation (key admission)** and exists only to enable must‑cover analysis (§8). The original schema is preserved and validation always runs against the **original schema**. The added `patternProperties` entry is **synthetic** and only considered for coverage when `PNAMES_REWRITE_APPLIED` is present.
     * **Anchored‑safe pattern** form (additive canonicalization; **apply only when preconditions (1), (3) & (4) hold and `P` is not complexity‑capped**):
     Given `{"propertyNames":{"pattern": P}}` with `P` anchored‑safe (see §8 “Anchored pattern”) and **not** flagged by the §8 regex complexity cap,
     **add** in the **canonical view** (retain the original `propertyNames` **unchanged**):
      ```json
      {
        "patternProperties": { "P": {} },
        "additionalProperties": false
      }
      ```
     The added `patternProperties` entry is **synthetic** and may be consumed by §8 must‑cover only when the normalizer emitted `PNAMES_REWRITE_APPLIED`.
     **Non‑duplication guarantee (normative).** This rewrite **MUST NOT** duplicate or replace the existing `propertyNames` node; snippets that show `propertyNames` are illustrative only. The original node remains the sole `propertyNames` at this object.
    **Cap:** If `P` is flagged by the §8 regex complexity cap (length or quantified‑group detection), **do not rewrite**; the original `propertyNames` remains **gating‑only** for must‑cover (no coverage expansion). **Emit** `REGEX_COMPLEXITY_CAPPED` with `details:{ context:'rewrite', patternSource:P }` **and** `PNAMES_COMPLEX`. Such patterns remain gating‑only in §8 and **never** expand coverage or trigger fail‑fast.
    **Cross‑phase requirement (normative).** Whenever §8 coverage analysis treats a pattern as capped, implementations **MUST** emit `REGEX_COMPLEXITY_CAPPED` with `details:{ context:'coverage', patternSource }` in Compose.
     * **Counterexample (normative, refusal):** Given `{ "propertyNames": { "pattern": "^foo" } }` (no trailing `$`),
       a naive rewrite to `{ "patternProperties": { "^foo$": {} }, "additionalProperties": false }` **narrows** admitted names by
       excluding `"foobar"`, which the original permits. Because the pattern is **not anchored‑safe**, preconditions fail and the rewrite
       **MUST NOT** occur; emit `PNAMES_COMPLEX`.
     * **Cross‑reference (normative):** Under `additionalProperties:false`, if must‑cover would rely on a **non‑anchored** or **complexity‑capped** pattern from `patternProperties` or from the §7 rewrite (**synthetic entries**; `sourceKind:'propertyNamesSynthetic'`), §8 requires **fail‑fast** in Strict mode with `AP_FALSE_UNSAFE_PATTERN`. Raw `propertyNames.pattern` (no `PNAMES_REWRITE_APPLIED`) **never** triggers fail‑fast **and never increases coverage**; treat it as unknown gating. Lax mode warns and proceeds conservatively.
    * **Do not rewrite** if any `unevaluated*` applies at or above the object **or** any precondition above fails: emit `PNAMES_COMPLEX` (with detail when available).
  **Compile‑error guard (normative).** If the `propertyNames.pattern` fails to compile under `new RegExp(source,'u')`, the normalizer **MUST** emit **both** `REGEX_COMPILE_ERROR{patternSource:source, context:'rewrite'}` and `PNAMES_COMPLEX{reason:'REGEX_COMPILE_ERROR'}` and skip the rewrite. **Locus:** record both notes at the **owning object’s canonPath** (the node that holds `propertyNames`). **Per §19.0, `canonPath` MUST NOT be repeated inside `details`.**
      **Diagnostics (normative extension).** When a `propertyNames` rewrite is skipped **because** an `unevaluated*` keyword applies at or above the same instance location, the normalizer **MUST** emit `PNAMES_COMPLEX` with `details.reason:"UNEVALUATED_IN_SCOPE"`, in addition to any existing notes (e.g., `IF_REWRITE_SKIPPED_UNEVALUATED` when relevant).

    **Planning‑only effect (normative).** All constraints added by the `propertyNames` rewrite (synthetic `patternProperties` entries and the additive `additionalProperties:false`) exist **only** in the **canonical/effective view** to enable must‑cover analysis. They do not change AJV’s final validation, which always runs against the **original schema**. Implementations **MUST NOT** rely on these additive constraints to claim that the original schema has changed semantics.
     * The rewrite is additive **only** under the stated preconditions; the original schema is preserved for AJV validation.

    **Normative examples — rewrite gating**
    (A) REFUSAL (additionalProperties has a non-empty schema):
    ```json
    {
      "properties": { "a": {} },
      "propertyNames": { "enum": ["a","b"] },
      "additionalProperties": { "type": "string" }
    }
    ```
    ⇒ **MUST NOT** rewrite; emit `PNAMES_COMPLEX{ reason:'ADDITIONAL_PROPERTIES_SCHEMA' }`.

    (B) ACCEPTANCE (closed enum of strings; additive only in canonical/effective views):
    ```json
    {
      "properties": { "a": {} },
      "propertyNames": { "enum": ["a","b"] }
    }
    ```
    ⇒ Add **synthetic**: `patternProperties: { "^(?:a|b)$": {} }`
       and `additionalProperties:false` (canonical/effective views only).
       Keep the original schema for AJV validation; emit `PNAMES_REWRITE_APPLIED{ kind:'enum' }`.
       **Alternation order (normative):** list names in UTF‑16 lexicographic order after deduplication.

7. **Pass‑through**

   * `$dynamicRef/$dynamicAnchor/$recursiveRef` untouched; note `DYNAMIC_PRESENT`.

<a id="s7-dev-safety"></a>
8. **Dev safety**

   * Optional deep‑freeze when `debugFreeze` and not `disableDeepFreeze`.
   * **Normative:** Enabling `debugFreeze` **MUST NOT** alter any observable outcome
     (plans, chosen branches, generated values, diagnostics). It may only affect time/memory.

<a id="s7-note-codes"></a>
**Normalizer note codes (non‑exhaustive)**:
`IF_REWRITE_DOUBLE_NOT`, `IF_REWRITE_SKIPPED_UNEVALUATED`, `ANNOTATION_IN_SCOPE_IF_REWRITE_SKIPPED`,
`IF_REWRITE_DISABLED_ANNOTATION_RISK`, `PNAMES_COMPLEX`, `DEPENDENCY_GUARDED`, `DYNAMIC_PRESENT`,
`DEFS_TARGET_MISSING`, `EXCLMIN_IGNORED_NO_MIN`, `EXCLMAX_IGNORED_NO_MAX`, `OAS_NULLABLE_KEEP_ANNOT`,
`NOT_DEPTH_CAPPED`, `PNAMES_REWRITE_APPLIED`, `ALLOF_SIMPLIFICATION_SKIPPED_UNEVALUATED`, `ANYOF_SIMPLIFICATION_SKIPPED_UNEVALUATED`, `ONEOF_SIMPLIFICATION_SKIPPED_UNEVALUATED`.

---

<a id="s8-composition-engine"></a>
## 8) Composition Engine

<a id="s8-responsibilities"></a>
### Responsibilities

* Build an **effective view** used by the generator.
* Provide diagnostics for testing/debugging:

```ts
{
  schema: Schema,
  containsBag?: Array<{ schema:any; min?:number; max?:number }>,
  diag?: {
    /**
     * Fatal diagnostics recorded during Compose (e.g., AP_FALSE_UNSAFE_PATTERN fail-fast at an object/array node).
     * Presence of any entry indicates the affected canonPath MUST NOT be generated.
     */
    fatal?: Array<{ code: string; canonPath: string; details?: unknown }>,
    /**
     * Non-fatal diagnostics recorded during Compose (e.g., AP_FALSE_UNSAFE_PATTERN in Lax mode).
     * Entries here MUST NOT prevent generation at the corresponding canonPath.
     * Normative routing: in Strict, AP_FALSE_UNSAFE_PATTERN MUST appear in `fatal`;
     * in Lax, AP_FALSE_UNSAFE_PATTERN MUST appear in `warn` (never in `fatal`).
     */
    warn?: Array<{ code: string; canonPath: string; details?: unknown }>,
    /**
     * Unsatisfiability hints when early-unsat is NOT taken.
     * Each hint MUST carry the canonical pointer and whether the proof was anchored-safe (provable).
     */
    unsatHints?: Array<{
      code: string;                 // e.g., 'UNSAT_REQUIRED_AP_FALSE'
      canonPath: string;            // canonical JSON Pointer of the object/array node responsible
      provable?: boolean;           // default false when omitted
      reason?: string;              // e.g., 'coverageUnknown', 'nonAnchoredPattern', 'regexComplexityCap', 'presencePressure'
      details?: unknown;            // code-specific payload (see §8 “Unsat hint payloads”)
    }>,
    chosenBranch?: { kind:'anyOf'|'oneOf', index:number, score:number },
    overlap?: { kind:'oneOf', passing: number[], resolvedTo?: number },
    overlaps?: { patterns?: Array<{ key: string, patterns: string[] }> },
    // **MUST** be present when the `canonPath` is a branch node (anyOf/oneOf);
    // **MUST** be `undefined` at non‑branch nodes (aligns with §23 Compose API contract).
    scoreDetails?: {
      orderedIndices: number[];       // branches by score desc / index asc
      topScoreIndices: number[];      // tie set BEFORE RNG
      // Normative: At any branch node, `scoreDetails` MUST be present; it MUST include
      // `orderedIndices` and `topScoreIndices` in all cases (including when branches.length === 1).
      /**
       * REQUIRED in score‑only (always, even when |T|=1) and whenever RNG is used for SELECTION (tie‑breaks).
       * When RNG is used only for oneOf step‑4 exclusivity, leave undefined and record `exclusivityRand` instead.
       * MAY be undefined only when (a) RNG was not used for selection and trials occurred, or (b) RNG was used only
       * for oneOf step‑4 exclusivity (recorded via `exclusivityRand`).
       */
      tiebreakRand: number | undefined;
      /** RNG used by oneOf step‑4 when `b*` no longer passes; omitted otherwise. */
      exclusivityRand?: number;
      scoresByIndex?: Record<string, number>; // OPTIONAL: map "i" -> score
    },
    budget?: { tried: number, limit: number, skipped?: boolean, reason?: string },
    metrics?: { /* see §15 */ },
    // Compose-time complexity caps only. Valid entries are a subset of:
    //   'COMPLEXITY_CAP_ONEOF', 'COMPLEXITY_CAP_ANYOF',
    //   'COMPLEXITY_CAP_ENUM', 'COMPLEXITY_CAP_CONTAINS',
    //   'COMPLEXITY_CAP_SCHEMA_SIZE'.
    // MUST NOT include generator-only 'COMPLEXITY_CAP_PATTERNS'.
    // Determinism (normative): `caps` MUST be de-duplicated and sorted in UTF‑16 lexicographic **ascending** order before export.
    caps?: string[]
  }
}
```
**Normative (caps field).** Entries in `diag.caps` **MUST** be limited to compose‑time caps only and be a subset of:
`COMPLEXITY_CAP_ONEOF`, `COMPLEXITY_CAP_ANYOF`, `COMPLEXITY_CAP_ENUM`, `COMPLEXITY_CAP_CONTAINS`, `COMPLEXITY_CAP_SCHEMA_SIZE`.
Implementations **MUST NOT** include generator‑only `COMPLEXITY_CAP_PATTERNS` in this field. For determinism they **MUST** be de‑duplicated and sorted in UTF‑16 lexicographic **ascending** order before export.
 
 <a id="s8-coverage-index-export"></a>
 ### Coverage Index export (normative)
 
 `Compose` **MUST** produce a coverage index **entry for every object node** and return the map as `coverageIndex` in the API result.
 Implementations **MUST NOT** elide entries based on mode or guard configuration. The map MAY be empty **only when the schema contains no object nodes**; consumers
 **MAY** ignore it when not needed. Implementations MUST NOT elide `enumerate()` due to budgets or PlanOptions. Its presence depends only on whether
 the global must‑cover intersection is provably finite per this section. When finite, `enumerate()` MUST be provided;
 otherwise it MUST be absent. This preserves determinism and the Purity requirement below.


 ```ts
 type CoverageEntry = {
   has: (name: string) => boolean;
   enumerate?: () => string[];
  /** Object‑level provenance: which source families contributed to the **global** must‑cover intersection at this object.
   *  Normative: 'patternProperties' lists only user-authored entries present in the original schema.
   *  Normative: §7 synthetic additions (from a propertyNames rewrite) MUST be attributed solely as
   *  'propertyNamesSynthetic' and MUST NOT be co-counted as 'patternProperties'.
   *  This is coarse metadata; it MUST NOT be interpreted as a per‑name proof. */
  provenance?: ('properties'|'patternProperties'|'propertyNamesSynthetic')[];
  /** Determinism (normative): when present, `provenance` MUST be de‑duplicated and sorted in UTF‑16 lexicographic order before export. */
 };
 type CoverageIndex = Map<canonPath, CoverageEntry>;
 ```
 
* **Purity (normative).** Both `has(name)` and `enumerate()` are pure: no AJV calls, no I/O, no dependence on seed,
  wall‑clock, environment, locale, budgets, or any `PlanOptions` values. They depend only on the canonical schema subtree at
  `canonPath` and `(AJV.major, AJV.flags)`. When present, repeated calls to `enumerate()` for the same
  `(canonPath, AJV.major, AJV.flags)` MUST return byte‑for‑byte identical arrays.
* **Vacuous case (normative).** When no conjunct at the object has `additionalProperties:false`, the `CoverageIndex` **still includes** an entry for this object: `has(name)` **MUST** return `true` for any string input; `enumerate` **MUST** be `undefined`; and `provenance` **MUST** be empty.
* **Global intersection (normative):** `has(name)` decides membership in the **global must‑cover intersection** at this object — i.e., the intersection across **all** `allOf` conjuncts that set `additionalProperties:false`, after applying only the **safe** `propertyNames` gating of §8 (enum, or anchored‑safe & not complexity‑capped). Concretely, return `true` **iff** `name` is admitted by **each** such conjunct via its named `properties` or an **anchored‑safe** `patternProperties` entry, including **synthetic** entries from the §7 `propertyNames` rewrite **only when** `PNAMES_REWRITE_APPLIED` was recorded. Raw `propertyNames.pattern` **never** contributes coverage.
* **Contributors to the intersection (normative clarification).** Only conjuncts that enforce `additionalProperties:false` at the object location **contribute** recognizers to the global must‑cover intersection. Conjuncts without `additionalProperties:false` do **not** participate in the coverage intersection (their `additionalProperties` schemas remain relevant to AJV validation but are irrelevant to must‑cover planning).
* Equality (normative): `name` is a JavaScript string; comparisons are **case‑sensitive** and performed on **UTF‑16 code units** (ECMA‑262). Implementations **MUST NOT** apply Unicode normalization.
* **Pattern execution engine (normative):** whenever the coverage/gate logic tests a `name` against a pattern
  (from `patternProperties` or an anchored‑safe `propertyNames.pattern`), it **MUST** compile and test using
  **JavaScript RegExp with exactly the `u` flag** — i.e., `new RegExp(source, 'u')` — and **MUST NOT** enable `g` or `y`
  flags (to avoid stateful matching), so that matching semantics align with
  AJV’s `unicodeRegExp:true` requirement (§13). Detection of anchored‑safe patterns remains textual on the
  **JSON‑unescaped** `source` as specified below.
  **Compile‑error rule (normative).** If `new RegExp(source, 'u')` throws, the implementation **MUST** treat the pattern as **unknown gating** and **MUST NOT** use it to expand coverage **or** to trigger `AP_FALSE_UNSAFE_PATTERN`. Emit **`REGEX_COMPILE_ERROR`** at the corresponding `canonPath` with `details:{ patternSource: source, context:"coverage" }`.  
  **Cross‑reference (normative).** All regex diagnostics payloads in this section (`REGEX_COMPILE_ERROR`, `REGEX_COMPLEXITY_CAPPED`, `AP_FALSE_UNSAFE_PATTERN`) **MUST** conform to §19.1: `patternSource` (when present) is the JSON‑unescaped source (Definition — JSON‑unescaped regex source) and `canonPath` MUST NOT be duplicated inside `details`.
  **Diagnostic locus (normative).** For coverage-time regex diagnostics (`REGEX_COMPILE_ERROR`, `REGEX_COMPLEXITY_CAPPED`) arising from `patternProperties` or from `propertyNames`, Compose **MUST** emit them at the **owning object’s canonPath** (the node that contains the keyword), not at the pattern literal. Do not duplicate `canonPath` in `details` (§19).
  **Severity routing (normative).** `REGEX_COMPLEXITY_CAPPED{context:'coverage'}` and `REGEX_COMPILE_ERROR{context:'coverage'}` **MUST** be recorded as **non‑fatal** entries in `diag.warn`. They **MUST NOT** appear in `diag.fatal` unless another rule independently escalates the node (e.g., §8 fail‑fast under AP:false).
  **Deduplication (normative).** Compose **MUST** de‑duplicate coverage‑time regex diagnostics by the tuple
  `(canonPath, code, details.context, details.patternSource)` and export at most one entry per tuple in `diag.warn`.
  AJV remains the oracle at validation time; coverage analysis does not attempt to reinterpret such constructs. This rule also applies when evaluating §7 `propertyNames` rewrite preconditions: a compile error under `u` prevents the rewrite and **MUST** log **both** `REGEX_COMPILE_ERROR{patternSource: source, context:"rewrite"}` and `PNAMES_COMPLEX{reason:"REGEX_COMPILE_ERROR"}` (and any other applicable diagnostics). **When compile errors reduce provable coverage under presence pressure, implementations MUST also emit `AP_FALSE_INTERSECTION_APPROX` with `details.reason:"regexCompileError"`.** AJV remains the oracle at validation time. No other recovery is permitted. **Payload conformance:** regex diagnostics’ `details` **MUST** satisfy §19.1 (regex payloads) and use the JSON‑unescaped `patternSource`.
  **Clarification (normative).** JSON Schema does not use inline flags; with `u` only, `^` and `$` anchor the entire string.
  Multi‑line or sticky semantics are not in play; implementations **MUST NOT** assume such flags when assessing
  anchored‑safety or executing patterns for coverage.
* **Definition (normative) — JSON‑unescaped regex source.** The ECMAScript string obtained by parsing the JSON
  string literal of `pattern` (RFC8259), i.e., the exact `source` passed to `new RegExp(source,'u')`. All textual
  anchored‑safe tests and complexity scans in this specification operate on this decoded string.
* `enumerate()` **MUST** be provided **iff** the **global must‑cover intersection** is a **provably finite** set built exclusively from any combination of:
  (a) named `properties`, and/or (b) **synthetic** exact‑literal‑alternatives (Glossary) introduced by the §7 rewrite (`PNAMES_REWRITE_APPLIED`), and/or (c) **user‑authored** `patternProperties` entries whose JSON‑unescaped `source` is an **exact‑literal‑alternatives** regex `^(?:L1|...|Lk)$` that is **anchored‑safe & not complexity‑capped** per §8.
  If **any** other pattern remains at this object (including anchored‑safe but non‑finite patterns such as `^a+$`), or if per‑conjunct coverage cannot be finitely intersected, `enumerate` **MUST NOT** be provided.
  **Clarification (normative):** mixed sources are allowed on a per‑conjunct basis; the result is the **finite intersection** across AP:false conjuncts.
  **Finite‑empty case (normative):** when this finite intersection is empty, `enumerate()` **MUST** be present and **MUST** return `[]`.
  **Result (normative):** when provided, `enumerate()` **MUST** return
   • The exact finite **global must‑cover intersection** at this object, i.e.
     `⋂_{Ci with AP:false} ( properties_Ci ∪ literals(propertyNamesSynthetic_Ci) )`, after applying the safe `propertyNames` gating of §8;
   • with duplicates removed; and
   • in **UTF‑16 lexicographic** order (ascending).
  **Cardinality cap (normative).** When the derived finite universe size (post‑intersection) **exceeds** `complexity.maxEnumCardinality`, Compose **MUST NOT** provide `enumerate()` and **MUST** emit `COMPLEXITY_CAP_ENUM` with `details:{ limit:number, observed:number }`.
  **Enumeration vs `propertyNames.enum` (normative clarification).** Even when the global must‑cover intersection becomes
  finite **solely** because a raw `propertyNames.enum` is present (i.e., without a §7 rewrite at the same object),
  `enumerate()` **MUST NOT** be provided. A raw `propertyNames.enum` remains a **gate** and **does not** contribute generative
  coverage; only **synthetic** exact‑literal alternatives produced by the §7 rewrite (signaled by `PNAMES_REWRITE_APPLIED`)
  may participate in a finite, enumerable intersection.
  **Provenance (normative).** When `enumerate()` is provided, `provenance` **MUST** be present and list the
  source families that contributed to the enumerated set. It **MUST** include `'propertyNamesSynthetic'`
  whenever §7 injected synthetic patterns were used (`PNAMES_REWRITE_APPLIED`) and **MAY** include `'patternProperties'` when user‑authored exact‑literal alternations contributed. `provenance` remains coarse and
  **MUST NOT** be interpreted as a per‑name proof.

  **Algorithm (normative) — enumerate()**
  Precondition: the global must‑cover intersection at this object is **provably finite**
  and consists **only** of:
    (a) named `properties`, and/or
    (b) literals from §7 synthetic exact‑literal‑alternatives when `PNAMES_REWRITE_APPLIED` was recorded, and/or
    (c) literals from user‑authored `patternProperties` whose JSON‑unescaped `source` is an exact‑literal‑alternatives regex and is **anchored‑safe & not complexity‑capped**.
  Steps:
  1) For each AP:false conjunct Ci:
     A_i := set of `properties` keys in Ci.
     If `PNAMES_REWRITE_APPLIED` at this object: add all literals from each **synthetic** exact‑literal pattern.
     Add all literals from each **user‑authored** `patternProperties` entry in `Ci` whose JSON‑unescaped `source` is an **exact‑literal‑alternatives** regex and is **anchored‑safe & not complexity‑capped**; patterns that are not exact‑literal, that fail compilation, or that are complexity‑capped **contribute nothing**.
     If Ci.propertyNames is enum(strings): A_i := A_i ∩ enum.
     If Ci.propertyNames is pattern **and** anchored‑safe & non‑capped:
        filter A_i by that pattern; otherwise leave A_i unchanged (unknown gating).
  2) G := ⋂ A_i over all such Ci.
  3) If `|G| > complexity.maxEnumCardinality` (when defined), do **not** export `enumerate()` and **emit** `COMPLEXITY_CAP_ENUM{ limit, observed: |G| }`. Otherwise return `sortUTF16Asc(dedup(G))`.

  **Further constraints (normative).**
  • Regex guards: Only **anchored‑safe & non‑capped** exact‑literal alternations may contribute literals; patterns that fail to compile or are capped contribute **no** literals and **MUST** log coverage‑time diagnostics per §8.
  • Implementations **MUST NOT** provide `enumerate()` when finiteness stems **only** from a raw `propertyNames.enum`
    (i.e., when no §7 rewrite occurred at this object).
  • When `enumerate()` is provided, the export **MUST** also include `provenance`,
    de-duplicated and UTF‑16 sorted; it **MUST** list `'propertyNamesSynthetic'` whenever §7 synthetic patterns
    contributed to the enumerated set.
* The `CoverageIndex` is **deterministic** for a fixed `(AJV.major, AJV.flags)` and **MUST NOT** vary with seed or `PlanOptions*`.
 <a id="s8-coverage-index-enumerate"></a>
 * Enumeration order (normative). When `enumerate` is provided, it **MUST** return a **deduplicated** array of names in **UTF‑16 lexicographic** order (ascending). This requirement is for determinism; consumers remain free to ignore `enumerate` when not needed.

**Definition (normative) — `literals(propertyNamesSynthetic_Ci)`.**
Let `propertyNamesSynthetic_Ci` be the set of **synthetic** anchored‑safe patterns added by the §7 rewrite at this object for conjunct `Ci` (present only when `PNAMES_REWRITE_APPLIED` was recorded). For each such pattern whose JSON‑unescaped source is an **exact‑literal‑alternatives** form `^(?:L1|...|Lk)$`, include all literals `{L1,...,Lk}`. When multiple synthetic patterns exist, take the **union** of their literal sets. Patterns that are not exact‑literal‑alternatives contribute nothing.

<a id="s8-allof-merge"></a>
### `allOf` merge (domain‑aware)

* **Type** — Intersect sets (including unions with `"null"`). Empty ⇒ unsat.

* **Enum/Const** — Intersect `enum`; conflicting `const` ⇒ unsat. In generation, `enum/const` outrank broad `type`.

<a id="s8-numbers-multipleof"></a>
* **Numbers**

  * Bounds — Take most restrictive `minimum/maximum` and exclusives.
  * `multipleOf` — Exact rational:
    **Precondition (normative).** The divisor **MUST** be strictly positive (`m > 0`). Schemas with `multipleOf <= 0` are invalid and are expected to be rejected by AJV at compile time. This precondition applies to **all** paths (exact and fallback).

    * Integers: intersection multiple is `lcm(a,b)`.
    * Rationals (reduced `p/q`, with `p,q ∈ ℕ⁺`): intersection multiple is `lcm(p1,p2)/gcd(q1,q2)`.
    * **Caps** — If `bitLen(p|q)` > `maxRatBits`, or `bitLen(lcm)` > `maxLcmBits`, or `qCap` exceeded:
      **Definition (normative) — `bitLen(n)`.** For positive integers `n ∈ ℕ⁺`, `bitLen(n) := ⌊log2(n)⌋ + 1`. (Rationals here satisfy `p,q ∈ ℕ⁺`.)

      * `fallback:'decimal'` ⇒ **quantize both operands** — let `x_q := quantize(x, decimalPrecision)` and
        `m_q := quantize(m, decimalPrecision)` — using **round‑half‑even** (banker’s rounding), with no locale influence;
        **then compute** `r := x_q / m_q` in IEEE‑754 double precision and **apply the same ε‑based acceptance rule**
        as below; note `RAT_FALLBACK_DECIMAL`.
        **Normative order:** quantize → divide → test `|r − round(r)| < ε` with `ε := 10^(−decimalPrecision)`.
        **Normative:** this rounding mode is part of the observable outcome. It MUST be respected in all decimal fallback computations and is implicitly captured via `rational.decimalPrecision` in `PlanOptionsSubKey` (§14).
      * `fallback:'float'`   ⇒ compute the ratio `r := x / m` in IEEE‑754 double precision and
        **apply the exact same ε‑based acceptance rule as for `'decimal'`**:
        let `ε := 10^(−decimalPrecision)` (default `1e‑12`);
        accept `multipleOf(m)` when `abs(r − round(r)) < ε`.
        Note `RAT_FALLBACK_FLOAT`.
    **Definition — `quantize(x, p)` (normative):** Let `p` be the number of decimal places (integer `p ≥ 0`). Compute `x_q := round_half_even(x · 10^p) / 10^p` in IEEE‑754 double, where `round_half_even` rounds ties to the nearest even integer. No locale‑dependent behavior; deterministic for a fixed `p`.
      * **Policy note (normative).** The `ε = 10^(−decimalPrecision)` tolerance used in decimal/float fallbacks is a **generation/repair policy** adopted for deterministic alignment with common validator behavior. It is **not** mandated by the JSON Schema specification.
      * **Normative (both decimal & float fallbacks):** `multipleOf` **MUST** have a positive divisor `m > 0` (schemas with `m ≤ 0` are invalid and are expected to be rejected by AJV at compile time). Let `ε = 10^(−decimalPrecision)` (default `1e‑12`);
        accept `multipleOf(m)` when `abs((x/m) − round(x/m)) < ε`.
      * **Normative note.** The acceptance inequality above governs both `'decimal'` and `'float'` fallbacks. **Boundary:** when `abs((x/m) − round(x/m)) === ε`, the value **does not** satisfy `multipleOf(m)`. The only difference is the arithmetic path (decimal quantization vs IEEE‑754 double); the tolerance `ε` is identical to ensure deterministic cross‑engine behavior.
      
      **Ajv alignment (normative).** When `rational.fallback ∈ {'decimal','float'}` is used, **both** the Source and Planning Ajv **MUST** set `multipleOfPrecision = rational.decimalPrecision` so that the ε‑based acceptance rule (`ε = 10^(−decimalPrecision)`) matches Ajv’s validator. **Caveat:** the decimal fallback quantizes operands before division, whereas Ajv computes the ratio `x/m` in IEEE‑754 double; boundary cases may differ. Ajv remains the oracle at validation time. **Startup gate:** if either Ajv instance lacks this setting or the values differ, the run **MUST** fail with `AJV_FLAGS_MISMATCH` per §13.
      * Note `RAT_LCM_BITS_CAPPED` / `RAT_DEN_CAPPED` as applicable.

      **Definition (normative) — denominator cap `qCap`.** Let inputs be expressed as reduced rationals
      `x = p_x/q_x` and `m = p_m/q_m` with `gcd(p, q) = 1` and `q > 0`. The exact test uses the reduced ratio
      `r = x / m = (p_x * q_m) / (q_x * p_m)`. Let `q := denom(r)` **after reduction to lowest terms**. The
      denominator cap **applies to `q`**. If `qCap` is configured and `q > qCap`, exact rational math **MUST**
      fall back per the configured policy (`'decimal'` or `'float'`) and **MUST** emit `RAT_DEN_CAPPED` with
      `details:{ limit:qCap, observed:q }`. This cap is checked **before** bit‑length caps and is part of the
      observable outcome. When `qCap` is undefined, this cap is not applied.

 <a id="s8-apfalse-must-cover"></a>
 * **Objects — `additionalProperties` exactness**
 
  **Effective locus of `additionalProperties:false` (normative).**
  For all must‑cover computations in this section, the presence of `additionalProperties:false` is evaluated on the
  **canonical/effective view** produced by *Normalize → Compose* (including any **additive** constraints introduced by §7 when
  `PNAMES_REWRITE_APPLIED` is recorded for the same object). This evaluation does **not** alter the final validation semantics:
  the **original schema** remains the sole source of truth for AJV validation.

  * If **any** conjunct has `additionalProperties:false`, then any key **not covered** by that conjunct’s
    **coverage set** is forbidden, regardless of others. **Coverage set** := named keys in `properties` ∪ names
    matched by **anchored‑safe** `patternProperties`. When `propertyNames` is present at that conjunct, it acts
    **only as a gating filter** over the coverage set. For `enum`, intersect with exactly that finite set.
    For `pattern`, intersect **only** when the pattern is **anchored‑safe and not complexity‑capped**; otherwise
    treat it as **unknown gating** (no intersection). **Coverage may increase only** when the normalizer has applied
    the §7 rewrite and recorded `PNAMES_REWRITE_APPLIED` for this object; in that case, the **synthetic** anchored‑safe
    patterns introduced by the rewrite **are treated as part of** `patternProperties` for coverage. Otherwise,
    `propertyNames` **never** increases coverage. When coverage depends on non‑anchored or complexity‑capped patterns,
    treat coverage as **unknown**. **Exception (normative): raw `propertyNames.pattern` (without §7’s rewrite) NEVER
    triggers fail‑fast and remains unknown gating.**  
    **Mode‑specific (clarified):** **Strict:** when must‑cover would rely on a pattern in `patternProperties` **or** on a **synthetic** pattern from §7 (`sourceKind:'propertyNamesSynthetic'`) that is **not anchored‑safe** per this section **or** is **capped by the regex‑complexity rule**, escalate per the fail‑fast rule and emit **`AP_FALSE_UNSAFE_PATTERN`**. **Explicit exception:** raw `propertyNames.pattern` (no `PNAMES_REWRITE_APPLIED`) never triggers fail‑fast; treat it as unknown gating. **Lax:** proceed by **conservative exclusion** of such keys. See **Fail‑fast rule (Strict; normative)** below.
    **Note (non‑normative):** Even when anchored‑safe, a raw `propertyNames.pattern` does not expand coverage unless §7 applied the rewrite and emitted `PNAMES_REWRITE_APPLIED`.
  * **Must‑cover (MUST)**:

    * **Restatement:** `propertyNames` **never increases coverage**; it only gates recognition. Coverage may increase **only** via the §7 additive rewrite, signaled by `PNAMES_REWRITE_APPLIED`.

    * For each conjunct `Ci` with `additionalProperties:false`, compute a recognizer of keys it **covers**:

      * Named keys from `properties`.
      * Names matched by **anchored‑safe** `patternProperties`, **including any synthetic entries created by the §7 rewrite only when `PNAMES_REWRITE_APPLIED` is present** (conservative recognition).
      * If `Ci.propertyNames` is present, further **intersect** the coverage for `Ci` **only when** `propertyNames` is an **enum of strings**. If `Ci.propertyNames` **uses `pattern`**, it participates **only as a gate** and **only** when the pattern is **anchored‑safe and not complexity‑capped**; otherwise **do not** intersect coverage (treat as **unknown gating**).  
       **Clarification:** For non‑anchored or complexity‑capped patterns, **MUST NOT** intersect; record the approximation via `AP_FALSE_INTERSECTION_APPROX` and, when due to the cap, also emit `REGEX_COMPLEXITY_CAPPED` with `details:{ context:'coverage', patternSource }`. **Normalizer‑only codes (e.g., `PNAMES_COMPLEX`) MUST NOT be emitted by Compose.**  
       **Restatement:** This does **not** expand coverage; it only narrows it when safely provable. Coverage may increase **only** via the §7 additive rewrite (signaled by `PNAMES_REWRITE_APPLIED`).
       **Non‑participation in fail‑fast (normative).** A raw `propertyNames.pattern` (i.e., when no §7 rewrite occurred at the same object) **MUST NOT** trigger `AP_FALSE_UNSAFE_PATTERN` under any circumstances; at most it can participate as a **gate** when it is both anchored‑safe and not complexity‑capped, or be treated as **unknown gating** otherwise.
    * The globally safe set of generable keys is the **intersection** of these (possibly filtered) recognizers
      across all such `Ci`.
    <a id="s8-anchored-safe-definition"></a>
    * **Anchored pattern (normative):** Assume AJV is configured with `unicodeRegExp:true` (§13). Detection is **purely textual**: regex `p` is anchored‑safe iff it starts with unescaped `^` and ends with unescaped `$`, contains **no** look‑around (`(?=`, `(?!`, `(?<=`, `(?<!`) or back‑references (`\\1`, `\\k<...>`), **and is not flagged by the Complexity cap rule below**. Other constructs are allowed.
      **Detection operates on the JSON‑unescaped regex `source`.** The same anchored‑safe test applies to `propertyNames.pattern`, also using the JSON‑unescaped `source`.
      **Inline flags & non‑ECMAScript modifiers (normative).** ECMAScript regular expressions (used by JSON Schema) do **not** support inline flag modifiers such as `(?i)` or `(?m)`. Implementations **MUST NOT** emulate inline flags and **MUST** compile patterns with the **`u` flag only**. Any literal sequence resembling an inline flag in the JSON‑unescaped `source` **MUST NOT** affect anchored‑safety classification; treat it as ordinary pattern text for the textual scan defined in this section. Compilation errors (if any) remain the validator’s responsibility; must‑cover analysis does not reinterpret such constructs.
    * **Algorithm (normative):** Treat a pattern as anchored‑safe if and only if:
      (a) in the JSON‑unescaped `source` it **starts with** an unescaped `^` and **ends with** an unescaped `$`;
      (b) the JSON‑unescaped `source` contains **no back‑references of any form** and **no look‑around** — i.e., it contains none of `(?=`, `(?!`, `(?<=`, `(?<!`) , and it contains neither named back‑references (`\\k<...>`) **nor numeric back‑references** (any `\\[1-9]\\d*`);
      (c) flag letters are not present in JSON Schema; assume JS RegExp with `u` only (per §13);
      (d) the pattern **is not** flagged by the §8 regex complexity cap.
      **Scan rules (normative):** Let `S` be the JSON‑unescaped regex `source`. A code unit at index `i` in `S` is **unescaped** iff the number of consecutive `\` immediately preceding `i` is **even**.
      • While scanning, **ignore** ranges inside character classes `[...]` (from an **unescaped** `[` to its matching **unescaped** `]`). ECMAScript does not support nested character classes.
      • A backslash escapes the **next** code unit only when the count of consecutive preceding backslashes is **odd**.
      • The leading anchor `^` is recognized only when it is the **first** code unit of `S` and **unescaped**. The trailing anchor `$` is recognized only when it is the **last** code unit of `S` and **unescaped**.
      • Back‑references are present if and only if an **unescaped** `\k<...>` or an **unescaped** `\[1-9]\d*` (e.g., `\1`, `\2`, …) occurs **outside** character classes.
         Clarification: treat these as unescaped backslash sequences in the JSON‑unescaped `source` — either a single `\` followed by `k<...>`, or a single `\` followed by a non‑zero digit and optional more digits. All tests operate on the JSON‑unescaped `source` where backslashes are single code units.
    <a id="s8-regex-complexity-cap"></a>
    * **Complexity cap (normative):** For coverage analysis only, if a pattern's source length exceeds **4096 UTF‑16 code units** or a textual scan detects a **quantified group**: In the JSON‑unescaped `source` `S`, detect a quantified group via a single left‑to‑right pass that (1) ignores character classes `[...]` and escaped parentheses; (2) maintains a stack of opener indices for **unescaped** `(`; and (3) on an **unescaped** `)` at index `i`, pops its opener and examines index `k = i + 1`. If `k < |S|` and `S[k]` is one of `*`, `+`, `?`, or starts a quantifier `{m}`, `{m,}`, `{m,n}` **adjacent in UTF‑16 (no intervening code units)**, then a quantified group is detected and the pattern is **capped**. Escaped parentheses `\(` and `\)` are ignored, **and text inside bracket character classes `[...]` is not considered** when searching for quantified groups. Treat it as **non‑anchored**. Emit `REGEX_COMPLEXITY_CAPPED` **with** `details:{ context:'coverage', patternSource }` (pattern source = JSON‑unescaped), and when this affects must‑cover, also emit `AP_FALSE_INTERSECTION_APPROX`. This cap also applies to `propertyNames.pattern` when evaluating rewrites in §7. **Note (normative):** this is a conservative over‑approximation used only for must‑cover analysis; patterns flagged by this cap are treated as **non‑anchored** for all must‑cover purposes and emit `REGEX_COMPLEXITY_CAPPED`.
    
    **Reference pseudocode (normative) — JSON‑unescaped scanner**
    Inputs and invariants:
    • Let S be the JSON‑unescaped regex source (the exact string passed to `new RegExp(S,'u')`).
    • While scanning, **ignore** text inside unescaped character classes `[ ... ]`.
    • **Do not emulate** inline flags such as `(?i)`; JSON Schema/ECMAScript does not support them.
    • A code unit at index i is unescaped iff the count of consecutive backslashes immediately before i is even.

    ```
    function isAnchoredSafe(S):
      if !startsWithUnescaped(S,'^') or !endsWithUnescaped(S,'$'): return false
      if hasLookaroundOutsideClass(S) or hasBackrefOutsideClass(S): return false
      if isRegexComplexityCapped(S): return false
      return true

    function isRegexComplexityCapped(S):
      if utf16Length(S) > 4096: return true
      # detect quantified group: '(' ... ')' immediately followed by *, +, ?, or {m[,n]}
      stack = []
      for i in 0..|S|-1:
        if insideCharClass(S,i): continue
        if isUnescapedAt(S,i,'('): stack.push(i)
        else if isUnescapedAt(S,i,')') and stack not empty:
          k = i + 1
          if k < |S| and (S[k] in ['*','+','?'] or startsQuantifierAt(S,k)):
            return true
      return false
    ```

    * **Safe key predicate (normative):** key `k` is safe under conjunct `Ci` iff `k ∈ Ci.properties`, or `∃` anchored‑safe pattern in `Ci.patternProperties` that matches `k`.
      If `Ci.propertyNames` **is an enum of strings**, further intersect the safe set with exactly that finite set (literal equality on names).
      If `Ci.propertyNames` **uses `pattern`**, it participates **only as a gate** and **only** when the pattern is **anchored‑safe and not complexity‑capped**; otherwise it **MUST NOT** affect must‑cover recognition or early‑unsat proofs (treat as **unknown gating**; AJV remains the oracle at validation). **Normative reminder:** raw `propertyNames.pattern` — whether anchored or not — **never increases coverage** and **never** triggers `AP_FALSE_UNSAFE_PATTERN`. Only **synthetic** patterns produced by the §7 rewrite (`PNAMES_REWRITE_APPLIED`) may participate in coverage and fail‑fast.
      **Normative note:** this intersection **never** escalates to `AP_FALSE_UNSAFE_PATTERN` by itself; at worst it yields `AP_FALSE_INTERSECTION_APPROX`. Fail‑fast remains limited to patterns used for **coverage** per this section and **synthetic** patterns from §7 rewrites.
      If any `Ci` has only **non‑anchored** patterns or patterns **capped by complexity** (either in `patternProperties` or `propertyNames`) covering `k`, treat coverage as **unknown** ⇒ `k` is **not safe`.
      Emit `REGEX_COMPLEXITY_CAPPED` when applicable, and `AP_FALSE_INTERSECTION_APPROX` when unknown coverage causes exclusion. **Normalizer‑only codes (e.g., `PNAMES_COMPLEX`) MUST NOT be emitted by Compose.** **In Lax only:** unknown coverage leads to conservative exclusion. **In Strict:** the conservative‑exclusion rule is overridden by the fail‑fast policy below; implementations **MUST** abort planning/generation for that node with `AP_FALSE_UNSAFE_PATTERN`.
  * When **no** conjunct has `additionalProperties:false`, keys not covered by **that conjunct’s** `properties/patternProperties` MUST satisfy **that conjunct’s** `additionalProperties` schema (**per‑conjunct evaluation** as in AJV). If **any** conjunct has `additionalProperties:false`, extras are globally forbidden and such schemas have no effect on extras for generation (they remain in the original schema for AJV validation but are irrelevant to generation).
  
  **Algorithm (normative) — mustCoverSafeProof**
  Given an object node O with conjuncts {Ci} and presencePressure(O) as defined in §8:
  1) For each Ci with `additionalProperties:false`, compute safeRecognizers(Ci):
     • Named keys in `Ci.properties`.
     • PLUS keys matched by **anchored‑safe & non‑capped** patterns in `Ci.patternProperties`,
       including §7 synthetic entries **only when** `PNAMES_REWRITE_APPLIED` was recorded at O.
     • If `Ci.propertyNames` is an enum of strings: intersect with exactly that finite set.
     • If `Ci.propertyNames` is a pattern: intersect **only** when the pattern is anchored‑safe & non‑capped;
       otherwise treat it as **unknown gating** (no intersection).
  2) Safe := ⋂ safeRecognizers(Ci) over all Ci with AP:false.
  3) If Safe ≠ ∅ ⇒ **MUST NOT** emit `AP_FALSE_UNSAFE_PATTERN`; the generator **MUST** restrict emitted keys to Safe.
  4) If Safe = ∅:
     • If presencePressure(O) holds ⇒ in Strict: record fatal `AP_FALSE_UNSAFE_PATTERN`;
       in Lax: warn `AP_FALSE_UNSAFE_PATTERN` and proceed by conservative exclusion.
     • If presencePressure(O) does not hold ⇒ **MUST NOT** fail‑fast; use conservative exclusion.

  **Exceptions (normative):**
   E1) Patterns that fail to compile with `new RegExp(source,'u')` are **unknown gating** and **MUST NOT**
       cause `AP_FALSE_UNSAFE_PATTERN`. Compose **MUST** emit
       `REGEX_COMPILE_ERROR{ context:'coverage', patternSource }` and, when the reduction of provable coverage
       under presence pressure matters, also emit `AP_FALSE_INTERSECTION_APPROX{ reason:'regexCompileError' }`.
   E2) A **raw** `propertyNames.pattern` (i.e., when no §7 rewrite occurred and no `PNAMES_REWRITE_APPLIED` exists at O)
       **NEVER** triggers fail‑fast and remains gating‑only.

  * **Fail‑fast rule (Strict; normative).**

    **Precondition — presence pressure (normative).** This fail‑fast applies **only** when there is **presence pressure** at the object: `effectiveMinProperties > 0` **or** `effectiveRequiredKeys ≠ ∅` **or** some `dependentRequired` antecedent is forced present in the effective view. When no presence pressure exists, implementations **MUST NOT** emit `AP_FALSE_UNSAFE_PATTERN`; proceed with **conservative exclusion** (defined below) and continue.

    **Example (informative).**
    Let `effectiveRequiredKeys = {"k"}` after the `allOf` merge, with `dependentRequired: { k: ["d1"] }` and `additionalProperties:false`. If the provable must‑cover intersection cannot include `d1`, Strict mode may short‑circuit via `UNSAT_DEPENDENT_REQUIRED_AP_FALSE`. Conversely, if the presence of `k` depends only on a selected `oneOf` branch or on an active `then` branch of a conditional, do not treat `k` as “forced present” for early‑unsat; leave the decision to AJV at validation time.

    If a must‑cover proof for an object under `additionalProperties:false` depends on a pattern that is
    **not anchored‑safe** (per §8 definition) or whose analysis is **capped** by the regex complexity rule,
    the implementation **MUST** abort planning/generation for that node with diagnostic **`AP_FALSE_UNSAFE_PATTERN`** and the following **normative** payload:
  **Payload (normative).** `details:{ sourceKind:'patternProperties'|'propertyNamesSynthetic', patternSource?:string }`. When a **single** culpable pattern triggers fail‑fast, `patternSource` is **REQUIRED** and **MUST** be the JSON‑unescaped regex source. When multiple patterns jointly cause the fail‑fast, it **MAY** be omitted.
  When `patternSource` is present it **MUST** be the JSON‑unescaped regex source (same convention as §19 for regex payloads).
    The top‑level diagnostic **carries `canonPath`**; `canonPath` **MUST NOT** be duplicated inside `details`. Compose **MUST** record a fatal as
    `diag.fatal.push({ code:'AP_FALSE_UNSAFE_PATTERN', canonPath, details })`.
    The Generator **MUST NOT** attempt key synthesis at this node, and the diagnostic **MUST** bubble to the
    top‑level run result.

    In **Lax** mode, emit **`AP_FALSE_UNSAFE_PATTERN`** as a **warning** by appending an entry to **`diag.warn`**
    (same payload as Strict), and proceed conservatively.

    **Definition (normative) — conservative exclusion:** treat any candidate key as non‑generable unless
    membership in the must‑cover intersection is **provable** from named `properties` or anchored‑safe, non‑capped
    `patternProperties` (including **synthetic** entries from §7 only when `PNAMES_REWRITE_APPLIED` was recorded).
    Raw `propertyNames.pattern` never proves membership. Implementations **MUST NOT** emit keys whose membership is unknown,
    preserving the existing **`AP_FALSE_INTERSECTION_APPROX`** hints where applicable.

    **Restriction (normative):** Do **not** emit `AP_FALSE_UNSAFE_PATTERN` when the global must‑cover intersection can be computed **without** such patterns—i.e., exclusively from named `properties` and anchored‑safe patterns (including **synthetic** entries from §7). The mere presence of unsafe or complexity‑capped patterns that are **unused** in that proof MUST NOT trigger fail‑fast.
    **Reminder (normative):** Patterns flagged by the §8 **regex complexity cap** are treated as **non‑anchored** for **all** must‑cover purposes and **never** enable `enumerate()`.

    **Exception (normative):** a raw `propertyNames.pattern` (i.e., without the §7 additive rewrite signaled by `PNAMES_REWRITE_APPLIED`) **MUST NOT** trigger this fail‑fast; treat it as **unknown gating** and use `AP_FALSE_INTERSECTION_APPROX`. Only **synthetic** patterns introduced by §7 participate in fail‑fast, and such cases **MUST** report `sourceKind:'propertyNamesSynthetic'` in the payload.

    **Compile‑error exception (normative).** Patterns that **fail to compile** under JavaScript `RegExp` with the `u` flag are treated as **unknown gating** for all must‑cover and early‑unsat purposes and **MUST NOT** cause `AP_FALSE_UNSAFE_PATTERN` in Strict. Implementations **MUST** emit `REGEX_COMPILE_ERROR` with `details:{ patternSource, context:"coverage" }` (and, when this reduces provable coverage under presence pressure, also emit `AP_FALSE_INTERSECTION_APPROX`). For `propertyNames` rewrites, also log `PNAMES_COMPLEX{reason:"REGEX_COMPILE_ERROR"}` per §7.

    **Clarification:** Raw `propertyNames.pattern` participates **only** as a gate for intersection (when anchored‑safe) and **never** as a coverage source.
    Consequently it **cannot** cause `AP_FALSE_UNSAFE_PATTERN` by itself.

    **Safe‑proof preference before fail‑fast (normative).**
  Before emitting `AP_FALSE_UNSAFE_PATTERN`, an implementation **MUST** attempt to build a **safe coverage proof** that ignores
    all non‑anchored and complexity‑capped patterns (including any **synthetic** entries from §7). Let:

    - `safeRecognizers(Ci)` be the union of:
      (i) named keys in `Ci.properties`,
      (ii) keys matched by **anchored‑safe & non‑capped** `Ci.patternProperties`, and
      (iii) **synthetic** patterns introduced by the §7 rewrite **only when** `PNAMES_REWRITE_APPLIED` was
      recorded for the same object, **limited to those that are anchored‑safe & not complexity‑capped** per this section.
      *Exact‑literal* form is **not required** for safety; it matters only for `enumerate()` (§8 “Coverage Index export”).

    Let `Safe = ⋂_{Ci with AP:false} safeRecognizers(Ci)`.
    If `Safe` is **non‑empty**, the planner **MUST NOT** emit `AP_FALSE_UNSAFE_PATTERN` and **MUST** restrict generation to `Safe`.
    If and only if `Safe` is empty **and presence pressure holds**, the planner **MUST** apply the fail‑fast policy in Strict (or warn in Lax). If presence pressure **does not** hold, **MUST NOT** fail‑fast and **MUST** proceed with conservative exclusion.
    *Implementation note (informative):* this rule prevents spurious fail‑fast when a proof exists using named properties alone.

* **Objects — other**

  * **Properties merge (normative)** — For any property key present in multiple conjuncts of `allOf`,
    the effective property schema is the **allOf** of the per‑conjunct subschemas. If the conjunction is
    contradictory, short‑circuit as unsatisfiable (early‑unsat). **Required** keys are the **union**
    across conjuncts.
  * Conjunct `patternProperties`; record overlaps in `diag.overlaps.patterns`. Respect `disablePatternOverlapAnalysis`.
    *(Naming note, non‑normative):* `diag.overlaps.*` (pattern overlaps) is distinct from `diag.overlap` (oneOf/anyOf passing set).

* **Arrays**

  * **Tuple / `items:false`** implicit maximum length:

    ```
    maxLen(A) = itemsA === false ? len(prefixA) : +∞
    maxLen(B) = itemsB === false ? len(prefixB) : +∞
    maxLen(allOf) = min(maxLen(A), maxLen(B))
    ```

  * For `i < min(len(prefixA), len(prefixB))`: effective item = `allOf` of both.

  * For `min(len(prefixA), len(prefixB)) ≤ i < max(len(prefixA), len(prefixB))`: keep available `prefixItems[i]` only if `i < maxLen(allOf)`.

  * `items`: keep as `allOf` of present `items` (no collapse).

  * **`contains` (bag semantics)**:

    * Model as a **bag** of independent needs:

      ```ts
      type ContainsNeed = { schema: any; min?: number; max?: number };
      type ContainsBag = ContainsNeed[];
      ```
    * **Defaulting (normative):**
      * `contains: S` alone ⇒ one need `{ schema: S, min: 1 }`.
      * `minContains`/`maxContains` apply only when `contains` is present at the same location. If `contains` is absent, they are ignored (no bag entry).
    * In `allOf`, **concatenate** bags; optional subsumption (if `schemaA ⊆ schemaB`).
    * **Unsat checks (MUST, sound)**:
      * **Per‑need bounds:** if a bag entry has both `min` and `max` and `max < min` ⇒ short‑circuit as unsat and emit `CONTAINS_NEED_MIN_GT_MAX` with `details:{ min:number, max:number }`.
      * If `Σ min_i > (effectiveMaxItems ?? +∞)` **and** no single array element can satisfy two distinct needs
        (i.e., the needs are pairwise‑disjoint under the disjointness rules below) ⇒ emit `CONTAINS_UNSAT_BY_SUM`
        and short‑circuit as unsat.
      * Otherwise (**overlap unknown or possible**), **MUST NOT** short‑circuit: record
        `diag.unsatHints.push({ code:'CONTAINS_UNSAT_BY_SUM', canonPath, provable:false, reason:'overlapUnknown', details:{ sumMin: Σ min_i, maxItems: effectiveMaxItems } })`
        and proceed (AJV remains the oracle at validation).
      * **For any need:** if a bag entry has `max = 0` and `min > 0` ⇒ unsat.
    * **Disjointness (sound, incomplete):** treat two needs `A` and `B` as **disjoint** when any of:
      1) both have `const` and `!deepEqual(A.const, B.const)` (**`deepEqual` per Glossary**);
      2) both have `enum` and `A.enum ∩ B.enum = ∅`;
      3) their `type` sets are disjoint (e.g., `'integer'` vs `'string'`). **Normative clarification:** `'integer'` and `'number'` are **not** disjoint; `'integer' ⊂ 'number'`.
      * Any need with `min > (maxItems ?? +∞)` ⇒ unsat.
      * **Definition (normative):** `effectiveMaxItems` is the post‑merge bound after `allOf`
        (including tuple‑implied caps where `items:false` ⇒ `maxLen = len(prefixItems)`).
      * **Subset‑contradiction (normative):** if ∃ needs `A` and `B` with `A.min>0` and `B.max=0` and `schemaA ⊆ schemaB` ⇒ unsat.
        * **Subset check (sound, incomplete):** treat `schemaA ⊆ schemaB` as true in any of these cases:
          1) `A.const === B.const`; 2) `A.const ∈ B.enum`; 3) `A.enum ⊆ B.enum`;
          4) `A.type === 'integer'` and `B.type === 'number'`;
          5) `A.type` and `B.type` are sets with `A.type ⊆ B.type` under JSON Schema typing;
          6) `A` is `allOf` of predicates each subset of `B`.
          Otherwise, do not assume subset.
    * Diagnostics: `CONTAINS_BAG_COMBINED`.
    * **Deterministic order with `uniqueItems:true` (normative):** after generation and during repair, first de‑duplicate by structural hashing (see §10), then re‑satisfy all bagged `contains` needs deterministically by need index (ascending) and **stable item slots** defined as: fill the array left‑to‑right; for each need in ascending bag index, place required matches into the earliest available positions; when a need requires multiple matches, fill successive earliest positions; do not reorder pre‑existing non‑targeted items.
    * **NOTE:** Early‑unsat checks remain limited to `Σ min_i > effectiveMaxItems` and subset‑contradiction; uniqueness‑induced unsat is not detected early.

<a id="s8-early-unsat-checks"></a>
### Early unsat checks (short‑circuit)

**Guard (normative).** Any early‑unsat proof that relies on
`additionalProperties:false` introduced by the §7 `propertyNames` rewrite
**MUST** verify that `PNAMES_REWRITE_APPLIED` was recorded at the same
object. In the absence of this signal, treat `propertyNames` constraints as
gating only and **MUST NOT** take early‑unsat based on an AP:false
assumption.

**Forced present (recap; normative).** For early‑unsat proofs, an antecedent is **forced present** **only** if it appears in the effective `required` union after `allOf` merge. Presence that depends on `oneOf`/`anyOf` branch selection, `if/then/else`, or `dependentSchemas` activation **MUST NOT** be used for early‑unsat; leave to AJV at validation time.

* Disjoint types; empty enum intersection; conflicting const.
* Numeric/object/array bounds:

  * `minimum > maximum`; `exclusiveMinimum ≥ maximum`; `exclusiveMaximum ≤ minimum`.
  * `minItems > maxItems`; `minProperties > maxProperties`.
  * Tuples: `minItems > maxLen(allOf)`.
  * `maxContains === 0 && minContains > 0` (single need).
  * **MinProperties vs `propertyNames` (empty enum)**: if `propertyNames` is `{"enum":[]}` and `effectiveMinProperties > 0` ⇒ short‑circuit as unsat and emit `UNSAT_MINPROPS_PNAMES`.
  * **Required vs `propertyNames` (closed enum)**: if `propertyNames` is an enum `E` and
    there exists `r ∈ required` with `r ∉ E` ⇒ short‑circuit as unsat and emit `UNSAT_REQUIRED_PNAMES`.
  * **`AP:false` with provably empty coverage under presence pressure**:
    If the computed must‑cover intersection is **provably empty** **based solely on** the absence of named
    `properties` and the absence of **anchored‑safe** `patternProperties` (after applying any regex‑complexity caps),
    and (`effectiveMinProperties > 0` **or** `effectiveRequiredKeys ≠ ∅`) ⇒ short‑circuit as unsat and emit
    `UNSAT_AP_FALSE_EMPTY_COVERAGE`. `propertyNames` **does not contribute** to proving non‑emptiness here; cases
    where `propertyNames` forbids names are handled by `UNSAT_MINPROPS_PNAMES`/`UNSAT_REQUIRED_PNAMES` below.
    If any pattern involved is non‑anchored or capped by complexity, **MUST NOT** short‑circuit; emit
    `AP_FALSE_INTERSECTION_APPROX` and record
    `diag.unsatHints.push({ code:'UNSAT_AP_FALSE_EMPTY_COVERAGE', canonPath, provable:false, reason:'coverageUnknown',
      details:{ minProperties: effectiveMinProperties, required: effectiveRequiredKeys } })` instead.
    **Proof basis (normative).** `UNSAT_AP_FALSE_EMPTY_COVERAGE` may be taken **only** when emptiness is proven **solely** from
    named `properties` and **anchored‑safe & non‑capped** `patternProperties` (plus §7‑synthetic literals when `PNAMES_REWRITE_APPLIED`
    is present). If emptiness would require considering any non‑anchored or complexity‑capped pattern (including raw
    `propertyNames.pattern`), the planner **MUST NOT** short‑circuit and **MUST** instead emit `AP_FALSE_INTERSECTION_APPROX`
    (and `REGEX_COMPLEXITY_CAPPED` when applicable).
  * **Pattern vs `propertyNames` (normative gating).**
    Short‑circuit as `UNSAT_PATTERN_PNAMES` **only when all** of the following hold:

    1. **`additionalProperties:false` is effective at this object** after `allOf` merge (i.e., at least one conjunct enforces `additionalProperties:false` at this location).
    2. `propertyNames` is a **closed enum** `E` (finite set of names).
    3. The **global must‑cover intersection** (computed exactly as in §8 “Objects — `additionalProperties` exactness”, using named `properties` and **anchored‑safe, non‑capped** `patternProperties`, plus **synthetic** entries from the §7 propertyNames rewrite **only when** `PNAMES_REWRITE_APPLIED` is present) is **provably disjoint from** `E` — i.e., **no** named property lies in `E` and **no** anchored‑safe recognizer matches any member of `E`.
    4. There is **presence pressure** (`effectiveMinProperties > 0` **or** there exists `r ∈ required` with `r ∉ E` **or** some `dependentRequired` antecedent is **forced present** in the **effective view** as defined in this section).

    Otherwise **MUST NOT** short‑circuit. If any pattern involved is **non‑anchored** or **capped by the regex‑complexity rule**, **do not** short‑circuit: emit `AP_FALSE_INTERSECTION_APPROX` (and `REGEX_COMPLEXITY_CAPPED` when applicable), record
    `diag.unsatHints.push({ code:'UNSAT_PATTERN_PNAMES', canonPath, provable:false, reason:'nonAnchoredPattern', details:{ enumSize: |E| } })`,
    and let AJV decide at validation time.

    **Clarification (normative).** When `additionalProperties` is **not** `false` at this object, this check **MUST NOT** short‑circuit: values admitted via `additionalProperties` may satisfy presence pressure with names in `E`.
* **`dependentRequired` + `additionalProperties:false` across `allOf`**:

    * **Short‑circuit unsat only when** (a) the antecedent key is **forced present** in the effective view,
      **defined normatively** as: the key is in the effective `required` union after `allOf` merge (“effectiveRequiredKeys”), **and** (b) exclusion of each dependent is
      **proven** using only `properties` and **anchored‑safe** recognizers from `patternProperties`; for `propertyNames`, use it **only as a gate** when it is an **enum** or an **anchored‑safe and not complexity‑capped** `pattern` per §8.  
      **Coverage expansion note (normative):** coverage may expand **only** via the §7 propertyNames rewrite (synthetic entries; `PNAMES_REWRITE_APPLIED`). Raw `propertyNames.pattern` **never** expands coverage.
      If the must‑cover intersection cannot include all required dependents for such antecedents under these proofs
      ⇒ `UNSAT_DEPENDENT_REQUIRED_AP_FALSE`.
      
      **Clarification (normative).** “Forced present” for early‑unsat purposes is established via the **effective `required` union** after `allOf` merge (i.e., a static proof). Presence that depends **only** on branch selection (`oneOf`/`anyOf`) or conditional activation (`if/then/else`) is not considered for early‑unsat and is left to AJV at validation time.
    * If exclusion stems from **unknown coverage** (e.g., non‑anchored patterns or regex capped by complexity limits, or raw `propertyNames.pattern` not eligible for gating),
      **MUST NOT** short‑circuit. Emit `AP_FALSE_INTERSECTION_APPROX` and record
      `diag.unsatHints.push({ code:'UNSAT_DEPENDENT_REQUIRED_AP_FALSE', canonPath, provable:false, reason:'coverageUnknown',
        details:{ antecedent:k, dependents:[...], patternsConsidered: [...] } })`. AJV decides at validation time.

* **`required` + `additionalProperties:false` across `allOf` (provable)**:

    * **Short‑circuit unsat only when** there exists `r ∈ effectiveRequiredKeys` that is **provably not covered** by the
      must‑cover intersection computed from `properties` and **anchored‑safe** `patternProperties` (including any **synthetic** entries introduced by the §7 `propertyNames` rewrite **only when** `PNAMES_REWRITE_APPLIED` is present), using the same anchored/complexity rules as §8.
      `propertyNames` acts **only as a gate** here; cases where `propertyNames` alone forbids `r` are handled by `UNSAT_REQUIRED_PNAMES`.
      Emit `UNSAT_REQUIRED_AP_FALSE` naming `r`.
    * If non‑anchored or complexity‑capped patterns are involved in the proof, **MUST NOT** short‑circuit: emit
      `AP_FALSE_INTERSECTION_APPROX` (and `REGEX_COMPLEXITY_CAPPED` when applicable) and record
      `diag.unsatHints.push({ code:'UNSAT_REQUIRED_AP_FALSE', canonPath, provable:false, reason:'coverageUnknown',
        details:{ requiredOut:[r1,...] } })`. AJV decides at validation time.

<a id="s8-branch-selection"></a>
### Branch selection (`anyOf` / `oneOf`)

* **Deterministic, discriminant‑first scoring (integer domain)**:
  **Normative:** Implement scores as sums of the constants below using **two’s‑complement int32 arithmetic**. In JavaScript, coerce on each update: `score = (score + K) | 0`. Report the int32 value (Number); overflow wraps modulo 2^32 with sign. Do not use floating‑point accumulation.
  **Initialization (normative).** **Initialize `score := 0`** for each branch before applying any constants.

  * +1000: same property across branches with disjoint `const/enum` (tag).
  * +200: `required + const/enum` on same key.
  * +50: anchored, disjoint `patternProperties` (e.g., `^foo$` vs `^bar$`).
  * +10: disjoint `type`.
  * −5: estimated overlaps (wide unions, non‑anchored patterns).
  * **Top‑score ties (normative):** let `Smax` be the maximum score and `T` be the ascending‑sorted array of indices `i` where `score[i] = Smax`.
    * If `T.length = 1`, pick `T[0]`.
    * If `T.length > 1`, pick deterministically from `T` using the §15 RNG with state `s0 = (seed >>> 0) ^ fnv1a32(canonPath)`: choose index `T[Math.floor((next()/4294967296) * T.length)]`, and **record the exact float** as `diag.scoreDetails.tiebreakRand` at this canonPath.
    * **Score‑only clarity (normative):** In **score‑only** selection, the RNG **MUST** be invoked once and `diag.scoreDetails.tiebreakRand` **MUST** be recorded **even when `|T| = 1`**. The value does not affect selection in this case but is required for auditability and determinism.
    **Normative:** `fnv1a32` is FNV‑1a over the canonical JSON Pointer string `canonPath`
    (offset‑basis `2166136261`, prime `16777619`, modulo `2^32`).

* **Trials policy**:

  * Score all branches; try Top‑K `maxBranchesToTry`. Attempt generation up to `trials.perBranch` times per branch (default 2).
  * If branch count > `skipTrialsIfBranchesGt` or `skipTrials=true` ⇒ **score‑only** selection:
    compute `Smax` and tie set `T` as above and pick from `T` with the seeded RNG. No trials are attempted in this path.
* **Normative (observability & locus):** in score‑only, implementations **MUST invoke the RNG exactly once** and record the resulting float as `tiebreakRand` **even when `|T| = 1`** (not used for selection, but recorded for auditability). `diag.chosenBranch`, `diag.scoreDetails`, `diag.budget` and `diag.overlap` refer to the **branch operator at the Compose entry `canonPath`**. When Compose is invoked on a non‑branch node, `diag.scoreDetails` **MUST be undefined** (i.e., not a concrete object). When invoked on a branch node, `diag.scoreDetails` **MUST** be present and include the fields below.
    `diag.scoreDetails` **MUST** include in **all** cases (score‑only **and** trial paths)—**including when `branches.length = 1`**:
    * `orderedIndices:number[]` — branch indices ordered by score desc, index asc; **when `branches.length === 1`, this MUST be `[0]`.**
    * `topScoreIndices:number[]` — the tie set `T` in ascending index order **before** RNG; **when `branches.length === 1`, this MUST be `[0]`.**
    In score‑only, `tiebreakRand` **MUST** be recorded even when `|T|=1`.
    Additionally, include:
    * `tiebreakRand:number` — the RNG float (`next()/4294967296`) **whenever RNG is used for selection** (ties) and **always in score‑only** (even when `|T|=1`). Outside of score‑only, `tiebreakRand` MAY be omitted only when RNG is not used for selection and trials occurred.
    **Operational recommendation.** When `PlanOptions.metrics === true` (e.g., CI runs), implementations **SHOULD** populate `scoreDetails.scoresByIndex` for auditability.
  * **Normative (general):** when RNG is used for **selection** (tie‑breaks or score‑only), `diag.scoreDetails.tiebreakRand`
    **MUST** be populated with the exact float used. When RNG is used **only** for `oneOf` step‑4 exclusivity,
    record that draw as `diag.scoreDetails.exclusivityRand`; **do not** synthesize or overwrite `tiebreakRand` in that case.
  * Record trial budget in `diag.budget`. **In score‑only paths MUST set `diag.budget.skipped = true` and `diag.budget.tried = 0` (normative).**
    **Normative:** In score‑only, `diag.budget.limit` **MUST** equal
    `trials.perBranch × K_effective` for the node, where **`K_effective = min(maxBranchesToTry, branches.length)` after applying any Compose‑time caps** that reduce Top‑K (e.g., `COMPLEXITY_CAP_ONEOF`/`COMPLEXITY_CAP_ANYOF`).
    Emit `TRIALS_SKIPPED_LARGE_ONEOF` when `oneOf.length > skipTrialsIfBranchesGt`. Emit `TRIALS_SKIPPED_LARGE_ANYOF` when `anyOf.length > skipTrialsIfBranchesGt`.
    In all score‑only cases (including `trials.skipTrials === true`), emit the relevant code and set `diag.budget.reason`
    to one of `"skipTrialsFlag"`, `"largeOneOf"`, `"largeAnyOf"`, or `"complexityCap"`. **When trials are skipped because
    `trials.skipTrials === true`, also emit `TRIALS_SKIPPED_SCORE_ONLY`.**
    **Deterministic precedence (normative).** When multiple conditions hold simultaneously, choose exactly one reason/code
    with this fixed order: (1) `skipTrialsFlag` ⇒ `TRIALS_SKIPPED_SCORE_ONLY`; else (2) `largeOneOf` ⇒ `TRIALS_SKIPPED_LARGE_ONEOF`;
    else (3) `largeAnyOf` ⇒ `TRIALS_SKIPPED_LARGE_ANYOF`; else (4) `complexityCap`. Apply the **first** matching case only.

  **Reference skeleton (normative) — score‑only selection export**
  If `scoreOnly`:
  ```
  orderedIndices := sort by (score desc, index asc)
  T := topScoreIndices = [ i | score[i] == maxScore ] in ascending index order
  rng := xorshift32( (seed >>> 0) ^ fnv1a32(canonPath) )
  tiebreakRand := next(rng) / 4294967296   // MUST record even when |T| = 1
  chosen := T[ floor(tiebreakRand * |T|) ]
  diag.chosenBranch = { kind, index: chosen, score: score[chosen] }
  diag.scoreDetails = {
    orderedIndices, topScoreIndices: T,
    tiebreakRand, scoresByIndex?: map
  }
  diag.budget = {
    tried: 0,
    limit: trials.perBranch * K_effective,   // K_effective per §8 Top‑K capping
    skipped: true,
    reason: "skipTrialsFlag" | "largeOneOf" | "largeAnyOf" | "complexityCap"
  }
  ```
  Note (normative): `scoreDetails.exclusivityRand` remains **undefined** in Compose and is populated later by Generate/Repair during `oneOf` exclusivity resolution. **Do not** synthesize or overwrite `tiebreakRand`.

<a id="s8-oneof-exclusivity"></a>
* **`oneOf` exclusivity**:

  * After selection/generation, validate against all branches.
  * If >1 pass, resolve deterministically with the following order:
    1) Keep the selected branch `b* = diag.chosenBranch.index` as the target; all refinements aim to keep `b*` passing and make all others fail.
    2) Non‑destructive refinement: prefer adjustments that set/strengthen discriminants already present in `b*` (e.g., enforce `const/enum` on the same keys) without altering unrelated fields.
    3) Bounded tweaks (stable order): apply, in order, (a) numeric nudges, lowest canonical pointer first (**UTF‑16 code‑unit lexicographic order; JS string `<` comparator**); (b) string single‑char injections, **same ordering**.  
       **Numeric nudge (normative).** Apply only when the target value **exists** and is numeric. For `type:"integer"`, adjust by **±1** toward breaking the conflicting branch while keeping **b*** valid; pick the smallest magnitude and, when both signs work, prefer **+1**. For non‑integer `number`, use **δ ∈ {−ε,+ε}** where **ε := 10^(−decimalPrecision)** (see §8 Numbers / §10 Repair); choose the smallest |δ| that breaks the conflicting branch while preserving **b***; when both signs work, prefer **+ε**.  
       **String tweak (normative precondition).** Apply only when the target value **exists** and is a string; otherwise **skip** this tweak for that path.  
       Each tweak uses the minimal change that breaks the **lowest‑index** conflicting branch first; when multiple tweaks are possible, pick deterministically by (i) lowest `canonPath` of the tweak target, then (ii) lowest branch index. **No RNG is used in step 3.**  
       **Deterministic string tweak (normative):** The injected character is chosen by `PlanOptions.conditionals.exclusivityStringTweak`:
       • `'preferNul'` (default): attempt code point **U+0000** at the end first (serialize as `\\u0000` in textual JSON). If rejected (e.g., by `pattern`/bounds), attempt ASCII **"a"**.
       • `'preferAscii'`: attempt ASCII **"a"** first; if rejected, attempt **U+0000** (serialize as `\\u0000`).
       Implementations **MUST** log each accepted injection as `EXCLUSIVITY_TWEAK_STRING{ char:'\\u0000'|'a' }`. No other characters or positions are permitted.
       
       **Immediate re‑validation (normative).** After each numeric nudge or string tweak in step 3, the implementation **MUST** re‑validate against the **original schema** with the **Source Ajv**. Keep a change only if the target branch `b*` still passes and the tweaked change excludes the intended conflicting branch(es); otherwise deterministically try the alternative sign/next minimal tweak, or revert. Ajv remains the oracle.
    4) If, after (2)–(3), >1 branch still passes and **b*** is among them, **keep `b*`** and apply a final minimal tweak **restricted to the same operations and ordering as step 3** (numeric ±1 for integers, ±ε for non‑integer numbers with ε from §8/§10; string single‑code‑point injection using the same preference and logging as step 3; lowest `canonPath`, then lowest branch index). **No additional tweak kinds or RNG are permitted while `b*` still passes.** Only when **`b*` no longer passes** (e.g., due to capped refinements) pick deterministically from the passing set using the same seeded RNG policy as for ties (§8), then apply a minimal tweak (again confined to the step‑3 operations) to exclude the rest.
* **Normative:** No RNG is used in step‑4 when **`b*`** still passes.
  * Record `diag.overlap.passing` and `diag.overlap.resolvedTo = b*` (or to the chosen index only in the fallback RNG case). **Normative:** any RNG used in step‑4 MUST use the same canonical pointer (**canonPath**) as branch selection at this `oneOf` location, and **MUST record the resulting float in the run's diagnostics at this canonPath under `scoreDetails.exclusivityRand`**. This is **in addition to** `tiebreakRand` used for ties/score‑only in selection.
  **Seeding rule (normative).** Step‑4 **MUST** use a **fresh RNG instance** initialized exactly as in §15 (`s0 = (seed >>> 0) ^ fnv1a32(canonPath)`), independent of any prior draws for selection; do **not** reuse or advance the selection RNG state.
* **Cross‑phase (normative):** `exclusivityRand` is produced during Generate/Repair. Compose **SHALL** leave `scoreDetails.exclusivityRand` `undefined`; later phases **SHALL** populate it at the same `canonPath`.
* **Consolidated requirement (normative).** Implementations **MUST** populate `diag.scoreDetails.tiebreakRand` **only** when RNG is used for **selection** (score‑only or tie‑breaks). When RNG is used for **`oneOf` step‑4**, implementations **MUST** populate `diag.scoreDetails.exclusivityRand` with the exact float used and **MUST NOT** synthesize or overwrite `tiebreakRand` if selection did not use RNG.
  **No‑tweak case (normative).** When steps (2)–(3) and the final attempt above yield **no eligible tweak** at any canonical path (no existing numeric or string value satisfies the preconditions), the implementation **MUST NOT** introduce other tweak kinds or invoke RNG while `b*` still passes. Keep the instance unchanged, set `diag.overlap.resolvedTo = b*`, and proceed to **Validate** on the original schema; AJV may reject the instance under `oneOf`. Do **not** populate `scoreDetails.exclusivityRand` in this path.

<a id="s8-complexity-caps"></a>
### Complexity caps & degradation

* If caps are exceeded (see `PlanOptions.complexity`), enable **graceful degradation**:

  * Force `skipTrials=true`, reduce Top‑K, or skip pattern overlap analysis.
  **Top‑K capping (normative):** Let `B = branches.length`. If a cap applies, set
  `K_cap := min(B, complexity.maxOneOfBranches|maxAnyOfBranches as applicable)` when that limit is defined;
  otherwise `K_cap := B`. Then set `K_effective := min(K_cap, trials.maxBranchesToTry)`.
  In score‑only paths, `diag.budget.limit` **MUST** equal `trials.perBranch × K_effective`.
  **Reason (normative):** when score‑only is entered **because a complexity cap applied** (this subsection),
  `diag.budget.reason` **MUST** be `"complexityCap"`. In all other score‑only cases, select the reason/code using
  the deterministic precedence defined in §8 “Branch selection” (`skipTrialsFlag → largeOneOf → largeAnyOf → complexityCap`).
  * Emit diagnostics: `COMPLEXITY_CAP_ONEOF`, `COMPLEXITY_CAP_ANYOF`, `COMPLEXITY_CAP_ENUM`, `COMPLEXITY_CAP_CONTAINS`, `COMPLEXITY_CAP_SCHEMA_SIZE`.
    (**Note, normative**) Pattern witness capping is a **Generator**‑only concern and is reported as `COMPLEXITY_CAP_PATTERNS` there. Compose uses `REGEX_COMPLEXITY_CAPPED` for coverage‑time caps.
  **Definition (normative) — schema byte size.** When enforcing `complexity.maxSchemaBytes` and emitting `COMPLEXITY_CAP_SCHEMA_SIZE`, compute `observed` as the UTF‑8 byte length of the **same canonical JSON** used in §14 `stableHash(schema)` (sorted keys lexicographically depth‑first, arrays in order, `jsonSafeReplacer`, and normalization `-0 → 0`). This yields a deterministic cap metric.

<a id="s8-unsat-hint-payloads"></a>
#### Unsat hint payloads (details)
Implementations SHOULD populate `details` with small, code‑specific objects:
* `UNSAT_DEPENDENT_REQUIRED_AP_FALSE`: `{ antecedent:string, dependents:string[], mustCoverProof:'anchored'|'approx', patternsConsidered?:string[] }`
* `UNSAT_REQUIRED_AP_FALSE`: `{ requiredOut:string[] }`
* `UNSAT_AP_FALSE_EMPTY_COVERAGE`: `{ minProperties?:number, required?:string[] }`
* `UNSAT_PATTERN_PNAMES`: `{ enumSize:number, patterns?:string[] }`
* `UNSAT_REQUIRED_PNAMES`: `{ requiredOut:string[], enumSample?:string[] }`
* `UNSAT_MINPROPS_PNAMES`: `{ minProperties:number }`
* `CONTAINS_UNSAT_BY_SUM`: `{ sumMin:number, maxItems?:number, disjointness:'provable'|'overlapUnknown' }`

---

<a id="s9-generator"></a>
## 9) Generator

* Consume the effective view; honor type constraints, lengths, patterns, enums.

* **`enum/const` outrank `type`** when both present.

<a id="s9-strings-and-formats"></a>
* **Strings** — String length is the number of **Unicode code points**; surrogate pairs count as a single character. Grapheme clusters may span multiple code points. Regular expressions are executed with the JavaScript `u` flag (`unicodeRegExp:true`).
  **Normative note.** This definition aligns with Ajv v8 string‑length validation when `unicodeRegExp:true` is enabled per §13.
  **Clarification (normative).** In Ajv v8, `minLength`/`maxLength` count Unicode code points when **and only when** `unicodeRegExp:true`. This specification therefore **requires** `unicodeRegExp:true` on **both** Ajv instances (§13) to align RegExp semantics **and** string‑length counting. Implementations **MUST** count Unicode code points.

* **Formats** — Default annotate‑only (`validateFormats:false`). *This differs from AJV’s default of `true`; see §13 for the requirement to configure both AJV instances identically.*
  When `validateFormats:true`, implementations **SHOULD** synthesize minimally valid values
  for `email`, `uri`, `uuid`, and `date-time`. Validation **MUST** rely on `ajv-formats`
  (or an equivalent plugin with compatible semantics). The gate in §13 enforces parity of
  `validateFormats` across AJV instances; when `validateFormats:true` is configured **without**
  the corresponding format validators, the run **MUST** fail the startup config check (`AJV_FLAGS_MISMATCH`).

* **Objects** —

  * When any conjunct has `additionalProperties:false`, respect the **must‑cover intersection** from Compose.
  * **`unevaluatedProperties:false` — provable evaluation (normative).**
    When `unevaluatedProperties:false` applies at an object **instance location** `O`, the generator **MUST** emit **only** property names that are **provably evaluated** by **some applicator at the same instance location** `O`, taking into account applicators that actually apply to the **final instance**.

    **Definition — “evaluated” (unchanged, clarified).** A property is evaluated at `O` if it is matched by any of the following applicators at the same instance location `O`:
    • `properties` (exact name match);
    • `patternProperties` (JavaScript RegExp match, compiled with the `u` flag only);
    • `additionalProperties` when it is not `false` (i.e., `true` or a schema object);
    • an applicator reachable at the same instance location via a subschema that is applied (e.g., `allOf` conjunct, the selected `oneOf` branch, the union of all passing `anyOf` branches for the final instance, the active `then` or `else` branch of `if`, or a `$ref`/`$dynamicRef` target within the same document).
    `dependentSchemas` does not evaluate by itself; only applicators inside its **active** subschema contribute evaluation. If an active subschema has no such applicators, keys introduced solely to satisfy it **MUST NOT** be considered evaluated for `unevaluatedProperties:false`.

    **Evaluation Trace (E‑Trace) — predicate and evidence (normative).** To enforce provable evaluation during generation and repair, implementations **MUST** maintain, for each object instance location `O` with `unevaluatedProperties:false`, an evaluation predicate:

    ```
    isEvaluated(O, name) → boolean
    ```

    with the following semantics (deterministic; no RNG):

    1) Active‑applicator set at `O`.
       • `allOf`: include all conjuncts.
       • `oneOf`: include only the selected branch `b*` (per §8).
       • `anyOf`: include the union of branches that are known to validate the current candidate. Implementations **MAY** discover these via a quick Source‑Ajv re‑validation during Repair (§10 Repair‑only validator). Branches not known to validate are **unknown gating** and **MUST NOT** be used to prove evaluation.
       • Conditionals: include only the active `then` or `else` for which `if` is known to hold (per §9 if‑aware‑lite; use only facts derivable from already chosen keys).
       • `$ref` / `$dynamicRef` (in‑document only): include applicators reachable through the referenced subschema at the same instance location. For `$dynamicRef`, §12 bounded in‑document resolution applies; if no bounded binding is available, treat it as **unknown gating**.

    2) Per‑name proof (RegExp engine).
       For a concrete property `name`, it is **provably evaluated** if any active applicator at `O` would evaluate it:
       • `properties`: `name` equals a declared key (case‑sensitive).
       • `patternProperties`: there exists a **compilable** pattern `P` such that `new RegExp(P,'u').test(name) === true`.
         RegExp compilation uses the `u` flag only (no `g`/`y`), identical to §8’s Pattern execution engine. **Anchored‑safe** and **regex‑complexity caps** are **irrelevant** to E‑Trace (they apply to must‑cover proofs, not to per‑name evaluation). If compilation under `u` throws, treat that pattern as **unknown gating** for E‑Trace and **MUST NOT** use it as evidence (Compose/Normalize remain responsible for `REGEX_COMPILE_ERROR`).
       • `additionalProperties`: when present and not `false`, and neither `properties` nor `patternProperties` matched `name`, `additionalProperties` evaluates `name`.

    3) Planning guard (unchanged, explicit).
       During Generate, interpret “provably evaluated” as **provable at emission time**: rely only on evaluation facts that follow from current branch decisions (`oneOf` selection) and `allOf` merges; for `anyOf`, rely only on branches already known to validate the current candidate (e.g., via immediate re‑validation during Repair). When such knowledge is unavailable, treat evaluation as **unknown gating** and **MUST NOT** introduce a key whose evaluation depends solely on a branch not yet known to validate.

    4) Predicate vs. cache.
       `isEvaluated` **MAY** be implemented using an internal cache (“E‑Trace”) mapping each `O` to a set of proven names and their evidence for the **current candidate instance**. This cache is **ephemeral**, seed‑independent, and **MUST NOT** influence Compose results or cache keys (§14). Recompute or invalidate deterministically as the candidate changes during Repair.

    5) Replay after mutations (normative).
       Whenever a Generate/Repair action may change the set of `anyOf` branches known to validate at the same instance location `O`, the implementation **MUST** invalidate and recompute the evaluation proof for `O`. Any evaluation proof that depends exclusively on an `anyOf` branch that is no longer known to validate **MUST NOT** be used to introduce or rename properties at `O`. Before any introduction or rename at `O`, `isEvaluated(O, name)` **MUST** be recomputed against the current candidate state.

    **Emission rule (normative).** At any object location `O` where `unevaluatedProperties:false` applies, the generator **MUST** check `isEvaluated(O, name) === true` **before** introducing `name`. If the check fails, the generator **MUST NOT** introduce that key.

    **Interplay with `additionalProperties:false` (normative).** When `additionalProperties:false` is effective at `O` (per §8), E‑Trace **does not expand coverage**. Emission **MUST** satisfy **both**: (1) membership in the **must‑cover intersection** computed by Compose (e.g., `coverageIndex.has(name) === true`), and (2) `isEvaluated(O, name) === true`. If either condition fails, the key **MUST NOT** be emitted.

    **Observability (normative).** When `PlanOptions.metrics === true` (or in CI runs), implementations **MUST** record, for each property introduced under an active `unevaluatedProperties:false` guard, a diagnostic:

    ```
    EVALTRACE_PROP_SOURCE
      details:{ name:string, via:('properties'|'patternProperties'|'additionalProperties'|'$ref'|'allOf'|'oneOf'|'anyOf'|'then'|'else')[] }
    ```

    where `via` is the non‑empty list of applicator families that provided the evaluation proof for `name`. As with all diagnostics, `canonPath` **MUST NOT** be duplicated inside `details`.

    **Planning only.** This rule is a planning constraint; AJV remains the oracle at validation time. The final instance is the post‑Repair value submitted to the Source Ajv for terminal validation.
* Stable property order: **(1) required keys sorted lexicographically (UTF‑16 code‑unit ascending)**, then **(2) optional keys sorted lexicographically (UTF‑16 code‑unit ascending)**. Do not use `localeCompare`.

* **Numbers** — Prefer `type:"integer"` over `number+multipleOf:1`.

<a id="s9-arrays-contains"></a>
* **Arrays** —

  * Respect tuple semantics and implicit max length from `items:false`.
  * **Satisfy bagged `contains`**:
    * when `uniqueItems:false` or absent, generate targeted, distinct items per need;
    * when `uniqueItems:true`, do not attempt to satisfy needs before de‑duplication — first de‑duplicate by structural hashing (§10), then deterministically re‑satisfy all bagged `contains` needs as in §8.
  * (Restated) **Contains × `uniqueItems` (normative order):** `uniqueItems:true` ⇒ de‑dup → re‑satisfy; otherwise satisfy normally.

<a id="s9-enums-generation"></a>
* **Enums (generation)** — When `enum`/`const` constrain a value, pick the **first stable member**
  (array index order for `enum`; literal for `const`). This mirrors §10 Repair (`enum` → pick first stable member)
  and ensures seed‑independent determinism.

<a id="s9-objects-minimal-width"></a>
* **Objects — minimal‑width policy (normative)** —
  * By default, emit only the effective required keys. Add optional keys only when needed to: (a) meet `minProperties`, (b) satisfy `dependentRequired`, (c) realize discriminants selected by branch choice, or (d) **pick names compliant with `propertyNames` when synthesizing optional keys; renames happen only in** **Repair** (§10).
* When `minProperties` requires extras, choose them deterministically from the must‑cover set in lexicographic order. **Under `additionalProperties:false`, do not draw from `additionalProperties`; only `properties` and anchored‑safe `patternProperties` MAY supply extra keys.** When `additionalProperties` is not `false` at this object, you MAY extend with admitted `additionalProperties`/`patternProperties`. For `patternProperties`, selection is defined below.

  <a id="s9-pattern-witness-selection"></a>
  * **Pattern‑witness selection (normative):**
    1) Iterate `patternProperties` keys in **lexicographic order of their JSON‑unescaped regex `source`**; **consider only anchored‑safe patterns** per §8 **(detection uses the JSON‑unescaped `source`)**.
       **Generator-local classification (normative).** The generator **MUST independently apply** the §8 anchored‑safe test **and** the §8 regex‑complexity cap to each candidate pattern; it **MUST NOT** rely solely on Compose-phase diagnostics. **Skip** any pattern that fails these generator-local checks or would be flagged by `REGEX_COMPLEXITY_CAPPED`.
    2) **Bounded, deterministic witness search (normative).**
       The witness search domain is governed by `PlanOptions.patternWitness` (see §23). **Defaults**:
       Σ = the literal string "abcdefghijklmnopqrstuvwxyz0123456789_-", `maxLength = 12`, `maxCandidates = 32768`.
       **Length metric.** `maxLength` bounds the number of **Unicode code points** per candidate (not UTF‑16 code units).
       **Alphabet normalization (normative):** Interpret Σ as a sequence of **Unicode code points** (ECMA‑262 scalar values). **Drop any unpaired surrogate code units (U+D800–U+DFFF)**, then **deduplicate by code point** (set semantics). If the resulting Σ is **empty** (including after dropping unpaired surrogates), treat the pattern as **capped** immediately and **MUST** emit `COMPLEXITY_CAP_PATTERNS` with `details:{reason:'witnessDomainExhausted', alphabet:'', maxLength, tried:0}`.
       **Enumeration order (normative):** let **Σ_sorted** be Σ after normalization, sorted by **UTF‑16 code‑unit ascending**. Enumerate candidates **by increasing length** (0..`maxLength`), and within each length in **UTF‑16 lexicographic** order **induced by Σ_sorted**. The **input order of Σ MUST NOT** affect candidate ordering. Test candidates against the single target pattern `P` only, using **JavaScript RegExp with the `u` flag** (`new RegExp(P,'u')`). **No RNG** is used.
       **Compile‑error guard (normative).** If `new RegExp(P,'u')` throws during witness search, **skip `P`** without emitting generator‑phase regex diagnostics; treat `P` as **non‑generative** for witnesses and continue deterministically. Compose/Normalize remain responsible for `REGEX_COMPILE_ERROR`.
       If no witness is found before exhausting `maxCandidates` or the length bound, **treat `P` as capped**, **MUST** emit `COMPLEXITY_CAP_PATTERNS` with
       `details:{ reason:'witnessDomainExhausted'|'candidateBudget', alphabet?:string, maxLength?:number, tried?:number }` and **skip** `P`.
       This cap **never** enlarges must‑cover; AJV remains the oracle at validation.
       **Diagnostics:** the generator **MUST** increment and publish `diag.metrics.patternWitnessTried`
       (total candidates tested) when `PlanOptions.metrics === true` or in CI runs.
    
    **Duplicate handling (unchanged, normative).** If the chosen witness already exists in the object, then:
    (i) if `P` is an **exact‑literal‑alternatives** pattern, pick the next literal of the same minimal length in lexicographic order that is unused;
    (ii) otherwise **skip** `P` for this pass **without emitting any complexity‑cap diagnostic**. Continue cycling patterns until the needed count is met or patterns are exhausted.
    3) Allocate at most **one** new key per pattern per **pass** (see Glossary), continue to the next pattern, and repeat the cycle until the needed count is met or all patterns are exhausted.
    4) If no admissible patterns remain and `propertyNames.enum` exists:
       • **Under `additionalProperties:false`**, you **MUST NOT** expand coverage from `propertyNames` alone. Only names that are members of the **must‑cover intersection** computed in Compose MAY be used. Expansion via `propertyNames` is permitted **only** when the normalizer recorded `PNAMES_REWRITE_APPLIED`; in that case, use **only** those enum members proven by the **synthetic anchored‑safe patterns** introduced by the rewrite.
       • **When `additionalProperties` is not `false`** at this object, you MAY draw remaining keys from the enum in lexicographic order excluding already‑present names.
       If neither source can supply enough names, leave generation to fail AJV with `minProperties` and record diagnostics already defined in §8 (unsat hints).

       **Normative example (no coverage expansion from `propertyNames.enum` under AP:false).**

       Given:
       ```json
       {
         "type":"object",
         "allOf":[
           { "properties": { "a": {} }, "required":["a"], "additionalProperties": false },
           { "propertyNames": { "enum": ["a","b","c"] }, "minProperties": 2 }
         ]
       }
       ```

       and the §7 rewrite does not apply (no `PNAMES_REWRITE_APPLIED`), the generator **MUST NOT**
       draw the extra name from the `propertyNames.enum` alone to satisfy `minProperties`.
       Only names in the must‑cover intersection computed by Compose may be used; here it is `{ "a" }`.
       Generation may fail AJV at validation time, accompanied by the unsat hints from §8.
    5) **Non‑anchored patterns are non‑generative for witnesses.** Under `AP:false`, non‑anchored or complexity‑capped patterns would already have triggered the §8 fail‑fast or approximation path; do not use them to synthesize keys.

* **Arrays — minimal‑length policy (normative)** —
  * Choose the smallest length `len` satisfying all bounds and needs: `len ≥ max(minItems, |prefixItems|, Σ min_i)` and, when `items:false`, `len ≤ |prefixItems|`.
  * When `uniqueItems:true`, prefer this minimum after de‑dup + bag re‑satisfaction; do not add filler items unless required by `minItems` or the bag. Fill non‑targeted slots using the earliest stable generator for the item schema; do not reorder previously placed targeted items.
  * **Definition — earliest stable generator (normative):** deterministically produce the minimal value as follows. (i) If `enum`/`const` is present, pick the first member (array index order for `enum`). (ii) If `type` is a union, choose the lowest rank in the fixed order `null < boolean < integer < number < string < array < object`. (iii) Per‑type minima are `null`, `false`, `0` (integer), `0` (number), `""`, `[]`, `{}`. Apply bounds via Repair if needed. No RNG is used for fillers.

<a id="s9-if-aware-lite"></a>
### Conditionals strategy when not rewriting

* **Default when `rewriteConditionals:'never'` is in effect:** `conditionals.strategy = 'if-aware-lite'`.

  1. **Pre‑evaluate** `if` on the **partial instance** being built (best‑effort).
  1.1 **Normative scope**: only use `const/enum` tests on keys already chosen; ignore other keywords; never assume presence of unspecified keys.
  1.2 **No lookahead/backtracking**; the choice must be deterministic for a given seed and schema path.
  2. If `if` appears satisfied, bias generation to satisfy a **minimal subset** of `then` according to `minThenSatisfaction`
     (`'discriminants-only' | 'required-only' | 'required+bounds'`, default `'required-only'`).
  **Bounds set (normative):** For `'required+bounds'`, include only `minLength/maxLength`, `minimum/maximum`, `exclusiveMinimum/exclusiveMaximum`, `minItems/maxItems`, `minProperties/maxProperties`, and `multipleOf` (snap only, no distribution), applied in the order listed. Do not introduce other keywords in this path.
  **Definition (normative):** A discriminant property is any key referenced in `if.properties` with a `const` or `enum`, or any key that is both in `if.required` and constrained by `if.properties[key].(const|enum)`.
  3. If `if` appears unsatisfied, prefer choices that avoid activating `then` (e.g., omit discriminant).
  4. No heavy backtracking; rely on Repair if AJV still raises `then` violations.

* Diagnostics: `IF_AWARE_HINT_APPLIED`, `IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO`.

**Note (normative clarification).** E‑Trace uses JavaScript RegExp with the `u` flag only (no `g`/`y`), identical to §8’s Pattern execution engine. Anchored‑safe and regex‑complexity caps remain must‑cover concerns and do not apply to E‑Trace’s per‑name evaluation test. Patterns that fail to compile under `u` cannot serve as E‑Trace evidence.

---

<a id="s10-repair-engine"></a>
## 10) Repair Engine (AJV‑Driven)

<a id="s10-mapping"></a>
### Mapping (keyword → action)

* `required` → add missing props via `default` if present; else minimal generation for sub‑schema.
* `type` → regenerate field for target type; for unions, use BranchSelector.
* `enum` → pick first stable member.
* `const` → set const value.
* `minLength`/`maxLength` → pad/truncate by **Unicode code points** (surrogate pairs count as 1).
  **Normative note.** This matches Ajv v8 behavior when `unicodeRegExp:true` (see §13).
* `pattern` → constrained string generator if feasible; else fallback + re‑validate.
* `minimum`/`maximum` → clamp.
* `exclusiveMinimum`/`exclusiveMaximum` → nudge to `bound ± ε` (rational or ±1 for integers), **where ε is exactly the §8 value** (`ε := 10^-decimalPrecision`).
  <a id="s10-epsilon-logging"></a>
  **Logging (normative).** Implementations **MUST** include `details:{ epsilon:string }` whenever a non‑integer nudge occurs (i.e., when the applied delta is `±ε`). The `epsilon` **MUST** be formatted exactly as the base‑10 string `"1e-<decimalPrecision>"` (lowercase `e`, no plus sign or leading zeros; e.g., `"1e-12"` when `decimalPrecision=12`). When the target is `type:"integer"` and the nudge is `±1`, `details.epsilon` is **OPTIONAL**; implementations **MAY** include `details:{ delta:+1|-1 }`.
* `multipleOf` → rational snap; align fallback tolerance with AJV version.
  Implementations **MUST** include `{ epsilon: string }` (**exact ε used**) in action `details` whenever a snap or tolerance check occurs, using the same canonical `"1e-<decimalPrecision>"` format as above.
* `minItems`/`maxItems` → grow/shrink arrays respecting `prefixItems/items` and **all** bagged `contains` needs.
* `uniqueItems` → de‑duplicate via **structural hashing** (hash→bucket→`deepEqual`); re‑satisfy contains needs if de‑dup breaks them.
<a id="s10-structural-hashing"></a>
* **Normative hashing**: compute **SHA‑256** over the UTF‑8 bytes of the canonical JSON (**the algorithm in this paragraph is normative**; RFC8785 is informative background). Stringify with lexicographically sorted object keys (depth‑first), arrays in order, and apply `jsonSafeReplacer` for BigInt; normalize `-0` to `0`. Use the 32‑byte digest as the hash key. Collisions **must** be confirmed by `deepEqual` before de‑dup.
* `additionalProperties:false` / `unevaluatedProperties:false` → remove extras; rename only when safe; never rename keys required by `dependent*`.
**Evaluation guard for additions and renames (normative).** When `unevaluatedProperties:false` applies at object location `O`, any Repair action that would **introduce** a new property name (including adding a missing `required` via minimal generation for a sub‑schema, or renaming a key under the `propertyNames` policy) **MUST** satisfy `isEvaluated(O, name) === true` **before** committing the change. If the guard fails:

• For rename: try the next candidate (per §10 rename ordering). If no candidate passes the evaluation guard, **MUST NOT** rename; perform safe deletion if permitted by §10 or leave for AJV to report. Emit `REPAIR_EVAL_GUARD_FAIL{ from:string, to?:string, reason:'notEvaluated' }`.
• For add: do not add that key; attempt alternative keys only when permitted by schema semantics; otherwise leave for AJV.

Run the evaluation guard before finalizing the action for the object (and before the `unevaluated*` sweep). After each successful change, **MUST** update any internal E‑Trace cache for `O` deterministically.
<a id="s10-propertynames-rename-guard"></a>
* `propertyNames` →
  * **Order & safety (unchanged reminders).** Run before `additionalProperties/unevaluated*` sweeps; never rename keys that are `required` or referenced by any `dependent*` antecedent/depender.
  * **Closed enum rename (deterministic; AP:false guard).**
    When `propertyNames` is an **enum** `E`, for each offending key `k` choose the **lexicographically smallest** name `n ∈ E` (**UTF‑16 code‑unit order; do not use `localeCompare`**) such that `n` is not currently present and:
    - if `additionalProperties:false` applies at the object **and** `PlanOptions.repair.mustCoverGuard !== false`, then **`ctx.isNameInMustCover?.(canonPath,n) === true`**;
    - otherwise (no AP:false, or guard disabled) the must‑cover restriction does not apply.
    **Binding & scope (normative clarification).** When `repair.mustCoverGuard !== false` and `additionalProperties:false` applies at the object, the implementation **MUST** query `ctx.isNameInMustCover(canonPath, n)` **with the exact canonPath of the same object** (neither an ancestor nor a descendant). If `ctx.isNameInMustCover` is absent in this situation, the implementation **MUST NOT** perform a rename and **MUST** emit `MUSTCOVER_INDEX_MISSING{guard:true}` (existing behavior), handling the violation by safe deletion (respecting `required`/`dependent*`) or by leaving it for AJV to fail.
    **Deterministic offender processing (normative).** Process offending keys in ascending **UTF‑16 lexicographic** order of their original names. If multiple offenders would select the same candidate `n`, assign `n` to the offender with the smallest original name; the others **MUST** try the next admissible candidate (same ordering and guards). If none exists, handle via safe deletion or let AJV fail per this section. The check “not currently present” **includes** names created by earlier renames in the same pass.
    **No safe candidate (normative).** If no candidate name `n ∈ E` simultaneously (a) is not present in the object and (b) satisfies `ctx.isNameInMustCover(canonPath, n) === true`, the implementation **MUST NOT** rename and **MUST** either safely delete the offending key (respecting `required`/`dependent*`) or leave it for AJV to report. It **MUST** log `details:{ from:string, reason:'deletedNoSafeName', mustCover:true }`.
* **Binding (normative).** `ctx.isNameInMustCover`, when provided, **MUST** be identically the predicate obtained from Compose’s CoverageIndex: `name ↦ coverageIndex.get(canonPath)?.has(name) === true`. Implementations **MUST NOT** substitute other recognizers here.
* **API absence (normative).** If `additionalProperties:false` applies, `PlanOptions.repair.mustCoverGuard !== false`, **and** `ctx.isNameInMustCover` is **absent**, `Repair` **MUST NOT** rename under `AP:false`; it **MUST** handle offending keys via safe deletion (respecting `required`/`dependent*`) or leave AJV to fail. When the guard is disabled (`repair.mustCoverGuard === false`), behavior matches the pre‑guard policy (no must‑cover query). See §23 for interfaces (`RepairCtx`, `PlanOptions`).
  <a id="s10-mustcover-index-missing"></a>
  **Observability (normative).** In the same situation, the implementation **MUST** emit the diagnostic `MUSTCOVER_INDEX_MISSING` at the object’s `canonPath` with `details:{ guard:true }`. This does not alter behavior; it documents that the guard was active but the CoverageIndex was unavailable.
  * **Pattern or no available name.** When `propertyNames` uses `pattern` (any form) **or** no such `n` exists, **do not rename**; delete the offending key if safe, otherwise leave it for AJV.
  * **Logging (normative).** Each rename/delete **MUST** record: `details:{ from:string, to?:string, reason:'enumRename'|'deletedNoSafeName'|'deletedMustCoverRejected', mustCover?:boolean }`. After a rename, immediately re‑run per‑property repairs for the new key in the same pass (budget permitting), **then** re‑apply §9’s object property order (required keys first, then optional keys; both in UTF‑16 lexicographic order).

  **Pattern pseudo‑enum rename (normative).** When `propertyNames` uses `pattern` and the JSON‑unescaped source `P` is (a) anchored‑safe and not complexity‑capped per §8, and (b) of exact‑literal‑alternatives form `^(?:L1|...|Lk)$` (Glossary), then for each offending key `k`:
  1) Treat `E = {L1..Lk}` as a virtual enum (no schema change). Select the candidate `n` exactly as in the enum case: iterate `sortUTF16Asc(E)` and pick the smallest `n` that is not present and passes the guards.
  2) Guards (MUST): under AP:false and `repair.mustCoverGuard !== false`, require `ctx.isNameInMustCover(canonPath, n) === true`; if `unevaluatedProperties:false` applies at `O`, require `isEvaluated(O, n) === true`; and apply the AJV pre‑flight acceptance/reject rules above before committing.
  3) Logging (MUST): on success, emit `REPAIR_PNAMES_PATTERN_ENUM{ from:k, to:n, mustCover:boolean }` (`mustCover:true` when the must‑cover guard was active). When all candidates fail, do not rename; delete safely if allowed or leave for AJV; emit `REPAIR_PNAMES_PATTERN_ENUM{ from:k, mustCover:boolean }` (without `to`) or reuse `deletedMustCoverRejected` when applicable.
  4) Non‑eligible (MUST): if `P` fails to compile under `new RegExp(P,'u')` or is capped by §8, do not use this mechanism; fall back to existing enum‑based rename (if any) or deletion/reporting. Repair does not emit regex diagnostics; regex diagnostics belong to Normalize/Compose.

**Pre‑flight for renames (normative).** Before committing a rename `k → n` at object location `O`:

1. **Hard guards (MUST pass first)**
   • **AP:false + must‑cover guard** (unchanged, explicit): if `additionalProperties:false` is effective at `O` and `PlanOptions.repair.mustCoverGuard !== false`, **MUST** require `ctx.isNameInMustCover(canonPath, n) === true`. Otherwise **MUST NOT** rename and **MUST** log `details:{ from:k, reason:'deletedMustCoverRejected', mustCover:true }`.
   • **Evaluation guard (from §9/B)**: if `unevaluatedProperties:false` applies at `O`, **MUST** require `isEvaluated(O, n) === true` before attempting the rename. If it fails, **MUST NOT** rename, **MUST** emit `REPAIR_EVAL_GUARD_FAIL{ from:k, to:n, reason:'notEvaluated' }`, and try the next candidate.

2. **AJV pre‑flight (acceptance test)**
   When (1) passes, **MUST** perform a deterministic pre‑flight:
   • Build an in‑memory candidate where `k` is replaced by `n` only at `O`.
   • Validate the candidate against the original schema with the Source Ajv. The implementation MAY use the repair‑only validator (`allErrors:true`) per §13; the oracle remains the Source Ajv.
   • **Accept (MUST)**: commit the rename only if both hold: (a) the selected oneOf branch `b*` (when applicable) still validates; (b) no new AJV error with `keyword ∈ {'dependentRequired','dependentSchemas'}` attributable to `O` or the path of `n` appears.
   • **Reject (MUST)**: if either fails, **MUST NOT** rename and **MUST** emit `REPAIR_RENAME_PREFLIGHT_FAIL{ from:string, to:string, reason:'branch'|'dependent' }` (`'branch'` when the oneOf target fails; `'dependent'` when a dependency violation appears). Then deterministically try the next candidate.

3. **Budgets & ordering**
   The pre‑flight counts against the per‑path attempt budget (§10) and **MUST NOT** alter deterministic offender ordering (UTF‑16 ascending). After an accepted rename, **MUST** re‑run per‑property repairs for `n` in the same pass (budget permitting) and re‑apply §9 property order.

  **Algorithm (normative) — AP:false enum‑based rename**
  Inputs: offending keys `K_off`; `propertyNames.enum = E` (strings);
           `ctx.isNameInMustCover(canonPath, n)` bound to Compose’s CoverageIndex (§8).
  Precondition: AP:false applies at the same object **and** `repair.mustCoverGuard !== false`.
  1) Process `K_off` in **UTF‑16 ascending** order of the original names.
  2) For each offending key `k`:
     For `n` in `sortUTF16Asc(E)`:
       If `n` is not currently present in the object **and**
          `ctx.isNameInMustCover(canonPath, n) === true`:
          rename `k → n`;
          log `{ from:k, to:n, reason:'enumRename', mustCover:true }`;
          re‑run per‑property repairs for `n`;
          break.
     If no candidate found:
       do **not** rename; delete if safe (not `required` / not referenced by `dependent*`);
       otherwise leave for AJV to report; log `{ from:k, reason:'deletedNoSafeName', mustCover:true }`.
  3) If AP:false applies and `repair.mustCoverGuard !== false` but `ctx.isNameInMustCover` is **absent**:
     **MUST NOT** rename; log `MUSTCOVER_INDEX_MISSING{ guard:true }`.

<a id="s10-process-order"></a>
### Process

<a id="s10-property-order"></a>
* **Order** — shape (`type`/`required`) → bounds (`min*`/`max*`) → semantics (`pattern`/`multipleOf`/`format`) → **names (`propertyNames`)** → sweep (`additional*`/`unevaluated*`).
* **Budgets** — per‑node attempt counter (1–3) + seen‑set `(instancePath, keyword, normalizedParams)` to avoid loops.
* **Stagnation guard** — If over `complexity.bailOnUnsatAfter` gen→repair→validate **cycles** errors don’t decrease or oscillate on the same keys ⇒ `UNSAT_BUDGET_EXHAUSTED`.
<a id="s10-logging-and-idempotence"></a>
* **Idempotence** — Repeating the same action is a no‑op.
* **Logging** — `{ item, changed, actions:[...] }` where each action records `keyword`, `canonPath` and `origPath` (derived via `toOriginalByWalk` and `ptrMap`), plus `details` when applicable.

---

<a id="s11-modes"></a>
## 11) Modes

<a id="s11-strict"></a>
### Strict (default)

* Fail early only on non‑normalizable constructs or explicit policy cases.
* `$ref` external: behavior controlled by `failFast.externalRefStrict` (default `error`). On failure, **emit** `EXTERNAL_REF_UNRESOLVED`.
  **Normative stop (alignment with §1).** When the **Source Ajv** fails to compile the **original schema** due **solely** to unresolved external `$ref` (per §11/§12 classification; no I/O), the run **MUST NOT** proceed to **Compose/Generate/Repair** for that schema. Treat this as a hard error: emit `EXTERNAL_REF_UNRESOLVED` and abort planning/generation at this root.
  **External `$ref` (normative):** Resolve the `$ref` value against the current resolution base (from `$id`).
  <a id="s11-external-ref-classification"></a>
  If the resolved URI is **fragment‑only** (`#...`), it is **internal**; otherwise it is **external** (includes absolute
  URIs like `http:`, `https:`, `urn:`, `file:` and relative references whose URI‑reference has a non‑empty path to another
  document such as `other.json#/...`). **No I/O** (network or filesystem) is performed in any mode.
* `$dynamic*`: note `DYNAMIC_PRESENT` (no error).
* Compose & object keywords proceed without feature gates; complexity caps may degrade behavior but never skip validation.

<a id="s11-lax"></a>
### Lax

* Proceed best‑effort even when some features are partial; still validate with AJV.
* External `$ref`: default **warn** then attempt generation without resolving remote refs (no network I/O).
  <a id="s11-external-ref-probe"></a>
  The **Source AJV** compilation of the original schema is attempted:
  • if compilation succeeds, final validation runs normally;  
  • if compilation **fails**, apply the following **eligibility test (normative)** to decide whether to skip validation:
  Let `ExtRefs` be the set of `$ref` values classified as **external** per §11/§12. Create an in‑memory copy of the schema where each external `$ref` subtree is replaced by `{}` (no other changes). If compiling this **probe** schema **succeeds** and `ExtRefs.size > 0`, treat the failure as **likely due only** to unresolved external `$ref` (**heuristic classification**): set `skippedValidation:true`, emit `EXTERNAL_REF_UNRESOLVED` with `details:{ mode:'lax', skippedValidation:true }`, and **MUST** set `diag.metrics.validationsPerRow = 0` for the affected row(s). This classification is heuristic; when uncertain, implementations **MUST NOT** skip validation. If the probe **also fails**, or the probe cannot be performed, **do not** skip validation and propagate the compilation failure. No network or filesystem I/O is performed.
    **Observability (normative):** When available, include one exemplar unresolved reference as `details.ref := smallest(ExtRefs)`, where `smallest` returns the UTF‑16 lexicographically smallest string in `ExtRefs`. If no stable exemplar can be determined, omit `ref`.
  **Additional guard (normative).** The skip path above **MUST** be taken **only when** all of the following hold:
  (i) `ExtRefs.size > 0`; (ii) the failing Source Ajv compilation’s error list is non‑empty and **every** error has
  `keyword === '$ref'`, and its failing reference value is an element of `ExtRefs`; and (iii) the probe compilation
  succeeds. If **any** error does not satisfy (ii), implementations **MUST NOT** skip validation.
* `$dynamic*` noted.

**Algorithm (normative) — ExternalRefSkipEligibility**
Input: original schema S; Source Ajv class/dialect matched per §12.
1) Determine ExtRefs := all `$ref` values classified as **external** by §11/§12.
2) Attempt compile(S). If it succeeds ⇒ do **not** skip; run final validation normally.
3) If compile(S) fails:
   a) Require: every compile error is for keyword `'$ref'` and its failing reference value is an element of ExtRefs (use the validator’s exposed reference value).
   b) Build probe schema S': in-memory copy of S where each external `$ref` subtree is replaced by `{}` (no other changes).
   c) Attempt compile(S'). If it succeeds **and** ExtRefs.size > 0:
        set `skippedValidation:true`,
        emit `EXTERNAL_REF_UNRESOLVED{ mode:'lax', skippedValidation:true, ref: smallest(ExtRefs) }`,
        and **MUST** set `diag.metrics.validationsPerRow = 0` for affected rows.
      `smallest` is the UTF‑16 lexicographically smallest string in ExtRefs; omit `ref` if none can be determined.
   d) Otherwise ⇒ **MUST NOT** skip; propagate the compilation failure.
Note (normative): No network or filesystem I/O is performed in any mode.

<a id="s11-strict-vs-lax-summary"></a>
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

<a id="s12-draft-handling"></a>
## 12) Draft Handling

<a id="s12-detection"></a>
* **Detection** — `$schema` + AJV draft settings.
<a id="s12-ajv-class-selection"></a>
* **Ajv class selection (normative).** Compile the **original schema** with the Ajv class that matches its dialect:
  - draft‑06 / draft‑07 → `new Ajv()` **with the corresponding meta‑schemas added** if `$schema` requires them;
  - draft‑2019‑09 → `new Ajv2019()`;
  - draft‑2020‑12 → `new Ajv2020()`;
  - draft‑04 → `new (require("ajv-draft-04"))()`.
  **Warning:** draft‑2020‑12 is not backwards compatible. You **MUST NOT** use draft‑2020‑12 and previous drafts in the **same** Ajv instance.
* **Planning/Generation Ajv (normative).** When the canonical view targets draft‑2020‑12 semantics (e.g., `prefixItems` / the new `items`), any compilation performed during planning/generation **MUST** use `Ajv2020`. This does not affect the final validation, which always runs against the **original** schema.
<a id="s12-canonical-2020-view"></a>
* **Internal canon** — 2020‑12‑like shape; **always** validate against the original schema.
<a id="s12-refs-and-dynamic"></a>
* **Refs** — Only fragment‑only refs (`#...`) are considered in‑document; **no network or filesystem I/O**.
  External `$ref` (see §11 definition) are not dereferenced; emit `EXTERNAL_REF_UNRESOLVED` per mode.
* **Dynamic refs — bounded in‑document resolution (normative).**

  * **No I/O.** No network or filesystem I/O is performed. `$dynamicRef` is resolved **only** within the **same document**.
  * **Do not cross documents.** Resolution **MUST NOT** cross to another document (external `$id`/URI). The search space is restricted to the in‑document, canonicalized schema tree.
  * **Nearest‑scope candidate.** During *Compose* (planning) and any Planning/Generation compiles, implementations **MAY** attempt to locate the **nearest in‑scope** `$dynamicAnchor` whose JSON‑unescaped `name` matches the `$dynamicRef` name, following draft‑2020‑12 dynamic‑scope rules, but restricted to the **in‑document** scope only.
  * **Depth bound (normative).** The upward dynamic‑scope search **MUST** be bounded by `guards.maxDynamicScopeHops` (default **2**; see §23). When the bound is exceeded **or** no in‑scope match is found, resolution **MUST NOT** occur (keep pass‑through behavior).
  * **Safe substitution preconditions (normative).** Compose **MAY** substitute the `$dynamicRef` by an equivalent fragment‑only `$ref` to the matched anchor’s **canonical pointer** **only if all** of the following hold:

    1. The matched `$dynamicAnchor` occurs on the **ancestor chain** of the `$dynamicRef`’s **canonical JSON Pointer** (same document), and it is the **nearest** such ancestor with that name; and
    2. **No** `$ref` (or `$dynamicRef`) node appears on any **ancestor** pointer segment between the root and the `$dynamicRef` node (i.e., the evaluation path to the `$dynamicRef` does not traverse a `$ref` boundary that could alter dynamic scope); and
    3. **No other** `$dynamicAnchor` with the same name exists on any **ancestor** pointer segment **above** the chosen anchor (uniqueness on the ancestor chain).
       If **any** precondition fails, Compose **MUST NOT** substitute; it **MAY** still record diagnostics and keep pass‑through.
  * **Effective‑view substitution (planning only).** When the preconditions above are met, the **effective view** (Compose result) **MAY** replace the `$dynamicRef` node with an equivalent **fragment‑only `$ref`** targeting the matched anchor. The **original schema** is preserved verbatim and remains the sole source for final AJV validation.
  * **Diagnostics (normative).**
    On successful bounded binding (with or without substitution), Compose **MUST** record
    `DYNAMIC_SCOPE_BOUNDED` at the `$dynamicRef`’s `canonPath` with `details:{ name:string, depth:number }`, where `name` is the anchor name and `depth` is the number of dynamic‑scope hops used (≥ 1).
    When no bounded binding is performed, Compose **SHOULD** continue to note `DYNAMIC_PRESENT` as today; no error is raised.
  * **Determinism.** Binding outcomes **MUST** be deterministic for a fixed `(AJV.major, AJV.flags)` and schema; no RNG and no wall‑clock dependence.

  Idempotence (normative).
  For fixed inputs `(schema, AJV.major, AJV.flags)`, two consecutive runs of `Normalize → Compose` **MUST** produce the same `$dynamicRef → $ref` substitution (or no substitution) at the same `canonPath`s. The substitution is planning‑only and **MUST NOT** evolve across passes on the same inputs.

  **Cross‑references.** This bounded resolution does **not** alter §11 mode behavior; external `$ref` remain non‑dereferenced (no I/O) and are handled per §11. Final validation still runs on the **original schema**.
* **Effective view** — Preserves `unevaluated*` semantics for the final validation stage.

---

<a id="s13-ajv-configuration"></a>
## 13) AJV Configuration

Two distinct AJV instances/configs:

1. <a id="s13-source-ajv"></a>**Source (original schema) compilation**

   * `strictSchema:false` (tolerate vendor `x-*`, `example`)
   * `allowUnionTypes:true`
   * `unicodeRegExp:true`, `useDefaults:false`, `removeAdditional:false`, `coerceTypes:false`
   * `allErrors:false` for final validation.
     **Repair-only validator (normative).** Implementations MAY compile an additional validator from the same original schema
     with identical flags **except** `allErrors:true` for use **inside Repair** to collect multiple errors per pass.
     This repair-only compile MUST NOT alter planning/generation outcomes and is excluded from the startup parity gate.
   * `validateFormats:false` (**project default**; **AJV default is `true`**). Optional: `validateFormats:true` with `ajv-formats`.
   * `multipleOfPrecision:<integer>` — MUST be set to the same integer value as `PlanOptions.rational.decimalPrecision` whenever `rational.fallback` is `'decimal'` or `'float'`. This guarantees that the ε‑based acceptance rule for `multipleOf` in generation/repair matches Ajv’s validator (see §8).
   * **Ajv class:** `Ajv` / `Ajv2019` / `Ajv2020` / `ajv-draft-04` **as per §12** (match the schema dialect).

2. <a id="s13-planning-ajv"></a>**Planning/Generation**

   * `strictSchema:true`, `strictTypes:true`, `allErrors:false`, `unicodeRegExp:true`, `coerceTypes:false`
   * `allowUnionTypes:true` **when** this instance compiles schemas that may contain union types (e.g., `type: ["X","null"]` produced by the OAS `nullable` normalization).
   * `validateFormats` aligned with the policy above (**note:** AJV’s default is `true`; set this option **explicitly and identically** on both AJV instances).
   * **Normative:** Both AJV instances MUST enable `unicodeRegExp:true` so that RegExp semantics match the anchored‑safe test (§8) and the RegExp behavior referenced in §9.
   * **Clarification (normative).** In Ajv v8, `unicodeRegExp:true` governs both RegExp semantics **and** code‑point string‑length counting used by `minLength`/`maxLength`. This specification relies on `unicodeRegExp:true` on **both** instances so generation and validation agree on string length and pattern behavior.
   * `multipleOfPrecision:<integer>` — MUST be set to the same integer value as `PlanOptions.rational.decimalPrecision` whenever `rational.fallback` is `'decimal'` or `'float'`. This guarantees that the ε‑based acceptance rule for `multipleOf` in generation/repair matches Ajv’s validator (see §8).
   * **Ajv class:** `Ajv2020` **(normative when compiling the canonical 2020‑12‑like view; see §12)**.

* **Optional (OpenAPI discriminator).** If you claim `discriminator` support, **both** Ajv instances MUST be created with `discriminator:true`. If you do not claim support, keep it disabled.

<a id="s13-startup-config-check"></a>
**Startup config check (normative).**
Implementations **MUST** verify at initialization that:
  1) **Source AJV** has the required flags listed above for “Source (original schema) compilation”;
  2) **Planning/Generation AJV** has the required flags listed above for “Planning/Generation”;
  3) **Both** instances have `unicodeRegExp:true`;
  4) **Dialect ↔ Ajv class match (normative):** the Ajv **class** matches the schema dialect per §12 for the Source instance, and `Ajv2020` is used when the Planning/Generation phase compiles the canonical 2020‑12‑like view;
  5) **`validateFormats` is identical** on both Ajv instances (both `false`, or both `true` with `ajv-formats`);
  6) **`allowUnionTypes` policy** is consistent with the compilation responsibilities of each instance (enabled on Planning when it compiles union‑typed schemas);
  7) **`discriminator` option** is **identical on both instances** (both `true` if you claim support, otherwise disabled).
  8) **`multipleOfPrecision` alignment** — when `PlanOptions.rational.fallback ∈ {'decimal','float'}`, `multipleOfPrecision` on both Ajv instances **MUST** equal `PlanOptions.rational.decimalPrecision`. On mismatch, fail with `AJV_FLAGS_MISMATCH` and include a diff entry `{ flag:"multipleOfPrecision", expected:<decimalPrecision>, actual:<value> }`.
  9) **Formats plugin parity** — If `validateFormats:true` on either instance, **both** instances **MUST** have an equivalent set of active validators for at least `date-time`, `email`, `uri`, and `uuid` (e.g., via `ajv-formats`). When the validators are missing or differ across instances, fail with `AJV_FLAGS_MISMATCH` and include a diff entry such as `{ flag:"formatsPlugin", expected:true, actual:false }`.

If any required flag deviates from these prescriptions, the run **MUST** fail with diagnostic **`AJV_FLAGS_MISMATCH`**.
**Payload (normative):** `details:{ instance:'source'|'planning'|'both', diffs:Array<{flag:string, expected:any, actual:any}>, ajvMajor:number, sourceFlags?:Record<string,any>, planningFlags?:Record<string,any> }`.
Extend `details.diffs[]` to allow class/dialect mismatches, using entries like `{ flag:"dialectClass", expected:"Ajv2020", actual:"Ajv" }`, `{ flag:"sourceDialect", expected:"draft-07", actual:"2020-12" }`, or `{ flag:"formatsPlugin", expected:true, actual:false }`.
Implementations **SHOULD** populate `sourceFlags` and `planningFlags` with the effective flag sets at fault time.
The check is part of the acceptance gate in §1 and does not alter cache key semantics (§14).

<a id="s13-cache-key-flags"></a>
Cache keys MUST include AJV **major version**, the **Ajv class/dialect** used to compile the artifact, and the exact set of flags used by the AJV instance for the phase that produced the artifact: (`validateFormats`, `allowUnionTypes`, `strictTypes`, `strictSchema`, `unicodeRegExp`, `coerceTypes`, `multipleOfPrecision`, `discriminator`) and the **PlanOptionsSubKey** (defined below).
Cache key requirements mirror §14: include AJV **major version**, the **Ajv class/dialect**, the full flag set listed here, and **PlanOptionsSubKey**.

Rationale (informative). Ajv implements `multipleOf` with an epsilon configurable via `multipleOfPrecision`; aligning it to `decimalPrecision` avoids divergence with generation/repair.

**Clarification (normative).** When artifacts are produced by different AJV instances (e.g., “source” vs “planning/generation”),
the cache key **MUST** use the flag set of the **producing** instance. If a single cache is shared across phases,
the key **MUST** encode the instance role or both flag sets (e.g., a tuple), to prevent collisions between
`strictSchema:false` and `strictSchema:true`.

---

<a id="s14-cache-strategy"></a>
## 14) Cache Strategy

<a id="s14-hierarchy"></a>
Hierarchical:

1. `WeakMap` by object identity
2. `$id` when present and trusted
3. <a id="s14-stable-hash"></a>`stableHash(schema)` **only if** estimated size < `hashIfBytesLt` using canonical JSON:
   sort object keys lexicographically (depth‑first), preserve array order, apply `jsonSafeReplacer`,
   and normalize `-0` to `0`. The resulting UTF‑8 is the hash input.
   **Normative:** estimated size = UTF‑8 byte length of the **same canonical JSON** used for hashing (sorted keys lexicographically depth‑first, arrays in order, `jsonSafeReplacer`, and normalization `-0 → 0`).

<a id="s14-cache-keys"></a>
LRU bounded by `lruSize`. Cache keys **MUST** include AJV **major version**, the **Ajv class/dialect** of the producing instance, and the exact set of flags used by the **producing AJV instance**
(`validateFormats`, `allowUnionTypes`, `strictTypes`, `strictSchema`, `unicodeRegExp`, `coerceTypes`, `multipleOfPrecision`, `discriminator`) and the **PlanOptionsSubKey** (defined below).
<a id="s14-memoization-branch-selection"></a>
**Non‑goal**: no cache of **generated data** across runs. Memoization is allowed only for **branch selection**
decisions at compose‑time and **MUST** key on `(canonPath, seed, AJV.major, AJV.flags, PlanOptionsSubKey)`.  
**Normative:** the **pointer component** of the composite key **MUST** be the canonical JSON Pointer `canonPath` (not `canonPtr`). The other components (**seed, AJV.major, AJV.flags, PlanOptionsSubKey**) **MUST** also be included; implementations MAY encode them as separate fields or as a serialized tuple.
(ε := `10^(−decimalPrecision)` and the **round‑half‑even** rounding mode for `fallback:'decimal'` are implied by `rational.decimalPrecision` within `PlanOptionsSubKey`.)
**Final memoization key (normative clarification).** When `ComposeOptions.selectorMemoKeyFn` is provided, implementations **MUST NOT** use the function’s return value as the complete key. Let `userKey := selectorMemoKeyFn(canonPath, seed, opts)`. The final memo key **MUST** be derived from the tuple `(canonPath, seed, AJV.major, AJV.flags, PlanOptionsSubKey, userKey)`. Implementations **MUST** append/merge the AJV fields and `PlanOptionsSubKey` even if `userKey` repeats them. For the AJV flags component, use a stable JSON encoding with lexicographically sorted keys.

<a id="s14-planoptionssubkey"></a>
**PlanOptionsSubKey (normative)** — JSON string of the following fields only, with keys sorted lexicographically:
'complexity.maxAnyOfBranches',
'complexity.maxContainsNeeds',
'complexity.maxEnumCardinality',
'complexity.maxOneOfBranches',
'complexity.maxPatternProps',
'conditionals.exclusivityStringTweak',
'conditionals.minThenSatisfaction',
'conditionals.strategy',
'disablePatternOverlapAnalysis',
'guards.maxGeneratedNotNesting',
'patternWitness.alphabet',
'patternWitness.maxCandidates',
'patternWitness.maxLength',
'rational.decimalPrecision',
'rational.fallback',
'rational.maxLcmBits',
'rational.maxRatBits',
'rational.qCap',
'repair.mustCoverGuard',
'trials.maxBranchesToTry',
'trials.perBranch',
'trials.skipTrials',
'trials.skipTrialsIfBranchesGt'
(affects AP:false rename policy only; included to key rename behavior; no effect on numeric math or tolerances).
Omitted/undefined fields are not serialized.
**Canonicalization (normative).** When computing `PlanOptionsSubKey`, any
`conditionals.strategy:'rewrite'` **MUST** be normalized to `'if-aware-lite'`.
This normalization **MUST NOT** trigger any Normalizer rewrite; only
`NormalizeOptions.rewriteConditionals` does (§7).
**Note (clarification):** Cache artifacts and memoized branch picks **MUST** embed `PlanOptionsSubKey` in their keys.
Use separate LRU spaces for the two AJV instances (planning vs source) to avoid key collisions.
(Clarification: separate LRU spaces for the two AJV instances are recommended.)

---

<a id="s15-performance-determinism-metrics"></a>
## 15) Performance, Determinism & Metrics

<a id="s15-thread-safety"></a>
* **Thread‑safety (normative)** — RNG uses per‑location seeded state (`seed ⊕ fnv1a32(canonPath)`), with no shared mutable global state. Caches MAY be shared across threads only when operations are atomic; concurrent interleaving MUST NOT affect outcomes. Because memo/cache keys include `(canonPath, seed, AJV.major, AJV.flags, PlanOptionsSubKey)`, concurrent runs with identical keys **MUST** produce identical `chosenBranch`, `scoreDetails` (including `tiebreakRand` when used), and effective plans.

<a id="s15-rng"></a>
* **RNG (normative)** — **xorshift32** with state `uint32`, initialized as
  `s0 = (seed >>> 0) ^ fnv1a32(canonPath)`. On each `next()`:
  `x ^= x << 13; x ^= x >>> 17; x ^= x << 5;` (all `>>> 0`). The return value is `x >>> 0`.
  No global state. Tie‑breakers use `tiebreakRand = next() / 4294967296` (IEEE‑754 double) as a deterministic float in `[0,1)`. The same `tiebreakRand` value MUST be recorded in diagnostics when RNG is used. See §8 “Branch selection” for the requirement to always record `tiebreakRand` in score‑only, even when `|T| = 1`.
* **Trials** — Bounded by `trials`; Top‑K; optional skip on large `oneOf`.
* **Pattern overlap** — Heuristic; can be disabled.
* **Complexity caps** — Trigger degradations (score‑only selection, analysis skips) with explicit diagnostics.
* **No wall‑clock/env dependency (normative)** — Control flow (branch picks, retries, tweaks) MUST NOT depend on
  Date/time, timers, environment variables, or system locale. Metrics MAY use a monotonic clock and MUST NOT affect outcomes.
<a id="s15-bench-protocol"></a>
* **Benchmark protocol (normative for CI):** Node.js LTS (≥18.x), AJV v8.x with the flags in §13, `unicodeRegExp:true`, fixed seeds `{1, 42, 4242}`, public dataset `profiles/{simple,medium,pathological}.json`, run 5 warmups + 20 measured iterations, report `p50LatencyMs`, `p95LatencyMs`, and `memoryPeakMB`. Results outside ±10% of the previous green commit require investigation.

<a id="s15-metrics"></a>
### Metrics (reported in `diag.metrics`)

```ts
{
  // REQUIRED in CI runs (bench harness):
  normalizeMs: number;
  composeMs: number;
  generateMs: number;
  repairMs: number;
  validateMs: number;
  /** Final-validation compile time (the validator used for the terminal AJV check).  */
  compileMs?: number;
  validationsPerRow: number;    // AJV validations / generated row
  repairPassesPerRow: number;   // repair loops / row
  branchTrialsTried?: number;
  patternWitnessTried?: number; // total candidates tested during witness search (generator), if recorded
  // REQUIRED in CI runs (bench harness):
  memoryPeakMB: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  // added observability
  branchCoverageOneOf?: Record<string, { visited: number[]; total: number }>;
  enumUsage?: Record<string, Record<string, number>>;
  repairActionsPerRow?: number; // total repair actions / row
  // E-Trace (optional)
  evalTraceChecks?: number;   // times isEvaluated(...) was consulted under unevaluatedProperties:false
  evalTraceProved?: number;   // times the predicate returned true
}
```

<a id="s15-slo-sli"></a>
### SLO/SLI (CI gates; normative for release)

**Budgets & Fallback (normative)**

* **p95 gates (CI):** `p95LatencyMs ≤ 120 ms` and `memoryPeakMB ≤ 512 MB` per profile.
  CI **MUST** fail when exceeded (see §1 Bench SLI gate). `compileMs ≤ 1000 ms` remains a tracked SLI (non‑blocking).
* **Fallback order when a budget is exceeded:**
  1) reduce optional repairs; 2) cap `trials.perBranch`/`maxBranchesToTry` (score‑only if needed);
  3) relax non‑normative heuristics (e.g., skip pattern‑overlap analysis).
* Document degradations in diagnostics and metrics (`diag.metrics`, caps and budget fields).

---

<a id="s16-implementation-plan"></a>
## 16) Implementation Plan

<a id="s16-phase-p0"></a>
### Phase P0

* Complexity caps + diagnostics:
  `COMPLEXITY_CAP_ONEOF`, `COMPLEXITY_CAP_ANYOF`, `COMPLEXITY_CAP_ENUM`, `COMPLEXITY_CAP_CONTAINS`, `COMPLEXITY_CAP_SCHEMA_SIZE`.
  **Clarification (normative).** `COMPLEXITY_CAP_PATTERNS` is **Generator‑only** (pattern‑witness search) and **MUST NOT** be emitted by Compose; see §19 “Phase separation”.
* Stagnation/budget guard: `UNSAT_BUDGET_EXHAUSTED`.
* If‑aware‑lite generation + `conditionals.strategy`, `minThenSatisfaction`.
* Early‑unsat extensions: `UNSAT_DEPENDENT_REQUIRED_AP_FALSE`, `UNSAT_PATTERN_PNAMES`.

<a id="s16-acceptance-p0"></a>
**Acceptance (P0)**

* On simple/medium profiles: `validationsPerRow ≤ 3`, `repairPassesPerRow ≤ 1` (p50).
* If‑aware‑lite reduces validations/row vs repair‑only on at least three conditional suites.
* Caps trigger degradations (no crashes); diagnostics emitted.
* **Bench CI:** p95 latency ≤ 120 ms and memory peak ≤ 512 MB on {simple, medium, pathological}
  with seeds `{1,42,4242}` (5 warmups + 20 runs). Failure ⇒ run failure.
* `AP:false × allOf` must‑cover enforced :
  - **Safe‑proof preference (Strict & Lax).** If the **Safe** set computed per §8 (ignoring non‑anchored and complexity‑capped patterns, including synthetic ones) is **non‑empty**, **do not** emit `AP_FALSE_UNSAFE_PATTERN`; restrict generation to **Safe**.
  - **Strict (otherwise).** When **Safe is empty _and presence pressure holds_**, and must‑cover would require a non‑anchored or regex‑complexity‑capped pattern (including §7 synthetic), **fail‑fast** with `AP_FALSE_UNSAFE_PATTERN`.
  - **Lax.** Warn `AP_FALSE_UNSAFE_PATTERN` and `AP_FALSE_INTERSECTION_APPROX`; proceed conservatively and do not generate keys outside the must‑cover set. **Raw `propertyNames.pattern` never triggers fail‑fast and remains gating‑only** (see §8).
* `contains` bag unsat rules enforced with `CONTAINS_UNSAT_BY_SUM` when applicable; generation re‑satisfies needs after `uniqueItems` de‑dup.
* External `$ref` produce `EXTERNAL_REF_UNRESOLVED` (strict=error, lax=warn).
* When `skipTrials` is active (or `oneOf` length exceeds threshold), branch selection is deterministic **score‑only** (stable index + seeded tie‑break); **implementations MUST record** `diag.scoreDetails.tiebreakRand` **even when `|T|=1`**, and set `diag.budget:{ tried:0, skipped:true, reason:... }` with `limit` computed per §8 Top‑K. **No trials are attempted.**

<a id="s16-phase-p1"></a>
### Phase P1

* Extra metrics (`validationsPerRow`, `repairPassesPerRow`) wired to bench harness.
* Bench CI: simple/medium/pathological profiles; track p50/p95.
* Docs: `Invariants.md`, `Known‑Limits.md`, Strict vs Lax table.
* Metrics extended: `branchCoverageOneOf`, `enumUsage`, `repairActionsPerRow` exported by bench harness.

<a id="s16-phase-p2"></a>
### Phase P2

* Contains bag subsumption improvements.
* Pattern approximation improvements for must‑cover (anchored unions, simple char classes).
* Diagnostic message hygiene.

---

<a id="s17-documentation-additions"></a>
## 17) Documentation Additions

<a id="s17-invariants-doc"></a>
* **Invariants.md** — Cross‑phase invariants (e.g., “validate against original schema”, “`enum/const` > `type`”, “must‑cover for `AP:false`”, “bag semantics for `contains`”).
<a id="s17-known-limits"></a>
* **Known‑Limits.md** — Partial features/approximations (non‑anchored patterns under `AP:false`, `$dynamicRef`).
<a id="s17-features-matrix"></a>
* **Features Matrix** — See §18.
<a id="s17-non-goals"></a>
* **Non‑Goals** — No remote deref of external `$ref`; no caching of generated data; scenario‑based / learned distributions are opt‑in extensions outside core guarantees (deterministic, AJV‑validated).

---

<a id="s18-matrix"></a>
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

<a id="s18-notes"></a>
### Notes

Rappels rapides: couverture stricte sans résolution distante des refs; `contains` utilise des besoins indépendants «bag»; réécritures `propertyNames` limitées aux cas d’équivalence stricte.

---

<a id="s19-diagnostics"></a>
## 19) Diagnostics (codes)

<a id="s19-envelope"></a>
### 19.0 Envelope (normative)

**Envelope (normative).** All diagnostics exported by **Normalize / Compose / Repair / Validate** have the shape `{ code:string, canonPath:string, details?:unknown }`.
The mini‑schemas in §19.1 constrain only the `details` payload. `canonPath` **MUST NOT** be duplicated inside `details`.

Public pointer key (normative).
All public outputs and diagnostics **MUST** use the `canonPath` key exclusively. The historical alias `canonPtr` **MUST NOT** appear in public outputs; implementations **MAY** accept it as an internal alias only.

**Severity (Compose only; normative).** Severity is conveyed by the container:
`diag.fatal[]` (hard errors that prevent generation at that `canonPath`) and `diag.warn[]` (non‑fatal notices; generation proceeds).
Entries in `diag.warn` carry the same `code`/`details` schema as their fatal counterparts.

<a id="s19-phase-separation"></a>
### Phase separation

Compose/coverage vs Generator: `REGEX_COMPLEXITY_CAPPED` **and `REGEX_COMPILE_ERROR`** are emitted during coverage analysis and §7 rewrites; `COMPLEXITY_CAP_PATTERNS` is emitted only by the Generator during pattern‑witness search. Do not mix the two; their payloads and phases are distinct.  
**Normalizer‑only codes:** `PNAMES_COMPLEX` and `PNAMES_REWRITE_APPLIED` are produced by the Normalizer (§7) and **MUST NOT** be emitted by Compose/Generator.

<a id="s19-payloads"></a>
### 19.1 Details payloads (normative)

Provide the following minimal JSON‑Schema‑like shapes for major codes. Only the `details` object is shown in each case.

```json
// AP_FALSE_UNSAFE_PATTERN (Compose fail‑fast)
{ "type":"object", "required":["sourceKind"],
  "properties":{
    "sourceKind":{"enum":["patternProperties","propertyNamesSynthetic"]}, // 'propertyNamesSynthetic' refers to §7 rewrite
    "patternSource":{"type":"string"}
}}
**Normative clarification.** When the fail‑fast is attributable to a **single** pattern, `details.patternSource` **MUST** be included and **MUST** be the JSON‑unescaped regex source. When multiple patterns jointly cause the fail‑fast, `patternSource` **MAY** be omitted.

// UNSAT_REQUIRED_AP_FALSE
{ "type":"object", "required":["requiredOut"],
  "properties":{ "requiredOut":{"type":"array","items":{"type":"string"}} }}

// UNSAT_AP_FALSE_EMPTY_COVERAGE
{ "type":"object", "properties":{
  "minProperties":{"type":"number"},
  "required":{"type":"array","items":{"type":"string"}}
}}

// UNSAT_PATTERN_PNAMES
{ "type":"object", "required":["enumSize"],
  "properties":{
    "enumSize":{"type":"number"},
    "patterns":{"type":"array","items":{"type":"string"}}
}}

// UNSAT_REQUIRED_PNAMES
{ "type":"object", "required":["requiredOut"],
  "properties":{
    "requiredOut":{"type":"array","items":{"type":"string"}},
    "enumSample":{"type":"array","items":{"type":"string"}}
}}

// UNSAT_MINPROPS_PNAMES
{ "type":"object", "required":["minProperties"],
  "properties":{"minProperties":{"type":"number"}}}

// CONTAINS_UNSAT_BY_SUM
{ "type":"object", "required":["sumMin"],
  "properties":{
    "sumMin":{"type":"number"},
    "maxItems":{"type":["number","null"]},
    "disjointness":{"enum":["provable","overlapUnknown"]}
}}

// TRIALS_SKIPPED_LARGE_ONEOF / TRIALS_SKIPPED_LARGE_ANYOF / TRIALS_SKIPPED_SCORE_ONLY
{ "type":"object", "properties":{
  "reason":{"enum":["largeOneOf","largeAnyOf","skipTrialsFlag","complexityCap"]}
}}

// COMPLEXITY_CAP_PATTERNS (generator witness search only)
{ "type":"object", "required":["reason"],
  "properties":{
    "reason":{"enum":["witnessDomainExhausted","candidateBudget"]},
    "alphabet":{"type":"string"},
    "maxLength":{"type":"number"},
    "tried":{"type":"number"}
}}
 // REGEX_COMPLEXITY_CAPPED (coverage analysis / §7 rewrite only)
{ "type":"object", "required":["patternSource","context"], "properties":{
  "patternSource":{"type":"string"},
  "context":{"enum":["coverage","rewrite"]}
}}

// REGEX_COMPILE_ERROR (coverage analysis / §7 rewrite only)
{ "type":"object", "required":["patternSource","context"], "properties":{
  "patternSource":{"type":"string"},
  "context":{"enum":["coverage","rewrite"]}
}}

// EXTERNAL_REF_UNRESOLVED
{ "type":"object", "properties":{
  "ref":{"type":"string"},
  "mode":{"enum":["strict","lax"]},
  "skippedValidation":{"type":"boolean"}
}}
**Normative constraint.** When `skippedValidation === true`, `mode` **MUST** be `'lax'`.

// AJV_FLAGS_MISMATCH
  { "type":"object", "required":["instance","diffs","ajvMajor"],
    "properties":{
      "instance":{"enum":["source","planning","both"]},
      "diffs":{"type":"array","items":{
        "type":"object","required":["flag","expected","actual"],
        "properties":{"flag":{"type":"string"},"expected":{},"actual":{}}}},
      "sourceFlags":{"type":"object"},
      "planningFlags":{"type":"object"}
  }}

// RAT_LCM_BITS_CAPPED
{ "type":"object", "required":["limit","observed"],
  "properties":{ "limit":{"type":"number"}, "observed":{"type":"number"} } }

// RAT_DEN_CAPPED
{ "type":"object", "required":["limit","observed"],
  "properties":{ "limit":{"type":"number"}, "observed":{"type":"number"} } }

// RAT_FALLBACK_DECIMAL
{ "type":"object", "required":["decimalPrecision"],
  "properties":{ "decimalPrecision":{"type":"number"} } }

// RAT_FALLBACK_FLOAT
{ "type":"object", "required":["decimalPrecision"],
  "properties":{ "decimalPrecision":{"type":"number"} } }

// CONTAINS_NEED_MIN_GT_MAX
{ "type":"object", "required":["min","max"],
  "properties":{ "min":{"type":"number"}, "max":{"type":"number"} } }

// MUSTCOVER_INDEX_MISSING
{ "type":"object", "properties":{
  "guard":{"type":"boolean"}
}}

// DYNAMIC_SCOPE_BOUNDED  (Compose-time note for bounded dynamicRef binding)
{ "type":"object", "required":["name","depth"],
  "properties":{
    "name":{"type":"string"},
    "depth":{"type":"number"}
}}

// EVALTRACE_PROP_SOURCE  (evidence that a newly introduced property is provably evaluated)
{ "type":"object", "required":["name","via"],
  "properties":{
    "name":{"type":"string"},
    "via":{"type":"array","minItems":1,"items":{
      "enum":["properties","patternProperties","additionalProperties","$ref","allOf","oneOf","anyOf","then","else"]
    }}
}}

// REPAIR_EVAL_GUARD_FAIL  (rename/addition blocked because not provably evaluated)
{ "type":"object", "required":["from","reason"],
  "properties":{
    "from":{"type":"string"},
    "to":{"type":"string"},
    "reason":{"enum":["notEvaluated"]}
}}

// AP_FALSE_INTERSECTION_APPROX
{ "type":"object", "properties":{
  "reason":{"enum":["coverageUnknown","nonAnchoredPattern","regexComplexityCap","regexCompileError","presencePressure"]},
   "requiredOut":{"type":"array","items":{"type":"string"}},
   "enumSize":{"type":"number"}
}}

// CONTAINS_BAG_COMBINED
{ "type":"object", "properties":{
  "bagSize":{"type":"number"},
  "sumMin":{"type":"number"},
  "maxItems":{"type":["number","null"]}
}}

// UNSAT_BUDGET_EXHAUSTED
{ "type":"object", "properties":{
  "cycles":{"type":"number"}, "lastErrorCount":{"type":"number"}
}}

// IF_AWARE_HINT_APPLIED
{ "type":"object", "properties":{
  "strategy":{"enum":["if-aware-lite"]},
  "minThenSatisfaction":{"enum":["discriminants-only","required-only","required+bounds"]}
}}

// IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO
{ "type":"object", "properties":{
  "reason":{"enum":["noDiscriminant","noObservedKeys"]}
}}

// PNAMES_REWRITE_APPLIED  (aligned with §7 logging)
{ "type":"object", "required":["kind"],
  "properties":{
    "kind":{"enum":["enum","pattern"]},
    "source":{"type":"string"}
}}

// PNAMES_COMPLEX
{ "type":"object", "required":["reason"],
  "properties":{
    "reason":{"type":"string"},
    "missingRequired":{"type":"array","items":{"type":"string"}}
}}
// Note: Implementations **SHOULD** use `details.reason:"UNEVALUATED_IN_SCOPE"` when a `propertyNames` rewrite is skipped
// because an `unevaluated*` keyword applies at or above the same instance location.

// COMPLEXITY_CAP_ONEOF  (compose-time cap on oneOf analysis/trials)
{ "type":"object", "required":["limit","observed"],
  "properties":{
    "limit":{"type":"number"},
    "observed":{"type":"number"}
}}

// ALLOF_SIMPLIFICATION_SKIPPED_UNEVALUATED / ANYOF_SIMPLIFICATION_SKIPPED_UNEVALUATED / ONEOF_SIMPLIFICATION_SKIPPED_UNEVALUATED (normalizer guard notes)
{ "type":"object", "properties":{
  "reason":{"enum":["unevaluatedInScope"]}
}}

// COMPLEXITY_CAP_ANYOF  (compose-time cap on anyOf analysis/trials)
{ "type":"object", "required":["limit","observed"],
  "properties":{
    "limit":{"type":"number"},
    "observed":{"type":"number"}
}}

// COMPLEXITY_CAP_ENUM  (compose-time cap on very large enum handling)
{ "type":"object", "required":["limit","observed"],
  "properties":{
    "limit":{"type":"number"},
    "observed":{"type":"number"}
}}

// COMPLEXITY_CAP_CONTAINS  (compose-time cap on contains-bag)
{ "type":"object", "required":["limit","observed"],
  "properties":{
    "limit":{"type":"number"},
  "observed":{"type":"number"}
}}

// COMPLEXITY_CAP_SCHEMA_SIZE  (compose-time cap on schema byte size)
{ "type":"object", "required":["limit","observed"],
  "properties":{
    "limit":{"type":"number"},
    "observed":{"type":"number"}
}}

// REPAIR_PNAMES_PATTERN_ENUM  (rename attempt driven by propertyNames.pattern exact-literal)
{ "type":"object", "required":["from"],
  "properties":{
    "from":{"type":"string"},
    "to":{"type":"string"},
    "mustCover":{"type":"boolean"}
}}

// REPAIR_RENAME_PREFLIGHT_FAIL  (rename candidate rejected by pre-flight)
{ "type":"object", "required":["from","to","reason"],
  "properties":{
    "from":{"type":"string"},
    "to":{"type":"string"},
    "reason":{"enum":["branch","dependent"]}
}}

// EXCLUSIVITY_TWEAK_STRING  (oneOf exclusivity string tweak used)
{ "type":"object", "required":["char"],
  "properties":{
    "char":{"enum":["\\u0000","a"]}
}}
```

**Normative note.** When a code appears in the list above, its `details` **MUST** validate against the corresponding mini‑schema. Other codes SHOULD follow the guidance already present in §8 (unsat hints) and §10 (repair logs).
**Normative note.** These caps are emitted by Compose (planning/analysis): `COMPLEXITY_CAP_ONEOF`, `COMPLEXITY_CAP_ANYOF`, `COMPLEXITY_CAP_ENUM`, `COMPLEXITY_CAP_CONTAINS`, `COMPLEXITY_CAP_SCHEMA_SIZE`. The `COMPLEXITY_CAP_PATTERNS` diagnostic remains reserved for Generator (pattern witness search), and `REGEX_COMPLEXITY_CAPPED` remains reserved for coverage/rewrite analysis. Do not mix their payloads.

**Normative constraint (regex payloads).** For `REGEX_COMPLEXITY_CAPPED`, `REGEX_COMPILE_ERROR`, and `AP_FALSE_UNSAFE_PATTERN` (when `patternSource` is present), the `details.patternSource`
MUST be the JSON‑unescaped regex source (see §8 “JSON‑unescaped regex source”). This aligns diagnostics with the textual
anchoring and complexity scans and guarantees byte‑for‑byte reproducibility.

`IF_REWRITE_DOUBLE_NOT`, `IF_REWRITE_SKIPPED_UNEVALUATED`, `IF_REWRITE_DISABLED_ANNOTATION_RISK`,
`ANNOTATION_IN_SCOPE_IF_REWRITE_SKIPPED`, `PNAMES_COMPLEX`, `DEPENDENCY_GUARDED`, `DYNAMIC_PRESENT`,
`DEFS_TARGET_MISSING`, `EXCLMIN_IGNORED_NO_MIN`, `EXCLMAX_IGNORED_NO_MAX`, `OAS_NULLABLE_KEEP_ANNOT`,
`NOT_DEPTH_CAPPED`, `RAT_LCM_BITS_CAPPED`, `RAT_DEN_CAPPED`, `RAT_FALLBACK_DECIMAL`, `RAT_FALLBACK_FLOAT`,
`TRIALS_SKIPPED_LARGE_ONEOF`, `TRIALS_SKIPPED_LARGE_ANYOF`, `TRIALS_SKIPPED_SCORE_ONLY`, `AP_FALSE_INTERSECTION_APPROX`, `CONTAINS_BAG_COMBINED`, `CONTAINS_UNSAT_BY_SUM`,
`COMPLEXITY_CAP_ONEOF`, `COMPLEXITY_CAP_ANYOF`, `COMPLEXITY_CAP_PATTERNS`,
`COMPLEXITY_CAP_ENUM`, `COMPLEXITY_CAP_CONTAINS`, `COMPLEXITY_CAP_SCHEMA_SIZE`, `REGEX_COMPLEXITY_CAPPED`, `REGEX_COMPILE_ERROR`,
`CONTAINS_NEED_MIN_GT_MAX`,
`UNSAT_PATTERN_PNAMES`, `UNSAT_DEPENDENT_REQUIRED_AP_FALSE`, `UNSAT_BUDGET_EXHAUSTED`,
`IF_AWARE_HINT_APPLIED`, `IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO`,
`EXTERNAL_REF_UNRESOLVED`, `UNSAT_REQUIRED_PNAMES`, `UNSAT_MINPROPS_PNAMES`, `UNSAT_REQUIRED_AP_FALSE`,
`UNSAT_AP_FALSE_EMPTY_COVERAGE`, `PNAMES_REWRITE_APPLIED`,
`AJV_FLAGS_MISMATCH`, `AP_FALSE_UNSAFE_PATTERN`, `MUSTCOVER_INDEX_MISSING`,
`EVALTRACE_PROP_SOURCE`, `REPAIR_EVAL_GUARD_FAIL`,
`EXCLUSIVITY_TWEAK_STRING`, `REPAIR_PNAMES_PATTERN_ENUM`, `REPAIR_RENAME_PREFLIGHT_FAIL`.

---

<a id="s20-testing-strategy"></a>
## 20) Testing Strategy

<a id="s20-unit"></a>
### Unit

* Normalizer transforms (golden tests, asserted `notes`).

* Composition merges:

  * Arrays: tuples, `items:false`, **bagged `contains`** with `min/maxContains` and `uniqueItems`.
  * Numbers: rational `multipleOf` with caps/fallbacks (aligned to AJV tolerance).
  * Objects: **must‑cover** for `AP:false` across `allOf`, pattern overlaps, pattern vs `propertyNames`.

* Disjointness/subset checks for `contains`:
  - integer vs number (not disjoint),
  - enum disjointness (∅),
  - subset-contradiction (min>0 vs max=0) with `schemaA ⊆ schemaB`.

* Early unsat detection (incl. `sum(min_i) > maxItems`, tuple maxLen, pattern/name contradictions).

* Branch selector scoring; determinism; Top‑K selection; skip‑trials path.

* Repair actions (idempotence; error reduction; rational snapping).
  **Note (clarification).** The labels below are **test case IDs** (not diagnostic codes).
  * **Test ID: RAT_EPSILON_LOG_EXCLUSIVE_FLOAT** — Given schema `{ "type":"number","exclusiveMinimum":0 }`, when repairing input value `0`, verify a `exclusiveMinimum` repair action includes `details.epsilon:"1e-12"` (with default `decimalPrecision`).
  * **Test ID: RAT_DELTA_LOG_EXCLUSIVE_INTEGER** — Given schema `{ "type":"integer","exclusiveMinimum":0 }`, when repairing input value `0`, verify a `exclusiveMinimum` repair action includes either `details.delta:1` (optional) or that `details.epsilon` is absent.

* Pointer mapping (longest‑prefix reverse map).

* Structural hashing for `uniqueItems` (collision buckets + `deepEqual`).

* CoverageIndex.enumerate order: for an object whose coverage is finite and provable, `compose(...).coverageIndex.get(canonPath)?.enumerate?.()` returns a deduplicated list sorted in UTF‑16 lexicographic order.

* S1 — AP:false rename guard:
  (a) `AP:false` + `propertyNames.enum`, `Compose.coverageIndex.has('b')===true` ⇒ rename `x→b`;
  (b) same schema but `has('b')===false` ⇒ no rename; delete or let AJV fail per rules;
  (c) verify logging `details.mustCover:true/false`.

* S2 — Pattern witness parameters:
  set `patternWitness.maxLength=1` ⇒ patterns with no witness produce `COMPLEXITY_CAP_PATTERNS{reason:'witnessDomainExhausted'}`;
  set `patternWitness.maxCandidates=10` ⇒ `COMPLEXITY_CAP_PATTERNS{reason:'candidateBudget', tried:10}`;
  Σ empty ⇒ immediate `witnessDomainExhausted` with `tried:0`.

* S3 — Details envelope: assert that `canonPath` is not duplicated inside `details` for the codes listed in §19.1.

* T‑DYN‑SAFE‑01 — `$dynamicRef` within the same document, ancestor chain contains a unique `$dynamicAnchor` with that name, no `$ref` on the ancestor path ⇒ Compose substitutes with fragment `$ref` and emits `DYNAMIC_SCOPE_BOUNDED{ name, depth≥1 }`.
* T‑DYN‑BLOCK‑01 — Same but with a `$ref` on the ancestor path ⇒ no substitution; still emit `DYNAMIC_PRESENT` (and MAY emit `DYNAMIC_SCOPE_BOUNDED` without substitution).
* T‑ENUM‑PP‑01 — `patternProperties: { "^(?:a|b)$": {} }` with `additionalProperties:false` ⇒ `compose(...).coverageIndex.get(objPath)?.enumerate?.()` returns `["a","b"]` (UTF‑16 ascending).
* T‑ENUM‑PP‑CAP‑01 — Same but with `k = complexity.maxEnumCardinality + 1` literals ⇒ `enumerate()` absent and `COMPLEXITY_CAP_ENUM{ limit, observed:k }` emitted.
* T‑ENUM‑PP‑REGEX‑01 — `patternProperties: { "^(?:a|b)+" : {} }` (quantified group) ⇒ no literals contributed; `REGEX_COMPLEXITY_CAPPED{context:'coverage'}` recorded; `enumerate()` absent.
* T‑ENUM‑PP‑COMPILE‑01 — Uncompilable pattern under `u` flag ⇒ `REGEX_COMPILE_ERROR{context:'coverage'}`; `enumerate()` absent.
* T‑ENUM‑PNAMES‑RAW‑01 — Finite intersection due only to raw `propertyNames.enum` (no §7 rewrite) ⇒ `enumerate()` absent.
* T‑UEP‑TRACE‑01 (unit) — Schema with `unevaluatedProperties:false`, local `properties:{a:{}}` and `patternProperties:{ "^b":{} }`. Generation must introduce only `a` and any `b...` keys after proving evaluation via `properties` or a compilable pattern; record `EVALTRACE_PROP_SOURCE` with `via` containing `'properties'` or `'patternProperties'` respectively.
* T‑UEP‑TRACE‑02 (integration) — `anyOf` with two branches; only branch‑1 validates the current candidate. Keys introduced under `unevaluatedProperties:false` may rely on applicators from branch‑1 only; MUST NOT rely on branch‑2 until it is known to validate. Confirm no key is emitted whose evaluation depends solely on branch‑2.
* T‑UEP‑TRACE‑03 (unit) — `patternProperties` has an uncompilable pattern under `u`. The generator must treat it as unknown gating for E‑Trace; do not use it as proof. (Compose/Normalize remain responsible for `REGEX_COMPILE_ERROR`.)
* T‑UEP‑REPAIR‑RENAME‑01 (integration) — Under `unevaluatedProperties:false`, attempt to rename `x → y` where `y` is not evaluated by any active applicator. Repair must refuse the rename and emit `REPAIR_EVAL_GUARD_FAIL{ from:"x", to:"y", reason:"notEvaluated" }`.
* T‑UEP‑REF‑01 (unit) — In‑document `$ref` to a subschema that declares `properties:{c:{}}`. Adding `c` under `unevaluatedProperties:false` is permitted only when the `$ref` applies at the same instance location; `EVALTRACE_PROP_SOURCE.via` must include `"$ref"`.
* T‑UEP‑APFALSE‑INTERPLAY‑01 (integration) — With `additionalProperties:false` effective and `unevaluatedProperties:false` at `O`, attempt to introduce a key `k` that is evaluated but not in the must‑cover intersection. Generation MUST NOT emit `k` even if `isEvaluated(O,k) === true`.
* T‑EXCL‑ASCII‑01 (unit) — With `conditionals.exclusivityStringTweak:'preferAscii'`, string tweaks use "a" first; log `EXCLUSIVITY_TWEAK_STRING{ char:'a' }`.
* T‑EXCL‑NUL‑01 (unit) — Default preference: use `\u0000` if accepted, otherwise fallback "a"; log the actual character used.
* T‑RENAME‑PREFLIGHT‑BRANCH‑01 (integration) — Schema with `oneOf` and selected branch `b*`. A rename `k→n` causes `b*` to fail while not excluding the other branch ⇒ pre‑flight rejects the rename; emit `REPAIR_RENAME_PREFLIGHT_FAIL{ reason:'branch' }`.
* T‑RENAME‑PREFLIGHT‑DEPENDENT‑01 (integration) — `dependentRequired: { k: ['d1'] }`. Renaming `k→n` without `d1` present ⇒ reject with `REPAIR_RENAME_PREFLIGHT_FAIL{ reason:'dependent' }`.
* T‑PNPAT‑RENAME‑OK‑01 (unit) — `propertyNames.pattern: "^(?:x|y)$"` (anchored‑safe, exact‑literal, not capped), `AP:false`, `coverageIndex.has('x')===true`, `isEvaluated(O,'x')===true` ⇒ rename `foo→x`; log `REPAIR_PNAMES_PATTERN_ENUM{ from:'foo', to:'x', mustCover:true }`.
* T‑PNPAT‑RENAME‑BLOCK‑COVER‑01 (unit) — Same pattern, but `coverageIndex.has('x')===false` ⇒ no rename (must‑cover blocks); log `REPAIR_PNAMES_PATTERN_ENUM{ from:'foo', mustCover:true }` (no `to`) or `deletedMustCoverRejected`.

<a id="s20-integration"></a>
### Integration

* Conditionals (with/without `unevaluated*`), nested; verify **no semantic drift** when not rewriting.
* Composition suites validated by AJV (original schema).
* Objects: `patternProperties` / `propertyNames` / `dependentSchemas` / `additionalProperties:false` across `allOf`.
  - Non-anchored patterns / patterns capped by complexity under `AP:false`:
    • **Strict:** hard failure with `AP_FALSE_UNSAFE_PATTERN`.
    • **Lax:** warn `AP_FALSE_UNSAFE_PATTERN` + `AP_FALSE_INTERSECTION_APPROX`, and no key generated outside must-cover.
  - **Safe‑proof fallback prevents fail‑fast**: AP:false + {unsafe pattern} + {properties covering at least one key} ⇒ Strict:
    no `AP_FALSE_UNSAFE_PATTERN`; generation restricted to the safe intersection; AJV passes.
  - **`enumerate()` absent when finiteness comes only from raw `propertyNames.enum`**: AP:false + no safe patterns +
    `propertyNames.enum:["a","b"]` (no §7 rewrite) ⇒ `coverageIndex.enumerate` is `undefined`.
  - **Rewrite‑enabled finiteness is enumerable**: AP:false + §7 rewrite (closed enum) ⇒ `coverageIndex.enumerate()` returns the
    exact finite set in UTF‑16 lex order, and `provenance` includes `'propertyNamesSynthetic'`.
  - **Raw `propertyNames.pattern` never triggers fail‑fast**: AP:false + `propertyNames.pattern:"^foo$"` (no rewrite) +
    no other safe recognizers ⇒ Strict: no `AP_FALSE_UNSAFE_PATTERN`; hints show `coverageUnknown`.
* `oneOf` overlap: after refinement, the selected branch is exclusive.
* External `$ref` (strict vs lax): validate emission of `EXTERNAL_REF_UNRESOLVED` and mode-specific behavior (error vs warn + attempt).
* Score-only path: when `skipTrials=true` or for large `oneOf`, selection is deterministic (stable index + seeded tie-break), with zero trials attempted.
* Repair logs include `origPath` derived from `ptrMap` for each action.
* Conditionals with `unevaluated*` in scope: safe rewrite is blocked; `IF_REWRITE_SKIPPED_UNEVALUATED` present.

* Determinism guard: with identical `(seed, options, AJV flags)` and `repair.mustCoverGuard:true`, rename outcomes are stable across runs; toggling `repair.mustCoverGuard:false` changes behavior and also changes the cache subkey (see §14).

* REGEX vs PATTERN caps separation: provoke `REGEX_COMPLEXITY_CAPPED{context:'coverage'}` (must‑cover analysis) and `COMPLEXITY_CAP_PATTERNS{...}` (generator); ensure they are emitted in the correct phases only.

* Caps payloads: trigger each of `COMPLEXITY_CAP_ONEOF / _ANYOF / _ENUM / _CONTAINS / _SCHEMA_SIZE` and validate that `details` conforms to `{limit, observed}`; separately trigger `COMPLEXITY_CAP_PATTERNS` and `REGEX_COMPLEXITY_CAPPED` to confirm their distinct payloads and phases.

* **Negative config test (AJV flags):** force `unicodeRegExp:false` on either AJV instance ⇒ hard failure with `AJV_FLAGS_MISMATCH`.
* **AP:false unsafe‑pattern tests:**
  - `AP:false` + non‑anchored pattern (e.g., `"^foo"`) in coverage ⇒ Strict: fail with `AP_FALSE_UNSAFE_PATTERN`;  
    Lax: warn `AP_FALSE_UNSAFE_PATTERN`, continue conservatively with `AP_FALSE_INTERSECTION_APPROX`.
  - `AP:false` + pattern exceeding regex complexity cap (length/nested quantifiers) ⇒ same expectations as above.

<a id="s20-bench-ci"></a>
### Bench / CI

* Profiles: **simple**, **medium**, **pathological**.
* Track p50/p95, `validationsPerRow`, `repairPassesPerRow`, caps triggers, memory peak.
* Alert on regressions beyond thresholds.

<a id="s20-metamorphic"></a>
### Metamorphic / Equivalence

* Compare `conditionals.strategy='if-aware-lite'` vs `'repair-only'` on the same seed:

  * Final instances valid in both modes.
  * Differences allowed only in metrics (fewer validations/row targeted in if‑aware).

---

<a id="s21-risks"></a>
## 21) Risks & Mitigations

<a id="s21-mitigations"></a>
* **Conditional rewrite semantics** → Default no‑rewrite (`rewriteConditionals:'never'`); strict guards; limited `not` depth; AJV final validation.
* **Trials on large `oneOf`** → Top‑K, skip‑trials threshold, budgets/metrics.
* **Rational arithmetic growth** → Bit/LCM/denominator caps; documented fallbacks; diagnostics.
* **Cache hashing cost** → WeakMap → `$id` → size‑gated stableHash; LRU.
* **Pattern overlap complexity** → Heuristic; toggle; diagnostics.
* **`AP:false` across `allOf`** → Must‑cover intersection with conservative approximations (`AP_FALSE_INTERSECTION_APPROX`).
* **`contains` across `allOf`** → Bag semantics, unsat checks (`CONTAINS_UNSAT_BY_SUM`), targeted generation.
* **Budget loops** → Stagnation guard (`UNSAT_BUDGET_EXHAUSTED`).

---

<a id="s22-deliverables"></a>
## 22) Deliverables (Code)

<a id="s22-packages-core"></a>
* `packages/core/src/transform/schema-normalizer.ts`
* `packages/core/src/transform/composition-engine.ts`
* `packages/core/src/generator/foundry-generator.ts` (wire‑in)
* `packages/core/src/repair/repair-engine.ts`
  - emits repair actions with `canonPath` and `origPath` (via `ptrMap`).
* `packages/core/src/parser/json-schema-parser.ts` (lean checks)
* `packages/core/src/util/ptr-map.ts` (ptr map + reverse map by path walk)
* `packages/core/src/util/rational.ts` (exact rational helpers with caps/fallback + BigInt‑safe JSON)
* `packages/core/src/util/rng.ts` (seeded RNG; no global state)
* `packages/core/src/util/struct-hash.ts` (structural hashing for `uniqueItems`)
* `packages/core/src/util/metrics.ts` (per‑phase timings, counters, validations/row)
  - exports counters for `branchCoverageOneOf`, `enumUsage`, `repairActionsPerRow`.
* `packages/core/src/util/stable-hash.ts` (optional; size‑gated)
<a id="s22-scripts"></a>
* `scripts/bench.ts`
<a id="s22-docs"></a>
* Docs: `README.md`, `error.md`, `CHANGELOG.md`, `Invariants.md`, `Known-Limits.md`

---

<a id="s23-appendix"></a>
## 23) Appendix — Minimal Interfaces (illustrative)

<a id="s23-plan-options"></a>
```ts
// Plan options 
export interface PlanOptions {
  // Normalization
  /** DEPRECATED: pass-through to Normalize only; excluded from PlanOptionsSubKey; Compose/Generate/Repair MUST ignore. */
  rewriteConditionals?: 'never' | 'safe' | 'aggressive'; // default: 'never'
  debugFreeze?: boolean;

  // Arithmetic
  rational?: {
    maxRatBits?: number;
    maxLcmBits?: number;
    qCap?: number;
    fallback?: 'decimal' | 'float'; // default: 'decimal'
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
    /** Dynamic-scope upward search bound for $dynamicRef (normative; used by §12). Default: 2. */
    maxDynamicScopeHops?: number;    // default: 2
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

  // Patterns under AP:false
  patternPolicy?: {
    /**
     * Reaction to non-anchored/complex patterns when they would be required for must-cover proofs under AP:false.
     * Strict default: 'error'; Lax default: 'warn'.
     */
    unsafeUnderApFalse?: 'error' | 'warn';
  };

  // Conditionals
  conditionals?: {
    strategy?: 'if-aware-lite' | 'repair-only' | 'rewrite'; // 'rewrite' is a DEPRECATED alias of 'if-aware-lite'
    // Normative: passing 'rewrite' here MUST NOT trigger any Normalizer rewrite; only
    // NormalizeOptions.rewriteConditionals controls rewrites (see §7). Cache keys canonicalize
    // 'rewrite' to 'if-aware-lite' per §14 to avoid divergence.
    minThenSatisfaction?: 'discriminants-only'|'required-only'|'required+bounds';
    /** Controls string tweak order in oneOf exclusivity (normative). Default: 'preferNul'. */
    exclusivityStringTweak?: 'preferNul' | 'preferAscii';  // default: 'preferNul'
  };

  // Repair
  repair?: {
    /**
     * Default: true.
     * When false, Repair MUST NOT rename under AP:false even if ctx.isNameInMustCover exists.
     */
    mustCoverGuard?: boolean;
  };

  // Pattern witness (generator)
  patternWitness?: {
    alphabet?: string;      // default: "abcdefghijklmnopqrstuvwxyz0123456789_-"
    maxLength?: number;     // default: 12  (bounds the number of Unicode code points per candidate)
    maxCandidates?: number; // default: 32768
  };
}
```

<a id="s23-normalize-interfaces"></a>
```ts
// Normalizer
export interface NormalizeOptions {
  rewriteConditionals?: 'never' | 'safe' | 'aggressive';
  debugFreeze?: boolean;
  /** Defaults: guards.maxGeneratedNotNesting = 2 (aligns with PlanOptions). */
  guards?: { maxGeneratedNotNesting?: number }; // default: 2
}
export interface NormalizeResult {
  schema: any;
  ptrMap: Map<string, string>;
  revPtrMap: Map<string, string[]>;
  notes: Array<{
    canonPath: string;
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

<a id="s23-compose-interfaces"></a>
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
  seed?: number; // default: 1 (deterministic; see §15 RNG)
  budget?: number;
  trials?: PlanOptions['trials'];
  guards?: PlanOptions['guards'];
  rational?: PlanOptions['rational'];
  disablePatternOverlapAnalysis?: boolean;
  complexity?: PlanOptions['complexity'];
  /**
   * Optional memoization *salt* for deterministic branch selection without trials.
   * Implementations MUST NOT use the returned value as the full memo key. The final
   * key MUST incorporate (canonPath, seed, AJV.major, AJV.flags, PlanOptionsSubKey)
   * in addition to this salt; see §14 for the normative composition.
   */
  selectorMemoKeyFn?: (canonPath: string, seed: number, opts?: PlanOptions) => string; // user-provided salt only
}

export function compose(schema: any, opts?: ComposeOptions): {
  schema: any;                     // effective view (must-cover + bagged contains)
  containsBag?: ContainsNeed[];
  coverageIndex: Map<string, {
    has: (name: string) => boolean;
    /** Provided iff the global must‑cover intersection is provably finite using only:
     *  (a) named `properties`,
     *  (b) exact‑literal anchored‑safe patterns (user‑authored), and/or
     *  (c) §7 synthetic exact‑literal patterns when PNAMES_REWRITE_APPLIED is recorded.
     *  MUST NOT be provided when finiteness stems solely from a raw `propertyNames.enum`. */
    enumerate?: () => string[];
    /** When present, **MUST** be de‑duplicated and sorted in UTF‑16 lexicographic order before export (see §8). */
    provenance?: ('properties'|'patternProperties'|'propertyNamesSynthetic')[];
  }>;
  diag?: {
    // Fatal diagnostics recorded during Compose (e.g., AP_FALSE_UNSAFE_PATTERN fail-fast at an object node).
    // Presence of any entry indicates the affected canonPath MUST NOT be generated.
    fatal?: Array<{ code: string; canonPath: string; details?: unknown }>;
    // Non-fatal diagnostics (e.g., AP_FALSE_UNSAFE_PATTERN in Lax mode). Do not block generation.
    warn?: Array<{ code: string; canonPath: string; details?: unknown }>;
    unsatHints?: Array<{
      code: string;
      canonPath: string;
      provable?: boolean;
      reason?: string;
      details?: unknown;
    }>;
    chosenBranch?: { kind:'anyOf'|'oneOf', index:number, score:number };
    overlap?: { kind:'oneOf', passing: number[], resolvedTo?: number };
    overlaps?: { patterns?: Array<{ key: string, patterns: string[] }> };
  // **Normative (contract).** At any branch node (anyOf/oneOf), implementations **MUST** set `scoreDetails`
  // to a concrete object (not `undefined`) that includes `orderedIndices` and `topScoreIndices`, even when
  // `branches.length === 1` (both MUST be `[0]`). `tiebreakRand` is REQUIRED in score‑only (always, even when |T|=1)
  // and whenever RNG is used for **selection** (ties). It MAY be undefined only when (a) RNG was not used for selection
  // and trials occurred, or (b) RNG was used only in `oneOf` step‑4 exclusivity and is recorded in `exclusivityRand`.
  // Compose sets `exclusivityRand` undefined; later phases populate it at the same canonPath.
  // When invoked on a non‑branch node, implementations **MUST** set `scoreDetails === undefined`.
    scoreDetails?: {
      orderedIndices: number[];
      topScoreIndices: number[];
      /**
       * Normative: REQUIRED in score‑only (always, even when |T|=1) and REQUIRED whenever RNG is used for
       * SELECTION (tie‑breaks). If RNG is used only for oneOf step‑4, record `exclusivityRand` and keep
       * this undefined. MAY be omitted only when (a) RNG was not used for selection and trials occurred, or
       * (b) RNG was used only for oneOf step‑4 exclusivity and is recorded in `exclusivityRand`. See §8.
       */
      tiebreakRand: number | undefined;
      exclusivityRand?: number; // produced by Generate/Repair during oneOf step‑4; Compose sets undefined
      scoresByIndex?: Record<string, number>;
    };
    budget?: { tried: number; limit: number; skipped?: boolean; reason?: string };
    metrics?: Record<string, number>; // see §15
    /** Compose-time caps only. **Normative:** when present, `caps` MUST be a subset of
     *  { 'COMPLEXITY_CAP_ONEOF','COMPLEXITY_CAP_ANYOF','COMPLEXITY_CAP_ENUM','COMPLEXITY_CAP_CONTAINS','COMPLEXITY_CAP_SCHEMA_SIZE' };
     *  exclude generator-only 'COMPLEXITY_CAP_PATTERNS'; de-duplicate and sort UTF‑16 ascending. See §8. */
    caps?: string[];
  };
};
```

<a id="s23-repair-interfaces"></a>
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
  /** must‑cover query exported by Compose; see §8 “Repair binding”. */
  isNameInMustCover?: (canonPath: string, name: string) => boolean;
}
export function repair(
  item: unknown,
  schema: any,
  errors: AjvErr[],
  ctx: RepairCtx
): {
  item: unknown;
  changed: boolean;
  actions?: Array<{
    keyword: string;
    canonPath: string;
    origPath?: string; // mapped via ptrMap
    details?: any;
  }>;
  diag?: { budgetExhausted?: boolean }
};
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
  // stable: score desc, then index asc
  return scored
    .sort((a,b)=> (b.score - a.score) || (a.idx - b.idx))
    .slice(0, k);
}
```

```ts
// Longest‑prefix reverse pointer mapping (O(depth))
// mapCanonToOrig: Map<string /* canonical ptr */, string /* original ptr */>
export function toOriginalByWalk(canonPath: string, mapCanonToOrig: Map<string,string>): string|undefined {
  let p = canonPath;
  while (true) {
    if (mapCanonToOrig.has(p)) return mapCanonToOrig.get(p)!;
    const i = p.lastIndexOf('/');
    if (i <= 0) return undefined;
    p = p.slice(0, i);
  }
}
```

<a id="norms-references"></a>
## 24) Norms & References

<a id="s24-normative"></a>
### 24.1 Normative References

* **[RFC2119] / [RFC8174]** — *Key words for use in RFCs to Indicate Requirement Levels.*
  **Used for:** requirement language MUST / SHOULD / MAY.

* **[RFC8259]** — *The JavaScript Object Notation (JSON) Data Interchange Format.*
  **Used for:** definition of JSON for inputs/outputs and diagnostic payloads.

* **[JSON-SCHEMA-2020-12]** — *JSON Schema draft 2020-12* (Core, Validation, Applicator, Unevaluated, Format Annotation vocabularies).
  **Used for:** keyword semantics and the target dialect (`allOf/anyOf/oneOf/not`, `if/then/else`, `unevaluated*`, `properties/patternProperties/additionalProperties`, `contains`, `dependent*`, `$id/$anchor`, `format`).

* **[RFC6901]** — *JSON Pointer.*
  **Used for:** pointer syntax (`/…`) in `canonPath` and diagnostics.
  *Note:* `ptrMap` and `revPtrMap` are constructs defined by this specification, not by RFC6901.

* **[RFC3986]** — *Uniform Resource Identifier (URI): Generic Syntax.*
  **Used for:** resolution rules of `$id` and `$ref` (internal vs external). No network I/O.

* **[RFC8785]** — *JSON Canonicalization Scheme (JCS).*
  **Used for:** canonical key ordering and deterministic content hashing.

* **[FIPS-180-4]** — *Secure Hash Standard (SHS).*
  **Used for:** SHA-256 in `contentHash` and structural de-duplication.

* **[ECMA-262]** — *ECMAScript Language Specification (latest edition).*
  **Used for:** RegExp Unicode semantics (`u` flag, `unicodeRegExp:true`) and lexicographic ordering by UTF-16 code units.

* **[SemVer-2.0.0]** — *Semantic Versioning 2.0.0.*
  **Used for:** versioning of this specification and the software.

<a id="s24-informative"></a>
### 24.2 Informative References

* **[ECMA-404]** — *The JSON Data Interchange Syntax.* (complements RFC8259)
* **[UTS-18]** — *Unicode Technical Standard #18: Unicode Regular Expressions.* (background)
* **[UAX-15]** — *Unicode Normalization Forms.* (background)
* **[AJV-v8]** — AJV v8.x documentation (background on flags such as `unicodeRegExp`, `validateFormats`)
* **[FNV-1a]** — Fowler–Noll–Vo hash, 1a variant (background; `fnv1a32` is restated normatively in this spec)

<a id="s24-alignment"></a>
### 24.3 Reference-to-Section Alignment

| Ref                 | Applies to                                                                          |
| ------------------- | ----------------------------------------------------------------------------------- |
| RFC2119/8174        | global requirement language (keywords)                                              |
| RFC8259             | §§5, 7, 8–10, 14–15 (JSON I/O, diagnostics, structural hashing inputs)              |
| JSON-SCHEMA-2020-12 | §§6–13, 18 (keyword semantics, dialect, metaschemas)                                |
| RFC6901             | §§7, 8, 10, 19 (pointer syntax in `canonPath`; `ptrMap`/`revPtrMap` are spec-local) |
| RFC3986             | §§11–12 (`$ref` URI resolution; no external I/O)                                    |
| RFC8785             | §7 (Pass Order & Dev safety) and §15 (canonicalization, content hash)               |
| FIPS-180-4          | §§10, 15 (SHA-256 usage)                                                            |
| ECMA-262            | §9 (strings/RegExp), lexicographic sort rules                                       |
| SemVer-2.0.0        | document header, versioning                                                         |
