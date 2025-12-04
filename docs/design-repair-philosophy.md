# Architecture Brief — Repair Philosophy (What We Allow Repair to Fix)

## 1. Purpose & Context

This document is an **architecture brief** for the Repair engine in FoundryData.
It explains how we apply the canonical Repair philosophy in practice:
what kinds of changes Repair is expected to perform on generated instances,
and where it should instead stop and leave failures to AJV.

> **Normative source of truth.**  
> All normative rules for Repair (mapping `(keyword → action)`, tiers and
> default policy, coverage-independence, progress metric/Score, budgets and
> stagnation, observability) are defined in the canonical specification
> `docs/spec-canonical-json-schema-generator.md`, primarily in:
> - §6 Generator/Repair contract and `G_valid`,
> - §10 Repair Engine and the “Repair philosophy” policy layer
>   (`spec://§10#repair-philosophy`, `spec://§10#mapping`),
> - §14/§15 determinism tuple, PlanOptionsSubKey and metrics.
> This brief is **explanatory only**; it must not introduce new normative
> behaviour beyond those sections and should be read as design commentary and
> examples tied back to the SPEC.

Within that envelope, this brief focuses on:

- how aggressively we want to “heal” instances vs letting AJV report errors,
- how we align expectations between Generator and Repair (especially in `G_valid`),
- which tests and metrics we rely on to keep behaviour predictable.

Whenever this brief uses words like “must”/“should”, they are shorthand for
“per the canonical SPEC, Repair is required to…” or for **local design
recommendations**. In case of doubt or conflict, the canonical SPEC wins.

### 1.1 Definitions used by this brief

**Determinism tuple (recap)**  
The exact determinism tuple is defined normatively in the SPEC (see §10.P1
and §14/§15). Informally, when this brief says “deterministic”, it refers to:
for a fixed input instance and a fixed tuple capturing:
`(schema view, PlanOptionsSubKey/plan options, seed, AJV major + flags, registryFingerprint)`,
Repair produces the same output instance, action logs and diagnostics.

**Progress / “errors stop decreasing” (recap)**  
The stable error signature, score `Score(x)` and commit rule are defined
normatively in §10.P5. When this brief says “reduces errors” / “errors stop
decreasing”, it refers to that metric and commit rule: commits only when
`Score(x') < Score(x)`, otherwise revert.

---

## 2. Problem Statement (non-normative)

Today, Repair can:

- synthesize missing `required` values (via defaults or minimal generation),
- grow/shrink arrays to satisfy `minItems`/`maxItems` and `contains` needs,
- clamp and nudge numbers to satisfy bounds,
- enforce `uniqueItems` via structural hashing,
- rename or delete keys under `propertyNames` / AP:false when guards permit.

All of this is SPEC‑compliant, but:

- The **boundary** between “reasonable correction” and “too magical” is not
  explicit.
- Users cannot easily tell whether a successful run reflects mostly
  Generator, mostly Repair, or a mixture of both.
- We have no explicit policy for when Repair should **stop** and let AJV
  fail, even if more aggressive actions might be technically possible.

As FoundryData evolves into a testing/tooling platform, we need a clearer
Repair philosophy that emphasizes predictability and observability.

---

## 3. Goals (non-normative)

The Repair philosophy should aim for:

1. **SPEC compliance first**  
   All actions must obey the normative mapping, guards, and diagnostics in
   §10 of the canonical SPEC.

2. **Minimal necessary mutation**  
   Repair should perform the smallest set of deterministic changes needed to
   improve validity, not wholesale reconstruction of instances.

3. **Explicit limits**  
   There should be clear classes of situations where Repair *intentionally
   does not try* to fully fix the instance and instead leaves AJV errors.

4. **Alignment with Generator contract**  
   The more we strengthen Generator (e.g. the `G_valid` zone), the more we
   should restrict what Repair is expected to do there.

5. **Observability**  
   Repair behaviour must be visible via diagnostics and metrics so that
   users and tests can understand and rely on it.

---

## 4. Repair Action Tiers (design view)

The canonical SPEC defines both the determinism tuple and the tiering model
for Repair actions (see §10.P1–§10.P3 and §10.P8). This brief rephrases that
model in more operational terms and calls out how we expect to use it in
profiles and tests.

### 4.1 Tier 0 — Non‑mutating

- Validation‑only operations, such as:
  - compiling a repair‑only validator with `allErrors:true`,
  - evaluating `isEvaluated(O, name)` under `unevaluatedProperties:false`,
  - pre‑flight checks for renames (AJV simulation).
- These actions do not change instances; they only inform subsequent Repair
  decisions and diagnostics.

### 4.2 Tier 1 — Local adjustments (preferred, low-risk)

“Local” adjustments are small, deterministic changes that:

- preserve the overall structure of the instance, and
- follow a direct `(keyword → action)` mapping from the SPEC.

Examples:

