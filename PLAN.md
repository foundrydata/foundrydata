Task: 9311   Title: Add fixtures and tests for coverage diff behavior (subtask 9311.9311004)
Anchors: [cov://§7#json-coverage-report, cov://§7#multi-run-diff-m2, cov://§3#coverage-model]
Touched files:
- packages/core/src/coverage/diff.ts
- packages/core/src/coverage/__tests__/coverage-diff.spec.ts
- packages/reporter/src/coverage/coverage-diff.ts
- packages/reporter/src/coverage/__tests__/coverage-diff.spec.ts
- packages/cli/src/commands/coverage-diff.ts
- packages/cli/src/index.test.ts
- .taskmaster/docs/9311-traceability.md

Approach:
Pour la sous-tâche 9311.9311004, je vais consolider la couverture de tests autour de la logique de diff coverage en ajoutant des fixtures et des scénarios explicites pour les trois couches concernées : le module de diff du moteur dans @foundrydata/core, la façade reporter et la commande CLI `foundrydata coverage diff`. En partant de la définition du rapport coverage-report/v1 et de la section Multi-run diff (M2) (cov://§7#json-coverage-report, cov://§7#multi-run-diff-m2, cov://§3#coverage-model), je vais créer des fixtures CoverageReport synthétiques en TypeScript (et, si utile, quelques JSON statiques) qui couvrent les cas suivants : cibles added/removed/statusChanged, régressions et améliorations de metrics.overall et metrics.byOperation, cibles newlyUncovered (added uncovered et hit:true→hit:false) et univers de dimensions/d’opérations modifié entre A et B.

Au niveau core, j’ajouterai un fichier de tests dédié `packages/core/src/coverage/__tests__/coverage-diff.spec.ts` qui exerce diffCoverageTargets et diffCoverageReports directement sur ces fixtures, en vérifiant les catégories de cibles, les deltas calculés et la séparation régressions/améliorations, y compris un scénario où des dimensions supplémentaires ne modifient pas les deltas sur l’univers commun. Côté reporter, je garderai des tests centrés sur l’API façade (import depuis `coverage-diff.ts`) pour garantir la stabilité des types et la compatibilité avec les usages existants. Enfin, côté CLI, j’enrichirai les tests du module `packages/cli/src/index.test.ts` couvrant la commande coverage diff en s’appuyant sur des rapports sérialisés sur disque : cas sans régression, cas avec régression (exitCode non nul) et cas d’incompatibilité basique (par exemple version de rapport divergente), en veillant à garder la logique d’erreur alignée avec ErrorPresenter sans ajouter de contournement.

Risks/Unknowns:
Les principaux risques concernent la multiplication de fixtures redondantes ou trop fragiles par rapport aux évolutions du format coverage-report/v1. Pour limiter cela, je privilégierai des rapports synthétiques construits en TypeScript à partir des types partagés plutôt que de gros JSON “réalistes”, et je me focaliserai sur les invariants du diff (classification, deltas, newlyUncovered) plutôt que sur chaque champ du rapport. Il faudra aussi veiller à ne pas empiéter sur le scope de futures sous-tâches dédiées à la validation fine des compatibilités (engine major, operationsScope) : pour cette itération, je me concentrerai sur la couverture comportementale des scénarios définis par la SPEC Multi-run diff et je traiterai les erreurs de compatibilité uniquement à travers les garde-fous déjà présents (vérification de version dans la commande CLI).

Parent bullets couverts: [DEL3, DOD1, DOD4, TS1, TS2, TS4]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
