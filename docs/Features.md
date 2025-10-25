# FoundryData Feature Matrix

| Capability | Status | Implementation notes |
| --- | --- | --- |
| `allOf` / `anyOf` / `oneOf` / `not` | ✓ | Normalizer flattens branches where safe, the composition engine scores every branch, and generator/repair stages record tie-break/exclusivity RNG plus `NOT_DEPTH_CAPPED` when guards fire. |
| Conditionals (`if` / `then` / `else`) | ✓ | `if-aware-lite` runs by default with discriminant-first scoring; callers can opt into safe rewrites, and diagnostics (`IF_AWARE_HINT_*`) record any skipped hints. |
| Tuples, `items`, `additionalItems` | ✓ | `prefixItems` length is inferred, implicit max lengths are injected into Compose, and generator enforces array lengths plus `uniqueItems` using structural hashing. |
| `patternProperties` / `propertyNames` | ✓ | Anchored patterns become coverage sources, unsafe rewrites stay gating-only, and diagnostics (`PNAMES_REWRITE_APPLIED`, `PNAMES_COMPLEX`) explain each decision. |
| `dependentSchemas` / `dependentRequired` | ✓ | Normalizer guards dependencies and Compose feeds them into presence-pressure analysis so AP:false coverage includes dependent keys. |
| `contains` with `minContains` / `maxContains` | ✓ | Compose stores independent needs in the contains bag and generator enforces them with bag semantics; conflicts surface as `CONTAINS_UNSAT_BY_SUM` or `CONTAINS_BAG_COMBINED`. |
| `multipleOf` / numeric bounds | ✓ | Exact rational arithmetic (128-bit caps) runs first; fallbacks emit `RAT_*` diagnostics and honor `rational.decimalPrecision`. |
| `unevaluatedProperties` / `unevaluatedItems` | ✓ | Compose keeps conservative effective views and propagates evaluation traces so validations know which branches were visited. |
| In-document `$ref` | ✓ | Canonical schema retains `$id`/pointer metadata, with cycle detection and cache entries keyed by hash or `$id`. |
| External `$ref` | ⚠️ (policy) | No remote fetches; `EXTERNAL_REF_UNRESOLVED` includes mode/policy and optionally skips validation when instructed. |
| `$dynamicRef` / `$dynamicAnchor` / `$recursiveRef` | ~ | Passed through to AJV with bounded scope traversal; FoundryData neither expands nor rejects them so behavior depends on the configured AJV instance. |

**Legend**: ✓ full support, ~ partial / passthrough, ⚠️ guarded behavior (feature available but subject to policy or diagnostics).
