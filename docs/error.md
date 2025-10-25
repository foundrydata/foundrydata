# Diagnostic Catalog

FoundryData surfaces every approximation, guardrail, and failure through a structured diagnostic envelope (`packages/core/src/diag/validate.ts`). This document explains the envelope shape and summarizes each diagnostic code so Observability, Docs, and downstream consumers have a single reference.

## Envelope shape

```jsonc
{
  "code": "COMPLEXITY_CAP_ONEOF",
  "canonPath": "/properties/address/oneOf",
  "phase": "compose",
  "details": { "limit": 200, "observed": 287 },
  "budget": {
    "tried": 0,
    "limit": 32,
    "skipped": true,
    "reason": "largeOneOf"
  },
  "scoreDetails": {
    "tiebreakRand": 0.7312458157530624,
    "exclusivityRand": 0.48293337977668643
  },
  "metrics": { "validationsPerRow": 3 }
}
```

- `code` is always one of the entries in `packages/core/src/diag/codes.ts`.
- `phase` matches the pipeline stage that emitted the diagnostic (`normalize`, `compose`, `generate`, `repair`, `validate`). Some codes are multi-phase (e.g., regex guards) and therefore omit `phase`.
- `details` are validated by `packages/core/src/diag/schemas.ts`. Keys such as `canonPath`/`canonPtr` are disallowed to avoid redundant metadata.
- `budget` captures guardrails used during Compose/Generate/Repair. Reasons are restricted to `skipTrialsFlag`, `largeOneOf`, `largeAnyOf`, `complexityCap`, `candidateBudget`, or `witnessDomainExhausted`.
- `scoreDetails.tiebreakRand` records the exact RNG float whenever score-only selection or a tie-break occurs—even when `|branches| = 1`. `scoreDetails.exclusivityRand` logs the RNG draw used for `oneOf` exclusivity tweaks.
- `metrics` mirrors runtime counters (validations per row, repair passes per row, p95 latency, memory, etc.) so CI and docs can spot regressions quickly.

## Normalize & Canonicalization

| Code | Meaning |
| --- | --- |
| `PNAMES_REWRITE_APPLIED` | `propertyNames` was rewritten into anchored coverage (details include `kind` and optional `source`). |
| `PNAMES_COMPLEX` | Rewrite was skipped because the pattern was unsafe or missing required literals. |
| `ALLOF/ANYOF/ONEOF_SIMPLIFICATION_SKIPPED_UNEVALUATED` | Normalizer refused to collapse the composition because `unevaluated*` keywords were still in scope. |
| `IF_REWRITE_DOUBLE_NOT` | Safe double-negation rewrite applied to a conditional branch. |
| `IF_REWRITE_SKIPPED_UNEVALUATED` | Conditional rewrite skipped because `unevaluated*` interaction made it unsafe. |
| `IF_REWRITE_DISABLED_ANNOTATION_RISK` | Rewrite disabled to avoid dropping metadata/annotations. |
| `OAS_NULLABLE_KEEP_ANNOT` | Normalizer retained `nullable` annotations per OpenAPI compatibility rules. |
| `DEPENDENCY_GUARDED` | Added synthetic guards for `dependentRequired`/`dependentSchemas`. |
| `DYNAMIC_PRESENT` | `$dynamicRef`/`$dynamicAnchor` detected; the engine will treat them conservatively later on. |
| `DEFS_TARGET_MISSING` | `$ref` points at a `$defs` entry that does not exist. |
| `EXCLMIN_IGNORED_NO_MIN` / `EXCLMAX_IGNORED_NO_MAX` | Exclusive bounds were ignored because their inclusive counterpart is missing. |
| `NOT_DEPTH_CAPPED` | `not` nesting exceeded `guards.maxGeneratedNotNesting`. |
| `REGEX_COMPLEXITY_CAPPED` | Regex pattern exceeded the internal complexity heuristic (emitted in Normalize and Compose). |
| `REGEX_COMPILE_ERROR` | Regex failed to compile under Unicode mode. |

## Compose

