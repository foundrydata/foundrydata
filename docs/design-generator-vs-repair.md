# Architecture Brief — Generator vs Repair Contract

## 1. Purpose & Context

This document frames the architectural decisions around the contract between the
**Generator** and **Repair** phases in the FoundryData pipeline.

The canonical SPEC already defines per‑phase responsibilities and diagnostics
(`spec://§9#generator`, `spec://§10#process`). However, it intentionally leaves
room for implementations to decide:

- how much validity is guaranteed **by construction** in the Generator, and
- how much is delegated to the AJV‑driven Repair loop with a bounded budget.

For a testing/tooling platform, this boundary has a strong impact on:

- data quality guarantees exposed to users,
- how readable and “realistic” generated instances are,
- how much work Repair is allowed to perform, and
- how we design tests, metrics and invariants.

This brief is a **high‑level design document**. A more detailed, normative
SPEC update can be derived from it once the direction is validated.

---

## 2. Problem Statement

Today, the implementation follows the minimum SPEC:

- The Generator produces **minimal witnesses** that satisfy structural
  constraints (types, `minItems`/`maxItems`, `contains`, etc.).
- The AJV‑driven Repair phase then:
  - fixes `required` gaps by synthesizing minimal values,
  - nudges numbers to respect bounds,
  - grows arrays to satisfy `minItems`/`minContains`,
  - trims arrays for `maxItems`/`maxContains`,
  - and applies renames under `propertyNames` / AP:false guards.

This is correct but leaves several questions open:

- For which schemas should the Generator **alone** be expected to produce
  AJV‑valid instances (i.e. Repair is almost a no‑op)?
- When is it acceptable for Repair to synthesize values like empty strings,
  empty objects or arrays, and when does this become “too magical”?
- How do we measure and enforce that we are not over‑relying on Repair
  for cases that should be handled directly by the Generator?

The UUID + `contains` case (`order + items + contains`) illustrates this:

- Generator currently produces an `items[*]` witness that only satisfies
  the `contains` subschema (`{ isGift: true }`).
- Repair then fills the missing `id` required through `$defs.uuid` with a
  minimal string value.
- Under `validateFormats:false`, this is SPEC‑compliant, but it is not obvious
  to the user that a successful run can depend on such Repair work.

---

## 3. Goals

We want to make the Generator/Repair boundary explicit and testable:

1. **Define a class of schemas** where the Generator is required to produce
   AJV‑valid instances “by construction” (modulo small numeric nudges).
2. **Constrain Repair** to a well‑defined role: last‑mile rectification and
   advanced semantics, not a second generator.
3. **Instrument and gate** the pipeline with metrics and tests so we can
   detect when we are drifting away from this contract.
4. Keep everything **SPEC‑compliant**, but deliberately stricter than the
   minimum where it improves data quality and observability.

---

## 4. Scope — First Milestone (`G_valid v1`)

We introduce a notion of **“Generator‑valid zone”** (`G_valid`):

> A schema location belongs to `G_valid` when the Generator must, by itself,
> produce instances that pass AJV validation, without relying on Repair
> for structural or `required` fixes.

For the first milestone, we propose to scope `G_valid v1` to:

- **Objects without “hard” evaluation guards**:
  - no `unevaluatedProperties:false`,
  - no `unevaluatedItems:false`,
  - `additionalProperties` is `true` or a schema (not `false`), or is
    equivalent via `allOf` in a way we can reason about.
- **Arrays with simple items and contains**:
  - `type: 'array'`,
  - `items` is a single schema or `$ref` into the same document,
  - `contains` is present with a single need (no multi‑bag over `allOf`),
  - `minItems`/`maxItems`/`minContains`/`maxContains` are finite and
    mutually consistent,
  - no `uniqueItems:true` edge‑cases that require complex deduplication.
- **No AP:false must‑cover interplay** at the same instance location.

Anything outside this scope remains under the current “Generator minimal +
Repair budgeted” regime.

The UUID + `contains` pattern that motivated this brief fits well into
`G_valid v1` once we restrict the `contains` subschema to avoid conflicting
`additionalProperties:false`.

---

## 5. Design Principles

The following principles should guide concrete changes:

1. **Phase separation remains intact**  
   We do not merge Generator and Repair. Instead, we tighten the Generator
   contract in clearly identified zones, leaving Repair as a bounded,
   AJV‑driven rectifier.

