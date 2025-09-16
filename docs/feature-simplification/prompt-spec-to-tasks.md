SYSTEM / ROLE
You are GPT-5 Pro. Convert the SPEC (provided INLINE between ---SPEC START--- and ---SPEC END---) into a complete Taskmaster backlog JSON so an agent (Claude Code) can implement tasks without copying the SPEC text. Operate in reference-only mode with on-demand retrieval of SPEC sections.

REFERENCE-ONLY, RUNTIME RESOLUTION & RETRIEVAL RULES (must enforce)

* You READ the SPEC from the INLINE paste to build the backlog.
* For every SPEC task (9100..9124), the retrieval descriptor in details MUST resolve at runtime from a FILE:
  - "source":"FILE"
  - "uri":"docs/feature-simplification/feature-support-simplification.md"
* Do NOT embed or paraphrase SPEC section text in any field of tasks 9100..9124. Never paste verbatim section bodies in details, title, description, testStrategy, or subtasks.
* For each SPEC task (9100..9124), put a retrieval descriptor (see format below) in details, and index only the relevant anchors in subtasks.file (e.g., "spec://§8#coverage-index-export").
* Retrieval scope is minimal: fetch only the sections/anchors needed by the dependent implementation tasks; do not pollute the LLM context with unrelated sections.
* All consumption of SPEC content is via retrieval; no summarization for 9100..9124 (store only pointers). Implementation tasks may quote short normative lines only as micro-citations (≤200 chars) when strictly necessary for tests; otherwise reference anchors.

ANCHOR RESOLUTION (MUST APPLY)

* The SPEC markdown uses HTML anchors of the form `<a id="sN-slug"></a>` placed immediately before the target headings.
* Every logical SPEC pointer of the form `spec://§<n>#<slug>` maps to the physical markdown anchor:
  `docs/feature-simplification/feature-support-simplification.md#s<n>-<slug>`
  (i.e., prefix the slug with `s<n>-` and use the file path above).
* Anchor validation:
  - Only include anchors that exist in the pasted SPEC. If none are relevant, set "anchors":[].
  - Before emitting any anchor, syntactically validate it matches `^spec://§\d+#[-a-z0-9]+$` and that the corresponding `<a id="s<n>-<slug"></a>` exists in the SPEC.
  - If an anchor is missing, omit it rather than inventing or approximating.
* Do not emit URL schemes anywhere. Keep subtasks.file as `spec://§<n>#<slug>`. The mapping above is for the agent’s retrieval at run time.

Common anchor slugs (reference)
- §8: spec://§8#coverage-index-export, spec://§8#branch-selection, spec://§8#oneof-exclusivity
- §9: spec://§9#if-aware-lite, spec://§9#pattern-witness-selection, spec://§9#arrays-contains
- §10: spec://§10#mapping, spec://§10#propertynames-rename-guard, spec://§10#structural-hashing
- §13: spec://§13#startup-config-check
- §14: spec://§14#planoptionssubkey
(Use exactly these slugs; do not invent variants.)

RETRIEVAL DESCRIPTOR (put this as a JSON string in each SPEC task’s details)

* Format (string content is JSON; escape as needed for valid JSON):
  REFONLY::{"source":"FILE","uri":"docs/feature-simplification/feature-support-simplification.md","section":"§<n>","anchors":["spec://§<n>#<slug>",...],"notes":"no-embed; fetch-on-demand"}
* Escaping rule (ENFORCED): `details` is a JSON **string** whose content is a JSON **object** prefixed by `REFONLY::`. Therefore, **escape all inner quotes and backslashes** so the outer JSON remains valid. `details` MUST start with `REFONLY::` and the inner content MUST end with `}`.
* "anchors" MAY be an empty array when no relevant anchors exist.
* Validation rule:
  - The outer JSON must parse; the inner REFONLY JSON must parse after stripping the `REFONLY::` prefix.
  - Reject outputs where the inner JSON is not well-formed.

