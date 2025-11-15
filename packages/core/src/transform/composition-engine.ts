/* eslint-disable max-depth */
/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */
/* eslint-disable complexity */
import { DIAGNOSTIC_CODES, type DiagnosticCode } from '../diag/codes.js';
import {
  createPlanOptionsSubKey,
  type CacheKeyContext,
} from '../util/cache.js';
import { canonicalizeForHash } from '../util/canonical-json.js';
import { ENUM_CAP } from '../constants.js';
import { XorShift32 } from '../util/rng.js';
import {
  resolveOptions,
  type PlanOptions,
  type ResolvedOptions,
} from '../types/options.js';
import type { NormalizeResult, NormalizerNote } from './schema-normalizer.js';
import { resolveDynamicRefBinding } from '../util/draft.js';
import { extractExactLiteralAlternatives } from '../util/pattern-literals.js';
import { analyzeRegex } from './name-automata/regex.js';
import { buildThompsonNfa } from './name-automata/nfa.js';
import { buildDfaFromNfa, type Dfa } from './name-automata/dfa.js';
import {
  buildProductDfa,
  type ProductSummary,
} from './name-automata/product.js';
import { bfsEnumerate } from './name-automata/bfs.js';
import {
  applyContainsSubsumption,
  collectContainsNeeds,
  computeEffectiveMaxItems,
  areNeedsPairwiseDisjoint,
  isSchemaSubset,
  type ContainsNeed,
} from './arrays/contains-bag.js';

type CoverageProvenance =
  | 'properties'
  | 'patternProperties'
  | 'propertyNamesSynthetic';

export interface CoverageEntry {
  has: (name: string) => boolean;
  enumerate?: (k?: number) => string[];
  provenance?: CoverageProvenance[];
}

export type CoverageIndex = Map<string, CoverageEntry>;

interface CoveragePatternInfo {
  pointer: string;
  source: string;
  regexp: RegExp;
  literals?: string[];
  sourceKind: CoverageProvenance;
}

interface CoverageGatingPattern {
  source: string;
  regexp: RegExp;
  literals?: string[];
}

interface CoverageConjunctInfo {
  pointer: string;
  named: Set<string>;
  patterns: CoveragePatternInfo[];
  gatingEnum?: Set<string>;
  gatingPattern?: CoverageGatingPattern;
  unsafePatternIssues: PatternIssue[];
  hasProperties: boolean;
  hasPatternProperties: boolean;
  hasSyntheticPatterns: boolean;
  finiteCandidates: Set<string>;
}

interface NormalizedContainsNeed {
  schema: unknown;
  min: number;
  max?: number;
}

export interface ComposeDiagnostics {
  fatal?: Array<{ code: DiagnosticCode; canonPath: string; details?: unknown }>;
  warn?: Array<{ code: DiagnosticCode; canonPath: string; details?: unknown }>;
  unsatHints?: Array<{
    code: DiagnosticCode;
    canonPath: string;
    provable?: boolean;
    reason?: string;
    details?: unknown;
  }>;
  chosenBranch?: { kind: 'anyOf' | 'oneOf'; index: number; score: number };
  overlap?: { kind: 'oneOf'; passing: number[]; resolvedTo?: number };
  overlaps?: { patterns?: Array<{ key: string; patterns: string[] }> };
  scoreDetails?: {
    orderedIndices: number[];
    topScoreIndices: number[];
    tiebreakRand: number | undefined;
    exclusivityRand?: number;
    scoresByIndex?: Record<string, number>;
  };
  budget?: { tried: number; limit: number; skipped?: boolean; reason?: string };
  metrics?: Record<string, number>;
  caps?: string[];
  branchDecisions?: BranchDecisionRecord[];
  nodes?: Record<string, NodeDiagnostics>;
  // Run-level diagnostics from resolver pre-phase (canonPath fixed to '#')
  run?: Array<{ code: DiagnosticCode; canonPath: string; details?: unknown }>;
}

export interface BranchDecisionRecord {
  canonPath: string;
  kind: 'anyOf' | 'oneOf';
  chosenBranch: { index: number; score: number };
  scoreDetails: {
    orderedIndices: number[];
    topScoreIndices: number[];
    topKIndices: number[];
    tiebreakRand?: number;
    exclusivityRand?: number;
    scoresByIndex: Record<string, number>;
  };
  budget: {
    tried: number;
    limit: number;
    skipped: boolean;
    reason?: string;
  };
  memoKey?: string;
}

export interface NodeDiagnostics {
  chosenBranch?: BranchDecisionRecord['chosenBranch'];
  scoreDetails?: BranchDecisionRecord['scoreDetails'];
  budget?: BranchDecisionRecord['budget'];
}

export interface ComposeOptions {
  seed?: number;
  trials?: PlanOptions['trials'];
  guards?: PlanOptions['guards'];
  rational?: PlanOptions['rational'];
  complexity?: PlanOptions['complexity'];
  disablePatternOverlapAnalysis?: boolean;
  selectorMemoKeyFn?: (
    canonPath: string,
    seed: number,
    opts?: PlanOptions
  ) => string;
  mode?: 'strict' | 'lax';
  /**
   * Optional Ajv metadata used when deriving selector memoization keys.
   */
  memoizer?: {
    ajvMajor: number;
    ajvClass: string;
    ajvFlags: Record<string, unknown>;
  };
  /**
   * Optional memoization cache for branch selection decisions, keyed by the
   * normative memo key (canonPath, seed, AJV.major, AJV.flags, PlanOptionsSubKey[, userKey]).
   * When omitted, an internal LRU cache bounded by PlanOptions.cache.lruSize is used.
   */
  memoCache?: Map<string, BranchDecisionRecord>;
  /**
   * Optional resolved cache context (stable hash, flags). When supplied, the
   * `planOptionsSubKey` component will be reused instead of recomputing.
   */
  cacheKeyContext?: CacheKeyContext;
  planOptions?: Partial<PlanOptions>;
}

export interface ComposeResult {
  canonical: NormalizeResult;
  containsBag: Map<string, ContainsNeed[]>;
  coverageIndex: CoverageIndex;
  nameDfaSummary?: { states: number; finite: boolean; capsHit?: boolean };
  diag?: ComposeDiagnostics;
}

export interface SelectorMemoKeyInput {
  canonPath: string;
  seed: number;
  planOptions?: Partial<PlanOptions> | ResolvedOptions;
  userKey?: string;
  ajvMetadata?: {
    ajvMajor: number;
    ajvClass: string;
    ajvFlags: Record<string, unknown>;
  };
}

export type ComposeInput = NormalizeResult;

const NAME_AUTOMATON_MAX_STATES = 4096;
const NAME_AUTOMATON_MAX_PRODUCT_STATES = 4096;

export function compose(
  input: ComposeInput,
  options?: ComposeOptions
): ComposeResult {
  const engine = new CompositionEngine(input, options);
  return engine.run();
}

export function computeSelectorMemoKey(input: SelectorMemoKeyInput): string {
  const {
    canonPath,
    seed,
    planOptions,
    userKey,
    ajvMetadata = {
      ajvMajor: 0,
      ajvClass: 'unknown',
      ajvFlags: {},
    },
  } = input;
  const subKey = createPlanOptionsSubKey(planOptions);
  const sortedFlags = sortObjectKeys(ajvMetadata.ajvFlags);
  return JSON.stringify(
    sortObjectKeys({
      canonPath,
      seed: seed >>> 0,
      ajvMajor: ajvMetadata.ajvMajor ?? 0,
      ajvClass: ajvMetadata.ajvClass ?? 'unknown',
      ajvFlags: sortedFlags,
      planOptionsSubKey: subKey,
      userKey: userKey ?? '',
    })
  );
}

class StringLRU<V> {
  private readonly map = new Map<string, V>();
  constructor(private readonly capacity: number) {}
  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }
  }
  size(): number {
    return this.map.size;
  }
}

class CompositionEngine {
  private readonly schema: unknown;
  private readonly ptrMap: Map<string, string>;
  private readonly revPtrMap: Map<string, string[]>;
  private readonly notes: NormalizerNote[];
  private readonly options: ComposeOptions;
  private readonly coverageIndex: CoverageIndex = new Map();
  private readonly diag: ComposeDiagnostics = {};
  private readonly seed: number;
  private readonly resolvedOptions: ResolvedOptions;
  private readonly planOptionsSnapshot: PlanOptions;
  private readonly memoKeyLog = new Map<string, string>();
  private readonly memoCache?: Map<string, BranchDecisionRecord>;
  private readonly caps = new Set<string>();
  private readonly approxReasons = new Map<string, Set<string>>();
  private readonly mode: 'strict' | 'lax';
  private readonly branchDiagnostics = new Map<string, BranchDecisionRecord>();
  private readonly containsIndex = new Map<string, ContainsNeed[]>();
  private readonly coverageRegexWarnKeys = new Set<string>();
  private nameDfaSummary?: {
    states: number;
    finite: boolean;
    capsHit?: boolean;
  };

