# FoundryData Feature Matrix

| Capability | Status | Implementation notes |
| --- | --- | --- |
| `allOf` / `anyOf` / `oneOf` / `not` | ✓ | Compose scores every branch and records `tiebreakRand` in score-only/tie paths; oneOf exclusivity uses a fresh `exclusivityRand` (same canonPath seed) while honoring the Compose-chosen branch. `NOT_DEPTH_CAPPED` fires when the safe conditional rewrite would exceed `guards.maxGeneratedNotNesting` (default 2); guard-blocked cases emit the `IF_REWRITE_SKIPPED_*` notes instead. Repair stays deterministic and does not add RNG metadata. |
| Conditionals (`if` / `then` / `else`) | ✓ | Default `rewriteConditionals: 'never'`; safe rewrites are opt-in. Generator runs `if-aware-lite` hints and emits `IF_AWARE_HINT_APPLIED` or `IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO` when discriminants are unavailable. |
| Tuples, `items`, `additionalItems` | ✓ | When `items:false`, `prefixItems` imply an implicit max length used in Compose (e.g., for `contains` caps) and enforced in generation; `uniqueItems` is handled via structural hashing. |
| `patternProperties` / `propertyNames` | ✓ | Only strict equivalence rewrites land as coverage sources; guarded/unsafe shapes stay gating-only, with `PNAMES_REWRITE_APPLIED` / `PNAMES_COMPLEX` explaining the decision. |
| `dependentSchemas` / `dependentRequired` | ✓ | Normalizer wraps dependentRequired with guards; Compose treats required antecedents as presence pressure so AP:false must-cover honors those dependents, while non-required antecedents remain gating-only. |
| `contains` with `minContains` / `maxContains` | ✓ | Compose stores independent needs in the contains bag and generator enforces them with bag semantics; conflicts surface as `CONTAINS_UNSAT_BY_SUM` or `CONTAINS_BAG_COMBINED`. |
| `multipleOf` / numeric bounds | ✓ | Numeric bounds contradictions are detected in Compose; generation snaps to multiples with an epsilon derived from `rational.decimalPrecision` (caps are configurable but `RAT_*` diagnostics are not emitted). |
| `unevaluatedProperties` / `unevaluatedItems` | ✓ | Compose keeps conservative effective views and generation records evaluation traces (when metrics are on) so validation knows which branches were visited. |
| In-document `$ref` | ✓ | Canonical schema retains `$id`/pointer metadata (including `#/definitions` → `#/$defs` rewrites) with cycle checks and cache keys derived from `$id`/hash. |
| External `$ref` | ⚠️ (policy) | No remote fetches in core; `EXTERNAL_REF_UNRESOLVED` carries mode/policy and optional `failingRefs` and only skips validation in Lax when skip-eligibility holds. |
| `$dynamicRef` / `$dynamicAnchor` / `$recursiveRef` | ~ | Passed through to AJV with bounded scope traversal; FoundryData neither expands nor rejects them so behavior depends on the configured AJV instance. |

**Legend**: ✓ full support, ~ partial / passthrough, ⚠️ guarded behavior (feature available but subject to policy or diagnostics).
