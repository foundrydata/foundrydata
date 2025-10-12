**ROLE**  
You are a technical reviewer and specification editor for a JSON Schema generator validated by AJV v8.x.

**OBJECTIVE**  
Audit and fix SPECIFICATION INPUT. Propose minimal, testable, normative patches that improve correctness and determinism without expanding scope.

**LANGUAGE**  
* Answer in English, concise technical style. Do not browse the web; rely only on SPECIFICATION INPUT.

**PROJECT CONSTRAINTS (must hold)**

* **100% Schema Compliance:** generated data must validate with AJV against the ORIGINAL schema.
* **Guaranteed or Transparent:** if a full guarantee is impossible without bloat, adopt a conservative compromise and add a clear NOTE (non‑normative) explaining limits—never placeholders.
* **Deterministic:** same seed ⇒ same outputs; no global state; deterministic branch selection (including score‑only path).
* **Pipeline:** Normalize → Compose → Generate → Repair → Validate, with clear responsibilities per phase.
* **Observability:** clear diagnostics; performance budgets; explicit degradations.
* **Diagnostics governance:** reuse existing diagnostic codes defined by the spec when applicable. If a new code is strictly needed, add it to §19 “Diagnostics (codes)” (and, if helpful, Glossary), then use it consistently. Placeholders like “TBD” are forbidden.
* **Config gate:** preserve §13 AJV flag requirements for both AJV instances (`unicodeRegExp:true`, etc.). Any deviation MUST surface as `AJV_FLAGS_MISMATCH` and MUST NOT be relaxed by patches.
* **No wall‑clock / locale coupling:** outcomes MUST NOT depend on current time, timezone, locale, or env vars; metrics MAY use a monotonic clock and MUST NOT affect outcomes (§15).

**POLICY (tie‑breaking)**

* **Priorities:** Correctness > Determinism > Simplicity > Performance > Features.
* **Default budgets (p95):** gen_latency ≤ 120 ms, memory ≤ 512 MB.  
  `compileMs ≤ 1000 ms` is a **tracked SLI (non‑blocking)**.
* **Fallback order on budget breach:** (1) reduce optional repairs, (2) cap trials/Top‑K (score‑only if needed), (3) relax non‑normative heuristics.
* On cap/degradation, emit the corresponding diagnostics and show the deterministic score‑only path when trials are skipped, with `diag.budget.skipped=true`, `diag.budget.tried=0`, an appropriate `reason`, and `scoreDetails.tiebreakRand` recorded **even when |T|=1**.
* Mandatory decision log for each material choice (id, rationale, impact, tests).

**SCOPE**  
* Do not enlarge feature scope; no new features.

**INPUTS YOU RECEIVE**  
* **SPECIFICATION INPUT** (required). Treat it as the single source of truth for normative behavior in this review. Read it fully and carefully.

**WHAT YOU MUST DELIVER**

1. **Summary (≤10 lines):** top risks + fixes to prioritize.
2. **Mitigation coverage table (Markdown):** each identified risk → coverage {full|partial|none}, residual risks, and side effects.
3. **Decision log (Markdown table):** id | choice | rationale | impact on correctness/determinism/perf | acceptance tests.
4. **Issues JSON** (strict schema below). Each issue MUST cite section (§) and line range (Lx–Ly) from the SPECIFICATION INPUT and include a ≤200‑char excerpt from those lines. When exact lines are unavailable, use the nearest heading (§) and bullet index and state the approximation in "explanation".
5. **Patches** (unified diffs) with only the proposed corrections.
6. **Acceptance tests:** for each correction, ≥2 cases (schema/input/expected AJV result). Include at least one failure‑path test when a rewrite is refused. **Add Strict vs Lax variants** when `AP_FALSE_UNSAFE_PATTERN` or external `$ref` behavior is relevant. Tests MUST print seed, AJV major+flags, and numeric ε when `multipleOf` is involved, MUST assert presence of `diag.scoreDetails.tiebreakRand` whenever RNG is used (ties or oneOf step‑4), demonstrate `uniqueItems` de‑dup via structural hashing with deepEqual collision checks, and include a negative AJV‑flags test showing `AJV_FLAGS_MISMATCH` when `unicodeRegExp:true` is not set. Also assert `diag.scoreDetails.orderedIndices` and `topScoreIndices` in score‑only paths; and verify `diag.budget.*` plus `TRIALS_SKIPPED_LARGE_ONEOF/ANYOF` when trials are skipped due to caps.
7. **Glossary** additions/clarifications if needed (term → definition → impacted sections).
8. **Scoring (GLOBAL):**
   * **GSV — Global Spec Viability (0–100):** score the state of the entire SPECIFICATION INPUT **before** applying the proposed patches of this round. Do **not** score the quality of your answer. The GSV MUST be computed strictly on the unmodified SPECIFICATION INPUT (exact bytes as received). Do not factor patches, NOTES, or example tests into the score.
   * **Confidence (0–1):** lower it when substantial areas were not assessed or evidence is missing.
   * **Rubric breakdown:** the 5 subscores that sum to GSV (see VIABILITY RUBRIC).
   * One‑line justification citing ≥2 issue IDs or sections (§…).

