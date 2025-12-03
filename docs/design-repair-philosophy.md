# Architecture Brief — Repair Philosophy (What We Allow Repair to Fix)

## 1. Purpose & Context

This document frames the **philosophy of the Repair engine** in FoundryData:
what kinds of changes Repair is allowed to perform on generated instances, and
where it should instead stop and leave failures to AJV.

The canonical SPEC defines Repair as:

- an **AJV‑driven, budgeted** phase (`Normalize → Compose → Generate → Repair → Validate`),
- with a normative mapping `(keyword → action)` (e.g. `required`, `minItems`,
  `enum`, `propertyNames`, `unevaluatedProperties:false`, AP:false),
- protected by guards (`isEvaluated`, must‑cover, budgets, stagnation guard),
- and with explicit diagnostics and logging requirements.

Within that envelope, implementations have latitude to decide (for a fixed
schema + options + seed):

- how aggressively to “heal” instances vs letting AJV report errors, and
- how much responsibility remains with Generator vs Repair.

This brief makes those choices explicit for FoundryData without changing SPEC
semantics.

### 1.1 Definitions used by this brief

**Determinism tuple**  
When this brief says “deterministic”, it means: for a fixed input instance and a
fixed tuple:
`(canonicalSchemaFingerprint, planOptionsSnapshot, seed, ajvMajor+ajvPosture, registryFingerprint)`,
Repair produces the same output instance, action logs and diagnostics.

**Progress / “errors stop decreasing”**  
Whenever this brief says “reduces errors” / “errors stop decreasing”, it refers to
the progress metric defined in §6.1.

---

## 2. Problem Statement

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

## 3. Goals

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

## 4. Repair Action Tiers

We group Repair actions into tiers to clarify what is considered “safe”,
“structural”, or “aggressive”. The tiering is **normative at the motif level**:
for each `(schema location, motif)` we must be able to say which tiers are
enabled in which profiles, and tests/metrics should make that classification
observable.

### 4.1 Tier 0 — Non‑mutating

- Validation‑only operations, such as:
  - compiling a repair‑only validator with `allErrors:true`,
  - evaluating `isEvaluated(O, name)` under `unevaluatedProperties:false`,
  - pre‑flight checks for renames (AJV simulation).
- These actions do not change instances; they only inform subsequent Repair
  decisions and diagnostics.

### 4.2 Tier 1 — Local adjustments (always allowed)

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
budget allows, because the semantic risk is low.

In particular, Tier‑1 actions:

- MUST NOT introduce new object keys or delete existing keys;
- MUST NOT change the shape of arrays beyond what `minItems`/`maxItems`/
  `minContains`/`maxContains` already require (no arbitrary reshuffling);
- MUST be deterministic for a fixed determinism tuple (see §1.1) and a fixed
  input instance.
- MUST NOT consult coverage state (targets, planner hints, hit/miss status) or
  use coverage mode / `dimensionsEnabled` as an input to any decision.
- MAY be executed in runs where coverage is enabled; in that case, coverage is
  observational with respect to Repair.

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

These actions are more intrusive. Our philosophy:

- In **simple cases**, Tier 2 is acceptable and expected. Concretely, we treat
  a location as “simple” when all of the following hold after composition:
  - no `unevaluatedProperties:false` / `unevaluatedItems:false`,
  - `additionalProperties` is `true` or a schema (not `false`),
  - no AP:false + `propertyNames`/`patternProperties` interplay at the same
    object location,
  - no deep conditionals or branching (`if`/`then`/`else`, `oneOf`/`anyOf`)
    beyond a shallow, non‑nested pattern,
  - no CoverageIndex‑based must‑cover obligations on this exact location.
- **Priority rule:** `G_valid` classification takes precedence over the “simple”
  heuristic. If a location is classified as `G_valid`, Tier‑2 structural completion
  SHOULD be considered disabled by default and any Tier‑2 action there is treated
  as a contract regression signal (see §5 and §7), not a normal success path.
- In **complex contexts** (any of the above conditions violated), Tier 2
  actions should be:
  - carefully guard‑checked (`isEvaluated`, must‑cover, AJV pre‑flight),
  - and limited by budgets; if guards fail or complexity is too high,
    Repair should stop and leave AJV errors rather than guessing.

Tier 2 is where the `G_valid` zone intersects with Repair: as we move more
responsibility to Generator for certain motifs, we can deliberately reduce
reliance on Tier‑2 actions there and treat any Tier‑2 usage in `G_valid`
locations as a **regression signal** in tests and metrics.

### 4.4 Tier 3 — Aggressive restructuring (discouraged)

