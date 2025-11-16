/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import { createRequire } from 'node:module';
import Ajv, { type Options as AjvOptions } from 'ajv';
import Ajv2019 from 'ajv/dist/2019.js';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  resolveOptions,
  type PlanOptions,
  type ResolvedOptions,
} from '../types/options.js';

export type JsonSchemaDialect = 'draft-04' | 'draft-07' | '2019-09' | '2020-12';

const requireForDraft = createRequire(import.meta.url);

const CANONICAL_META_IDS: Record<JsonSchemaDialect, readonly string[]> = {
  'draft-04': [
    'http://json-schema.org/draft-04/schema',
    'https://json-schema.org/draft-04/schema',
  ],
  'draft-07': [
    'http://json-schema.org/draft-07/schema',
    'https://json-schema.org/draft-07/schema',
    'http://json-schema.org/draft-06/schema',
    'https://json-schema.org/draft-06/schema',
  ],
  '2019-09': [
    'http://json-schema.org/draft/2019-09/schema',
    'https://json-schema.org/draft/2019-09/schema',
  ],
  '2020-12': [
    'http://json-schema.org/draft/2020-12/schema',
    'https://json-schema.org/draft/2020-12/schema',
  ],
};

const canonicalMetaCache = new Map<JsonSchemaDialect, Set<string>>();

export interface SourceAjvFactoryOptions {
  dialect: JsonSchemaDialect;
  validateFormats?: boolean;
  multipleOfPrecision?: number;
  discriminator?: boolean;
}

/**
 * Create an AJV instance for validating against the original source schema
 * using flags required for Source compilation.
 */
type AjvWithMarkers = Ajv & {
  __fd_formatsPlugin?: boolean;
  __fd_ajvClass?:
    | 'Ajv'
    | 'Ajv2019'
    | 'Ajv2020'
    | 'ajv-draft-04'
    | string
    | undefined;
};

export function createSourceAjv(
  options: SourceAjvFactoryOptions,
  planOptions?: Partial<PlanOptions>
): Ajv {
  const resolved: ResolvedOptions = resolveOptions(planOptions);

  const baseFlags: AjvOptions = {
    // Source (original schema) flags (REFONLY::{"anchors":["spec://§13#source-ajv"]})
    strictSchema: false,
    strictTypes: false,
    allowUnionTypes: true,
    unicodeRegExp: true,
    useDefaults: false,
    removeAdditional: false,
    coerceTypes: false,
    allErrors: false,
    validateFormats: options.validateFormats ?? false,
    discriminator: options.discriminator ?? false,
    // Align epsilon with rational.decimalPrecision when relevant
    multipleOfPrecision:
      options.multipleOfPrecision ??
      (resolved.rational.fallback === 'decimal' ||
      resolved.rational.fallback === 'float'
        ? resolved.rational.decimalPrecision
        : undefined),
  } as AjvOptions;

  const ajv = createAjvByDialect(options.dialect, baseFlags) as AjvWithMarkers;

  // If formats validation is enabled, add ajv-formats plugin
  if (baseFlags.validateFormats) {
    addFormats(ajv as Ajv);
    // mark formats plugin presence for parity checks
    ajv.__fd_formatsPlugin = true;
  }

  // Attach a stable marker with the chosen class/dialect for parity checks
  ajv.__fd_ajvClass = getAjvClassLabel(options.dialect);
  return ajv as Ajv;
}

export function createRepairOnlyValidatorAjv(
  options: SourceAjvFactoryOptions,
  planOptions?: Partial<PlanOptions>
): Ajv {
  const ajv = createSourceAjv(options, planOptions);
  // Toggle allErrors:true for repair-only use (does not affect startup gate)
  // Ajv does not support toggling after creation; recreate with flag
  const flags = extractAjvFlags(ajv);
  const dialect = options.dialect;
  const ajv2 = createAjvByDialect(dialect, {
    ...flags,
    allErrors: true,
  } as AjvOptions);
  if (flags.validateFormats) {
    addFormats(ajv2);
    (ajv2 as AjvWithMarkers).__fd_formatsPlugin = true;
  }
  (ajv2 as AjvWithMarkers).__fd_ajvClass = getAjvClassLabel(dialect);
  return ajv2;
}