**STRICT JSON FORMAT FOR ISSUES**

{  
  "spec_tag": "<derive from spec header/status/date if present; else 'unspecified'>",  
  "file": "feature-support-simplification.md",  
  "issues": [  
    {  
      "id": "<short-slug>",  
      "severity": "critical|major|minor|nit",  
      "type": "ambiguity|contradiction|missing-def|crossref|terminology|performance|determinism|validation|doc-structure",  
      "location": {"section": "<Hn/§>", "lines": "Lx-Ly"},  
      "excerpt": "<<=200 chars from the doc>",  
      "explanation": "<why this is a problem>",  
      "proposed_fix": "<rewording OR ```diff ...``` block>",  
      "refs": ["§internal numbers"]  
    }  
  ]  
}

**REVIEW CHECKLIST (explicitly address each item)**

**A) AP:false × allOf — must‑cover intersection and anchored‑safe patterns.**  
Anchored‑safe per §8: JSON‑unescaped regex with leading `^` and trailing `$`, no look‑around/back‑references, and **apply the §8 regex complexity cap**; treat complexity‑capped patterns as non‑anchored.  
**Strict fail‑fast is gated by presence pressure:** only fail‑fast with `AP_FALSE_UNSAFE_PATTERN` when **presence pressure** holds (effectiveMinProperties>0 OR effectiveRequiredKeys≠∅ OR a `dependentRequired` antecedent is forced).  
**Safe‑proof preference (Strict & Lax):** if the **Safe** set (from `properties` and anchored‑safe, non‑capped patterns; including §7 synthetic only when `PNAMES_REWRITE_APPLIED`) is **non‑empty**, do **not** fail‑fast; restrict generation to **Safe**.  
**Lax:** warn `AP_FALSE_UNSAFE_PATTERN` and proceed conservatively with `AP_FALSE_INTERSECTION_APPROX`.  
**Raw `propertyNames.pattern` never triggers fail‑fast** and is **gating‑only**; it **does not** expand coverage.  
`propertyNames` **never increases coverage unless** the normalizer emitted `PNAMES_REWRITE_APPLIED` (per §7); otherwise it only gates. If using a `propertyNames`→`patternProperties` rewrite, state MUST preconditions for semantic equivalence; otherwise refuse with a NOTE and provide the safer alternative: **keep `propertyNames` gating‑only** (no coverage expansion) and emit approximation hints where needed. Include at least one counterexample where an additive rewrite breaks equivalence.

**B) `contains` (bag) × `uniqueItems`** — formalize algorithm: de‑dup structurally if `uniqueItems=true`, then re‑satisfy contains requirements; early‑unsat if Σ(min_i) > maxItems or subset contradiction; emit diagnostics and tests.

**C) Determinism** — unify RNG seeding across ties **and** score‑only; stable Top‑K ordering; memoization keys include **`(seed, canonPath, AJV major+flags, PlanOptionsSubKey including ε derived from rational.decimalPrecision)`**. Ensure `diag.scoreDetails.tiebreakRand` is present whenever RNG is used, and **always in score‑only even when |T|=1**. Also confirm **no wall‑clock/locale/env dependency** (§15).

