Task: 9322   Title: Add optional coverage step to EVALUATION.md
Anchors: [cov://§6#execution-modes-ux, cov://§7#json-coverage-report, cov://§7#cli-summary]
Touched files:
- EVALUATION.md
- .taskmaster/docs/9322-traceability.md

Approach:
Pour la sous-tâche 9322.9322003, je vais étendre `EVALUATION.md` avec une petite étape optionnelle “Coverage (facultatif)” qui montre comment lancer rapidement un run `coverage=measure` sur le même schéma réel utilisé dans l’évaluation de base, en m’alignant sur la SPEC coverage-aware (cov://§6#execution-modes-ux, cov://§7#json-coverage-report, cov://§7#cli-summary). Cette étape proposera une commande CLI simple (JSON Schema et/ou OpenAPI) qui ajoute `--coverage=measure`, `--coverage-dimensions` et `--coverage-report` à la commande de génération, en expliquant : (1) que `coverage=measure` n’altère pas les instances par rapport à `coverage=off` pour un tuple fixé, (2) comment lire le résumé coverage sur stderr (per-dimension, per-operation, overall) et (3) comment inspecter le fichier coverage-report/v1 généré si besoin. Je veillerai à positionner cette étape comme purement optionnelle, sans rendre la couverture obligatoire pour évaluer FoundryData, et à garder les commandes copy‑pasteables pour un projet externe (pas le repo FoundryData lui‑même). Enfin, je mettrai à jour `.taskmaster/docs/9322-traceability.md` pour marquer cette sous-tâche comme couvrant [KR4, DEL3, DOD3, TS3] du parent 9322.

Risks/Unknowns:
- Risque de rendre l’évaluation initiale trop lourde si l’étape coverage est présentée comme obligatoire ; je la positionnerai explicitement comme “optionnelle” et m’assurerai que le flux core (Steps 1–5) reste valide sans coverage.
- Il faut éviter de sur-promettre des garanties coverage qui ne sont pas normatives en V1 (par exemple 100 % branches/enum) ; je me bornerai à encourager l’inspection des métriques (par dimension, par opération) en renvoyant vers les specs et docs plus détaillées pour l’interprétation avancée.
- Les commandes d’exemple doivent rester réalistes pour un projet externe (schémas côté utilisateur, pas ceux de ce repo) tout en restant alignées sur les flags coverage réellement disponibles (`--coverage`, `--coverage-dimensions`, `--coverage-report`) ; je réutiliserai le style de commandes déjà présenté dans README/examples pour garder la cohérence.

Parent bullets couverts: [KR4, DEL3, DOD3, TS3]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
