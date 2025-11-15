Task: 3   Title: Implement Thompson NFA
Anchors: [spec://§0#terminology, spec://§1#goal, spec://§3#apfalse-unsafe-pattern-policy, spec://§4#pipeline, spec://§8#acceptance-tests]

Touched files:
- PLAN.md
- packages/core/src/transform/name-automata/nfa.ts
- packages/core/src/transform/__tests__/nfa-dfa-basic.spec.ts

Approach:
This task builds the core Thompson NFA implementation for the anchored-safe regex subset, giving later tasks a precise, finite automaton representation of property-name patterns under AP:false. I will design a small regex AST that covers literals, concatenation, alternation, grouping, character classes, and quantifiers (?, *, +, {m,n}), and implement a single-pass parser that operates on the pattern body (with ^...$ anchors stripped when present). On top of this AST I will implement Thompson-style construction that creates an NFA with epsilon transitions and range-based character transitions over UTF-16 code units, tracking the number of states allocated so callers can enforce caps for memory predictability. The resulting module will expose a typed Nfa structure with start/accept states and a state array, plus metadata such as stateCount and whether a cap was hit. Unit tests will cover simple anchored patterns, bounded repetitions, grouping and alternation, and character classes, along with sanity checks on state counts and a small NFA matcher used only in tests to verify that accepted/rejected strings match expectations from the source patterns.

Risks/Unknowns:
- The initial AST and NFA design must remain flexible enough to integrate with upcoming DFA and product-automaton tasks without forcing large refactors.
- Certain advanced regex constructs (nested classes, complex escapes) may initially be unsupported and will need conservative handling or explicit validation before integration.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
