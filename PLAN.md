Task: 9333   Title: Harden CLI coverage profiles and coverage-report UX — subtask 9333.9333001
Anchors: [cov://§3#coverage-model, cov://§6#budget-profiles]
Touched files:
- PLAN.md
- .taskmaster/docs/9333-traceability.md
- packages/cli/src/config/__tests__/coverage-options.test.ts

Approach:
Pour la sous-tâche 9333.9333001, je vais renforcer la sémantique des profils CLI `quick`/`balanced`/`thorough` au niveau de `resolveCliCoverageOptions` en l’adossant explicitement aux profils de budget décrits dans la spec coverage-aware (cov://§3#coverage-model, cov://§6#budget-profiles). Concrètement : (1) cartographier les presets existants (dimensionsEnabled, recommendedMaxInstances, caps et priorité de dimensions) aux attentes de la spec et décider si le code actuel est déjà conforme ou nécessite des ajustements mineurs; (2) étendre `packages/cli/src/config/__tests__/coverage-options.test.ts` pour couvrir systématiquement les trois profils en mode `coverage=guided` (dimensions activées, caps, priorité, recommendedMaxInstances) ainsi que les cas `coverage=measure` et `coverage=off` afin de vérifier que `dimensionsEnabled` et le planner restent cohérents avec les invariants sur `dimensionsEnabled` comme projection; (3) ajouter des tests d’erreur ciblés pour les flags invalides (`--coverage`, `--coverage-profile`, `--coverage-dimensions`, `--coverage-exclude-unreachable`, `--coverage-min`, `--coverage-report-mode`) qui vérifient que les messages sont explicites et stables, sans changer le comportement runtime pour les cas valides; (4) s’assurer que les tests restent unitaires (pas d’appel au pipeline) et qu’ils permettent de garder une couverture ≥80 % sur le module d’options coverage CLI.

DoD:
- [x] Les presets `quick`/`balanced`/`thorough` sont couverts par des tests qui fixent dimensionsEnabled, caps, dimensionPriority et recommendedMaxInstances conformément à la spec (cov://§6#budget-profiles).
- [x] Les cas d’erreur pour flags coverage invalides sont testés (messages explicites) sans modifier le comportement pour les entrées valides.
- [x] build/typecheck/lint/test/bench OK.

Parent bullets couverts: [KR1, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
