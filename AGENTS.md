# AGENT Runbook — AI Assistance Operating Mode

> **Purpose**: Execution discipline and guardrails for implementing FoundryData from SPEC.
> **Audience**: AI Assistance agent working on feature-simplification tasks.
> **Status**: Active — enforced for all task 1..24 implementation work.

---

## 🎯 Goal

**Execute implementation tasks strictly per SPEC; SPEC is the single source of truth for semantics.**

- Do NOT enlarge feature scope beyond what SPEC mandates.
- Do NOT introduce features, edge cases, or behaviors not specified in SPEC.
- Do NOT copy-paste SPEC text verbatim into code comments or task records.

---

## 📚 Retrieval Policy — REFONLY via Anchors

### Core Principle

**REFONLY**: Reference SPEC sections by anchor only; do not duplicate SPEC prose.

### Anchor Mapping

```
spec://§<n>#<slug> → docs/feature-simplification/feature-support-simplification.md#s<n>-<slug>
```

**Example**:
- `spec://§8#branch-selection-algorithm` maps to `docs/feature-simplification/feature-support-simplification.md#s8-branch-selection-algorithm`

### Working Context

- **Keep working context small**: Load only anchors required by the current task.
- Use `Grep` to find anchors, then `Read` with offset to load specific sections.
- Do NOT read entire SPEC document into context unless absolutely necessary.

### REFONLY Format Validation

All SPEC task records (9100..9124) must use `REFONLY::` format:

```json
{
  "details": "REFONLY::{\"anchors\":[\"spec://§8#branch-selection-algorithm\"],\"summary\":\"Implement deterministic branch selection with score-only mode\"}"
}
```

**Validation**:
1. Outer JSON must parse
2. After stripping `REFONLY::`, inner JSON must parse
3. Reject if invalid

---

## 🔄 Execution Order

### Phase 1: Foundation (Prerequisites)

1. **Read §0 metadata** (task 9000)
   - Understand SPEC structure, versioning, and conventions