2. **Determinism is preserved**  
   Any changes to generation must keep the determinism guarantees:
   same schema + options + seed ⇒ same instances and diagnostics.

3. **Minimality is relative to `G_valid`**  
   Within `G_valid`, “minimal instances” must still be **AJV‑valid**.
   Outside `G_valid`, the existing “minimal witness + Repair” approach
   remains acceptable.

4. **Repair budgets stay small and explicit**  
   We keep the current `complexity.bailOnUnsatAfter` guard and Repair
   attempts small by default. If a change would require significantly more
   Repair work, the design should be reconsidered.

5. **Everything is observable**  
   Generator/Repair decisions must be visible via metrics and tests so we
   can enforce the contract and catch regressions quickly.

---

## 6. Proposed Behaviour

### 6.1 For schemas in `G_valid`

For locations classified as `G_valid`:

- The Generator:
  - uses the **effective schema** (after `$ref`/`allOf` composition) whenever
    it decides what to generate;
  - treats `required` keys as part of its own obligation, not as something
    to be fixed by Repair;
  - when generating arrays, combines `items` and `contains` constraints so
    that targeted elements satisfy both (e.g. an `orderItem` with `isGift:true`).

- Repair:
  - SHOULD see no `required` errors at these locations in the nominal case;
  - MAY still apply numeric nudges (`exclusiveMinimum`, `exclusiveMaximum`),
    `uniqueItems` deduplication, or similar low‑impact corrections;
  - SHOULD NOT be relied upon to add missing required properties or whole
    sub‑objects in this zone.

Pragmatically, this means we will:

- refactor array generation to be aware of the effective item schema when
  satisfying `contains` inside `G_valid`, and
- gradually extend this approach to other motifs (simple objects with
  `required`, simple conditionals, etc.).

### 6.2 Outside `G_valid`

For all other locations (AP:false + CoverageIndex, `unevaluated*`, complex
`contains` bags, deep conditionals):

- The current “Generator minimal + Repair bounded” strategy remains valid:
  - Generator may emit minimal witnesses that trigger AJV errors;
  - Repair attempts to fix them within its configured budget;
  - if errors cannot be reduced, the pipeline fails with diagnostics.

We still benefit from better metrics and tests in these areas, but we do not
promise AJV‑validity by construction there.

---

## 7. Metrics & Testing

To enforce this contract, we introduce:

1. **Repair usage metrics**
   - Per motif (e.g. “array + contains”, “simple object with required”),
     track:
     - number of instances entering Repair,
     - number of Repair actions applied.
   - Expose a small internal structure such as:
     ```ts
     {
       motif: 'array-contains-simple',
       items: totalCount,
       itemsWithRepair: countWithActions,
       actions: totalActions
     }
     ```

2. **“No‑repair zone” invariants in tests**
   - For micro‑schemas explicitly labelled as `G_valid`, add e2e tests that
     assert:
     - `result.status === 'completed'`, and
     - the number of Repair actions for relevant motifs is `0` (or within a
       very small allowed set, e.g. numeric nudges).
   - Record these invariants in `docs/tests-traceability.md` under a new
     motif family “Generator‑valid zone”.

3. **Regression checks**
   - For critical motifs (such as `order + items + contains` with `$defs.uuid`),
     add tests that fail if we regress from “Generator‑valid” to
     “Repair‑dependent” behaviour.

---

## 8. Open Questions & Next Steps

Open questions to address before turning this brief into SPEC text:

- Exact boundaries of `G_valid v1`:
  - Do we include simple conditionals (`if`/`then` without else)?
  - Do we treat `additionalProperties:false` with a simple `properties` map
    as `G_valid`, or keep it out initially?
- How do we encode “motif classification” in code (simple enums, tags on
  planning nodes, or purely inferred in metrics)?
- What is the acceptable baseline for Repair usage in `G_valid` (strictly 0,
  or “0 for structure, small non‑zero for numeric details”)?

Proposed next steps:

1. Review and agree on this brief at a high level.
2. Add a short section to `docs/testing-strategy.md` and
   `docs/tests-traceability.md` referencing the “Generator‑valid zone”
   concept and the initial motifs in scope.
3. Implement minimal metrics for Repair usage by motif.
4. Refactor array + contains generation for the first `G_valid` motif and
   add corresponding e2e tests.