* Correct examples (copy-style):

  - SPEC task with two anchors (escaped for outer JSON string):
    REFONLY::{\"source\":\"FILE\",\"uri\":\"docs/feature-simplification/feature-support-simplification.md\",\"section\":\"§8\",\"anchors\":[\"spec://§8#coverage-index-export\",\"spec://§8#branch-selection\"],\"notes\":\"no-embed; fetch-on-demand\"}

  - SPEC task with three anchors (escaped):
    REFONLY::{\"source\":\"FILE\",\"uri\":\"docs/feature-simplification/feature-support-simplification.md\",\"section\":\"§10\",\"anchors\":[\"spec://§10#mapping\",\"spec://§10#propertynames-rename-guard\",\"spec://§10#structural-hashing\"],\"notes\":\"no-embed; fetch-on-demand\"}

REFONLY JSON STRING ESCAPING FOR IMPLEMENTATION TASKS

* If you include a `[Retrieval] REFONLY::{...}` line inside an implementation task’s `details`, that line is **inside a JSON string** as well. Therefore, **escape the inner JSON** exactly the same way as above.
* Correct example inside `details` (escaped):
  [Retrieval] REFONLY::{\"source\":\"FILE\",\"uri\":\"docs/feature-simplification/feature-support-simplification.md\",\"section\":\"§22\",\"anchors\":[\"spec://§22#packages-core\",\"spec://§22#scripts\"],\"notes\":\"no-embed; fetch-on-demand\"}

CRITICAL OUTPUT CONSTRAINTS

* OUTPUT MUST BE A SINGLE VALID JSON ARRAY ([...]). NO prose, NO Markdown, NO comments, NO code fences.
* Use double quotes for all strings. No trailing commas. Ensure valid JSON.
* All IDs (tasks AND subtasks) MUST be globally unique.
* Output order (strict): [8000, 9000, 9050, 9100..9124 ascending, 1..24 ascending].
* No additional fields beyond the schema on any task/subtask.
* Do not emit URL schemes anywhere; REFONLY carries the real URI; subtasks.file uses spec://...
* LANGUAGE: ENGLISH ONLY for all fields.
* Local file paths are allowed (and expected) in implementation task subtasks (e.g., "packages/core/..."). Do not emit URL schemes ("file:", "http:", etc.).

TASK OBJECT SCHEMA (apply to every array element)
{
"id": number,
"title": string,
"description": string,
"priority": "high"|"medium"|"low",
"estimatedHours": number,
"dependencies": number[],
"status": "pending",
"complexityScore": 1|2|3|4|5,
"details": string,
"testStrategy": string,
"subtasks": [
  {
    "id": number,
    "title": string,
    "status": "pending",
    "estimatedHours": number,
    "file": string
  }
]
}

LANGUAGE POLICY

* Use ENGLISH ONLY for all fields.
* Keep controlled JSON fields exactly as specified (e.g., enum values).
* Do not translate normative keywords from the SPEC (MUST/SHOULD/MAY).

Section mapping
- 9100 → section "§0"
- 9101..9124 → sections "§1".."§24" respectively

ID PLAN & STRUCTURE (use EXACTLY these ids and linkages)

A) Agent operating instructions

* 8000 — "AGENT — Operating mode for Claude Code"
  * details: execution order, commands, DoD, retrieval discipline (see sample below).
  * dependencies: []

B) SPEC root & maintenance

* 9000 — "SPEC — Canonical Source (header & metadata)"
  * details: REFONLY retrieval descriptor for the SPEC source (status/audience; version/date/hash if present). Use "section":"§0" and anchors such as spec://§0#status, spec://§0#audience when available.
  * dependencies: []
* 9050 — "SPEC — Maintenance / Evolution"
  * details: REFONLY (use section "§24" — Norms & References — for versioning/semver references; anchors may be empty if not applicable).
  * dependencies: [9000]

C) SPEC sections (REFERENCE-ONLY: put retrieval descriptors into details)

* 9100 — Terminology (preamble — quick ref)  
  - Use section "§0" with anchors like: spec://§0#terminology, spec://§0#definitions.
* 9101 — §1 Goal
* 9102 — §2 Scope
* 9103 — §3 Principles & Invariants
* 9104 — §4 Operational guidance
* 9105 — §5 Configuration Overview
* 9106 — §6 High-Level Architecture
* 9107 — §7 Schema Normalizer (Canonicalization)
* 9108 — §8 Composition Engine
* 9109 — §9 Generator
* 9110 — §10 Repair Engine (AJV-Driven)
* 9111 — §11 Modes
* 9112 — §12 Draft Handling
* 9113 — §13 AJV Configuration
* 9114 — §14 Cache Strategy
* 9115 — §15 Performance, Determinism & Metrics
* 9116 — §16 Implementation Plan
* 9117 — §17 Documentation Additions
* 9118 — §18 Features Matrix
* 9119 — §19 Diagnostics (codes)
* 9120 — §20 Testing Strategy
* 9121 — §21 Risks & Mitigations
* 9122 — §22 Deliverables (Code)
* 9123 — §23 Appendix — Minimal Interfaces
* 9124 — §24 Norms & References

