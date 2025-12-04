Task: 9502   Title: Add repair-philosophy diagnostics codes and metrics counters — subtask 9502.9502001
Anchors: [spec://§10#repair-philosophy, spec://§19#envelope, spec://§19#payloads]
Touched files:
- PLAN.md
- .taskmaster/docs/9502-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/diag/codes.ts
- packages/core/src/diag/schemas.ts
- packages/core/src/diag/__tests__/diag-codes.test.ts

Approach:
Pour la sous-tâche 9502.9502001, je vais ajouter (ou confirmer) les diagnostics Repair nécessaires à la philosophie dans le registre central et les schémas de payloads, sans toucher encore aux compteurs de métriques. En m’appuyant sur `spec://§10#repair-philosophy` et sur la section diagnostics (§19), je vais (1) vérifier que les codes `REPAIR_TIER_DISABLED` et `REPAIR_REVERTED_NO_PROGRESS` sont bien présents dans `packages/core/src/diag/codes.ts` avec la phase `repair`, et ajuster au besoin les types et le mapping code↔phase, (2) aligner `packages/core/src/diag/schemas.ts` (ou l’équivalent) pour que les shapes `details` de ces codes correspondent exactement aux payloads normatifs (keyword, requestedTier, allowedMaxTier, reason pour le premier; keyword, scoreBefore, scoreAfter pour le second), (3) ajouter ou mettre à jour des tests unitaires dans `packages/core/src/diag/__tests__/diag-codes.test.ts` pour vérifier que ces codes sont déclarés, que la phase est correcte et que les schémas acceptent des payloads valides et rejettent des payloads invalides, puis (4) relancer build/typecheck/lint/test/bench pour garantir que ces modifications restent compatibles avec le reporter/CLI et l’enveloppe diagnostics commune.

DoD:
- [x] Les codes `REPAIR_TIER_DISABLED` et `REPAIR_REVERTED_NO_PROGRESS` sont bien déclarés dans le registre diagnostics avec phase `repair`, et leurs payloads sont décrits dans les schémas de détails conformément à la SPEC (champs requis, types, enums).
- [x] Les tests unitaires de diagnostics valident que ces codes sont présents, que leur phase est correcte et que les payloads conformes passent la validation tandis que des payloads incorrects (champs manquants/mauvais types) échouent.
- [x] Les changements n’introduisent aucune nouvelle phase ou code hors périmètre de la philosophie Repair (pas de modification des diagnostics Normalize/Compose/Generate/Validate) et restent compatibles avec la forme de l’enveloppe diagnostics.
- [x] La suite build/typecheck/lint/test/bench reste verte après ces modifications, confirmant la compatibilité avec le reporter/CLI et l’écosystème existant.

Parent bullets couverts: [KR1, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
