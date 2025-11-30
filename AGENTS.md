# AGENT Runbook — Operating Mode (GPT-5 Codex, coverage-aware-v1)

**Purpose.** Discipline d’exécution et garde-fous pour implémenter **FoundryData – couche coverage-aware V1** à partir des **SPEC** (générateur canonique + spec coverage-aware).

**Audience.** Agent GPT-5 Codex (VS Code) opérant sur les tâches **9300..9334** (tag `coverage-aware-v1`).

**Status.** Actif — à appliquer systématiquement pour ce tag.

---

## Mode d’emploi (cheat-sheet agent)

**Pré-hook obligatoire (TOUJOURS avant toute implémentation sur 9300..9334)**

1. Identifier la sous-tâche visée (ex. via `npx task-master next` → `9301.9301001`).
2. Lancer, depuis la racine du repo :  
   `./scripts/tm-start-coverage-subtask.sh 9301.9301001`  
   Ce script exécute, dans l’ordre:  
   - `npx task-master show 9301` (tâche parente)  
   - `npx task-master show 9301.9301001` (sous-tâche)  
   - `npx task-master set-status --id=9301.9301001 --status=in-progress`
3. Ne jamais appeler `npx task-master set-status --status=in-progress` directement pour une sous-tâche 9300..9334 sans être passé par ce script ou par la séquence manuelle `show parent` → `show subtask`.

**Boucle principale**

1. Vérifier que le tag actif est `coverage-aware-v1` et qu’une **tâche parente** 9300..9334 est disponible (`/tm:next` ou `npx task-master next`).
2. Afficher la tâche parente (`/tm:show <id>` ou `npx task-master show <id>`) et lire sa description globale + la liste de ses sous-tâches (ne pas tenter de “tout faire” en une seule passe).  
   (Si vous utilisez le script `tm-start-coverage-subtask.sh`, cette étape est incluse pour la sous-tâche choisie.)
3. Choisir une sous-tâche active (ex. `9300.1`) en respectant l’ordre / les dépendances, puis la marquer `in-progress` via le script `./scripts/tm-start-coverage-subtask.sh 9300.1` ou, à défaut, en exécutant manuellement dans cet ordre :  
   a) `npx task-master show 9300`  
   b) `npx task-master show 9300.1`  
   c) `npx task-master set-status --id=9300.1 --status=in-progress`
   **Anti-biais de scope :** avant de proposer ou de commencer un travail qui touche une autre phase ou un autre artefact du pipeline (par ex. brancher un nouvel accumulateur dans `executePipeline`), vérifier explicitement via `npx task-master show <id>` si une sous-tâche dédiée existe déjà (ex. “Integrate coverage accumulators into pipeline orchestrator”). Si c’est le cas, considérer ce travail comme **hors périmètre** de la sous-tâche courante : ne pas l’implémenter ni le décrire comme “prochaine étape” dans la même itération. Se limiter au scope décrit par le titre/description de la sous-tâche en cours.
4. Sélectionner 1–5 anchors SPEC pertinents pour cette sous-tâche (`spec://...`, `cov://...`, REFONLY, quotas respectés).
5. Rédiger `PLAN.md` (200–400 mots) centré sur la sous-tâche en cours, avec `taskId`, `anchors`, `touchedFiles`, approche, risques et checks standard.
6. Implémenter les changements pour cette sous-tâche dans les fichiers listés, en respectant les invariants coverage-aware et AP:false.
7. Ajouter/mettre à jour les tests pour viser **cov ≥80 % sur chaque fichier touché** (ou isoler la logique dans un nouveau module bien couvert).
8. Lancer au minimum `npm run build`, puis `npm run typecheck`, ensuite `npm run lint`, puis `npm run test`, et enfin `npm run bench` depuis la racine ; **Codex doit s’assurer que `typecheck` et `lint` précèdent `test`.**
9. Vérifier que les diagnostics respectent `diagnosticsEnvelope.schema.json` (diag-schema) et que les bench gates passent.
10. Créer un commit avec le template fourni (scope = sous-tâche), incluant un trailer `REFONLY::{"anchors":[...],"summary":"..."}` valide, marquer la sous-tâche comme `done` puis consigner l’opération dans `agent-log.jsonl`. La tâche parente ne peut être terminée que lorsque toutes ses sous-tâches sont `done`.  
   *Remarque : si l’environnement d’exécution ne permet pas à l’agent de créer un commit (ex. restrictions Codex CLI), l’agent doit laisser explicitement ces actions au·à la humain·e dans sa réponse finale.*

**Traçabilité tâche parente 93xx ↔ sous-tâches**

- Pour chaque tâche parente 93xx, considérer la section Taskmaster `Implementation Details` (incluant `[Context]`, `[Key requirements]`, `[Deliverables]`, `[Definition of Done]`) ainsi que la section `Test Strategy` comme le **contrat global** de la tâche.
- Lors du premier travail sur une tâche parente 93xx, créer (ou mettre à jour) un fichier dédié `.taskmaster/docs/93xx-traceability.md` (ex. `9303-traceability.md`) listant :  
  • les bullets clés de ces sections avec des identifiants stables (`[KR1]`, `[DOD2]`, `[TS5]`, etc.) ;  
  • un tableau “Mapping 93xx.y → parent bullets” indiquant pour chaque sous-tâche les IDs de bullets couverts et, optionnellement, un statut (`pending`, `in-progress`, `covered`).  
  Aucun bullet critique ne doit rester sans sous-tâche associée ; si c’est le cas, créer une sous-tâche ou ouvrir une `SPEC-QUESTION`.
