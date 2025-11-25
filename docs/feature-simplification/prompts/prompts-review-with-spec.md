Voilà des versions prêtes à copier‑coller, en incluant ARCHITECTURE.md, COMPREHENSIVE_FEATURE_SUPPORT.md et Invariants.md comme sources normatives au même niveau que la spec canonical + README.

Je te propose 4 phases :

* Phase 0 (facultative) : cartographie spec → code
* Phase 1 : audit global
* Phase 2 : patch minimal sur un lot de bugs
* Phase 3 : re‑audit ciblé

---

### Prompt 0 — Cartographie spec → code (optionnel)

```text
PHASE 0 — CARTOGRAPHIE SPEC → CODE (OPTIONNELLE).

Contexte:
- Projet: FoundryData — AJV-first test data engine pour JSON Schema & OpenAPI.
- Specs / docs normatives à suivre (toutes ont statut de vérité):
  - Spec canonical JSON Schema generator:
    docs/spec-canonical-json-schema-generator.md
  - README du projet:
    README.md
  - Architecture pipeline & AJV:
    ARCHITECTURE.md
  - Couverture fonctionnelle & limitations contrôlées:
    COMPREHENSIVE_FEATURE_SUPPORT.md
  - Invariants cross-phase (Normalize/Compose/Generate/Repair/Validate):
    Invariants.md

Tâche:
1. Lis toutes les docs ci‑dessus.
2. Parcours l’arborescence du projet (packages/core, packages/cli, packages/reporter, etc.).
3. Construit une CARTOGRAPHIE "spec → code" du canonical JSON schema generator:
   - Pour chaque bloc fonctionnel majeur (Normalize, Compose, Generate, Repair, Validate, AJV oracle, RNG, diagnostics, metrics), indique:
     - La ou les sections de spec/invariants concernées (nom + résumé très court).
     - Les fichiers / modules principaux (chemin + rôle).
     - Les symboles ou types clés (fonctions, classes, types).
   - Signale également:
     - Les parties de la spec ou des invariants pour lesquelles tu ne trouves PAS d’implémentation évidente.
     - Les zones du code que tu n’as pas eu le temps d’inspecter.

Sortie attendue:
- Une section "Zones principales du canonical JSON schema generator" avec:
  - Liste des blocs fonctionnels,
  - Pour chacun: sections de spec/invariants ↔ fichiers/symboles.
- Une section "Lacunes de mapping" avec:
  - Sections de spec/invariants sans implémentation claire,
  - Fichiers critiques non inspectés ou seulement survolés.

Contraintes:
- Ne modifie aucun fichier.
- Ne propose aucun patch.
- Si une correspondance spec → code est incertaine, indique‑le explicitement comme "incertain" plutôt que d’inventer.
```

---

### Prompt 1 — Audit global spec → codebase

