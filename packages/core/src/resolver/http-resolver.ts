/* eslint-disable max-depth */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
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
  allowlist?: string[]; // additional hosts
}

export interface PrefetchResult {
  registry: ResolutionRegistry;
  diagnostics: Array<{ code: string; canonPath: string; details?: unknown }>;
  cacheDir?: string;
}

function buildAllowlist(opts: ResolverOptions): Set<string> {
  const set = new Set<string>();
  const strategies = opts.strategies ?? ['local'];
  if (strategies.includes('schemastore')) {
    set.add('json.schemastore.org');
  }
  for (const h of opts.allowlist ?? []) {
    set.add(h.toLowerCase());
  }
  return set;
}

function hostAllowed(url: URL, opts: ResolverOptions): boolean {
  const strategies = opts.strategies ?? ['local'];
  if (strategies.includes('remote')) return true;
  if (strategies.includes('schemastore')) {
    const allow = buildAllowlist(opts);
    return allow.has(url.hostname.toLowerCase());
  }
  return false;
}

async function fetchWithBounds(
  url: URL,
  opts: ResolverOptions
): Promise<string> {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const max = opts.maxBytesPerDoc ?? 5 * 1024 * 1024;
    if (Buffer.byteLength(text, 'utf8') > max) {
      throw new Error('MAX_BYTES_EXCEEDED');
    }
    return text;
  } finally {
    clearTimeout(to);
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

  // Emit strategies note
  diags.push({
    code: 'RESOLVER_STRATEGIES_APPLIED',
    canonPath: '#',
    details: { strategies, cacheDir: cacheDir ?? null },
  });

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
/* global fetch, AbortController */