- Chaque sous-tâche 93xx.y dérive un **sous-contrat** : dans le `PLAN.md` de la sous-tâche (fichier unique à la racine, toujours dédié à la sous-tâche coverage-aware en cours), ajouter une ligne simple du type `Parent bullets couverts: [KR1, DOD2, TS5]` en fin de bloc `Risks/Unknowns:`. Les identifiants utilisés doivent correspondre à ceux du fichier `93xx-traceability.md`. Le reste des bullets du parent est traité comme **hors scope** de cette sous-tâche.
- À la clôture d’une sous-tâche, mettre à jour le fichier `93xx-traceability.md` pour marquer les bullets correspondants comme “covered”. Avant de marquer le parent 93xx en `done`, vérifier que tous les bullets du contrat global sont mappés à ≥1 sous-tâche et marqués `covered`.  
  *Remarque : ne pas créer de `PLAN-93xx.md` spécifique au parent ; `PLAN.md` reste focalisé sur la sous-tâche active et la traçabilité détaillée vit dans `93xx-traceability.md`. Le format de `PLAN.md` doit rester conforme au template fourni dans ce runbook ; la ligne `Parent bullets couverts: [...]` est explicitement autorisée.*

---

## Gardes-fous “Definition of Done” (9300..9334)

> Objectif : éviter qu’une sous-tâche soit marquée `done` ou qu’un commit soit créé tant que le contrat Taskmaster (Implementation Details / Deliverables / Definition of Done / Test Strategy) n’est pas effectivement respecté.

**R1 — Lien explicite avec Deliverables et Test Strategy**

