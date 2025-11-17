# Claude AI Development Guide — FoundryData Project

> **Purpose**: Practical instructions for Claude AI when assisting with FoundryData development.
> **Canonical Spec**: **Feature Support Simplification Plan** — single source of truth for pipeline, options, and SLO/SLI.
> This guide complements the spec and also includes non-functional guidance (workflow, testing, quality gates).

---

## 🚀 TL;DR — FoundryData in 30 seconds

* **What**: JSON Schema → Test Data Generator with a compliance guarantee (AJV as oracle)
* **Why**: Generate thousands of valid records fast (targets per spec)
* **How**: `foundrydata generate --schema user.json --n 10000`
* **Unique (roadmap)**: Scenario‑based generation for edge cases and stress tests (not yet exposed as a CLI flag)
* **Philosophy**: Deterministic, schema‑true data with explicit limits

---

## 🎯 Scenario‑Based Generation

Generate targeted datasets for different testing aims:

> Note: the `--scenario` flag illustrated below is a design example; the current CLI does not yet implement scenario selection. Use plain `--n` (or `--count`) for now.

```bash
# Standard generation - realistic data
foundrydata generate --schema user.json --n 100

# Edge cases - min/max values, boundary conditions, empty arrays
foundrydata generate --schema user.json --n 100 --scenario edge-cases

# Stress test - uncommon values, max arrays, near-boundary values
foundrydata generate --schema user.json --n 100 --scenario stress-test

# Error conditions - invalid formats, missing required fields (for testing error handlers)
foundrydata generate --schema user.json --n 100 --scenario errors
```

---

## 📋 Project Overview

### Core Value Proposition

> Generate valid test data quickly and deterministically. Targets and limits follow the canonical spec.

### Target User

**Frontend/Backend Developer at a small team**

* 2–5 years experience
* Pain: Time spent creating fixtures
* Budget: €0–100/month
* Prefers open source tools

### MVP Constraints (v0.1)

* **Performance**: Adhere to spec SLO/SLI (e.g., \~1K simple/medium rows p50 ≈ 200–400 ms).
* **Bundle target**: <1 MB (core package; current builds may exceed this while optimization work is ongoing)
* **Runtime**: Single Node.js process, offline‑friendly

### JSON Schema Support (high‑level)

* `allOf` / `anyOf` / `oneOf` / `not` with deterministic branch selection
* Conditionals (`if/then/else`): **no rewrite by default**; safe rewrite opt‑in; if‑aware‑lite generation
* Objects: `properties`, `patternProperties`, `additionalProperties` (must‑cover), `propertyNames`, `dependent*`, `unevaluated*`
* Arrays: tuples (`prefixItems`), `items`, `additionalItems`, `contains` (bag semantics), `uniqueItems`
* Numbers: exact rational `multipleOf` with documented caps/fallbacks
* Refs: in‑document `$ref` supported; external `$ref` error by default (configurable); `$dynamicRef/*` preserved
  All guarantees and limits mirror the canonical spec.

---

## 🏗️ Technical Architecture

### Core Principles

1. **AJV is the oracle** — validate against the original schema (not transforms).
2. **Pipeline simplicity** — `Normalize → Compose → Generate → Repair → Validate`.
3. **Determinism** — same seed ⇒ same data.
4. **Performance** — meet documented SLO/SLI with budgets and graceful degradation.
5. **Developer‑friendly** — clear diagnostics.

### 5‑Stage Generation Pipeline

```mermaid
flowchart LR
  A[Normalize] --> B[Compose] --> C[Generate] --> D[Repair] --> E[Validate]
```

* **Normalize**: Draft‑aware canonicalization; keep original for AJV.
* **Compose**: Build effective view (must‑cover `AP:false`, bag `contains`, rational math).
* **Generate**: Deterministic, seeded; `enum/const` outrank `type`; if‑aware‑lite.
* **Repair**: AJV‑driven corrections (keyword→action), idempotent, budgeted.
* **Validate**: Final AJV validation against the **original** schema.
  Contracts and behaviors follow the spec.

---

## 📦 Package Structure (Monorepo)

