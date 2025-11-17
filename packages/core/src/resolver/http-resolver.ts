/* eslint-disable max-depth */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
/* global fetch, AbortController */
import { ResolutionRegistry, stripFragment } from './registry.js';
import {
  canonicalizeCacheDir,
  readFromCache,
  writeToCache,
} from './cache-store.js';
import { summarizeExternalRefs } from '../util/modes.js';

export interface ResolverOptions {
  strategies?: Array<'local' | 'remote' | 'schemastore'>;
  cacheDir?: string;
  stubUnresolved?: 'none' | 'emptySchema';
  maxDocs?: number;
  maxRefDepth?: number;
  maxBytesPerDoc?: number; // bytes
  timeoutMs?: number;
  followRedirects?: number;
  acceptYaml?: boolean; // reserved; JSON only here
  /**
   * Legacy allow-list of additional hosts (by hostname).
   */
  allowlist?: string[];
  /**
   * Optional host allow-list used for remote strategies. Entries may be
   * hostnames or regular expressions. When empty, remote fetches are allowed
   * for any host permitted by the active strategies.
   */
  allowHosts?: Array<string | RegExp>;
  /**
   * Bounded retry count for transient network failures (default: 0).
   */
  retries?: number;
  /**
   * Optional User-Agent string to send with HTTP(S) requests.
   */
  userAgent?: string;
}

export interface PrefetchResult {
  registry: ResolutionRegistry;
  diagnostics: Array<{ code: string; canonPath: string; details?: unknown }>;
  cacheDir?: string;
}

function buildExplicitAllowList(opts: ResolverOptions): Array<string | RegExp> {
  const out: Array<string | RegExp> = [];
  for (const entry of opts.allowHosts ?? []) {
    out.push(entry);
  }
  for (const host of opts.allowlist ?? []) {
    const trimmed = host.trim();
    if (!trimmed) continue;
    out.push(trimmed.toLowerCase());
  }
  return out;
}

function hostMatchesAllow(
  host: string,
  allow: Array<string | RegExp>
): boolean {
  for (const entry of allow) {
    if (typeof entry === 'string') {
      if (host === entry.toLowerCase()) return true;
    } else if (entry instanceof RegExp) {
      if (entry.test(host)) return true;
    }
  }
  return false;
}

function hostAllowed(url: URL, opts: ResolverOptions): boolean {
  const strategies = opts.strategies ?? ['local'];
  const hasRemote = strategies.includes('remote');
  const hasSchemastore = strategies.includes('schemastore');
  if (!hasRemote && !hasSchemastore) return false;

  const host = url.hostname.toLowerCase();
  const explicitAllow = buildExplicitAllowList(opts);
  const matchesExplicit = hostMatchesAllow(host, explicitAllow);

  // Remote strategy: general HTTP(S) fetch, optionally restricted by explicit allow-list.
  if (hasRemote) {
    if (explicitAllow.length > 0) {
      if (matchesExplicit) return true;
    } else {
      return true;
    }
  }

  // schemastore strategy: built-in restriction to json.schemastore.org (plus any explicit allow-list entries).
  if (hasSchemastore && host === 'json.schemastore.org') {
    return true;
  }

  return false;
}

async function fetchWithBounds(
  url: URL,
  opts: ResolverOptions
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxBytes = opts.maxBytesPerDoc ?? 5 * 1024 * 1024;
  const retries = Math.max(0, opts.retries ?? 0);
  const headers =
    typeof opts.userAgent === 'string' && opts.userAgent.trim().length > 0
      ? { 'user-agent': opts.userAgent }
      : undefined;

  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const bytes = Buffer.byteLength(text, 'utf8');
      if (bytes > maxBytes) {
        const error = new Error('MAX_BYTES_EXCEEDED');
        error.name = 'MAX_BYTES_EXCEEDED';
        throw error;
      }
      return text;
    } catch (error) {
      if (attempt >= retries) throw error;
      attempt += 1;
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function prefetchAndBuildRegistry(
  extRefs: string[],
  options: ResolverOptions
): Promise<PrefetchResult> {
  const registry = new ResolutionRegistry();
  const diags: PrefetchResult['diagnostics'] = [];
  const strategies = options.strategies ?? ['local'];
  const mayFetch =
    strategies.includes('remote') || strategies.includes('schemastore');
  const cacheDir = options.cacheDir
    ? canonicalizeCacheDir(options.cacheDir)
    : undefined;

  const seenDocs = new Set<string>();
  const maxDocs = options.maxDocs ?? 64;
  const maxDepth = options.maxRefDepth ?? 16;
  const queue: Array<{ doc: string; depth: number }> = [];
  for (const ref of extRefs) {
    const doc = stripFragment(ref);
    if (doc) queue.push({ doc, depth: 0 });
  }
  while (queue.length > 0 && registry.size() < maxDocs) {
    const { doc, depth } = queue.shift()!;
    if (seenDocs.has(doc)) continue;
    seenDocs.add(doc);
    try {
      const url = new URL(doc);
      // Try cache first
      if (cacheDir) {
        const cached = await readFromCache(doc, { cacheDir });
        if (cached) {
          registry.add({
            uri: doc,
            schema: cached.schema,
            contentHash: cached.contentHash,
          });
          diags.push({
            code: 'RESOLVER_CACHE_HIT',
            canonPath: '#',
            details: { ref: doc, contentHash: cached.contentHash },
          });
          if (depth < maxDepth) {
            try {
              const nested = summarizeExternalRefs(cached.schema).extRefs;
              for (const r of nested) {
                const child = stripFragment(r);
                if (child && !seenDocs.has(child)) {
                  queue.push({ doc: child, depth: depth + 1 });
                }
              }
            } catch {
              // Ignore errors while scanning nested external refs from cache; prefetch coverage stays best-effort.
            }
          }
          continue;
        }
      }
      if (!mayFetch) {
        diags.push({
          code: 'RESOLVER_OFFLINE_UNAVAILABLE',
          canonPath: '#',
          details: { ref: doc, reason: 'no-strategy' },
        });
        continue;
      }
      if (!hostAllowed(url, options)) {
        diags.push({
          code: 'RESOLVER_OFFLINE_UNAVAILABLE',
          canonPath: '#',
          details: { ref: doc, reason: 'host-not-allowed' },
        });
        continue;
      }
      const text = await fetchWithBounds(url, options);
      const schema = JSON.parse(text);
      const cached = cacheDir
        ? await writeToCache(doc, schema, { cacheDir })
        : { schema, contentHash: '' };
      registry.add({
        uri: doc,
        schema: cached.schema,
        contentHash: cached.contentHash,
      });
      diags.push({
        code: 'RESOLVER_CACHE_MISS_FETCHED',
        canonPath: '#',
        details: {
          ref: doc,
          bytes: Buffer.byteLength(text, 'utf8'),
          contentHash: cached.contentHash,
        },
      });
      if (depth < maxDepth) {
        try {
          const nested = summarizeExternalRefs(schema).extRefs;
          for (const r of nested) {
            const child = stripFragment(r);
            if (child && !seenDocs.has(child)) {
              queue.push({ doc: child, depth: depth + 1 });
            }
          }
        } catch {
          // Ignore errors while scanning nested external refs from network responses.
        }
      }
    } catch (error) {
      diags.push({
        code: 'RESOLVER_OFFLINE_UNAVAILABLE',
        canonPath: '#',
        details: {
          ref: doc,
          reason: 'fetch-error',
          error:
            error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : undefined,
        },
      });
    }
  }

  return { registry, diagnostics: diags, cacheDir };
}