  constructor(input: ComposeInput, options?: ComposeOptions) {
    this.schema = input.schema;
    this.ptrMap = input.ptrMap;
    this.revPtrMap = input.revPtrMap;
    this.notes = input.notes;
    this.options = options ?? {};
    this.seed = (options?.seed ?? 1) >>> 0;
    this.mode = options?.mode ?? 'strict';

    const resolved = resolveOptions({
      ...options?.planOptions,
      trials: options?.trials ?? options?.planOptions?.trials,
      guards: options?.guards ?? options?.planOptions?.guards,
      rational: options?.rational ?? options?.planOptions?.rational,
      complexity: options?.complexity ?? options?.planOptions?.complexity,
      disablePatternOverlapAnalysis:
        options?.disablePatternOverlapAnalysis ??
        options?.planOptions?.disablePatternOverlapAnalysis,
    });
    this.resolvedOptions = resolved;
    this.planOptionsSnapshot = resolved as unknown as PlanOptions;
    // Initialize memo cache: external if provided, else bounded internal LRU per SPEC §14
    if (options?.memoCache) {
      this.memoCache = options.memoCache;
    } else {
      const cap = Math.max(1, resolved.cache.lruSize);
      this.memoCache = new StringLRU<BranchDecisionRecord>(
        cap
      ) as unknown as Map<string, BranchDecisionRecord>;
    }
  }

  run(): ComposeResult {
    // Compose-time schema byte-size cap (SPEC §8: COMPLEXITY_CAP_SCHEMA_SIZE)
    try {
      const { byteLength } = canonicalizeForHash(this.schema);
      const limit = this.resolvedOptions.complexity.maxSchemaBytes;
      if (typeof limit === 'number' && byteLength > limit) {
        this.recordCap(DIAGNOSTIC_CODES.COMPLEXITY_CAP_SCHEMA_SIZE);
        this.addWarn('', DIAGNOSTIC_CODES.COMPLEXITY_CAP_SCHEMA_SIZE, {
          limit,
          observed: byteLength,
        });
      }
    } catch {
      // If canonicalization fails unexpectedly, ignore for cap purposes.
    }

    this.visitNode(this.schema, '');
    const diag = this.finalizeDiagnostics();
    return {
      canonical: {
        schema: this.schema,
        ptrMap: this.ptrMap,
        revPtrMap: this.revPtrMap,
        notes: this.notes,
      },
      containsBag: this.containsIndex,
      coverageIndex: this.coverageIndex,
      nameDfaSummary: this.nameDfaSummary,
      diag,
    };
  }

  private visitNode(node: unknown, canonPath: string): void {
    if (node === null || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach((item, index) =>
        this.visitNode(item, appendPointer(canonPath, String(index)))
      );
      return;
    }

    const schema = node as Record<string, unknown>;
    // SPEC §12 — Dynamic refs bounded in-document resolution (diagnostic only)
    // If a $dynamicRef is present at this node, attempt a bounded in-document
    // binding and record DYNAMIC_SCOPE_BOUNDED with {name, depth} when successful.
    const dynRef = schema['$dynamicRef'];
    if (typeof dynRef === 'string') {
      const maxHops = this.resolvedOptions.guards.maxDynamicScopeHops;
      const res = resolveDynamicRefBinding(this.schema, canonPath, dynRef, {
        maxHops,
      });
      if (
        res.code === 'DYNAMIC_SCOPE_BOUNDED' &&
        typeof res.name === 'string' &&
        typeof res.depth === 'number'
      ) {
        this.addWarn(canonPath, DIAGNOSTIC_CODES.DYNAMIC_SCOPE_BOUNDED, {
          name: res.name,
          depth: res.depth,
        });
      }
    }
    if (isArrayLikeSchema(schema)) {
      this.registerContainsBag(schema, canonPath);
    }
    if (isObjectLikeSchema(schema)) {
      // Early unsat checks involving propertyNames enums (SPEC §8 early-unsat)
      this.checkPropertyNamesUnsat(schema, canonPath);
      this.registerCoverageEntry(schema, canonPath);
    }

    this.visitComposition(schema, canonPath);
    this.visitObjectChildren(schema, canonPath);
  }

  private visitComposition(
    schema: Record<string, unknown>,
    canonPath: string
  ): void {
    const anyOf = Array.isArray(schema.anyOf)
      ? (schema.anyOf as unknown[])
      : null;
    if (anyOf && anyOf.length > 0) {
      const branchPtr = appendPointer(canonPath, 'anyOf');
      this.handleBranch('anyOf', anyOf, branchPtr);
      anyOf.forEach((branch, idx) =>
        this.visitNode(branch, appendPointer(branchPtr, String(idx)))
      );
    }

    const oneOf = Array.isArray(schema.oneOf)
      ? (schema.oneOf as unknown[])
      : null;
    if (oneOf && oneOf.length > 0) {
      const branchPtr = appendPointer(canonPath, 'oneOf');
      this.handleBranch('oneOf', oneOf, branchPtr);
      oneOf.forEach((branch, idx) =>
        this.visitNode(branch, appendPointer(branchPtr, String(idx)))
      );
    }

    const allOf = Array.isArray(schema.allOf)
      ? (schema.allOf as unknown[])
      : null;
    if (allOf && allOf.length > 0) {
      const ptr = appendPointer(canonPath, 'allOf');
      allOf.forEach((branch, idx) =>
        this.visitNode(branch, appendPointer(ptr, String(idx)))
      );
    }

    if (schema.not) {
      this.visitNode(schema.not, appendPointer(canonPath, 'not'));
    }
    if (schema.if) {
      this.visitNode(schema.if, appendPointer(canonPath, 'if'));
    }
    if (schema.then) {
      this.visitNode(schema.then, appendPointer(canonPath, 'then'));
    }
    if (schema.else) {
      this.visitNode(schema.else, appendPointer(canonPath, 'else'));
    }
  }

