import {
  DIAGNOSTIC_CODES,
  type DiagnosticCode,
  type KnownDiagnosticCode,
  isKnownDiagnosticCode,
} from './codes';

export interface DiagnosticEnvelope<Details = unknown> {
  code: DiagnosticCode;
  canonPath: string;
  details?: Details;
}

const FORBIDDEN_DETAIL_KEYS = new Set(['canonPath', 'canonPtr']);

type DetailsValidator = (details: unknown) => boolean;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function buildEnumValidator(values: readonly string[]): DetailsValidator {
  return (input) => isString(input) && values.includes(input);
}

function buildObjectValidator(shape: {
  required?: Record<string, (value: unknown) => boolean>;
  optional?: Record<string, (value: unknown) => boolean>;
}): DetailsValidator {
  return (value) => {
    if (!isPlainObject(value)) {
      return false;
    }

    const requiredEntries = Object.entries(shape.required ?? {});
    for (const [key, validator] of requiredEntries) {
      if (!(key in value) || !validator(value[key])) {
        return false;
      }
    }

    const optionalEntries = Object.entries(shape.optional ?? {});
    for (const [key, validator] of optionalEntries) {
      if (key in value && !validator(value[key])) {
        return false;
      }
    }

    return true;
  };
}

const apFalseSourceKindValidator = buildEnumValidator([
  'patternProperties',
  'propertyNamesSynthetic',
]);
const regexContextValidator = buildEnumValidator(['coverage', 'rewrite']);
const dynamicScopeViaValidator = buildEnumValidator([
  'properties',
  'patternProperties',
  'additionalProperties',
  '$ref',
  'allOf',
  'oneOf',
  'anyOf',
  'then',
  'else',
]);
const ifAwareStrategyValidator = buildEnumValidator(['if-aware-lite']);
const ifAwareSatisfactionValidator = buildEnumValidator([
  'discriminants-only',
  'required-only',
  'required+bounds',
]);
const ifAwareSkippedReasonValidator = buildEnumValidator([
  'noDiscriminant',
  'noObservedKeys',
]);
const apFalseIntersectionReasonValidator = buildEnumValidator([
  'coverageUnknown',
  'nonAnchoredPattern',
  'regexComplexityCap',
  'regexCompileError',
  'presencePressure',
]);
const trialsLargeOneOfReasonValidator = buildEnumValidator(['largeOneOf']);
const trialsLargeAnyOfReasonValidator = buildEnumValidator(['largeAnyOf']);
const trialsScoreOnlyReasonValidator = buildEnumValidator(['skipTrialsFlag']);
const trialsComplexityCapReasonValidator = buildEnumValidator([
  'complexityCap',
]);
const exclusivityTweakCharValidator = buildEnumValidator(['\u0000', 'a']);
const pnRewriteKindValidator = buildEnumValidator(['enum', 'pattern']);

