Task: 9506   Title: Add micro-schemas + E2E assertions for tier behavior, G_valid regressions, and UNSAT stability — subtask 9506.9506001
Anchors: [spec://§10#repair-philosophy, spec://§10#mapping, spec://§6#generator-repair-contract, spec://§15#metrics]
Touched files:
- PLAN.md
- .taskmaster/docs/9506-traceability.md
- .taskmaster/tasks/tasks.json
- packages/core/src/repair/__fixtures__/repair-philosophy-microschemas.ts
- agent-log.jsonl

Approach:
Pour la sous-tâche 9506.9506001, je vais concevoir un petit pack de micro-schemas « repair-philosophy » qui servent de base commune aux tests de tiers, de G_valid et d’UNSAT/stagnation sans changer la sémantique de Repair ou de l’orchestrateur. En m’appuyant sur `spec://§10#repair-philosophy`, `spec://§10#mapping`, `spec://§6#generator-repair-contract` et `spec://§15#metrics`, je vais (1) créer un module de fixtures dédié (par exemple `repair-philosophy-microschemas.ts`) qui expose des schémas minimaux pour chaque motif: Tier-1 only (clamp numéraire simple, string minLength, uniqueItems), Tier-2 hors G_valid (required add, contains witness append, AP:false cleanup) et cas structurels en G_valid (minItems/required/AP dans un contexte gValid_*), (2) documenter pour chaque micro-schema le motif visé, le ou les tiers attendus et, si pertinent, un seed recommandé afin que les tests E2E puissent réutiliser ces fixtures sans dépendre du hasard, (3) garder ces fixtures purement déclaratives (pas de logique, pas de dépendance à coverage ou aux options) afin qu’elles puissent être importées aussi bien par des tests Repair unitaires que par des tests pipeline, et (4) mettre à jour la trace 9506 et agent-log au moment du complete-subtask, après avoir vérifié que les fichiers de fixtures sont couverts par des tests dans la sous-tâche suivante et que la CI (build/typecheck/lint/test/bench) reste verte.

DoD:
- [x] Un module de fixtures repair-philosophy regroupe des micro-schemas ciblés pour Tier-1 only, Tier-2 hors G_valid et cas structurels en G_valid, chacun documenté par un commentaire concis indiquant le motif et le comportement attendu.
- [x] Les micro-schemas couvrent au minimum un exemple de clamp numérique, de string minLength, d’uniqueItems, de required add, de contains witness append, d’AP:false cleanup et d’un cas UNSAT/stagnation aligné avec la règle de Score(x).
- [x] Les fixtures sont purement déclaratives (aucune logique, aucun import de modules de production), et peuvent être importées sans effet de bord depuis des tests Repair unitaires et des tests pipeline.
- [x] La suite build/typecheck/lint/test/bench reste verte après l’ajout de ces fixtures, et la trace 9506 reflète que KR1/KR2/KR3/DEL1/DOD1/TS1 sont couverts par cette sous-tâche.

Parent bullets couverts: [KR1, KR2, KR3, DEL1, DOD1, TS1]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true

DoD:
- [ ] Les tests E2E et unitaires qui consomment ces micro-schemas (9506.9506002/9506.9506003) sont en mesure de les référencer sans duplication ni logique ad hoc.
- [ ] La documentation interne (traceability 9506 et commentaires de fixtures) permet de retrouver rapidement quel micro-schema couvre quel motif de tiers/G_valid/UNSAT.

Parent bullets couverts: [DEL2, DEL3, DOD2, DOD3, TS2, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
