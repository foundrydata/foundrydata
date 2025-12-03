Task: 9402   Title: Implement combined items + contains generation for G_valid arrays — subtask 9402.9402002
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#generator, spec://§10#repair-engine]
Touched files:
- PLAN.md
- .taskmaster/docs/9402-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/generator/foundry-generator.ts
- packages/core/src/pipeline/orchestrator.ts

Approach:
Pour la sous-tâche 9402.9402002, je vais implémenter, uniquement dans les zones marquées G_valid pour les arrays items+contains (spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#generator, spec://§10#repair-engine), une stratégie de génération combinée qui garantit que les éléments produits satisfont simultanément le schéma `items` effectif et les sous-schémas `contains`, tout en préservant le comportement legacy ailleurs. Concrètement : (1) identifier, dans `generateArray` et `satisfyContainsNeeds`, les chemins où les besoins de `contains` sont planifiés via `containsBag` et conditionner une nouvelle stratégie “G_valid array” à la présence d’un motif G_valid adapté dans l’index (par exemple un motif array simple items+contains) et au flag `planOptions.gValid`; (2) pour ces arrays G_valid, générer en priorité des “witness” d’éléments en partant de la forme `items` (notamment les objets avec `required`) puis en appliquant les contraintes de `contains` (const, enum, etc.), de façon à obtenir une instance AJV-valide sans nécessiter de réparation structurelle sur les propriétés requises ; (3) conserver la logique actuelle (y compris diagnostics CONTAINS_UNSAT_BY_SUM, caps et uniqueItems) lorsqu’aucun motif G_valid ne s’applique, en évitant toute divergence RNG pour les arrays non-G_valid ; (4) ajouter des tests ciblés (unitaires sur le générateur ou via le pipeline) qui comparent, pour un schéma simple items+contains compatible G_valid, le comportement avant/après : en mode G_valid, les éléments satisfont `items`+`contains` d’emblée et la Repair ne touche plus à la structure, tandis que pour des arrays hors G_valid le comportement et les diagnostics restent inchangés. Tout changement restera strictement aligné avec la SPEC (REFONLY) et déterministe pour un tuple (schéma, options, seed) donné.

DoD:
 - [x] En mode G_valid et pour les motifs items+contains simples, le générateur produit des éléments qui satisfont `items` et `contains` sans nécessiter de Repair structurelle.
 - [x] Pour les arrays non-G_valid (AP:false, sacs de contains complexes, uniqueItems lourds), le comportement et les diagnostics restent identiques à la baseline.
 - [x] Des tests (générateur/pipeline) démontrent que la Repair n’a plus à compléter les propriétés requises dans les arrays G_valid, tout en conservant la déterminisme pour un seed donné.
 - [x] build/typecheck/lint/test/bench OK.

Parent bullets couverts: [KR1, KR2, KR3, KR4, DEL2, DOD1, DOD2, TS1, TS2, TS4]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
