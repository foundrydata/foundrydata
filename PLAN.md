Task: 2   Title: Regex policy: anchored-safe check + complexity caps
Anchors: [spec://§0#terminology, spec://§1#goal, spec://§1#config-gate, spec://§3#apfalse-unsafe-pattern-policy, spec://§4#pipeline]

Touched files:
- PLAN.md
- packages/core/src/transform/name-automata/regex.ts
- packages/core/src/transform/__tests__/regex-policy.spec.ts

Approach:
This task implements the core regex policy required for name automata and pattern handling: classify patterns as anchored-safe when they use ^...$ with no lookaround or backreferences and stay within a bounded complexity score, and emit diagnostics when compilation fails or when patterns exceed the configured cap. I will introduce a small regex policy module under transform/name-automata that treats the JSON-source pattern as input, checks anchored shape and disallowed constructs, and computes a complexity score as `pattern.length + quantifiedGroups` where quantified groups capture `*`, `+`, `?`, and bounded `{m,n}` style quantifiers. The module will return a structured analysis object together with diagnostics for `REGEX_COMPILE_ERROR` and `REGEX_COMPLEXITY_CAPPED`, tagging them with a `context` string that matches the diagnostics schema so Normalize and Compose can distinguish rewrite vs coverage use. Anchored-safe will be defined as “compiles, anchored, no lookaround/backrefs, and not capped”, giving downstream name-automata and must-cover logic a single boolean to decide whether a pattern can participate in coverage proofs or must be relegated to guard-only behavior. Unit tests will exercise valid and invalid patterns, complexity scoring behavior, cap thresholds, and diagnostic payloads, keeping coverage high on the new module.

Risks/Unknowns:
- The complexity cap default (when no explicit plan option is provided) may need tuning once name automata and pattern witness search are fully wired.
- Some exotic patterns may be conservatively classified as unsafe due to the heuristic lookaround/backreference detection, reducing but not breaking coverage.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
