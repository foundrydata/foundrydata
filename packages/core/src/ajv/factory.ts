import { createRequire } from 'node:module';
import type Ajv from 'ajv';

import {
  createSourceAjv as coreCreateSourceAjv,
  type JsonSchemaDialect,
} from '../util/ajv-source.js';
import type { PlanOptions } from '../types/options.js';
import {
  getDialectMetaSynonyms,
  type Dialect,
} from '../dialect/detectDialect.js';

const requireForDraft = createRequire(import.meta.url);

export type AjvLike = Ajv;

export interface SourceAjvFlags {
  /**
   * Optional planning options used to align multipleOfPrecision and other
   * AJV flags with the planning instance.
   */
  planOptions?: Partial<PlanOptions>;
}

function toKnownDialect(dialect: Dialect): JsonSchemaDialect {
  if (
    dialect === 'draft-04' ||
    dialect === 'draft-06' ||
    dialect === 'draft-07' ||
    dialect === '2019-09' ||
    dialect === '2020-12'
  ) {
    return dialect;
  }
  return '2020-12';
}

export function createSourceAjv(
  dialect: Dialect,
  flags: SourceAjvFlags,
  opts: {
    validateFormats: boolean;
    multipleOfPrecision?: number;
    discriminator?: boolean;
    tolerateInvalidPatterns?: boolean;
  }
): AjvLike {
  const effectiveDialect = toKnownDialect(dialect);

  return coreCreateSourceAjv(
    {
      dialect: effectiveDialect,
      validateFormats: opts.validateFormats,
      multipleOfPrecision: opts.multipleOfPrecision,
      discriminator: opts.discriminator,
      tolerateInvalidPatterns: opts.tolerateInvalidPatterns,
    },
    flags.planOptions
  );
}

// eslint-disable-next-line complexity
export function ensureMeta(ajv: AjvLike, dialect: Dialect): void {
  const effectiveDialect = toKnownDialect(dialect);
  if (effectiveDialect !== 'draft-06' && effectiveDialect !== 'draft-07') {
    // draft-04, 2019-09, and 2020-12 rely on AJV's built-in metaschemas.
    return;
  }

  const synonyms = getDialectMetaSynonyms(effectiveDialect);
  if (synonyms.length === 0) return;

  let meta: unknown;
  const ajvWithMeta = ajv as unknown as {
    getSchema?: (id: string) => { schema?: unknown } | undefined;
    addMetaSchema?: (schema: unknown) => void;
  };

  if (typeof ajvWithMeta.addMetaSchema !== 'function') return;

  try {
    switch (effectiveDialect) {
      case 'draft-06':
        meta = requireForDraft('ajv/dist/refs/json-schema-draft-06.json');
        break;
      case 'draft-07':
        meta = requireForDraft('ajv/dist/refs/json-schema-draft-07.json');
        break;
      default:
        return;
    }
  } catch {
    return;
  }

  if (!meta || typeof meta !== 'object') return;
  const rec = meta as Record<string, unknown>;

  for (const id of synonyms) {
    if (!id) continue;
    if (typeof ajvWithMeta.getSchema === 'function') {
      const existing = ajvWithMeta.getSchema(id);
      if (existing) continue;
    }
    const alias = { ...rec, $id: id };
    ajvWithMeta.addMetaSchema(alias);
  }
}
