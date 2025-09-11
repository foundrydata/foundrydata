# Feature Support Simplification Plan — Canonical Spec

**Status:** Implementation spec  
**Version:** 0.9.0 (2025‑09‑11)  
**Audience:** JSON Schema & AJV practitioners, library contributors

---

## Terminology (preamble — quick ref)

- **Original schema** — Source of truth for AJV validation. Generation never replaces it.
- **Canonical view** — Internal 2020‑12‑like shape produced by *Normalize*; non‑destructive.
- **Effective view** — Planning view produced by *Compose*; applies must‑cover under `additionalProperties:false` and “bag `contains`”.
- **AP:false** — Shorthand for `additionalProperties:false`.
- **Anchored‑safe pattern** — Regex with unescaped `^…$` and no look‑around/back‑references (normative test in §8).

---

## 1) Goal

Extend JSON Schema feature coverage **without** scattering per‑feature branches in code paths, while **always** validating each generated **instance** against the **original schema** with AJV. Keep the pipeline deterministic, observable, and budget‑aware.

### Acceptance (observable)

- **AJV validation on the original schema** for every instance.  
  *Signal:* final validation passes; `diag.metrics.validationsPerRow ≥ 1`.
- **No network I/O for external `$ref`** (strict by default).  
  *Signal:* `EXTERNAL_REF_UNRESOLVED` (Strict = error; Lax = warn).
- **Deterministic outcomes for a given `(seed, options)`**.  
  *Signal:* stable `diag.chosenBranch`, `diag.scoreDetails.tiebreakRand` at the same canonical pointers.
- **Documented budgets with explicit degradations**.  
  *Signal:* `COMPLEXITY_CAP_*` diagnostics and populated `diag.budget`.

> **Conventions.** RFC2119/8174 keywords (MUST/SHOULD/MAY) are normative.  
> “Instance” = generated JSON value validated against the schema.

---

## 2) Scope

**In‑scope.** Parser, normalization (**canonical view**), composition/planning (**effective view**), generation, repair, validation, documentation, benchmarking.

**Non‑goals (core).**

- Remote dereferencing of external `$ref` (no network/filesystem I/O).
- Caching of **generated instances** across runs.
- Learned/scenario‑based distributions (optional extensions outside core guarantees).

**Environment & drafts.**

- Runtime: Node.js ≥ 18.  
- Validator: AJV v8 with `unicodeRegExp:true`.  
- Drafts: input schemas may use draft‑04..2020‑12+; internal canonicalization targets a 2020‑12‑like shape; validation always runs against the **original** schema.

**Modes (quick view; details §11).**

| Mode   | External `$ref`             | Behavior & signal                         |
|--------|-----------------------------|-------------------------------------------|
| Strict | No I/O; unresolved ⇒ error  | Emit `EXTERNAL_REF_UNRESOLVED`            |
| Lax    | No I/O; unresolved ⇒ warn   | Emit `EXTERNAL_REF_UNRESOLVED` (warn) and attempt local generation |

---

## 3) Principles & Invariants (summary)

**Core principles (normative).**

- **AJV is the oracle (MUST).** Validate against the **original** schema, not internal transforms.  
- **Deterministic (MUST).** Seeded RNG, bounded attempts, no global state.  
- **No remote deref (MUST).** External `$ref` never trigger I/O.  
- **Simplicity & separation.** A small number of predictable phases; narrow responsibilities per phase.  
- **Observability by default.** Metrics, budgets, and diagnostics are first‑class.

**Invariants (introductory; details in §7–§9).**

- **Must‑cover under `additionalProperties:false`.** When any conjunct sets `additionalProperties:false`, keys are drawn from **provable coverage** only (named `properties` plus **anchored‑safe** `patternProperties`). `propertyNames` acts as a **filter** and **only becomes a coverage source when** the §7 rewrite has been applied (`PNAMES_REWRITE_APPLIED`) **and** `additionalProperties` is **absent/true/{ }** at that object (never when it is `false`). See §7–§8.
- **`contains` across `allOf` uses bag semantics.** Independent needs `{schema,min,max}` with early unsat checks. See §8–§9.
- **Determinism boundaries.** No caching of generated data; caching is limited to compiled/plan artifacts and keyed by AJV version/flags and plan options. See §14–§15.

> **Note.** The precise definition of **anchored‑safe** regex and the rules for when `propertyNames` can contribute to coverage are normative in §8.

---

## 4) Operational guidance

- **Pipeline clarity.** `Normalize → Compose → Generate → Repair → Validate`.
- **Fail early when provable, degrade gracefully when not.**
- **Expose observability.** Per‑phase timings and counts (e.g., validations/instance, repairs/instance).
- **Keep outcomes independent of wall‑clock, locale, and environment.** (See §15.)

---

## 5) Configuration Overview (reader’s map)

Defaults are conservative. Full option types and defaults are in **§23**. Mode behavior is in **§11**.
This table summarizes the “big knobs” and their intent (details and edge‑cases in the referenced sections).

| Area                 | Key option (default)                                 | Intent (one‑liner)                                                                    | Details |
|----------------------|------------------------------------------------------|---------------------------------------------------------------------------------------|---------|
| Conditionals         | `rewriteConditionals: 'never'`                       | Do not rewrite `if/then/else`; generator is **if‑aware‑lite**                         | §7, §9  |
| Trials & selection   | `trials.perBranch=2`, `maxBranchesToTry=12`          | Deterministic scoring + bounded attempts; score‑only when large                       | §8, §15 |
| Numbers / multipleOf | `rational.decimalPrecision=12`, `fallback:'decimal'` | Exact rationals with caps; AJV‑aligned tolerance on fallback                          | §8      |
| Output encoding      | `encoding.bigintJSON:'string'`                       | Control BigInt in **data outputs** (logs always stringify)                            | §9, §10 |
| Guards & caps        | `complexity.*` (various)                             | Bound search/analysis; emit diagnostics when capping                                  | §8, §15 |
| Modes                | **Strict** (default)                                 | External `$ref`: error (no I/O). **Lax**: warn then attempt local generation          | §11     |
| Caching              | `cache.*`                                            | Cache compiles/plans (not instances); keys include AJV major + flags + options subkey | §14     |

**Precedence & compatibility.** Mode (Strict/Lax) defines the baseline; specific `failFast` overrides refine it (see §11).  
**Note on “aggressive”.** The legacy `rewriteConditionals:'aggressive'` is treated as the same as `'safe'` and is kept for compatibility; the default remains `'never'` (see §7/§23).

---

## 6) High‑Level Architecture

**Phases.**