- Une sous-tâche 93xx.y ne doit être marquée `done` que si :
  - tous les Deliverables qui la concernent dans `93xx-traceability.md` sont effectivement implémentés (fichiers créés/modifiés), et
  - les tests mentionnés dans `Test Strategy` pour ces bullets existent et ont été exécutés (`npm run build`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run bench`).
- Si un Deliverable ou un test reste manifestement non traité, laisser la sous-tâche en `in-progress` et expliquer dans `agent-log.jsonl` pourquoi.

**R2 — Checklist DoD dans PLAN.md**

- Pour chaque sous-tâche active, PLAN.md doit contenir une mini-checklist de Definition of Done (DoD) dérivée de `93xx-traceability.md`, par exemple :

  ```text
  DoD:
  - [ ] Schéma coverage-report/v1 défini
  - [ ] Tests AJV reporter ajoutés
  - [ ] build/typecheck/lint/test/bench OK
  ```

- Avant d’appeler `npx task-master set-status --id=<id> --status=done`, Codex doit **cocher** (mettre `[x]`) chaque ligne réellement satisfaite. Une checklist partiellement cochée ⇒ la sous-tâche reste en `in-progress`.

**R3 — Règle “pas de tests → pas de done”**

- Si la section `Test Strategy` d’une tâche ou sous-tâche mentionne des tests nouveaux/étendus (unit/e2e/CLI/reporter) et qu’aucun fichier de test n’a été touché dans cette itération, la sous-tâche **ne doit pas** passer à `done`.
- Inversement, si seul le code est modifié sans tests alors que la stratégie en exige, considérer la sous-tâche comme incomplète et documenter le gap dans `agent-log.jsonl`.

**R4 — Traçabilité de la validation dans agent-log.jsonl**

- Chaque entrée `action":"complete-subtask"` dans `agent-log.jsonl` doit contenir :
  - `anchors` (liste SPEC),
  - `touchedFiles` (liste exhaustive des fichiers modifiés pour cette itération),
  - et une note implicite de validation (ex. “npm run build/typecheck/lint/test/bench (all commands succeeded)”).
- Si Codex ne peut pas exécuter ces commandes dans l’environnement courant, il doit :
  - s’abstenir de marquer la sous-tâche `done`, **ou**
  - expliciter clairement dans sa réponse que la validation est laissée à l’humain·e.

**R5 — Discipline Taskmaster**

- Ne jamais :
  - marquer une sous-tâche 93xx.y `done` **avant** le commit correspondant,
  - marquer une sous-tâche `done` sur la seule base d’une “préparation” (ajout de schéma, refactor partiel) sans les tests associés.
- Avant de marquer la tâche parente 93xx `done`, vérifier :
  - que toutes les sous-tâches sont `done`,
  - que `93xx-traceability.md` ne contient plus de bullets `[KR*]`, `[DEL*]`, `[DOD*]`, `[TS*]` non couverts,
  - et que `agent-log.jsonl` contient au moins une entrée `complete-subtask` par sous-tâche.

---

## TL;DR opératoire

1. **Sources de vérité** :
   **SPEC canoniques + SPEC coverage-aware** > AGENTS.md > notes Tasks.
2. **RefOnly** : référencer les SPEC uniquement via des **anchors** (`spec://...`, `cov://...`), aucune prose copiée.
3. **Boucle** :
   `get_task` → `set_status(in-progress)` → anchors (≤5, spec+cov cumulés) → **PLAN.md** → **PATCH+TESTS** (cov ≥80% sur fichiers touchés) → **build/test/bench** → **diag-schema** → **commit** (template) → `set_status(done)`.
4. **Coverage gating** :
   `coverage=off` ⇒ pas de CoverageAnalyzer, pas de CoverageGraph, pas d’instrumentation.
5. **Dimensions** :
   `dimensionsEnabled` = **projection** sur l’univers de cibles, pas un input dans les IDs. Toggles sur `excludeUnreachable` ne touchent pas aux IDs ni aux statuts.
6. **AP:false** :
   Sous AP:false, **CoverageIndex** est la seule source pour `PROPERTY_PRESENT` sur noms non déclarés. Aucune automaton parallèle.
7. **SCHEMA_REUSED_COVERED** :
   Cible **diagnostique** uniquement : jamais dans `coverage.overall`, `coverage.byDimension`, `coverage.byOperation`, ni dans `minCoverage`.
8. **Séparation des phases** : Normalize → Compose → CoverageAnalyzer → CoveragePlanner → Generate → Repair → Validate → CoverageEvaluator.
9. **Déterminisme** : RNG seedée, pas d’état global caché, même `(canonical schema, OpenAPI spec, coverage options incl. dimensionsEnabled/excludeUnreachable, seed, ajvMajor, registryFingerprint)` ⇒ même CoverageGraph, targets, TestUnits, instances et rapport (hors timestamps).
10. **Diagnostics** : enveloppe `{code, canonPath, phase, details}`, phase correcte, champs obligatoires (`tiebreakRand`, `exclusivityRand`, `budget`).
11. **CLI profiles** :
    `quick` (petit budget, structure+branches), `balanced` (branches+enum) et `thorough` (toutes dimensions dispo, peu ou pas de caps) **doivent** être cohérents avec la SPEC.
12. **Escalade** : SPEC ambiguë/contradictoire → bloquer, produire `SPEC-QUESTION.md`.

---

## Mémoire opérationnelle (pièges à éviter)

* **Inline `tsx --eval`** : écrire un objet JS valide (clé `$schema` directe), quotes simples extérieures, wrapper `(async () => { ... })()`. Proscrire les fragments JSON ou les clés échappées inutilement.
* **Diagnostics regex** : ajout d’un `context` ⇒ mettre à jour simultanément `diag/schemas.ts` et `diag/validate.ts` pour que les contrôles de phase acceptent le nouveau contexte.
* **Defaults stricts** : ne pas laisser `undefined` sur des champs `string` requis dans les options résolues (ex. `resolver.snapshotPath` doit être une chaîne, même vide) avant `tsc --build`.
* **Tests lourds** : sur des schémas volumineux (AsyncAPI/FHIR), si un test e2e dépasse 5s, le relancer ciblé (`vitest run <file> -t "<case>"`) plutôt que relancer tout le pack.
* **Diagnostics run-level** : tout ajout de champs (ex. `details.requested` pour `RESOLVER_STRATEGIES_APPLIED`) impose de rafraîchir les snapshots reporter (JSON/MD/HTML).
* **Mocks fetch** : dans les tests, utiliser `globalThis.fetch` et typer les stubs (`as typeof globalThis.fetch`) pour éviter `no-undef` et restaurer l’état en teardown.

---

## Invariants coverage-aware (suppléments)

À respecter en plus des invariants du pipeline canonique.

* **Gating strict**

  * `coverage=off` ⇒ **pas** de `CoverageAnalyzer`, pas de `CoverageGraph`, pas d’accumulateur de coverage, instrumentation désactivée.
  * `coverage=measure|guided` ⇒ Analyzer + instrumentation activés.

* **Univers de targets vs dimensionsEnabled**

  * L’univers de cibles est défini par le schéma canonique + OpenAPI + version Foundry/rapport.
  * En modes standard, `dimensionsEnabled` décide quelles dimensions sont matérialisées dans `targets[]` et utilisées dans les métriques. Un mode debug/introspection pourra matérialiser plus de dimensions, mais les métriques resteront toujours filtrées par `dimensionsEnabled`.
  * Ne jamais faire dépendre `CoverageTarget.id` ou l’ordre des cibles de `dimensionsEnabled` ou `excludeUnreachable`.

* **Unreachable / excludeUnreachable**

  * `status:'unreachable'` découle des diagnostics existants (`planDiag`, `CoverageIndex` vide, UNSAT connus), jamais d’heuristiques agressives.
  * En cas de doute sur la satisfiabilité, laisser la cible `status:'active'` avec `hit:false` plutôt que la marquer `unreachable`.
  * `excludeUnreachable` agit uniquement sur les dénominateurs dans l’Evaluator, **pas** sur les IDs ni sur les statuts.

* **AP:false & CoverageIndex**

  * Sous `additionalProperties:false`, toute cible `PROPERTY_PRESENT` sur nom non déclaré doit être adossée à `CoverageIndex.has` / `CoverageIndex.enumerate`.
  * Pas d’automate parallèle basé sur `propertyNames`/`patternProperties`. Si la couverture est incertaine, la cible reste uncovered plutôt que “devinée”.

* **SCHEMA_REUSED_COVERED (diagnostic)**

  * Cible présente dans `targets[]` et diagnostics **uniquement pour l’insight**.
  * Ne contribue **jamais** à `coverage.overall` ni à `coverage.byDimension`/`byOperation` ni à `minCoverage`.

* **Hints impossibles / `CONFLICTING_CONSTRAINTS`**

  * Les hints qui sont structurellement impossibles (AP:false qui interdit le nom, schéma booléen `false`, chemins marqués UNSAT par Compose, index enum ou branche hors bornes) doivent être filtrés dès le CoveragePlanner via le `ConflictDetector` et remontés comme `UnsatisfiedHint` avec `reasonCode:'CONFLICTING_CONSTRAINTS'` (cov://§3#coverage-model, cov://§4#coverage-planner, spec://§8#early-unsat-checks).
  * Le générateur ne fait qu’un fallback défensif pour les hints invalides injectés à la main (par exemple un `coverEnumValue` avec index hors intervalle ou un `preferBranch` au‑delà du nombre de branches) et utilise aussi `CONFLICTING_CONSTRAINTS` dans ces cas, sans changer le flux d’instances ni les seeds.
  * `INTERNAL_ERROR` reste réservé aux échecs internes non structurels ; une hint impossible au sens du modèle de contraintes doit toujours être classée en `CONFLICTING_CONSTRAINTS`, et les entrées correspondantes dans `coverageReport.unsatisfiedHints` restent purement diagnostiques (cov://§5#unsatisfied-hints-repair, cov://§7#json-coverage-report).

* **Profils CLI**

  * `quick` : petite `maxInstances` (~50–100), `dimensionsEnabled=['structure','branches']`, caps agressifs.
  * `balanced` : `['structure','branches','enum']`, budget moyen (~200–500), caps modérés.
  * `thorough` : toutes dimensions V1 (incl. boundaries quand dispo), `maxInstances` élevé (≥1000), caps désactivées sauf garde-fous globaux.

---

## Règles d’or

1. **SPEC seules font foi.** Pas d’élargissement de périmètre au-delà des deux documents de SPEC (canonique + coverage-aware).
1bis. **Conformité SPEC non optionnelle.** Ne jamais présenter l’alignement à la SPEC comme un “plus” facultatif ou formulé en conditionnel (ex. “si tu veux coller à la spec”, “si tu veux pousser au niveau SPEC”). Toute formulation doit considérer la conformité intégrale à la SPEC comme obligatoire et non comme une optimisation ou un niveau “premium”.
2. **REFONLY par anchors.** Pas de prose SPEC recopiée; référencer par `spec://...` ou `cov://...`.
3. **Séparation des phases** (Normalize → Compose → CoverageAnalyzer → CoveragePlanner → Generate → Repair → Validate → CoverageEvaluator).
4. **Determinism** : RNG seedée, pas d’état global, journaux de décision.
5. **Vérifiabilité** : diagnostics conformes §19.1, schémas de sortie ci-dessous.
6. **Pas de réseau** dans Analyzer/Planner/Generator/Repair/Validate/CoverageEvaluator.
7. **Parité AJV** : flags alignés entre AJV de génération/planning et AJV de validation (voir section AJV plus bas).
8. **AP:false** : respecter strictement les invariants CoverageIndex (pas d’expansion sauvage).
9. **Coverage=measure** : flux d’instances **identique** à coverage=off pour un tuple fixé `(canonical schema, OpenAPI spec, options, seed, ajvMajor, registryFingerprint)`.
10. **Coverage=guided** : améliore la couverture par hints mais ne viole jamais la validité AJV ni le déterminisme.

---

## Boucle d'exécution (Run Loop) pour le tag coverage-aware-v1

```text
Step 0  Sanity:
        - tâches Taskmaster disponibles ?
        - tag coverage-aware-v1 actif ?

Step 1  Obtenir la tâche parente (contexte global) :
        → /tm:show:show-task <id> ou /tm:next:next-task
        (lire description + sous-tâches, mais ne pas implémenter tout le parent d’un bloc)

Step 1bis Choisir une sous-tâche active et la marquer comme en cours :
        → /tm:set-status:to-in-progress <id>.<subid>

Step 2  REFONLY:
        - identifier ≤5 anchors pertinents (spec://... et/ou cov://...)
        - ≤2 sections SPEC complètes (tous docs confondus) par itération
        - utiliser Grep bornes + Read calculé

Step 3  Produire PLAN.md (200–400 mots) + liste fichiers touchés.

Step 4  Générer PATCH + TESTS (cov ≥80% sur fichiers touchés).

Step 5  Exécuter build/typecheck/lint/test/bench (cmd standard, dans cet ordre et avec `typecheck`/`lint` avant `test`).

Step 6  Valider diagnostics (schéma "diagnosticsEnvelope.schema.json").

Step 7  Commit (template), trailer REFONLY valide.

Step 8  Marquer la sous-tâche comme terminée :
        → /tm:set-status:to-done <id>.<subid> ou /complete-task <id>.<subid>
        (la tâche parente 93xx ne passe à `done` que lorsque toutes ses sous-tâches sont terminées)

---

## Auto-review SPEC après chaque sous-tâche

Après implémentation + tests d’une sous-tâche (avant le commit), l’agent effectue une courte revue ciblée “SPEC-check” :

* Re-lire la liste des anchors de la sous-tâche (PLAN.md: `Anchors: [...]`) et vérifier que chaque changement de code a un lien clair avec au moins un anchor (spec://... ou cov://...), sans extrapoler hors SPEC.
* Vérifier que les invariants coverage-aware et AP:false sont bien respectés pour les fichiers touchés (gating strict coverage=off, `dimensionsEnabled` comme projection uniquement, SCHEMA_REUSED_COVERED uniquement diagnostique, invariants CoverageIndex sous AP:false, etc.).
* Confirmer qu’aucun comportement ajouté ne contredit la SPEC (par exemple instrumentation active alors que coverage=off, IDs de coverage dépendant de `dimensionsEnabled`, diagnostics émis dans une phase interdite).
* En cas de doute réel ou d’ambiguïté non triviale : geler la sous-tâche, produire un `SPEC-QUESTION.md` avec 1–2 anchors représentatifs, puis reprendre la mise en œuvre après clarification.
* Optionnel mais recommandé : noter en une phrase dans `PLAN.md` (ou dans `agent-log.jsonl`) l’issue de la revue, par exemple `SPEC-check: conforme aux anchors listés, aucun écart identifié.`
```

**Commandes standard (npm workspaces)**

```bash
npm i
npm run build
npm run typecheck
npm run lint
npm run test
npm run bench
```

---

## Exécution de Code TypeScript — Protocole `tsx`

**CRITICAL**: Ne pas utiliser `bash -lc 'node - <<EOF'` pour du code TypeScript non compilé.

**❌ INCORRECT**

```bash
bash -lc 'node - <<EOF
import { executePipeline } from "./packages/core/src/pipeline/orchestrator.js";
const res = await executePipeline(schema, options);
console.log(res);
EOF
'
```

**✅ CORRECT : Utiliser `npx tsx --eval` avec wrapper async**

```bash
npx tsx --eval "(async () => {
  const { executePipeline } = await import('./packages/core/src/pipeline/orchestrator.js');
  const { dependentAllOfCoverageSchema } = await import('./packages/core/src/pipeline/__fixtures__/integration-schemas.js');

  const res = await executePipeline(dependentAllOfCoverageSchema, {
    mode: 'strict',
    generate: { count: 2, seed: 37 },
    validate: { validateFormats: false },
  });
  console.log('generated', res.artifacts.generated?.items);
  console.log('repair', res.artifacts.repaired);
  console.log('actions', res.artifacts.repairActions);
})()"
```

**Alternative si compilation déjà faite**

```bash
npm run build

node -e "
import { executePipeline } from './packages/core/dist/pipeline/orchestrator.js';
// ...
"
```

---

## Contrats de sortie (schémas et formats)

> Les objets ci-dessous doivent être produits et validés localement.

### 1) `refonlyRecord.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["anchors", "summary"],
  "properties": {
    "anchors": {
      "type": "array",
      "minItems": 1,
      "items": { "type": "string", "pattern": "^(spec|cov)://§[0-9]+#[a-z0-9\\-]+$" },
      "maxItems": 12
    },
    "summary": { "type": "string", "minLength": 1, "maxLength": 240 }
  },
  "additionalProperties": false
}
```

**Encapsulation REFONLY (tâches 9300..9334 et trailer de commit)**

Chaîne stockée :

```text
REFONLY::{"anchors":[...],"summary":"..."}
```

Règles :

* le JSON externe (si présent) doit parser ;
* après suppression du préfixe `REFONLY::`, le JSON interne doit parser et satisfaire le schéma.

---

### 2) `plan.schema.json` (PLAN.md rendu en JSON à la validation)

```json
{
  "$schema": "http://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["taskId", "title", "anchors", "touchedFiles", "approach", "checks"],
  "properties": {
    "taskId": { "type": "string", "pattern": "^[0-9]{1,5}$" },
    "title": { "type": "string", "minLength": 3 },
    "anchors": {
      "type": "array",
      "minItems": 1,
      "maxItems": 5,
      "items": { "type": "string", "pattern": "^(spec|cov)://§[0-9]+#[a-z0-9\\-]+$" }
    },
    "touchedFiles": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 },
      "minItems": 1
    },
    "approach": { "type": "string", "minLength": 50, "maxLength": 1200 },
    "risks": { "type": "string" },
    "checks": {
      "type": "object",
      "required": ["build", "test", "bench", "diagSchema"],
      "properties": {
        "build": { "const": "npm run build" },
        "test": { "const": "npm run test" },
        "bench": { "const": "npm run bench" },
        "diagSchema": { "type": "boolean", "const": true }
      }
    }
  },
  "additionalProperties": false
}
```

---

### 3) `diagnosticsEnvelope.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["code", "canonPath", "phase", "details"],
  "properties": {
    "code": { "type": "string", "minLength": 1 },
    "canonPath": { "type": "string", "minLength": 1 },
    "phase": {
      "type": "string",
      "enum": ["normalize", "compose", "generate", "repair", "validate"]
    },
    "details": { "type": "object" },
    "budget": {
      "type": "object",
      "properties": {
        "skipped": { "type": "boolean" },
        "tried": { "type": "integer", "minimum": 0 },
        "limit": { "type": "integer", "minimum": 0 },
        "reason": {
          "type": "string",
          "enum": ["skipTrialsFlag", "largeOneOf", "largeAnyOf", "complexityCap"]
        }
      },
      "additionalProperties": false
    },
    "scoreDetails": {
      "type": "object",
      "properties": {
        "tiebreakRand": { "type": "number" },
        "exclusivityRand": { "type": "number" }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": true
}
```

**Table de vérité “code ↔ phase” (extrait)**

| Code                    | Phase autorisée     |
| ----------------------- | ------------------- |
| REGEX_COMPLEXITY_CAPPED | Normalize / Compose |
| COMPLEXITY_CAP_PATTERNS | Generate            |
| COMPLEXITY_CAP_ONEOF    | Compose             |
| COMPLEXITY_CAP_ANYOF    | Compose             |
| COMPLEXITY_CAP_ENUM     | Compose             |
| COMPLEXITY_CAP_CONTAINS | Compose             |
| SCHEMA_SIZE             | Compose             |

---

### 4) `benchGate.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["p95LatencyMs", "memoryPeakMB"],
  "properties": {
    "p95LatencyMs": { "type": "number", "maximum": 120 },
    "memoryPeakMB": { "type": "number", "maximum": 512 }
  },
  "additionalProperties": false
}
```

---

## Politique REFONLY — Anchors SPEC & coverage

### Mapping d'anchor

```text
spec://§<n>#<slug> → docs/spec-canonical-json-schema-generator.md#s<n>-<slug>
cov://§<n>#<slug>  → docs/spec-coverage-aware-v1.x.md#s<n>-<slug>
```

*(remplacer `.x` par la version en cours dans le repo)*

### Procédure de lecture SPEC (canonique)
1. **Grep Section Bounds**

   ```bash
   # Pour lire §N, grep début et fin
   Grep({ pattern: '^<a id="s7-', '-n': true, head_limit: 1 })  # → ligne 321
   Grep({ pattern: '^<a id="s8-', '-n': true, head_limit: 1 })  # → ligne 650
   ```

2. **Calcul automatique**

   ```ts
   const start = 321;
   const end = 650;
   const limit = end - start;
   ```

3. **Read exact**

   ```bash
   Read({
     file_path: 'docs/spec-canonical-json-schema-generator.md',
     offset: start,
     limit: limit
   })
   ```

### Procédure de lecture SPEC coverage-aware

Pour `cov://...` :

* même principe, mais sur le fichier `docs/spec-coverage-aware-v1.x.md` ;
* utiliser les mêmes anchors HTML (`<a id="sN-...">`) s’ils sont présents, sinon s’appuyer sur les titres `## N.` ;
* garder la même discipline : ≤2 sections complètes par itération.

Pseudo-code :

```ts
function readCoverageSection(n: number) {
  const startLine = grep(`^<a id="s${n}-`, extract_first_line);
  const endLine = grep(`^<a id="s${n+1}-`, extract_first_line) || EOF;
  return Read({
    file_path: 'docs/spec-coverage-aware-v1.x.md',
    offset: startLine,
    limit: endLine - startLine
  });
}
```

Cas sans `<a id>` (fallback pratique) :

```bash
# 1) trouver le début de la section 3
rg "^##\s*3\." docs/spec-coverage-aware-v1.x.md -n