  private visitObjectChildren(
    schema: Record<string, unknown>,
    canonPath: string
  ): void {
    const visitRecord = (entry: unknown, segment: string): void => {
      if (!entry || typeof entry !== 'object') return;
      const childPtr = appendPointer(canonPath, segment);
      for (const [key, value] of Object.entries(
        entry as Record<string, unknown>
      )) {
        this.visitNode(value, appendPointer(childPtr, key));
      }
    };

    visitRecord(schema.properties, 'properties');
    visitRecord(schema.patternProperties, 'patternProperties');
    visitRecord(schema.dependentSchemas, 'dependentSchemas');
    visitRecord(schema.definitions, 'definitions');
    visitRecord(schema.$defs, '$defs');

    if (schema.items !== undefined) {
      if (Array.isArray(schema.items)) {
        const ptr = appendPointer(canonPath, 'items');
        schema.items.forEach((item, index) =>
          this.visitNode(item, appendPointer(ptr, String(index)))
        );
      } else {
        this.visitNode(schema.items, appendPointer(canonPath, 'items'));
      }
    }

    if (schema.prefixItems) {
      const ptr = appendPointer(canonPath, 'prefixItems');
      (schema.prefixItems as unknown[]).forEach((item, index) =>
        this.visitNode(item, appendPointer(ptr, String(index)))
      );
    }

    if (schema.contains) {
      this.visitNode(schema.contains, appendPointer(canonPath, 'contains'));
    }
    if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === 'object'
    ) {
      this.visitNode(
        schema.additionalProperties,
        appendPointer(canonPath, 'additionalProperties')
      );
    }
    if (
      schema.unevaluatedProperties &&
      typeof schema.unevaluatedProperties === 'object'
    ) {
      this.visitNode(
        schema.unevaluatedProperties,
        appendPointer(canonPath, 'unevaluatedProperties')
      );
    }
    if (
      schema.unevaluatedItems &&
      typeof schema.unevaluatedItems === 'object'
    ) {
      this.visitNode(
        schema.unevaluatedItems,
        appendPointer(canonPath, 'unevaluatedItems')
      );
    }
    if (schema.propertyNames && typeof schema.propertyNames === 'object') {
      this.visitNode(
        schema.propertyNames,
        appendPointer(canonPath, 'propertyNames')
      );
    }
  }

  private registerContainsBag(
    schema: Record<string, unknown>,
    canonPath: string
  ): void {
    const rawNeeds = collectContainsNeeds(schema);
    const reducedNeeds = applyContainsSubsumption(rawNeeds);
    if (reducedNeeds.length === 0) {
      this.containsIndex.delete(canonPath);
      return;
    }

    const evaluated = this.evaluateContainsBag(reducedNeeds, schema, canonPath);
    if (evaluated.length === 0) {
      this.containsIndex.delete(canonPath);
      return;
    }
    this.containsIndex.set(canonPath, evaluated);
  }

  private evaluateContainsBag(
    bag: ContainsNeed[],
    schema: Record<string, unknown>,
    canonPath: string
  ): ContainsNeed[] {
    const normalized: NormalizedContainsNeed[] = bag.map((need) => ({
      schema: need.schema,
      min: typeof need.min === 'number' ? need.min : 1,
      ...(typeof need.max === 'number' ? { max: need.max } : {}),
    }));

    const effectiveMaxItems = computeEffectiveMaxItems(schema);
    let aggregateMin = 0;

    for (const need of normalized) {
      aggregateMin += need.min;
      if (need.max !== undefined && need.max < need.min) {
        this.addFatal(canonPath, DIAGNOSTIC_CODES.CONTAINS_NEED_MIN_GT_MAX, {
          min: need.min,
          max: need.max,
        });
      }
      if (effectiveMaxItems !== undefined && need.min > effectiveMaxItems) {
        this.addFatal(canonPath, DIAGNOSTIC_CODES.CONTAINS_UNSAT_BY_SUM, {
          sumMin: need.min,
          maxItems: effectiveMaxItems,
          disjointness: 'provable',
        });
      }
    }

    if (effectiveMaxItems !== undefined && aggregateMin > effectiveMaxItems) {
      if (areNeedsPairwiseDisjoint(normalized)) {
        this.addFatal(canonPath, DIAGNOSTIC_CODES.CONTAINS_UNSAT_BY_SUM, {
          sumMin: aggregateMin,
          maxItems: effectiveMaxItems,
          disjointness: 'provable',
        });
      } else {
        this.addUnsatHint({
          code: DIAGNOSTIC_CODES.CONTAINS_UNSAT_BY_SUM,
          canonPath,
          provable: false,
          reason: 'overlapUnknown',
          details: {
            sumMin: aggregateMin,
            maxItems: effectiveMaxItems ?? null,
          },
        });
      }
    }

    for (let i = 0; i < normalized.length; i += 1) {
      const antecedent = normalized[i]!;
      if (antecedent.min <= 0) continue;
      for (let j = 0; j < normalized.length; j += 1) {
        if (i === j) continue;
        const blocker = normalized[j]!;
        if (blocker.max !== 0) continue;
        if (isSchemaSubset(antecedent.schema, blocker.schema)) {
          this.addFatal(canonPath, DIAGNOSTIC_CODES.CONTAINS_UNSAT_BY_SUM, {
            sumMin: aggregateMin,
            maxItems: effectiveMaxItems ?? null,
            disjointness: 'provable',
            reason: 'subsetContradiction',
            antecedentIndex: i,
            blockingIndex: j,
          });
        }
      }
    }

    let trimmed = normalized;
    const limit = this.resolvedOptions.complexity.maxContainsNeeds;
    if (normalized.length > limit) {
      this.recordCap(DIAGNOSTIC_CODES.COMPLEXITY_CAP_CONTAINS);
      this.addWarn(canonPath, DIAGNOSTIC_CODES.COMPLEXITY_CAP_CONTAINS, {
        limit,
        observed: normalized.length,
      });
      trimmed = normalized.slice(0, limit);
    }

    const trimmedSumMin = trimmed.reduce((total, need) => total + need.min, 0);
    this.addWarn(canonPath, DIAGNOSTIC_CODES.CONTAINS_BAG_COMBINED, {
      bagSize: trimmed.length,
      sumMin: trimmedSumMin,
      maxItems: effectiveMaxItems ?? null,
    });

    return trimmed.map((need) =>
      need.max !== undefined
        ? { schema: need.schema, min: need.min, max: need.max }
        : { schema: need.schema, min: need.min }
    );
  }

  private registerCoverageEntry(
    schema: Record<string, unknown>,
    canonPath: string
  ): void {
    if (schema.additionalProperties !== false) {
      this.coverageIndex.set(canonPath, {
        has: () => true,
        provenance: [],
      });
      return;
    }

    const conjuncts = this.collectCoverageConjuncts(schema, canonPath);
    if (conjuncts.length === 0) {
      // No conjunct enforced AP:false in the effective view; vacuous coverage.
      this.coverageIndex.set(canonPath, {
        has: () => true,
        provenance: [],
      });
      return;
    }

    const presencePressure = this.computePresencePressure(schema);
    const unsafeIssues = conjuncts.flatMap((conj) => conj.unsafePatternIssues);
    const candidateFromGating = this.intersectGatingCandidates(conjuncts);
    const candidateNames = candidateFromGating ?? new Set<string>();
    if (!candidateFromGating) {
      for (const conj of conjuncts) {
        conj.finiteCandidates.forEach((value) => candidateNames.add(value));
      }
    }

    // Build per-conjunct DFAs for coverage-bearing sources and derive an
    // optional product DFA summary for the must-cover language. When automata
    // cannot be built (e.g., due to regex caps or complex shapes), fall back
    // to the existing predicate semantics for CoverageIndex.has.
    const nameAutomatonSummary = this.buildNameAutomatonProductSummary(
      conjuncts,
      canonPath
    );

    const hasName = this.createCoveragePredicate(conjuncts);

    let safeIntersectionExists = false;
    if (
      nameAutomatonSummary &&
      !nameAutomatonSummary.empty &&
      !nameAutomatonSummary.capsHit
    ) {
      safeIntersectionExists = true;
    } else {
      for (const candidate of candidateNames) {
        if (hasName(candidate)) {
          safeIntersectionExists = true;
          break;
        }
      }
    }

    const hasNonLiteralPattern = conjuncts.some((conj) =>
      conj.patterns.some((pattern) => !pattern.literals)
    );
    const gatingWithoutEnumeration = conjuncts.some(
      (conj) => conj.gatingPattern && !conj.gatingPattern.literals
    );
    const enumerationEligible =
      unsafeIssues.length === 0 &&
      !hasNonLiteralPattern &&
      !gatingWithoutEnumeration;

    const provenance = new Set<CoverageProvenance>();
    if (conjuncts.some((conj) => conj.hasProperties)) {
      provenance.add('properties');
    }
    if (conjuncts.some((conj) => conj.hasPatternProperties)) {
      provenance.add('patternProperties');
    }
    if (conjuncts.some((conj) => conj.hasSyntheticPatterns)) {
      provenance.add('propertyNamesSynthetic');
    }

    let enumerationValues: string[] | undefined;
    let enumerationIsComplete = false;
    if (enumerationEligible) {
      const enumerationCandidates = candidateFromGating ?? new Set<string>();
      if (!candidateFromGating) {
        for (const conj of conjuncts) {
          conj.named.forEach((name) => enumerationCandidates.add(name));
          for (const pattern of conj.patterns) {
            if (pattern.literals) {
              pattern.literals.forEach((literal) =>
                enumerationCandidates.add(literal)
              );
            }
          }
        }
      }
      const filtered = Array.from(enumerationCandidates.values()).filter(
        (candidate) => hasName(candidate)
      );

      // Guard: do not expose enumerate() when finiteness comes only from
      // raw propertyNames.enum (no §7 rewrite evidence). Enumeration is
      // allowed when we have any non-propertyNames finite source (named
      // properties or patternProperties/propertyNamesSynthetic literals), or
      // when a PNAMES_REWRITE_APPLIED note exists at this object.
      const hasNonPropertyNamesFiniteSource = conjuncts.some(
        (conj) =>
          conj.named.size > 0 || conj.patterns.some((p) => Boolean(p.literals))
      );
      const hasGatingEnum = conjuncts.some(
        (conj) => conj.gatingEnum !== undefined && conj.gatingEnum.size > 0
      );
      const pnamesRewriteApplied = this.hasPnamesRewrite(canonPath);

      const limit = ENUM_CAP;
      if (
        hasGatingEnum &&
        !hasNonPropertyNamesFiniteSource &&
        !pnamesRewriteApplied
      ) {
        // Finite only due to raw propertyNames gating ⇒ do not enumerate
        // (SPEC §8 — coverage-index-enumerate restriction).
      } else if (filtered.length > limit) {
        this.recordCap(DIAGNOSTIC_CODES.COMPLEXITY_CAP_ENUM);
        this.addWarn(canonPath, DIAGNOSTIC_CODES.COMPLEXITY_CAP_ENUM, {
          limit,
          observed: filtered.length,
        });
      } else if (filtered.length > 0) {
        filtered.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        enumerationValues = filtered;
        enumerationIsComplete = true;
      }
    } else if (
      !safeIntersectionExists &&
      presencePressure &&
      conjuncts.some(
        (conj) =>
          conj.hasProperties ||
          conj.patterns.length > 0 ||
          conj.hasSyntheticPatterns
      )
    ) {
      enumerationValues = [];
    } else if (
      !safeIntersectionExists &&
      presencePressure &&
      unsafeIssues.length > 0
    ) {
      enumerationValues = [];
    }

    // Fallback: when enumeration is still undefined and safe anchored patterns
    // are present, attempt BFS-based enumeration over the name automata. This
    // is gated by the same propertyNames rules used above: we do not expose
    // enumerate() when finiteness stems solely from raw propertyNames.enum
    // without rewrite evidence.
    if (
      enumerationValues === undefined &&
      unsafeIssues.length === 0 &&
      conjuncts.some((conj) => conj.patterns.length > 0)
    ) {
      const hasNonPropertyNamesFiniteSource = conjuncts.some(
        (conj) =>
          conj.named.size > 0 ||
          conj.patterns.some((p) => Boolean(p.literals)) ||
          conj.hasSyntheticPatterns
      );
      const hasGatingEnum = conjuncts.some(
        (conj) => conj.gatingEnum !== undefined && conj.gatingEnum.size > 0
      );
      const pnamesRewriteApplied = this.hasPnamesRewrite(canonPath);
      const hasOnlyPropertyNamesFiniteSource =
        hasGatingEnum &&
        !hasNonPropertyNamesFiniteSource &&
        !pnamesRewriteApplied;

      if (!hasOnlyPropertyNamesFiniteSource) {
        const bfsValues = this.enumerateViaNameAutomata(
          conjuncts,
          canonPath,
          hasName
        );
        if (bfsValues && bfsValues.length > 0) {
          enumerationValues = bfsValues;
        }
      }
    }

    const coverageEntry: CoverageEntry = {
      has: hasName,
      provenance: Array.from(provenance.values()).sort(),
    };
    if (enumerationValues) {
      const snapshot = enumerationValues.slice();
      coverageEntry.enumerate = (k?: number) => {
        if (k === undefined) {
          return snapshot.slice();
        }
        const limit = Math.max(0, Math.floor(k));
        return snapshot.slice(0, limit);
      };
    }
    this.coverageIndex.set(canonPath, coverageEntry);
    this.recordPatternOverlapDiagnostics(canonPath, conjuncts);

    // Early-UNSAT: required keys rejected by propertyNames gating under AP:false.
    const directRequired = Array.isArray(schema.required)
      ? (schema.required as unknown[]).filter(
          (v): v is string => typeof v === 'string'
        )
      : [];
    const pn = schema.propertyNames;
    if (
      pn &&
      typeof pn === 'object' &&
      directRequired.length > 0 &&
      candidateFromGating &&
      candidateFromGating.size > 0
    ) {
      const requiredOut = directRequired.filter(
        (name) => !candidateFromGating.has(name)
      );
      if (requiredOut.length > 0) {
        const propertyNamesDomain = Array.from(
          candidateFromGating.values()
        ).sort();
        this.addFatal(
          canonPath,
          DIAGNOSTIC_CODES.UNSAT_REQUIRED_VS_PROPERTYNAMES,
          {
            required: requiredOut,
            propertyNames: propertyNamesDomain,
          }
        );
      }
    }

    // Early-UNSAT: finite coverage smaller than minProperties.
    if (
      enumerationIsComplete &&
      enumerationValues &&
      enumerationValues.length > 0 &&
      typeof schema.minProperties === 'number' &&
      schema.minProperties > 0 &&
      schema.minProperties > enumerationValues.length
    ) {
      this.addFatal(
        canonPath,
        DIAGNOSTIC_CODES.UNSAT_MINPROPERTIES_VS_COVERAGE,
        {
          minProperties: schema.minProperties,
          coverageSize: enumerationValues.length,
        }
      );
    }

    if (!safeIntersectionExists && presencePressure) {
      const hasAnyCoverageSource = conjuncts.some(
        (conj) =>
          conj.hasProperties ||
          conj.hasPatternProperties ||
          conj.hasSyntheticPatterns
      );
      const hasOnlyPropertyNamesGating =
        !hasAnyCoverageSource &&
        conjuncts.some((conj) => conj.gatingEnum || conj.gatingPattern);

      const automatonEmpty =
        nameAutomatonSummary &&
        nameAutomatonSummary.empty &&
        !nameAutomatonSummary.capsHit;

      // Strong emptiness: anchored-safe coverage/gating automata have an empty
      // product language under presence pressure. In this case, short-circuit
      // with UNSAT_AP_FALSE_EMPTY_COVERAGE and do not emit approximation hints.
      if (automatonEmpty && hasAnyCoverageSource) {
        this.addFatal(
          canonPath,
          DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE,
          buildUnsatDetails(schema)
        );
        return;
      }

      // SPEC §8 Early unsat: provably empty coverage under presence pressure.
      // Provable iff there are NO coverage sources (no named properties, no
      // anchored-safe patternProperties, no §7 synthetic patterns). In this
      // case, short-circuit as unsat and emit UNSAT_AP_FALSE_EMPTY_COVERAGE.
      if (!hasAnyCoverageSource) {
        this.addFatal(
          canonPath,
          DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE,
          buildUnsatDetails(schema)
        );
        // If raw propertyNames gating is present, surface approximation + hint
        // for observability; the hint reason stays coverageUnknown per SPEC while
        // the approximation details record presencePressure.
        const hasAnyGating = conjuncts.some(
          (conj) => conj.gatingEnum || conj.gatingPattern
        );
        if (hasAnyGating) {
          this.addApproximation(canonPath, 'presencePressure');
          this.addUnsatHint({
            code: DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE,
            canonPath,
            provable: false,
            reason: 'coverageUnknown',
            details: buildUnsatDetails(schema),
          });
        }
        return;
      }

      // Otherwise, coverage emptiness is not provable (patterns or gating are
      // involved). Do NOT short-circuit: emit approximation + hint, and in
      // Strict mode only escalate unsafe pattern usage to AP_FALSE_UNSAFE_PATTERN.
      this.addUnsatHint({
        code: DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE,
        canonPath,
        provable: false,
        reason: 'coverageUnknown',
        details: buildUnsatDetails(schema),
      });

      // SPEC §8 (AP:false fail-fast): Only emit AP_FALSE_UNSAFE_PATTERN when
      // must-cover would rely on non-anchored or complexity-capped patterns
      // from patternProperties or synthetic (§7) sources. A raw
      // propertyNames.pattern (no rewrite) is gating-only and MUST NOT trigger
      // AP_FALSE_UNSAFE_PATTERN.
      if (unsafeIssues.length > 0 && !hasOnlyPropertyNamesGating) {
        const detail = this.buildApFalseUnsafeDetail(unsafeIssues);
        const unsafePolicy =
          this.resolvedOptions.patternPolicy.unsafeUnderApFalse;
        const shouldFailFast =
          this.mode === 'strict' && unsafePolicy === 'error';
        if (shouldFailFast) {
          this.addFatal(
            canonPath,
            DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN,
            detail
          );
        } else {
          this.addWarn(
            canonPath,
            DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN,
            detail
          );
        }
      }

      this.addApproximation(canonPath, 'presencePressure');
    }
  }

  private checkPropertyNamesUnsat(
    schema: Record<string, unknown>,
    canonPath: string
  ): void {
    const pn = schema.propertyNames;
    if (!pn || typeof pn !== 'object') return;
    const pnRec = pn as Record<string, unknown>;

    // Helper to extract enum of strings
    const enumVals = Array.isArray(pnRec.enum)
      ? (pnRec.enum as unknown[]).filter(
          (v): v is string => typeof v === 'string'
        )
      : undefined;

    // UNSAT_MINPROPS_PNAMES: propertyNames enum empty AND minProperties > 0
    if (
      enumVals &&
      enumVals.length === 0 &&
      typeof schema.minProperties === 'number' &&
      schema.minProperties > 0
    ) {
      this.addFatal(canonPath, DIAGNOSTIC_CODES.UNSAT_MINPROPS_PNAMES, {
        minProperties: schema.minProperties,
      });
      return;
    }

    // UNSAT_REQUIRED_PNAMES: required contains names not in enum E
    if (enumVals && enumVals.length > 0) {
      const required = Array.isArray(schema.required)
        ? (schema.required as unknown[]).filter(
            (v): v is string => typeof v === 'string'
          )
        : [];
      if (required.length > 0) {
        const allowed = new Set(enumVals);
        const requiredOut = required.filter((r) => !allowed.has(r));
        if (requiredOut.length > 0) {
          this.addFatal(canonPath, DIAGNOSTIC_CODES.UNSAT_REQUIRED_PNAMES, {
            requiredOut,
          });
        }
      }
    }
  }

  private recordPatternOverlapDiagnostics(
    canonPath: string,
    conjuncts: CoverageConjunctInfo[]
  ): void {
    if (this.resolvedOptions.disablePatternOverlapAnalysis) return;

    const patterns = conjuncts.flatMap((conj) => conj.patterns);
    if (patterns.length < 2) return;

    const adjacency = new Map<number, Set<number>>();
    const addEdge = (from: number, to: number): void => {
      let left = adjacency.get(from);
      if (!left) {
        left = new Set<number>();
        adjacency.set(from, left);
      }
      left.add(to);

      let right = adjacency.get(to);
      if (!right) {
        right = new Set<number>();
        adjacency.set(to, right);
      }
      right.add(from);
    };

    for (let i = 0; i < patterns.length; i += 1) {
      for (let j = i + 1; j < patterns.length; j += 1) {
        if (patternsOverlap(patterns[i]!, patterns[j]!)) {
          addEdge(i, j);
        }
      }
    }

    if (adjacency.size === 0) {
      return;
    }

    const visited = new Set<number>();
    const entries: Array<{ key: string; patterns: string[] }> = [];
    const startIndices = Array.from(adjacency.keys()).sort((a, b) => a - b);
    for (const start of startIndices) {
      if (visited.has(start)) continue;
      const stack = [start];
      const component: number[] = [];
      while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        component.push(current);
        const neighbors = adjacency.get(current);
        if (!neighbors) continue;
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            stack.push(neighbor);
          }
        }
      }
      if (component.length < 2) continue;
      const patternSources = component
        .map((idx) => patterns[idx]!.source)
        .sort();
      entries.push({ key: canonPath, patterns: patternSources });
    }

    if (entries.length === 0) return;

    entries.sort((a, b) => {
      if (a.key !== b.key) return a.key.localeCompare(b.key);
      const left = a.patterns.join('\u0000');
      const right = b.patterns.join('\u0000');
      return left.localeCompare(right);
    });

    this.diag.overlaps ??= {};
    this.diag.overlaps.patterns ??= [];
    const existing = new Set(
      this.diag.overlaps.patterns.map((entry) =>
        JSON.stringify({ key: entry.key, patterns: entry.patterns })
      )
    );
    for (const entry of entries) {
      const signature = JSON.stringify(entry);
      if (existing.has(signature)) continue;
      this.diag.overlaps.patterns.push(entry);
      existing.add(signature);
    }
  }

  private hasPnamesRewrite(pointer: string): boolean {
    return this.notes.some(
      (n) =>
        n.canonPath === pointer &&
        n.code === DIAGNOSTIC_CODES.PNAMES_REWRITE_APPLIED
    );
  }

  private collectCoverageConjuncts(
    schema: Record<string, unknown>,
    canonPath: string
  ): CoverageConjunctInfo[] {
    const results: CoverageConjunctInfo[] = [];
    const rootConjunct = this.buildCoverageConjunct(schema, canonPath);
    if (rootConjunct) {
      results.push(rootConjunct);
    }

    const allOf = Array.isArray(schema.allOf) ? schema.allOf : undefined;
    if (!allOf) {
      return results;
    }

    const allOfPtr = appendPointer(canonPath, 'allOf');
    allOf.forEach((branch, index) => {
      if (!branch || typeof branch !== 'object') return;
      const branchPtr = appendPointer(allOfPtr, String(index));
      results.push(
        ...this.collectCoverageConjuncts(
          branch as Record<string, unknown>,
          branchPtr
        )
      );
    });
    return results;
  }

  private buildNameAutomatonProductSummary(
    conjuncts: CoverageConjunctInfo[],
    canonPath: string
  ): ProductSummary | undefined {
    const components: Dfa[] = [];
    let coverageComponentCount = 0;

    // Restrict to the simple and common shapes where automata are most
    // effective and semantics are straightforward: each coverage-bearing
    // conjunct must be driven purely by anchored-safe patternProperties
    // (no named properties or synthetic patterns).
    for (const conj of conjuncts) {
      const hasCoverageSource =
        conj.hasProperties ||
        conj.patterns.length > 0 ||
        conj.hasSyntheticPatterns;
      if (!hasCoverageSource) {
        continue;
      }
      if (conj.named.size > 0 || conj.hasSyntheticPatterns) {
        return undefined;
      }
      if (conj.patterns.length !== 1) {
        return undefined;
      }

      const pattern = conj.patterns[0]!;
      try {
        const nfaResult = buildThompsonNfa(pattern.source, {
          maxStates: NAME_AUTOMATON_MAX_STATES,
        });
        if (nfaResult.capped) {
          this.recordCap(DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED);
          this.addWarn(
            canonPath,
            DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED,
            {
              statesCap: NAME_AUTOMATON_MAX_STATES,
              observedStates: nfaResult.stateCount,
              component: 'nfa',
            }
          );
          return undefined;
        }

        const dfaResult = buildDfaFromNfa(nfaResult.nfa, {
          maxDfaStates: NAME_AUTOMATON_MAX_STATES,
        });
        if (dfaResult.capped) {
          this.recordCap(DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED);
          this.addWarn(
            canonPath,
            DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED,
            {
              statesCap: NAME_AUTOMATON_MAX_STATES,
              observedStates: dfaResult.stateCount,
              component: 'dfa',
            }
          );
          return undefined;
        }
        components.push(dfaResult.dfa);
        coverageComponentCount += 1;
      } catch {
        // If automaton construction fails for any coverage-bearing conjunct,
        // bail out and fall back to predicate-based coverage.
        return undefined;
      }
    }

    // Incorporate anchored-safe propertyNames.pattern gating (when present)
    // as additional DFA components. These remain gating-only for coverage
    // enumeration but can participate in emptiness proofs.
    for (const conj of conjuncts) {
      if (!conj.gatingPattern) continue;
      const patternSource = conj.gatingPattern.source;
      try {
        const nfaResult = buildThompsonNfa(patternSource, {
          maxStates: NAME_AUTOMATON_MAX_STATES,
        });
        if (nfaResult.capped) {
          this.recordCap(DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED);
          this.addWarn(
            canonPath,
            DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED,
            {
              statesCap: NAME_AUTOMATON_MAX_STATES,
              observedStates: nfaResult.stateCount,
              component: 'nfa',
            }
          );
          return undefined;
        }

        const dfaResult = buildDfaFromNfa(nfaResult.nfa, {
          maxDfaStates: NAME_AUTOMATON_MAX_STATES,
        });
        if (dfaResult.capped) {
          this.recordCap(DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED);
          this.addWarn(
            canonPath,
            DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED,
            {
              statesCap: NAME_AUTOMATON_MAX_STATES,
              observedStates: dfaResult.stateCount,
              component: 'dfa',
            }
          );
          return undefined;
        }
        components.push(dfaResult.dfa);
      } catch {
        return undefined;
      }
    }

    // Automaton-based proofs are meaningful only when at least one
    // coverage-bearing conjunct participates. Gating-only schemas (e.g.,
    // raw propertyNames.pattern without §7 rewrite) fall back to the
    // existing predicate-based logic and early-unsat hints.
    if (coverageComponentCount === 0 || components.length === 0) {
      return undefined;
    }

    const productResult = buildProductDfa(components, {
      maxProductStates: NAME_AUTOMATON_MAX_PRODUCT_STATES,
    });

    if (productResult.capped || productResult.summary.capsHit) {
      this.recordCap(DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED);
      this.addWarn(
        canonPath,
        DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED,
        {
          productStatesCap: NAME_AUTOMATON_MAX_PRODUCT_STATES,
          observedProductStates: productResult.stateCount,
          component: 'product',
        }
      );
    }

    this.updateNameDfaSummary(canonPath, productResult.summary);
    return productResult.summary;
  }

  private updateNameDfaSummary(
    canonPath: string,
    summary: ProductSummary
  ): void {
    if (canonPath !== '') return;
    const snapshot: { states: number; finite: boolean; capsHit?: boolean } = {
      states: summary.states,
      finite: summary.finite,
      ...(summary.capsHit ? { capsHit: summary.capsHit } : {}),
    };
    this.nameDfaSummary = snapshot;
  }

  private enumerateViaNameAutomata(
    conjuncts: CoverageConjunctInfo[],
    canonPath: string,
    hasName: (name: string) => boolean
  ): string[] | undefined {
    // For now, handle the simple and common case where there is a single
    // AP:false conjunct with a single anchored-safe patternProperties entry
    // and no named properties. This aligns with the acceptance scenario where
    // patternProperties drives must-cover (e.g., ^(?:x|y)[a-z]$).
    if (conjuncts.length !== 1) return undefined;
    const conj = conjuncts[0]!;
    if (conj.named.size > 0) return undefined;
    if (conj.patterns.length !== 1) return undefined;

    const pattern = conj.patterns[0]!;
    try {
      const nfaResult = buildThompsonNfa(pattern.source, {
        maxStates: NAME_AUTOMATON_MAX_STATES,
      });
      if (nfaResult.capped) {
        this.recordCap(DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED);
        this.addWarn(
          canonPath,
          DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED,
          {
            statesCap: NAME_AUTOMATON_MAX_STATES,
            observedStates: nfaResult.stateCount,
            component: 'nfa',
          }
        );
        return undefined;
      }

      const dfaResult = buildDfaFromNfa(nfaResult.nfa, {
        maxDfaStates: NAME_AUTOMATON_MAX_STATES,
      });
      if (dfaResult.capped) {
        this.recordCap(DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED);
        this.addWarn(
          canonPath,
          DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED,
          {
            statesCap: NAME_AUTOMATON_MAX_STATES,
            observedStates: dfaResult.stateCount,
            component: 'dfa',
          }
        );
        return undefined;
      }

      const product = buildProductDfa([dfaResult.dfa]);

      if (product.capped || product.summary.capsHit) {
        this.recordCap(DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED);
        this.addWarn(
          canonPath,
          DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED,
          {
            productStatesCap: NAME_AUTOMATON_MAX_PRODUCT_STATES,
            observedProductStates: product.stateCount,
            component: 'product',
          }
        );
        return undefined;
      }

      const { maxLength, maxCandidates } = this.resolvedOptions.patternWitness;

      const bfsResult = bfsEnumerate(product.dfa, ENUM_CAP, {
        maxLength,
        maxCandidates,
      });

      if (bfsResult.capped) {
        this.recordCap(DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED);
        this.addWarn(
          canonPath,
          DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED,
          {
            maxKEnumeration: ENUM_CAP,
            bfsCandidatesCap: maxCandidates,
            triedCandidates: bfsResult.tried,
            component: 'bfs',
          }
        );
        return undefined;
      }

      if (!bfsResult.words.length) {
        return undefined;
      }

      const filtered = bfsResult.words.filter((word) => hasName(word));
      if (!filtered.length) {
        return undefined;
      }

      if (filtered.length > ENUM_CAP) {
        this.recordCap(DIAGNOSTIC_CODES.COMPLEXITY_CAP_ENUM);
        this.addWarn(canonPath, DIAGNOSTIC_CODES.COMPLEXITY_CAP_ENUM, {
          limit: ENUM_CAP,
          observed: filtered.length,
        });
        return undefined;
      }

      filtered.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      return filtered;
    } catch {
      // On any automaton construction failure, fall back to heuristic coverage.
      return undefined;
    }
  }

  private buildCoverageConjunct(
    schema: Record<string, unknown>,
    pointer: string
  ): CoverageConjunctInfo | undefined {
    if (!isObjectLikeSchema(schema)) return undefined;
    if (schema.additionalProperties !== false) return undefined;

    const named = new Set<string>();
    const finiteCandidates = new Set<string>();
    if (schema.properties && typeof schema.properties === 'object') {
      for (const key of Object.keys(
        schema.properties as Record<string, unknown>
      )) {
        named.add(key);
        finiteCandidates.add(key);
      }
    }

    const patterns: CoveragePatternInfo[] = [];
    const unsafePatternIssues: PatternIssue[] = [];
    const patternProps =
      schema.patternProperties && typeof schema.patternProperties === 'object'
        ? (schema.patternProperties as Record<string, unknown>)
        : undefined;
    let hasPatternProperties = false;
    let hasSyntheticPatterns = false;

    if (patternProps) {
      const basePtr = appendPointer(pointer, 'patternProperties');
      for (const patternSource of Object.keys(patternProps)) {
        const patternPtr = appendPointer(basePtr, patternSource);
        const sourceKind: CoverageProvenance = this.isPropertyNamesSynthetic(
          patternPtr
        )
          ? 'propertyNamesSynthetic'
          : 'patternProperties';
        if (sourceKind === 'patternProperties') {
          hasPatternProperties = true;
        } else {
          hasSyntheticPatterns = true;
        }

        const analysis = analyzeRegexPattern(patternSource);
        if (analysis.compileError) {
          this.addCoverageRegexWarn(
            pointer,
            DIAGNOSTIC_CODES.REGEX_COMPILE_ERROR,
            {
              patternSource,
              context: 'coverage',
            }
          );
          this.addApproximation(pointer, 'regexCompileError');
          continue;
        }
        if (analysis.complexityCapped) {
          this.addCoverageRegexWarn(
            pointer,
            DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED,
            {
              patternSource,
              context: 'coverage',
            }
          );
          this.addApproximation(pointer, 'regexComplexityCap');
          unsafePatternIssues.push({
            pointer,
            source: patternSource,
            sourceKind,
            reason: 'regexComplexityCap',
          });
          continue;
        }
        if (!analysis.anchoredSafe || !analysis.compiled) {
          this.addApproximation(pointer, 'nonAnchoredPattern');
          unsafePatternIssues.push({
            pointer,
            source: patternSource,
            sourceKind,
            reason: 'nonAnchoredPattern',
          });
          continue;
        }
        patterns.push({
          pointer: patternPtr,
          source: patternSource,
          regexp: analysis.compiled,
          literals: analysis.literalAlternatives,
          sourceKind,
        });
        if (analysis.literalAlternatives) {
          for (const literal of analysis.literalAlternatives) {
            finiteCandidates.add(literal);
          }
        }
      }
    }

    let gatingEnum: Set<string> | undefined;
    let gatingPattern: CoverageGatingPattern | undefined;
    const propertyNames = schema.propertyNames;
    if (propertyNames && typeof propertyNames === 'object') {
      if (
        'const' in propertyNames &&
        typeof (propertyNames as Record<string, unknown>).const === 'string'
      ) {
        const value = (propertyNames as Record<string, unknown>)
          .const as string;
        gatingEnum = new Set([value]);
      } else if (
        Array.isArray((propertyNames as Record<string, unknown>).enum)
      ) {
        const values = extractStringArray(
          (propertyNames as Record<string, unknown>).enum
        );
        if (values) {
          gatingEnum = new Set(values);
        }
      }

      if (
        typeof (propertyNames as Record<string, unknown>).pattern === 'string'
      ) {
        const patternSource = (propertyNames as Record<string, unknown>)
          .pattern as string;
        const analysis = analyzeRegexPattern(patternSource);
        if (analysis.compileError) {
          this.addCoverageRegexWarn(
            pointer,
            DIAGNOSTIC_CODES.REGEX_COMPILE_ERROR,
            {
              patternSource,
              context: 'coverage',
            }
          );
          this.addApproximation(pointer, 'regexCompileError');
        } else if (analysis.complexityCapped) {
          this.addCoverageRegexWarn(
            pointer,
            DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED,
            {
              patternSource,
              context: 'coverage',
            }
          );
          this.addApproximation(pointer, 'regexComplexityCap');
        } else if (!analysis.anchoredSafe || !analysis.compiled) {
          this.addApproximation(pointer, 'nonAnchoredPattern');
        } else {
          gatingPattern = {
            source: patternSource,
            regexp: analysis.compiled,
            literals: analysis.literalAlternatives,
          };
        }
      }
    }

    return {
      pointer,
      named,
      patterns,
      gatingEnum,
      gatingPattern,
      unsafePatternIssues,
      hasProperties: named.size > 0,
      hasPatternProperties,
      hasSyntheticPatterns,
      finiteCandidates,
    };
  }

  private intersectGatingCandidates(
    conjuncts: CoverageConjunctInfo[]
  ): Set<string> | undefined {
    let intersection: Set<string> | undefined;
    for (const conj of conjuncts) {
      const gatingSets: Set<string>[] = [];
      if (conj.gatingEnum) {
        gatingSets.push(conj.gatingEnum);
      }
      if (conj.gatingPattern?.literals) {
        gatingSets.push(new Set(conj.gatingPattern.literals));
      }
      if (gatingSets.length === 0) continue;

      let combined: Set<string> | undefined;
      for (const set of gatingSets) {
        combined = combined ? intersectStringSets(combined, set) : new Set(set);
      }
      if (!combined) continue;
      intersection = intersection
        ? intersectStringSets(intersection, combined)
        : combined;
      if (intersection.size === 0) {
        return new Set<string>();
      }
    }
    return intersection;
  }

  private createCoveragePredicate(
    conjuncts: CoverageConjunctInfo[]
  ): (name: string) => boolean {
    const coverageBearingCount = conjuncts.reduce((count, conj) => {
      if (
        conj.hasProperties ||
        conj.patterns.length > 0 ||
        conj.hasSyntheticPatterns
      ) {
        return count + 1;
      }
      return count;
    }, 0);
    return (name: string) => {
      for (const conj of conjuncts) {
        if (conj.gatingEnum && !conj.gatingEnum.has(name)) {
          return false;
        }
        if (conj.gatingPattern && !conj.gatingPattern.regexp.test(name)) {
          return false;
        }
        const hasCoverageSource =
          conj.hasProperties ||
          conj.patterns.length > 0 ||
          conj.hasSyntheticPatterns;
        const gatingOnly = !hasCoverageSource;
        if (gatingOnly && coverageBearingCount > 0) {
          continue;
        }
        if (conj.named.has(name)) {
          continue;
        }
        let matched = false;
        for (const pattern of conj.patterns) {
          if (pattern.regexp.test(name)) {
            matched = true;
            break;
          }
        }
        if (!matched) {
          return false;
        }
      }
      return true;
    };
  }

  private computePresencePressure(schema: Record<string, unknown>): boolean {
    if (hasPresencePressure(schema)) {
      return true;
    }
    const allOf = Array.isArray(schema.allOf) ? schema.allOf : undefined;
    if (!allOf) return false;
    for (const branch of allOf) {
      if (branch && typeof branch === 'object') {
        if (this.computePresencePressure(branch as Record<string, unknown>)) {
          return true;
        }
      }
    }
    return false;
  }

  private handleBranch(
    kind: 'anyOf' | 'oneOf',
    branches: unknown[],
    canonPath: string
  ): void {
    // Derive memo key upfront to allow memoization short-circuit per SPEC §14
    const userKey = this.options.selectorMemoKeyFn
      ? this.options.selectorMemoKeyFn(
          canonPath,
          this.seed,
          this.planOptionsSnapshot
        )
      : undefined;
    const memoKey = computeSelectorMemoKey({
      canonPath,
      seed: this.seed,
      planOptions: this.resolvedOptions,
      userKey,
      ajvMetadata: this.options.memoizer,
    });
    const cached = this.memoCache?.get(memoKey);
    if (cached && cached.kind === kind) {
      // Reuse cached decision and record diagnostics + metrics deterministically
      this.branchDiagnostics.set(canonPath, cached);
      this.memoKeyLog.set(canonPath, memoKey);
      return;
    }
    if (branches.length === 0) return;
    const branchStats = branches.map((branch, index) =>
      analyzeBranch(branch, index)
    );
    const scored = branchStats.map((stats) => ({
      idx: stats.index,
      score: scoreBranch(stats, branchStats),
    }));

    const ordered = scored
      .slice()
      .sort((a, b) => b.score - a.score || a.idx - b.idx);
    const orderedIndices = ordered.map((entry) => entry.idx);
    const maxScore = ordered[0]?.score ?? 0;
    const topScoreIndices = ordered
      .filter((entry) => entry.score === maxScore)
      .map((entry) => entry.idx)
      .sort((a, b) => a - b);

    const trials = this.resolvedOptions.trials;
    const complexity = this.resolvedOptions.complexity;
    const branchCount = branches.length;
    const rawCapLimit =
      kind === 'oneOf'
        ? complexity.maxOneOfBranches
        : complexity.maxAnyOfBranches;
    const complexityCapApplied =
      rawCapLimit !== undefined && branchCount > rawCapLimit;
    const capLimit = rawCapLimit ?? branchCount;
    const kCap = Math.min(branchCount, capLimit);
    const kEffective = Math.min(kCap, trials.maxBranchesToTry ?? branchCount);
    const budgetLimit = trials.perBranch * kEffective;
    const skipByFlag = trials.skipTrials === true;
    const skipBySize =
      typeof trials.skipTrialsIfBranchesGt === 'number' &&
      branchCount > trials.skipTrialsIfBranchesGt;
    let reason:
      | 'skipTrialsFlag'
      | 'largeOneOf'
      | 'largeAnyOf'
      | 'complexityCap'
      | undefined;
    if (skipByFlag) {
      reason = 'skipTrialsFlag';
    } else if (skipBySize && kind === 'oneOf') {
      reason = 'largeOneOf';
    } else if (skipBySize && kind === 'anyOf') {
      reason = 'largeAnyOf';
    } else if (complexityCapApplied) {
      reason = 'complexityCap';
    }
    const scoreOnly = reason !== undefined;
    let tiebreakRand: number | undefined;
    let chosenIdx = topScoreIndices[0] ?? orderedIndices[0] ?? 0;
    if (scoreOnly || topScoreIndices.length > 1) {
      const rng = new XorShift32(this.seed, canonPath);
      const rand = rng.nextFloat01();
      tiebreakRand = rand;
      const pick = Math.floor(rand * (topScoreIndices.length || 1));
      chosenIdx = topScoreIndices[pick] ?? chosenIdx;
    }
    const topKIndices = ordered.slice(0, kEffective).map((entry) => entry.idx);

    if (complexityCapApplied) {
      const capCode =
        kind === 'oneOf'
          ? DIAGNOSTIC_CODES.COMPLEXITY_CAP_ONEOF
          : DIAGNOSTIC_CODES.COMPLEXITY_CAP_ANYOF;
      this.recordCap(capCode);
      this.addWarn(canonPath, capCode, {
        limit: rawCapLimit,
        observed: branchCount,
      });
    }

    if (reason) {
      let code: DiagnosticCode | undefined;
      switch (reason) {
        case 'skipTrialsFlag':
          code = DIAGNOSTIC_CODES.TRIALS_SKIPPED_SCORE_ONLY;
          break;
        case 'largeOneOf':
          code = DIAGNOSTIC_CODES.TRIALS_SKIPPED_LARGE_ONEOF;
          break;
        case 'largeAnyOf':
          code = DIAGNOSTIC_CODES.TRIALS_SKIPPED_LARGE_ANYOF;
          break;
        case 'complexityCap':
          code = DIAGNOSTIC_CODES.TRIALS_SKIPPED_COMPLEXITY_CAP;
          break;
        default:
          break;
      }
      if (code) {
        this.addWarn(canonPath, code, { reason });
      }
    }

    // memoKey computed above
    const scoresByIndex = Object.fromEntries(
      scored.map((entry) => [String(entry.idx), entry.score])
    );
    const budget: BranchDecisionRecord['budget'] = {
      tried: scoreOnly ? 0 : trials.perBranch * topKIndices.length,
      limit: budgetLimit,
      skipped: scoreOnly,
    };
    if (reason) {
      budget.reason = reason;
    }

    const record: BranchDecisionRecord = {
      canonPath,
      kind,
      chosenBranch: { index: chosenIdx, score: maxScore },
      scoreDetails: {
        orderedIndices,
        topScoreIndices:
          topScoreIndices.length > 0 ? topScoreIndices : [chosenIdx],
        topKIndices,
        tiebreakRand,
        scoresByIndex,
      },
      budget,
      memoKey,
    };
    this.branchDiagnostics.set(canonPath, record);
    this.memoCache?.set(memoKey, record);
    this.memoKeyLog.set(canonPath, memoKey);
  }

  private finalizeDiagnostics(): ComposeDiagnostics | undefined {
    if (this.caps.size > 0) {
      this.diag.caps = Array.from(this.caps.values()).sort();
    }

    if (this.branchDiagnostics.size > 0) {
      const ordered = Array.from(this.branchDiagnostics.values()).sort((a, b) =>
        a.canonPath.localeCompare(b.canonPath)
      );
      this.diag.branchDecisions = ordered;
      const nodes: Record<string, NodeDiagnostics> = {};
      for (const record of ordered) {
        nodes[record.canonPath] = {
          chosenBranch: record.chosenBranch,
          scoreDetails: record.scoreDetails,
          budget: record.budget,
        };
      }
      this.diag.nodes = nodes;
    }

    if (
      !Object.keys(this.diag).some((key) => {
        const value = (this.diag as Record<string, unknown>)[key];
        if (value === undefined) return false;
        if (Array.isArray(value) && value.length === 0) return false;
        if (typeof value === 'object' && value !== null) return true;
        return true;
      })
    ) {
      return undefined;
    }

    if (this.memoKeyLog.size > 0) {
      this.diag.metrics ??= {};
      this.diag.metrics.memoKeys = this.memoKeyLog.size;
    }
    return this.diag;
  }

  private addWarn(
    canonPath: string,
    code: DiagnosticCode,
    details?: unknown
  ): void {
    this.diag.warn ??= [];
    this.diag.warn.push({ code, canonPath, details });
  }

  private addCoverageRegexWarn(
    canonPath: string,
    code: DiagnosticCode,
    details: Record<string, unknown>
  ): void {
    const patternSourceValue = (
      details as {
        patternSource?: unknown;
      }
    ).patternSource;
    const contextValue = (details as { context?: unknown }).context;
    const patternSource =
      typeof patternSourceValue === 'string' ? patternSourceValue : undefined;
    const context = typeof contextValue === 'string' ? contextValue : undefined;
    const key = JSON.stringify({
      canonPath,
      code,
      context,
      patternSource,
    });
    if (this.coverageRegexWarnKeys.has(key)) {
      return;
    }
    this.coverageRegexWarnKeys.add(key);
    this.addWarn(canonPath, code, details);
  }

  private addFatal(
    canonPath: string,
    code: DiagnosticCode,
    details?: unknown
  ): void {
    this.diag.fatal ??= [];
    this.diag.fatal.push({ code, canonPath, details });
  }

  private recordCap(code: DiagnosticCode): void {
    this.caps.add(code);
  }

  private addApproximation(
    canonPath: string,
    reason?:
      | 'coverageUnknown'
      | 'nonAnchoredPattern'
      | 'regexComplexityCap'
      | 'regexCompileError'
      | 'presencePressure'
  ): void {
    const key = JSON.stringify({ reason });
    let reasons = this.approxReasons.get(canonPath);
    if (!reasons) {
      reasons = new Set<string>();
      this.approxReasons.set(canonPath, reasons);
    }
    if (reasons.has(key)) return;
    reasons.add(key);
    const details =
      reason !== undefined
        ? ({ reason } as Record<string, unknown>)
        : undefined;
    this.addWarn(
      canonPath,
      DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX,
      details
    );
  }

  private addUnsatHint(hint: {
    code: DiagnosticCode;
    canonPath: string;
    provable?: boolean;
    reason?: string;
    details?: unknown;
  }): void {
    this.diag.unsatHints ??= [];
    this.diag.unsatHints.push(hint);
  }

  private isPropertyNamesSynthetic(pointer: string): boolean {
    const origin = this.ptrMap.get(pointer);
    return origin !== undefined && origin.includes('/propertyNames');
  }

  private buildApFalseUnsafeDetail(
    issues: PatternIssue[]
  ): Record<string, unknown> {
    if (issues.length === 0) {
      return { sourceKind: 'patternProperties' };
    }

    const distinctIssues = dedupePatternIssues(issues);
    const primary = distinctIssues[0];
    const hasPatternProps = distinctIssues.some(
      (issue) => issue.sourceKind === 'patternProperties'
    );
    const hasSynthetic = distinctIssues.some(
      (issue) => issue.sourceKind === 'propertyNamesSynthetic'
    );
    const detail: Record<string, unknown> = {
      sourceKind:
        hasPatternProps && hasSynthetic
          ? 'patternProperties'
          : (primary?.sourceKind ?? 'patternProperties'),
    };
    if (distinctIssues.length === 1 && primary) {
      detail.patternSource = primary.source;
    }
    return detail;
  }
}

