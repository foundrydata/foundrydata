Task: 9324   Title: Implement coverage-aware CLI examples and docs
Anchors: [cov://§6#execution-modes-ux, cov://§6#budget-profiles, cov://§7#json-coverage-report, cov://§7#cli-summary, cov://§7#thresholds-mincoverage]
Touched files:
- docs/use-cases/product-scenarios.md
- examples/README.md
- .taskmaster/docs/9324-traceability.md

Approach:
Pour la sous-tâche 9324.1, je vais d’abord mettre à jour `docs/use-cases/product-scenarios.md` pour ajouter, dans chaque scénario existant (API mocks, contract tests, LLM testing), un bloc “Extension coverage-aware” qui montre comment activer `coverage=measure` ou `coverage=guided` sur les mêmes schémas, en restant cohérent avec les modes décrits en cov://§6#execution-modes-ux et les profils/budgets de cov://§6#budget-profiles. Chaque extension présentera un ou deux appels CLI concrets (generate ou openapi) avec des flags `--coverage`, `--coverage-dimensions`, `--coverage-profile` et un `--coverage-report` pointant vers un fichier simple (par ex. `coverage.json`), en expliquant brièvement ce que l’équipe peut tirer du rapport (inspection rapide de `metrics.overall` et des dimensions clés), en renvoyant vers la SPEC pour les détails. Ensuite, j’ajouterai à `examples/README.md` une sous-section dédiée “Coverage-aware generation” qui centralise des exemples plus systématiques : un run `coverage=measure` pour audit passif, un run `coverage=guided` avec profile `balanced` ou `thorough`, un exemple `quick` adapté aux jobs rapides, et un extrait de flux CI montrant l’usage de `--coverage-min` et `--coverage-exclude-unreachable` en cohérence avec cov://§7#json-coverage-report, cov://§7#cli-summary et cov://§7#thresholds-mincoverage. Je garderai les commandes copy‑pasteables depuis la racine du repo, alignées sur `coverage-options.ts` (noms de flags, valeurs par défaut, profils) et je mettrai à jour `.taskmaster/docs/9324-traceability.md` pour refléter que cette sous-tâche couvre l’ensemble des bullets KR/DEL/DOD/TS définis pour 9324.

Risks/Unknowns:
- Risque de divergence entre les commandes documentées et le comportement réel du CLI (en particulier les profils et la sémantique de `--coverage-min` / `--coverage-exclude-unreachable`) ; je m’alignerai strictement sur `packages/cli/src/index.ts` et `packages/cli/src/config/coverage-options.ts` et je vérifierai que les chemins et counts proposés restent raisonnables (budgets proches des presets quick/balanced/thorough).
- Éviter de paraphraser de larges portions de la SPEC coverage-aware : je décrirai uniquement le minimum nécessaire (modes, profils, seuil global) et renverrai vers `docs/spec-coverage-aware-v1.0.md` pour les détails sur coverage-report/v1, en gardant les exemples centrés sur l’UX CLI.
- S’assurer que les scénarios produit restent lisibles malgré l’ajout de blocs coverage-aware ; je garderai une structure répétable “CLI de base → Extension coverage-aware” pour chaque scénario et je veillerai à ce que les nouvelles commandes ne masquent pas les usages non coverage.

Parent bullets couverts: [KR1, KR2, KR3, KR4, KR5, DEL1, DEL2, DEL3, DOD1, DOD2, DOD3, TS1, TS2, TS3, TS4, TS5]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
