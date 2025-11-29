Task: 9306   Title: 9306.9306005 – Add end-to-end tests for guided hints on schemas with oneOf and enums
Anchors: [cov://§3#coverage-model, cov://§5#hint-types, cov://§6#execution-modes-ux]
Touched files:
- packages/core/src/generator/__tests__/generator-hints.spec.ts
- .taskmaster/docs/9306-traceability.md
- PLAN.md

Approach:
Pour la sous-tâche 9306.9306005, je vais vérifier et, si nécessaire, compléter les tests de `generator-hints.spec.ts` pour couvrir explicitement un scénario combinant `oneOf` et `enum` en mode `coverage=guided`, de façon à démontrer que les hints `preferBranch` et `coverEnumValue` pilotent effectivement les choix de branches et de valeurs tout en respectant la validité AJV et le déterminisme pour un tuple `(schema, options, seed)` fixé. L’objectif est de rester au niveau générateur (sans réintroduire le planner ni le pipeline orchestrator), en construisant ou en réutilisant un schéma où chaque branche du `oneOf` encapsule une propriété avec `enum`, puis en attachant des hints sur le chemin du `oneOf` (pour la branche) et sur le chemin de propriété (pour l’`enum`), et en vérifiant que les instances produites suivent systématiquement ces préférences sous guided.

Côté tests, je m’appuierai sur la structure existante de `generator-hints.spec.ts` (tests pour `preferBranch`, `coverEnumValue`, `ensurePropertyPresence` et `unsatisfiedHints`) en les interprétant comme e2e au niveau générateur : si un scénario `oneOf+enum` y est déjà présent et couvre les invariants de la SPEC (déterminisme, distinction guided vs measure, respect des hints), je le laisserai en l’état ; sinon, j’ajouterai un test dédié qui vérifie que (a) sous `coverage=guided` avec hints donnés, les valeurs concrètes (`kind` ou une propriété `choice`) suivent les indices attendus, (b) sous `coverage=measure` sans hints, on garde un comportement de base différent (ce qui montre l’effet des hints), et (c) deux runs guided avec le même `seed` et les mêmes hints produisent les mêmes sorties. Je veillerai à ne pas changer la surface API du générateur ni les invariants de `coverage=off`/`coverage=measure`; cette sous-tâche reste strictement centrée sur les tests générateur.

Risks/Unknowns:
Les principaux risques sont : (1) rendre les tests trop fragiles en couplant leurs assertions à des détails d’implémentation internes (ordre exact des essais de génération, structure fine des diagnostics) plutôt qu’aux invariants de la SPEC (validité AJV, respect des hints, déterminisme pour un `(schema, options, seed)` donné) ; (2) faire diverger le comportement de `coverage=measure` en réutilisant maladroitement des hints ou une configuration dédiée au mode guided ; (3) multiplier des fixtures redondantes de schémas alors qu’un schéma oneOf+enum simple suffit pour démontrer l’effet des hints. Pour limiter ces risques, je m’alignerai sur les scénarios déjà couverts par les autres tests, je garderai les assertions centrées sur les valeurs émises et sur la stabilité des sorties guided vs measure, et je limiterai les modifications au seul fichier de tests pour ne pas perturber le pipeline global déjà validé par les tâches 9306.9306006–9306.9306008.

Parent bullets couverts: [KR1, KR2, KR3, DOD1, DOD4, TS4]

SPEC-check: conforme aux anchors listés, aucun écart identifié ; cette sous-tâche se concentre sur des tests générateur qui illustrent l’effet des hints sur un schéma oneOf+enum sans modifier le planner ni l’orchestrateur, tout en respectant les invariants de déterminisme et la séparation nette entre `coverage=off`, `coverage=measure` et `coverage=guided`.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