```
packages/
├── core/                    # Domain logic (AJV, generator, repair)
│   ├── transform/           # Normalizer + Composition Engine
│   ├── generator/           # Stage 3
│   ├── repair/              # Stage 4
│   ├── validator/           # Stage 5
│   ├── util/                # RNG, hashing, metrics, rational, ptr-map
│   └── types/
├── cli/                     # CLI (Commander.js)
├── shared/                  # Shared utilities
└── api/                     # REST API (future)
```

### Module System & TypeScript

* ESM only (`"type":"module"`)
* TS target ES2022; explicit `.js` extensions in compiled imports
* Scripts: `npm run build`, `npm run typecheck`, `npm run test`, …

### Error Handling

```ts
abstract class FoundryError extends Error
├── SchemaError
├── GenerationError
├── ValidationError
└── ParseError
```

---

## ⚙️ Configuration & Tuning

### PlanOptions (canonical reference)

The authoritative `PlanOptions` shape and defaults live in the **Feature Support Simplification Plan** (§5 “Configuration Overview”). Defer to the spec for exact fields and defaults (including `guards`, `cache`, `failFast`, `encoding`, `rational`, `trials`, `complexity`, and conditional strategy mapping).

### Configuration Strategies (presets)

**Development (Strict)**

```ts
const devConfig: PlanOptions = {
  rewriteConditionals: 'never',            // Preserve original semantics
  debugFreeze: true,                       // Catch mutations early
  conditionals: { strategy: 'if-aware-lite' },
  complexity: { bailOnUnsatAfter: 8 },     // Fail fast on complex schemas
  failFast: { externalRefStrict: 'error', dynamicRefStrict: 'note' },
  guards: { maxGeneratedNotNesting: 1 },   // per spec
  cache: { lruSize: 32 },                  // smaller cache to reduce dev memory
};
```

**Production (Performance)**

```ts
const prodConfig: PlanOptions = {
  rewriteConditionals: 'safe',             // Enable safe optimizations
  trials: { skipTrialsIfBranchesGt: 25 },  // Reduce trials on large oneOf
  disablePatternOverlapAnalysis: true,     // Skip expensive analysis
  complexity: { bailOnUnsatAfter: 20 },    // More repair attempts
  failFast: { externalRefStrict: 'warn' }, // warn + attempt generation
  guards: { maxGeneratedNotNesting: 2 },   // per spec
  cache: { lruSize: 128 },                 // larger cache for throughput
};
```

**Testing (Deterministic)**

```ts
const testConfig: PlanOptions = {
  trials: { perBranch: 1, skipTrials: true }, // Stable branch selection
  metrics: false,                             
  debugFreeze: false,                         
  failFast: { externalRefStrict: 'error' },   
  cache: { lruSize: 16 },                     
};
```

---

## 🧪 Testing Architecture

**Principle**: AJV is the oracle — always validate against the **original** schema (not internal transforms).

### Unit (per stage)

* **Normalizer**: golden tests + diagnostics
* **Composition**: must‑cover for `AP:false`; bagged `contains`; rational `multipleOf`
* **Generator**: deterministic output; `enum/const` precedence
* **Repair**: idempotence; rational snapping; structural de‑dup for `uniqueItems`
* **Validator**: pointer mapping; caching

### Integration

* Multi‑draft validation (07, 2019‑09, 2020‑12)
* Conditionals: no drift when not rewriting; safe rewrite behavior
* Composition suites: `oneOf` exclusivity after refinement
* Performance regression: SLO/SLI adherence with complexity budgets (targets per spec).

### Property‑Based

* Deterministic equivalence by seed
* Repair idempotence
* AJV compliance
* Stable branch selection

### Bench/CI

* Profiles: simple, medium, pathological
* Metrics: `validationsPerRow`, `repairPassesPerRow`, phase timings
* Complexity caps: graceful degradation (skip trials, lower Top‑K)

---

## 📈 Performance Metrics & SLO/SLI Targets

**Metrics captured per generation** (subset):

```ts
{
  normalizeMs: number;
  composeMs: number;
  generateMs: number;
  repairMs: number;
  validateMs: number;
  validationsPerRow: number;   // AJV validations / row
  repairPassesPerRow: number;  // repair loops / row
  branchTrialsTried: number;
  memoryPeakMB?: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
}
```

