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
  [DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING]: {
    kind: 'object',
    required: {
      char: enumSchema(['\u0000', 'a']),
    },
  },
  [DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED]: {
    kind: 'object',
    optional: {
      ref: { kind: 'string' },
      mode: enumSchema(['strict', 'lax']),
      skippedValidation: { kind: 'boolean' },
    },
  },
};