function createAjvByDialect(
  dialect: JsonSchemaDialect,
  flags: AjvOptions
): Ajv {
  switch (dialect) {
    case 'draft-07':
      return new Ajv(flags);
    case '2019-09':
      return new Ajv2019(flags) as unknown as Ajv;
    case '2020-12':
      return new Ajv2020(flags) as unknown as Ajv;
    case 'draft-04': {
      // ajv-draft-04 is optional; resolve lazily via createRequire for ESM compatibility
      const AjvDraft04 = requireForDraft('ajv-draft-04');
      return new AjvDraft04(flags) as unknown as Ajv;
    }
    default:
      return new Ajv(flags);
  }
}

export function getAjvClassLabel(
  dialect: JsonSchemaDialect
): 'Ajv' | 'Ajv2019' | 'Ajv2020' | 'ajv-draft-04' {
  switch (dialect) {
    case 'draft-07':
      return 'Ajv';
    case '2019-09':
      return 'Ajv2019';
    case '2020-12':
      return 'Ajv2020';
    case 'draft-04':
      return 'ajv-draft-04';
  }
}

export type ExtractedAjvFlags = {
  validateFormats?: boolean;
  allowUnionTypes?: boolean;
  unicodeRegExp?: boolean;
  coerceTypes?: boolean | 'array';
  strictTypes?: boolean;
  strictSchema?: boolean;
  removeAdditional?: boolean | 'all' | 'failing';
  useDefaults?: boolean | 'empty' | 'shared';
  allErrors?: boolean;
  multipleOfPrecision?: number;
  discriminator?: boolean;
};

export function extractAjvFlags(ajv: Ajv): ExtractedAjvFlags {
  // Ajv exposes options on .opts
  type AjvInternal = Ajv & { opts?: Record<string, unknown> };
  const opts = ((ajv as AjvInternal).opts ?? {}) as Record<string, unknown>;
  return {
    validateFormats: opts.validateFormats as boolean | undefined,
    allowUnionTypes: opts.allowUnionTypes as boolean | undefined,
    unicodeRegExp: opts.unicodeRegExp as boolean | undefined,
    coerceTypes: opts.coerceTypes as boolean | 'array' | undefined,
    strictTypes: opts.strictTypes as boolean | undefined,
    strictSchema: opts.strictSchema as boolean | undefined,
    removeAdditional: opts.removeAdditional as
      | boolean
      | 'all'
      | 'failing'
      | undefined,
    useDefaults: opts.useDefaults as boolean | 'empty' | 'shared' | undefined,
    allErrors: opts.allErrors as boolean | undefined,
    multipleOfPrecision: opts.multipleOfPrecision as number | undefined,
    discriminator: opts.discriminator as boolean | undefined,
  };
}

type StripResult = {
  value: unknown;
  changed: boolean;
  removed: boolean;
};

function normalizeMetaIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  const noFragment = trimmed.split('#')[0] ?? trimmed;
  const lowered = noFragment.toLowerCase();
  const normalizedProtocol = lowered.replace('https://', 'http://');
  return normalizedProtocol.endsWith('/')
    ? normalizedProtocol.slice(0, -1)
    : normalizedProtocol;
}

