Task: 9304   Title: Add coverage flags to generate and openapi commands (subtask 9304.9304001)
Anchors: [cov://§6#execution-modes-ux, cov://§6#budget-profiles, cov://§7#cli-summary]
Touched files:
- packages/cli/src/index.ts
- packages/cli/src/flags.ts
- packages/cli/src/index.test.ts

Approach:
Pour cette sous-tâche 9304.9304001, je vais étendre le CLI `foundrydata` pour accepter explicitement les options de couverture décrites par les anchors cov://§6#execution-modes-ux et cov://§6#budget-profiles, en ajoutant les flags `--coverage`, `--coverage-dimensions`, `--coverage-min`, `--coverage-report`, `--coverage-profile` et `--coverage-exclude-unreachable` aux commandes `generate` et `openapi`. Côté implémentation, cela consiste à enrichir la définition des options dans `packages/cli/src/index.ts`, à mettre à jour l’interface `CliOptions` dans `packages/cli/src/flags.ts` pour typer ces nouveaux champs, et à s’assurer que la phase de parsing (`parsePlanOptions`) reçoit bien les valeurs brutes sans encore décider de la façon dont elles seront transmises à l’orchestrateur coverage-aware (qui sera traitée par la sous-tâche 9304.9304002). Je veillerai à respecter les invariants de déterminisme (pas de nouvelle source d’aléa) et à ne pas activer d’analyseur de couverture tant que la configuration interne n’est pas branchée, afin que `coverage=off` reste strictement équivalent au comportement actuel.

Je compléterai les tests existants de `packages/cli/src/index.test.ts` par des cas ciblés qui vérifient que les nouvelles options sont acceptées par Commander (présence dans `--help`, absence d’erreur sur un appel basique avec `--coverage=off` et `--coverage-report`), sans encore valider la production d’un rapport coverage-report/v1. Cela permettra de garder une bonne couverture de `index.ts` et de `flags.ts` tout en laissant la logique de mapping détaillée (minCoverage, dimensionsEnabled, profils) au scope de 9304.9304002 et 9304.9304003. Les points d’intégration avec le reste du pipeline resteront strictement en lecture/forwarding de flags pour cette itération.

Risks/Unknowns:
Les principaux risques sont de définir des types ou des noms d’options qui ne s’aligneraient pas parfaitement avec la future configuration coverage (par exemple si les profils ou les dimensions évoluent dans la SPEC) et de créer une confusion UX si `--coverage=off` interagit mal avec d’autres flags existants. Il faudra aussi s’assurer que l’ajout de ces options n’introduit pas de rupture dans les usages existants (scripts CI basés sur `foundrydata generate` sans couverture) et garder à l’esprit que la validation fine de `minCoverage` et des profils sera couverte par les sous-tâches suivantes.

Parent bullets couverts: [KR1, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

