
You are a senior TypeScript engineer working in the FoundryData monorepo.

ARCHITECTURE CONTEXT (READ FIRST)
---------------------------------
Project structure & 5-stage pipeline:
- Stages: Normalize → Compose → Generate → Repair → Validate
- Key modules:
  - packages/core/src/transform/schema-normalizer.ts        (Stage 1)
  - packages/core/src/transform/composition-engine.ts       (Stage 2)
  - packages/core/src/generator/foundry-generator.ts        (Stage 3)
  - packages/core/src/repair/repair-engine.ts               (Stage 4)
  - packages/core/src/pipeline/orchestrator.ts              (Stage 5)
- AJV instances: two separate caches/configs (planning vs final/original)
- No network I/O in core; external $ref resolver lives in a pre-phase (R1) out of core.
- Deterministic RNG, metrics per phase (normalizeMs, composeMs, ...), and graceful degradation via caps.

SPECS & PRECEDENCE
------------------
- Primary normative spec (single source of truth):
  docs/jsg-p1-automata-smt.md
- Legacy spec (non-normative background ONLY: invariants, diagnostics, AJV parity, Strict/Lax, determinism & metrics):
  docs/feature-simplification/spec-canonical-json-schema-generator.md
- Precedence rule: If any statement conflicts, **JSG-P1 prevails**.

GOAL
----
Implement JSG-P1 in the existing 5-stage pipeline with:
1) Exact object-name coverage under `additionalProperties:false` via **name automata** (anchored-safe regex → NFA → capped DFA → product/intersection across `allOf`, emptiness/finiteness, BFS witnesses).
2) Robust arrays/numbers reasoning via **sound rules** (with **optional local SMT** under strict timeout & feature flag).
3) Stable **diagnostics** and **CoverageIndex** API.
4) CLI + thin **OpenAPI** driver hooks (prefer examples, NDJSON fixtures).
5) Keep AJV as oracle; validate outputs against the **original schema**.

HARD CONSTRAINTS
----------------
- Node ≥ 18; TypeScript "strict"; ESM modules.
- AJV v8 with `unicodeRegExp:true` for BOTH planning and final validation; fail with `AJV_OPTIONS_MISMATCH` on divergence.
- Determinism: local xorshift32 seeded by (seed, canonPath); no wall clock/locale; no global mutable state.
- Regex policy: only **anchored-safe** (`^...$`, no look-around, no backrefs) compiled to automata; apply complexity caps (length + quantified groups). Non-safe/capped patterns are **guards only**.
- Core MUST NOT do network I/O. R1 resolver is out of core.
- Do not expose `enumerate()` when finiteness stems solely from raw propertyNames.enum (unless strict additive rewrite is applied and flagged).

IMPLEMENTATION PLAN (FIT TO EXISTING MODULES)
---------------------------------------------
Stage 1 — Normalize (non-destructive):
- Keep canonical 2020-12 view; maintain ptr maps canon↔original; do NOT rewrite in scopes with `unevaluated*` (emit notes).
- File: packages/core/src/transform/schema-normalizer.ts
- Output: unchanged contracts; add notes like `*_SKIPPED_UNEVALUATED`.

Stage 2 — Compose (add automata & arrays/numbers rules):
- Introduce a name automata subsystem under transform/, called by composition-engine:
  NEW FILES (create):
    packages/core/src/transform/name-automata/regex.ts            # anchored-safe check + complexity score + restricted parser
    packages/core/src/transform/name-automata/nfa.ts              # Thompson construction
    packages/core/src/transform/name-automata/dfa.ts              # subset construction; reachability; acceptance
    packages/core/src/transform/name-automata/product.ts          # DFA product/intersection across allOf conjuncts with AP:false
    packages/core/src/transform/name-automata/bfs.ts              # shortest-word BFS; UTF-16 ordering
    packages/core/src/transform/name-automata/coverage-index.ts   # has()/enumerate() (finite only) + provenance tagging
    packages/core/src/transform/name-automata/types.ts            # types for DFAs, caps, provenance