# 2) trouver le début de la section suivante (4)
rg "^##\s*4\." docs/spec-coverage-aware-v1.x.md -n

# 3) lire uniquement ce bloc (remplacer START3/START4 par les lignes)
sed -n 'START3,START4-1p' docs/spec-coverage-aware-v1.x.md
```

L’anchor correspondante reste `cov://§3#<slug>` où `<slug>` est dérivé du titre après `## 3.` (minuscule, espaces → `-`, ponctuation retirée), par exemple `cov://§3#coverage-model`.

### Quotas REFONLY (inchangés, mais cumulés spec+cov)

* Max **5 anchors** (`spec://` + `cov://` confondus) par itération.
* Max **2 sections complètes** (canonique + coverage) par itération.
* Si >5 anchors requis → produire une **Context Expansion Request**.

Exemple :

```json
{
  "type": "context-expansion",
  "reason": "anchors>5 ou sections>2",
  "proposedAnchors": [
    "spec://§8#branch-selection-algorithm",
    "cov://§3#coverage-model",
    "cov://§4#architecture-components"
  ]
}
```

---

## Diagnostics — Garde-fous additionnels

* **Score-only** : `scoreDetails.tiebreakRand` renseigné systématiquement, même si `|T|=1`.
* **oneOf exclusivity / step-4** : si RNG utilisée, enregistrer `scoreDetails.exclusivityRand`.
* **Budget score-only** : `budget = {skipped,tried,limit,reason}` renseigné avec `K_effective` **après** caps de Compose.

