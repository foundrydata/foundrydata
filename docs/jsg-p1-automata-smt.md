
# JSON Schema Generator — **JSON Schema Generator — Automata & Bounded SMT (AJV‑Oracle, Deterministic Core)**

**Status:** P1 (normative language uses RFC‑2119 terms)
**Audience:** JSON Schema/AJV spec authors & implementers
**Scope:** JSON Schema 2020‑12 (OpenAPI 3.1 compatible)  
**Invariants:** AJV oracle; deterministic; zero network I/O in core
---

## 0. Philosophy & Invariants (Normative)

* **AJV is the oracle.** The final validation **MUST** run against the **original** schema (not the canonical view). AJV options **MUST** match (e.g., `unicodeRegExp:true` on both planning and final validation). A mismatch **MUST** be a hard error.
* **No network I/O in the core.** Any resolver/cache for external `$ref` is an **optional pre‑phase (R1)** that populates an in‑memory, read‑only registry. The core **MUST NOT** perform network I/O.
* **Determinism.** For a fixed tuple `(seed, PlanOptionsSubKey, AJV.major, flags[, registryFingerprint from R1])`, the generator **MUST** be deterministic: same branch choices, same instances, same coverage. No wall‑clock or locale dependence.
* **Diagnostics.** Errors/warnings **MUST** use a stable envelope `{ code, canonPath, details }` with a single `canonPath` and structured `details`.

---

## 1. Objective

Given a JSON Schema, the pipeline **(a)** produces valid, deterministic instances **or** **(b)** fails early with actionable diagnostics—**without** altering validation semantics (AJV remains the oracle). This spec adds:

1. **Exact name coverage** for objects under `additionalProperties:false` via **automata**;
2. **Robust reasoning** for arrays/numbers (sound rules, with **optional local SMT** under strict caps);
3. **Interfaces** for OpenAPI mocks/tests (prefer examples, reproducible fixtures, adapters).

---

## 2. Scope

**In‑scope (normative):** canonical view normalization (2020‑12), anchored‑safe regex policy with complexity caps, must‑cover under `additionalProperties:false` across `allOf` via **name automata**, early‑UNSAT proofs, arrays/numbers rules, Strict/Lax modes for external `$ref`, AJV oracle, diagnostics & metrics, `CoverageIndex` API, optional **local SMT** (timeout), OpenAPI driver hooks.

**Out‑of‑scope (reminder):** any rewrite that changes validation semantics, network resolution in the core, aggressive transforms in presence of `unevaluated*`, caching of generated instances.

---

## 3. Definitions

* **Canonical view (2020‑12):** non‑destructive normalization (e.g., `definitions→$defs`, tuple `items→prefixItems`, `enum` of size 1 → `const` **in the view only**). All guards **MUST** apply when `unevaluated*` is in scope; simplifications **MUST** be skipped and noted.
* **Anchored‑safe pattern:** JSON‑source **unescaped** regex with `^…$`, **no** look‑around or back‑references; subject to a **complexity cap** (pattern length + quantified groups).
* **Presence pressure:** schema requires at least one property/element (e.g., `required|minProperties|minContains|…`).
* **Name DFA:** a (capped) deterministic finite automaton representing a language of **property names** that are generable/allowed.
* **CoverageIndex:** pure API with `has(name)` and `enumerate()` (only when finiteness is provable), plus **provenance** of coverage.

---

## 4. Normative Requirements

### 4.1 Canonical View

* The planner **MUST** produce a 2020‑12 canonical view (unifying defs/id, tuples, etc.).
* The original schema **MUST NOT** be modified.
* If `unevaluated*` is in scope, simplifications or rewrites **MUST** be skipped with notes (e.g., `*_SKIPPED_UNEVALUATED`).

---

### 4.2 Regex Policy & Complexity Caps

* Patterns **MUST** be classified as **anchored‑safe** or **non‑safe/capped**.
* Planning **MUST** emit `REGEX_COMPLEXITY_CAPPED` / `REGEX_COMPILE_ERROR` when applicable.
* Non‑safe/capped patterns **MUST NOT** be used for proofs or enumeration; they remain **guards** in coverage.

---

### 4.3 Must‑Cover under `additionalProperties:false` — **Name Automata (Exact)**

#### 4.3.1 Construction (per conjunct under `allOf` with AP:false)

For each conjunct `Ci` that enforces AP:false, the planner **MUST** construct a **DFA(Ci)**:

1. **`properties` literals** → single‑string DFAs (exact matches).
2. **`patternProperties`** that are **anchored‑safe & not capped** → parse (restricted grammar), build NFA (Thompson), determinize with caps → **DFA**.
3. **`propertyNames`**:

   * By default, **guard only** (intersection) and **MUST NOT** increase coverage.
   * **MAY** be **rewritten additively** (flag‑gated) under **strict equivalence preconditions** (closed string `enum`; anchored‑safe non‑capped pattern; no `unevaluated*` in scope). If rewritten, add **synthetic** constraints in the canonical view and emit `PNAMES_REWRITE_APPLIED`.

The **object‑level coverage** **MUST** be the **product/intersection**
[
A = \bigcap_i DFA(C_i)
]
evaluated over the Unicode (UTF‑16) alphabet.

**Caps:** implementations **MUST** enforce `maxAutomatonStates`, `maxProductStates`, `maxKEnumeration`. If a cap is hit, they **MUST** emit `NAME_AUTOMATON_COMPLEXITY_CAPPED` and fall back conservatively (see 4.3.4).

#### 4.3.2 Decision, Finiteness, Witnesses

* `CoverageIndex.has(name)` **MUST** be **pure and deterministic**, testing membership against the **product DFA**.
* **Finiteness** **MUST** be decided by checking the **absence of cycles** (reachable and co‑reachable) on paths to accepting states.
* `CoverageIndex.enumerate(k)` **MUST** be exposed **only if** finiteness is proven. Enumeration **MUST** use **BFS** with **shortest‑length first**, then **UTF‑16 order**.
* **Prohibition:** `enumerate()` **MUST NOT** be exposed when finiteness is due **solely** to a raw `propertyNames.enum` (no rewrite).

#### 4.3.3 Safe‑proof fallback & Early‑UNSAT Proofs

* **Safe‑proof fallback (Strict & Lax):** When presence pressure holds, the planner MUST first attempt a safe‑only cover (anchored‑safe & non‑capped inputs only). If non‑empty, proceed with this cover and attach a coverage certificate to diagnostics. If empty, emit early‑UNSAT.
* If ( A = ∅ ) **and** there is presence pressure, the planner **MUST** emit `UNSAT_AP_FALSE_EMPTY_COVERAGE` with a proof summary.
* If a `required` name is **rejected** by ( A ) → `UNSAT_REQUIRED_VS_PROPERTYNAMES`.
* If ( A ) is **finite** and (|A| < minProperties) → `UNSAT_MINPROPERTIES_VS_COVERAGE`.

#### 4.3.4 Strict/Lax Interaction (under AP:false)

* **Strict:** if non‑emptiness of coverage would **require** a **non‑safe or capped** pattern (including synthetic) **and** there is presence pressure, the planner **MUST** emit `AP_FALSE_UNSAFE_PATTERN` (fatal) **after** attempting a safe‑only proof.
* **Lax:** same code as **warning** with conservative exclusion. Safe‑only proofs **MUST** be attempted first.

#### 4.3.5 Coverage certificate (non‑normative payload)
When the safe‑proof path is taken, implementations SHOULD attach to `planDiag.details.safeProof`:
`{ used:boolean, finite:boolean, states:number, witnesses?:string[], capsHit?:boolean }`.

---

### 4.4 `propertyNames` Rewrites (Optional, Flag‑Gated)

* Default behavior: **guard** only; **MUST NOT** expand coverage.
* **MAY** apply **strictly equivalent additive rewrites** (canonical view only) iff:

  * closed string `enum` or anchored‑safe non‑capped pattern;
  * no `unevaluated*` in scope;
  * AP:false does **not** constrain values in a way that the rewrite would alter.
* Rewrites **MUST** emit `PNAMES_REWRITE_APPLIED` and mark synthetic provenance in coverage. The original schema remains the AJV reference.

---

### 4.5 Arrays & Numbers (Sound Rules + Optional Local SMT)

#### 4.5.1 Sound Rules (Required)

* **Arrays, `contains` (bag semantics):**

  * Prove `UNSAT_CONTAINS_VS_MAXITEMS` when (\sum_i min_i > maxItems).
  * Detect **disjointness** when safe (e.g., incompatible `type/enum/const`), and mark overlap as unknown when not provable.
  * With `uniqueItems:true`, choice ordering **MUST** be deterministic.
* **Numbers:** honor `minimum/maximum/exclusive*` and **rational** `multipleOf` consistent with AJV; emit early UNSAT on contradictory bounds.

#### 4.5.2 Local SMT (Optional, Experimental)

