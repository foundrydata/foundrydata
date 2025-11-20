/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import {
  DIAGNOSTIC_CODES,
  DIAGNOSTIC_PHASES,
  type DiagnosticCode,
  type DiagnosticPhase,
  type KnownDiagnosticCode,
  getAllowedDiagnosticPhases,
  isKnownDiagnosticCode,
} from './codes.js';
import { DIAGNOSTIC_DETAIL_SCHEMAS, type MiniSchema } from './schemas.js';

export interface DiagnosticEnvelope<Details = unknown> {
  code: DiagnosticCode;
  canonPath: string;
  phase: DiagnosticPhase;
  details?: Details;
  metrics?: DiagnosticMetrics;
  budget?: DiagnosticBudget;
  scoreDetails?: DiagnosticScoreDetails;
}

export interface DiagnosticMetrics {
  [key: string]: number | undefined;
  validationsPerRow?: number;
  repairPassesPerRow?: number;
  repairActionsPerRow?: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
  memoryPeakMB?: number;
}

export interface DiagnosticBudget {
  skipped?: boolean;
  tried?: number;
  limit?: number;
  reason?: 'skipTrialsFlag' | 'largeOneOf' | 'largeAnyOf' | 'complexityCap';
}

export interface DiagnosticScoreDetails {
  [key: string]: number | undefined;
  tiebreakRand?: number;
  exclusivityRand?: number;
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

const validatorCache = new WeakMap<MiniSchema, DetailsValidator>();

function compileMiniSchema(schema: MiniSchema): DetailsValidator {
  const cached = validatorCache.get(schema);
  if (cached) {
    return cached;
  }

  let validator: DetailsValidator;
  switch (schema.kind) {
    case 'string':
      validator = isString;
      break;
    case 'number':
      validator = isNumber;
      break;
    case 'boolean':
      validator = isBoolean;
      break;
    case 'null':
      validator = (value) => value === null;
      break;
    case 'any':
      validator = () => true;
      break;
    case 'enum':
      validator = buildEnumValidator(schema.values);
      break;
    case 'union': {
      const compiled = schema.variants.map((variant) =>
        compileMiniSchema(variant)
      );
      validator = (value) =>
        compiled.some((variantValidator) => variantValidator(value));
      break;
    }
    case 'array': {
      const itemValidator = compileMiniSchema(schema.items);
      const minItems = schema.minItems ?? 0;
      validator = (value) =>
        Array.isArray(value) &&
        value.length >= minItems &&
        value.every((item) => itemValidator(item));
      break;
    }
    case 'object': {
      const required =
        schema.required &&
        Object.fromEntries(
          Object.entries(schema.required).map(([key, childSchema]) => [
            key,
            compileMiniSchema(childSchema),
          ])
        );
      const optional =
        schema.optional &&
        Object.fromEntries(
          Object.entries(schema.optional).map(([key, childSchema]) => [
            key,
            compileMiniSchema(childSchema),
          ])
        );
      validator = buildObjectValidator({ required, optional });
      break;
    }
    default:
      validator = () => false;
  }

  validatorCache.set(schema, validator);
  return validator;
}

const detailValidators: Partial<Record<KnownDiagnosticCode, DetailsValidator>> =
  {};

for (const [code, schema] of Object.entries(DIAGNOSTIC_DETAIL_SCHEMAS)) {
  if (!schema) continue;
  detailValidators[code as KnownDiagnosticCode] = compileMiniSchema(schema);
}

const externalRefValidator =
  detailValidators[DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED];
if (externalRefValidator) {
  detailValidators[DIAGNOSTIC_CODES.EXTERNAL_REF_UNRESOLVED] = (value) => {
    if (!externalRefValidator(value) || !isPlainObject(value)) {
      return false;
    }

    const mode = value.mode;
    if (mode !== undefined && mode !== 'strict' && mode !== 'lax') {
      return false;
    }

    if (value.skippedValidation === true && mode !== 'lax') {
      return false;
    }

    return true;
  };
}

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

  if (!isString(envelope.phase)) {
    throw new Error('Diagnostic envelope requires a string phase');
  }

