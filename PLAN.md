Task: 9301.9301003   Title: Generate CoverageTargets for structure, branches and enum dimensions
Anchors: [cov://§3#coverage-model, cov://§4#coverageanalyzer]
Touched files:
- packages/core/src/coverage/analyzer.ts
- packages/core/src/coverage/__tests__/analyzer.test.ts
- .taskmaster/docs/9301-traceability.md
- PLAN.md

Approach:
I will extend the analyzer so that once the declared `schema.properties` have been walked, the AP:false coverage entry for the current canonical object is consulted and its `enumerate()` witness is turned into PROPERTY_PRESENT targets that reuse CoverageTarget ID generation. Each enumerated name will be checked against the CoverageIndex predicate, skipped if required or already declared, and assigned the same canonical pointer that instrumentation emits (patternProperties pointer when a regex matches, otherwise the redundant `/additionalProperties` node) so the `structure` dimension keying stays deterministic. This keeps CoverageIndex as the sole source of truth for property names when `additionalProperties:false`, which is the invariant spelled out in `cov://§3#coverage-model`, while also honoring the gating requirements described in `cov://§4#coverageanalyzer`. In tandem I will add a fixture-based analyzer test that feeds a synthetic CoverageEntry with `enumerate()` output strings and asserts the extra property targets exist with the right `canonPath`/`propertyName` params, so the `analyzer` coverage suite still hits ≥80% while proving unreachable flags unchanged. Finally I will refresh `.taskmaster/docs/9301-traceability.md` to record the new bullet mapping and make sure the plan’s own file stays aligned.

Risks/Unknowns:
- CoverageIndex enumerate() is only available when finiteness is proven; I need to skip adding PROPERTY_PRESENT targets for nodes where enumerate is missing so the analyzer remains conservative.
- PatternProperties regex strings might not compile in the analyzer, so the pointer resolution must gracefully ignore invalid entries rather than crash.
Parent bullets couverts: [KR3, KR5, DOD1, DOD6, TS1]
SPEC-check: Leveraged CoverageIndex enumerate() as the authoritative source for AP:false property names and emitted PROPERTY_PRESENT targets with the same canonical paths used by the generator, keeping the behavior aligned with cov://§3#coverage-model and cov://§4#coverageanalyzer.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
