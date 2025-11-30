Task: 9323   Title: Document coverage diff CLI usage
Anchors: [cov://§7#json-coverage-report, cov://§7#cli-summary, cov://§7#multi-run-diff-m2]
Touched files:
- packages/reporter/README.md
- .taskmaster/docs/9323-traceability.md

Approach:
Pour la sous-tâche 9323.9323002, je vais compléter `packages/reporter/README.md` avec une section dédiée au CLI `foundrydata coverage diff`, en m’alignant sur l’implémentation actuelle (`registerCoverageDiffCommand`) et la SPEC coverage-aware (cov://§7#json-coverage-report, cov://§7#cli-summary, cov://§7#multi-run-diff-m2). Cette section décrira la commande `foundrydata coverage diff <baseline> <comparison>`, les prérequis sur les fichiers (rapports `coverage-report/v1` cohérents, même version et contraintes de compatibilité), la sémantique du résumé imprimé (delta global, per-operation, opérations ajoutées/supprimées, cibles nouvellement uncovereds et changements de statut) et le contrat d’exit code : `process.exitCode=0` quand il n’y a pas de régression ni de nouvelles gaps, `process.exitCode=1` quand le diff met en évidence une baisse d’overall, des régressions per-operation ou de nouvelles cibles uncovereds, sauf si `--fail-on-regression=false` est explicitement passé. Je garderai la documentation centrée sur l’usage (comment générer les rapports via `--coverage-report`, où placer les fichiers et comment interpréter la sortie), tout en renvoyant vers la SPEC pour les détails sur le calcul des métriques et la table de vérité des statuts. Enfin, je mettrai à jour `.taskmaster/docs/9323-traceability.md` pour marquer cette sous-tâche comme couvrant [KR3, DEL2, DOD2, TS2] du parent 9323.

Risks/Unknowns:
- Risque de divergence entre la documentation du diff (arguments, compatibilité, conditions de régression) et le comportement réel de `registerCoverageDiffCommand` ; je m’alignerai sur le code CLI et les tests existants (`CLI coverage diff command` dans `packages/cli/src/index.test.ts`) pour décrire exactement les cas `exitCode=0`, `exitCode=1` et les erreurs de compatibilité.
- Il faudra garder la section lisible sans recopier toute la SPEC : je présenterai le flux minimal (générer deux rapports, lancer `coverage diff`, interpréter le résumé et l’exit code) tout en renvoyant vers la section Multi-run diff de la SPEC pour les détails sur les catégories de cibles (unchanged, added, removed, statusChanged) et les règles de calcul des deltas.
- Cette sous-tâche ne couvre pas encore les liens croisés avec le README core ni les scripts de tests/CI ; je veillerai à ne pas promettre d’intégrations qui relèvent de 9323.9323003 ou de tâches futures, en me limitant à décrire l’outil CLI lui-même.

Parent bullets couverts: [KR3, DEL2, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