The SPEC makes it *possible* in theory to:

- repeatedly apply rename/delete cycles under `propertyNames` constraints,
- introduce new keys to satisfy complex `dependent*`/conditional structures,
- significantly reshape arrays and objects.

However, our philosophy is to treat such actions as **last resort, not
default behaviour**:

- In standard profiles, Repair SHOULD NOT attempt deep, multi‑step structural
  changes beyond what §10 describes directly; instead, it should:
  - try one or a few deterministic adjustments,
  - then stop when errors stop decreasing (per §6.1) or guards fail,
  - and surface remaining AJV errors + `UNSAT_BUDGET_EXHAUSTED` where
    applicable.
- More aggressive behaviours, if implemented, should be tied to explicit
  profiles or modes (e.g. a “healing” or experimental profile), not the
  default strict/generative pipeline.

In particular:

- Under default strict/generative profiles, Tier‑3 actions SHOULD be
  effectively disabled for `G_valid` locations and for complex AP:false /
  CoverageIndex motifs.
- Any experimental Tier‑3 profile MUST keep determinism and the same AJV
  validity contract as other profiles; it explores different mutations, not
  a different notion of “valid”.

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

## 5. Interaction with Generator & `G_valid`

The Repair philosophy is closely linked to the Generator‑vs‑Repair contract:

- For schema locations in the **Generator‑valid zone** (`G_valid`):
  - `G_valid` and its initial scope (`G_valid v1`) are defined in
    `docs/design-generator-vs-repair.md` and in the canonical SPEC; this
    document assumes that classification as an input.
  - Generator is expected to produce AJV‑valid instances by construction,
    except for minor Tier‑1 adjustments.
  - Tier‑2 structural completion (adding required properties, growing arrays)
    SHOULD be rare or unnecessary.
  - Tier‑3 behaviour SHOULD be effectively disabled.

- Outside `G_valid`:
  - Tier‑1 and Tier‑2 actions remain available within budget and guarded by
    SPEC rules.
  - Tier‑3 is still discouraged but may be explored in explicit, non‑default
    profiles if we see strong value in practice.

This alignment allows us to:

- make the pipeline more predictable where we can (by expanding `G_valid`), and
- retain flexibility for more complex motifs without over‑promising on Repair.

Coverage‑aware modes and profiles (`coverage=off|measure|guided`,
`quick` / `balanced` / `thorough`) **do not change** which Repair tiers are
allowed or how budgets are interpreted. They may influence planning and
generation upstream, but Repair does not consume coverage state as an input:

- `coverage=measure` remains observational with respect to the instance stream;
  therefore Repair behavior is identical to `coverage=off` for the same generated
  candidates.
- `coverage=guided` may cause different candidates to be generated (more seeds /
  batches under a budget), so different instances may enter Repair; however, for a
  fixed input instance and determinism tuple (§1.1), Repair’s mutations and
  diagnostics remain deterministic.
- `dimensionsEnabled` only changes which coverage targets/metrics are materialised;
  it MUST NOT affect Repair decisions.

---

## 6. Budgets & Stagnation Guard

### 6.1 Progress metric (normative for termination and “no guessing”)

Repair is AJV‑driven and evaluates progress using AJV `allErrors:true`. For a
given instance `x`, define `Errors(x)` as AJV’s error list for `x`.

Define the **error signature** for an AJV error `e` as a stable identifier:

`sig(e) = (keyword, canonPath, instancePath, stableParamsKey)`

where:
- `canonPath` is the canonical schema location for the failing keyword (using the
  existing pointer mapping; if unavailable, fall back to `schemaPath`),
- `stableParamsKey` is a canonical (key‑sorted) JSON encoding of AJV `params`.

Define `Score(x) = |{ sig(e) : e ∈ Errors(x) }|` (count of distinct signatures).

**Acceptance rule:** A candidate mutation from `x → x'` is committed only if it
strictly improves the score: `Score(x') < Score(x)`. Otherwise Repair MUST revert
the mutation and may emit a diagnostic such as `REPAIR_REVERTED_NO_PROGRESS`.

This deliberately forbids multi‑step “temporary worsening” strategies in default
profiles; such strategies, if ever introduced, belong in explicit experimental
Tier‑3 profiles with separate tests and observability.

Repair is explicitly budgeted:

- A maximum number of gen→repair→validate cycles per item
  (`complexity.bailOnUnsatAfter`), and
- a per‑path attempt budget for certain actions (e.g. renames).

Our philosophy is to:

- keep default budgets **small** (1–3 cycles) to avoid unbounded repair loops,
- treat `UNSAT_BUDGET_EXHAUSTED` as a *signal* to users and tests that a
  schema/location is too complex for automatic repair,