---

## AP:false — Rappels (compatibles coverage-aware)

* Ne jamais étendre la couverture AP:false depuis `propertyNames.enum` **sans** `PNAMES_REWRITE_APPLIED`.
* Fail-fast `AP_FALSE_UNSAFE_PATTERN` uniquement sous **presence pressure** (`effectiveMinProperties > 0` ou `required` non vide ou `dependentRequired` effectif).
* Sous coverage-aware :

  * Analyzer/Instrumentation **consomment** CoverageIndex, ne le redéfinissent pas.
  * Si CoverageIndex est vide, considérer les cibles correspondantes comme `unreachable` ou non matérialisées, pas comme couvertes.

Cas minimal positif :

```json
{
  "additionalProperties": false,
  "properties": { "a": { "type": "string" } },
  "propertyNames": { "enum": ["a","b"] },
  "PNAMES_REWRITE_APPLIED": true
}
```

Cas négatif (pas de rewrite) :

```json
{
  "additionalProperties": false,
  "propertyNames": { "enum": ["x"] }
}
```

→ pas d’augmentation de couverture.

---

## AJV — Parité d’instances (résumé)

Deux instances AJV : **source** (schéma original) et **planning/génération** (vue canonique). Contraintes :

* `unicodeRegExp:true` sur les deux.
* Dialecte JSON Schema cohérent des deux côtés.
* `validateFormats`: même valeur sur les deux (`false/false` ou `true/true`).
* `multipleOfPrecision` aligné sur `PlanOptions.rational.decimalPrecision`.
* `discriminator`: activé ou désactivé de façon identique.