For EACH SPEC section task (9100..9124):
* priority: "low", estimatedHours: 0 (integer), status: "pending", complexityScore: 1.
* dependencies: [9000].
* description: "Reference-only: section §<n>."
* testStrategy: "None."
* details: the REFONLY retrieval descriptor string for that section (FILE + fixed URI), **with inner JSON correctly escaped** as specified above.
* subtasks: index only normative anchors and test-enabling anchors (e.g., §19.1 payloads) with file like "spec://§8#coverage-index-export", "spec://§7#object-keywords-pnames-rewrite". Avoid examples/notes-only anchors. If no relevant anchors exist, use an empty subtasks array.
* If §<n> is absent in the pasted SPEC, still emit the task with "anchors":[] and no subtasks.

Do not alter the dependency lists below. They are exact and normative for this run.

D) Implementation backlog (1..24) with EXACT dependencies
1  Scaffolding & Monorepo                  deps: [8000, 9000, 9106, 9122]
2  Dual AJV & Config Gate                  deps: [8000, 9000, 9113, 9101, 9112]
3  Utils: RNG, rationals, JSON-safe        deps: [8000, 9000, 9115, 9123, 9108]
4  Structural hashing & stable-hash        deps: [8000, 9000, 9110, 9114, 9124]
5  PtrMap canon→original                   deps: [8000, 9000, 9107, 9122]
6  Metrics & diagnostic envelope           deps: [8000, 9000, 9115, 9119, 9101]
7  Normalizer                              deps: [8000, 9000, 9107, 9112, 9108]
8  Composition Engine                      deps: [8000, 9000, 9108, 9107, 9113, 9111, 9115, 9114]
9  Generator                               deps: [8000, 9000, 9109, 9108, 9113, 9115]
10 Repair Engine                           deps: [8000, 9000, 9110, 9108, 9113]
11 Pipeline Orchestrator                   deps: [8000, 9000, 9106, 9101, 9113, 9115]
12 Modes & External $ref                   deps: [8000, 9000, 9111, 9112]
13 Draft handling & $dynamic*              deps: [8000, 9000, 9112]
14 Cache Strategy                          deps: [8000, 9000, 9114, 9115]
15 Bench Harness & Gates                   deps: [8000, 9000, 9115, 9101, 9122]
16 Diagnostics payload conformance         deps: [8000, 9000, 9119, 9108, 9107]
17 Unit Tests (per section)                deps: [8000, 9000, 9120]
18 Integration & e2e                       deps: [8000, 9000, 9120, 9111, 9112]
19 Documentation                           deps: [8000, 9000, 9117, 9118]
20 Fixtures & Bench profiles               deps: [8000, 9000, 9115, 9120]
21 Public API & TS types                   deps: [8000, 9000, 9123, 9122]
22 CI pipelines (lint, test, bench)        deps: [8000, 9000, 9101, 9115, 9120]
23 P2 refinements                          deps: [8000, 9000, 9116, 9108]
24 Packaging & Release                     deps: [8000, 9000, 9124, 9117]

For EACH implementation task (1..24):

* Priority policy (P0 → "high"): High for tasks {1,2,3,6,8,9,10,11,14,15,16,17,18,22}. Medium for {4,5,7,12,13,19,20,21,23,24}. (Adjust only if §16 in the pasted SPEC differs.)
* estimatedHours: reasonable integer; consistency with complexityScore:
  - complexityScore 2 → 4–8h
  - complexityScore 3 → 8–16h
  - complexityScore 4 → 16–32h
  - complexityScore 5 → 32–64h
  Do not exceed 64h per task.
* status: "pending"; complexityScore: 2..5.
* details (ENGLISH; REQUIRED sections, in this exact order). **When embedding a `[Retrieval] REFONLY::{...}` line here, escape the inner JSON as shown above.**
  [Context] SPEC anchors (§…).
  [Retrieval] REFONLY anchors to consult (minimal).
  [Key requirements] MUST/guards/caps to honor (quote ≤200 chars if strictly necessary for tests).
  [Deliverables] files to create/modify (per §22).
  [Commands] `pnpm i`, `pnpm -w build`, `pnpm -w test`, `pnpm -w bench`.
  [Definition of Done] verifiable criteria (green tests, diagnostics conform to §19.1, final AJV validation against original).
