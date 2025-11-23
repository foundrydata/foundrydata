/* eslint-disable max-depth */
/* eslint-disable max-lines */
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
import {
  detectDialect,
  getCanonicalMetaUri,
  getDialectMetaSynonyms,
  type Dialect,
} from '../dialect/detectDialect.js';

export type JsonSchemaDialect =
  | 'draft-04'
  | 'draft-06'
  | 'draft-07'
  | '2019-09'
  | '2020-12';

const requireForDraft = createRequire(import.meta.url);

const CANONICAL_META_IDS: Record<JsonSchemaDialect, readonly string[]> = {
  'draft-04': getDialectMetaSynonyms('draft-04'),
  'draft-06': getDialectMetaSynonyms('draft-06'),
  'draft-07': getDialectMetaSynonyms('draft-07'),
  '2019-09': getDialectMetaSynonyms('2019-09'),
  '2020-12': getDialectMetaSynonyms('2020-12'),
};

const canonicalMetaCache = new Map<JsonSchemaDialect, Set<string>>();

type RegExpEngine = ((pattern: string, flags?: string) => RegExp) & {
  code: string;
};
let draft06PatternFallbackWarned = false;

export interface SourceAjvFactoryOptions {
  dialect: JsonSchemaDialect;
  validateFormats?: boolean;
  multipleOfPrecision?: number;
  discriminator?: boolean;
  tolerateInvalidPatterns?: boolean;
  onInvalidPatternDraft06?: (info: { pattern: string }) => void;
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

  const ajv = createAjvByDialect(options.dialect, baseFlags, {
    tolerateInvalidPatternsForDraft06: options.tolerateInvalidPatterns === true,
    onInvalidPatternDraft06: options.onInvalidPatternDraft06,
  }) as AjvWithMarkers;

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
  const ajv2 = createAjvByDialect(
    dialect,
    {
      ...flags,
      allErrors: true,
    } as AjvOptions,
    {
      tolerateInvalidPatternsForDraft06:
        options.tolerateInvalidPatterns === true,
      onInvalidPatternDraft06: options.onInvalidPatternDraft06,
    }
  );
  if (flags.validateFormats) {
    addFormats(ajv2);
    (ajv2 as AjvWithMarkers).__fd_formatsPlugin = true;
  }
  (ajv2 as AjvWithMarkers).__fd_ajvClass = getAjvClassLabel(dialect);
  return ajv2;
}