**Targets (documented, not hard guarantees)**
For **simple/medium schemas (\~1000 rows)**, the spec sets **p50 ≈ 200–400 ms**, `validationsPerRow ≤ 3`, `repairPassesPerRow ≤ 1`.

**Performance Budgets by Schema Complexity (aligned to p50)**

| Schema Type  | \~1K rows (**p50**) | Validations/Row | Repair/Row | Memory  |
| ------------ | ------------------- | --------------- | ---------- | ------- |
| Simple       | ≈200–400 ms         | ≤3              | ≤1         | <50 MB  |
| Medium       | ≈200–400 ms         | ≤3              | ≤1         | <75 MB  |
| Complex      | Varies              | ≤5              | ≤2         | <100 MB |
| Pathological | Degraded            | Capped          | Capped     | Capped  |

> The previous table header used p95 with too‑tight numbers; it is now p50 to match the spec’s normative target.

---

## 🔧 Development Workflow

### Scripts

* `npm run build` — Build all packages
* `npm run dev` — Dev mode
* `npm run clean` — Remove dist
* `npm run format` — Prettier
* `npm run prepare` — Husky hooks

### External Documentation Access

If using Claude Code with MCP, you can access:

* AJV / JSON Schema references
* @faker‑js/faker API
* TypeScript patterns
* Commander.js CLI
* Jest/Vitest testing frameworks

### Task Master Integration

**Import workflow**: `@./.taskmaster/CLAUDE.md`
**Completion protocol**: Always use `/complete-task <id>`; do **not** call low‑level status commands directly.

#### Task Access Policy — Use Slash Commands or CLI, Not JSON

**CRITICAL**: Never directly read or parse `.taskmaster/tasks/tasks.json` or task files.

**Why**:
- Task structure is an implementation detail that may change
- CLI commands handle JSON parsing, validation, and error handling
- Slash commands provide structured, user-friendly access
- Direct JSON parsing bypasses business logic and validation

**Always use**:
- Slash commands: `/project:tm/show <id>`, `/project:tm/list`, `/complete-task <id>`
- CLI: `npx task-master show <id>`, `npx task-master list`

**Never**:
- ❌ Read `.taskmaster/tasks/tasks.json` directly
- ❌ Parse task files with `jq`, `cat`, or manual JSON parsing
- ❌ Access `.taskmaster/state.json` directly
- ❌ Modify task files without Task Master commands
- ❌ Use MCP tools `mcp__task-master-ai__*` (not available due to VSCode bug)

**Example**:

```bash
# ✅ CORRECT: Use slash command
/project:tm/show 9100

# ✅ CORRECT: Use CLI
npx task-master show 9100

# ❌ WRONG: Direct file access
cat .taskmaster/tasks/tasks.json | jq '.tasks[] | select(.id=="9100")'

# ❌ WRONG: Use MCP tool (not available)
mcp__task-master-ai__get_task(id: "9100")

# ❌ WRONG: Parse manually
Read(.taskmaster/tasks/tasks.json)
```

**Quick Reference**: See [.claude/TM_COMMANDS_GUIDE.md](./.claude/TM_COMMANDS_GUIDE.md) for all available commands.

#### REFONLY Policy — Anchor-Based SPEC References

**REFONLY**: Reference SPEC sections by anchor only; do not duplicate SPEC prose.

**Anchor Mapping**:
```
spec://§<n>#<slug> → docs/feature-simplification/spec-canonical-json-schema-generator.md#s<n>-<slug>
```

**Example**:
- `spec://§8#branch-selection-algorithm` maps to `docs/feature-simplification/spec-canonical-json-schema-generator.md#s8-branch-selection-algorithm`

**Working Context**:
- **Keep working context small**: Load only anchors required by the current task
- Use `Grep` to find anchors, then `Read` with offset to load specific sections
- Do NOT read entire SPEC document into context unless absolutely necessary