- **Normalize** — Draft‑aware canonicalization to a 2020‑12‑like **canonical view**. The original schema is preserved for validation.
- **Compose** — Build an **effective view** used by the generator: resolve composition, apply must‑cover (`AP:false`) and bag `contains`; do not mutate the canonical view.
- **Generate** — Produce a minimal instance that satisfies the effective constraints; deterministic (seeded) choices.
- **Repair** — AJV‑driven, budgeted corrections with a `(keyword → action)` registry; idempotent.
- **Validate** — Final AJV validation against the **original** schema; the pipeline fails on non‑compliance.

**Mini example (illustrative — AP:false + conditionals).**

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
````

* **Normalize** keeps the original and prepares a canonical form (no conditional rewrite by default).
* **Compose** recognizes `AP:false` and computes the **must‑cover** keys `{a1,b1}` from the anchored pattern.
* **Generate** picks `kind` and the matching required key (`a1` or `b1`) deterministically.
* **Validate** runs on the original schema; any drift is caught and repaired within budget.

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

**Glossary (summary).**

* **Original schema** — Source of truth for AJV validation.
* **Canonical view** — Internal 2020‑12‑like shape produced by Normalize; non‑destructive.
* **Effective view** — Composition/planning result used by the generator (must‑cover and `contains` bagging applied).
* **Anchored‑safe pattern** — Regex with unescaped `^…$` and no look‑around/back‑references (textual test; full rule in §8).
* **Presence pressure** — Situation where `minProperties > 0` or some `required` keys must appear; used by early‑unsat rules (see §8).
* **Seeded RNG** — Local, deterministic tie‑breaks; no global mutable state (see §15).

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
   * Tuples: `items:[...]`→`prefixItems:[...]`; `additionalItems:false`→`items:false`; `additionalItems:S`→`items:S`; `additionalItems:true`→`items:true`.
   * OpenAPI interop: `nullable:true` + `type` ⇒ `type:[..., "null"]`; else keep as annotation `OAS_NULLABLE_KEEP_ANNOT`.

2. **References**

   * Preserve local `#...`; rewrite `#/definitions/...`→`#/$defs/...` if target exists; note `DEFS_TARGET_MISSING` otherwise.
   * Don’t cross `$id` boundaries; keep anchors/dynamic anchors intact; no cycle expansion.

3. **Boolean / trivial simplifications (normative)**

   * **allOf**: remove `true` operands; if any operand is `false`, the result is `false`.
   * **anyOf**: remove `false` operands; if any operand is `true`, the result is `true`.
   * **oneOf**: remove `false` operands. If, after removal, the arity is exactly 1, replace `oneOf [S]` with `S`
     (including `S:true`). Otherwise (**arity ≥ 2**), **MUST NOT** fold when any operand is `true`. Keep `oneOf` unchanged.
   * Drop empty arrays per operator identity: `allOf [] ⇒ true`, `anyOf [] ⇒ false`, `oneOf [] ⇒ false`.
   * Normalize `enum`↔`const` (size‑1) for planning only.

4. **Conditionals (`if/then/else`)**

   * **Default**: no rewrite (`rewriteConditionals:'never'`).
   * **`safe` rewrite** (double negation) only when strictly safe (normative):

     * **Block** if any `unevaluatedProperties/unevaluatedItems` is in scope or ancestor scope. **MUST NOT** rewrite and **MUST** emit `IF_REWRITE_SKIPPED_UNEVALUATED` at the conditional's canonical path.
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
   * Cap nested `not` by `guards.maxGeneratedNotNesting` (note `NOT_DEPTH_CAPPED`).

5. **Dependencies / dependents**

   * **No conditional rewrites.** Do not convert dependents into `if/then/else`. Use only the annotation‑safe `anyOf` guard form.
   * **Normative guard form (dependentRequired):** for each mapping `k -> [d1,...,dn]`, the guarded equivalent is:
     ```json
     { "anyOf": [ { "not": { "required": ["k"] } }, { "required": ["k","d1", "...", "dn"] } ] }
     ```
     Apply only when no `unevaluated*` is in scope.
   * Don’t rewrite when any `unevaluated*` is in scope. Note `DEPENDENCY_GUARDED`.

6. **Object keywords**

   * Preserve `patternProperties`, `propertyNames`, `additionalProperties`.
   * `propertyNames` rewrite (only when strictly equivalent and when no `unevaluated*` is in scope). **MUST Preconditions (normative) for equivalence**:
     1) **Global guard:** No `unevaluated*` applies at or above the object (unchanged).
    2) **Closed‑enum form:** Every key in `properties` **and in `required`** is a member of the enum **and** there are no `patternProperties` **or** each existing `patternProperties` pattern is anchored‑safe and provably a subset of the enum via **exact‑literal‑alternatives** (see Glossary): the pattern source, after JSON unescape, is exactly `^(?:L1|...|Lk)$` with each `Li` a literal alternative (metacharacters escaped) and `{L1,...,Lk} ⊆ enum`. If this cannot be proven, **do not rewrite** and emit `PNAMES_COMPLEX` (detail: `REQUIRED_KEYS_NOT_COVERED` when applicable).
    3) **Anchored‑pattern form:** `P` is anchored‑safe per §8 and not capped by the regex complexity rule; every key in `properties` **and in `required`** matches `P`, and there are **no** `patternProperties`. Otherwise, **do not rewrite** and emit `PNAMES_COMPLEX`; when the failure is due to complexity capping also emit `REGEX_COMPLEXITY_CAPPED`.
    4) **AdditionalProperties safety:** `additionalProperties` at this object is absent, `true`, or `{}`. If `additionalProperties` is a non‑trivial schema, **do not rewrite** and emit `PNAMES_COMPLEX` with detail `'ADDITIONAL_PROPERTIES_SCHEMA'`.
    5) When the above hold, the rewrite is **additive in the canonical view** (the original `propertyNames` remains alongside the added constraints); otherwise preserve the original `propertyNames` only.
    6) **Logging (normative):** On successful rewrite the normalizer **MUST** record a note `PNAMES_REWRITE_APPLIED` at this object’s canonical path with `details:{ kind:'enum'|'pattern', source?:string }`. Implementations **MAY** include the JSON‑unescaped regex `source` in `details.source` for the pattern case. This signal gates coverage usage in §8.
     * **Closed enum** form (additive canonicalization):
       Given `{"propertyNames":{"enum":[n1,...,nk]}}`, rewrite to:
       ```json
       { "patternProperties": { "^(?:n1|...|nk)$": {} }, "additionalProperties": false }
       ```
     where each `ni` is escaped as a literal in the regex. Values remain unconstrained by this rewrite.
       **Equivalence note:** Under preconditions (2)–(4), `propertyNames` already forbids any non‑member key; adding `additionalProperties:false` is semantically redundant for key admission and enables must‑cover analysis (§8) without affecting AJV validation (original schema preserved). The added `patternProperties` entry is **synthetic** and only considered for coverage when `PNAMES_REWRITE_APPLIED` is present.
     * **Anchored‑safe pattern** form (additive canonicalization):
     Given `{"propertyNames":{"pattern": P}}` with `P` anchored‑safe (see §8 “Anchored pattern”), rewrite to:
      ```json
      { "patternProperties": { "P": {} }, "additionalProperties": false }
      ```
     The added `patternProperties` entry is **synthetic** and may be consumed by §8 must‑cover only when the normalizer emitted `PNAMES_REWRITE_APPLIED`.
     * **Counterexample (normative, refusal):** Given `{ "propertyNames": { "pattern": "^foo" } }` (no trailing `$`),
       a naive rewrite to `{ "patternProperties": { "^foo$": {} }, "additionalProperties": false }` **narrows** admitted names by
       excluding `"foobar"`, which the original permits. Because the pattern is **not anchored‑safe**, preconditions fail and the rewrite
       **MUST NOT** occur; emit `PNAMES_COMPLEX`.
     * **Do not rewrite** if any `unevaluated*` applies at or above the object **or** any precondition above fails: emit `PNAMES_COMPLEX` (with detail when available).
     * The rewrite is additive **only** under the stated preconditions; the original schema is preserved for AJV validation.