- only raise budgets in targeted scenarios where we have explicit tests and
  metrics to justify it.

When budgets are exhausted and AJV still reports validation errors at a
location:

- Repair MUST stop mutating the instance at that location (no “best effort”
  guessing beyond the last attempt);
- the pipeline MUST surface remaining AJV errors together with the relevant
  diagnostics (including `UNSAT_BUDGET_EXHAUSTED` where applicable);
- the overall pipeline result MUST NOT be reported as “completed” / success
  if validation errors remain; callers should observe a failure status and
  error list, as illustrated in the README examples.

Separately from budgets, Repair may also stop due to **policy** (tier/profile)
or **guard** decisions. These are not “budget exhausted” situations and SHOULD
be surfaced with distinct diagnostics (e.g. `REPAIR_TIER_DISABLED`,
`REPAIR_GUARD_BLOCKED`) so callers can distinguish “we chose not to” from
“we tried and ran out of attempts”.

---

## 7. Observability & Testing

To make Repair behaviour auditable, we rely on:

- **Action logs**  
  Each Repair action records `keyword`, `canonPath`, `origPath`, and
  additional `details` per SPEC. This should be sufficient to reconstruct
  what happened to a given instance.
  - For performance, implementations MAY sample or cap per‑item action logs
    in non‑debug runs, but MUST preserve enough information to explain failures
    and MUST expose aggregated counters (actions per tier/motif) even when
    detailed logs are capped.

- **Diagnostics**  
  Codes such as `REPAIR_PNAMES_PATTERN_ENUM`, `REPAIR_RENAME_PREFLIGHT_FAIL`,
  `MUSTCOVER_INDEX_MISSING`, `UNSAT_BUDGET_EXHAUSTED` highlight when guards
  or budgets limit Repair. All Repair diagnostics:
  - MUST use `phase: 'repair'` in the diagnostics envelope,
  - MUST conform to the shared diagnostics schema (including `code`,
    `canonPath`, `phase`, `details`),
  - and SHOULD include budget context in `details` when a budget influenced
    the decision (e.g. `attemptsTried`, `attemptsLimit`).
  - SHOULD include policy context when a tier/profile disabled an action
    (e.g. `tierRequested`, `tierAllowed`, `profile`, `reason:'g_valid'|'policy'`).

- **Tests & invariants**  
  - Unit tests for individual Repair actions and guards.
  - E2E tests that assert:
    - Tier‑1 adjustments behave deterministically,
    - Tier‑2 completion happens only where expected,
    - in `G_valid` motifs, Repair usage is near zero,
    - Repair does not silently “heal” instances beyond what tests consider
      acceptable.

These tests and metrics should be cross‑referenced in
`docs/tests-traceability.md` so that Repair decisions are traceable to
SPEC anchors and invariants. In particular, we expect:

- dedicated micro‑schemas that exercise Tier‑1 vs Tier‑2 vs Tier‑3 motifs;
- invariants that assert “no Repair actions” (or a very small bounded set)
  for locations explicitly tagged as `G_valid`;
- regression tests that pin the behaviour when budgets are exhausted
  (diagnostics emitted, pipeline status, no hidden Tier‑3 rescues).
  - (new) tests that assert Repair does not vary with `dimensionsEnabled`, and that
    `coverage=measure` produces identical Repair usage as `coverage=off` for the same
    schema/options/seed.

---

## 8. Next Steps & Open Questions

Open questions:

- Where exactly do we draw the line between Tier‑2 and Tier‑3 for each motif
  (e.g. property renames, deep `contains` bags, dependentSchemas)?
- How should Repair behaviour vary across data profiles (`minimal`,
  `realistic`, `strict`) and coverage profiles (`quick` / `balanced` /
  `thorough`)?
- Do we want an explicit “repair‑aggressive” profile, or do we prefer to
  keep aggressive restructuring out of the main product surface?

Suggested next steps:

1. Classify existing Repair actions in the Tier 1/2/3 scheme and document
   them in `docs/tests-traceability.md`.
2. Add metrics around Repair usage (number of actions per item, per motif)
   and expose them in internal reports.
2b. Add explicit counters for “blocked by policy” vs “blocked by guards” vs
    “exhausted budget”, so regressions in `G_valid` and tier disablements are
    visible at a glance.
3. Define concrete expectations for `G_valid` motifs (e.g. maximum allowed
   Repair actions) and add tests to enforce them.
4. Revisit budgets and profiles in light of these metrics, tightening Repair
   where it proves too aggressive and expanding Generator responsibilities
   where feasible.
