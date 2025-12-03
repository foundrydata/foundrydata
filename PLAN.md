Task: 9405   Title: Add G_valid no-repair e2e tests and traceability entries — subtask 9405.9405004
Anchors: [spec://§6#phases, spec://§6#generator-repair-contract, spec://§10#repair-engine, spec://§15#metrics-model, spec://§20#bench-gates]
Touched files:
- PLAN.md
- .taskmaster/docs/9405-traceability.md
- .taskmaster/tasks/tasks.json
-,test/e2e/gvalid-no-repair.acceptance.spec.ts
- docs/tests-traceability.md

Approach:
Pour la sous-tâche 9405.9405004, je vais ajouter des tests end-to-end et la traçabilité associée pour des micro‑schémas explicitement classés G_valid, en vérifiant que le contrat “no‑repair zone” est respecté et rendu observable via les métriques et la matrice de tests (spec://§6#phases, spec://§6#generator-repair-contract, spec://§10#repair-engine, spec://§15#metrics-model, spec://§20#bench-gates). Concrètement : (1) définir ou réutiliser 1–2 micro‑schémas G_valid représentatifs (simple objet requis, array `items`+`contains`) et écrire un fichier `test/e2e/gvalid-no-repair.acceptance.spec.ts` qui exécute la pipeline avec `gValid: true`, collecte `PipelineResult.metrics.repairUsageByMotif` et `artifacts.repairActions`, puis affirme que les compteurs structuraux en zone G_valid restent à zéro (ou à une petite tolérance numérique) en régime nominal ; (2) ajouter les mêmes scénarios avec G_valid désactivé ou des motifs non‑G_valid afin de montrer que les métriques distinguent clairement les zones G_valid et non‑G_valid, sans casser la stabilité du générateur ; (3) mettre à jour `docs/tests-traceability.md` pour introduire une famille de motifs “Generator‑valid zone” liée à ces micro‑schémas et tests, en listant les invariants exacts (absence de Repair structurel, métriques G_valid cohérentes, diagnostic éventuel en cas de dérive) ; (4) relancer build/typecheck/lint/test/bench pour garantir que ces e2e et la documentation n’introduisent ni régression de performance ni divergence avec le modèle de métriques global.

DoD:
- [ ] Des tests e2e spécifiques G_valid démontrent que, sur les micro‑schémas ciblés, le pipeline complète avec succès sans Repair structurel en zone G_valid (actions et métriques correspondantes à zéro ou à la tolérance attendue).
- [ ] Des variantes non‑G_valid ou G_valid désactivé montrent que les métriques d’usage du Repair distinguent bien les zones, tout en restant compatibles avec le comportement existant du générateur/Repair.
- [ ] `docs/tests-traceability.md` contient une entrée claire pour la famille de motifs “Generator‑valid zone” (G_valid), reliant micro‑schémas, tests e2e et invariants sur les métriques/Repair.
- [ ] La suite build/typecheck/lint/test/bench reste verte après l’ajout de ces e2e et de la traçabilité, confirmant que le contrat G_valid/no‑repair est vérifié sans régression.

Parent bullets couverts: [KR4, DEL4, DOD3, TS2, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
