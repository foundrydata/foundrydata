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
} from './codes';
import { DIAGNOSTIC_DETAIL_SCHEMAS, type MiniSchema } from './schemas';

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
      if (phase === DIAGNOSTIC_PHASES.COMPOSE && context !== 'coverage') {
        throw new Error(
          `${code} must set details.context="coverage" during compose phase`
        );
      }

      if (phase === DIAGNOSTIC_PHASES.NORMALIZE && context !== 'rewrite') {
        throw new Error(
          `${code} must set details.context="rewrite" during normalize phase`
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
