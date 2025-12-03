Task: 9406   Title: Wire G_valid options through CLI flags and profiles — subtask 9406.9406002
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§10#repair-engine]
Touched files:
- PLAN.md
- .taskmaster/docs/9406-traceability.md
- .taskmaster/tasks/tasks.json
- packages/cli/src/index.ts
- packages/cli/src/profiles.ts
- docs/COMPREHENSIVE_FEATURE_SUPPORT.md

Approach:
Pour la sous-tâche 9406.9406002, je vais relier les options G_valid définies au niveau `PlanOptions` à la CLI et aux profils prédéfinis, de manière à rendre l’activation/désactivation de G_valid et la sévérité du Repair en zone G_valid contrôlables depuis la ligne de commande sans casser les usages existants (spec://§6#phases, spec://§6#generator-repair-contract, spec://§10#repair-engine). Concrètement : (1) étendre le parsing des options dans `packages/cli/src/index.ts` pour accepter des flags explicites (par exemple `--gvalid` / `--no-gvalid`, voire un flag dédié à la relaxation `allowStructuralInGValid`), en les mappant vers `PlanOptions` en s’appuyant sur `resolveOptions` et en conservant les defaults actuels quand aucun flag n’est fourni ; (2) mettre à jour la définition des profils dans `packages/cli/src/profiles.ts` afin que certains profils avancés puissent activer G_valid par défaut (tout en laissant un profil de compatibilité où G_valid reste désactivé), en documentant clairement les choix de profils ; (3) ajouter des tests d’intégration CLI ciblés qui vérifient que les flags et profils produisent bien les `PlanOptions` attendues (G_valid on/off, Repair strict en zone G_valid) sans perturber les cas existants ; (4) ajuster `docs/COMPREHENSIVE_FEATURE_SUPPORT.md` pour que la matrice de features/flags mentionne ces options G_valid et indique comment les activer/désactiver, puis relancer build/typecheck/lint/test/bench pour garantir l’absence de régression.

DoD:
- [x] Les flags CLI G_valid (et, le cas échéant, les options de sévérité du Repair en zone G_valid) sont parsés et mappés sur `PlanOptions` de façon explicite, avec des defaults qui préservent le comportement actuel lorsqu’ils ne sont pas fournis.
- [x] Les profils CLI sont mis à jour pour refléter des modes d’usage clairs (profil compatibilité sans G_valid, profils avancés avec G_valid activé), et des tests vérifient que les profils produisent les combinaisons d’options attendues.
- [x] La documentation de support de features (COMPREHENSIVE_FEATURE_SUPPORT/docs) mentionne ces flags/profils G_valid et explique comment lire leur effet sur le contrat Generator/Repair.
- [x] La suite build/typecheck/lint/test/bench reste verte après le câblage CLI/profils, confirmant que les nouveaux flags n’introduisent pas de régression.

Parent bullets couverts: [KR2, DEL2, DOD2, TS2]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