Écart ⇒ diagnostic `AJV_FLAGS_MISMATCH`.

---

## Playbooks (tag coverage-aware-v1)

### A) No Task Available (aucune tâche 9300..9334 disponible)

1. **Renforcer les tests d’acceptance coverage**

   * Étendre les fixtures simples (oneOf, enums, AP:false, OpenAPI) en suivant la SPEC coverage-aware.
   * Cible : améliorer la lisibilité des rapports coverage-report/v1.

2. **Bench & overhead coverage**

   * Utiliser les profils CLI `quick` / `balanced` / `thorough` sur des specs représentatives.
   * Vérifier respect des gates `benchGate.schema.json`.

3. **Docs**

   * Compléter les sections docs `spec-coverage-aware-v1.x` (exemples, limites connues, FAQ coverage).

### B) SPEC ambiguë/contradictoire

Geler la tâche, produire `SPEC-QUESTION.md` :

```md
# SPEC Question
Anchor(s): ["spec://§...", "cov://§..."]
Symptôme: ...
Impact: ...
Proposition: ...
```

Exemple concret (coverage-aware) :

```md
# SPEC Question
Anchor(s): ["spec://§8#branch-selection-algorithm", "cov://§3#coverage-model"]
Symptôme: Sur un schéma avec `anyOf` profond, la SPEC coverage-aware semble exiger à la fois une materialisation de toutes les branches dans `targets[]` et un budget de composition qui coupe à K=8. Le runbook coverage-aware ne précise pas si les branches non matérialisées doivent être considérées comme `unreachable` ou simplement absentes de l’univers de cibles.
Impact: Ambiguïté sur l’univers de targets et sur le calcul de `coverage.overall` / `coverage.byOperation` lorsqu’un profil CLI `quick` est utilisé sur des specs complexes; risque de divergence entre deux implémentations conformes.
Proposition: Clarifier si, sous caps de Compose, les branches non visitées appartiennent encore à l’univers mais restent `status:'active', hit:false` (avec impact sur les métriques), ou si elles doivent être exclues de l’univers de cibles pour ce run (avec un diagnostic dédié).
```