* Implementations **MAY** use a **local** QF_LIA solver (WASM) under a strict **timeout** (e.g., 10–50 ms) to combine numeric bounds and array cardinalities (`min/maxItems`, `min/maxContains`, `uniqueItems`) and to produce **minimal witnesses**.
* On timeout/unknown → emit `SOLVER_TIMEOUT` (non‑fatal) and **fall back** to sound rules.
* No network calls **MUST** be made.

---

### 4.6 External `$ref` & Modes (Strict/Lax)

* **Strict:** if AJV compilation fails due to unresolved external `$ref`, the planner **MUST** stop with `EXTERNAL_REF_UNRESOLVED{mode:"strict"}`.
* **Lax:** **MUST** warn and **MAY** `skip` final validation **only** if the failure is **exclusively** due to external `$ref`. The decision **MUST** be traceable and surfaced as `skippedValidation:true`.

---

### 4.7 Validation Invariants

* The final instance **MUST** be validated by **AJV against the original schema** (not the canonical view). Any failure **MUST** be accompanied by a diagnostic explaining the stop condition.

---

## 5. Diagnostics, Observability, Coverage

* **Envelope:** `{ code, canonPath, details }`; `canonPath` **MUST** be unique (no duplication in `details`).
* **Codes (non‑exhaustive):**

  * Name/coverage: `AP_FALSE_UNSAFE_PATTERN`, `UNSAT_AP_FALSE_EMPTY_COVERAGE`, `UNSAT_REQUIRED_VS_PROPERTYNAMES`, `UNSAT_MINPROPERTIES_VS_COVERAGE`, `NAME_AUTOMATON_COMPLEXITY_CAPPED`.
  * Regex: `REGEX_COMPLEXITY_CAPPED`, `REGEX_COMPILE_ERROR`.
  * Arrays/numbers: `UNSAT_CONTAINS_VS_MAXITEMS`, `SOLVER_TIMEOUT`.
  * External refs: `EXTERNAL_REF_UNRESOLVED{mode,skippedValidation?}`.
* **CoverageIndex API:**

  * `has(name): boolean` (**pure**);
  * `enumerate?(k): string[]` (only when finiteness is proven) with `provenance`.
  * `enumerate()` **MUST NOT** be exposed when finiteness derives solely from a **raw** `propertyNames.enum`.
* **Name automaton summary (optional):** `nameDfaSummary:{ states, finite, capsHit? }` for observability (no graph export).
* **Metrics:** per‑phase durations, `validationsPerRow`, `repairPassesPerRow`, p50/p95 latency, memory peak, and **cap hits** (regex/automata/SMT).

## Name automaton enumeration

### Bounded BFS
We traverse the character-state graph with a bounded breadth-first search. Budgets limit wall-clock time, expanded states, queue size, depth, and the number of emitted strings. A beam option prioritizes higher-scoring prefixes when the branching factor is large.

### Targeted strategy
Hints are computed from schema constraints:
- **Anchoring**: anchored patterns (`^...$`) are treated as strict completions.
- **Length**: `minLength`/`maxLength` set depth bounds.
- **Character classes**: common whitelists (e.g., `[A-Za-z0-9._-]`) guide the next-character function.
- **Negative lookaheads**: e.g., `(?!CloudFormation)` is enforced by penalizing and filtering offending prefixes.
- **patternProperties** with `minProperties`: the enumerator round-robins patterns and synthesizes the required number of distinct names within budget.

### Metrics & diagnostics
The enumerator reports expansions, queue peaks, emitted results, and elapsed time. These flow into the corpus harness for before/after comparisons.

### Interaction with coverage
If presence pressure exists (e.g., `minProperties ≥ 1` and no concrete property set), the enumerator attempts to satisfy the minimum cardinality first. If other independent constraints still fail, diagnostics remain to surface the true blocker.

---

## 6. Non‑Functional Constraints

* **Determinism:** With the fixed tuple `(seed, PlanOptionsSubKey, AJV.major, flags[, registryFingerprint])`, the same inputs **MUST** lead to the same outputs/coverage/metrics. RNG is local (e.g., xorshift32) and seeded per `canonPath`; no shared global state.
* **Performance SLOs:** `p95 ≤ 120 ms` and memory `≤ 512 MB` on provided profiles. Caps **MUST** be explicit; degradations **MUST** be logged.

---

## 7. Interfaces

### 7.1 Node API