```text
PHASE 1 — AUDIT GLOBAL, AUCUN PATCH.

Contexte:
- Projet: FoundryData — AJV-first test data engine pour JSON Schema & OpenAPI.
- Specs / docs normatives à suivre (même niveau de vérité):
  - Spec canonical JSON Schema generator:
    docs/spec-canonical-json-schema-generator.md
  - README du projet:
    README.md
  - Architecture pipeline & AJV, pipeline 5 phases:
    ARCHITECTURE.md
  - Couverture fonctionnelle & limitations contrôlées (Controlled Limitations / Known Limits):
    COMPREHENSIVE_FEATURE_SUPPORT.md
  - Invariants cross-phase (Normalize/Compose/Generate/Repair/Validate, AJV, RNG, diagnostics):
    Invariants.md

Tâche:
En utilisant ton accès au repo:

1. Lis les docs normatives ci‑dessus.
2. Parcours l’arborescence du projet (packages/core, packages/cli, packages/reporter, etc.) et identifie le code qui implémente ou influence le canonical JSON schema generator, en particulier:
   - packages/core/src/transform (Normalize, Compose),
   - packages/core/src/generator,
   - packages/core/src/repair,
   - packages/core/src/pipeline (orchestrator, AJV wiring, metrics),
   - packages/core/src/util (RNG, hashing, AJV helpers, pointer maps),
   - packages/core/src/diag et src/errors,
   - les tests associés (unitaires par phase, e2e pipeline).
3. Sur cette base, réalise un AUDIT GLOBAL du code TypeScript lié à cette feature.

Sortie attendue (structure de la réponse):

A. Zones principales inspectées:
- Liste les modules/fichiers que tu considères comme cœur du "canonical JSON schema generator":
  - Pour chaque zone:
    - chemin du fichier ou dossier,
    - rôle (Normalize, Compose, Generate, Repair, Validate, AJV, RNG, diag, metrics…),
    - bref commentaire sur ce que tu as lu.
- Liste aussi les "Zones non inspectées ou seulement survolées" si c’est le cas.

B. Liste structurée de bugs / écarts / gaps, au format:

  - ID: BUG-01, BUG-02, ...
  - Type:
    [impl-bug | écart-à-la-spec | doc-mismatch | known-limit-ambiguë
     | test-manquant | perf/complexité | inconclus]
  - Sévérité:
    [critique | majeur | mineur]
  - Confiance estimée:
    [élevée | moyenne | faible]
  - Fichier(s) et symboles concernés:
    - chemin(s) + fonction(s)/méthode(s)/type(s) précis.
  - Invariant / spec / doc concerné(e):
    - référence courte vers la source normative (par ex.:
      "Spec §...", "ARCHITECTURE — Core Principles v2, point 1",
      "Invariants — Generation invariants / RNG", etc.).
  - Explication courte (2–4 phrases):
    - pourquoi c’est un bug ou un écart potentiel,
    - ou pourquoi c’est plutôt un manque de tests / observabilité.
  - Indices / éléments observables:
    - mentionne les patterns concrets (exemples de code, absence de check, flags AJV divergents, usage de RNG global, contournement du pipeline, etc.).
  - Impact potentiel:
    - sur quoi cela pourrait impacter (déterminisme, conformité AJV, strict vs lax,
      external $ref, performance/SLO, diagnostics).

Contraintes d’interprétation:
- Traite ARCHITECTURE.md, COMPREHENSIVE_FEATURE_SUPPORT.md et Invariants.md comme NORMATIFS, au même titre que la spec canonical et le README.
- Ne considère PAS comme bug:
  - les comportements explicitement décrits comme "Controlled Limitation" ou "Not supported (by design)" dans COMPREHENSIVE_FEATURE_SUPPORT.md,
  - sauf si l’implémentation diverge de ces docs.
- Quand tu n’as pas assez d’éléments pour conclure à partir de la seule lecture statique:
  - classe le point en Type = "inconclus" ou "test-manquant",
  - mets la Confiance à "faible" et explique ce qui manque (par ex. tests, bench, exemple de schéma).

Contraintes générales:
- Ne modifie AUCUN fichier.
- Ne propose AUCUN patch TypeScript ou changement de test dans cette réponse.
- Concentre‑toi sur:
  - conformité à la spec normative et aux invariants,
  - respect du pipeline Normalize → Compose → Generate → Repair → Validate,
  - AJV comme oracle (Source vs Planning) et leur parité de flags,
  - déterminisme (seed, RNG local, absence de global RNG / Date.now),
  - comportements strict vs lax,
  - comportement external $ref et modes, tels que décrits dans les docs.
```

---

### Prompt 2 — Patch minimal pour un lot de bugs

````text
PHASE 2 — PATCH MINIMAL POUR UN LOT DE BUGS.

Contexte:
- Même repo FoundryData.
- Même corpus normatif (toutes ces sources ont le même poids):
  - docs/spec-canonical-json-schema-generator.md
  - README.md
  - ARCHITECTURE.md
  - COMPREHENSIVE_FEATURE_SUPPORT.md
  - Invariants.md
- Bugs à corriger dans CE PASS (et seulement ceux‑là):
  - BUG-01: {copier le résumé + Type + fichiers concernés}
  - BUG-02: {…}
  - BUG-03: {…}

Tâche:
Pour ces bugs UNIQUEMENT:

1. Rappel du problème
   - Pour chaque BUG-xx:
     - ré-explique en 1–2 phrases pourquoi c’est un bug ou un écart à la spec/invariants/doc,
     - rappelle la ou les sources normatives concernées (spec / ARCHITECTURE / COMPREHENSIVE_FEATURE_SUPPORT / Invariants).

2. Exemple représentatif (repro conceptuel)
   - Pour chaque BUG-xx, propose un exemple minimal illustratif (sans forcément écrire un test complet):
     - schéma JSON minimal (ou extrait) qui met le problème en évidence,
     - éventuellement seed et options de pipeline (strict vs lax, PlanOptions clés),
     - comportement observé "avant patch" vs comportement attendu "après patch".