### C) Décider des problèmes hors-scope

Lorsqu’un agent rencontre une séquence où la SPEC ou l’implémentation soulève un “trou” non couvert par le scope courant (ex. un hint qui devient incompatible avec un mot clé additionnel), appliquer cette démarche :

1. **Documenter l’anomalie immédiatement** dans `agent-log.jsonl` et, si nécessaire, dans un nouveau `SPEC-QUESTION.md` (décrire le symptôme, l’impact, les anchors concernés et la décision envisagée).
2. **Prendre une décision claire** : soit on considère que la garde-fou existe ailleurs et on refuse la tâche, soit on reconnaît un besoin d’extension (par exemple “detecter les hints impossibles lors de la planification”). Dans ce dernier cas, demander explicitement la création d’une nouvelle tâche ou en créer une si on en a la latitude.
3. **Consigner la décision dans `AGENTS.md`** sous une section “Processus de résolution d’enjeux hors-scope”, en expliquant quand et comment prioriser une nouvelle tâche, quelles informations traquer (anchors, tests, logs) et quel niveau de preuve est requis.
4. **Informer le reste de l’équipe** en mentionnant ce suivi dans les commentaires de la PR ou dans la trace Taskmaster, pour éviter que le sujet reste en suspens.

Cette démarche vaut pour tout cas “spécifique mais hors du scope immediat” (pas seulement `not` + hint), et permet de maintenir la transparence sur les décisions et les sujets à déléguer à d’autres tâches.

---

## Templates

### Commit message

```text
feat(core): task <ID> — <titre court>

- <3–4 points factuels de changement>
- tests: <pkg>/<file>.spec.ts (cov >=80% touched)

REFONLY::{"anchors":["cov://§3#coverage-model","spec://§8#branch-selection-algorithm"],"summary":"<résumé 1 ligne>"}
```

### PLAN.md (200–400 mots)

