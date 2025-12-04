# AGENT Runbook — Operating Mode (GPT-5 Codex, repair-philosophy)

**Purpose.** Discipline d’exécution et garde-fous pour implémenter la **Repair philosophy (tiers, policy, progress metric Score, coverage-indépendance, budgets/stagnation, observabilité)** à partir de la **SPEC canonique** du générateur JSON Schema.

**Audience.** Agent GPT-5 Codex (VS Code) opérant sur les tâches Taskmaster tagguées **`repair-philosophy`**.

**Status.** Actif — à appliquer systématiquement pour ce tag.

---

## Mode d’emploi (cheat-sheet agent)

### Pré-hook obligatoire (TOUJOURS avant toute implémentation sur `repair-philosophy`)

1. Identifier la sous-tâche visée (ex. via `npx task-master next` → `<TASK>.<SUB>`).
2. Lancer, depuis la racine du repo :
   `./scripts/tm-start-coverage-subtask.sh <TASK>.<SUB>`
   Ce script exécute, dans l’ordre:

   * `npx task-master show <TASK>` (tâche parente)
   * `npx task-master show <TASK>.<SUB>` (sous-tâche)
   * `npx task-master set-status --id=<TASK>.<SUB> --status=in-progress`
3. Ne jamais appeler `npx task-master set-status --status=in-progress` directement pour une sous-tâche sans être passé par ce script ou par la séquence manuelle `show parent` → `show subtask`.

### Boucle principale

1. Vérifier que le tag actif est **`repair-philosophy`** et qu’une **tâche parente** est disponible (`/tm:next` ou `npx task-master next`).
2. Afficher la tâche parente (`/tm:show <id>` ou `npx task-master show <id>`) et lire sa description globale + la liste de ses sous-tâches (ne pas tenter de “tout faire” en une seule passe).
3. Choisir une sous-tâche active (`<TASK>.<SUB>`) en respectant l’ordre / les dépendances, puis la marquer `in-progress` via `./scripts/tm-start-coverage-subtask.sh <TASK>.<SUB>` (ou la séquence manuelle).
   **Anti-biais de scope :** avant d’élargir (ex. toucher `executePipeline` / couverture / planification), vérifier `npx task-master show <id>` pour voir si une sous-tâche dédiée existe. Si oui, considérer ce travail **hors périmètre**.
4. Sélectionner 1–5 anchors SPEC pertinents (`spec://...`, éventuellement `cov://...` si le tag l’exige), REFONLY, quotas respectés.
5. Rédiger `PLAN.md` (200–400 mots) centré sur la sous-tâche en cours, avec `taskId`, `anchors`, `touchedFiles`, approche, risques et checks standard.
6. Implémenter les changements pour cette sous-tâche dans les fichiers listés, **sans changer la sémantique AJV-oracle**,
   et en respectant l’**ordre Repair** + l’**idempotence** définis par la SPEC (shape → bounds → semantics → names → sweep).
7. Ajouter/mettre à jour les tests pour viser **cov ≥80 % sur chaque fichier touché** (ou isoler la logique dans un nouveau module bien couvert).
8. Lancer au minimum `npm run build`, puis `npm run typecheck`, ensuite `npm run lint`, puis `npm run test`, et enfin `npm run bench` (ordre imposé).
9. Vérifier que les diagnostics respectent `diagnosticsEnvelope.schema.json` (diag-schema) et que les bench gates passent.
10. Commit (template) + trailer `REFONLY::{"anchors":[...],"summary":"..."}` valide, marquer la sous-tâche `done` puis consigner dans `agent-log.jsonl`.

---

## Focus spécifique au tag `repair-philosophy` (ce qui change vs `generator-vs-repair-contract`)

### Objectif produit (rappel)

Implémenter/aligner la **philosophie** de Repair **sans** faire dériver :

* l’oracle AJV (validation sur schéma original),
* le mapping `(keyword → action)` existant,
* la séparation par phases,
* le contrat `G_valid` (incluant le traitement des `structuralKeywords` dans `G_valid`).
* l’**ordre d’application des actions Repair** et la règle “répéter une action = no-op” (idempotence).

