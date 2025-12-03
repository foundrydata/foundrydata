Task: 9406   Title: Update feature and usage docs with G_valid guidance — subtask 9406.9406003
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#generator, spec://§10#repair-engine]
Touched files:
- PLAN.md
- .taskmaster/docs/9406-traceability.md
- .taskmaster/tasks/tasks.json
- docs/COMPREHENSIVE_FEATURE_SUPPORT.md
 - README.md
 - docs/tests-traceability.md
 - docs/ARCHITECTURE.md

Approach:
Pour la sous-tâche 9406.9406003, je vais compléter la surface documentaire côté features/usage pour rendre le contrat Generator vs Repair et G_valid réellement découvrables, en s’appuyant sur les options déjà exposées au niveau `PlanOptions` et de la CLI (spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#generator, spec://§10#repair-engine). Concrètement : (1) enrichir `docs/COMPREHENSIVE_FEATURE_SUPPORT.md` avec une vue plus structurée du contrat Generator/Repair et des zones G_valid (what/why/how), en rattachant clairement les nouveaux flags/profils CLI à ces invariants ; (2) mettre à jour `README.md` pour introduire une courte section “G_valid & no‑repair zone” dans le récit d’ensemble (pipeline 5 phases + contrat) et pointer vers la doc détaillée, sans surcharger la page principale ; (3) aligner `docs/tests-traceability.md` et éventuellement `docs/ARCHITECTURE.md` pour que les scénarios de tests et la vue architecturelle mentionnent le comportement attendu en zone G_valid (classification, absence de Repair structurel par défaut, rôle de `allowStructuralInGValid`) et comment lire les métriques `repairUsageByMotif` ; (4) vérifier que ces docs restent cohérentes avec les tests existants (unitaires, acceptance et e2e G_valid) sans introduire de promesse non imposée par la SPEC, puis relancer build/typecheck/lint/test/bench pour garantir l’absence de régression.

DoD:
- [x] Les pages de features et de support (COMPREHENSIVE_FEATURE_SUPPORT/docs, README, ARCHITECTURE) décrivent explicitement le contrat Generator vs Repair, la notion de zone G_valid et le rôle des options G_valid/Repair, sans divergence avec la SPEC.
- [x] Les docs indiquent clairement comment activer/désactiver G_valid et ajuster la sévérité du Repair en zone G_valid via l’API Node et la CLI (flags/profils), avec au moins un flow d’usage illustratif.
- [x] La matrice de traçabilité des tests (docs/tests-traceability.md) référence les tests et fixtures G_valid existants et précise les invariants (no-repair zone par défaut, metrics cohérentes) de façon alignée aux scénarios réels.
- [x] La suite build/typecheck/lint/test/bench reste verte après ces mises à jour docs, confirmant que la documentation est cohérente avec l’implémentation actuelle.

Parent bullets couverts: [KR3, DEL3, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