interface BranchStats {
  index: number;
  propertyValues: Map<string, Set<string>>;
  required: Set<string>;
  types: Set<string>;
  anchoredPatternLiterals: Set<string>;
  hasUnsafePatternProperties: boolean;
  hasWideTypeUnion: boolean;
  additionalPropsTrueAndNoProps: boolean;
}

function analyzeBranch(branch: unknown, index: number): BranchStats {
  const propertyValues = new Map<string, Set<string>>();
  const required = new Set<string>();
  const types = new Set<string>();
  const anchoredPatternLiterals = new Set<string>();
  let hasUnsafePatternProperties = false;
  let hasWideTypeUnion = false;
  let additionalPropsTrueAndNoProps = false;

  if (branch && typeof branch === 'object') {
    const record = branch as Record<string, unknown>;
    const props =
      record.properties && typeof record.properties === 'object'
        ? (record.properties as Record<string, unknown>)
        : undefined;
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        const literals = extractLiteralValues(value);
        if (!literals) continue;
        propertyValues.set(key, literals);
      }
    }
    const req = Array.isArray(record.required)
      ? (record.required as string[])
      : [];
    req.forEach((name) => required.add(name));

    if (typeof record.type === 'string') {
      types.add(record.type);
    } else if (Array.isArray(record.type)) {
      (record.type as unknown[])
        .filter((value): value is string => typeof value === 'string')
        .forEach((value) => types.add(value));
      if ((record.type as unknown[]).length >= 3) {
        hasWideTypeUnion = true;
      }
    }

    if (
      record.patternProperties &&
      typeof record.patternProperties === 'object' &&
      Object.keys(record.patternProperties as object).length > 0
    ) {
      for (const patternSource of Object.keys(
        record.patternProperties as Record<string, unknown>
      )) {
        const analysis = analyzeRegexPattern(patternSource);
        if (analysis.compileError) {
          hasUnsafePatternProperties = true;
          continue;
        }
        if (analysis.complexityCapped || !analysis.anchoredSafe) {
          hasUnsafePatternProperties = true;
          continue;
        }
        if (analysis.literalAlternatives) {
          for (const literal of analysis.literalAlternatives) {
            anchoredPatternLiterals.add(literal);
          }
        }
      }
    }

    const additional = record.additionalProperties;
    if (additional === true && (!props || Object.keys(props).length === 0)) {
      additionalPropsTrueAndNoProps = true;
    }
  }

  return {
    index,
    propertyValues,
    required,
    types,
    anchoredPatternLiterals,
    hasUnsafePatternProperties,
    hasWideTypeUnion,
    additionalPropsTrueAndNoProps,
  };
}

