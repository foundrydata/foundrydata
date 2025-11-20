/* eslint-disable max-depth */
/* eslint-disable max-lines-per-function */
import type Ajv from 'ajv';

import { ensureMeta } from '../ajv/factory.js';
import { detectDialect, type Dialect } from '../dialect/detectDialect.js';
import type { JsonSchemaDialect } from '../util/ajv-source.js';
import type { ResolverDiagnosticNote } from './options.js';

export interface RegistryDoc {
  uri: string;
  schema: unknown;
  contentHash?: string;
  dialect?: Dialect;
}

export interface HydrateSourceAjvOptions {
  ignoreIncompatible: boolean;
  /**
   * Optional run-level diagnostics container used to record non-fatal notes
   * such as duplicate IDs or incompatible dialects.
   */
  notes?: ResolverDiagnosticNote[];
  /**
   * Map of seen $id values to the URI key they were first associated with.
   * Used to avoid AJV duplicate-id conflicts across hydrated schemas.
   */
  seenSchemaIds?: Map<string, string>;
  /**
   * Dialect expected by the target AJV instance (e.g., source schema dialect
   * or the canonical planning dialect).
   */
  targetDialect?: JsonSchemaDialect;
}

function isDialectCompatible(
  docDialect: Dialect,
  targetDialect: JsonSchemaDialect | undefined
): boolean {
  if (!targetDialect || docDialect === 'unknown') {
    return true;
  }
  return docDialect === targetDialect;
}

function collectIds(node: unknown, acc: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const it of node) collectIds(it, acc);
    return;
  }
  const rec = node as Record<string, unknown>;
  const raw = rec.$id;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed) acc.add(trimmed);
  }
  for (const value of Object.values(rec)) {
    collectIds(value, acc);
  }
}

// eslint-disable-next-line complexity
export function hydrateSourceAjvFromRegistry(
  ajv: Ajv,
  registryDocs: RegistryDoc[],
  options: HydrateSourceAjvOptions
): void {
  if (!Array.isArray(registryDocs) || registryDocs.length === 0) {
    return;
  }

  const notes = options.notes;
  const seenSchemaIds = options.seenSchemaIds ?? new Map<string, string>();
  const targetDialect = options.targetDialect;
  const seenUris = new Set<string>();

  const ajvWithApi = ajv as unknown as {
    getSchema?: (key: string) => unknown;
    addSchema?: (schema: unknown, key?: string) => void;
  };

  for (const entry of registryDocs) {
    try {
      const entryDialect =
        entry.dialect && entry.dialect !== 'unknown'
          ? entry.dialect
          : undefined;
      const docDialect = entryDialect ?? detectDialect(entry.schema);
      if (!isDialectCompatible(docDialect, targetDialect)) {
        if (options.ignoreIncompatible && notes) {
          notes.push({
            code: 'RESOLVER_ADD_SCHEMA_SKIPPED_INCOMPATIBLE_DIALECT',
            canonPath: '#',
            details: {
              uri: entry.uri,
              docDialect,
              targetDialect,
            },
          });
        }
        continue;
      }

      const effectiveDialect: Dialect =
        docDialect === 'unknown' ? (targetDialect ?? '2020-12') : docDialect;

      let uriKey = entry.uri;
      try {
        uriKey = new URL(entry.uri).href;
      } catch {
        uriKey = entry.uri;
      }

      if (seenUris.has(uriKey)) {
        notes?.push({
          code: 'RESOLVER_ADD_SCHEMA_SKIPPED_DUPLICATE_ID',
          canonPath: '#',
          details: {
            ref: uriKey,
            reason: 'uri-already-seen',
            contentHash: entry.contentHash,
          },
        });
        continue;
      }

      ensureMeta(ajv, effectiveDialect);

      if (typeof ajvWithApi.getSchema === 'function') {
        const existingByUri = ajvWithApi.getSchema(uriKey);
        if (typeof existingByUri === 'function') {
          notes?.push({
            code: 'RESOLVER_ADD_SCHEMA_SKIPPED_DUPLICATE_ID',
            canonPath: '#',
            details: {
              ref: uriKey,
              reason: 'uri-already-registered',
              contentHash: entry.contentHash,
            },
          });
          seenUris.add(uriKey);
          continue;
        }
      }

      const ids = new Set<string>();
      collectIds(entry.schema, ids);
      let conflict = false;
      for (const id of ids) {
        const existingFromRegistry = seenSchemaIds.get(id);
        const existingFromAjv =
          typeof ajvWithApi.getSchema === 'function'
            ? ajvWithApi.getSchema(id)
            : undefined;
        if (
          existingFromAjv ||
          (existingFromRegistry && existingFromRegistry !== uriKey)
        ) {
          conflict = true;
          notes?.push({
            code: 'RESOLVER_ADD_SCHEMA_SKIPPED_DUPLICATE_ID',
            canonPath: '#',
            details: {
              id,
              ref: uriKey,
              existingRef: existingFromRegistry ?? 'ajv-existing',
              contentHash: entry.contentHash,
            },
          });
        }
      }
      if (conflict) continue;

      if (typeof ajvWithApi.addSchema === 'function') {
        ajvWithApi.addSchema(entry.schema as object, uriKey);
      }
      for (const id of ids) {
        if (!seenSchemaIds.has(id)) {
          seenSchemaIds.set(id, uriKey);
        }
      }
      seenUris.add(uriKey);
    } catch (error) {
      notes?.push({
        code: 'RESOLVER_ADD_SCHEMA_SKIPPED_DUPLICATE_ID',
        canonPath: '#',
        details: {
          ref: entry.uri,
          error: error instanceof Error ? error.message : String(error),
          contentHash: entry.contentHash,
        },
      });
    }
  }
}
