Task: 9304   Title: Implement coverage summary printer for CI logs (subtask 9304.9304003)
Anchors: [cov://§3#coverage-model, cov://§4#architecture-components, cov://§7#cli-summary]
Touched files:
- packages/cli/src/index.ts
- packages/cli/src/coverage/coverage-summary.ts
- packages/cli/src/index.test.ts

Approach:
Pour cette sous-tâche 9304.9304003, je vais implémenter un module `packages/cli/src/coverage/coverage-summary.ts` qui prend en entrée un objet `CoverageReport` (ou au minimum ses champs `metrics.byDimension`, `metrics.byOperation`, `metrics.overall`, `metrics.targetsByStatus` et `diagnostics`) et produit une chaîne lisible pour les logs CI, en respectant l’ordre de priorité décrit dans cov://§7#cli-summary : d’abord les métriques par dimension, puis par opération (en mettant en avant les moins couvertes), ensuite la couverture globale, puis un bref résumé `targetsByStatus` et enfin un aperçu des `plannerCapsHit` et `unsatisfiedHints`. La fonction sera pure, déterministe et indépendante de la façon dont le report est obtenu (measure/guided), afin de rester conforme aux invariants du coverage model (cov://§3#coverage-model, cov://§4#architecture-components).

Dans `packages/cli/src/index.ts`, j’intègrerai cette fonction dans le flux CLI en ajoutant une étape qui, lorsque le coverage report est disponible (coverage=measure|guided et option CLI appropriée), formate la synthèse et l’écrit sur stderr ou stdout de manière stable, sans perturber le flux principal de données (items NDJSON/JSON). Je veillerai à ce que la summary ne soit pas émise lorsque coverage=off (aucun report), et à ce qu’elle reste concise et structurée pour les logs CI (une ou quelques lignes stables, pas de bruit). Enfin, je préparerai la surface d’API de sorte que les tests CLI puissent capturer cette summary et vérifier l’ordre (byDimension → byOperation → overall) ainsi que la présence des principales composantes (targetsByStatus, caps/hints).

Risks/Unknowns:
Les principaux risques sont de rendre la summary trop verbeuse ou instable pour les logs CI (changements d’ordre ou de format non nécessaires) et de ne pas refléter correctement les signaux de priorité définis par la SPEC (cov://§7#cli-summary) — par exemple en mettant `metrics.overall` en avant au détriment des métriques par dimension ou par opération. Il faudra également veiller à rester aligné avec les invariants du coverage report (cov://§3#coverage-model, cov://§4#architecture-components) : ne jamais dériver de conclusions sur les cibles `unreachable` qui contrediraient `excludeUnreachable`, ne pas réinterpréter `coverageStatus` ou `thresholds`, et ne pas introduire de logique qui modifierait les métriques elles‑mêmes (la summary est purement une vue). Enfin, le raccordement dans `index.ts` doit être fait de manière à ne pas casser les usages existants du CLI (pas d’exception si le report est absent, aucun impact sur les streams de données).

Parent bullets couverts: [KR3, DEL2, DOD4, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