7. **Pass‑through**

   * `$dynamicRef/$dynamicAnchor/$recursiveRef` untouched; note `DYNAMIC_PRESENT`.

8. **Dev safety**

   * Optional deep‑freeze when `debugFreeze` and not `disableDeepFreeze`.

**Normalizer note codes (non‑exhaustive)**:
`IF_REWRITE_DOUBLE_NOT`, `IF_REWRITE_SKIPPED_UNEVALUATED`, `ANNOTATION_IN_SCOPE_IF_REWRITE_SKIPPED`,
`IF_REWRITE_DISABLED_ANNOTATION_RISK`, `PNAMES_COMPLEX`, `DEPENDENCY_GUARDED`, `DYNAMIC_PRESENT`,
`DEFS_TARGET_MISSING`, `EXCLMIN_IGNORED_NO_MIN`, `EXCLMAX_IGNORED_NO_MAX`, `OAS_NULLABLE_KEEP_ANNOT`,
`NOT_DEPTH_CAPPED`, `PNAMES_REWRITE_APPLIED`.

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
    scoreDetails?: {
      orderedIndices: number[];       // branches by score desc / index asc
      topScoreIndices: number[];      // tie set BEFORE RNG
      tiebreakRand?: number;          // MUST be present whenever RNG is used (ties OR oneOf step‑4)
      scoresByIndex?: Record<string, number>; // OPTIONAL: map "i" -> score
    },
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

      * `fallback:'decimal'` ⇒ quantize to `decimalPrecision` digits; **then apply the same ε‑based acceptance rule as below**; note `RAT_FALLBACK_DECIMAL`.
      * `fallback:'float'`   ⇒ use float math aligned with AJV tolerance; note `RAT_FALLBACK_FLOAT`.
      * **Normative (both decimal & float fallbacks):** let `ε = 10^(−decimalPrecision)` (default `1e‑12`);
        accept `multipleOf(m)` when `abs((x/m) − round(x/m)) ≤ ε`.
      * Note `RAT_LCM_BITS_CAPPED` / `RAT_DEN_CAPPED` as applicable.

 * **Objects — `additionalProperties` exactness**

  * If **any** conjunct has `additionalProperties:false`, then any key **not covered** by that conjunct’s
    **coverage set** is forbidden, regardless of others. **Coverage set** := named keys in `properties` ∪ names
    matched by **anchored‑safe** `patternProperties`. When `propertyNames` is present at that conjunct, it acts
    **only as a gating filter** over the coverage set: intersect with the finite set (for `enum`) or with the
    names admitted by its **anchored‑safe** `pattern`. **Coverage may increase only** when the normalizer has applied the §7 rewrite and recorded `PNAMES_REWRITE_APPLIED` for this object; in that case, the **synthetic** anchored‑safe patterns introduced by the rewrite **are treated as part of** `patternProperties` for coverage. Otherwise, `propertyNames` **never** increases coverage. When coverage depends on non‑anchored or
    complexity‑capped patterns, treat coverage as unknown (see below) and exclude such keys conservatively.
  * **Must‑cover (MUST)**:

    * For each conjunct `Ci` with `additionalProperties:false`, compute a recognizer of keys it **covers**:

      * Named keys from `properties`.
      * Names matched by **anchored‑safe** `patternProperties` **including any synthetic entries created by the §7 rewrite when `PNAMES_REWRITE_APPLIED` is present** (conservative recognition).
    * If `Ci.propertyNames` is present, further **intersect** the coverage for `Ci` with the set of names permitted
      by `propertyNames` — either the exact **enum** set or those matched by its **anchored‑safe** `pattern`. **Any other form of `propertyNames` (e.g., using `minLength`, `maxLength`, `format`, or composite keywords) MUST NOT contribute to coverage recognition; treat its effect as unknown gating. Implementations MUST emit `PNAMES_COMPLEX` and, when this reduces provable coverage, also `AP_FALSE_INTERSECTION_APPROX`.**
    * The globally safe set of generable keys is the **intersection** of these (possibly filtered) recognizers
      across all such `Ci`.
    * **Anchored pattern (normative):** Assume AJV is configured with `unicodeRegExp:true` (§13). Detection is **purely textual**: regex `p` is anchored‑safe iff it starts with unescaped `^` and ends with unescaped `$`, and contains **no** look‑around (`?=`, `?!`, `?<=`, `?<!`) or back‑references (`\\1`, `\\k<...>`). Other constructs are allowed.
      **Detection operates on the JSON‑unescaped regex `source`.** The same anchored‑safe test applies to `propertyNames.pattern`, also using the JSON‑unescaped `source`.
    * **Algorithm (normative):** Treat a pattern as anchored‑safe if and only if:
      (a) in the JSON‑unescaped `source` the first code unit is `^` not preceded by `\\`, and the last code unit is `$` not preceded by an odd number of `\\`;
      (b) the JSON‑unescaped `source` contains **no back‑references of any form** and **no look‑around** — i.e., it contains none of `(?=`, `(?!`, `(?<=`, `(?<!)`, and it contains neither named back‑references (`\\k<...>`) **nor numeric back‑references** (any `\\[1-9]\\d*`);
      (c) flag letters are not present in JSON Schema; assume JS RegExp with `u` only (per §13).
    * **Complexity cap (normative):** For coverage analysis only, if a pattern's source length exceeds **4096** code units or a textual scan detects **nested quantifiers** (a parenthesized group immediately followed by `*`, `+`, `?`, or `{m,n}` whose body contains an unescaped `*`, `+`, or `{m,n}`), treat it as **non‑anchored**. Emit `REGEX_COMPLEXITY_CAPPED`, and when this affects must‑cover, also emit `AP_FALSE_INTERSECTION_APPROX`. This cap also applies to `propertyNames.pattern` when evaluating rewrites in §7.
    * **Safe key predicate (normative):** key `k` is safe under conjunct `Ci` iff `k ∈ Ci.properties`, or `∃` anchored‑safe pattern in `Ci.patternProperties` that matches `k`.
      If `Ci.propertyNames` **is an enum of strings**, further intersect the safe set with exactly that finite set (literal equality on names).
      If `Ci.propertyNames` **uses `pattern`**, apply the **same anchored‑safe rules** as for `patternProperties` and intersect accordingly.
      If any `Ci` has only **non‑anchored** patterns or patterns **capped by complexity** (either in `patternProperties` or `propertyNames`) covering `k`, treat coverage as **unknown** ⇒ `k` is **not safe`.
      Emit `REGEX_COMPLEXITY_CAPPED` when applicable, and `PNAMES_COMPLEX` and/or `AP_FALSE_INTERSECTION_APPROX` when unknown coverage causes exclusion.
  * When **no** conjunct has `additionalProperties:false`, keys not covered by **that conjunct’s** `properties/patternProperties` MUST satisfy **that conjunct’s** `additionalProperties` schema (**per‑conjunct evaluation** as in AJV). If **any** conjunct has `additionalProperties:false`, extras are globally forbidden and such schemas have no effect on extras for generation (they remain in the original schema for AJV validation but are irrelevant to generation).

* **Objects — other**

  * **Properties merge (normative)** — For any property key present in multiple conjuncts of `allOf`,
    the effective property schema is the **allOf** of the per‑conjunct subschemas. If the conjunction is
    contradictory, short‑circuit as unsatisfiable (early‑unsat). **Required** keys are the **union**
    across conjuncts.
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
    * **Defaulting (normative):**
      * `contains: S` alone ⇒ one need `{ schema: S, min: 1 }`.
      * `minContains`/`maxContains` apply only when `contains` is present at the same location. If `contains` is absent, they are ignored (no bag entry).
    * In `allOf`, **concatenate** bags; optional subsumption (if `schemaA ⊆ schemaB`).
    * **Unsat checks (MUST)**:
      * `Σ min_i > (effectiveMaxItems ?? +∞)` ⇒ emit `CONTAINS_UNSAT_BY_SUM` and short‑circuit as unsat.
      * Any need with `min > (maxItems ?? +∞)` ⇒ unsat.
      * **Definition (normative):** `effectiveMaxItems` is the post‑merge bound after `allOf`
        (including tuple‑implied caps where `items:false` ⇒ `maxLen = len(prefixItems)`).
      * **Subset‑contradiction (normative):** if ∃ needs `A` and `B` with `A.min>0` and `B.max=0` and `schemaA ⊆ schemaB` ⇒ unsat.
        * **Subset check (sound, incomplete):** treat `schemaA ⊆ schemaB` as true in any of these cases:
          1) `A.const === B.const`; 2) `A.const ∈ B.enum`; 3) `A.enum ⊆ B.enum`; 4) `A.type === 'integer'` and `B.type === 'number'`; 5) `A` is `allOf` of predicates each subset of `B`. Otherwise, do not assume subset.
    * Diagnostics: `CONTAINS_BAG_COMBINED`.
    * **Deterministic order with `uniqueItems:true` (normative):** after generation and during repair, first de‑duplicate by structural hashing (see §10), then re‑satisfy all bagged `contains` needs deterministically by need index (ascending) and **stable item slots** defined as: fill the array left‑to‑right; for each need in ascending bag index, place required matches into the earliest available positions; when a need requires multiple matches, fill successive earliest positions; do not reorder pre‑existing non‑targeted items.
    * **NOTE:** Early‑unsat checks remain limited to `Σ min_i > effectiveMaxItems` and subset‑contradiction; uniqueness‑induced unsat is not detected early.

### Early unsat checks (short‑circuit)

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
  * **Pattern vs `propertyNames` (normative gating)**:
    Short‑circuit as `UNSAT_PATTERN_PNAMES` only when all of the following hold:
    (i) `propertyNames` is a closed enum `E` (finite set of names);
    (ii) every pattern in `patternProperties` considered for presence is anchored‑safe per §8 and none of them matches any name in `E`;
    (iii) there is **presence pressure**: `effectiveMinProperties > 0` **or** there exists a `required` key `r` with `r ∉ E`.
    Otherwise MUST NOT short‑circuit: if any involved pattern is non‑anchored or capped by complexity, emit `AP_FALSE_INTERSECTION_APPROX`
    (and `REGEX_COMPLEXITY_CAPPED` when applicable), record
    `diag.unsatHints.push({ code:'UNSAT_PATTERN_PNAMES', canonPath, provable:false, reason:'nonAnchoredPattern', details:{ enumSize:|E| } })`
    and let AJV decide at validation time.
* **`dependentRequired` + `additionalProperties:false` across `allOf`**:

    * **Short‑circuit unsat only when** (a) the antecedent key is **forced present** in the effective view,
      **defined normatively** as: the key is in the effective `required` union after `allOf` merge (“effectiveRequiredKeys”), **and** (b) exclusion of each dependent is
      **proven** using only `properties` and **anchored‑safe** recognizers from `patternProperties`/`propertyNames`.
      If the must‑cover intersection cannot include all required dependents for such antecedents under these proofs
      ⇒ `UNSAT_DEPENDENT_REQUIRED_AP_FALSE`.
    * If exclusion stems from **unknown coverage** (e.g., non‑anchored patterns or regex capped by complexity limits),
      **MUST NOT** short‑circuit. Emit `AP_FALSE_INTERSECTION_APPROX` and record
      `diag.unsatHints.push({ code:'UNSAT_DEPENDENT_REQUIRED_AP_FALSE', canonPath, provable:false, reason:'coverageUnknown',
        details:{ antecedent:k, dependents:[...], patternsConsidered: [...] } })`. AJV decides at validation time.

* **`required` + `additionalProperties:false` across `allOf` (provable)**:

    * **Short‑circuit unsat only when** there exists `r ∈ effectiveRequiredKeys` that is **provably not covered** by the
      must‑cover intersection computed from `properties`, **anchored‑safe** `patternProperties` and `propertyNames`
      (enum or anchored‑safe `pattern`), using the same anchored/complexity rules as §8.
      Emit `UNSAT_REQUIRED_AP_FALSE` naming `r`.
    * If non‑anchored or complexity‑capped patterns are involved in the proof, **MUST NOT** short‑circuit: emit
      `AP_FALSE_INTERSECTION_APPROX` (and `REGEX_COMPLEXITY_CAPPED` when applicable) and record
      `diag.unsatHints.push({ code:'UNSAT_REQUIRED_AP_FALSE', canonPath, provable:false, reason:'coverageUnknown',
        details:{ requiredOut:[r1,...] } })`. AJV decides at validation time.

### Branch selection (`anyOf` / `oneOf`)

* **Deterministic, discriminant‑first scoring**:

  * +1000: same property across branches with disjoint `const/enum` (tag).
  * +200: `required + const/enum` on same key.
  * +50: anchored, disjoint `patternProperties` (e.g., `^foo$` vs `^bar$`).
  * +10: disjoint `type`.
  * −5: estimated overlaps (wide unions, non‑anchored patterns).
  * **Top‑score ties (normative):** let `Smax` be the maximum score and `T` be the ascending‑sorted array of indices `i` where `score[i] = Smax`.
    * If `T.length = 1`, pick `T[0]`.
    * If `T.length > 1`, pick deterministically from `T` using the §15 RNG with state `s0 = (seed >>> 0) ^ fnv1a32(canonPtr)`: choose index `T[Math.floor((next()/2**32) * T.length)]`.
    **Normative:** `fnv1a32` is FNV‑1a over the canonical JSON Pointer string `canonPtr`
    (offset‑basis `2166136261`, prime `16777619`, modulo `2^32`).

* **Trials policy**:

  * Score all branches; try Top‑K `maxBranchesToTry`. Attempt generation up to `trials.perBranch` times per branch (default 2).
  * If branch count > `skipTrialsIfBranchesGt` or `skipTrials=true` ⇒ **score‑only** selection:
    compute `Smax` and tie set `T` as above and pick from `T` with the seeded RNG. No trials are attempted in this path.
  * **Normative (observability):** in score‑only, `diag.scoreDetails` **MUST** include:
    * `orderedIndices:number[]` — branch indices ordered by score desc, index asc;
    * `topScoreIndices:number[]` — the tie set `T` in ascending index order before RNG;
    * `tiebreakRand:number` — the RNG float (`next()/2^32`).
  * **Normative (general):** whenever RNG is used (tie‑break OR oneOf exclusivity resolution step‑4), `diag.scoreDetails.tiebreakRand`
    **MUST** be populated with the exact float value used.
  * Record trial budget in `diag.budget`. Emit `TRIALS_SKIPPED_LARGE_ONEOF` when `oneOf.length > skipTrialsIfBranchesGt`. Emit `TRIALS_SKIPPED_LARGE_ANYOF` when `anyOf.length > skipTrialsIfBranchesGt`. In all score‑only cases (including `trials.skipTrials === true`), emit the relevant code and set `diag.budget.reason` to one of `"skipTrialsFlag"`, `"largeOneOf"`, `"largeAnyOf"`, or `"complexityCap"`.

* **`oneOf` exclusivity**:

  * After selection/generation, validate against all branches.
  * If >1 pass, resolve deterministically with the following order:
    1) Keep the selected branch `b* = diag.chosenBranch.index` as the target; all refinements aim to keep `b*` passing and make all others fail.
    2) Non‑destructive refinement: prefer adjustments that set/strengthen discriminants already present in `b*` (e.g., enforce `const/enum` on the same keys) without altering unrelated fields.
    3) Bounded tweaks (stable order): apply, in order, (a) numeric nudges, lowest canonical pointer first; (b) string single‑char injections, lowest canonical pointer first. Each tweak uses the minimal change that breaks the highest‑index conflicting branch first; ties are broken by the §15 RNG seeded with the canonical JSON Pointer of this `oneOf` node.
    4) If, after (2)–(3), >1 branch still passes, pick deterministically from the passing set using the same seeded RNG policy as for ties (§8), and apply a final minimal tweak to exclude the others.
  * Record `diag.overlap.passing` and `diag.overlap.resolvedTo = b*` (or to the chosen index in step 4). **Normative:** the RNG used in steps (3)–(4) MUST use the same canonical pointer as branch selection at this `oneOf` location.

### Complexity caps & degradation

* If caps are exceeded (see `PlanOptions.complexity`), enable **graceful degradation**:

  * Force `skipTrials=true`, reduce Top‑K, or skip pattern overlap analysis.
  * Emit diagnostics: `COMPLEXITY_CAP_ONEOF`, `COMPLEXITY_CAP_ANYOF`, `COMPLEXITY_CAP_PATTERNS`, `COMPLEXITY_CAP_ENUM`, `COMPLEXITY_CAP_CONTAINS`, `COMPLEXITY_CAP_SCHEMA_SIZE`.

#### Unsat hint payloads (details)
Implementations SHOULD populate `details` with small, code‑specific objects:
* `UNSAT_DEPENDENT_REQUIRED_AP_FALSE`: `{ antecedent:string, dependents:string[], mustCoverProof:'anchored'|'approx', patternsConsidered?:string[] }`
* `UNSAT_REQUIRED_AP_FALSE`: `{ requiredOut:string[] }`
* `UNSAT_AP_FALSE_EMPTY_COVERAGE`: `{ minProperties?:number, required?:string[] }`
* `UNSAT_PATTERN_PNAMES`: `{ enumSize:number, patterns?:string[] }`
* `UNSAT_REQUIRED_PNAMES`: `{ requiredOut:string[], enumSample?:string[] }`
* `UNSAT_MINPROPS_PNAMES`: `{ minProperties:number }`

---

## 9) Generator

* Consume the effective view; honor type constraints, lengths, patterns, enums.

* **`enum/const` outrank `type`** when both present.

* **Strings** — Measure length in Unicode code points; regex in Unicode mode (`unicodeRegExp:true`).

* **Formats** — Default annotate‑only (`validateFormats:false`). Optional `validateFormats:true` + `ajv-formats` for (email|uri|uuid|date‑time) minimal generators.

* **Objects** —

  * When any conjunct has `additionalProperties:false`, respect the **must‑cover intersection** from Compose.
  * With `unevaluatedProperties:false` in the effective view, generate only keys evaluated by `properties|patternProperties|dependentSchemas`.
  * Stable property order: **(1) required keys sorted lexicographically (UTF‑16 code‑unit ascending; JS `<` comparator)**, then **(2) optional keys sorted lexicographically**. Do not use `localeCompare`.

* **Numbers** — Prefer `type:"integer"` over `number+multipleOf:1`.

* **Arrays** —

  * Respect tuple semantics and implicit max length from `items:false`.
  * **Satisfy bagged `contains`**:
    * when `uniqueItems:false` or absent, generate targeted, distinct items per need;
    * when `uniqueItems:true`, do not attempt to satisfy needs before de‑duplication — first de‑duplicate by structural hashing (§10), then deterministically re‑satisfy all bagged `contains` needs as in §8.
  * (Restated) **Contains × `uniqueItems` (normative order):** `uniqueItems:true` ⇒ de‑dup → re‑satisfy; otherwise satisfy normally.

* **Enums (generation)** — When `enum`/`const` constrain a value, pick the **first stable member**
  (array index order for `enum`; literal for `const`). This mirrors §10 Repair (`enum` → pick first stable member)
  and ensures seed‑independent determinism.

* **Objects — minimal‑width policy (normative)** —
  * By default, emit only the effective required keys. Add optional keys only when needed to: (a) meet `minProperties`, (b) satisfy `dependentRequired`, (c) realize discriminants selected by branch choice, or (d) perform `propertyNames` closed‑enum rename/repair.
  * When `minProperties` requires extras, choose them deterministically from the must‑cover set in lexicographic order; if insufficient, extend with admitted `additionalProperties`/`patternProperties`. For `patternProperties`, selection is defined below.

  * **Pattern‑witness selection (normative):**
    1) Iterate `patternProperties` keys in **lexicographic order of their JSON‑unescaped regex `source`**; skip any pattern flagged by `REGEX_COMPLEXITY_CAPPED`.
    2) For a candidate anchored‑safe pattern `P`, generate the **shortest** string accepted by `P`; if multiple, pick the **lexicographically smallest** (UTF‑16 code‑unit order). Use the §9 string generator with the §15 RNG seeded by the property’s canonical pointer to break internal construction ties deterministically.
    3) Allocate at most **one** new key per pattern per pass, continue to the next pattern, and repeat the cycle until the needed count is met or all patterns are exhausted.
    4) If no admissible patterns remain and `propertyNames.enum` exists, draw remaining keys from the enum in lexicographic order excluding already‑present names. If neither source can supply enough names, leave generation to fail AJV with `minProperties` and record diagnostics already defined in §8 (unsat hints).

* **Arrays — minimal‑length policy (normative)** —
  * Choose the smallest length `len` satisfying all bounds and needs: `len ≥ max(minItems, |prefixItems|, Σ min_i)` and, when `items:false`, `len ≤ |prefixItems|`.
  * When `uniqueItems:true`, prefer this minimum after de‑dup + bag re‑satisfaction; do not add filler items unless required by `minItems` or the bag. Fill non‑targeted slots using the earliest stable generator for the item schema; do not reorder previously placed targeted items.

### Conditionals strategy when not rewriting

* **Default when `rewriteConditionals:'never'` is in effect:** `conditionals.strategy = 'if-aware-lite'`.

  1. **Pre‑evaluate** `if` on the **partial instance** being built (best‑effort).
  1.1 **Normative scope**: only use `const/enum` tests on keys already chosen; ignore other keywords; never assume presence of unspecified keys.
  1.2 **No lookahead/backtracking**; the choice must be deterministic for a given seed and schema path.
  2. If `if` appears satisfied, bias generation to satisfy a **minimal subset** of `then` according to `minThenSatisfaction`
     (`'discriminants-only' | 'required-only' | 'required+bounds'`, default `'required-only'`).
  **Definition (normative):** A discriminant property is any key referenced in `if.properties` with a `const` or `enum`, or any key that is both in `if.required` and constrained by `if.properties[key].(const|enum)`.
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
  * **Normative hashing**: hash by canonical JSON: stringify with sorted object keys (depth‑first), arrays in order, and `jsonSafeReplacer` for BigInt; normalize `-0` to `0`. Collisions **must** be validated by `deepEqual` before de‑dup.
* `additionalProperties:false` / `unevaluatedProperties:false` → remove extras; rename only when safe; never rename keys required by `dependent*`.
* `propertyNames` →
  * **Order & safety:** run before `additionalProperties/unevaluated*` sweep; never rename keys that are `required` or keys referenced by any `dependent*` antecedent/depender.
  * **Closed enum rename (deterministic):** when `propertyNames` is an **enum** `E`, for each offending key `k` choose the **lexicographically smallest** name `n ∈ E` such that `n` is not currently present in the object and (if `additionalProperties:false` is in effect) `n` is inside the must‑cover set. Rename `k → n`.
  * **Pattern or no available name:** when `propertyNames` uses `pattern` (any form) **or** no such `n` exists, **do not rename**; instead **delete** the offending key (subject to `required`/`dependent*` constraints; if deletion is unsafe, leave the key and let validation fail).
  * **Logging:** record each rename/delete with `details:{from,to?,reason}`.
  * **Post‑rename revalidation (normative):** treat each renamed property as changed and immediately re‑run per‑property repairs for that key in the same pass (budget permitting): `required`, `type`, `enum/const`, and bounds (`min*`/`max*`) for `properties[n]` (or matching `patternProperties`). This prevents leaving a renamed key with a stale, invalid value and reduces additional repair cycles.

### Process

* **Order** — shape (`type`/`required`) → bounds (`min*`/`max*`) → semantics (`pattern`/`multipleOf`/`format`) → **names (`propertyNames`)** → sweep (`additional*`/`unevaluated*`).
* **Budgets** — per‑node attempt counter (1–3) + seen‑set `(instancePath, keyword, normalizedParams)` to avoid loops.
* **Stagnation guard** — If over `complexity.bailOnUnsatAfter` gen→repair→validate **cycles** errors don’t decrease or oscillate on the same keys ⇒ `UNSAT_BUDGET_EXHAUSTED`.
* **Idempotence** — Repeating the same action is a no‑op.
* **Logging** — `{ item, changed, actions:[...] }` where each action records `keyword`, `canonPath` and `origPath` (derived via `toOriginalByWalk` and `ptrMap`), plus `details` when applicable.

---

## 11) Modes

### Strict (default)

* Fail early only on non‑normalizable constructs or explicit policy cases.
* `$ref` external: behavior controlled by `failFast.externalRefStrict` (default `error`). On failure, **emit** `EXTERNAL_REF_UNRESOLVED`.
  **External `$ref` (normative):** Resolve the `$ref` value against the current resolution base (from `$id`).
  If the resolved URI is **fragment‑only** (`#...`), it is **internal**; otherwise it is **external** (includes absolute
  URIs like `http:`, `https:`, `urn:`, `file:` and relative references whose URI‑reference has a non‑empty path to another
  document such as `other.json#/...`). **No I/O** (network or filesystem) is performed in any mode.
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
* **Refs** — Only fragment‑only refs (`#...`) are considered in‑document; **no network or filesystem I/O**.
  External `$ref` (see §11 definition) are not dereferenced; emit `EXTERNAL_REF_UNRESOLVED` per mode.
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

   * `strictSchema:true`, `strictTypes:true`, `allErrors:false`, `unicodeRegExp:true`
   * `validateFormats` aligned with the policy above
   * **Normative:** Both AJV instances MUST enable `unicodeRegExp:true` so that pattern semantics match the anchored‑safe test (§8) and string handling in §9.

