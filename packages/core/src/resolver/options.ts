/* eslint-disable max-depth */
/* eslint-disable max-lines-per-function */

import os from 'node:os';
import path from 'node:path';
import { canonicalizeCacheDir } from './cache-store.js';
import { ResolutionRegistry } from './registry.js';
import {
  prefetchAndBuildRegistry,
  type ResolverOptions as HttpResolverOptions,
} from './http-resolver.js';
import { DIAGNOSTIC_CODES, type DiagnosticCode } from '../diag/codes.js';
import { schemaHasExternalRefs, summarizeExternalRefs } from '../util/modes.js';

export interface ResolverDiagnosticNote {
  code: DiagnosticCode;
  canonPath: string;
  details?: unknown;
}

/**
 * High-level resolver options used by the pre-pipeline Extension R1 entrypoint.
 *
 * These options are a normalized view derived from PlanOptions.resolver.
 */
export interface ResolverOptions {
  strategies: Array<'local' | 'remote' | 'schemastore'>;
  cacheDir: string;
  hydrateFinalAjv: boolean;
  stubUnresolved?: 'emptySchema';
  allowHosts?: Array<string | RegExp> | undefined;
  maxDocs: number;
  maxRefDepth: number;
  maxBytesPerDoc: number;
  timeoutMs: number;
  followRedirects: number;
  acceptYaml: boolean;
}

export interface ResolveAllExternalRefsResult {
  registry: ResolutionRegistry;
  /**
   * Run-level resolver notes (see SPEC §19 run-level diagnostics). All entries
   * use canonPath:"#".
   */
  notes: ResolverDiagnosticNote[];
  /**
   * Deterministic fingerprint of the registry state used by compose/plan cache
   * keys (SPEC §14). Equals "0" when the registry is empty.
   */
  registryFingerprint: string;
  /**
   * Canonicalized cache directory path (POSIX ~ expanded, absolute).
   */
  cacheDir?: string;
}

function anonymizeCacheDirForDiagnostics(
  cacheDir: string | undefined
): string | null {
  if (!cacheDir) return null;
  const home = typeof os.homedir === 'function' ? os.homedir() : undefined;
  if (!home) return cacheDir;

  if (!cacheDir.startsWith(home)) {
    return cacheDir;
  }

  const suffix = cacheDir.slice(home.length).replace(/^[\\/]/, '');
  if (!suffix) return '~';

  const normalizedSuffix = suffix.split(path.sep).join('/');
  return `~/${normalizedSuffix}`;
}

/**
 * Optional pre-pipeline resolver (Extension R1).
 *
 * - Computes external $ref targets from the original schema.
 * - Optionally fetches remote documents with HTTP(S) under the configured
 *   strategies and host allow-list.
 * - Populates an in-memory ResolutionRegistry and on-disk cache.
 * - Emits run-level resolver notes for observability.
 *
 * Core phases (Normalize → Compose → Generate → Repair → Validate) remain
 * I/O-free; this function is intended to run strictly before Normalize.
 */
export async function resolveAllExternalRefs(
  original: object,
  options: ResolverOptions
): Promise<ResolveAllExternalRefsResult> {
  const registry = new ResolutionRegistry();
  const notes: ResolverDiagnosticNote[] = [];

  const strategies =
    options.strategies && options.strategies.length > 0
      ? options.strategies.slice()
      : (['local'] as Array<'local'>);

  const hasExternal = schemaHasExternalRefs(original);

  const cacheDir =
    options.cacheDir !== undefined
      ? canonicalizeCacheDir(options.cacheDir)
      : undefined;
  const cacheDirForDiag = anonymizeCacheDirForDiagnostics(cacheDir);

  // Always emit a run-level strategies note, even when no external refs are
  // present or no network fetch is attempted.
  notes.push({
    code: DIAGNOSTIC_CODES.RESOLVER_STRATEGIES_APPLIED,
    canonPath: '#',
    details: {
      strategies,
      cacheDir: cacheDirForDiag,
    },
  });

  if (hasExternal) {
    const { extRefs } = summarizeExternalRefs(original);
    if (extRefs.length > 0) {
      const httpOptions: HttpResolverOptions = {
        strategies,
        cacheDir,
        // Bounds and behavior derived from resolved plan options
        maxDocs: options.maxDocs,
        maxRefDepth: options.maxRefDepth,
        maxBytesPerDoc: options.maxBytesPerDoc,
        timeoutMs: options.timeoutMs,
        followRedirects: options.followRedirects,
        acceptYaml: options.acceptYaml,
        allowHosts: options.allowHosts,
      };
      const pre = await prefetchAndBuildRegistry(extRefs, httpOptions);
      // Use the registry from the HTTP resolver; its fingerprint is based on
      // the canonical { uri, contentHash } mapping.
      for (const entry of pre.registry.entries()) {
        registry.add(entry);
      }
      // Append resolver notes from prefetch (cache hits/misses, offline, etc.).
      if (Array.isArray(pre.diagnostics) && pre.diagnostics.length > 0) {
        for (const diag of pre.diagnostics) {
          notes.push(diag);
        }
      }
    }
  }

  const registryFingerprint = registry.fingerprint();

  return {
    registry,
    notes,
    registryFingerprint,
    cacheDir,
  };
}