const detailValidators: Partial<Record<KnownDiagnosticCode, DetailsValidator>> =
  {
    [DIAGNOSTIC_CODES.AP_FALSE_UNSAFE_PATTERN]: buildObjectValidator({
      required: { sourceKind: apFalseSourceKindValidator },
      optional: { patternSource: isString },
    }),
    [DIAGNOSTIC_CODES.UNSAT_REQUIRED_AP_FALSE]: buildObjectValidator({
      required: { requiredOut: isStringArray },
    }),
    [DIAGNOSTIC_CODES.UNSAT_AP_FALSE_EMPTY_COVERAGE]: buildObjectValidator({
      optional: { minProperties: isNumber, required: isStringArray },
    }),
    [DIAGNOSTIC_CODES.UNSAT_PATTERN_PNAMES]: buildObjectValidator({
      required: { enumSize: isNumber },
      optional: { patterns: isStringArray },
    }),
    [DIAGNOSTIC_CODES.UNSAT_REQUIRED_PNAMES]: buildObjectValidator({
      required: { requiredOut: isStringArray },
      optional: { enumSample: isStringArray },
    }),
    [DIAGNOSTIC_CODES.UNSAT_MINPROPS_PNAMES]: buildObjectValidator({
      required: { minProperties: isNumber },
    }),
    [DIAGNOSTIC_CODES.CONTAINS_UNSAT_BY_SUM]: buildObjectValidator({
      required: { sumMin: isNumber },
      optional: {
        maxItems: (value) => value === null || isNumber(value),
        disjointness: buildEnumValidator(['provable', 'overlapUnknown']),
      },
    }),
    [DIAGNOSTIC_CODES.TRIALS_SKIPPED_LARGE_ONEOF]: buildObjectValidator({
      optional: { reason: trialsLargeOneOfReasonValidator },
    }),
    [DIAGNOSTIC_CODES.TRIALS_SKIPPED_LARGE_ANYOF]: buildObjectValidator({
      optional: { reason: trialsLargeAnyOfReasonValidator },
    }),
    [DIAGNOSTIC_CODES.TRIALS_SKIPPED_SCORE_ONLY]: buildObjectValidator({
      optional: { reason: trialsScoreOnlyReasonValidator },
    }),
    [DIAGNOSTIC_CODES.TRIALS_SKIPPED_COMPLEXITY_CAP]: buildObjectValidator({
      optional: { reason: trialsComplexityCapReasonValidator },
    }),
    [DIAGNOSTIC_CODES.COMPLEXITY_CAP_PATTERNS]: buildObjectValidator({
      required: {
        reason: buildEnumValidator([
          'witnessDomainExhausted',
          'candidateBudget',
        ]),
      },
      optional: {
        alphabet: isString,
        maxLength: isNumber,
        tried: isNumber,
      },
    }),
    [DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED]: buildObjectValidator({
      required: { patternSource: isString, context: regexContextValidator },
    }),
    [DIAGNOSTIC_CODES.REGEX_COMPILE_ERROR]: buildObjectValidator({
      required: { patternSource: isString, context: regexContextValidator },
    }),
    [DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED]: (value) => {
      if (!isPlainObject(value)) {
        return false;
      }

      const mode = value.mode;
      if (mode !== undefined && mode !== 'strict' && mode !== 'lax') {
        return false;
      }

      if (value.skippedValidation === true && mode !== 'lax') {
        return false;
      }

      if (value.ref !== undefined && !isString(value.ref)) {
        return false;
      }

      if (
        value.skippedValidation !== undefined &&
        !isBoolean(value.skippedValidation)
      ) {
        return false;
      }

      return true;
    },
    [DIAGNOSTIC_CODES.AJV_FLAGS_MISMATCH]: buildObjectValidator({
      required: {
        instance: buildEnumValidator(['source', 'planning', 'both']),
        diffs: (value) =>
          Array.isArray(value) &&
          value.every(
            (entry) =>
              isPlainObject(entry) &&
              'flag' in entry &&
              'expected' in entry &&
              'actual' in entry &&
              isString(entry.flag)
          ),
        ajvMajor: isNumber,
      },
      optional: { sourceFlags: isPlainObject, planningFlags: isPlainObject },
    }),
    [DIAGNOSTIC_CODES.RAT_LCM_BITS_CAPPED]: buildObjectValidator({
      required: { limit: isNumber, observed: isNumber },
    }),
    [DIAGNOSTIC_CODES.RAT_DEN_CAPPED]: buildObjectValidator({
      required: { limit: isNumber, observed: isNumber },
    }),
    [DIAGNOSTIC_CODES.RAT_FALLBACK_DECIMAL]: buildObjectValidator({
      required: { decimalPrecision: isNumber },
    }),
    [DIAGNOSTIC_CODES.RAT_FALLBACK_FLOAT]: buildObjectValidator({
      required: { decimalPrecision: isNumber },
    }),
    [DIAGNOSTIC_CODES.CONTAINS_NEED_MIN_GT_MAX]: buildObjectValidator({
      required: { min: isNumber, max: isNumber },
    }),
    [DIAGNOSTIC_CODES.MUSTCOVER_INDEX_MISSING]: buildObjectValidator({
      optional: { guard: isBoolean },
    }),
    [DIAGNOSTIC_CODES.DYNAMIC_SCOPE_BOUNDED]: buildObjectValidator({
      required: { name: isString, depth: isNumber },
    }),
    [DIAGNOSTIC_CODES.EVALTRACE_PROP_SOURCE]: buildObjectValidator({
      required: {
        name: isString,
        via: (value) =>
          Array.isArray(value) &&
          value.length > 0 &&
          value.every(dynamicScopeViaValidator),
      },
    }),
    [DIAGNOSTIC_CODES.REPAIR_EVAL_GUARD_FAIL]: buildObjectValidator({
      required: {
        from: isString,
        reason: buildEnumValidator(['notEvaluated']),
      },
      optional: { to: isString },
    }),
    [DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX]: buildObjectValidator({
      optional: {
        reason: apFalseIntersectionReasonValidator,
        requiredOut: isStringArray,
        enumSize: isNumber,
      },
    }),
    [DIAGNOSTIC_CODES.CONTAINS_BAG_COMBINED]: buildObjectValidator({
      optional: {
        bagSize: isNumber,
        sumMin: isNumber,
        maxItems: (value) => value === null || isNumber(value),
      },
    }),
    [DIAGNOSTIC_CODES.UNSAT_BUDGET_EXHAUSTED]: buildObjectValidator({
      optional: { cycles: isNumber, lastErrorCount: isNumber },
    }),
    [DIAGNOSTIC_CODES.IF_AWARE_HINT_APPLIED]: buildObjectValidator({
      optional: {
        strategy: ifAwareStrategyValidator,
        minThenSatisfaction: ifAwareSatisfactionValidator,
      },
    }),
    [DIAGNOSTIC_CODES.IF_AWARE_HINT_SKIPPED_INSUFFICIENT_INFO]:
      buildObjectValidator({
        optional: { reason: ifAwareSkippedReasonValidator },
      }),
    [DIAGNOSTIC_CODES.PNAMES_REWRITE_APPLIED]: buildObjectValidator({
      required: { kind: pnRewriteKindValidator },
      optional: { source: isString },
    }),
    [DIAGNOSTIC_CODES.PNAMES_COMPLEX]: buildObjectValidator({
      required: { reason: isString },
      optional: { missingRequired: isStringArray },
    }),
    [DIAGNOSTIC_CODES.COMPLEXITY_CAP_ONEOF]: buildObjectValidator({
      required: { limit: isNumber, observed: isNumber },
    }),
    [DIAGNOSTIC_CODES.ALLOF_SIMPLIFICATION_SKIPPED_UNEVALUATED]:
      buildObjectValidator({
        optional: { reason: buildEnumValidator(['unevaluatedInScope']) },
      }),
    [DIAGNOSTIC_CODES.ANYOF_SIMPLIFICATION_SKIPPED_UNEVALUATED]:
      buildObjectValidator({
        optional: { reason: buildEnumValidator(['unevaluatedInScope']) },
      }),
    [DIAGNOSTIC_CODES.ONEOF_SIMPLIFICATION_SKIPPED_UNEVALUATED]:
      buildObjectValidator({
        optional: { reason: buildEnumValidator(['unevaluatedInScope']) },
      }),
    [DIAGNOSTIC_CODES.COMPLEXITY_CAP_ANYOF]: buildObjectValidator({
      required: { limit: isNumber, observed: isNumber },
    }),
    [DIAGNOSTIC_CODES.COMPLEXITY_CAP_ENUM]: buildObjectValidator({
      required: { limit: isNumber, observed: isNumber },
    }),
    [DIAGNOSTIC_CODES.COMPLEXITY_CAP_CONTAINS]: buildObjectValidator({
      required: { limit: isNumber, observed: isNumber },
    }),
    [DIAGNOSTIC_CODES.COMPLEXITY_CAP_SCHEMA_SIZE]: buildObjectValidator({
      required: { limit: isNumber, observed: isNumber },
    }),
    [DIAGNOSTIC_CODES.REPAIR_PNAMES_PATTERN_ENUM]: buildObjectValidator({
      required: { from: isString },
      optional: { to: isString, mustCover: isBoolean },
    }),
    [DIAGNOSTIC_CODES.REPAIR_RENAME_PREFLIGHT_FAIL]: buildObjectValidator({
      required: {
        from: isString,
        to: isString,
        reason: buildEnumValidator(['branch', 'dependent']),
      },
    }),
    [DIAGNOSTIC_CODES.EXCLUSIVITY_TWEAK_STRING]: buildObjectValidator({
      required: { char: exclusivityTweakCharValidator },
    }),
  };