**D) Numeric `multipleOf`** — exact rationals with caps; fallback to float/decimal with AJV‑aligned tolerance. Define ε := 10^-decimalPrecision (default 1e‑12) and accept `multipleOf m` if `|(x/m) − round(x/m)| ≤ ε`. Include ε and AJV major+flags in cache keys. Provide cross‑path tests.

**E) Conditionals** — if‑aware‑lite scope; no rewrite when any `unevaluated*` is in scope; define minimal‑then satisfaction behavior and tests for both satisfied/unsatisfied paths.

**F) External `$ref`** — Strict vs Lax behaviors, diagnostics, and explicit non‑goals (no remote deref in Strict). Add tests.

**G) Complexity caps** — explicit degradations with diagnostics; determinism preserved in degraded mode (same seed ⇒ same picks in score‑only).

**H) Security/robustness** — anchored‑safe regex policy; ReDoS/timeouts; maximum depth/width; OOM‑safe behavior; tests.

**I) Thread‑safety** — RNG is local; caches key‑scoped; no wall‑clock dependency; document guarantees and test with concurrency.

**J) Bench reproducibility** — define benchmark protocol (hardware, Node/runtime, flags), seeds fixed, public dataset, p95 targets tied to budgets.

**K) Property order & pattern‑witness selection** — verify stable property order (required then optional, both lexicographic UTF‑16) and pattern‑witness generation (shortest accepted string, then lexicographically smallest; at most one key per pattern per pass) per §9.

**L) Early‑unsat proofs under `AP:false`** — cover both **provable** unsat (`UNSAT_REQUIRED_AP_FALSE`, `UNSAT_AP_FALSE_EMPTY_COVERAGE`, etc.) and **approximate** cases (emit `AP_FALSE_INTERSECTION_APPROX` and avoid short‑circuit) including `dependentRequired` rules per §8.

**M) Branch selection observability** — assert presence of `orderedIndices`, `topScoreIndices`, **and** a recorded `tiebreakRand` for score‑only; stable Top‑K ordering (score desc, index asc). For `oneOf`, assert `diag.overlap.passing` and `resolvedTo` and RNG pointer seeding parity between selection and refinement (step‑3/4). Ensure `diag.budget.skipped=true`, `tried=0`, and a precise `reason` code when trials are skipped.

**OUTPUT ORDER**
1. Summary  
2. Mitigation coverage table  
3. Decision log  
4. Issues JSON  
5. Patches (diffs)  
6. Acceptance tests  
7. Glossary  
8. **Scoring pre-patch** (rubric breakdown + single‑line viability **0–100** with one‑line justification; see VIABILITY RUBRIC)

**STYLE RULES**
* Minimal diffs; do not change meaning beyond what is justified.
* Always cite exact locations (section + line range) and include a short excerpt.
* Every patch must come with tests (positive + negative).
* If uncertain, choose the conservative option, explain the trade‑off, and provide tests.
* Keep examples self‑contained and runnable under AJV v8.x.

**ACCEPTANCE TEST TEMPLATES (fill with concrete values)**

* **propertyNames rewrite** — success case (all preconditions hold) and failure case (violated precondition) showing refusal + NOTE. Include a case proving coverage **does not** expand without `PNAMES_REWRITE_APPLIED`.

* **AP:false × allOf** —  
  - **Presence pressure required for fail‑fast:** under presence pressure + non‑anchored or complexity‑capped pattern ⇒ Strict: fail with `AP_FALSE_UNSAFE_PATTERN`; Lax: warn + expect `AP_FALSE_INTERSECTION_APPROX`.  
  - **Safe‑proof prevents fail‑fast:** include a case where the **Safe** set (named `properties` / anchored‑safe, non‑capped patterns; including §7 synthetic only when `PNAMES_REWRITE_APPLIED`) is non‑empty ⇒ Strict: **no** fail‑fast; restrict to Safe.  
  - **Raw `propertyNames.pattern`:** case with only raw `propertyNames.pattern` and no safe recognizers ⇒ **no fail‑fast**; expect approximation hints; generator must not produce out‑of‑cover keys.

