/* eslint-disable max-lines */
import { DIAGNOSTIC_CODES, type KnownDiagnosticCode } from './codes.js';

export type MiniSchema =
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'null' }
  | { kind: 'any' }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'array'; items: MiniSchema; minItems?: number }
  | {
      kind: 'object';
      required?: Record<string, MiniSchema>;
      optional?: Record<string, MiniSchema>;
    }
  | { kind: 'union'; variants: readonly MiniSchema[] };

export type ObjectMiniSchema = Extract<MiniSchema, { kind: 'object' }>;

const enumSchema = (values: readonly string[]): MiniSchema => ({
  kind: 'enum',
  values,
});

const stringArray: MiniSchema = {
  kind: 'array',
  items: { kind: 'string' },
};

const numberOrNull: MiniSchema = {
  kind: 'union',
  variants: [{ kind: 'number' }, { kind: 'null' }],
};

export const DIAGNOSTIC_DETAIL_SCHEMAS: Partial<
  Record<KnownDiagnosticCode, ObjectMiniSchema>
> = {
  [DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN]: {
    kind: 'object',
    required: {
      sourceKind: enumSchema(['patternProperties', 'propertyNamesSynthetic']),
    },
    optional: {
      patternSource: { kind: 'string' },
    },
  },
  [DIAGNOSTIC_CODES.UNSAT_REQUIRED_AP_FALSE]: {
    kind: 'object',
    required: {
      requiredOut: stringArray,
    },
  },
  [DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE]: {
    kind: 'object',
    optional: {
      minProperties: { kind: 'number' },
      required: stringArray,
    },
  },
  [DIAGNOSTIC_CODES.UNSAT_REQUIRED_VS_PROPERTYNAMES]: {
    kind: 'object',
    required: {
      required: stringArray,
    },
    optional: {
      propertyNames: stringArray,
    },
  },
  [DIAGNOSTIC_CODES.UNSAT_PATTERN_PNAMES]: {
    kind: 'object',
    required: { enumSize: { kind: 'number' } },
    optional: { patterns: stringArray },
  },
  [DIAGNOSTIC_CODES.UNSAT_REQUIRED_PNAMES]: {
    kind: 'object',
    required: { requiredOut: stringArray },
    optional: { enumSample: stringArray },
  },
  [DIAGNOSTIC_CODES.UNSAT_MINPROPS_PNAMES]: {
    kind: 'object',
    required: { minProperties: { kind: 'number' } },
  },
  [DIAGNOSTIC_CODES.UNSAT_MINPROPERTIES_VS_COVERAGE]: {
    kind: 'object',
    required: {
      minProperties: { kind: 'number' },
      coverageSize: { kind: 'number' },
    },
  },
  [DIAGNOSTIC_CODES.CONTAINS_UNSAT_BY_SUM]: {
    kind: 'object',
    required: { sumMin: { kind: 'number' } },
    optional: {
      maxItems: numberOrNull,
      disjointness: enumSchema(['provable', 'overlapUnknown']),
    },
  },
  [DIAGNOSTIC_CODES.TRIALS_SKIPPED_LARGE_ONEOF]: {
    kind: 'object',
    optional: {
      reason: enumSchema(['largeOneOf']),
    },
  },
  [DIAGNOSTIC_CODES.TRIALS_SKIPPED_LARGE_ANYOF]: {
    kind: 'object',
    optional: {
      reason: enumSchema(['largeAnyOf']),
    },
  },
  [DIAGNOSTIC_CODES.TRIALS_SKIPPED_SCORE_ONLY]: {
    kind: 'object',
    optional: {
      reason: enumSchema(['skipTrialsFlag']),
    },
  },
  [DIAGNOSTIC_CODES.TRIALS_SKIPPED_COMPLEXITY_CAP]: {
    kind: 'object',
    optional: {
      reason: enumSchema(['complexityCap']),
    },
  },
  [DIAGNOSTIC_CODES.COMPLEXITY_CAP_PATTERNS]: {
    kind: 'object',
    required: {
      reason: enumSchema(['witnessDomainExhausted', 'candidateBudget']),
    },
    optional: {
      alphabet: { kind: 'string' },
      maxLength: { kind: 'number' },
      tried: { kind: 'number' },
    },
  },
  [DIAGNOSTIC_CODES.NAME_AUTOMATON_COMPLEXITY_CAPPED]: {
    kind: 'object',
    optional: {
      statesCap: { kind: 'number' },
      observedStates: { kind: 'number' },
      productStatesCap: { kind: 'number' },
      observedProductStates: { kind: 'number' },
      maxKEnumeration: { kind: 'number' },
      bfsCandidatesCap: { kind: 'number' },
      tried: { kind: 'number' },
      triedCandidates: { kind: 'number' },
      component: enumSchema(['nfa', 'dfa', 'product', 'bfs']),
    },
  },
  [DIAGNOSTIC_CODES.NAME_AUTOMATON_BFS_APPLIED]: {
    kind: 'object',
    optional: {
      budget: {
        kind: 'object',
        optional: {
          maxMillis: { kind: 'number' },
          maxStates: { kind: 'number' },
          maxQueue: { kind: 'number' },
          maxDepth: { kind: 'number' },
          maxResults: { kind: 'number' },
          beamWidth: { kind: 'number' },
        },
      },
      nodesExpanded: { kind: 'number' },
      queuePeak: { kind: 'number' },
      resultsEmitted: { kind: 'number' },
      elapsedMs: { kind: 'number' },
    },
  },
  [DIAGNOSTIC_CODES.NAME_AUTOMATON_BEAM_APPLIED]: {
    kind: 'object',
    required: {
      beamWidth: { kind: 'number' },
    },
    optional: {
      meanScore: { kind: 'number' },
      topScore: { kind: 'number' },
    },
  },
  [DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED]: {
    kind: 'object',
    required: {
      patternSource: { kind: 'string' },
      context: enumSchema(['coverage', 'rewrite']),
    },
  },
  [DIAGNOSTIC_CODES.REGEX_COMPILE_ERROR]: {
    kind: 'object',
    required: {
      patternSource: { kind: 'string' },
      context: enumSchema(['coverage', 'rewrite']),
    },
  },
  [DIAGNOSTIC_CODES.AJV_FLAGS_MISMATCH]: {
    kind: 'object',
    required: {
      instance: enumSchema(['source', 'planning', 'both']),
      diffs: {
        kind: 'array',
        items: {
          kind: 'object',
          required: {
            flag: { kind: 'string' },
            expected: { kind: 'any' },
            actual: { kind: 'any' },
          },
        },
      },
      ajvMajor: { kind: 'number' },
    },
    optional: {
      sourceFlags: { kind: 'object' },
      planningFlags: { kind: 'object' },
    },
  },
  [DIAGNOSTIC_CODES.DRAFT06_PATTERN_TOLERATED]: {
    kind: 'object',
    required: {
      pattern: { kind: 'string' },
    },
  },
  [DIAGNOSTIC_CODES.RAT_LCM_BITS_CAPPED]: {
    kind: 'object',
    required: {
      limit: { kind: 'number' },
      observed: { kind: 'number' },
    },
  },
  [DIAGNOSTIC_CODES.RAT_DEN_CAPPED]: {
    kind: 'object',
    required: {
      limit: { kind: 'number' },
      observed: { kind: 'number' },
    },
  },
  [DIAGNOSTIC_CODES.RAT_FALLBACK_DECIMAL]: {
    kind: 'object',
    required: { decimalPrecision: { kind: 'number' } },
  },
  [DIAGNOSTIC_CODES.RAT_FALLBACK_FLOAT]: {
    kind: 'object',
    required: { decimalPrecision: { kind: 'number' } },
  },
  [DIAGNOSTIC_CODES.UNSAT_NUMERIC_BOUNDS]: {
    kind: 'object',
    required: {
      reason: enumSchema(['rangeEmpty', 'integerDomainEmpty']),
    },
    optional: {
      type: enumSchema(['integer', 'number']),
      minimum: numberOrNull,
      maximum: numberOrNull,
      exclusiveMinimum: numberOrNull,
      exclusiveMaximum: numberOrNull,
    },
  },
  [DIAGNOSTIC_CODES.SOLVER_TIMEOUT]: {
    kind: 'object',
    required: {
      timeoutMs: { kind: 'number' },
    },
    optional: {
      reason: enumSchema(['timeout', 'unknown']),
      problemKind: { kind: 'string' },
    },
  },
  [DIAGNOSTIC_CODES.CONTAINS_NEED_MIN_GT_MAX]: {
    kind: 'object',
    required: {
      min: { kind: 'number' },
      max: { kind: 'number' },
    },
  },
  [DIAGNOSTIC_CODES.MUSTCOVER_INDEX_MISSING]: {
    kind: 'object',
    optional: { guard: { kind: 'boolean' } },
  },
  [DIAGNOSTIC_CODES.DYNAMIC_SCOPE_BOUNDED]: {
    kind: 'object',
    required: {
      name: { kind: 'string' },
      depth: { kind: 'number' },
    },
  },
  [DIAGNOSTIC_CODES.EVALTRACE_PROP_SOURCE]: {
    kind: 'object',
    required: {
      name: { kind: 'string' },
      via: {
        kind: 'array',
        minItems: 1,
        items: enumSchema([
          'properties',
          'patternProperties',
          'additionalProperties',
          '$ref',
          'allOf',
          'oneOf',
          'anyOf',
          'then',
          'else',
        ]),
      },
    },
  },
  [DIAGNOSTIC_CODES.REPAIR_EVAL_GUARD_FAIL]: {
    kind: 'object',
    required: {
      from: { kind: 'string' },
      reason: enumSchema(['notEvaluated']),
    },
    optional: { to: { kind: 'string' } },
  },
  [DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX]: {
    kind: 'object',
    optional: {
      reason: enumSchema([
        'coverageUnknown',
        'nonAnchoredPattern',
        'regexComplexityCap',
        'regexCompileError',
        'presencePressure',
      ]),
      requiredOut: stringArray,
      enumSize: { kind: 'number' },
      usedAnchoredSubset: { kind: 'boolean' },
      anchoredKind: enumSchema(['strict', 'substring']),
    },
  },
  [DIAGNOSTIC_CODES.CONTAINS_BAG_COMBINED]: {
    kind: 'object',
    optional: {
      bagSize: { kind: 'number' },
      sumMin: { kind: 'number' },
      maxItems: numberOrNull,
    },
  },
  [DIAGNOSTIC_CODES.UNSAT_BUDGET_EXHAUSTED]: {
    kind: 'object',
    optional: {
      cycles: { kind: 'number' },
      lastErrorCount: { kind: 'number' },
    },
  },
  [DIAGNOSTIC_CODES.IF_AWARE_HINT_APPLIED]: {
    kind: 'object',
    optional: {
      strategy: enumSchema(['if-aware-lite']),
      minThenSatisfaction: enumSchema([
        'discriminants-only',
        'required-only',
        'required+bounds',
      ]),
    },
  },
  [DIAGNOSTIC_CODES.IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO]: {
    kind: 'object',
    optional: {
      reason: enumSchema(['noDiscriminant', 'noObservedKeys']),
    },
  },
  [DIAGNOSTIC_CODES.PNAMES_REWRITE_APPLIED]: {
    kind: 'object',
    required: { kind: enumSchema(['enum', 'pattern']) },
    optional: { source: { kind: 'string' } },
  },
  [DIAGNOSTIC_CODES.PNAMES_COMPLEX]: {
    kind: 'object',
    required: { reason: { kind: 'string' } },
    optional: { missingRequired: stringArray },
  },
  [DIAGNOSTIC_CODES.COMPLEXITY_CAP_ONEOF]: {
    kind: 'object',
    required: {
      limit: { kind: 'number' },
      observed: { kind: 'number' },
    },
  },
  [DIAGNOSTIC_CODES.ALLOF_SIMPLIFICATION_SKIPPED_UNEVALUATED]: {
    kind: 'object',
    optional: {
      reason: enumSchema(['unevaluatedInScope']),
    },
  },
  [DIAGNOSTIC_CODES.ANYOF_SIMPLIFICATION_SKIPPED_UNEVALUATED]: {
    kind: 'object',
    optional: {
      reason: enumSchema(['unevaluatedInScope']),
    },
  },
  [DIAGNOSTIC_CODES.ONEOF_SIMPLIFICATION_SKIPPED_UNEVALUATED]: {
    kind: 'object',
    optional: {
      reason: enumSchema(['unevaluatedInScope']),
    },
  },
  [DIAGNOSTIC_CODES.COMPLEXITY_CAP_ANYOF]: {
    kind: 'object',
    required: {
      limit: { kind: 'number' },
      observed: { kind: 'number' },
    },
  },
  [DIAGNOSTIC_CODES.COMPLEXITY_CAP_ENUM]: {
    kind: 'object',
    required: {
      limit: { kind: 'number' },
      observed: { kind: 'number' },
    },
  },
  [DIAGNOSTIC_CODES.COMPLEXITY_CAP_CONTAINS]: {
    kind: 'object',
    required: {
      limit: { kind: 'number' },
      observed: { kind: 'number' },
    },
  },
  [DIAGNOSTIC_CODES.COMPLEXITY_CAP_SCHEMA_SIZE]: {
    kind: 'object',
    required: {
      limit: { kind: 'number' },
      observed: { kind: 'number' },
    },
  },
  [DIAGNOSTIC_CODES.REPAIR_PNAMES_PATTERN_ENUM]: {
    kind: 'object',
    required: { from: { kind: 'string' } },
    optional: {
      to: { kind: 'string' },
      mustCover: { kind: 'boolean' },
      reason: enumSchema([
        'enumRename',
        'deletedNoSafeName',
        'deletedMustCoverRejected',
      ]),
    },
  },
  [DIAGNOSTIC_CODES.REPAIR_RENAME_PREFLIGHT_FAIL]: {
    kind: 'object',
    required: {
      from: { kind: 'string' },
      to: { kind: 'string' },
      reason: enumSchema(['branch', 'dependent']),
    },
  },
  [DIAGNOSTIC_CODES.VALIDATION_KEYWORD_FAILED]: {
    kind: 'object',
    required: {
      keyword: { kind: 'string' },
    },
    optional: {
      message: { kind: 'string' },
      schemaPath: { kind: 'string' },
      instancePath: { kind: 'string' },
      params: { kind: 'any' },
    },
  },
  [DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING]: {
    kind: 'object',
    required: {
      char: enumSchema(['\u0000', 'a']),
    },
  },
  [DIAGNOSTIC_CODES.EXTERNAL_REF_STUBBED]: {
    kind: 'object',
    required: {
      ref: { kind: 'string' },
      stubKind: enumSchema(['emptySchema']),
    },
  },
  [DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED]: {
    kind: 'object',
    optional: {
      ref: { kind: 'string' },
      mode: enumSchema(['strict', 'lax']),
      skippedValidation: { kind: 'boolean' },
      policy: enumSchema(['error', 'warn', 'ignore']),
      failingRefs: {
        kind: 'array',
        items: { kind: 'string' },
      },
    },
  },
  [DIAGNOSTIC_CODES.RESOLVER_STRATEGIES_APPLIED]: {
    kind: 'object',
    required: {
      strategies: {
        kind: 'array',
        items: enumSchema(['local', 'remote', 'schemastore']),
      },
      cacheDir: {
        kind: 'union',
        variants: [{ kind: 'string' }, { kind: 'null' }],
      },
    },
  },
  [DIAGNOSTIC_CODES.RESOLVER_CACHE_HIT]: {
    kind: 'object',
    required: {
      ref: { kind: 'string' },
      contentHash: { kind: 'string' },
    },
  },
  [DIAGNOSTIC_CODES.RESOLVER_CACHE_MISS_FETCHED]: {
    kind: 'object',
    required: {
      ref: { kind: 'string' },
      bytes: { kind: 'number' },
      contentHash: { kind: 'string' },
    },
  },
  [DIAGNOSTIC_CODES.RESOLVER_OFFLINE_UNAVAILABLE]: {
    kind: 'object',
    required: {
      ref: { kind: 'string' },
    },
    optional: {
      reason: { kind: 'string' },
      error: { kind: 'string' },
    },
  },
  [DIAGNOSTIC_CODES.RESOLVER_ADD_SCHEMA_SKIPPED_INCOMPATIBLE_DIALECT]: {
    kind: 'object',
    required: {
      uri: { kind: 'string' },
      docDialect: { kind: 'string' },
      targetDialect: { kind: 'string' },
    },
  },
  [DIAGNOSTIC_CODES.RESOLVER_ADD_SCHEMA_SKIPPED_DUPLICATE_ID]: {
    kind: 'object',
    required: {
      ref: { kind: 'string' },
    },
    optional: {
      id: { kind: 'string' },
      existingRef: { kind: 'string' },
      reason: { kind: 'string' },
      error: { kind: 'string' },
    },
  },
  [DIAGNOSTIC_CODES.SCHEMA_INTERNAL_REF_MISSING]: {
    kind: 'object',
    required: {
      ref: { kind: 'string' },
    },
    optional: {
      mode: enumSchema(['strict', 'lax']),
      failingRefs: {
        kind: 'array',
        items: { kind: 'string' },
      },
    },
  },
  [DIAGNOSTIC_CODES.VALIDATION_COMPILE_ERROR]: {
    kind: 'object',
    required: {
      message: { kind: 'string' },
    },
    optional: {
      reason: { kind: 'string' },
      errorName: { kind: 'string' },
    },
  },
  [DIAGNOSTIC_CODES.TARGET_ENUM_NEGATIVE_LOOKAHEADS]: {
    kind: 'object',
    required: {
      disallowPrefixes: stringArray,
    },
  },
  [DIAGNOSTIC_CODES.TARGET_ENUM_ROUNDROBIN_PATTERNPROPS]: {
    kind: 'object',
    required: {
      patternsHit: { kind: 'number' },
      distinctNames: { kind: 'number' },
    },
  },
};