* testStrategy: MUST list (i) unit checks for mandated diagnostics at this task's scope, (ii) integration/e2e where applicable, (iii) CI/bench expectations per §15–§16.
* subtasks: one per concrete file or slice; use file paths per §22, e.g.:
  - packages/core/src/transform/schema-normalizer.ts
  - packages/core/src/transform/composition-engine.ts
  - packages/core/src/generator/foundry-generator.ts
  - packages/core/src/repair/repair-engine.ts
  - packages/core/src/parser/json-schema-parser.ts
  - packages/core/src/util/{ptr-map.ts,rational.ts,rng.ts,struct-hash.ts,metrics.ts,stable-hash.ts}
  - packages/core/src/diag/{codes.ts,schemas.ts,validate.ts}
  - packages/core/src/index.ts
  - scripts/bench.ts
  - tests: packages/core/test/*.spec.ts
  - docs: docs/{Invariants.md,Known-Limits.md,Features.md,README.md}

SUBTASK ID POLICY

* Use `subtask.id = (taskId * 1000) + ordinal`, with ordinal starting at 1 per task, to guarantee global uniqueness.

AGENT TASK 8000 — sample details content (put in English):
[Agent Instructions — Minimal + Guardrails]
[Goal]
- Execute implementation tasks strictly per SPEC; SPEC is the single source of truth for semantics. Do not enlarge feature scope.
[Retrieval]
- REFONLY via SPEC anchors. Do not paste SPEC text verbatim into tasks.
- Runtime mapping: spec://§<n>#<slug> → docs/feature-simplification/feature-support-simplification.md#s<n>-<slug>.
- Keep working context small: load only anchors required by the current task.
[Execution order]
1) Read §0 metadata (task 9000).
2) Build the reference index from 9100..9124 (anchors only).
3) Implement tasks 1..24 in numeric order, respecting declared dependencies.
4) Run tests and bench; validate Definition of Done.
[Environment]
- Node >= 18; TypeScript; pnpm; monorepo layout under packages/core/* (per SPEC §22).
[Commands]
- pnpm i
- pnpm -w build
- pnpm -w test
- pnpm -w bench
[Diagnostics — phase separation]
- REGEX_COMPLEXITY_CAPPED appears only from Normalize/Compose, with details.context ∈ {'coverage','rewrite'}.
- COMPLEXITY_CAP_PATTERNS appears only from the Generator (pattern‑witness search).
- Compose‑time caps (COMPLEXITY_CAP_ONEOF/ANYOF/ENUM/CONTAINS/SCHEMA_SIZE) are planning‑only; never emit them from the Generator.
[Branch bookkeeping (per SPEC §8)]
- Score‑only path: record diag.scoreDetails.tiebreakRand EVEN WHEN |T|=1.
- Score‑only budget: diag.budget = { skipped:true, tried:0, limit = trials.perBranch × K_effective, reason ∈ {'skipTrialsFlag','largeOneOf','largeAnyOf','complexityCap'} }, where K_effective = min(maxBranchesToTry, branches.length AFTER Compose‑time caps).
- oneOf exclusivity step‑4: if RNG is used (only when b* no longer passes), record diag.scoreDetails.exclusivityRand.
[AP:false coverage guardrails]
- Under additionalProperties:false, NEVER expand coverage from propertyNames.enum unless PNAMES_REWRITE_APPLIED is present.
- Fail‑fast (AP_FALSE_UNSAFE_PATTERN) ONLY when presence pressure exists at the object (effectiveMinProperties > 0 OR effectiveRequiredKeys ≠ ∅ OR an active dependentRequired antecedent). Otherwise, proceed via conservative exclusion (no fail‑fast).
- Raw propertyNames.pattern NEVER triggers AP_FALSE_UNSAFE_PATTERN; it is gating‑only unless PNAMES_REWRITE_APPLIED.
[Unevaluated guard]
- For unevaluatedProperties:false, only emit property names guaranteed “evaluated” by an applicator at the SAME instance location, either present directly OR reachable through an APPLIED subschema at that location (e.g., allOf conjuncts, the selected anyOf/oneOf branch, the active then/else of if, or a $ref target). dependentSchemas does not evaluate by itself; only applicators inside its active subschema do.
[AJV Config Gate (per SPEC §§12–13)]
- Two Ajv instances: Source (original schema) and Planning/Generation (canonical view). Both MUST set unicodeRegExp:true.
- Ajv class MUST match the source schema dialect (Ajv / Ajv2019 / Ajv2020 / ajv-draft-04). Do not mix 2020‑12 with earlier drafts in the same instance.
- validateFormats MUST be identical on both instances (both false, or both true with ajv-formats). Mismatches ⇒ AJV_FLAGS_MISMATCH.
- allowUnionTypes policy consistent with responsibilities (enabled on Planning/Generation when compiling union‑typed canonical views).
- If discriminator is claimed, set discriminator:true on BOTH instances; otherwise disabled on both.
- multipleOfPrecision MUST equal PlanOptions.rational.decimalPrecision on BOTH instances whenever rational.fallback ∈ {'decimal','float'}; mismatches ⇒ AJV_FLAGS_MISMATCH.
[Definition of Done]
- Files delivered per subtasks; tests green with ≥80% coverage on touched files.
- Diagnostics conform to SPEC §19.1 mini‑schemas.
- Final AJV validation runs against the original schema (not the canonical/effective view).
- Bench gates (SPEC §15) satisfied: p95LatencyMs ≤ 120 ms and memoryPeakMB ≤ 512 MB on required profiles.
[Self‑audit before emit]
- All SPEC task records 9100..9124: details=REFONLY; no SPEC text duplicated elsewhere.
- Branch selection score‑only invariants satisfied (tiebreakRand, budget.skipped/tried/limit/reason as above).
- oneOf exclusivity: if RNG used at step‑4, exclusivityRand recorded.
- No REGEX_COMPLEXITY_CAPPED from Generator; no COMPLEXITY_CAP_PATTERNS from Normalize/Compose/Rewrite.
- AP:false: no coverage expansion from propertyNames without PNAMES_REWRITE_APPLIED.
- Repair rename guard under AP:false: use ctx.isNameInMustCover(canonPath, name) from Compose’s CoverageIndex; if absent, do NOT rename and emit MUSTCOVER_INDEX_MISSING{guard:true}.
- External $ref handling: Strict ⇒ error EXTERNAL_REF_UNRESOLVED; Lax ⇒ warn + attempt; if Source Ajv compile fails solely due to unresolved externals, skip final validation with details.skippedValidation:true and set diag.metrics.validationsPerRow = 0.
- Unique subtask ids are enforced (e.g., taskId*1000 + ordinal).

Here’s a **clean, ready‑to‑paste** version in English, aligned to the canonical spec you provided.

---

MANDATORY COMPLIANCE HOOKS

*(must appear in implementation tasks’ `testStrategy` or `details`)*

* **Branch selection & score‑only (§8, §15).**

  * In **score‑only**, **always** record `diag.scoreDetails.tiebreakRand` (even when `|T|=1`).
  * In score‑only, set:

    * `diag.budget.skipped: true`, `diag.budget.tried: 0`, and
    * `diag.budget.limit = trials.perBranch × K_effective`, where `K_effective = min(maxBranchesToTry, branches.length)` **after any compose‑time complexity caps** (e.g., `COMPLEXITY_CAP_ONEOF/_ANYOF`).
    * Set `diag.budget.reason` to one of `{"skipTrialsFlag","largeOneOf","largeAnyOf","complexityCap"}`.
  * Emit the appropriate diagnostic when trials are skipped:
    `TRIALS_SKIPPED_LARGE_ONEOF` / `TRIALS_SKIPPED_LARGE_ANYOF` / `TRIALS_SKIPPED_SCORE_ONLY`.

* **At any branch node (`anyOf`/`oneOf`) (§8).**

  * `diag.scoreDetails` **MUST** be present (even when `branches.length===1`) and include:

    * `orderedIndices: number[]` (score desc, index asc),
    * `topScoreIndices: number[]` (pre‑RNG tie set, asc),
    * `tiebreakRand: number | undefined` — **present** whenever RNG is used (tie‑breaks **or** `oneOf` step‑4) and **always** in score‑only; may be `undefined` only when RNG was not used and trials occurred,
    * `exclusivityRand?: number` — **present when RNG is used in `oneOf` exclusivity step‑4**.
  * Also record overlap diagnostics for `oneOf`:

    * `diag.overlap.passing: number[]`, and
    * `diag.overlap.resolvedTo: number`.

* **`oneOf` exclusivity refinement (§8).**

  * **Numeric nudge**:

    * for **integers** → adjust by **±1** (pick smallest magnitude; if both signs work, prefer **+1**);
    * for **non‑integer numbers** → use **δ ∈ {−ε, +ε}** with **ε = 10^(−decimalPrecision)** (pick smallest |δ|; if both work, prefer **+ε**).
  * **String tweak**: inject **U+0000** at end; if rejected, inject `"a"` at end. Apply only when the value **exists**.
  * **Immediate re‑validation** against the **original schema** after each nudge/tweak; keep the change only if `b*` still passes and the targeted conflicting branch is excluded.
  * **Determinism**: no RNG in step‑3; apply tweaks in stable order (lowest `canonPath`, then lowest conflicting branch index).
  * **Step‑4**: if >1 branch still passes and `b*` is among them, **keep `b*`** and minimally exclude the others; **only if `b*` no longer passes**, pick deterministically from the remaining passing set using the seeded RNG and record **`diag.scoreDetails.exclusivityRand`**.

* **Lax external `$ref` probe (§11).**
  When Source AJV **compile fails solely due to external `$ref`**: replace each external `$ref` subtree with `{}` to build a **probe**; if the probe **compiles** and externals exist, **skip validation**, **emit** `EXTERNAL_REF_UNRESOLVED{mode:"lax", skippedValidation:true}`, and set `diag.metrics.validationsPerRow = 0`. No network/filesystem I/O in any mode.

* **AP\:false must‑cover + fail‑fast policy (§3, §8).**

  * **Fail‑fast `AP_FALSE_UNSAFE_PATTERN` (Strict) ONLY when all hold**:

    1. **Presence pressure** holds (`effectiveMinProperties > 0` **or** `effectiveRequiredKeys ≠ ∅` **or** some `dependentRequired` antecedent is forced present);
    2. the must‑cover proof **requires** a **non‑anchored** pattern or a pattern **capped by the regex complexity rule** (including **synthetic** patterns from §7 rewrite);
    3. the **safe‑proof preference** fails — i.e., the **Safe** set (ignoring all non‑anchored or complexity‑capped patterns) is **empty**.
  * The **mere presence** of such patterns does **not** trigger fail‑fast.
  * A **raw** `propertyNames.pattern` (no §7 rewrite) **never** triggers fail‑fast and **never** expands coverage; it acts only as a **gate** when anchored‑safe & not capped.
  * **Coverage may expand only via §7 rewrite** and **only** when `PNAMES_REWRITE_APPLIED` is recorded.
  * In **Lax**, emit `AP_FALSE_UNSAFE_PATTERN` as a **warning** and proceed **conservatively**.

* **CoverageIndex (§8).**

  * `has(name)` is **pure**; no AJV calls, no seed/time/env dependence.
  * Provide `enumerate()` **only when** the **global must‑cover intersection is provably finite** and built **exclusively** from `properties` and/or **synthetic exact‑literal alternatives** introduced by the §7 **propertyNames** rewrite (i.e., when `PNAMES_REWRITE_APPLIED` exists). **Do not** provide `enumerate()` when finiteness comes solely from a **raw** `propertyNames.enum`.
  * `enumerate()` returns a **deduplicated** list **sorted in UTF‑16 order**.
  * When `enumerate()` is provided, include `provenance` and **add** `'propertyNamesSynthetic'` if the §7 rewrite contributed.

* **Property order (§9).**
  Required keys first, then optional keys; both **UTF‑16 lexicographic** (no `localeCompare`).

* **Pattern witness search & caps (§9).**

  * Normalize the alphabet Σ by **Unicode code point** (deduplicate; **drop any unpaired surrogate**); bound candidate length in **code points**.
  * Iterate by **length**, then **UTF‑16 order**; test using JavaScript `RegExp` with **`'u'`** only.
  * Cap with `COMPLEXITY_CAP_PATTERNS{reason:"witnessDomainExhausted"|"candidateBudget", ...}` as applicable.
  * When `PlanOptions.metrics === true` or in CI, increment and publish `diag.metrics.patternWitnessTried` (total candidates tested).

* **Rationals & ε logging (§8, §10).**

  * For **non‑integer** exclusive bounds and for **`multipleOf` snaps or tolerance checks**, log `details.epsilon:"1e-<decimalPrecision>"`.
  * For **integer** exclusives, `details.delta: ±1` **MAY** be used (epsilon optional).

* **Structural hashing (§10, §14).**
  Use **SHA‑256** over canonical JSON (sorted keys, arrays in order, `-0→0`, BigInt stringified). Confirm collisions with `deepEqual`.

* **PlanOptionsSubKey canonicalization (§14).**
  Canonicalize `conditionals.strategy:'rewrite'` to `'if-aware-lite'` in the subkey.

* **Diagnostics envelope & phase separation (§19).**
  Every diagnostic uses `{code, canonPath, details?}` with **no duplication of `canonPath` inside `details`**.
  Respect the phase split: `REGEX_COMPLEXITY_CAPPED{context:"coverage"|"rewrite"}` vs **generator‑only** `COMPLEXITY_CAP_PATTERNS{...}`.

* **MUSTCOVER guard in Repair (§10).**
  When **`additionalProperties:false` applies** and `repair.mustCoverGuard !== false` **and** the CoverageIndex API is **absent**, **do not rename**; **emit** `MUSTCOVER_INDEX_MISSING{guard:true}`.

* **When trials are skipped (recap).**
  **Emit** `TRIALS_SKIPPED_LARGE_ONEOF` / `TRIALS_SKIPPED_LARGE_ANYOF` / `TRIALS_SKIPPED_SCORE_ONLY` as applicable.

* **When `coverageIndex.enumerate()` is provided (§8).**
  **Include** `provenance` and **add** `'propertyNamesSynthetic'` if the §7 rewrite contributed.


OUTPUT RULES (strict)

* English only. No invented requirements beyond the SPEC.
* SPEC tasks (9100..9124) MUST carry REFONLY retrieval descriptors in details with "source":"FILE" and the fixed "uri".
* 9000 and 9050 MUST also use REFONLY in details (same FILE+URI).
* Implementation tasks MUST reference SPEC via dependencies and [Context] in details.
* Subtask ids MUST be globally unique per the policy above; subtasks.file uses spec://§<n>#<slug>.
* Do not emit URL schemes anywhere.
* Ensure JSON string escaping (\n, \", \\) is correct for ALL `details` fields containing REFONLY blocks (SPEC tasks **and** implementation tasks).

CHECKLIST BEFORE SENDING

0. Parse-check: the output parses as a single JSON array; no BOM, no trailing commas.
1. Output is a single valid JSON array.
2. All ids (tasks and subtasks) are globally unique.
3. Implementation tasks 1..24 exist and have EXACT dependencies as listed.
4. SPEC tasks 9100..9124 contain REFONLY retrieval descriptors (no embedded section text) with "source":"FILE" and the fixed "uri".
5. No Markdown, no comments, no prose outside JSON.
6. File paths in subtasks are consistent with §22; SPEC anchors use spec://§<n>#<slug>.
7. Required fields present on every task.
8. No trailing commas; valid JSON.
9. Score-only: tiebreakRand present; diag.budget fields set as specified.
10. Phase separation of diagnostics respected (no REGEX_COMPLEXITY_CAPPED from Generator; no COMPLEXITY_CAP_PATTERNS from Compose/Rewrite).
11. Under AP:false, no coverage expansion from propertyNames.enum unless PNAMES_REWRITE_APPLIED.
12. Anchor resolution sanity: for every spec://§<n>#<slug> emitted, the markdown contains `<a id="s<n>-<slug"></a>` in docs/feature-simplification/feature-support-simplification.md.
13. **All `details` fields with REFONLY content are properly JSON-escaped (outer string valid; inner JSON valid).**

INPUT
After the line below you will paste the SPEC INLINE.
Default FILE path for runtime resolution: docs/feature-simplification/feature-support-simplification.md.

---SPEC START---
[PASTE THE FULL SPEC TEXT HERE]
---SPEC END---

EXPECTED OUTPUT

* A single JSON array [...] with:
  • 8000 (AGENT), 9000 (meta; retrieval descriptor), 9050 (maintenance),
  • 9100..9124 (SPEC tasks with REFONLY retrieval descriptors + anchors, FILE+fixed URI),
  • 1..24 (implementation tasks wired to SPEC via dependencies).
* SPEC content is not embedded; only retrieval descriptors and anchors are present.