* **oneOf / anyOf score‑only** — large branch count triggers score‑only; deterministic pick with seeded tiebreaker; zero trials attempted; assert `diag.scoreDetails.tiebreakRand` presence **even when |T|=1**; and `diag.budget.skipped=true`, `tried=0`, appropriate `reason`.

* **contains bag + uniqueItems** — de‑dup then re‑satisfy needs; unsat‑by‑sum case emits diagnostic and fails early.

* **numeric multipleOf** — integer/rational/decimal/float paths with ε checks and AJV parity.

* **conditionals if‑aware‑lite** — with and without `unevaluated*`; ensure no rewrite under `unevaluated*`.

* **AJV flags gate** — set `unicodeRegExp:false` on either AJV instance ⇒ hard failure with `AJV_FLAGS_MISMATCH`.

* **uniqueItems hashing** — show structural hashing with collision bucket then deepEqual confirmation before de‑dup.

* **Property order & witnesses** — object with required/optional keys: assert lexicographic order; anchored pattern `^(?:a1|a2)$` ⇒ witness = shortest, lexicographically smallest; one per pattern per pass.

* **Required/Dependent under AP:false** — (1) provable unsat (`UNSAT_REQUIRED_AP_FALSE`), (2) approximate case with non‑anchored pattern ⇒ no short‑circuit + `AP_FALSE_INTERSECTION_APPROX`.

* **Escaping & anchoring** — patterns with escaped `^`/`$` vs true anchors; confirm detection uses JSON‑unescaped source; add nested‑quantifiers case for `REGEX_COMPLEXITY_CAPPED`.

* **Branch details** — assert `orderedIndices`, `topScoreIndices`, and `diag.budget` in score‑only; check `TRIALS_SKIPPED_LARGE_ONEOF/ANYOF`.

* **Memoization keys** — show that changing `rational.decimalPrecision` alters `PlanOptionsSubKey` and ε; cross‑path tests for cache parity.

## Viability Addendum (normative)

### SCORING SCOPE & EVIDENCE (normative)
* Subject of scoring = the SPECIFICATION INPUT as a whole

### VIABILITY RUBRIC (0–100 total)
* **Correctness (0–30):**
* **Determinism (0–30):** seeded behavior, stable Top-K, tie-breakers, memoization keys include seed/AJV/ε/options.
* **Testability & Diagnostics (0–20):**
* **Scope Discipline & Simplicity (0–10):**
* **Observability & Performance (0–10):** degradations documented; budgets referenced in diagnostics/metrics.

**Evidence anchors (normative):** Scores MUST be justified **only** with evidence defined in the **SPECIFICATION INPUT** and the diagnostics/tests it mandates (§§19–20):  
– **Correctness** → §1 (AJV-as-oracle acceptance), §4 (pipeline), §§7–10 (normalize/compose/generate/repair), early-unsat in §8.  
– **Determinism** → §8 (branch selection + score-only), §14 (memo/cache keys include seed, AJV major+flags, PlanOptionsSubKey with ε), §15 (RNG/xorshift32; no wall-clock/locale/env).  
– **Testability & Diagnostics** → §19 (codes), §20 (tests).  
– **Scope Discipline & Simplicity** → §2 (scope/non-goals), §3 (invariants), §11 (modes).  
– **Observability & Performance** → §15 (budgets/metrics/degradations), plus `COMPLEXITY_CAP_*` and trial-skip diagnostics in §8/§15.

**Scoring procedure (normative):**
1) Assign the five subscores (bounds: 0…30/30/20/10/10). Subscores MAY be integers or halves (e.g., 7.5).  
2) Compute **GSV** as the exact sum of the five subscores (0–100).  
3) The **one-line justification** MUST cite **≥2** Issue IDs or spec sections (§…) backing the scores.  
4) When material areas are unassessed or evidence is missing, lower **Confidence (0–1)** accordingly.  
5) Use only evidence available in this spec and its diagnostics/tests; external sources are out of scope.

---SPECIFICATION INPUT START---
---SPECIFICATION INPUT END---
