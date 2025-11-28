Task: 9304   Title: Write coverage-report JSON file to disk (subtask 9304.9304005)
Anchors: [cov://§3#coverage-model, cov://§4#architecture-components, cov://§7#json-coverage-report]
Touched files:
- packages/cli/src/index.ts
- packages/cli/src/index.test.ts

Approach:
Pour cette sous-tâche 9304.9304005, je vais compléter le support CLI de coverage-report/v1 en faisant en sorte que `--coverage-report=<file>` persiste effectivement le rapport JSON produit par le pipeline lorsque `coverage=measure|guided`, comme décrit par la SPEC (cov://§3#coverage-model, cov://§4#architecture-components, cov://§7#json-coverage-report). Côté implémentation, cela passera par l’utilisation de la configuration déjà résolue par `resolveCliCoverageOptions` dans `packages/cli/src/index.ts` (champ `reportPath`) : après exécution du pipeline et une fois `artifacts.coverageReport` disponible, le CLI écrira ce rapport au chemin demandé (absolu ou relatif au cwd), en utilisant un format JSON pretty-printé pour faciliter les diff et la consommation en CI. Je veillerai à ce que cette écriture ne se produise jamais lorsque `coverage=off` (aucun rapport produit) et à ce qu’une erreur d’écriture soit signalée clairement sur stderr sans casser le flux de données principal.

Dans `packages/cli/src/index.test.ts`, j’ajouterai un test d’intégration dédié qui exécute `foundrydata generate` sur un petit schéma avec `--coverage=measure` et `--coverage-report` pointant vers un fichier dans un répertoire temporaire, puis vérifie que le fichier est créé, parse en JSON et contient au moins `version: "coverage-report/v1"` et un `engine.coverageMode` cohérent. Les tests existants autour de `coverage=off` continueront de vérifier que, dans ce mode, `--coverage-report` est simplement ignoré avec une note sur stderr (sans fichier). Cela permettra de couvrir le chaînon manquant entre la production du rapport par le pipeline (tâche 9303) et son exposition pratique côté CLI (9304), tout en respectant les invariants de déterminisme et de gating coverage=off.

Risks/Unknowns:
Le principal risque est d’introduire des effets de bord inattendus lorsqu’un chemin invalide ou non inscriptible est passé à `--coverage-report` (par exemple en CI avec un répertoire en lecture seule). Je traiterai ce cas de manière défensive en journalisant un warning explicite sur stderr sans faire échouer le run principal, de sorte que la génération de données reste fiable même si le rapport ne peut pas être persisté. Il faudra aussi veiller à ne pas mélanger cette responsabilité d’écriture de fichier avec la sémantique de `minCoverage` et de `coverageStatus` (déjà gérées côté core) : la tâche se limite à sérialiser fidèlement le rapport déjà produit, sans tenter de recalculer des métriques.

Parent bullets couverts: [DEL2, DOD4, DOD5]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