```text
Task: <id>   Title: <title>
Anchors: [spec://§<n>#<slug>, cov://§<m>#<slug>, ...]  (≤5)
Touched files:
- packages/<pkg>/src/...
- packages/<pkg>/test/...

Approach:
<description concise de l’implémentation alignée SPEC (canonique + coverage), décisions clés, invariants, points d’intégration>

Risks/Unknowns:
<liste brève>

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
```

### Exemple d’enveloppe diagnostics

```json
{
  "code": "COMPLEXITY_CAP_ONEOF",
  "canonPath": "#/oneOf",
  "phase": "compose",
  "details": { "limit": 32, "reason": "largeOneOf" },
  "budget": { "skipped": true, "tried": 0, "limit": 32, "reason": "largeOneOf" },
  "scoreDetails": { "tiebreakRand": 0.4123 }
}
```

---

## Déterminisme (côté agent)

* Aucune sélection stochastique d’anchors ; lister dans l’ordre utile pour la tâche.
* Enregistrer les décisions dans `agent-log.jsonl` (opération, horodatage, taskId, anchors, fichiers modifiés, seeds RNG lors de choix).
* Pas de mutation de global state ; pas de réécriture arbitraire d’IDs.

---

## Intégration Task Master — Slash Commands & CLI

*(inchangé, mais contextualisé pour les tâches 9300..9334)*

* `/tm:list:list-tasks`
* `/tm:show:show-task <id>`
* `/tm:next:next-task`
* `/tm:set-status:to-in-progress <id>`
* `/tm:set-status:to-done <id>`
* `/complete-task <id>`

CLI équivalente :

```bash
# VS Code / Codex : pas d’accès programmatique direct à Taskmaster.
# Toujours passer par la CLI ci-dessous (ou les slash commands),
# jamais par une lecture directe des fichiers JSON internes.
npx task-master list
npx task-master show <id>
npx task-master next
npx task-master set-status --id=<id> --status=in-progress
npx task-master set-status --id=<id> --status=done
```

**Politique** : ne jamais lire `.taskmaster/*.json` directement; passer par les commandes.

---

## Outils MCP non disponibles

Les outils MCP Task Master (`mcp__task-master-ai__*`) restent indisponibles; utiliser les slash commands ou la CLI.

---

## Tolérance coverage (fichiers peu couverts)

* La cible reste celle du DoD : **cov ≥80 % par fichier touché** après la tâche. Cette section précise la stratégie quand un fichier de départ est loin de cette cible (legacy très peu couvert).
* Avant de modifier un gros fichier peu couvert, l’agent doit vérifier s’il peut :
  * soit **isoler la logique nouvelle dans un nouveau module/fichier** (par exemple `packages/core/src/.../my-helper.ts`) et le couvrir à ≥80 % via un test dédié (`.../__tests__/my-helper.spec.ts`) ;
  * soit **scoper la modification** pour l’ancrer dans une zone déjà correctement testée (fichier ou sous-module avec coverage raisonnable), plutôt que d’étendre la surface non couverte.
* Si la tâche impose de modifier substantiellement un fichier legacy très peu couvert, l’agent doit :
  * prioriser des tests ciblés sur les chemins réellement impactés (branches principales + erreurs associées) jusqu’à rapprocher la couverture de 80 % sur ce fichier ;
  * éviter de multiplier les refactors opportunistes sur ce fichier dans la même tâche ; si une remontée de couverture plus large est nécessaire, la proposer comme tâche séparée dans `PLAN.md` plutôt que d’exploser le scope courant.
* Dans tous les cas :
  * ne jamais faire **baisser** la couverture effective d’un fichier (aucune ligne précédemment couverte ne doit devenir non couverte) ;
  * documenter dans `PLAN.md` (`Risks/Unknowns`) les fichiers legacy très peu couverts qui sont touchés, ainsi que la stratégie choisie (nouveau module + tests, tests ciblés, ou tâche de coverage dédiée proposée).

---

## Définition de Fini (DoD) — coverage-aware-v1

* Fichiers livrés selon le plan Taskmaster 9300..9334.
* Tests verts, **cov ≥80%** sur fichiers touchés.
* Diagnostics conformes au schéma `diagnosticsEnvelope.schema.json`.
* Validation finale AJV sur le **schéma original**.
* REFONLY correct (schéma + trailer).
* Bench gates respectés.
* Rapport coverage-report/v1 stable, deterministe, et cohérent avec `dimensionsEnabled` / `excludeUnreachable`.
* Pas de texte SPEC copié; uniquement des anchors.

---

## Erreurs courantes à éviter (rappel)

* Émettre `REGEX_COMPLEXITY_CAPPED` hors Normalize/Compose.
* Émettre `COMPLEXITY_CAP_PATTERNS` hors Generate.
* Oublier `tiebreakRand` quand `|T|=1`.
* Étendre AP:false via `propertyNames.enum` sans flag.
* Diverger les flags AJV entre instances.
* Utiliser `dimensionsEnabled` comme input dans la génération des IDs de coverage.

---

## Maintenance

* En cas de doute, commencer par les SPEC (canonique + coverage-aware).
* En cas de conflit SPEC vs AGENTS.md, **SPEC gagne**.
* Toute mise à jour de ce runbook ne doit pas casser les contrats (schémas/quotas/templates) sans justification explicite.