export function assertDiagnosticEnvelope(envelope: DiagnosticEnvelope): void {
  if (!envelope || typeof envelope !== 'object') {
    throw new Error('Diagnostic envelope must be an object');
  }

  if (!isString(envelope.code)) {
    throw new Error('Diagnostic envelope requires a string code');
  }

  if (!isString(envelope.canonPath)) {
    throw new Error('Diagnostic envelope requires a string canonPath');
  }

  if (envelope.details !== undefined) {
    assertNoForbiddenKeys(envelope.details);
    if (isString(envelope.code) && isKnownDiagnosticCode(envelope.code)) {
      const validator = detailValidators[envelope.code];
      if (validator && !validator(envelope.details)) {
        throw new Error(
          `Diagnostic details for ${envelope.code} do not match the expected shape`
        );
      }
    }
  }
}

function assertNoForbiddenKeys(details: unknown): void {
  if (!isPlainObject(details)) {
    if (Array.isArray(details)) {
      for (const entry of details) {
        assertNoForbiddenKeys(entry);
      }
    }
    return;
  }

  for (const [key, value] of Object.entries(details)) {
    if (FORBIDDEN_DETAIL_KEYS.has(key)) {
      throw new Error(`Diagnostic details must not contain a ${key} property`);
    }

    assertNoForbiddenKeys(value);
  }
}