- Wire into composition-engine.ts:
  - For each object scope with AP:false, build per-conjunct DFAs:
      * properties (exact literals) → single-string DFAs
      * patternProperties (anchored-safe & not capped) → Regex→NFA→capped DFA
      * propertyNames: default guard-only; optional additive rewrites (flag-gated, strictly equivalent) → emit `PNAMES_REWRITE_APPLIED` and mark synthetic provenance
  - Build product DFA A across AP:false conjuncts; decide emptiness & finiteness; provide BFS witnesses (shortest length → UTF‑16)
  - Expose CoverageIndex:
      * has(name): boolean (pure) via product DFA
      * enumerate?(k): string[] only if finiteness proven and not solely from raw propertyNames.enum
      * provenance: which literal/pattern satisfied, and from which conjunct
  - Emit early-UNSAT:
      * `UNSAT_AP_FALSE_EMPTY_COVERAGE` when A = ∅ under presence pressure
      * `UNSAT_REQUIRED_VS_PROPERTYNAMES` when required name ∉ A
      * `UNSAT_MINPROPERTIES_VS_COVERAGE` when finite A and |A| < minProperties
  - Modes:
      * Strict: if non-emptiness requires non-safe/capped patterns under presence pressure, after safe-only attempt → `AP_FALSE_UNSAFE_PATTERN` (fatal)
      * Lax: same code as warn + conservative exclusion
- Arrays/numbers rules (sound first), integrate here for planning:
  NEW/UPDATED:
    packages/core/src/transform/arrays/contains-bag.ts        # Σ min_i > maxItems ⇒ UNSAT_CONTAINS_VS_MAXITEMS; disjointness checks; overlap unknown
    packages/core/src/transform/numbers/bounds.ts              # contradictory bounds
    packages/core/src/transform/numbers/multiple-of.ts         # rational multipleOf consistent with AJV
  OPTIONAL SMT (feature-flagged):
    packages/core/src/transform/smt/solver.ts                  # local QF_LIA (WASM), strict timeout; on timeout → `SOLVER_TIMEOUT` + fallback

Stage 3 — Generate:
- Use CoverageIndex for picking names; generate minimal witnesses for values; deterministic ordering.
- Respect `enum/const` precedence; arrays satisfy bagged `contains` then enforce `uniqueItems`.
- File: packages/core/src/generator/foundry-generator.ts

Stage 4 — Repair:
- AJV-guided minimal fixes (idempotent, budgeted); keep stagnation guard.
- File: packages/core/src/repair/repair-engine.ts

Stage 5 — Validate:
- Always validate **against original schema** with the “original” AJV instance; enforce AJV parity.
- Collect metrics per phase; surface diagnostics for any stop.
- File: packages/core/src/pipeline/orchestrator.ts

DIAGNOSTICS (REUSE/EXTEND)
--------------------------
Envelope: { code, canonPath, details } with single canonPath.
Codes to implement/use:
- AP_FALSE_UNSAFE_PATTERN {sourceKind, patternSource, mode}
- UNSAT_AP_FALSE_EMPTY_COVERAGE {proofSummary}
- UNSAT_REQUIRED_VS_PROPERTYNAMES {required, propertyNames}
- UNSAT_MINPROPERTIES_VS_COVERAGE {minProperties, coverageSize}
- NAME_AUTOMATON_COMPLEXITY_CAPPED {statesCap?, productStatesCap?}
- REGEX_COMPLEXITY_CAPPED {pattern, statesCap}
- REGEX_COMPILE_ERROR {pattern, message}
- UNSAT_CONTAINS_VS_MAXITEMS {sumMinContains, maxItems}
- SOLVER_TIMEOUT {timeoutMs}
- EXTERNAL_REF_UNRESOLVED {mode, skippedValidation?}
- AJV_OPTIONS_MISMATCH {planOptions, validateOptions}

PUBLIC API (KEEP SHAPES; EXPORT FROM packages/core/src/index.ts)
-----------------------------------------------------------------
export type Diagnostic = { code: string; canonPath: string; details: Record<string, unknown> };