  const phaseValues = new Set(Object.values(DIAGNOSTIC_PHASES));
  if (!phaseValues.has(envelope.phase)) {
    throw new Error('Diagnostic envelope phase must be a known phase');
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

  if (envelope.metrics !== undefined) {
    assertDiagnosticMetrics(envelope.metrics);
  }

  if (envelope.budget !== undefined) {
    assertDiagnosticBudget(envelope.budget);
  }

  if (envelope.scoreDetails !== undefined) {
    assertDiagnosticScoreDetails(envelope.scoreDetails);
  }
}

export function assertDiagnosticsForPhase(
  phase: DiagnosticPhase,
  diagnostics: readonly DiagnosticEnvelope[]
): void {
  for (const entry of diagnostics) {
    const code = entry.code;
    if (!isKnownDiagnosticCode(code)) {
      continue;
    }

    const allowed = getAllowedDiagnosticPhases(code);
    if (allowed && !allowed.has(phase)) {
      throw new Error(
        `Diagnostic ${code} is not allowed in the ${phase} phase`
      );
    }

    if (
      entry.details &&
      isPlainObject(entry.details) &&
      (code === DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED ||
        code === DIAGNOSTIC_CODES.REGEX_COMPILE_ERROR)
    ) {
      const context = entry.details.context;
      if (phase === DIAGNOSTIC_PHASES.COMPOSE) {
        const isCoverageContext = context === 'coverage';
        // eslint-disable-next-line max-depth
        if (
          code === DIAGNOSTIC_CODES.REGEX_COMPLEXITY_CAPPED &&
          !isCoverageContext
        ) {
          throw new Error(
            `${code} must set details.context="coverage" during compose phase`
          );
        }
        // eslint-disable-next-line max-depth
        if (
          code === DIAGNOSTIC_CODES.REGEX_COMPILE_ERROR &&
          context !== 'coverage' &&
          context !== 'preflight'
        ) {
          throw new Error(
            `${code} must set details.context="coverage" or "preflight" during compose phase`
          );
        }
      }

      if (phase === DIAGNOSTIC_PHASES.NORMALIZE && context !== 'rewrite') {
        throw new Error(
          `${code} must set details.context="rewrite" during normalize phase`
        );
      }
    }
  }
}

function assertDiagnosticMetrics(metrics: unknown): void {
  if (!isPlainObject(metrics)) {
    throw new Error('Diagnostic metrics must be an object of numeric values');
  }

  for (const [key, value] of Object.entries(metrics)) {
    if (!isString(key)) {
      throw new Error('Diagnostic metrics keys must be strings');
    }
    if (!isNumber(value)) {
      throw new Error(
        `Diagnostic metrics value for ${key} must be a finite number`
      );
    }
  }
}

function assertDiagnosticBudget(budget: unknown): void {
  if (!isPlainObject(budget)) {
    throw new Error('Diagnostic budget must be an object');
  }

  if (
    'skipped' in budget &&
    budget.skipped !== undefined &&
    !isBoolean(budget.skipped)
  ) {
    throw new Error('Diagnostic budget.skipped must be a boolean');
  }

  if (
    'tried' in budget &&
    budget.tried !== undefined &&
    !isNumber(budget.tried)
  ) {
    throw new Error('Diagnostic budget.tried must be a finite number');
  }

  if (
    'limit' in budget &&
    budget.limit !== undefined &&
    !isNumber(budget.limit)
  ) {
    throw new Error('Diagnostic budget.limit must be a finite number');
  }

  if ('reason' in budget && budget.reason !== undefined) {
    const allowedReasons = new Set([
      'skipTrialsFlag',
      'largeOneOf',
      'largeAnyOf',
      'complexityCap',
    ]);
    if (
      !isString(budget.reason) ||
      !allowedReasons.has(budget.reason as string)
    ) {
      throw new Error('Diagnostic budget.reason must be a known budget reason');
    }
  }
}

function assertDiagnosticScoreDetails(details: unknown): void {
  if (!isPlainObject(details)) {
    throw new Error('Diagnostic scoreDetails must be an object');
  }

  for (const [key, value] of Object.entries(details)) {
    if (!isString(key)) {
      throw new Error('Diagnostic scoreDetails keys must be strings');
    }
    if (value !== undefined && !isNumber(value)) {
      throw new Error(
        `Diagnostic scoreDetails value for ${key} must be a finite number`
      );
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
