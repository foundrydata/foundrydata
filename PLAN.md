Task: 9323   Title: Describe coverage-report/v1 in reporter README
Anchors: [cov://§7#json-coverage-report, cov://§7#thresholds-mincoverage]
Touched files:
- packages/reporter/README.md
- .taskmaster/docs/9323-traceability.md

Approach:
Pour la sous-tâche 9323.9323001, je vais ajouter à `packages/reporter/README.md` une section dédiée à `coverage-report/v1` qui décrit, à un niveau d’abstraction adapté au reporter, la structure du `CoverageReport` telle que définie dans la SPEC coverage-aware (cov://§7#json-coverage-report, cov://§7#thresholds-mincoverage). Cette section expliquera les grandes familles de champs (en-tête `version`/`engine`/`run`, bloc `metrics` avec `overall`, `byDimension`, `byOperation`, `targetsByStatus` et `thresholds`, puis tableaux `targets`/`uncoveredTargets` et `unsatisfiedHints`/`diagnostics`) en insistant sur le fait que le reporter consomme ces rapports comme une source d’insights, sans redéfinir la sémantique du format. Je m’alignerai sur le type `CoverageReport` partagé (packages/shared) et sur les sections 7.x de la SPEC pour choisir quelques champs représentatifs dans un petit exemple JSON, en évitant de recopier la SPEC et en renvoyant explicitement vers `docs/spec-coverage-aware-v1.0.md` pour le contrat exhaustif. Enfin, je garderai la documentation claire quant à la provenance des fichiers (générés en amont par le CLI core via `--coverage-report`) et je mettrai à jour `.taskmaster/docs/9323-traceability.md` pour marquer cette sous-tâche comme couvrant les bullets KR1/DEL1/DOD1/TS1 du parent 9323.

Risks/Unknowns:
- Le principal risque est de désynchroniser le contenu du README reporter par rapport au type `CoverageReport` réel ou à la SPEC coverage-aware ; je limiterai le texte à une vue d’ensemble stable (champs majeurs, rôle des seuils et de `coverageStatus`) et je vérifierai les noms de champs directement dans `packages/shared` et la SPEC.
- Il faudra trouver un équilibre entre un exemple JSON suffisamment parlant (quelques champs `metrics`, un extrait de `run`, un élément de `targets`) et la nécessité de ne pas dupliquer la SPEC ni figer des détails de représentation qui peuvent évoluer (par exemple l’ordre des champs ou la présence de nouveaux diagnostics).
- Comme cette sous-tâche ne couvre pas encore le CLI diff ni les liens croisés avec le README core, je m’assurerai que le texte reste strictement focalisé sur la structure de `coverage-report/v1` et qu’il n’anticipe pas de workflows diff/CI qui seront documentés dans les sous-tâches suivantes.

Parent bullets couverts: [KR1, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