function stripBundledCanonicalMetas(
  value: unknown,
  canonicalIds: Set<string>,
  seen: WeakMap<object, StripResult>
): StripResult {
  if (!value || typeof value !== 'object') {
    return { value, changed: false, removed: false };
  }

  const cached = seen.get(value as object);
  if (cached) {
    return cached;
  }

  if (Array.isArray(value)) {
    let changed = false;
    const clone: unknown[] = [];
    for (const entry of value) {
      const result = stripBundledCanonicalMetas(entry, canonicalIds, seen);
      if (result.removed) {
        changed = true;
        continue;
      }
      clone.push(result.value);
      if (result.changed || result.value !== entry) {
        changed = true;
      }
    }
    const output: StripResult = changed
      ? { value: clone, changed: true, removed: false }
      : { value, changed: false, removed: false };
    seen.set(value as object, output);
    return output;
  }

  const obj = value as Record<string, unknown>;
  const candidateId = typeof obj.$id === 'string' ? obj.$id : undefined;
  if (candidateId) {
    const normalized = normalizeMetaIdentifier(candidateId);
    if (canonicalIds.has(normalized)) {
      const output: StripResult = {
        value: undefined,
        changed: true,
        removed: true,
      };
      seen.set(value as object, output);
      return output;
    }
  }

  let changed = false;
  const clone: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(obj)) {
    const result = stripBundledCanonicalMetas(entry, canonicalIds, seen);
    if (result.removed) {
      changed = true;
      continue;
    }
    clone[key] = result.value;
    if (result.changed || result.value !== entry) {
      changed = true;
    }
  }
  const output: StripResult = changed
    ? { value: clone, changed: true, removed: false }
    : { value, changed: false, removed: false };
  seen.set(value as object, output);
  return output;
}

export function detectDialectFromSchema(schema: unknown): JsonSchemaDialect {
  if (schema && typeof schema === 'object') {
    const declared = (schema as Record<string, unknown>)['$schema'];
    if (typeof declared === 'string') {
      const lowered = declared.toLowerCase();
      if (lowered.includes('2020-12')) return '2020-12';
      if (lowered.includes('2019-09') || lowered.includes('draft-2019')) {
        return '2019-09';
      }
      if (lowered.includes('draft-07') || lowered.includes('draft-06')) {
        return 'draft-07';
      }
      if (lowered.includes('draft-04')) {
        return 'draft-04';
      }
    }
  }
  return '2020-12';
}

export function prepareSchemaForSourceAjv(
  schema: unknown,
  dialect?: JsonSchemaDialect
): { schemaForAjv: unknown; stripped: boolean } {
  const resolvedDialect = dialect ?? detectDialectFromSchema(schema);
  const canonicalList = CANONICAL_META_IDS[resolvedDialect];
  if (!canonicalList || canonicalList.length === 0) {
    return { schemaForAjv: schema, stripped: false };
  }
  if (!schema || typeof schema !== 'object') {
    return { schemaForAjv: schema, stripped: false };
  }
  const canonicalSet = new Set<string>(
    canonicalList.map((id) => normalizeMetaIdentifier(id))
  );
  const result = stripBundledCanonicalMetas(
    schema,
    canonicalSet,
    new WeakMap<object, StripResult>()
  );
  if (result.removed) {
    return { schemaForAjv: schema, stripped: false };
  }
  if (!result.changed) {
    return { schemaForAjv: schema, stripped: false };
  }
  return {
    schemaForAjv: result.value,
    stripped: true,
  };
}

function getCanonicalMetaSet(dialect: JsonSchemaDialect): Set<string> {
  let cached = canonicalMetaCache.get(dialect);
  if (!cached) {
    const canonicalIds = CANONICAL_META_IDS[dialect] ?? [];
    cached = new Set(canonicalIds.map((id) => normalizeMetaIdentifier(id)));
    canonicalMetaCache.set(dialect, cached);
  }
  return cached;
}

export function isCanonicalMetaRef(
  ref: string,
  dialect: JsonSchemaDialect
): boolean {
  if (!ref) return false;
  const cache = getCanonicalMetaSet(dialect);
  const normalized = normalizeMetaIdentifier(ref);
  return cache.has(normalized);
}
