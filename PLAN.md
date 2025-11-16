Task: 20   Title: Unit tests: regex/NFA/DFA/product/coverage-index/numbers
Anchors: [spec://§7#object-keywords-pnames-rewrite, spec://§8#coverage-index-export, spec://§8#coverage-index-enumerate, spec://§8#numbers-multipleof, spec://§8#apfalse-must-cover]

Touched files:
- PLAN.md
- packages/core/src/transform/__tests__/regex-policy.spec.ts
- packages/core/src/transform/__tests__/nfa-dfa-basic.spec.ts
- packages/core/src/transform/__tests__/product-dfa.spec.ts
- packages/core/src/transform/__tests__/name-automata/bfs.spec.ts
- packages/core/src/transform/__tests__/name-automata/product-summary.spec.ts
- packages/core/src/transform/__tests__/numbers/multiple-of.spec.ts
- packages/core/src/transform/__tests__/composition-engine.test.ts

Approach:
I will align the existing unit tests for the regex policy, Thompson NFA and subset-construction DFA, product automata, CoverageIndex, and multipleOf helpers with the P1 automata/SMT spec and the core SPEC anchors. For regex-policy.spec.ts and nfa-dfa-basic.spec.ts, I will verify that classification of anchored-safe patterns, lookaround/backreference detection, and the NFA/DFA construction rules match the restricted grammar and complexity caps defined in §8, including that REGEX_COMPLEXITY_CAPPED and REGEX_COMPILE_ERROR diagnostics are only emitted in the allowed phases. For product-dfa.spec.ts, bfs.spec.ts, and product-summary.spec.ts, I will ensure the tests exercise intersection semantics, emptiness/ finiteness analysis, and BFS witness enumeration order (length then UTF-16) consistent with the name-automata acceptance cases in docs/jsg-p1-automata-smt.md and SPEC §8’s name automata summary. For composition-engine.test.ts I will rely on and, where necessary, refine the existing coverage index tests so that they fully cover the CoverageIndex contract (has/ enumerate/provenance), the AP:false must-cover rules, propertyNames rewrite vs raw gating, and NAME_AUTOMATON_COMPLEXITY_CAPPED/COMPLEXITY_CAP_ENUM behaviour, without changing the public Compose API. For numbers/multiple-of.spec.ts, I will keep the current Ajv-aligned multipleOf tests and extend them if needed to stay consistent with the rational/epsilon policy in §8, ensuring that createMultipleOfContext and isAjvMultipleOf remain aligned with Ajv’s multipleOfPrecision and that snapToNearestMultiple respects the configured decimalPrecision.

Risks/Unknowns:
- The existing automata and coverage-index tests already cover most of the acceptance scenarios; any additional assertions must avoid over-specifying internal shapes so that refactors inside name-automata or composition-engine do not cause unnecessary test churn.
- multipleOf behaviour is coupled to Ajv’s multipleOfPrecision and rational options; if Ajv changes its tolerance semantics in future versions, the tests may need to be adjusted to keep the “Ajv as oracle” invariant without loosening too much.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