### Risques typiques (à surveiller)

* **Incohérence G_valid vs Tiers** : ne pas “autoriser Tier‑1 partout” si cela contredit explicitement les limites `G_valid` existantes (notamment pour `structuralKeywords`).
* **Régression du guard G_valid** : si une action `keyword ∈ structuralKeywords` se déclenche en `G_valid`, ne pas la normaliser “par policy” ; la traiter comme **exception/bug/unsat**, et la rendre visible (diag/metrics G_valid).
* **Non‑déterminisme caché** : stableParamsKey / canonicalisation de `params`, ordre de tri, fallback `schemaPath`, etc.
* **Diagnostics “policy vs guards vs budget”** : bien distinguer les codes et shapes.
* **Couverture** : Repair ne doit pas consommer l’état de coverage (`measure/guided`, targets, hit/miss, dimensionsEnabled).
* **Order & seen-set** : ne pas casser la logique anti-boucle (seen-set basé sur `(instancePath, keyword, normalizedParams)`), ni l’ordre Repair.

---

## Traçabilité tâche parente ↔ sous-tâches

* Pour chaque tâche parente du tag `repair-philosophy`, créer (ou mettre à jour) `.taskmaster/docs/<TASK>-traceability.md` avec des bullets stables (`[KR1]`, `[DOD2]`, `[TS5]`, etc.).
* Dans `PLAN.md`, ajouter `Parent bullets couverts: [...]`.
* À la clôture d’une sous-tâche, mettre à jour `<TASK>-traceability.md` et marquer les bullets comme “covered”.

---

## Gardes-fous “Definition of Done” (tag repair-philosophy)

**R1 — Lien explicite Deliverables / Test Strategy**
Une sous-tâche ne passe `done` que si les deliverables concernés sont effectivement livrés et que les tests associés existent **et** ont été exécutés.

**R2 — Checklist DoD dans PLAN.md**
PLAN.md contient une mini-checklist DoD dérivée de la traceability, et elle doit être cochée avant `done`.

**R3 — “pas de tests → pas de done”**
Si un changement touche le comportement Repair/diag/metrics et qu’aucun test n’est modifié/ajouté alors que la stratégie l’exige, rester `in-progress`.

**R4 — agent-log.jsonl**
Chaque `complete-subtask` consigne `anchors`, `touchedFiles`, et la validation (build/typecheck/lint/test/bench).

**R5 — Discipline Taskmaster**
Pas de `done` sans commit (si possible). Sinon expliciter clairement ce qui reste à faire côté humain.

---

## TL;DR opératoire

1. **Source de vérité** : SPEC canonique > AGENTS.md > notes tasks.
2. **REFONLY** : anchors uniquement, pas de prose SPEC copiée.
3. **Boucle** : `get_task` → `in-progress` → anchors (≤5) → `PLAN.md` → patch+tests → build/typecheck/lint/test/bench → diag-schema → commit → `done`.
4. **Séparation des phases** : Normalize → Compose → Generate → Repair → Validate.
5. **Déterminisme** : tuple normatif de la SPEC, pas d’état caché, logs reproductibles.
6. **Repair-philosophy** : tiers/policy + Score/commit rule + budgets/stagnation + observabilité + coverage-indépendance.

---

## Mémoire opérationnelle (pièges à éviter) — Repair philosophy

* **Score/commit rule** : si une mutation ne **baisse pas Score**, elle ne doit pas être commit (et doit être observable via diag).
* **stableParamsKey** : définir/implémenter une canonicalisation JSON stricte (tri de clés), sinon Score diverge entre implémentations.
* **Unifier “params canonicalization”** : éviter deux encodeurs (Score vs seen-set/budgets). Idéalement une seule util (tri récursif, stable stringify) + tests dédiés.
* **G_valid** : toute action liée à un `keyword ∈ structuralKeywords` dans `G_valid` doit rester “exceptionnelle” et visible (métriques/diag), pas une voie nominale.
* **Policy vs guards** : un blocage “tier disabled” doit être distingué d’un blocage “guard empêché” et d’un “budget épuisé”.
* **Coverage** : ne jamais brancher sur `coverage=...`, targets, hit/miss, `dimensionsEnabled` dans Repair.
* **Process order** : si tu ajoutes un nouveau hook/diagnostic autour de Repair, ne modifie pas l’ordre d’application des actions (shape → bounds → semantics → names → sweep).

