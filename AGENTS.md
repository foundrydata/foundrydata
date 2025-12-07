# AGENT Runbook — Operating Mode (GPT-5 Codex, observability-platform-metrics-v1)

**Purpose.** Discipline d’exécution et garde-fous pour implémenter **Observability & Platform Metrics v1** :
- baseline `diag.metrics` (timings/counters/SLIs),
- invariants coverage (`coverage-report/v1`, caps + planned/unplanned, guided≥measure),
- observabilité Repair (tiers + `gValid_*` + diagnostics),
- observabilité Resolver R1 (run-level diags + fingerprint),
- vue dérivée Reporter/Platform View + gates CI (artefacts dérivés, pas source de vérité).

**Audience.** Agent GPT-5 Codex (VS Code) opérant sur les tâches Taskmaster tagguées **`observability-platform-metrics-v1`**.

**Status.** Actif — à appliquer systématiquement pour ce tag.

---

## Mode d’emploi (cheat-sheet agent)

### Pré-hook obligatoire (TOUJOURS avant toute implémentation sur `observability-platform-metrics-v1`)

1. Identifier la sous-tâche visée (ex. via `npx task-master next` → `<TASK>.<SUB>`).
2. Lancer, depuis la racine du repo :
   `./scripts/tm-start-coverage-subtask.sh <TASK>.<SUB>`
   Ce script exécute, dans l’ordre:

   * `npx task-master show <TASK>` (tâche parente)
   * `npx task-master show <TASK>.<SUB>` (sous-tâche)
   * `npx task-master set-status --id=<TASK>.<SUB> --status=in-progress`

3. Ne jamais appeler `npx task-master set-status --status=in-progress` directement pour une sous-tâche sans être passé par ce script ou par la séquence manuelle `show parent` → `show subtask`.

### Boucle principale

1. Vérifier que le tag actif est **`observability-platform-metrics-v1`** et qu’une **tâche parente** est disponible (`/tm:next` ou `npx task-master next`).
2. Afficher la tâche parente (`/tm:show <id>` ou `npx task-master show <id>`) et lire sa description globale + la liste de ses sous-tâches (ne pas tenter de “tout faire” en une seule passe).
3. Choisir une sous-tâche active (`<TASK>.<SUB>`) en respectant l’ordre / les dépendances, puis la marquer `in-progress` via `./scripts/tm-start-coverage-subtask.sh <TASK>.<SUB>` (ou la séquence manuelle).
   **Anti-biais de scope :** avant d’élargir (ex. toucher `executePipeline`, ou modifier une structure de sortie), vérifier `npx task-master show <id>` pour voir si une sous-tâche dédiée existe. Si oui, considérer ce travail **hors périmètre**.
4. Sélectionner 1–5 anchors SPEC pertinents (`spec://...`, `cov://...`), REFONLY, quotas respectés.
5. Rédiger `PLAN.md` (200–400 mots) centré sur la sous-tâche en cours, avec `taskId`, `anchors`, `touchedFiles`, approche, risques et checks standard.
6. Implémenter les changements **sans changer la sémantique pipeline** :
   - *observability doit être passive* (no side-effects),
   - ne pas réinterpréter les métriques/specs (source de vérité = artefacts canoniques),
   - ne pas introduire de dépendance au wall-clock/env pour le contrôle de flux,
   - ne pas ajouter d’I/O réseau dans les phases core (R1 est une pré-phase).
7. Ajouter/mettre à jour les tests pour viser **cov ≥80 % sur chaque fichier touché** (ou isoler la logique dans un nouveau module bien couvert).
8. Lancer au minimum `npm run build`, puis `npm run typecheck`, ensuite `npm run lint`, puis `npm run test`, et enfin `npm run bench` (ordre imposé).
9. Vérifier que :
   - les diagnostics respectent `diagnosticsEnvelope.schema.json` (diag-schema),
   - les reports `coverage-report/v1` valident leur schéma,
   - les gates bench (si concernés) passent.
10. Commit (template) + trailer `REFONLY::{"anchors":[...],"summary":"..."}` valide, marquer la sous-tâche `done` puis consigner dans `agent-log.jsonl`.

---

## Focus spécifique au tag `observability-platform-metrics-v1`

### Objectif produit (rappel)

Implémenter/aligner une observabilité exploitable **sans dérive** :

- **Baseline `diag.metrics`**
  - keys requises (timings, counters, SLIs),
  - mode metrics on/off cohérent,
  - garantie “metrics toggle = aucun changement d’output” (données, branches, diagnostics fonctionnels).

- **Coverage reporting (`coverage-report/v1`)**
  - source-of-truth pour coverage,
  - caps et budgets audités (targets materialisés + `meta.planned:false` si non planifiés),
  - invariants guided≥measure (branches/enum) et comparabilité.