| Code | Meaning |
| --- | --- |
| `COMPLEXITY_CAP_ONEOF` / `ANYOF` / `ENUM` / `CONTAINS` / `SCHEMA_SIZE` | Guardrail fired because the schema exceeded configured limits (details include `limit` and `observed`). |
| `AP_FALSE_UNSAFE_PATTERN` | Must-cover would rely on non-anchored or capped patterns; strict mode escalates to fatal. |
| `AP_FALSE_INTERSECTION_APPROX` | Coverage proof fell back to approximations (details describe whether patterns, regex errors, or presence pressure caused it). |
| `UNSAT_AP_FALSE_EMPTY_COVERAGE` | Presence pressure plus no safe coverage sources ⇒ schema is unsatisfiable under `AP:false`. |
| `UNSAT_REQUIRED_AP_FALSE` / `UNSAT_DEPENDENT_REQUIRED_AP_FALSE` | Required keys (direct or dependent) cannot be satisfied because `additionalProperties:false` removed every admissible key. |
| `UNSAT_PATTERN_PNAMES` / `UNSAT_REQUIRED_PNAMES` / `UNSAT_MINPROPS_PNAMES` | `propertyNames` enum and `minProperties`/`required` constraints conflict. |
| `CONTAINS_NEED_MIN_GT_MAX` | `minContains` exceeds `maxContains`. |
| `CONTAINS_UNSAT_BY_SUM` | Sum of `minContains` across bag entries exceeds the effective `maxItems`. |
| `CONTAINS_BAG_COMBINED` | Contains bag trimmed due to `complexity.maxContainsNeeds`; details list the resulting bag size. |
| `DYNAMIC_SCOPE_BOUNDED` | `$dynamicRef` resolved to a bounded ancestor; details report anchor name and hop count. |
| `TRIALS_SKIPPED_LARGE_ONEOF` / `TRIALS_SKIPPED_LARGE_ANYOF` / `TRIALS_SKIPPED_COMPLEXITY_CAP` / `TRIALS_SKIPPED_SCORE_ONLY` | Compose switched to score-only selection because of explicit flags or fan-out limits. |

## Generate

| Code | Meaning |
| --- | --- |
| `COMPLEXITY_CAP_PATTERNS` | Pattern witness synthesis exhausted candidates (details capture reason, alphabet, tried count). |
| `EXCLUSIVITY_TWEAK_STRING` | Generator tweaked a string literal (either `\u0000` or `a`) to enforce oneOf exclusivity. |
| `IF_AWARE_HINT_APPLIED` | `if-aware-lite` hint executed with the configured satisfaction target. |
| `IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO` | Hint skipped because there was no discriminant or no observed keys. |
| `EVALTRACE_PROP_SOURCE` | Evaluation trace recorded for lineage debugging (lists property name and families traversed). |
| `RAT_LCM_BITS_CAPPED` / `RAT_DEN_CAPPED` | Exact rational arithmetic crossed configured caps; details show `limit` vs `observed`. |
| `RAT_FALLBACK_DECIMAL` / `RAT_FALLBACK_FLOAT` | Numeric fallbacks engaged with the configured `decimalPrecision`. |

## Repair

| Code | Meaning |
| --- | --- |
| `REPAIR_RENAME_PREFLIGHT_FAIL` | Preflight check blocked a rename because it crossed branches or dependent guards. |
| `REPAIR_PNAMES_PATTERN_ENUM` | Repair renamed or removed a property participating in must-cover constraints (details capture from/to, reason, and must-cover posture). |
| `REPAIR_EVAL_GUARD_FAIL` | Evaluation guard prevented a mutation because the target pointer was not evaluated in the canonical schema. |
| `MUSTCOVER_INDEX_MISSING` | Repair needed to honor AP:false but the coverage index lacked a safe entry (often due to user schema gating only via raw patterns). |
| `UNSAT_BUDGET_EXHAUSTED` | Repair/Validate cycles exceeded `complexity.bailOnUnsatAfter`. Budget fields show attempts, limits, and the reason for exhaustion. |

## Validate

| Code | Meaning |
| --- | --- |
| `AJV_FLAGS_MISMATCH` | Startup parity check detected flag differences between planning and source AJV instances. Details include the diffed flags and AJV version. |
| `EXTERNAL_REF_UNRESOLVED` | Source schema references remote `$ref`. Details list exemplar refs, mode, and whether validation was skipped due to policy. |

## Cross-cutting guidance

- All diagnostics may include `metrics` (bench data, repair passes, etc.) when `PlanOptions.metrics === true`.
- When RNG participates in a decision, the emitting stage **must** record the float in `scoreDetails`. Compose provides tie-break data (`tiebreakRand`) while Generate/Repair populate `exclusivityRand`.
- Every envelope is validated locally (`assertDiagnosticEnvelope` + `assertDiagnosticsForPhase`) before leaving a stage, so consumers can rely on the schema guaranteed in `docs/diagnosticsEnvelope.schema.json`.
