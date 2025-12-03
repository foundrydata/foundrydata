Task: 9400   Title: Canonical SPEC — Generator vs Repair contract and G_valid v1 — subtask 9400.9400001
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§9#generator, spec://§10#repair-engine]
Touched files:
- PLAN.md
- .taskmaster/docs/9400-traceability.md
- .taskmaster/tasks/tasks.json
- docs/spec-canonical-json-schema-generator.md

Approach:
Pour la sous-tâche 9400.9400001, je vais relire et ajuster la section canonique “Generator / Repair contract and generator-valid zone (G_valid)” dans `docs/spec-canonical-json-schema-generator.md` afin qu’elle reflète précisément le contrat défini pour G_valid v1, en cohérence avec les sections pipeline (spec://§6#phases), Generator (spec://§9#generator) et Repair Engine (spec://§10#repair-engine), sans recopier de prose dans d’autres documents. Concrètement : (1) vérifier que les définitions des mots-clés structurels, de la zone G_valid et de la notion “valid by construction” couvrent bien les motifs v1 (objets simples, arrays simples items+contains sans interplay AP:false/unevaluated*) et qu’elles distinguent clairement l’intérieur de G_valid du régime minimal witness + bounded Repair; (2) renforcer les liens croisés en veillant à ce que §9 (Generator) et §10 (Repair Engine) référencent explicitement le contrat et les invariants G_valid là où ils décrivent les responsabilités des deux moteurs, sans contredire ARCHITECTURE.md, Invariants.md et Known-Limits.md; (3) aligner la description des compteurs/métriques G_valid avec les guardrails déjà évoqués (usage de Repair dans la zone G_valid vu comme une régression observable, pas comme un chemin normal), en restant dans le cadre des anchors listés; (4) relire la section pour éviter les ambiguïtés ou doublons et mettre à jour `.taskmaster/docs/9400-traceability.md` pour signaler que KR1–KR3/DEL1/DOD1/TS1/TS3 sont bien couverts par cette sous-tâche côté SPEC canonique.

DoD:
- [x] La section canonique “Generator / Repair contract and G_valid” définit clairement G_valid v1 et le contrat Generator/Repair, sans ambiguïté ni contradiction avec ARCHITECTURE/Invariants/Known-Limits.
- [x] §9 (Generator) et §10 (Repair Engine) référencent explicitement le contrat G_valid v1 et les responsabilités associées.
- [x] build/typecheck/lint/test/bench OK.

Parent bullets couverts: [KR1, KR2, KR3, KR4, DEL1, DOD1, TS1, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
