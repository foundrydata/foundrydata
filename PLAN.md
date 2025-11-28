Task: 9304   Title: Add CLI tests for coverage modes and thresholds (subtask 9304.9304004)
Anchors: [cov://§3#coverage-model, cov://§4#architecture-components, cov://§6#execution-modes-ux, cov://§6#budget-profiles, cov://§7#cli-summary, cov://§7#thresholds-mincoverage]
Touched files:
- packages/cli/src/index.ts
- packages/cli/src/index.test.ts
- packages/cli/src/__tests__/coverage-summary.test.ts

Approach:
Pour cette sous-tâche 9304.9304004, je vais ajouter des tests d’intégration CLI autour des modes de couverture, des profils et de `minCoverage`, en m’appuyant sur les anchors cov://§6#execution-modes-ux, cov://§6#budget-profiles et cov://§7#thresholds-mincoverage. Les tests dans `packages/cli/src/index.test.ts` simuleront des appels à `foundrydata generate` et `foundrydata openapi` via `program.parseAsync`, en vérifiant que `coverage=off` laisse le comportement actuel inchangé (instances produites, aucun coverageReport, note d’ignorance pour `coverage-min`/`coverage-report`), que `coverage=measure` et `coverage=guided` produisent bien une summary coverage (en s’appuyant sur `formatCoverageSummary`) et respectent l’ordre de priorité des signaux dans les logs CI. Je viserai des schémas simples pour garder les tests rapides, tout en couvrant les profils de base (au minimum `quick` et `balanced`) et des valeurs représentatives de `minCoverage` (cas qui passe et cas qui échoue).

Je compléterai ces tests par une extension de `packages/cli/src/__tests__/coverage-summary.test.ts` afin de capturer des snapshots ou assertions plus précises sur la summary (notamment pour vérifier que les opérations les moins couvertes sont bien mises en avant et que `targetsByStatus` et les diagnostics (plannerCapsHit / unsatisfiedHints) sont toujours inclus). Enfin, je vérifierai les cas limites demandés par la sous-tâche : combinaisons `coverage=off` + `--coverage-report`/`--coverage-min` (note d’ignorance, pas d’exception) et dimensions inconnues dans `--coverage-dimensions` (erreur déterministe avec message clair), en m’assurant que les codes de sortie CLI correspondent au contrat global (1 pour erreur d’arguments, code spécifique pour `minCoverage` non atteint une fois que ce mapping d’exit code sera implémenté au niveau core).

Risks/Unknowns:
Les principaux risques sont de rendre les tests trop couplés à des détails d’implémentation (par exemple la valeur exacte des pourcentages de couverture) plutôt qu’aux invariants de la SPEC (ordre des signaux, comportement de `minCoverage`, gestion des dimensions inconnues). Il faudra aussi veiller à ne pas introduire de flakiness en s’appuyant sur des schémas trop complexes ou des budgets coverage élevés : les tests doivent rester rapides et déterministes, en ligne avec les contraintes de `maxInstances` et des profils (cov://§6#budget-profiles). Enfin, la cartographie exacte entre `coverageStatus` (ok vs minCoverageNotMet) et les codes de sortie CLI n’est pas encore entièrement câblée côté core; les tests devront donc se concentrer sur ce qui est déjà garanti (présence de la summary, comportement de gating coverage=off, erreurs sur dimensions inconnues) et laisser les vérifications plus fines des exit codes à une itération ultérieure si nécessaire.

Parent bullets couverts: [DOD1, DOD2, DOD4, TS1, TS2, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