function scoreBranch(branch: BranchStats, all: BranchStats[]): number {
  let score = 0;

  for (const [key, values] of branch.propertyValues.entries()) {
    const peers = all.filter((stats) => stats.propertyValues.has(key));
    if (
      peers.length > 1 &&
      peers.every(
        (stats) =>
          stats.index === branch.index ||
          areSetsDisjoint(values, stats.propertyValues.get(key)!)
      )
    ) {
      score = (score + 1000) | 0;
    }
    if (branch.required.has(key)) {
      score = (score + 200) | 0;
    }
  }

  if (branch.types.size === 1) {
    const iterator = branch.types.values().next();
    const onlyType = iterator.done ? undefined : iterator.value;
    const presentElsewhere = onlyType
      ? all.some(
          (stats) => stats.index !== branch.index && stats.types.has(onlyType)
        )
      : false;
    if (onlyType && !presentElsewhere) {
      score = (score + 10) | 0;
    }
  }

  if (branch.anchoredPatternLiterals.size > 0) {
    let disjoint = true;
    for (const peer of all) {
      if (peer.index === branch.index) continue;
      if (
        peer.anchoredPatternLiterals.size > 0 &&
        !areSetsDisjoint(
          branch.anchoredPatternLiterals,
          peer.anchoredPatternLiterals
        )
      ) {
        disjoint = false;
        break;
      }
    }
    if (disjoint) {
      score = (score + 50) | 0;
    }
  }

  if (
    branch.hasUnsafePatternProperties ||
    branch.hasWideTypeUnion ||
    branch.additionalPropsTrueAndNoProps
  ) {
    score = (score - 5) | 0;
  }

  return score | 0;
}

