import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import addFormats2019 from 'ajv-formats-draft2019';

export type JsonSchemaDraft = 'draft-07' | '2019-09' | '2020-12';

const ajvInstances = new Map<JsonSchemaDraft, Ajv>();
const validatorCache = new WeakMap<object, (data: unknown) => boolean>();

export function createAjv(draft: JsonSchemaDraft = 'draft-07'): Ajv {
  if (ajvInstances.has(draft)) {
    return ajvInstances.get(draft)!;
  }

  const ajv = new Ajv({
    strict: true,
    strictTuples: true,
    strictTypes: true,
    allowUnionTypes: false,
    validateFormats: true,
    allErrors: true,
    verbose: false,
  });

  // Add format support based on draft
  if (draft === 'draft-07') {
    addFormats(ajv);
  } else if (draft === '2019-09' || draft === '2020-12') {
    addFormats(ajv);
    addFormats2019(ajv);
  }

  ajvInstances.set(draft, ajv);
  return ajv;
}

export function getAjv(draft: JsonSchemaDraft = 'draft-07'): Ajv {
  return createAjv(draft);
}

export function getValidator<T = unknown>(
  schema: object,
  draft: JsonSchemaDraft = 'draft-07'
): (data: unknown) => data is T {
  if (validatorCache.has(schema)) {
    return validatorCache.get(schema)! as (data: unknown) => data is T;
  }

  const ajv = getAjv(draft);
  const validator = ajv.compile(schema);

  const typedValidator = (data: unknown): data is T => validator(data);
  validatorCache.set(schema, typedValidator);

  return typedValidator;
}

export function validateWithErrors(
  schema: object,
  data: unknown,
  draft: JsonSchemaDraft = 'draft-07'
): { valid: boolean; errors?: unknown[] } {
  const ajv = getAjv(draft);
  const validate = ajv.compile(schema);
  const valid = validate(data);

  return {
    valid,
    errors: valid ? undefined : validate.errors,
  };
}

export function clearCache(): void {
  ajvInstances.clear();
}
