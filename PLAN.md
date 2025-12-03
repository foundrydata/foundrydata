Task: 9402   Title: Plumb G_valid hints into array generation paths — subtask 9402.9402001
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#generator, spec://§10#repair-engine]
Touched files:
- PLAN.md
- .taskmaster/docs/9402-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/generator/foundry-generator.ts
- packages/core/src/pipeline/orchestrator.ts

Approach:
Pour la sous-tâche 9402.9402001, je vais injecter les informations de motifs G_valid déjà calculées (index `canonPath -> GValidInfo` fourni par le pipeline) dans les chemins de génération d’arrays du générateur, de façon purement “plumbing” et derrière le flag existant `planOptions.gValid`, sans modifier encore la logique de construction des items/contains. Concrètement : (1) étendre la signature et/ou le contexte interne de `GeneratorEngine` dans `foundry-generator.ts` pour accepter l’index G_valid transmis par l’orchestrateur et l’exposer via un helper interne dédié aux chemins array (par exemple une méthode privée qui renvoie les métadonnées G_valid pour un `canonPath` donné) ; (2) faire remonter l’index jusqu’aux points de décision structurants pour les arrays (chemins où sont déjà gérés `containsBag`, `minItems`, `uniqueItems`, etc.), sans conditionner encore les décisions sur ces motifs mais en préparant le terrain pour la sous-tâche suivante qui sélectionnera la stratégie G_valid vs legacy ; (3) s’assurer que ce passage d’index ne change rien lorsque `planOptions.gValid` est false (aucun accès à l’index, aucun coût supplémentaire significatif) et que les seeds et sorties restent strictement déterministes pour des tuples d’options donnés ; (4) ajouter ou ajuster des tests ciblés (par exemple dans les tests du pipeline ou du générateur) pour vérifier que le plumbing n’affecte pas les sorties existantes et que l’index G_valid est bien disponible aux emplacements attendus lorsque le flag est activé. Je resterai strictement dans le scope “plumbing” : pas de changement de comportement métier, pas de nouveaux diagnostics, uniquement la mise à disposition de l’information G_valid aux chemins arrays.

DoD:
 - [x] L’index G_valid est accessible depuis les chemins de génération d’arrays (au moins là où les sacs de contains sont gérés), sans modifier la génération existante.
 - [x] Le flag `planOptions.gValid` contrôle entièrement l’activation du plumbing (aucune différence de sortie ni de diagnostics lorsqu’il est à false).
 - [x] Les tests de pipeline/générateur restent verts et confirment l’absence de régression observable (comportement inchangé hors inspection interne de l’index).
 - [x] build/typecheck/lint/test/bench OK.

Parent bullets couverts: [KR1, KR2, KR4, DEL1, DOD1, TS4]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