---

## Règles d’or

1. **SPEC seules font foi.** Pas d’élargissement de périmètre au-delà de la SPEC canonique.
   1bis. **Conformité SPEC non optionnelle.**
2. **REFONLY par anchors.** Pas de texte copié.
3. **AJV oracle** : valider contre le schéma original (pas un artefact interne).
4. **Déterminisme** : RNG seedée, pas d’état global, logs stables.
5. **Vérifiabilité** : diagnostics conformes, tests et benchs exécutés.
6. **Pas de réseau** dans Normalize/Compose/Generate/Repair/Validate.
7. **Parité AJV** : flags alignés entre instances.
8. **AP:false** : respecter strictement CoverageIndex/must-cover.

---

## Boucle d'exécution (Run Loop) pour le tag repair-philosophy

```text
Step 0  Sanity:
        - tâches tag repair-philosophy disponibles ?
        - tag repair-philosophy actif ?

Step 1  Obtenir la tâche parente :
        → /tm:show <id> ou /tm:next
        (ne pas implémenter tout le parent d’un bloc)

Step 1bis Choisir une sous-tâche et la marquer in-progress :
        → ./scripts/tm-start-coverage-subtask.sh <TASK>.<SUB>

Step 2  REFONLY:
        - identifier ≤5 anchors (spec://..., cov://... si requis)
        - ≤2 sections complètes (tous docs confondus) par itération

Step 3  Produire PLAN.md (200–400 mots) + fichiers touchés.

Step 4  PATCH + TESTS (cov ≥80% sur fichiers touchés).

Step 5  build → typecheck → lint → test → bench.

Step 6  Valider diagnostics (diagnosticsEnvelope.schema.json).

Step 7  Commit (template) + trailer REFONLY.

Step 8  Marquer la sous-tâche done.
```

---

## Auto-review SPEC après chaque sous-tâche

Avant commit :

* chaque changement de code doit être rattachable à ≥1 anchor,
* vérifier “policy/tiers/Score” vs `G_valid` (pas de contradiction),
* vérifier que l’**ordre Repair** n’a pas été modifié et que l’idempotence est toujours vraie,
* vérifier que Repair ne dépend pas de coverage state,
* si ambiguïté : geler et produire `SPEC-QUESTION.md`.

---

## Politique REFONLY — Anchors SPEC

### Anchors clés — Repair philosophy

Pour les tâches tagguées `repair-philosophy`, prioriser :

* `spec://§10#repair-philosophy` — (si l’anchor existe) tiers + policy + Score + budgets + observabilité.
  - **Si l’anchor n’existe pas encore** sur la branche: ancrer sur `spec://§10#repair-engine`, `spec://§10#mapping`, `spec://§10#process-order` jusqu’à ce que la section soit créée.
* `spec://§10#repair-engine` — chapitre Repair (contexte, idempotence).
* `spec://§10#mapping` — mapping `(keyword → action)` (ne pas réinventer).
* `spec://§10#process-order` — process Repair, budgets, stagnation/unsat.
* `spec://§6#phases` — pipeline Normalize → Compose → Generate → Repair → Validate.
* `spec://§6#generator-repair-contract` — `G_valid`, limites Repair dans `G_valid`, structuralKeywords.
* `spec://§19#envelope` et `spec://§19#payloads` — schéma diagnostics, phase separation.
* `spec://§14#planoptionssubkey` — PlanOptionsSubKey / clés de déterminisme.
* `spec://§15#rng` et `spec://§15#metrics` — RNG/déterminisme, métriques.
* `spec://§23#repair-interfaces` — interfaces artefacts Repair/actions.

> Si un point dépend explicitement de la spec coverage-aware, utiliser `cov://...` (le strict minimum), mais ne pas laisser Repair lire l’état coverage.

### Quotas REFONLY

