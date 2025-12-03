Task: 9403   Title: Wire G_valid hints into object generation paths — subtask 9403.9403001
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#generator]
Touched files:
- PLAN.md
- .taskmaster/docs/9403-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/generator/foundry-generator.ts

Approach:
Pour la sous-tâche 9403.9403001, je vais câbler les hints G_valid déjà disponibles (index `canonPath -> GValidInfo` fourni par le pipeline) dans les chemins de génération d’objets, de manière purement structurelle et sans changer le comportement actuel (spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#generator). Concrètement : (1) réutiliser l’index G_valid déjà injecté dans `GeneratorEngine` pour exposer un helper interne dédié aux objets (par canonPath), similaire à ce qui a été fait pour les arrays, afin que les branches de génération d’objets puissent interroger le motif courant ; (2) raccorder ce helper aux points de décision existants pour les objets (là où la génération inspecte `properties`, `required` et les types) en lisant l’info G_valid mais sans encore conditionner la stratégie de génération (aucun changement de RNG ni de structure) ; (3) vérifier que lorsque le flag `planOptions.gValid` est à `false`, l’index reste absent et le helper n’a aucun effet, garantissant que la génération pour les objets non-G_valid ou en mode legacy reste strictement inchangée ; (4) s’assurer que l’ensemble de la suite (build/typecheck/lint/test/bench) reste verte pour démontrer que ce câblage est neutre sur le comportement observable. L’objectif est de préparer le terrain pour 9403.9403002 (construction minimal-but-valid) en fournissant un accès déterministe aux motifs G_valid côté objets.

DoD:
 - [x] Les chemins de génération d’objets peuvent interroger le motif G_valid via un helper interne sans modifier la génération actuelle (RNG, structure).
 - [x] Le flag `planOptions.gValid` contrôle entièrement l’activation du plumbing (aucune différence observable lorsque le flag est à `false`).
 - [x] La suite build/typecheck/lint/test/bench reste verte, démontrant l’absence de régression fonctionnelle.
 - [x] Aucun nouveau diagnostic n’est introduit dans cette sous-tâche (plumbing uniquement).

Parent bullets couverts: [KR1, KR4, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