2. **Build reference index** from tasks 9100..9124
   - Extract all anchors (spec://§n#slug format)
   - Create mental map of SPEC sections
   - Do NOT load full text; anchors only

### Phase 2: Implementation (Tasks 1..24)

3. **Implement tasks in numeric order**
   - Respect declared dependencies
   - Complete one task fully before moving to next
   - Run tests after each task

4. **Validate each task** against Definition of Done
   - Tests green with ≥80% coverage on touched files
   - Diagnostics conform to SPEC §19.1 mini-schemas
   - No implementation bias or scope creep

### Phase 3: Validation

5. **Run full test suite**: `pnpm -w test`
6. **Run benchmarks**: `pnpm -w bench`
7. **Validate bench gates** (SPEC §15):
   - p95LatencyMs ≤ 120 ms
   - memoryPeakMB ≤ 512 MB
   - On required profiles (simple, medium)

---

## 🛡️ Guardrails — Critical Constraints

### Diagnostics — Phase Separation

**REGEX_COMPLEXITY_CAPPED**
- ✅ Appears ONLY from Normalize/Compose
- ✅ `details.context` ∈ `{'coverage', 'rewrite'}`
- ❌ NEVER from Generator

**COMPLEXITY_CAP_PATTERNS**
- ✅ Appears ONLY from Generator (pattern-witness search)
- ❌ NEVER from Normalize/Compose/Rewrite

**Compose-time caps**
- `COMPLEXITY_CAP_ONEOF`, `COMPLEXITY_CAP_ANYOF`, `COMPLEXITY_CAP_ENUM`, `COMPLEXITY_CAP_CONTAINS`, `SCHEMA_SIZE`
- ✅ Planning-only (Compose phase)
- ❌ NEVER emit from Generator

### Branch Bookkeeping (SPEC §8)

**Score-only path**:
- Record `diag.scoreDetails.tiebreakRand` EVEN WHEN `|T| = 1`

**Score-only budget**:
```typescript
diag.budget = {
  skipped: true,
  tried: 0,
  limit: trials.perBranch × K_effective,
  reason: 'skipTrialsFlag' | 'largeOneOf' | 'largeAnyOf' | 'complexityCap'
}
```
Where `K_effective = min(maxBranchesToTry, branches.length)` AFTER Compose-time caps.

**oneOf exclusivity step-4**:
- If RNG is used (only when `b*` no longer passes), record `diag.scoreDetails.exclusivityRand`

### AP:false Coverage Guardrails

**NEVER expand coverage from `propertyNames.enum` unless `PNAMES_REWRITE_APPLIED` is present.**

**Fail-fast (AP_FALSE_UNSAFE_PATTERN) ONLY when presence pressure exists**:
- `effectiveMinProperties > 0`, OR
- `effectiveRequiredKeys ≠ ∅`, OR
- An active `dependentRequired` antecedent

Otherwise, proceed via conservative exclusion (no fail-fast).

**Raw `propertyNames.pattern` NEVER triggers `AP_FALSE_UNSAFE_PATTERN`**; it is gating-only unless `PNAMES_REWRITE_APPLIED`.

### Unevaluated Guard

For `unevaluatedProperties:false`, only emit property names guaranteed "evaluated" by an applicator at the SAME instance location:

- Present directly, OR
- Reachable through an APPLIED subschema at that location:
  - `allOf` conjuncts
  - Selected `anyOf`/`oneOf` branch
  - Active `then`/`else` of `if`
  - `$ref` target

**Note**: `dependentSchemas` does NOT evaluate by itself; only applicators inside its active subschema do.

### AJV Config Gate (SPEC §§12–13)

**Two Ajv instances**:
1. **Source** (original schema)
2. **Planning/Generation** (canonical view)

**Both MUST**:
- Set `unicodeRegExp: true`
- Match source schema dialect:
  - Ajv (Draft-07)
  - Ajv2019 (2019-09)
  - Ajv2020 (2020-12)
  - ajv-draft-04 (Draft-04)
- DO NOT mix 2020-12 with earlier drafts in same instance

**validateFormats**:
- MUST be identical on both instances
- Both `false`, OR both `true` with `ajv-formats`
- Mismatches ⇒ `AJV_FLAGS_MISMATCH`

**allowUnionTypes**:
- Policy consistent with responsibilities
- Enabled on Planning/Generation when compiling union-typed canonical views

**discriminator**:
- If claimed: `discriminator: true` on BOTH instances
- Otherwise: disabled on both

**multipleOfPrecision**:
- MUST equal `PlanOptions.rational.decimalPrecision` on BOTH instances
- When `rational.fallback` ∈ `{'decimal', 'float'}`
- Mismatches ⇒ `AJV_FLAGS_MISMATCH`

---

## ✅ Definition of Done (DoD)

### Per Task

- [ ] Files delivered per subtasks
- [ ] Tests green with **≥80% coverage** on touched files
- [ ] Diagnostics conform to **SPEC §19.1 mini-schemas**
- [ ] Final AJV validation runs against the **original schema** (not canonical/effective view)
- [ ] No SPEC text duplicated in code/comments (REFONLY anchors only)
- [ ] Self-audit checklist passed (see below)

### Per Sprint (Tasks 1..24 Complete)

- [ ] All unit tests pass: `pnpm -w test`
- [ ] All integration tests pass
- [ ] Bench gates satisfied (SPEC §15):
  - `p95LatencyMs ≤ 120 ms`
  - `memoryPeakMB ≤ 512 MB`
  - On required profiles (simple, medium)
- [ ] No failing code deleted to "green" the suite
- [ ] No TypeScript escape hatches without justification
- [ ] All diagnostics conform to §19.1 shapes

---

## 🔍 Self-Audit Checklist (Before Commit)

Run this checklist before marking any task as complete:

### SPEC Task Records (9100..9124)

- [ ] All task records use `details = REFONLY` format
- [ ] No SPEC text duplicated in task records
- [ ] REFONLY format validates (outer JSON parses, inner JSON parses after stripping prefix)

### Branch Selection Invariants

- [ ] Score-only: `tiebreakRand` recorded EVEN WHEN `|T| = 1`
- [ ] Score-only budget: `skipped`, `tried`, `limit`, `reason` all present and correct
- [ ] oneOf exclusivity: if RNG used at step-4, `exclusivityRand` recorded

### Diagnostics Phase Separation

- [ ] No `REGEX_COMPLEXITY_CAPPED` from Generator
- [ ] No `COMPLEXITY_CAP_PATTERNS` from Normalize/Compose/Rewrite
- [ ] Compose-time caps (`COMPLEXITY_CAP_ONEOF`, etc.) never emitted from Generator

### AP:false Guardrails

- [ ] No coverage expansion from `propertyNames.enum` without `PNAMES_REWRITE_APPLIED`
- [ ] `AP_FALSE_UNSAFE_PATTERN` only when presence pressure exists
- [ ] Raw `propertyNames.pattern` never triggers `AP_FALSE_UNSAFE_PATTERN`

### Repair Rename Guard (AP:false)

- [ ] Use `ctx.isNameInMustCover(canonPath, name)` from Compose's `CoverageIndex`
- [ ] If absent, do NOT rename and emit `MUSTCOVER_INDEX_MISSING{guard: true}`

### External $ref Handling

- [ ] Strict ⇒ error `EXTERNAL_REF_UNRESOLVED`
- [ ] Lax ⇒ warn + attempt
- [ ] If Source Ajv compile fails solely due to unresolved externals:
  - Skip final validation with `details.skippedValidation: true`
  - Set `diag.metrics.validationsPerRow = 0`

### Subtask IDs

- [ ] Unique subtask IDs enforced (e.g., `taskId * 1000 + ordinal`)
- [ ] No ID collisions

---

## 🏗️ Environment & Commands

### Prerequisites

- Node >= 18
- TypeScript
- pnpm
- Monorepo layout under `packages/core/*` (per SPEC §22)

### Commands

Using pnpm (generic projects):
```bash
# Install dependencies
pnpm i

# Build all packages
pnpm -w build

# Run tests
pnpm -w test

# Run benchmarks
pnpm -w bench

# Typecheck
pnpm -w typecheck

# Lint
pnpm -w lint
```

Using npm workspaces (this repo):
```bash
# Install dependencies
npm i

# Build all packages (workspace-aware script defined at root)
npm run build

# Run tests
npm run test

# Run benchmarks (until dedicated bench harness is wired, use perf tests)
npm run test:benchmarks

# Typecheck
npm run typecheck

# Lint
npm run lint
```

---

## 🎭 Staging — Phased Feature Rollout

### P0 (Current Phase)

**propertyNames rewrite**: Implement **enum-only** form in P0.

### P2 (Deferred)

**propertyNames pattern-form**: Deferred to **P2 (#23)**.

Do NOT implement pattern-form in P0 tasks.

---

## 📊 Diagnostics Verbosity

Provide a verbosity toggle:

- **CI verbose**: Full diagnostics/metrics
- **Runtime normal**: Reduced payloads

**Without** changing SPEC §19.1 shapes.

---

## 🚫 Common Pitfalls — Avoid These

### Implementation Bias

- ❌ Adding features not in SPEC because "they seem useful"
- ❌ Implementing pattern-form `propertyNames` rewrite in P0 (deferred to P2)
- ❌ Expanding coverage from `propertyNames.enum` without rewrite flag

### Phase Confusion

- ❌ Emitting `REGEX_COMPLEXITY_CAPPED` from Generator
- ❌ Emitting `COMPLEXITY_CAP_PATTERNS` from Compose
- ❌ Emitting Compose-time caps from Generator

### Bookkeeping Shortcuts

- ❌ Skipping `tiebreakRand` when `|T| = 1`
- ❌ Missing `exclusivityRand` when RNG used in oneOf step-4
- ❌ Incorrect budget `reason` or `K_effective`

### AP:false Violations

- ❌ Expanding coverage from raw `propertyNames.enum` without flag
- ❌ Triggering `AP_FALSE_UNSAFE_PATTERN` on raw pattern
- ❌ Renaming properties without checking `CoverageIndex`

### AJV Config Drift

- ❌ Different `unicodeRegExp` on Source vs Planning instances
- ❌ Different `validateFormats` settings
- ❌ Different `multipleOfPrecision` when using rational fallbacks
- ❌ Mixing Draft-2020-12 with earlier drafts in same Ajv instance

### Test Suite Manipulation

- ❌ Deleting failing tests to "green" the suite
- ❌ Commenting out failing assertions
- ❌ Lowering coverage thresholds to pass CI

---

## 📖 Quick Reference — SPEC Anchors

### Core Sections

- `spec://§0` — Metadata & Overview
- `spec://§1` — Pipeline Architecture
- `spec://§2` — Normalize Phase
- `spec://§3` — Compose Phase
- `spec://§4` — Generate Phase
- `spec://§5` — Repair Phase
- `spec://§6` — Validate Phase
- `spec://§7` — anyOf Support
- `spec://§8` — oneOf Support (branch selection)
- `spec://§9` — allOf Support
- `spec://§10` — not Support
- `spec://§11` — Conditionals (if/then/else)
- `spec://§12` — AJV Configuration
- `spec://§13` — External $ref Handling
- `spec://§14` — Diagnostics (§19.1 mini-schemas)
- `spec://§15` — Performance Targets & Bench Gates
- `spec://§16` — propertyNames (enum-only in P0)
- `spec://§17` — unevaluatedProperties
- `spec://§18` — additionalProperties:false (must-cover)
- `spec://§19` — Diagnostics Shapes
- `spec://§20` — Testing Strategy
- `spec://§21` — Error Handling
- `spec://§22` — Project Structure
- `spec://§23` — P2 Features (pattern-form propertyNames)
- `spec://§24` — Glossary

---

## 🎓 Best Practices

### Reading SPEC

1. Use `Grep` to find anchor: `grep -n "s8-branch-selection" docs/feature-simplification/feature-support-simplification.md`
2. Read section by line offset: `Read` with `offset` and `limit`
3. Extract only what's needed for current task
4. Close context after task complete

### Implementing Features

1. Read SPEC section anchor
2. Write tests first (TDD when possible)
3. Implement minimal feature per SPEC
4. Run tests: `pnpm -w test`
5. Check coverage: ≥80% on touched files
6. Self-audit checklist
7. Commit with reference to task ID

### Diagnostics

1. Always conform to SPEC §19.1 mini-schemas
2. Include `details.context` for phase-specific diagnostics
3. Record all bookkeeping fields (`tiebreakRand`, `exclusivityRand`, `budget`)
4. Test diagnostic shapes with JSON Schema validation

### Performance

1. Run benchmarks after each feature: `pnpm -w bench`
2. Validate against gates: p95 ≤ 120ms, memory ≤ 512MB
3. If gates fail, optimize or defer feature
4. Document performance characteristics in task notes

---

## 📞 Escalation

If you encounter:

- **SPEC ambiguity**: Note in task; ask for clarification; do NOT assume
- **SPEC contradiction**: Halt; document contradiction; escalate
- **Missing SPEC section**: Do NOT implement; mark task as blocked
- **Bench gate failure**: Document; propose optimization or defer
- **Test coverage gap**: Write tests first; do NOT skip

---

## 📝 Document Maintenance

**Last Updated**: 2025-10-12
**Version**: 1.0.0
**Author**: Claude Code (Task 8000)
**Status**: Active — enforced for all feature-simplification tasks

---

## 🎯 Task Master Integration

### Overview

Task Master is the task management system integrated into this project. It provides AI-powered task generation, complexity analysis, and workflow coordination through both CLI commands and MCP tools.

### Core Agents

The project uses three specialized agents for Task Master workflows:

#### 1. Task Orchestrator (`task-orchestrator`)

**When to use**: Coordinating multiple tasks, analyzing dependencies, planning parallel execution

**Capabilities**:
- Analyzes task queue and dependency graphs
- Identifies parallelizable work opportunities
- Deploys task-executor agents strategically
- Coordinates progress across multiple tasks
- Optimizes execution strategy based on dependencies

**Example usage**:
```
user: "Let's work on the next available tasks"
→ Deploy task-orchestrator to analyze and coordinate execution
```

#### 2. Task Executor (`task-executor`)

**When to use**: Implementing specific tasks, completing individual work items

**Capabilities**:
- Implements individual tasks with precision
- Follows test strategies and acceptance criteria
- Updates task status and progress
- Logs implementation decisions
- Ensures quality through verification

**Workflow**:
1. Retrieve task details with `task-master show <id>`
2. Plan implementation approach
3. Update status to `in-progress`
4. Implement solution incrementally
5. Run tests and verify
6. Mark as `done` when complete

**Example usage**:
```
user: "Implement task 23 for user authentication"
→ Deploy task-executor for focused implementation
```

#### 3. Task Checker (`task-checker`)

**When to use**: Verifying tasks marked as 'review', quality assurance

**Capabilities**:
- Verifies implementations against specifications
- Runs tests and build commands
- Checks code quality and best practices
- Validates dependencies
- Generates verification reports

**Decision Criteria**:
- **PASS**: All requirements met, tests pass, no errors
- **PARTIAL**: Core functionality works, minor issues
- **FAIL**: Missing requirements, failing tests, critical issues

**Example usage**:
```
user: "Check if task 118 is properly implemented"
→ Deploy task-checker to verify and report
```

### Task Master Commands

All Task Master functionality is available through `/project:tm/` slash commands:

#### Quick Start
```bash
# Install Task Master
/project:tm/setup/quick-install

# Initialize project
/project:tm/init/quick

# Parse requirements document
/project:tm/parse-prd requirements.md

# Get next task
/project:tm/next
```

#### Task Management
```bash
# List tasks with filters
/project:tm/list
/project:tm/list/by-status pending
/project:tm/list/with-subtasks

# Show task details
/project:tm/show <id>

# Add task
/project:tm/add-task

# Update tasks
/project:tm/update/update-single-task <id>
/project:tm/update/update-tasks-from-id <id>

# Remove task
/project:tm/remove-task <id>
```

#### Status Management
```bash
/project:tm/set-status/to-pending <id>
/project:tm/set-status/to-in-progress <id>
/project:tm/set-status/to-review <id>
/project:tm/set-status/to-done <id>
/project:tm/set-status/to-deferred <id>
/project:tm/set-status/to-cancelled <id>
```

#### Task Analysis
```bash
# Analyze complexity
/project:tm/analyze-complexity

# View complexity report
/project:tm/complexity-report

# Expand tasks
/project:tm/expand/expand-task <id>
/project:tm/expand/expand-all-tasks
```

#### Dependencies
```bash
/project:tm/add-dependency
/project:tm/remove-dependency
/project:tm/validate-dependencies
/project:tm/fix-dependencies
```

#### Workflows
```bash
/project:tm/workflows/smart-workflow
/project:tm/workflows/command-pipeline
/project:tm/workflows/auto-implement-tasks
```

### MCP Tools

Task Master is also available through MCP tools for programmatic access:

#### Core Tools
- `mcp__task-master-ai__get_tasks` - Retrieve all tasks with filters
- `mcp__task-master-ai__get_task` - Get specific task details
- `mcp__task-master-ai__next_task` - Find next task to work on
- `mcp__task-master-ai__set_task_status` - Update task status
- `mcp__task-master-ai__add_task` - Create new task
- `mcp__task-master-ai__add_subtask` - Add subtask to existing task
- `mcp__task-master-ai__update_task` - Update single task
- `mcp__task-master-ai__update_subtask` - Update subtask information

#### Analysis Tools
- `mcp__task-master-ai__analyze_project_complexity` - Analyze task complexity
- `mcp__task-master-ai__complexity_report` - Display complexity report
- `mcp__task-master-ai__expand_task` - Expand task into subtasks
- `mcp__task-master-ai__expand_all` - Expand all pending tasks

#### Dependency Tools
- `mcp__task-master-ai__add_dependency` - Add dependency relationship
- `mcp__task-master-ai__remove_dependency` - Remove dependency
- `mcp__task-master-ai__validate_dependencies` - Check for dependency issues
- `mcp__task-master-ai__fix_dependencies` - Auto-fix invalid dependencies

### Task Completion Protocol

**IMPORTANT**: Always use the `/complete-task <id>` slash command to mark tasks as done.

**DO NOT** call low-level status commands directly for completion. The `/complete-task` command:
- Validates task completion
- Runs quality checks
- Updates status properly
- Maintains task integrity

### Common Workflows

#### Daily Development Flow
```
1. /project:tm/next                          # Get next task
2. /project:tm/set-status/to-in-progress <id>  # Start work
3. [Implement the task]
4. /complete-task <id>                       # Complete properly
```

#### Task Breakdown Flow
```
1. /project:tm/show <id>                     # Understand task
2. /project:tm/expand/expand-task <id>       # Break into subtasks
3. /project:tm/list/with-subtasks            # Review structure
4. [Work on subtasks sequentially]
```

#### Sprint Planning Flow
```
1. /project:tm/analyze-complexity            # Analyze all tasks
2. /project:tm/complexity-report             # Review report
3. /project:tm/expand/expand-all-tasks       # Expand complex tasks
4. /project:tm/status                        # Review project status
```

#### Quality Assurance Flow
```
1. [Mark task as review]                     # After implementation
2. Deploy task-checker agent                 # Verify implementation
3. [Fix issues if FAIL]                      # Address problems
4. /complete-task <id>                       # Complete when PASS
```

### Task Context Reading

**MANDATORY workflow for reading task requirements**:

1. OPEN THE TASK AND SET IN-PROGRESS — REQUIRED
   - Command: `/project:tm/show <id>` then (if applicable) `/project:tm/set-status/to-in-progress <id>`
   - Verify the [Context]/Implementation Details and the REFONLY anchors list for this task
2. LOAD THE SPEC BY ANCHORS (REFONLY) — REQUIRED
   - Find anchors with: `rg -n "<slug>" docs/feature-simplification/feature-support-simplification.md`
   - Read by limited offset window (no full-doc reads): `nl -ba docs/feature-simplification/feature-support-simplification.md | sed -n '<start>,<end>p'`
3. For subtasks: also read the parent task’s Implementation Details
4. Complete ALL context requirements (Must/Nice to read)
5. Never read large docs directly without grepping anchors first
6. Confirm reading completion when prompted

### Natural Language Support

All Task Master commands understand natural language:

```bash
/project:tm/list pending high priority
/project:tm/update mark 23 as done
/project:tm/add-task implement OAuth login
```

### Key Features

- **Smart Context**: Commands analyze project state and provide intelligent suggestions
- **Visual Enhancements**: Progress bars, status badges, organized displays
- **Command Chaining**: Automate workflows with command pipelines
- **AI-Powered**: Task generation, complexity analysis, and workflow optimization

### Best Practices

1. Use `/project:tm/` + Tab for command discovery
2. Natural language is supported everywhere
3. Commands provide smart defaults
4. Chain commands for automation
5. Check `/project:tm/learn` for interactive help
6. Always use `/complete-task` for task completion
7. Deploy appropriate agent based on workflow phase:
   - Planning/coordination → task-orchestrator
   - Implementation → task-executor
   - Verification → task-checker

---

## ✨ Summary — The Golden Rules

1. **SPEC is truth** — Do not enlarge scope
2. **REFONLY anchors** — No SPEC text duplication
3. **Small context** — Load only what's needed
4. **Numeric order** — Tasks 1..24 in sequence
5. **Phase separation** — Right diagnostic from right phase
6. **AP:false guards** — Coverage expansion requires flag
7. **AJV parity** — Both instances configured identically
8. **80% coverage** — On all touched files
9. **Bench gates** — p95 ≤ 120ms, memory ≤ 512MB
10. **Self-audit** — Checklist before every commit
11. **Task Master protocol** — Use proper completion workflow and agent selection

**When in doubt, refer to SPEC. When SPEC is unclear, escalate.**