3. Proposer un PATCH MINIMAL
   - Modifie directement les fichiers du repo (code + tests) via ton accès au workspace.
   - Pour chaque BUG-xx:
     - applique le changement le plus local possible qui résout le problème sans refactoriser largement.
     - si le BUG-xx est de Type "doc-mismatch" ou "known-limit-ambiguë":
       - corrige en priorité la doc (spec / ARCHITECTURE / COMPREHENSIVE_FEATURE_SUPPORT / Invariants),
       - ne change pas le comportement du pipeline sauf si la doc indique clairement que l’implémentation est erronée.

4. Diffs unifiés
   - Pour chaque fichier modifié (code ET tests), montre un diff unifié lisible:

diff --git a/chemin/fichier.ts b/chemin/fichier.ts
...

5. Tests associés

   * Pour chaque BUG-xx:

     * indique précisément quels tests existants couvrent ou devraient couvrir le cas (chemin + nom de test),
     * et/ou propose un nouveau test (chemin de fichier de test + nom de test) qui verrouille le comportement corrigé.
   * Les modifications de tests doivent aussi apparaître en diff unifié.

6. Commandes à exécuter

   * En fin de réponse, liste les npm scripts / commandes à lancer pour valider ces correctifs
     (unitaires par phase, e2e pipeline, bench si pertinent).

Contraintes fortes:

* Ne corrige que les bugs listés (BUG-01..03) dans ce pass.
* Ne modifie que les fichiers strictement nécessaires (code + tests).
* Ne change pas l’API publique ni les invariants documentés, sauf si le bug est précisément une violation de ces invariants
  et que la ou les sources normatives l’indiquent clairement.
* Respecte strictement:

  * le pipeline Normalize → Compose → Generate → Repair → Validate (pas de contournement ou de raccourci),
  * AJV comme oracle (Source vs Planning) et les règles de parité de flags,
  * le déterminisme (seed) et les invariants RNG (pas de Math.random / Date.now / global RNG),
  * les règles strict vs lax et external $ref telles que décrites dans COMPREHENSIVE_FEATURE_SUPPORT.md et Invariants.md,
  * les Controlled Limitations / Known Limits: ne les "élargis" pas sans que ce soit explicitement demandé.
* Ne renomme pas de symboles publics, ne réorganise pas massivement les fichiers,
  sauf si c’est indispensable à la correction du bug et clairement justifié.

````

---

### Prompt 3 — Re-audit ciblé des fichiers modifiés

```text
PHASE 3 — RE-AUDIT CIBLÉ DES FICHIERS MODIFIÉS.

Contexte:
- Certaines corrections ont été appliquées aux fichiers que TU as modifiés précédemment pour BUG-01..03.
- La spec canonical, le README, ARCHITECTURE.md, COMPREHENSIVE_FEATURE_SUPPORT.md et Invariants.md restent la source de vérité.

Tâche:
1. Réanalyse UNIQUEMENT les fichiers que tu as modifiés pour BUG-01..03
   (code et tests).
2. Pour chaque BUG du lot (BUG-01..03):
   - indique un statut:
     - "semble résolu",
     - ou "doute" (comportement plausible mais non entièrement vérifiable en statique),
     - ou "toujours présent",
   - explique en 2–3 phrases pourquoi tu choisis ce statut, en t’appuyant sur:
     - les invariants et la spec,
     - et les tests qui existent maintenant.

3. Vérifie pour ces fichiers:
   - qu’ils respectent maintenant la spec et les invariants pertinents:
     - pipeline Normalize → Compose → Generate → Repair → Validate,
     - AJV comme oracle (Source vs Planning),
     - invariants RNG/déterminisme,
     - modes Strict vs Lax et politiques external $ref / Known Limits.
   - qu’aucun nouveau problème évident n’a été introduit:
     - non déterminisme,
     - contournement d’AJV,
     - violation des invariants cross-phase des Invariants.md,
     - régression par rapport aux Controlled Limitations / Known Limits.

4. S’il reste des problèmes:
   - liste-les comme de nouveaux IDs (BUG-NEXT-01, BUG-NEXT-02, ...), avec le même format que pour la Phase 1:
     - ID, Type, Sévérité, Confiance, Fichier(s)/symboles, Invariant/spec/doc concerné, Explication courte.
   - ne propose aucun patch dans cette phase.

Contraintes:
- Ne modifie aucun fichier dans cette phase.
- Ne rouvre pas un audit global: reste strictement sur le périmètre des fichiers modifiés pour BUG-01..03.
- Si tu n’as pas assez d’éléments pour conclure, marque le statut comme "doute" ou "inconclus" plutôt que d’affirmer.
````

Tu peux utiliser seulement les phases 1 et 2 au quotidien, et garder les phases 0 et 3 pour les passes plus lourdes (refactor, gros chantiers de conformité à la spec).
