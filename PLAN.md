Task: 9407   Title: Extended G_valid motifs — fixtures, acceptance tests and docs (9407.5)
Anchors: [spec://§6#generator-repair-contract, spec://§6#phases, spec://§9#generator, spec://§10#repair-engine, spec://§15#metrics]
Touched files:
- PLAN.md
- .taskmaster/docs/9407-traceability.md
- test/fixtures/g-valid-extended.json
- test/acceptance/gvalid-extended-metrics.acceptance.spec.ts
- docs/COMPREHENSIVE_FEATURE_SUPPORT.md
- docs/spec-canonical-json-schema-generator.md
- test/acceptance/gvalid-extended-contract.acceptance.spec.ts

Approach:
Pour la sous‑tâche 9407.5, consolider la surface « usage » des motifs G_valid étendus (SimpleConditionalObject et DiscriminatedUnionObject) en ajoutant des tests d’acceptance dédiés et une documentation plus explicite dans la SPEC canonique. Côté tests, compléter les scénarios existants basés sur `test/fixtures/g-valid-extended.json` avec une suite qui vérifie le contrat Generator vs Repair de bout en bout : exécutions en posture stricte avec `gValid:true` et Repair structural désactivé dans la zone G_valid, zéro action de Repair sur ces motifs, et instances finales qui respectent les obligations conditionnelles/discriminées. Côté documentation, ajouter une note non normative dans la section G_valid de la SPEC pour décrire que cette implémentation étend G_valid à ces motifs précis, en rappelant les invariants (AP:false, unevaluated*, parité AJV, diagnostics et métriques) et en renvoyant vers COMPREHENSIVE_FEATURE_SUPPORT.md pour l’inventaire des motifs effectivement supportés. L’objectif est que les équipes puissent identifier clairement quelles formes G_valid étendues sont garanties contractuellement et comment lire leurs métriques et gates dans les rapports.

Risks/Unknowns:
- S’assurer que la note SPEC reste cohérente avec la définition générale de G_valid et ne lie pas la SPEC à une implémentation particulière au‑delà de ce qui est permis (ancrer les détails dans des notes non normatives).
- Garder les tests d’acceptance robustes en évitant les assertions sur des métriques absolues trop fragiles (se concentrer sur statut, validité, absence d’actions de Repair et nature des diagnostics).
- S’assurer que les nouveaux tests ne rallongent pas significativement la durée de la suite (garder des comptes de génération modestes pour les scénarios étendus).
Parent bullets couverts: [KR1, KR3, KR5, DEL5, DOD4, TS2, TS4, TS5]

DoD:
- [x] Tests d’acceptance dédiés aux motifs G_valid étendus ajoutés (contrat Generator vs Repair vérifié sur fixtures g-valid-extended, zéro Repair structurel, diagnostics attendus).
- [x] SPEC canonique complétée avec une note non normative décrivant les motifs G_valid étendus supportés par l’implémentation et leurs invariants, en cohérence avec COMPREHENSIVE_FEATURE_SUPPORT.md.
- [x] COMPREHENSIVE_FEATURE_SUPPORT.md reste aligné avec la SPEC et les tests d’acceptance pour les motifs étendus.
- [x] build/typecheck/lint/test/bench OK après les ajouts 9407.5.
- [x] Traceability mise à jour pour 9407.5 (bullets parent marqués covered pour cette sous‑tâche).

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