**IMPORTANT: Reading Task Requirements**
* **ALWAYS read the task's Implementation Details first** - Get task details with `get_task` to see the [Context] section
* **For subtasks: Read parent task's Implementation Details** - The context requirements are in the parent task
* **ALWAYS use Grep to find anchors first**, then read sections by offset
* **MANDATORY: Complete ALL context requirements before implementation:**
  - Read ALL "Must read" sections listed in the [Context] section
  - Read ALL "Nice to read" sections for comprehensive understanding
* **Never use direct Read on large docs without grep anchors first**
* Confirm you had read the entire doc if asked

**SPEC Reading Protocol (spec-canonical-json-schema-generator.md)**

The SPEC is too large to read without precision. Always use this protocol:

1. **Grep Section Bounds** (parallel tool calls)
   ```typescript
   // Find start and end of section
   Grep({ pattern: '^<a id="s7-', '-n': true, head_limit: 1 })  // → 321
   Grep({ pattern: '^<a id="s8-', '-n': true, head_limit: 1 })  // → 650
   ```

2. **Calculate Limit**
   ```typescript
   const start = 321;
   const end = 650;
   const limit = end - start;  // = 329 lines for §7
   ```

3. **Read Exact Section**
   ```typescript
   Read({ offset: start, limit: limit })
   // Reads EXACTLY §7, no waste
   ```

**Why This Matters**:
- ❌ `Read(offset: 321)` without limit → reads 2000 lines (§7+§8+§9+§10...) = 82% waste
- ❌ `Read(offset: 321, limit: 100)` → truncates §7 at line 420, missing 250 critical lines
- ✅ `Read(offset: 321, limit: 329)` → exact section, 100% efficiency

**Pattern for Any Section**:
```typescript
// For §N, grep anchors s{N}- and s{N+1}-, calculate limit
const readSection = (n: number) => {
  const [start, end] = grepBounds(`s${n}-`, `s${n+1}-`);
  return Read({ offset: start, limit: end - start });
};
```

**For Last Section**: Use file EOF as end bound (for example, total line count from `wc -l`).

**Alternative for Short Sections** (<200 lines):
```typescript
// Single grep with context
Grep({ pattern: '<a id="s7-pass-order"></a>', '-A': 350, '-n': true })
// Trade-off: 1 tool call, but risk truncation if estimate wrong
```


**Quality Gates**

```bash
npm run task-ready     # lint + typecheck + build + test
npm run task-complete  # same as above, with success message
npm run typecheck
npm run typecheck:build
npm run lint
npm run lint:fix
npm run test
```

---

## 📐 Code Quality Standards

### Bans

* Avoid TypeScript escape hatches (`as any`, `// @ts-ignore`, non‑null assertions) unless justified and documented.
* Don't delete failing code/tests to "green" the suite; fix root causes.

### Implementation Bias Prevention

Prefer improving the framework integration over bypassing it. Examples and performance notes retained from previous guidance.

### ESLint Guidelines

Use judgment; balance readability, cohesion, and performance.

---

## 🚫 Common Pitfalls — Critical Violations to Avoid

### Legacy Code References (CRITICAL)

- ❌ Referencing legacy implementation for feature behavior
- ❌ Porting legacy code patterns or architecture
- ❌ Preserving legacy features not documented in SPEC
- ❌ Assuming legacy behavior should be maintained
- ❌ Using legacy code as a reference for design decisions
- ✅ **SPEC is the ONLY authority for implementation**

### Task Master Access Violations

- ❌ Reading `.taskmaster/tasks/tasks.json` directly
- ❌ Parsing task files with `jq`, `cat`, or bash commands
- ❌ Accessing `.taskmaster/state.json` directly
- ❌ Modifying task files without Task Master commands
- ❌ Using MCP tools `mcp__task-master-ai__*` (not available due to VSCode bug)
- ✅ **Always use `/tm:category:command` slash commands or `npx task-master` CLI**

### Implementation Scope Creep

- ❌ Adding features not in SPEC because "they seem useful"
- ❌ Implementing pattern-form `propertyNames` rewrite in P0 (deferred to P2)
- ❌ Expanding coverage from `propertyNames.enum` without rewrite flag
- ✅ **Do NOT enlarge feature scope beyond what SPEC mandates**

### SPEC Context Violations

- ❌ Copying SPEC text verbatim into code comments or task records
- ❌ Reading entire SPEC document into context
- ❌ Ignoring REFONLY anchor protocol
- ✅ **Reference SPEC sections by anchor only**

