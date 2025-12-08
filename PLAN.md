Task: 9407   Title: Extend G_valid motifs — generator & repair posture (9407.2–9407.4)
Anchors: [spec://§6#generator-repair-contract, spec://§6#phases, spec://§9#generator, spec://§10#repair-engine]
Touched files:
- PLAN.md
- .taskmaster/docs/9407-traceability.md
- packages/core/src/repair/__tests__/mapping-repair.test.ts
- test/fixtures/g-valid-extended.json
- test/acceptance/gvalid-extended-metrics.acceptance.spec.ts
- packages/reporter/src/gates/__tests__/gates.test.ts
- docs/COMPREHENSIVE_FEATURE_SUPPORT.md

Approach:
Pour la tâche parente 9407 et les sous-tâches 9407.2–9407.4, compléter l’extension de G_valid au‑delà de v1 en consolidant le comportement du générateur, du moteur de Repair, des métriques et des gates reporter pour les nouveaux motifs `SimpleConditionalObject` et `DiscriminatedUnionObject`. Côté generator, s’appuyer sur l’index G_valid existant pour traiter ces motifs comme des objets G_valid : bypass de la couverture pour les propriétés required/dépendances et satisfaction systématique des branches `then` quand `if` est satisfait, tout en conservant le comportement minimal‑witness hors G_valid. Côté Repair, vérifier que la garde structurelle G_valid bloque bien les actions sur required/minItems/contains dans ces zones, avec diagnostics de type `REPAIR_GVALID_STRUCTURAL_ACTION` et `REPAIR_TIER_DISABLED`, et qu’en posture « relaxed » les actions sont autorisées et comptabilisées. Sur les métriques, ajouter des cas d’acceptance qui assertent les compteurs `gValid_<motif>_*` et `repairUsageByMotif` pour les motifs étendus, puis compléter les tests de gates reporter pour couvrir la détection de motifs supplémentaires via les clés `gValid_*_itemsWithRepair/actions`. Enfin, documenter dans `COMPREHENSIVE_FEATURE_SUPPORT.md` la présence de ces motifs étendus en restant aligné avec le contrat Generator/Repair et les phases de la pipeline.

Risks/Unknowns:
- S’assurer que l’extension de la zone G_valid aux motifs conditionnels et discriminés ne viole pas les exclusions AP:false/unevaluated* ni les invariants de phases décrits dans la SPEC canonique.
- Bien encadrer les tests de métriques pour éviter des assertions fragiles sur les valeurs absolues, et rester concentré sur l’absence/présence d’actions et la cohérence strict/relaxed.
- La couverture bench spécifique aux nouveaux motifs n’est pas abordée dans cette itération et reste à connecter aux suites de performance existantes si nécessaire.
Parent bullets couverts: [KR2, KR3, KR4, KR5, DEL2, DEL3, DEL4, DEL5, DOD2, DOD3, DOD4, TS2, TS3, TS4]

DoD:
- [x] Générateur étendu pour traiter les motifs `SimpleConditionalObject` et `DiscriminatedUnionObject` comme G_valid (instances complètes sans Repair structurel en posture stricte).
- [x] Moteur de Repair vérifié pour bloquer les réparations structurelles dans les motifs étendus en posture stricte, avec métriques et diagnostics conformes, et pour compter correctement les actions en posture « relaxed ».
- [x] Tests d’acceptance et de reporter gates ajoutés pour les motifs étendus, métriques G_valid et GVALID_REPAIR, sans régression sur les tests v1 existants.
- [x] build/typecheck/lint/test/bench OK
- [x] Traceability mise à jour pour 9407 et ses sous‑tâches pertinentes (9407.2–9407.5)

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