function areSetsDisjoint(a: Set<string>, b: Set<string>): boolean {
  for (const value of a.values()) {
    if (b.has(value)) return false;
  }
  return true;
}

function extractLiteralValues(value: unknown): Set<string> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const schema = value as Record<string, unknown>;
  const literals = new Set<string>();
  if ('const' in schema) {
    literals.add(JSON.stringify(schema.const));
  }
  if (Array.isArray(schema.enum)) {
    for (const entry of schema.enum) {
      literals.add(JSON.stringify(entry));
    }
  }
  return literals.size > 0 ? literals : undefined;
}

type PatternIssueReason =
  | 'nonAnchoredPattern'
  | 'regexComplexityCap'
  | 'regexCompileError';

interface PatternIssue {
  pointer: string;
  source: string;
  sourceKind: CoverageProvenance;
  reason: PatternIssueReason;
}

interface PatternAnalysis {
  anchoredSafe: boolean;
  complexityCapped: boolean;
  compileError?: Error;
  compiled?: RegExp;
  literalAlternatives?: string[];
}

function analyzeRegexPattern(source: string): PatternAnalysis {
  const analysis: PatternAnalysis = {
    anchoredSafe: false,
    complexityCapped: false,
  };

  const policy = analyzeRegex(source, {
    context: 'coverage',
  });

  if (policy.compileError) {
    analysis.compileError = new Error('REGEX_COMPILE_ERROR');
    return analysis;
  }

  analysis.complexityCapped = policy.capped;
  analysis.anchoredSafe = policy.isAnchoredSafe;

  let compiled: RegExp | undefined;
  try {
    compiled = new RegExp(source, 'u');
  } catch (error) {
    analysis.compileError =
      error instanceof Error ? error : new Error(String(error));
    return analysis;
  }

  if (analysis.anchoredSafe) {
    analysis.compiled = compiled;
    const literals = extractExactLiteralAlternatives(source);
    if (literals) {
      analysis.literalAlternatives = literals;
    }
  }

  return analysis;
}

function extractStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      return undefined;
    }
    result.push(entry);
  }
  return result;
}

function hasPresencePressure(schema: Record<string, unknown>): boolean {
  const minProps =
    typeof schema.minProperties === 'number' && schema.minProperties > 0;
  const required =
    Array.isArray(schema.required) && (schema.required as unknown[]).length > 0;
  const dependentRequired =
    schema.dependentRequired &&
    typeof schema.dependentRequired === 'object' &&
    Object.keys(schema.dependentRequired as Record<string, unknown>).length > 0;
  return Boolean(minProps || required || dependentRequired);
}

function buildUnsatDetails(schema: Record<string, unknown>): {
  minProperties?: number;
  required?: string[];
} {
  const details: { minProperties?: number; required?: string[] } = {};
  if (typeof schema.minProperties === 'number') {
    details.minProperties = schema.minProperties;
  }
  if (Array.isArray(schema.required)) {
    details.required = (schema.required as string[]).slice();
  }
  return details;
}

function isArrayLikeSchema(schema: Record<string, unknown>): boolean {
  const typeValue = schema.type;
  if (typeValue === 'array') return true;
  if (Array.isArray(typeValue) && typeValue.includes('array')) return true;
  if (
    'contains' in schema ||
    'minContains' in schema ||
    'maxContains' in schema
  )
    return true;
  if ('items' in schema || 'prefixItems' in schema) return true;
  return false;
}

