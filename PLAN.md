Task: 9306.9306010   Title: Fix hint trace for reused-definition ensurePropertyPresence entries
Anchors: [cov://§4#hint-trace-semantics, cov://§5#unsatisfied-hints-repair-interaction]
Touched files:
- packages/core/src/generator/foundry-generator.ts
- packages/core/test/e2e/coverage-guided-planner.spec.ts
- .taskmaster/docs/9306-traceability.md

Approach:
Introduce an instance-path stack so the generator always records the actual container pointer before emitting a hint application, and make `recordHintApplication` honor an explicit override before falling back to the old canonical-to-instance translation. Every `generateValue` call that spawns a nested property/array entry will be wrapped with a `withInstancePath` helper so `currentInstancePath` reflects the object or array owning the node under construction, and `recordEnsurePropertyPresenceHintApplication` pushes that true path into the hint trace. This keeps branch/enum behavior unchanged while ensuring hints that originate from reused `$defs`/`definitions` or merged subschemas map to the real instance container, letting Repair check the right object and avoid spurious `REPAIR_MODIFIED_VALUE` diagnostics. Finally, add a guided-run regression that attaches an `ensurePropertyPresence` hint to `#/$defs/shared/properties/guarded` (a reused definition) and asserts the coverage report no longer emits a false `REPAIR_MODIFIED_VALUE` once Repair lets the property survive.

Risks/Unknowns:
`withInstancePath` must be injected around every nested `generateValue` invocation (objects, arrays, dependent-required extensions, conditional hints) without disturbing the existing hint-trace semantics; I'll carefully review each call site and rely on `appendPointer`+`currentInstancePath` before wrapping so the stack stays balanced even under nested iterations. The regression hinges on using the canonical pointer from `%/$defs/shared/properties/guarded`, so I need to confirm that canonicalization doesn’t rewrite that path in practice; if it does, a follow-on soft check may be necessary. Parent bullets couverts: [KR4, KR5, DEL3, DOD3, DOD4, TS3]
SPEC-check: hint trace + Repair-unsatisfied behavior continue to obey cov://§4#hint-trace-semantics and cov://§5#unsatisfied-hints-repair-interaction for paths that stem from reused definitions.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