- numeric clamps and nudges: `minimum`/`maximum`, `exclusiveMinimum`/
  `exclusiveMaximum`, `multipleOf` snapping with logged `epsilon`,
- string `minLength`/`maxLength` pad/truncate by code points,
- array `minItems`/`maxItems` growth/shrink respecting `prefixItems/items` and
  `contains` bags,
- `uniqueItems` de‑duplication via structural hashing.

In this tier, Repair is expected to act aggressively but predictably whenever
budget allows, because the semantic risk is low. The detailed constraints
(`MUST NOT` introduce/delete keys, determinism guarantees, coverage
independence) are taken directly from §10.P2 and §10.P4 of the SPEC; this
brief relies on those rules rather than restating them.

### 4.3 Tier 2 — Structural completion (guarded)

“Structural completion” covers actions that add or reshape structure based on
schema semantics, such as:

- adding missing `required` properties:
  - using schema `default` when present,
  - otherwise using minimal generation for the sub‑schema,
- filling `contains` needs by appending new array elements derived from the
  `contains` subschema when Generator did not fully satisfy them,
- trimming/removing extra fields under `additionalProperties:false` or
  `unevaluatedProperties:false`, subject to evaluation and must‑cover guards.

These actions are more intrusive. From a design perspective:

- In **simple cases**, Tier 2 is acceptable and expected. A “simple” location
  typically has no `unevaluated*` keywords, no AP:false + `propertyNames`/
  `patternProperties` interplay and no deep conditionals or coverage‑driven
  must‑cover obligations. The precise guards remain those of §10.
- **Priority rule (design):** `G_valid` classification takes precedence over
  any informal “simple vs complex” heuristic. If a location is classified as
  `G_valid` per §6, Tier‑2 structural completion should be considered
  disabled by default in our default profiles, and any Tier‑2 action there
  is treated as a contract‑regression signal for tests and metrics, not a
  normal success path.
- In **complex contexts** (deep conditionals, AP:false + `propertyNames`,
  heavy CoverageIndex use), Tier‑2 actions should be guarded and budgeted
  carefully; when guards fail or complexity is too high, we prefer to stop
  and surface AJV errors rather than guessing.

Tier 2 is therefore where the `G_valid` zone interacts most directly with
Repair: as we strengthen Generator obligations in §6, we expect Tier‑2 usage
inside `G_valid` to trend towards zero and to remain visible via metrics
(`gValid_*` counters and tier usage metrics).

### 4.4 Tier 3 — Aggressive restructuring (discouraged)

The SPEC makes it *possible* in theory to:

- repeatedly apply rename/delete cycles under `propertyNames` constraints,
- introduce new keys to satisfy complex `dependent*`/conditional structures,
- significantly reshape arrays and objects.

However, our design stance is to treat such actions as **last resort, not
default behaviour**:

- In default profiles, we prefer to stay within the Tier‑1/Tier‑2 envelope
  defined by §10.P2/§10.P3/§10.P8 and to stop when the Score/commit rule or
  budgets say “no further progress”, surfacing remaining AJV errors and
  `UNSAT_BUDGET_EXHAUSTED` when applicable.
- More aggressive behaviours, if ever implemented, should be tied to explicit
  experimental profiles, with dedicated tests and metrics, and must still
  satisfy the determinism and AJV‑oracle contracts from the SPEC.

### 4.5 Motif sketch (v1)

The detailed SPEC will carry a full table “motif × tier × profile”. At a high
level, we expect:

- `minimum` / `maximum` / `multipleOf` / numeric boundaries → Tier‑1 only.
- `minLength` / `maxLength` → Tier‑1 only.
- `minItems` / `maxItems` without `contains` → Tier‑1 only.
- Simple `required` on objects without AP:false / unevaluated* →
  Tier‑2 in non‑`G_valid` locations; in `G_valid`, Generator is expected to
  handle `required` and Tier‑2 should be near‑zero.
- Arrays with simple `contains` bags (no deep composition) →
  Tier‑1 (sizes) + Tier‑2 (append minimal witnesses) in non‑`G_valid`
  locations.
- `uniqueItems` →
  Tier‑1 structural de‑duplication; **if** de‑duplication forces re‑satisfaction of
  other constraints (notably `contains` / `minContains`), those follow‑up changes
  are Tier‑2 and therefore obey Tier‑2 allow/deny rules.
- AP:false + `propertyNames` / `patternProperties` →
  Tier‑2 rename/delete under strict guards; Tier‑3 only in explicit
  experimental profiles.

---

## 5. Interaction with Generator & `G_valid` (recap + design notes)

The Generator‑vs‑Repair contract and the definition of the generator‑valid
zone `G_valid` are specified normatively in the canonical SPEC (§6). This
brief assumes that classification as an input and highlights the design
implications:

