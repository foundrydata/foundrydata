/* eslint-disable max-depth */
/* eslint-disable max-lines-per-function */
/* eslint-disable max-lines */
/* eslint-disable complexity */
import { DIAGNOSTIC_CODES, type DiagnosticCode } from '../diag/codes';
import { createPlanOptionsSubKey, type CacheKeyContext } from '../util/cache';
import { XorShift32 } from '../util/rng';
import {
  resolveOptions,
  type PlanOptions,
  type ResolvedOptions,
} from '../types/options';

type CoverageProvenance =
  | 'properties'
  | 'patternProperties'
  | 'propertyNamesSynthetic';

export interface CoverageEntry {
  has: (name: string) => boolean;
  enumerate?: () => string[];
  provenance?: CoverageProvenance[];
}

export type CoverageIndex = Map<string, CoverageEntry>;

export interface ContainsNeed {
  schema: unknown;
  min?: number;
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
   * Optional resolved cache context (stable hash, flags). When supplied, the
   * `planOptionsSubKey` component will be reused instead of recomputing.
   */
  cacheKeyContext?: CacheKeyContext;
  planOptions?: Partial<PlanOptions>;
}

export interface ComposeResult {
  schema: unknown;
  containsBag?: ContainsNeed[];
  coverageIndex: CoverageIndex;
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

export function compose(
  schema: unknown,
  options?: ComposeOptions
): ComposeResult {
  const engine = new CompositionEngine(schema, options);
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

class CompositionEngine {
  private readonly schema: unknown;
  private readonly options: ComposeOptions;
  private readonly coverageIndex: CoverageIndex = new Map();
  private readonly diag: ComposeDiagnostics = {};
  private readonly seed: number;
  private readonly resolvedOptions: ResolvedOptions;
  private readonly planOptionsSnapshot: PlanOptions;
  private readonly memoKeyLog = new Map<string, string>();
  private readonly caps = new Set<string>();
  private readonly approxReasons = new Map<string, Set<string>>();
  private readonly mode: 'strict' | 'lax';
  private readonly branchDiagnostics = new Map<string, BranchDecisionRecord>();

  constructor(schema: unknown, options?: ComposeOptions) {
    this.schema = schema;
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
  }

  run(): ComposeResult {
    this.visitNode(this.schema, '');
    const diag = this.finalizeDiagnostics();
    return {
      schema: this.schema,
      containsBag: undefined,
      coverageIndex: this.coverageIndex,
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
    if (isObjectLikeSchema(schema)) {
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

  private registerCoverageEntry(
    schema: Record<string, unknown>,
    canonPath: string
  ): void {
    const mustCover = schema.additionalProperties === false;

    if (!mustCover) {
      this.coverageIndex.set(canonPath, {
        has: () => true,
        provenance: [],
      });
      return;
    }

    const namedProperties = new Set<string>();
    if (schema.properties && typeof schema.properties === 'object') {
      for (const key of Object.keys(
        schema.properties as Record<string, unknown>
      )) {
        namedProperties.add(key);
      }
    }

    const patternCollection = this.collectPatternRecognizers(schema, canonPath);
    const recognizers = patternCollection.recognizers;
    const unsafePatterns = patternCollection.issues;

    const patternMatchers = recognizers.map((entry) => entry.regexp);
    const presencePressure = hasPresencePressure(schema);
    const hasSafeCoverage =
      namedProperties.size > 0 || patternMatchers.length > 0;

    if (!hasSafeCoverage && presencePressure) {
      this.addUnsatHint({
        code: DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE,
        canonPath,
        provable: false,
        reason: 'coverageUnknown',
        details: buildUnsatDetails(schema),
      });
    }

    if (!hasSafeCoverage && presencePressure && unsafePatterns.length > 0) {
      for (const issue of unsafePatterns) {
        const details: Record<string, unknown> = {
          sourceKind: issue.sourceKind,
          patternSource: issue.source,
        };
        if (this.mode === 'strict') {
          this.addFatal(
            canonPath,
            DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN,
            details
          );
        } else {
          this.addWarn(
            canonPath,
            DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN,
            details
          );
        }
      }
    } else if (!hasSafeCoverage && presencePressure) {
      this.addApproximation(canonPath, 'presencePressure');
    }

    const provenance = new Set<CoverageProvenance>();
    if (namedProperties.size > 0) {
      provenance.add('properties');
    }
    if (patternMatchers.length > 0) {
      provenance.add('patternProperties');
    }

    const enumerationCandidates = new Set<string>(namedProperties);
    let hasInfinitePattern = false;
    for (const recognizer of recognizers) {
      if (recognizer.literals) {
        for (const literal of recognizer.literals) {
          enumerationCandidates.add(literal);
        }
      } else {
        hasInfinitePattern = true;
      }
    }

    const coverageEntry: CoverageEntry = {
      has: createCoveragePredicate(namedProperties, patternMatchers),
      provenance: Array.from(provenance.values()).sort(),
    };

    if (!hasInfinitePattern) {
      const limit = this.resolvedOptions.complexity.maxEnumCardinality;
      const observed = enumerationCandidates.size;
      if (observed > limit) {
        this.recordCap(DIAGNOSTIC_CODES.COMPLEXITY_CAP_ENUM);
        this.addWarn(canonPath, DIAGNOSTIC_CODES.COMPLEXITY_CAP_ENUM, {
          limit,
          observed,
        });
      } else {
        const sorted = Array.from(enumerationCandidates.values()).sort(
          (a, b) => (a < b ? -1 : a > b ? 1 : 0)
        );
        const snapshot = sorted.slice();
        coverageEntry.enumerate = () => snapshot.slice();
      }
    }

    this.coverageIndex.set(canonPath, coverageEntry);
  }

  private handleBranch(
    kind: 'anyOf' | 'oneOf',
    branches: unknown[],
    canonPath: string
  ): void {
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

    this.branchDiagnostics.set(canonPath, {
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
    });
    this.memoKeyLog.set(canonPath, memoKey);
  }

  private finalizeDiagnostics(): ComposeDiagnostics | undefined {
    if (this.caps.size > 0) {
      this.diag.caps = Array.from(this.caps.values()).sort();
    }

    if (this.branchDiagnostics.size > 0) {
      this.diag.branchDecisions = Array.from(
        this.branchDiagnostics.values()
      ).sort((a, b) => a.canonPath.localeCompare(b.canonPath));
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

  private collectPatternRecognizers(
    schema: Record<string, unknown>,
    canonPath: string
  ): PatternCollectionResult {
    const recognizers: PatternRecognizer[] = [];
    const issues: PatternIssue[] = [];

    const patternProps = schema.patternProperties;
    if (patternProps && typeof patternProps === 'object') {
      const patternBasePtr = appendPointer(canonPath, 'patternProperties');
      for (const [patternSource] of Object.entries(
        patternProps as Record<string, unknown>
      )) {
        const patternPtr = appendPointer(patternBasePtr, patternSource);
        const analysis = analyzeRegexPattern(patternSource);

        if (analysis.compileError) {
          this.addWarn(patternPtr, DIAGNOSTIC_CODES.REGEX_COMPILE_ERROR, {
            patternSource,
            context: 'coverage',
          });
          this.addApproximation(canonPath, 'regexCompileError');
          issues.push({
            pointer: canonPath,
            source: patternSource,
            sourceKind: 'patternProperties',
            reason: 'regexCompileError',
          });
          continue;
        }

        if (analysis.complexityCapped) {
          this.addWarn(patternPtr, DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED, {
            patternSource,
            context: 'coverage',
          });
          this.addApproximation(canonPath, 'regexComplexityCap');
          issues.push({
            pointer: canonPath,
            source: patternSource,
            sourceKind: 'patternProperties',
            reason: 'regexComplexityCap',
          });
          continue;
        }

        if (!analysis.anchoredSafe || !analysis.compiled) {
          this.addApproximation(canonPath, 'nonAnchoredPattern');
          issues.push({
            pointer: canonPath,
            source: patternSource,
            sourceKind: 'patternProperties',
            reason: 'nonAnchoredPattern',
          });
          continue;
        }

        recognizers.push({
          source: patternSource,
          regexp: analysis.compiled,
          pointer: patternPtr,
          sourceKind: 'patternProperties',
          literals: analysis.literalAlternatives,
        });
      }
    }

    return { recognizers, issues };
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
}

interface BranchStats {
  index: number;
  propertyValues: Map<string, Set<string>>;
  required: Set<string>;
  types: Set<string>;
  hasPatternProperties: boolean;
  hasWideTypeUnion: boolean;
  additionalPropsTrueAndNoProps: boolean;
}

function analyzeBranch(branch: unknown, index: number): BranchStats {
  const propertyValues = new Map<string, Set<string>>();
  const required = new Set<string>();
  const types = new Set<string>();
  let hasPatternProperties = false;
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
      hasPatternProperties = true;
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
    hasPatternProperties,
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

  if (
    branch.hasPatternProperties ||
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

interface PatternRecognizer {
  source: string;
  regexp: RegExp;
  pointer: string;
  sourceKind: CoverageProvenance;
  literals?: string[];
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

interface PatternCollectionResult {
  recognizers: PatternRecognizer[];
  issues: PatternIssue[];
}

interface PatternAnalysis {
  anchoredSafe: boolean;
  complexityCapped: boolean;
  compileError?: Error;
  compiled?: RegExp;
  literalAlternatives?: string[];
}

interface RegexScanResult {
  anchoredStart: boolean;
  anchoredEnd: boolean;
  hasLookAround: boolean;
  hasBackReference: boolean;
  complexityCapped: boolean;
}

function createCoveragePredicate(
  properties: Set<string>,
  matchers: RegExp[]
): (name: string) => boolean {
  const propertySet = new Set(properties);
  const regexes = matchers.slice();
  return (name: string) => {
    if (propertySet.has(name)) return true;
    for (const regex of regexes) {
      if (regex.test(name)) return true;
    }
    return false;
  };
}

function analyzeRegexPattern(source: string): PatternAnalysis {
  const analysis: PatternAnalysis = {
    anchoredSafe: false,
    complexityCapped: false,
  };

  let compiled: RegExp | undefined;
  try {
    compiled = new RegExp(source, 'u');
  } catch (error) {
    analysis.compileError =
      error instanceof Error ? error : new Error(String(error));
    return analysis;
  }

  const scan = scanRegexSource(source);
  analysis.complexityCapped = scan.complexityCapped;
  analysis.anchoredSafe =
    scan.anchoredStart &&
    scan.anchoredEnd &&
    !scan.hasLookAround &&
    !scan.hasBackReference &&
    !scan.complexityCapped;

  if (analysis.anchoredSafe) {
    analysis.compiled = compiled;
    const literals = extractExactLiteralAlternatives(source);
    if (literals) {
      analysis.literalAlternatives = literals;
    }
  }

  return analysis;
}

function scanRegexSource(source: string): RegexScanResult {
  if (source.length > 4096) {
    return {
      anchoredStart: source.startsWith('^'),
      anchoredEnd: source.endsWith('$'),
      hasLookAround: false,
      hasBackReference: false,
      complexityCapped: true,
    };
  }

  let anchoredStart = false;
  let anchoredEnd = false;
  let hasLookAround = false;
  let hasBackReference = false;
  let complexityCapped = false;

  const stack: number[] = [];
  let inClass = false;
  let escapeCount = 0;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const unescaped = escapeCount % 2 === 0;

    if (unescaped && !inClass && ch === '^' && i === 0) {
      anchoredStart = true;
    }
    if (unescaped && !inClass && ch === '$' && i === source.length - 1) {
      anchoredEnd = true;
    }

    if (unescaped && !inClass && ch === '[') {
      inClass = true;
    } else if (unescaped && inClass && ch === ']') {
      inClass = false;
    }

    if (unescaped && !inClass && ch === '(') {
      if (source[i + 1] === '?') {
        const lookAhead2 = source.slice(i + 1, i + 3);
        const lookAhead4 = source.slice(i + 1, i + 5);
        if (
          lookAhead2 === '?=' ||
          lookAhead2 === '?!' ||
          lookAhead4 === '?<=' ||
          lookAhead4 === '?<!'
        ) {
          hasLookAround = true;
        }
      }
      stack.push(i);
    } else if (unescaped && !inClass && ch === ')') {
      if (stack.length > 0) {
        stack.pop();
        if (!complexityCapped) {
          const k = i + 1;
          if (k < source.length) {
            const next = source.charAt(k);
            if (next === '*' || next === '+' || next === '?') {
              complexityCapped = true;
            } else if (next === '{') {
              let j = k + 1;
              while (j < source.length) {
                const digitChar = source.charAt(j);
                if (!/[0-9,]/.test(digitChar)) {
                  break;
                }
                j += 1;
              }
              if (j > k + 1 && j < source.length && source.charAt(j) === '}') {
                complexityCapped = true;
              }
            }
          }
        }
      }
    }

    if (unescaped && !inClass && ch === '\\') {
      const next = source[i + 1];
      if (next !== undefined) {
        if (/[1-9]/.test(next)) {
          hasBackReference = true;
        } else if (next === 'k' && source[i + 2] === '<') {
          hasBackReference = true;
        }
      }
    }

    if (ch === '\\') {
      escapeCount += 1;
    } else {
      escapeCount = 0;
    }
  }

  return {
    anchoredStart,
    anchoredEnd,
    hasLookAround,
    hasBackReference,
    complexityCapped,
  };
}

function extractExactLiteralAlternatives(source: string): string[] | undefined {
  if (!source.startsWith('^') || !source.endsWith('$')) {
    return undefined;
  }

  const body = source.slice(1, -1);
  if (body.startsWith('(?:') && body.endsWith(')')) {
    const inner = body.slice(3, -1);
    const parts = splitAlternatives(inner);
    if (!parts) return undefined;
    const literals: string[] = [];
    for (const part of parts) {
      const literal = decodeLiteral(part);
      if (literal === undefined) return undefined;
      literals.push(literal);
    }
    return literals;
  }

  const literal = decodeLiteral(body);
  return literal === undefined ? undefined : [literal];
}

function splitAlternatives(pattern: string): string[] | undefined {
  const parts: string[] = [];
  let current = '';
  let escaping = false;

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern.charAt(i);
    if (escaping) {
      current += `\\${ch}`;
      escaping = false;
      continue;
    }

    if (ch === '\\') {
      escaping = true;
      continue;
    }

    if (ch === '|') {
      parts.push(current);
      current = '';
      continue;
    }

    if ('()[]{}'.includes(ch)) {
      return undefined;
    }

    current += ch;
  }

  if (escaping) return undefined;
  parts.push(current);
  return parts;
}

function decodeLiteral(pattern: string): string | undefined {
  let result = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern.charAt(i);
    if (ch === '\\') {
      i += 1;
      if (i >= pattern.length) return undefined;
      result += pattern.charAt(i);
      continue;
    }
    if ('.*+?()[]{}|^$'.includes(ch)) {
      return undefined;
    }
    result += ch;
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