function intersectStringSets(
  left: Set<string>,
  right: Set<string>
): Set<string> {
  const result = new Set<string>();
  for (const value of left) {
    if (right.has(value)) {
      result.add(value);
    }
  }
  return result;
}

function dedupePatternIssues(issues: PatternIssue[]): PatternIssue[] {
  const seen = new Set<string>();
  const unique: PatternIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.sourceKind}:${issue.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(issue);
  }
  return unique;
}

function patternsOverlap(
  left: CoveragePatternInfo,
  right: CoveragePatternInfo
): boolean {
  if (left.source === right.source) return true;

  const candidates = new Set<string>();
  if (left.literals) {
    for (const literal of left.literals) {
      candidates.add(literal);
    }
  }
  if (right.literals) {
    for (const literal of right.literals) {
      candidates.add(literal);
    }
  }

  if (candidates.size === 0) {
    return false;
  }

  for (const candidate of candidates) {
    if (
      regexMatches(left.regexp, candidate) &&
      regexMatches(right.regexp, candidate)
    ) {
      return true;
    }
  }

  return false;
}

function regexMatches(regexp: RegExp, candidate: string): boolean {
  regexp.lastIndex = 0;
  return regexp.test(candidate);
}

function isObjectLikeSchema(schema: Record<string, unknown>): boolean {
  if (schema.type === 'object') return true;
  if (schema.properties || schema.patternProperties) return true;
  if (schema.required || schema.additionalProperties !== undefined) return true;
  return false;
}

function appendPointer(base: string, token: string): string {
  if (token === '') return base;
  const escaped = token.replace(/~/g, '~0').replace(/\//g, '~1');
  if (base === '') return `/${escaped}`;
  return `${base}/${escaped}`;
}

function sortObjectKeys<T extends Record<string, unknown>>(input: T): T {
  const sorted = Object.keys(input)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = input[key];
      return acc;
    }, {});
  return sorted as T;
}