- **Repair observability**
  - counters par tier + diagnostics de policy,
  - `gValid_*` (items/itemsWithRepair/actions) et diagnostics `G_valid` (structural repairs = exceptionnel),
  - invariants d’indépendance vis-à-vis de la coverage state.

- **Resolver R1 observability**
  - diagnostics run-level (`diag.run` / `Compose.diag.run`) pour cache/offline/strategies,
  - fingerprint présent et pris en compte dans la comparabilité (éviter des diffs trompeurs).

- **Reporter/Platform View (artefact dérivé) + gates**
  - vue calculée uniquement à partir de `diag` + `coverage-report/v1` (+ bench si pertinent),
  - stable sort + invariants (`repairUsageByMotif`, planned/unplanned, comparability fields),
  - gate engine CI (fatal/warn, threshold coverage, guided≥measure, exclure SLIs des checks de déterminisme).

### Correspondance recommandée “tâches Taskmaster ↔ zones de code” (indicatif)

- **9600** — diag.metrics baseline + tests non-régression metrics on/off.
- **9601** — coverage-report/v1: `meta.planned:false`, plannerCapsHit + tests guided≥measure.
- **9602** — repair tiers + gValid metrics + diagnostics (policy blocks) + tests.
- **9603** — resolver run-level diagnostics + tests online/offline/cache.
- **9604** — Reporter/Platform View + CI gates + traceability tests/doc.

### Risques typiques (à surveiller)

- **Non‑déterminisme introduit par l’observabilité**
  - ajout de RNG calls “juste pour compter”,
  - tri non stable, itérations non déterministes (Map/Object sans ordre stabilisé),
  - timestamps/paths brut non normalisés.
- **Mauvaise séparation “déterministe vs env-dependent”**
  - utiliser `p95LatencyMs`/`memoryPeakMB` comme signal de déterminisme,
  - faire échouer CI “conformance” plutôt que le bench harness prévu.
- **Coverage mal auditée sous caps**
  - “targets non matérialisés” au lieu de matérialiser `planned:false`,
  - confondre “non couvert” avec “non planifié”.
- **Comparaisons trompeuses**
  - ignorer `registryFingerprint`,
  - ignorer `operationsScope` / `selectedOperations` (OpenAPI) lors d’un diff,
  - comparer deux runs avec options coverage différentes (`dimensionsEnabled`, `excludeUnreachable`).
- **Vue Reporter trop lourde**
  - introduire des payloads par-item dans la vue dérivée,
  - casser le contrat “artefact dérivé” (ne pas remplacer les sources de vérité).

---

## Traçabilité tâche parente ↔ sous-tâches

* Pour chaque tâche parente du tag `observability-platform-metrics-v1`, créer (ou mettre à jour) `.taskmaster/docs/<TASK>-traceability.md` avec des bullets stables (`[KR1]`, `[DOD2]`, `[TS5]`, etc.).
* Dans `PLAN.md`, ajouter `Parent bullets couverts: [...]`.
* À la clôture d’une sous-tâche, mettre à jour `<TASK>-traceability.md` et marquer les bullets comme “covered”.

---

## Gardes-fous “Definition of Done” (tag observability-platform-metrics-v1)

**R1 — Lien explicite Deliverables / Test Strategy**  
Une sous-tâche ne passe `done` que si les deliverables concernés sont livrés et que les tests associés existent **et** ont été exécutés.

**R2 — Checklist DoD dans PLAN.md**  
PLAN.md contient une mini-checklist DoD dérivée de la traceability, et elle doit être cochée avant `done`.

**R3 — “pas de tests → pas de done”**  
Si un changement touche diag/metrics/coverage reports/gates et qu’aucun test n’est modifié/ajouté alors que la stratégie l’exige, rester `in-progress`.

**R4 — agent-log.jsonl**  
Chaque `complete-subtask` consigne `anchors`, `touchedFiles`, et la validation (build/typecheck/lint/test/bench).

**R5 — Discipline Taskmaster**  
Pas de `done` sans commit (si possible). Sinon expliciter clairement ce qui reste à faire côté humain.

---

## TL;DR opératoire

1. **Sources de vérité** : `diag` + `coverage-report/v1` + (bench outputs). La vue “platform” est dérivée.
2. **REFONLY** : anchors `spec://`/`cov://` uniquement, pas de prose copiée.
3. **Boucle** : `get_task` → `in-progress` → anchors (≤5) → `PLAN.md` → patch+tests → build/typecheck/lint/test/bench → validations schémas → commit → `done`.
4. **Déterminisme** : tuple normatif, pas d’état caché, métriques passives.
5. **Coverage** : planned/unplanned explicit sous caps, guided≥measure sur branches/enum, comparabilité stricte.
6. **Resolver** : run-level diags + fingerprint, sans I/O réseau dans les phases core.

---

## Mémoire opérationnelle (pièges à éviter) — Observability & Platform Metrics