* Max 5 anchors par itération.
* Max 2 sections complètes par itération.
* Au-delà : produire une Context Expansion Request.

---

## Déterminisme (côté agent)

* Aucune sélection stochastique d’anchors ; les lister dans l’ordre utile pour la tâche.
* Enregistrer les décisions dans `agent-log.jsonl` (opération, horodatage, taskId, anchors, fichiers modifiés, seeds RNG lors de choix).
* Pas de mutation de global state ; pas de réécriture arbitraire d’IDs.

---

## Playbooks (tag repair-philosophy)

### A) No Task Available

1. Renforcer les tests Repair (Score/commit rule, diagnostics policy/guard/budget, coverage-indépendance).
2. Bench Repair (profils CLI), vérifier gates.
3. Docs : compléter exemples/invariants liés à Repair philosophy.

### B) SPEC ambiguë/contradictoire

Geler et produire `SPEC-QUESTION.md` avec 1–2 anchors.

### C) Décider des problèmes hors-scope

Même démarche que précédemment :

1. Documenter dans `agent-log.jsonl` (+ éventuel `SPEC-QUESTION.md`).
2. Décider clairement : refuser (hors scope) ou proposer nouvelle tâche.
3. Consigner si nécessaire un addendum process dans `AGENTS.md`.
4. Mentionner le suivi dans la PR / trace Taskmaster.

---

## Templates

### Commit message

```text
feat(core): task <ID> — <titre court>

- <3–4 points factuels>
- tests: <pkg>/<file>.spec.ts (cov >=80% touched)

REFONLY::{"anchors":["spec://§10#repair-philosophy","spec://§19#envelope"],"summary":"<résumé 1 ligne>"}
```

### PLAN.md (200–400 mots)

```text
Task: <id>   Title: <title>
Anchors: [spec://§<n>#<slug>, ...]  (≤5)
Touched files:
- packages/<pkg>/src/...
- packages/<pkg>/test/...

Approach:
...

Risks/Unknowns:
...

Parent bullets couverts: [KR1, DOD2, TS5]

Checks:
- build: npm run build
- test: npm run test
- bench: npm run bench
- diag-schema: true
```

---

## Diagnostics — rappels

* `phase` correct (`repair` vs `validate`).
* Nouveaux codes => mettre à jour la table “code ↔ phase” et les validateurs diag si nécessaires.
* Enrichissements `details` => mettre à jour `diag/schemas.ts` / `diag/validate.ts` si requis.


---

## Intégration Task Master — Slash Commands & CLI

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

## AJV — Parité d’instances (rappel)

* `unicodeRegExp:true` des deux côtés.
* `validateFormats` aligné.
* `multipleOfPrecision` aligné avec plan options.
* Gate `AJV_FLAGS_MISMATCH` si divergence.

---

## AP:false — rappels

* Pas d’expansion de coverage AP:false sans mécanisme/flag prévu.
* Must-cover et rename preflight : respecter les garde-fous existants.

---

## Maintenance

* Si conflit SPEC vs AGENTS.md, **SPEC gagne**.
* Toute mise à jour de ce runbook doit préserver les contrats (schemas/quotas/templates) sauf justification explicite.
* Si un élément générique est utile à plusieurs tags (Règles d’or, hors-scope, maintenance), **ne pas le supprimer** : le factoriser (ou le garder) plutôt que le réécrire à la volée.

---

## Annexes / Références

### Exécution de Code TypeScript — Protocole `tsx`

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

### Contrats de sortie (schémas et formats)

> Les objets ci-dessous doivent être produits et validés localement.

#### 1) `refonlyRecord.schema.json`

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

**Encapsulation REFONLY (trailer de commit et artefacts Taskmaster)**

Chaîne stockée :

```text
REFONLY::{"anchors":[...],"summary":"..."}
```

Règles :

* le JSON externe (si présent) doit parser ;
* après suppression du préfixe `REFONLY::`, le JSON interne doit parser et satisfaire le schéma.

---

#### 2) `plan.schema.json` (PLAN.md rendu en JSON à la validation)

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

#### 3) `diagnosticsEnvelope.schema.json`

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

#### 4) `benchGate.schema.json`

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