Cache keys must include AJV **major version** and flags (`validateFormats`, `allowUnionTypes`, `strictTypes`, `unicodeRegExp`).

---

## 14) Cache Strategy

Hierarchical:

1. `WeakMap` by object identity
2. `$id` when present and trusted
3. `stableHash(schema)` **only if** estimated size < `hashIfBytesLt` using canonical JSON:
   sort object keys lexicographically (depth‑first), preserve array order, apply `jsonSafeReplacer`,
   and normalize `-0` to `0`. The resulting UTF‑8 is the hash input.
   **Normative:** estimated size = UTF‑8 byte length of `JSON.stringify(schema, jsonSafeReplacer)`.

LRU bounded by `lruSize`. Cache keys **MUST** include AJV **major version** and flags
(`validateFormats`, `allowUnionTypes`, `strictTypes`, `unicodeRegExp`) and the **PlanOptionsSubKey** (defined below).
**Non‑goal**: no cache of **generated data** across runs. Memoization is allowed only for **branch selection**
decisions at compose‑time and **MUST** key on `(canonPtr, seed, AJV.major, AJV.flags, PlanOptionsSubKey)`.
(ε := `10^(−decimalPrecision)` is implied by `rational.decimalPrecision` within `PlanOptionsSubKey`.)

**PlanOptionsSubKey (normative)** — JSON string of the following fields only, with keys sorted lexicographically:
`conditionals.strategy`, `conditionals.minThenSatisfaction`, `trials.perBranch`, `trials.maxBranchesToTry`,
`trials.skipTrialsIfBranchesGt`, `trials.skipTrials`, `disablePatternOverlapAnalysis`, `complexity.maxOneOfBranches`,
`complexity.maxAnyOfBranches`, `complexity.maxEnumCardinality`, `complexity.maxPatternProps`, `complexity.maxContainsNeeds`,
`guards.maxGeneratedNotNesting`, `rational.decimalPrecision`, `rational.fallback`, `rational.maxRatBits`, `rational.maxLcmBits`, `rational.qCap` (affects numeric math, caps, and tolerance semantics).
Omitted/undefined fields are not serialized.
(Clarification: separate LRU spaces for the two AJV instances are recommended.)

