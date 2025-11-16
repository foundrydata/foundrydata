Task: 22   Title: Centralize regex diagnostics through RegexAnalysis
Anchors: [spec://§2#regex-policy-complexity-caps, spec://§3#name-automata-must-cover, spec://§5#diagnostics, spec://§6#non-functional-constraints, spec://§7#interfaces]

Touched files:
- PLAN.md
- packages/core/src/transform/name-automata/regex.ts
- packages/core/src/transform/composition-engine.ts
- packages/core/src/transform/schema-normalizer.ts

Approach:
I will refactor regex handling so that compile and complexity diagnostics are produced once by RegexAnalysis and then routed consistently to the normalize and compose stages. In the transform/name-automata/regex.ts helper I will keep the existing structural scan and complexity scoring, but treat RegexAnalysis.diagnostics as the canonical source of REGEX_COMPLEXITY_CAPPED and REGEX_COMPILE_ERROR entries, parameterised by a RegexContext flag that distinguishes coverage from rewrite usage. In composition-engine.ts I will extend analyzeRegexPattern() to expose the underlying RegexAnalysis object, then update the coverage construction logic for patternProperties and propertyNames.pattern to iterate over RegexAnalysis.diagnostics and feed them through addCoverageRegexWarn() instead of manually emitting diagnostics from boolean flags, while preserving existing approximation reasons, PatternIssue bookkeeping, and coverage/UNSAT behaviour. In schema-normalizer.ts I will remove the ad-hoc regex complexity helper and direct scanRegexSource usage, replace them with analyzeRegex(..., {context:'rewrite'}), and route any REGEX_COMPLEXITY_CAPPED or REGEX_COMPILE_ERROR entries into notes alongside the existing PNAMES_COMPLEX reasons so that normalize-stage diagnostics remain phase-correct but share the same payload shape as compose-stage warnings. Finally, I will run the full build, unit tests, and bench harness to confirm that diagnostic envelopes still validate and that coverage decisions, AP:false semantics, and p95 latency/memory gates remain unchanged.

Risks/Unknowns:
- RegexAnalysis currently enforces a default complexity threshold; reusing it in schema-normalizer must not make propertyNames rewrites significantly more conservative or aggressive than before, so I need to rely primarily on the existing structural caps and keep rewrite gating logic unchanged.
- Some edge-case patterns may compile differently under the engine used by analyzeRegex versus the unicode-aware RegExp used later for coverage predicates; I must ensure those discrepancies only affect approximation hints and never cause phase-incorrect diagnostics or broken CoverageIndex behaviour.
- Centralizing diagnostics increases coupling between normalizer and composition engine; tests must be sensitive enough to catch any accidental change in where diagnostics are attached (canonPath) or how often they are emitted.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
