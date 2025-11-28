Task: 9311   Title: Compute metric deltas and regressions (subtask 9311.9311002)
Anchors: [cov://§7#json-coverage-report, cov://§7#multi-run-diff-m2, cov://§3#coverage-model]
Touched files:
- packages/reporter/src/coverage/coverage-diff.ts
- packages/reporter/src/coverage/__tests__/coverage-diff.spec.ts
- .taskmaster/docs/9311-traceability.md

Approach:
Pour la sous-tâche 9311.9311002, je vais enrichir le module packages/reporter/src/coverage/coverage-diff.ts afin de calculer les deltas de métriques entre deux CoverageReport (coverage-report/v1) et de les exposer via une structure de résumé dédiée. En partant du diff de cibles déjà implémenté, je construirai l’univers commun de comparaison en ne retenant que les cibles classées unchanged ou statusChanged et les dimensions présentes dans run.dimensionsEnabled sur les deux rapports, conformément au modèle coverage-report et au contrat de Multi-run diff (cov://§7#json-coverage-report, cov://§7#multi-run-diff-m2, cov://§3#coverage-model). Pour cet univers restreint, j’utiliserai evaluateCoverage depuis @foundrydata/core pour recalculer, pour chaque rapport, metrics.overall et metrics.byOperation, en respectant excludeUnreachable et les statuts deprecated/diagnostic.

À partir de ces métriques recomputées, je définirai un type CoverageDiffSummary qui décrit, pour overall et chaque opération commune, la valeur A, la valeur B et le delta (B − A), et qui marque explicitement les régressions (delta < 0) et les améliorations. Les opérations présentes uniquement dans l’un des rapports seront listées séparément pour information, sans influencer les deltas calculés sur l’univers commun. Le résumé inclura également la liste des newlyUncovered targets issue du diff de cibles (added non couvertes et transitions hit:true → hit:false), de façon à exposer les “nouveaux gaps” sans les diluer dans les agrégats. L’API restera pure et déterministe pour des rapports fixés, sans modifier les CoverageReport d’entrée, afin de pouvoir être utilisée par la future commande CLI de diff.

Je créerai des tests unitaires ciblés dans packages/reporter/src/coverage/__tests__/coverage-diff.spec.ts pour couvrir au moins : un scénario de régression sur metrics.overall, des régressions par opération, un cas où toutes les métriques sont stables ou en amélioration, et un cas où de nouvelles dimensions ou opérations apparaissent uniquement dans le rapport B et sont correctement traitées comme ajouts (newlyUncovered et opérations ajoutées) sans fausser les deltas sur l’univers commun. L’objectif est de garder la logique localisée dans coverage-diff.ts, avec une couverture de tests ≥80 % sur ce fichier.

Risks/Unknowns:
Les principaux risques concernent la définition exacte de l’univers commun pour les métriques : il faut s’assurer que seuls les targets présents dans les deux rapports et dont la dimension est activée des deux côtés contribuent aux deltas, tout en respectant les invariants sur excludeUnreachable et les cibles deprecated/diagnostic. Un autre point de vigilance est la stabilité numérique des ratios lorsque le nombre de cibles communes est faible (risque de ratios 0/0 ou de changements amplifiés par de petits dénominateurs) : je m’alignerai sur la logique d’evaluateCoverage pour éviter toute divergence. Enfin, il faudra veiller à ce que la structure CoverageDiffSummary reste suffisamment générale pour être consommée par la commande CLI de la sous-tâche 9311.9311003 sans anticiper sa mise en forme exacte (textuelle ou JSON). La gestion des cas d’incompatibilité structurelle entre rapports (versions, engine majors ou operationsScope irréconciliables) reste hors scope de cette sous-tâche et sera traitée au niveau de l’orchestrateur de diff/CLI.

Parent bullets couverts: [KR2, KR3, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