```ts
type NormalizeResult = {
  canonSchema: JSONSchema;
  ptrMap: Record<string, string>;
  notes: Array<{code:string, canonPath:string, details:any}>;
};

type ComposeResult = {
  coverageIndex: {
    has(name: string): boolean;
    enumerate?: (k: number) => string[]; // exposed only if finite
    provenance: any;                      // source of coverage decisions
  };
  planDiag: Array<{code:string, canonPath:string, details:any}>;
  nameDfaSummary?: { states: number; finite: boolean; capsHit?: boolean };
};

type ValidateResult = { valid: boolean; ajvErrors?: any[] };

function Normalize(schema: JSONSchema, opts): NormalizeResult;
function Compose(canonSchema: JSONSchema, opts): ComposeResult;
function Generate(k: number, seed: number, opts): AsyncIterable<any>;
function Validate(instance: any, originalSchema: JSONSchema, ajvOpts): ValidateResult;
```

* `Generate` **MUST** be deterministic given `seed`.
* `Validate` **MUST** run on the **original** schema with enforced AJV options.

### 7.2 CLI

```bash
foundrydata schema.json \
  --mode strict \
  --seed 123 \
  --prefer-examples \
  --n 10 \
  --out ndjson
```

* `--prefer-examples` **MUST** use `example` / `examples.default` when present; otherwise generate.
* `--out ndjson` **MUST** produce fixtures suitable for mocks/tests.

### 7.3 OpenAPI 3.1+ Drivers (Out of Core)

* The driver **MUST** select `content`/`schema` per operation/response, apply `--prefer-examples`, propagate `--seed`, and export NDJSON fixtures.
* Provide **thin adapters** for MSW/Prism; the core generator is reused as‑is.

---

## 8. Acceptance Tests

1. **DFA emptiness (strong):**

```json
{
  "type":"object",
  "additionalProperties": false,
  "patternProperties": { "^[a-z]{3}$": {} },
  "propertyNames": { "pattern": "^[a-z]{2}$" },
  "minProperties": 1
}
```

→ Product DFA is empty → `UNSAT_AP_FALSE_EMPTY_COVERAGE`.

2. **BFS witnesses (min‑lex):**

```json
{
  "type":"object",
  "additionalProperties": false,
  "patternProperties": { "^(?:x|y)[a-z]$": {} },
  "minProperties": 2
}
```

`enumerate(2)` = `["xa","ya"]` (shortest length, then UTF‑16).

3. **Fail‑fast Strict with non‑safe pattern:**

```json
{
  "type":"object",
  "additionalProperties": false,
  "patternProperties": { "^(?=x).+$": {} },
  "minProperties": 1
}
```

Strict: `AP_FALSE_UNSAFE_PATTERN` (fatal). Lax: warn + conservative exclusion.

4. **`required` vs `propertyNames`:**

```json
{
  "type":"object",
  "propertyNames": { "pattern": "^[a-z]+$" },
  "required": ["ID"]
}
```

→ `UNSAT_REQUIRED_VS_PROPERTYNAMES`.

5. **`contains` impossible:**

```json
{
  "type":"array",
  "maxItems": 2,
  "minContains": 3,
  "contains": {}
}
```

→ `UNSAT_CONTAINS_VS_MAXITEMS`.

6. **External `$ref` handling:**

* Strict: AJV compile failure on external refs → `EXTERNAL_REF_UNRESOLVED{mode:"strict"}`.
* Lax: warn + `skippedValidation:true` only if the cause is **exclusively** unresolved external refs.

7. **Determinism:**

* Same `(seed, flags, AJV.major, registryFingerprint)` → identical instances, coverage, metrics.

---

## 9. Non‑Goals (to avoid ambiguity)

* No semantic‑changing rewrites (the original remains the AJV oracle).
* No remote resolution in the core.
* No “invented” content when the schema is permissive (empty objects may remain valid).

---

## 10. Non‑Normative Implementation Notes

* **Regex → NFA → DFA:** restricted grammar (character classes, groups, alternation, `?*+`, bounded quantifiers); subset construction with explicit state caps; product automata for `allOf`. Non‑anchored, look‑around, or capped patterns act as guards only (not used to build coverage DFAs).
* **Ordering:** transitions by increasing UTF‑16 code points; one BFS to drive both `has` (reachability) and `enumerate` (witnesses).
* **Local SMT:** QF_LIA (integers) with rationals for `multipleOf`; strict timeout; clear fallback and `SOLVER_TIMEOUT` diagnostics.
* **Observability:** `nameDfaSummary` reports state counts and finiteness; do **not** export the full graph.

---
