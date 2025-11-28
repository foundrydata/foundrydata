Task: 9311   Title: Add CLI command for foundrydata coverage diff (subtask 9311.9311003)
Anchors: [cov://§7#json-coverage-report, cov://§7#multi-run-diff-m2, cov://§3#coverage-model, cov://§7#cli-summary]
Touched files:
- packages/cli/src/index.ts
- packages/cli/src/commands/coverage-diff.ts
- packages/cli/src/index.test.ts
- .taskmaster/docs/9311-traceability.md

Approach:
Pour la sous-tâche 9311.9311003, je vais ajouter une commande CLI dédiée `foundrydata coverage diff` qui charge deux fichiers JSON coverage-report/v1, exécute la logique de diff existante du reporter et imprime un résumé lisible orienté CI, en m’alignant sur les sections JSON coverage report, Multi-run diff (M2) et CLI summary (cov://§7#json-coverage-report, cov://§7#multi-run-diff-m2, cov://§3#coverage-model, cov://§7#cli-summary). Concrètement, j’introduirai un module `packages/cli/src/commands/coverage-diff.ts` qui expose une fonction prenant un objet `Command` Commander, ajoute les options `--baseline` et `--comparison` (ou des arguments positionnels) pour les chemins de rapports, lit et parse les fichiers en `CoverageReport`, vérifie minimalement que `version` est `coverage-report/v1`, puis appelle `diffCoverageReports` du reporter pour obtenir à la fois la classification des cibles et le résumé de métriques. La sortie texte reprendra les signaux clés : delta sur `metrics.overall`, liste des opérations en régression, opérations en amélioration, opérations ajoutées/supprimées et liste synthétique de `newlyUncovered` targets (par dimension/opération).

Dans `packages/cli/src/index.ts`, je brancherai un nouveau sous-commande `coverage diff <baseline> <comparison>` qui délègue au module dédié et utilise la même gestion d’erreurs que les commandes `generate` et `openapi` (ErrorPresenter, codes de sortie stables). La commande retournera un code non nul lorsqu’au moins une régression est détectée (delta overall négatif, opérations en régression ou nouvelles cibles uncovered), conformément à l’esprit de §7.4 Multi-run diff sans sur-interpréter les cas d’incompatibilité (qui restent du ressort de la sous-tâche 9311.9311004 pour des diagnostics plus fins). Je m’assurerai que la commande reste purement en lecture (pas de modification de rapports), déterministe pour des entrées fixées et sans dépendance réseau, en respectant les invariants coverage-aware.

Je compléterai `packages/cli/src/index.test.ts` avec des tests ciblés qui invoquent `main([...,'coverage','diff', ...])` sur des rapports de couverture synthétiques minimalistes écrits dans un répertoire temporaire, en vérifiant que la sortie stderr contient les éléments attendus (delta overall, mention de régressions ou de nouvelles cibles uncovered) et que le code de sortie est 0 en absence de régression et non nul lorsqu’une régression est présente. Pour garantir une bonne couverture tout en gardant ce scope raisonnable, je testerai aussi le cas d’erreur sur fichiers manquants ou JSON invalide, en réutilisant la mécanique existante de capture de `process.exit` dans les tests CLI.

Risks/Unknowns:
Les principaux risques concernent la définition exacte de la politique de sortie (quand considérer qu’il y a “régression” pour le code de retour) et la gestion des cas d’incompatibilité entre rapports (version, engine major, operationsScope) qui doivent générer des erreurs explicites sans produire un diff partiel : je garderai ici une validation minimale (version coverage-report/v1) et laisserai la validation fine à la sous-tâche suivante, afin de ne pas étendre le scope. Il faudra également veiller à ce que la nouvelle commande n’entre pas en conflit avec les conventions existantes de `foundrydata` (syntaxe des sous-commandes, aide, messages d’erreur) et que la lecture de rapports volumineux reste raisonnable en termes de performance (lecture streaming non requise en V1, mais éviter tout traitement inutile).

Parent bullets couverts: [KR5, DEL2, DOD3, TS2, TS4]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