function createAjvByDialect(
  dialect: JsonSchemaDialect,
  flags: AjvOptions,
  options?: {
    tolerateInvalidPatternsForDraft06?: boolean;
    onInvalidPatternDraft06?: (info: { pattern: string }) => void;
  }
): Ajv {
  switch (dialect) {
    case 'draft-06': {
      const draft06Flags: AjvOptions = {
        ...flags,
        // Disable default draft-07 meta and set draft-06 as default meta
        meta: false,
        defaultMeta: 'http://json-schema.org/draft-06/schema#',
      };
      if (options?.tolerateInvalidPatternsForDraft06) {
        // Wrap RegExp construction to tolerate legacy patterns that are not valid
        // JavaScript regular expressions (e.g. stray quantifier brackets) so that
        // schema compilation does not fail for otherwise usable schemas.
        const tolerantRegExp = ((pattern: string, flagsParam?: string) => {
          try {
            return new RegExp(pattern, flagsParam);
          } catch (err) {
            if (err instanceof SyntaxError) {
              // Fallback: use a permissive pattern that always matches,
              // effectively disabling the invalid constraint while keeping
              // compilation alive. This is only enabled in lax-like modes.
              const fallback = new RegExp('^[\\s\\S]*$', flagsParam);
              if (options?.onInvalidPatternDraft06) {
                options.onInvalidPatternDraft06({ pattern });
              } else if (!draft06PatternFallbackWarned) {
                // Surface a warning once per process when no callback is provided.
                console.warn(
                  '[foundrydata] warning: draft-06 pattern is invalid; ' +
                    'using tolerant match-all fallback for this schema'
                );
                draft06PatternFallbackWarned = true;
              }
              return fallback;
            }
            throw err;
          }
        }) as RegExpEngine;
        tolerantRegExp.code = 'new RegExp';
        draft06Flags.code = {
          ...(flags.code ?? {}),
          // Ajv will call this via opts.code.regExp in pattern handling.
          regExp: tolerantRegExp,
        };
      }
      const ajv = new Ajv(draft06Flags);
      try {
        const draft06Meta = requireForDraft(
          'ajv/dist/refs/json-schema-draft-06.json'
        );
        const canonicalIds = CANONICAL_META_IDS['draft-06'] ?? [];
        if (draft06Meta && typeof draft06Meta === 'object') {
          for (const id of canonicalIds) {
            if (!id) continue;
            if (ajv.getSchema(id)) continue;
            const alias = {
              ...(draft06Meta as Record<string, unknown>),
              $id: id,
            };
            ajv.addMetaSchema(alias);
          }
        } else {
          ajv.addMetaSchema(draft06Meta);
        }
      } catch (err) {
        // If the draft-06 meta-schema cannot be loaded, Ajv will report missing metas on compile.
        console.warn(
          '[foundrydata] warning: failed to load draft-06 meta-schema for Ajv:',
          err instanceof Error ? err.message : String(err)
        );
      }
      // Legacy draft-06 schemas may still use "id" as a schema identifier; Ajv v8
      // exposes it as a core keyword that always errors, so remove it for Source Ajv.
      try {
        ajv.removeKeyword('id');
      } catch {
        // Ignore if the keyword is not present or cannot be removed.
      }
      return ajv;
    }
    case 'draft-07': {
      const ajv = new Ajv(flags);
      try {
        const canonicalIds = CANONICAL_META_IDS['draft-07'] ?? [];
        const draft07Meta = requireForDraft(
          'ajv/dist/refs/json-schema-draft-07.json'
        );
        if (draft07Meta && typeof draft07Meta === 'object') {
          for (const id of canonicalIds) {
            if (!id) continue;
            if (ajv.getSchema(id)) continue;
            const alias = {
              ...(draft07Meta as Record<string, unknown>),
              $id: id,
            };
            ajv.addMetaSchema(alias);
          }
        } else {
          ajv.addMetaSchema(draft07Meta);
        }
      } catch (err) {
        // If the draft-07 meta-schema cannot be loaded, Ajv will report missing metas on compile.
        console.warn(
          '[foundrydata] warning: failed to ensure draft-07 meta-schema for Ajv:',
          err instanceof Error ? err.message : String(err)
        );
      }
      return ajv;
    }
    case '2019-09': {
      const ajv = new Ajv2019(flags) as unknown as Ajv;
      try {
        const canonicalIds = CANONICAL_META_IDS['2019-09'] ?? [];
        const metaId = getCanonicalMetaUri('2019-09');
        const internal = ajv as unknown as {
          refs?: Record<string, unknown>;
        };
        if (metaId && canonicalIds.length > 0) {
          if (!internal.refs) internal.refs = {};
          for (const id of canonicalIds) {
            if (!id || id === metaId) continue;
            if (!internal.refs[id]) {
              internal.refs[id] = metaId;
            }
          }
        }
      } catch (err) {
        console.warn(
          '[foundrydata] warning: failed to load draft-2019-09 meta-schema for Ajv:',
          err instanceof Error ? err.message : String(err)
        );
      }
      // Tolerate legacy "id" keywords as annotations under draft-2019-09 as well.
      try {
        ajv.removeKeyword('id');
      } catch {
        // Ignore if the keyword is not present or cannot be removed.
      }
      return ajv;
    }
    case '2020-12': {
      const ajv = new Ajv2020(flags) as unknown as Ajv;
      try {
        const canonicalIds = CANONICAL_META_IDS['2020-12'] ?? [];
        const metaId = getCanonicalMetaUri('2020-12');
        const internal = ajv as unknown as {
          refs?: Record<string, unknown>;
        };
        if (metaId && canonicalIds.length > 0) {
          if (!internal.refs) internal.refs = {};
          for (const id of canonicalIds) {
            if (!id || id === metaId) continue;
            if (!internal.refs[id]) {
              internal.refs[id] = metaId;
            }
          }
        }
      } catch (err) {
        console.warn(
          '[foundrydata] warning: failed to load draft-2020-12 meta-schema for Ajv:',
          err instanceof Error ? err.message : String(err)
        );
      }
      // For draft-2020-12, treat legacy "id" as a no-op annotation if present.
      try {
        (
          ajv as unknown as { removeKeyword?: (k: string) => void }
        ).removeKeyword?.('id');
      } catch {
        // Ignore if removal is not supported.
      }
      return ajv as unknown as Ajv;
    }
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
    case 'draft-06':
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
  unknownOptions?: string[];
};

export function extractAjvFlags(ajv: Ajv): ExtractedAjvFlags {
  // Ajv exposes options on .opts
  type AjvInternal = Ajv & { opts?: Record<string, unknown> };
  const opts = ((ajv as AjvInternal).opts ?? {}) as Record<string, unknown>;
  const knownKeys = new Set<string>([
    'validateFormats',
    'allowUnionTypes',
    'unicodeRegExp',
    'coerceTypes',
    'strictTypes',
    'strictSchema',
    'removeAdditional',
    'useDefaults',
    'allErrors',
    'multipleOfPrecision',
    'discriminator',
    // Ajv defaults and meta-behaviors we allow but do not parity-check individually
    'meta',
    'messages',
    'inlineRefs',
    'loopRequired',
    'loopEnum',
    'schemaId',
    'addUsedSchema',
    'validateSchema',
    'strictRequired',
    'strictTuples',
    'strictNumbers',
    'uriResolver',
    'int32range',
    'code',
    'formats',
    'unknownFormats',
    'serDes',
    'logger',
    'loadSchema',
    'ownProperties',
    'passContext',
    'defaultMeta',
    'validateFormatsPolicy',
    'keywords',
    'schemas',
    'sourceCode',
    'dynamicRef',
    'next',
    'unevaluated',
  ]);
  const unknownOptions = Object.keys(opts).filter((key) => !knownKeys.has(key));
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
    unknownOptions: unknownOptions.length
      ? unknownOptions.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      : undefined,
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
  const dialect = detectDialect(schema as unknown as Record<string, unknown>);
  if (dialect === 'unknown') {
    return '2020-12';
  }
  return dialect as Exclude<Dialect, 'unknown'>;
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