export type NormalizeResult = {
  canonSchema: unknown;
  ptrMap: Record<string, string>;
  notes: Diagnostic[];
};

export type CoverageIndex = {
  has(name: string): boolean;             // pure, deterministic
  enumerate?: (k: number) => string[];    // only if finiteness is proven
  provenance: Record<string, unknown>;
};

export type ComposeResult = {
  coverageIndex: CoverageIndex;
  planDiag: Diagnostic[];
  nameDfaSummary?: { states: number; finite: boolean; capsHit?: boolean };
};

export type ValidateResult = { valid: boolean; ajvErrors?: unknown[] };

export function Normalize(schema: unknown, opts: { ajvOptions?: any }): NormalizeResult;
export function Compose(canonSchema: unknown, opts: {
  mode: "strict" | "lax";
  caps: { maxAutomatonStates: number; maxProductStates: number; maxKEnumeration: number };
}): ComposeResult;
export function Generate(k: number, seed: number, opts?: { preferExamples?: boolean }): AsyncIterable<unknown>;
export function Validate(instance: unknown, originalSchema: unknown, ajvOptions?: any): ValidateResult;

TEST PLAN (place under packages/core/**/__tests__ and tests/)
-------------------------------------------------------------
Acceptance (must pass):
1) DFA emptiness:
   {
     "type":"object", "additionalProperties": false,
     "patternProperties": { "^[a-z]{3}$": {} },
     "propertyNames": { "pattern": "^[a-z]{2}$" },
     "minProperties": 1
   }
   → UNSAT_AP_FALSE_EMPTY_COVERAGE.

2) BFS witnesses (min-lex):
   {
     "type":"object", "additionalProperties": false,
     "patternProperties": { "^(?:x|y)[a-z]$": {} },
     "minProperties": 2
   }
   enumerate(2) → ["xa","ya"].

3) Strict fail-fast with non-safe pattern:
   { "type":"object", "additionalProperties": false,
     "patternProperties": { "^(?=x).+$": {} }, "minProperties": 1 }
   Strict → AP_FALSE_UNSAFE_PATTERN (fatal); Lax → warn + exclusion.

4) required vs propertyNames:
   { "type":"object", "propertyNames": { "pattern": "^[a-z]+$" }, "required": ["ID"] }
   → UNSAT_REQUIRED_VS_PROPERTYNAMES.

5) contains impossible:
   { "type":"array", "maxItems": 2, "minContains": 3, "contains": {} }
   → UNSAT_CONTAINS_VS_MAXITEMS.

6) External $ref handling:
   Strict compile failure → EXTERNAL_REF_UNRESOLVED{mode:"strict"}.
   Lax → warn + skippedValidation:true ONLY if failure is exclusively external-refs.

7) Determinism:
   Same (seed, flags, AJV.major, registryFingerprint) ⇒ identical instances, coverage, metrics.

Recommended file placement:
- packages/core/src/transform/__tests__/name-automata/*.spec.ts
- packages/core/src/transform/__tests__/arrays/*.spec.ts
- packages/core/src/transform/__tests__/numbers/*.spec.ts
- packages/core/src/pipeline/__tests__/orchestrator.integration.spec.ts
- repository-level tests/acceptance/*.spec.ts if you keep a shared harness.

WORKFLOW
--------
1) Read both docs; extract a TODO checklist from JSG-P1 at the top of composition-engine.ts.
2) Implement diagnostics/types → regex policy → nfa/dfa/product/emptiness/finiteness/bfs → CoverageIndex → arrays/numbers rules → AJV integration → CLI → OpenAPI hooks.
3) After each step, add unit + acceptance tests and make them pass; wire metrics in orchestrator (per-phase timings, validationsPerRow, repairPassesPerRow; cap hits).
4) Enforce AJV parity on startup; throw AJV_OPTIONS_MISMATCH on mismatch.
5) No network I/O from the core at any time.
