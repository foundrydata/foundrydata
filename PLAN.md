Task: 9403   Title: Implement minimal-but-valid object construction for G_valid motifs — subtask 9403.9403002
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#generator]
Touched files:
- PLAN.md
- .taskmaster/docs/9403-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/generator/foundry-generator.ts
- packages/core/src/pipeline/__tests__/pipeline-orchestrator.test.ts

Approach:
Pour la sous-tâche 9403.9403002, je vais implémenter la construction minimal-but-valid pour les objets G_valid en s’appuyant sur l’index de classification déjà câblé et sur les helpers de génération existants (spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#generator). Concrètement : (1) détecter, via `getGValidInfoForObject(canonPath)`, les motifs d’objets considérés G_valid (schema simple, properties/required clairs, pas d’AP:false/unevaluated* agressifs) et, dans ces zones, garantir que tous les champs `required` du schéma effectif sont toujours émis par le générateur, en réutilisant les mêmes chemins `generateValue` que pour le reste du pipeline ; (2) veiller à ce que les valeurs produites respectent les contraintes de base (type, enum/const, bornes simples) de manière déterministe et sans déléguer la création de propriétés obligatoires à Repair, tout en continuant à laisser à Repair les ajustements fins (formats, multiples, etc.) ; (3) préserver strictement le comportement actuel pour les objets non-G_valid (présence d’AP:false, unevaluated* ou conditionnels complexes), en conditionnant toute nouvelle logique à la fois au flag `planOptions.gValid` et à la classification, afin que les scénarios legacy restent inchangés ; (4) ajouter des tests ciblés au niveau du pipeline pour au moins un schéma G_valid simple (objet avec `properties` + `required`) et un schéma non-G_valid contrastif, de façon à démontrer que les objets G_valid sortent déjà AJV-valid avant Repair tandis que les autres conservent leur comportement et leurs diagnostics actuels, puis valider l’ensemble via build/typecheck/lint/test/bench.

DoD:
 - [x] Les objets G_valid simples (properties/required sans AP:false/unevaluated* durs) sont générés avec tous leurs champs requis présents et AJV-valid avant toute intervention de Repair.
 - [x] Les objets non-G_valid conservent exactement le comportement legacy (génération + diagnostics), l’activation de G_valid étant strictement conditionnée au flag et à la classification.
 - [x] Des tests pipeline ciblés couvrent au moins un motif G_valid et un motif non-G_valid, démontrant le respect du contrat Generator/Repair sur ces cas.
 - [x] La suite build/typecheck/lint/test/bench reste verte après la modification, montrant l’absence de régression globale.

Parent bullets couverts: [KR1, KR2, KR4, DEL2, DOD1, TS1, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