* **Metrics toggle** : activer/désactiver les métriques ne doit pas changer :
  - instances générées,
  - branches choisies,
  - décisions de repair/validate,
  - diagnostics “fonctionnels”.
* **Stable sort partout** : tout tableau “reporting” doit être trié de façon stable (clé explicite, pas l’ordre d’insertion).
* **Planned vs Unplanned** : sous cap, ne pas “supprimer” des targets ; matérialiser et marquer `planned:false`.
* **Comparabilité** : intégrer fingerprint resolver + scope opérations (OpenAPI) et refuser les diffs si mismatch.
* **SLIs** : `p50/p95/memory` servent aux gates bench, pas à la conformance/déterminisme.
* **Vue dérivée** : éviter les payloads volumineux (pas de traces per-row dans la vue), utiliser artefacts séparés en debug si nécessaire.

---

## Boucle d'exécution (Run Loop) pour le tag observability-platform-metrics-v1

```text
Step 0  Sanity:
        - tâches tag observability-platform-metrics-v1 disponibles ?
        - tag observability-platform-metrics-v1 actif ?

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

Step 5  build → typecheck → lint → test → bench
        - exception docs-only: lint/test markdown si outillage dédié, sinon garder la chaîne complète par défaut.

Step 6  Valider diag envelope + coverage-report schema (si touchés).

Step 7  Commit (template) + trailer REFONLY.

Step 8  Marquer la sous-tâche done.
````

---

## Auto-review SPEC après chaque sous-tâche

Avant commit :

* chaque changement de code doit être rattachable à ≥1 anchor,
* vérifier “observability passive” : outputs identiques metrics on/off (si applicable),
* vérifier que les décisions core ne dépendent pas de wall-clock/env,
* vérifier planned/unplanned + caps audit (si touché),
* vérifier guided≥measure invariants (si touché),
* vérifier comparabilité (registryFingerprint + operationsScope/selectedOperations),
* si ambiguïté : geler et produire `SPEC-QUESTION.md`.

---

## Politique REFONLY — Anchors SPEC

### Anchors clés — Observability & Platform Metrics

Pour les tâches tagguées `observability-platform-metrics-v1`, prioriser :

* `spec://§2#observability-surfaces` — surfaces de sortie (diag, coverage-report/v1, vue dérivée).
* `spec://§6#phases` — pipeline Normalize → Compose → Generate → Repair → Validate.
* `spec://§7#platform-kpis-gates` — gates CI / KPIs (comparabilité, fatal/warn, coverage thresholds).
* `spec://§15#metrics` — `diag.metrics` requis + SLI/bench protocol.
* `spec://§15#rng` — RNG/déterminisme, interdiction wall-clock/env pour le contrôle de flux.
* `spec://§19#envelope` et `spec://§19#payloads` — schéma diagnostics, séparation des phases.
* `spec://§13#ajv-flags-parity` — parité AJV (gates mismatch).
* `spec://§10#repair-philosophy-observability` — diagnostics policy + counters tiers (utile pour 9602/9604).
* `cov://§5#coverage-report` — structure `coverage-report/v1`, stabilité IDs.
* `cov://§7#cli-summary` — ordre résumé, invariants thresholds.
* `cov://§7#thresholds` — `minCoverage` (V1: overall only).

> Si un anchor exact n’existe pas encore sur la branche: ancrer sur la section la plus proche (même doc) et documenter l’écart dans `PLAN.md` (Risks/Unknowns).

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

## Playbooks (tag observability-platform-metrics-v1)

### A) No Task Available

1. Renforcer les tests déterminisme metrics on/off (fixtures multiples).
2. Renforcer les tests comparabilité coverage diffs (fingerprint + ops scope).
3. Bench: vérifier la stabilité des SLIs et l’hygiène des reports.
4. Docs: compléter traceability observability (gates ↔ tests).

### B) SPEC ambiguë/contradictoire

Geler et produire `SPEC-QUESTION.md` avec 1–2 anchors.

### C) Décider des problèmes hors-scope

1. Documenter dans `agent-log.jsonl` (+ éventuel `SPEC-QUESTION.md`).
2. Décider clairement : refuser (hors scope) ou proposer nouvelle tâche.
3. Consigner si nécessaire un addendum process dans `AGENTS.md`.
4. Mentionner le suivi dans la PR / trace Taskmaster.

---

## Templates

### Commit message

```text
feat(<pkg>): task <ID> — <titre court>

- <3–4 points factuels>
- tests: <pkg>/<file>.spec.ts (cov >=80% touched)

REFONLY::{"anchors":["spec://§15#metrics","cov://§5#coverage-report"],"summary":"<résumé 1 ligne>"}
```

### PLAN.md (200–400 mots)

```text
Task: <id>   Title: <title>
Anchors: [spec://§<n>#<slug>, cov://§<n>#<slug>, ...]  (≤5)
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

* `phase` correct (`normalize` / `compose` / `generate` / `repair` / `validate`).
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