---

## 15) Performance, Determinism & Metrics

* **RNG (normative)** — **xorshift32** with state `uint32`, initialized as
  `s0 = (seed >>> 0) ^ fnv1a32(canonPtr)`. On each `next()`:
  `x ^= x << 13; x ^= x >>> 17; x ^= x << 5;` (all `>>> 0`). The return value is `x >>> 0`.
  No global state. Tie‑breakers use `next() / 2^32` as a deterministic float in `[0,1)`.
* **Trials** — Bounded by `trials`; Top‑K; optional skip on large `oneOf`.
* **Pattern overlap** — Heuristic; can be disabled.
* **Complexity caps** — Trigger degradations (score‑only selection, analysis skips) with explicit diagnostics.
* **No wall‑clock/env dependency (normative)** — Control flow (branch picks, retries, tweaks) MUST NOT depend on
  Date/time, timers, environment variables, or system locale. Metrics MAY use a monotonic clock and MUST NOT affect outcomes.
* **Benchmark protocol (normative for CI):** Node.js LTS (≥18.x), AJV v8.x with the flags in §13, `unicodeRegExp:true`, fixed seeds `{1, 42, 4242}`, public dataset `profiles/{simple,medium,pathological}.json`, run 5 warmups + 20 measured iterations, report p50/p95 with memory. Results outside ±10% require investigation.

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
  // added observability
  branchCoverageOneOf?: Record<string, { visited: number[]; total: number }>;
  enumUsage?: Record<string, Record<string, number>>;
  repairActionsPerRow?: number; // total repair actions / row
}
```

### SLO/SLI (documented targets, not hard guarantees)

**Budgets & Fallback (normative)**

* **p95 budgets:** `gen_latency ≤ 120 ms`, `compile_time ≤ 1000 ms`, `memory ≤ 512 MB`.
* **Fallback order when a budget is exceeded:**
  1) reduce optional repairs; 2) cap `trials.perBranch`/`maxBranchesToTry` (score‑only if needed);
  3) relax non‑normative heuristics (e.g., skip pattern‑overlap analysis).
* Document degradations in diagnostics and metrics (`diag.metrics`, caps and budget fields).

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
* `AP:false × allOf` must‑cover enforced with `AP_FALSE_INTERSECTION_APPROX` on non‑anchored patterns; no generated key outside the must‑cover set in unit/integration suites.
* `contains` bag unsat rules enforced with `CONTAINS_UNSAT_BY_SUM` when applicable; generation re‑satisfies needs after `uniqueItems` de‑dup.
* External `$ref` produce `EXTERNAL_REF_UNRESOLVED` (strict=error, lax=warn).
* When `skipTrials` is active (or `oneOf` length exceeds threshold), branch selection is deterministic **score‑only** (stable index + seeded tie‑break); no trials attempted.

### Phase P1

* Extra metrics (`validationsPerRow`, `repairPassesPerRow`) wired to bench harness.
* Bench CI: simple/medium/pathological profiles; track p50/p95.
* Docs: `Invariants.md`, `Known‑Limits.md`, Strict vs Lax table.
* Metrics extended: `branchCoverageOneOf`, `enumUsage`, `repairActionsPerRow` exported by bench harness.

### Phase P2

* Contains bag subsumption improvements.
* Pattern approximation improvements for must‑cover (anchored unions, simple char classes).
* Diagnostic message hygiene.

---

## 17) Documentation Additions

* **Invariants.md** — Cross‑phase invariants (e.g., “validate against original schema”, “`enum/const` > `type`”, “must‑cover for `AP:false`”, “bag semantics for `contains`”).
* **Known‑Limits.md** — Partial features/approximations (non‑anchored patterns under `AP:false`, `$dynamicRef`).
* **Features Matrix** — See §18.
* **Non‑Goals** — No remote deref of external `$ref`; no caching of generated data; scenario‑based / learned distributions are opt‑in extensions outside core guarantees (deterministic, AJV‑validated).

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
`TRIALS_SKIPPED_LARGE_ONEOF`, `TRIALS_SKIPPED_LARGE_ANYOF`, `AP_FALSE_INTERSECTION_APPROX`, `CONTAINS_BAG_COMBINED`, `CONTAINS_UNSAT_BY_SUM`,
`COMPLEXITY_CAP_ONEOF`, `COMPLEXITY_CAP_ANYOF`, `COMPLEXITY_CAP_PATTERNS`,
`COMPLEXITY_CAP_ENUM`, `COMPLEXITY_CAP_CONTAINS`, `COMPLEXITY_CAP_SCHEMA_SIZE`, `REGEX_COMPLEXITY_CAPPED`,
`UNSAT_PATTERN_PNAMES`, `UNSAT_DEPENDENT_REQUIRED_AP_FALSE`, `UNSAT_BUDGET_EXHAUSTED`,
`IF_AWARE_HINT_APPLIED`, `IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO`,
`EXTERNAL_REF_UNRESOLVED`, `UNSAT_REQUIRED_PNAMES`, `UNSAT_MINPROPS_PNAMES`, `UNSAT_REQUIRED_AP_FALSE`,
`UNSAT_AP_FALSE_EMPTY_COVERAGE`, `PNAMES_REWRITE_APPLIED`, `EVIDENCE_GAP`.

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
  - Include cases with non‑anchored patterns: expect `AP_FALSE_INTERSECTION_APPROX` and no keys outside must‑cover.
* `oneOf` overlap: selected branch ends exclusive after refinement.
* External `$ref` (strict vs lax): validate emission of `EXTERNAL_REF_UNRESOLVED` and mode‑specific behavior (error vs warn + attempt).
* Score‑only path: `skipTrials=true` or large `oneOf` ⇒ deterministic pick (stable index + seeded tie‑break), zero trials attempted.
* Repair logs include `origPath` derived from `ptrMap` for each action.
* Conditionals with `unevaluated*` in scope: safe rewrite is blocked; `IF_REWRITE_SKIPPED_UNEVALUATED` present.

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
  - emits repair actions with `canonPath` and `origPath` (via `ptrMap`).
* `packages/core/src/parser/json-schema-parser.ts` (lean checks)
* `packages/core/src/util/ptr-map.ts` (ptr map + reverse map by path walk)
* `packages/core/src/util/rational.ts` (exact rational helpers with caps/fallback + BigInt‑safe JSON)
* `packages/core/src/util/rng.ts` (seeded RNG; no global state)
* `packages/core/src/util/struct-hash.ts` (structural hashing for `uniqueItems`)
* `packages/core/src/util/metrics.ts` (per‑phase timings, counters, validations/row)
  - exports counters for `branchCoverageOneOf`, `enumUsage`, `repairActionsPerRow`.
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
  guards?: { maxGeneratedNotNesting?: number };
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
  /**
   * Optional memoization key for deterministic branch selection without trials.
   * If provided, implementations MAY memoize the pick and the key MUST incorporate
   * (schemaPath/canonPtr, seed, AJV.major, AJV.flags, PlanOptionsSubKey).
   */
  selectorMemoKeyFn?: (schemaPath: string, seed: number, opts?: PlanOptions) => string;
}

export function compose(schema: any, opts?: ComposeOptions): {
  schema: any;                     // effective view (must-cover + bagged contains)
  containsBag?: ContainsNeed[];
  diag?: {
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
    scoreDetails?: {
      orderedIndices: number[];
      topScoreIndices: number[];
      tiebreakRand?: number;
      scoresByIndex?: Record<string, number>;
    };
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

## 24) Norms & References

### 24.1 Normative References

* **\[RFC2119] / \[RFC8174]** — *Key words for use in RFCs to Indicate Requirement Levels.*
  **Used for:** requirement language MUST / SHOULD / MAY.

* **\[RFC8259]** — *The JavaScript Object Notation (JSON) Data Interchange Format.*
  **Used for:** definition of JSON for inputs/outputs and diagnostic payloads.

* **\[JSON-SCHEMA-2020-12]** — *JSON Schema draft 2020-12* (Core, Validation, Applicator, Unevaluated, Format Annotation vocabularies).
  **Used for:** keyword semantics and the target dialect (`allOf/anyOf/oneOf/not`, `if/then/else`, `unevaluated*`, `properties/patternProperties/additionalProperties`, `contains`, `dependent*`, `$id/$anchor`, `format`).

* **\[RFC6901]** — *JSON Pointer.*
  **Used for:** pointer syntax (`/…`) in `canonPath` and diagnostics.
  *Note:* `ptrMap` and `revPtrMap` are constructs defined by this specification, not by RFC6901.

* **\[RFC3986]** — *Uniform Resource Identifier (URI): Generic Syntax.*
  **Used for:** resolution rules of `$id` and `$ref` (internal vs external). No network I/O.

* **\[RFC8785]** — *JSON Canonicalization Scheme (JCS).*
  **Used for:** canonical key ordering and deterministic content hashing.

* **\[FIPS-180-4]** — *Secure Hash Standard (SHS).*
  **Used for:** SHA-256 in `contentHash` and structural de-duplication.

* **\[ECMA-262]** — *ECMAScript Language Specification (latest edition).*
  **Used for:** RegExp Unicode semantics (`u` flag, `unicodeRegExp:true`) and lexicographic ordering by UTF-16 code units.

* **\[SemVer-2.0.0]** — *Semantic Versioning 2.0.0.*
  **Used for:** versioning of this specification and the software.

### 24.2 Informative References

* **\[ECMA-404]** — *The JSON Data Interchange Syntax.* (complements RFC8259)
* **\[UTS-18]** — *Unicode Technical Standard #18: Unicode Regular Expressions.* (background)
* **\[UAX-15]** — *Unicode Normalization Forms.* (background)
* **\[AJV-v8]** — AJV v8.x documentation (background on flags such as `unicodeRegExp`, `validateFormats`)
* **\[FNV-1a]** — Fowler–Noll–Vo hash, 1a variant (background; `fnv1a32` is restated normatively in this spec)

### 24.3 Reference-to-Section Alignment

| Ref                 | Applies to                                                                          |
| ------------------- | ----------------------------------------------------------------------------------- |
| RFC2119/8174        | global requirement language (keywords)                                              |
| RFC8259             | §§5, 7, 8–10, 14–15 (JSON I/O, diagnostics, structural hashing inputs)              |
| JSON-SCHEMA-2020-12 | §§6–13, 18 (keyword semantics, dialect, metaschemas)                                |
| RFC6901             | §§7, 8, 10, 19 (pointer syntax in `canonPath`; `ptrMap`/`revPtrMap` are spec-local) |
| RFC3986             | §§11–12 (`$ref` URI resolution; no external I/O)                                    |
| RFC8785             | §§7.1, 7.4, 15 (canonicalization, content hash)                                     |
| FIPS-180-4          | §§7.4, 10, 15 (SHA-256 usage)                                                       |
| ECMA-262            | §9 (strings/RegExp), lexicographic sort rules                                       |
| SemVer-2.0.0        | document header, versioning                                                         |

