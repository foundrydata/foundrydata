Task: 9302   Title: Define coverage event model and accumulator
Anchors: [cov://§3#coverage-model, cov://§3#dimensions, cov://§4#generator-instrumentation, spec://§8-coverage-index-export]
Touched files:
- packages/core/src/coverage/index.ts
- packages/core/src/coverage/events.ts
- packages/core/src/coverage/__tests__/events.test.ts

Approach:
Pour cette sous-tâche, je vais introduire un modèle d’événements de couverture aligné sur les cibles V1 (cov://§3#coverage-model, cov://§3#dimensions) et un accumulateur qui projette ces événements sur les `CoverageTarget` matérialisés par l’Analyzer. Concrètement, je définirai des types d’événements pour `SCHEMA_NODE`, `PROPERTY_PRESENT`, `ONEOF_BRANCH`, `ANYOF_BRANCH`, `CONDITIONAL_PATH` et `ENUM_VALUE_HIT`, en utilisant systématiquement `canonPath`, `dimension` et `params` compatibles avec la forme canonique des targets et avec l’instrumentation prévue dans le générateur (cov://§4#generator-instrumentation). L’accumulateur sera construit à partir de la liste de `CoverageTarget` (structure, branches, enum) et préparera des index déterministes par `(dimension, kind, canonPath, params)` afin de garantir une recherche en O(1) par événement, tout en restant insensible aux champs runtime (`status`, `meta`, `hit`). Il maintiendra un ensemble de `target.id` marqués comme hit à partir des événements reçus, sans créer de nouveaux IDs, et exposera une API pure pour produire des `CoverageTargetReport[]` prêts pour l’Evaluator, en laissant les décisions de métriques (exclusion des `status:'unreachable'`, traitements spécifiques de `SCHEMA_REUSED_COVERED`) aux couches supérieures. Je veillerai à ce que la logique respecte les invariants AP:false : les événements de présence de propriété ne feront aucune hypothèse sur les noms, mais se contenteront de consommer l’output de l’instrumentation branchée sur `CoverageIndex` (spec://§8-coverage-index-export). Enfin, je concentrerai l’implémentation dans un nouveau module dédié `coverage/events.ts` bien testé, et mettrai à jour `coverage/index.ts` pour exposer proprement les nouveaux types et l’accumulateur.

Risks/Unknowns:
Les principaux risques concernent la stabilité de la projection entre événements et targets si la forme des `params` évolue dans `analyzer`, ainsi que l’intégration future avec la validation pour éviter de marquer comme hit des cibles issues d’instances invalides ; ces points seront vérifiés lors des tâches ultérieures de connexion au pipeline.

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