- For schema locations in the **Generator‑valid zone** (`G_valid`):
  - Generator is expected to produce AJV‑valid instances by construction
    (modulo small Tier‑1 adjustments allowed by §6.5), not to rely on Repair
    for structural correctness.
  - Structural Tier‑2 actions in `G_valid` (e.g. adding required properties,
    growing arrays structurally) are considered exceptional and should be
    visible via `gValid_*` metrics and diagnostics.
  - Tier‑3 behaviour is out of scope for default profiles.

- Outside `G_valid`:
  - Tier‑1 and Tier‑2 actions remain available within budgets and the guards
    defined by §10.
  - Tier‑3 remains discouraged but could be explored in explicit, non‑default
    profiles if we ever decide to support them.

This alignment allows us to:

- make the pipeline more predictable wherever we can expand `G_valid`, and
- retain flexibility for complex motifs without over‑promising on Repair.

Coverage‑aware modes and profiles (`coverage=off|measure|guided`, coverage
profiles) are defined by the coverage‑aware SPEC; from the Repair point of
view we treat them as **observational**:

- For a fixed input instance and determinism tuple, Repair’s mutations and
  diagnostics are the same regardless of coverage mode or `dimensionsEnabled`
  (see §10.P4).
- Different coverage modes may cause different instances to reach Repair
  (because planning/generation behave differently), but Repair does not read
  coverage state as an input to its decisions.

---

## 6. Budgets & Stagnation Guard (design view)

The budget and stagnation rules are defined normatively in §10.P5–§10.P6 and
the complexity options in the SPEC. This brief focuses on how we intend to
use those rules in profiles and tests.

At a high level:

- The progress metric and commit rule (§10.P5) deliberately forbid multi‑step
  “temporary worsening” strategies in default profiles.
- Budgets (§10.P6 and related complexity options) provide an explicit upper
  bound on how long Repair is allowed to keep trying.

Design‑wise, we treat budgets as:

- A maximum number of gen→repair→validate cycles per item
  (`complexity.bailOnUnsatAfter`), and
- a per‑path attempt budget for certain actions (e.g. renames).

In practice, we:

- keep default budgets **small** (1–3 cycles) to avoid unbounded repair loops,
- treat `UNSAT_BUDGET_EXHAUSTED` as a *signal* that a schema/location is too
  complex for automatic repair in the default profile,
- only raise budgets in targeted scenarios where we have explicit tests and
  metrics to justify it.

When budgets are exhausted and AJV still reports validation errors at a
location, we expect:

- Repair to stop mutating the instance at that location (no further guessing
  beyond the last attempt),
- the pipeline to surface remaining AJV errors plus diagnostics, including
  `UNSAT_BUDGET_EXHAUSTED` when applicable,
- the overall pipeline result to reflect failure rather than silently claiming
  success.

Separately from budgets, Repair may also stop due to **policy** (tier/profile)
or **guard** decisions. Those are not “budget exhausted” situations; they are
surfaced via the dedicated diagnostics defined in §10.P7 (e.g.
`REPAIR_TIER_DISABLED`, `REPAIR_REVERTED_NO_PROGRESS`).

---

## 7. Observability & Testing (design view)

The diagnostics envelope, Repair observability requirements and code↔phase
constraints are defined normatively in the SPEC (§19 and §10.P7). From a
design perspective, we rely on:

- **Action logs**  
  Each Repair action records `keyword`, `canonPath`, `origPath`, and
  additional `details` per SPEC. For performance, implementations may cap
  per‑item logs in non‑debug runs, but we rely on aggregated counters
  (actions per tier/motif, blocked‑by‑policy vs blocked‑by‑guards vs
  budget‑exhausted) to keep behaviour observable.

- **Diagnostics**  
  We use the Repair diagnostics defined in the SPEC (including
  `REPAIR_TIER_DISABLED`, `REPAIR_REVERTED_NO_PROGRESS`,
  `UNSAT_BUDGET_EXHAUSTED` and other Repair‑specific codes) to distinguish:
  - guard failures vs tier/policy decisions vs budget exhaustion;
  - behaviour in `G_valid` vs non‑`G_valid` locations (via `gValid_*`
    metrics and context).

- **Tests & invariants**  
  We expect:
  - unit tests for individual Repair actions and guards,
  - E2E tests that assert:
    - Tier‑1 adjustments behave deterministically,
    - Tier‑2 completion happens only where expected,
    - in `G_valid` motifs, Repair usage is near zero and structural
      `structuralKeywords` repairs are treated as regressions,
    - behaviour under budgets and stagnation is stable (including
      `UNSAT_BUDGET_EXHAUSTED` cases),
    - Repair does not vary with `dimensionsEnabled`, and
      `coverage=measure` produces the same Repair usage as `coverage=off`
      for the same schema/options/seed.

These tests and metrics should be cross‑referenced in
`docs/tests-traceability.md` so that Repair decisions remain traceable to
SPEC anchors and invariants.

---

## 8. Next Steps & Open Questions (design only)

The open questions and suggested next steps below are non‑normative and
intended for roadmap discussions; any concrete changes derived from them
must be reflected back into the canonical SPEC before being treated as
contractual.