### Test Suite Manipulation

- ❌ Deleting failing tests to "green" the suite
- ❌ Commenting out failing assertions
- ❌ Lowering coverage thresholds to pass CI
- ✅ **Fix root causes; maintain ≥80% coverage on touched files**

---

## 📚 JSON Schema Support Matrix (summary)

**Drafts**: Draft‑07 / 2019‑09 / 2020‑12 fully supported via AJV; Draft‑04 compat via normalizer; always validate against the original schema.

**Core logic**: `allOf` / `anyOf` / `oneOf` / `not`; deterministic branch selection; early‑unsat; graceful degradation under caps.
**Conditionals**: default no‑rewrite; safe rewrite optional; if‑aware‑lite generation.
**Objects**: must‑cover for `additionalProperties:false`; `patternProperties` overlap analysis; `propertyNames`; `dependent*`; `unevaluated*`.
**Arrays**: tuples; implicit max length with `items:false`; bagged `contains` across `allOf`; `uniqueItems`.
**Numbers**: exact rational `multipleOf` with caps + decimal/float fallbacks.
**Refs**: in‑document `$ref` supported; external `$ref` error by default (configurable); `$dynamicRef/*` preserved.
Semantics, caps, and fallbacks are governed by the spec.

---

## 📖 Technical References

* Testing documentation, CI/bench strategy, and property‑based testing wrappers as previously documented in project docs.
* Format handling policy and draft‑specific behavior live in the testing policy doc set.

---

## 🚀 Implementation Roadmap (excerpt)

* **P0 (Foundation)**: 5‑stage pipeline; complexity caps + diagnostics; stagnation guard; if‑aware‑lite; early‑unsat extensions.
  Success criteria include `validationsPerRow ≤ 3`, `repairPassesPerRow ≤ 1` (p50), matching the spec.
* **P1 (Observability)**: Bench metrics in CI; p50/p95 tracking; docs for invariants/limits.
* **P2 (Optimization)**: Contains bag subsumption; pattern approximations; scoring refinements.

---

## ✅ Compliance Guarantee

* **We guarantee**: AJV validation against the original schema; deterministic generation with seed; adherence to documented behavior and limits.
* **We don’t guarantee**: Business semantics; realism of synthetic data; top performance on pathological schemas.

---

## ✨ Golden Rules — Quick Reference

When implementing features on the `feature-simplification` branch, always follow these rules:

1. **SPEC is truth** — Do not enlarge scope beyond what SPEC mandates
2. **REFONLY anchors** — Reference SPEC sections by anchor only; no text duplication
3. **Small context** — Load only anchors required by current task via Grep + Read with offset
4. **Numeric order** — Implement tasks 1..24 in sequence, respecting dependencies
5. **Clean slate** — Build from scratch per SPEC architecture; no legacy carryover
6. **AJV is oracle** — Validate against original schema (not transforms)
7. **Pipeline integrity** — Normalize → Compose → Generate → Repair → Validate
8. **80% coverage** — Maintain test coverage on all touched files
9. **Bench gates** — Adhere to p50 ≈ 200-400ms for simple/medium schemas (~1K rows)
10. **Task Master CLI** — Use `/project:tm/` commands or MCP tools; never parse `.taskmaster/tasks/tasks.json` directly
11. **No scope creep** — Do not add features, edge cases, or behaviors not specified in SPEC
12. **Quality first** — Run `npm run task-ready` before marking tasks complete
**When in doubt, refer to SPEC. When SPEC is unclear, escalate.**

---

## 💡 About This Document

This guide consolidates engineering practices for Claude assistance and aligns them with the **Feature Support Simplification Plan**. Where differences existed (notably performance table p95 vs p50 and a non‑canonical options key), they have been resolved to match the spec and avoid ambiguity.

**Related Documentation**:
- **AGENTS.md** — Detailed agent runbook with execution discipline, guardrails, and self-audit checklists
- **Feature Support Simplification Plan** — Canonical SPEC (single source of truth for all semantics)
- **.taskmaster/CLAUDE.md** — Task Master workflow integration guide
