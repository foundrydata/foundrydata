/* eslint-disable max-depth */
/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import { ResolutionRegistry, stripFragment } from './registry.js';
import {
  canonicalizeCacheDir,
  readFromCache,
  writeToCache,
} from './cache-store.js';

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
  for (const ref of extRefs) {
    if (registry.size() >= maxDocs) break;
    const doc = stripFragment(ref);
    if (!doc || seenDocs.has(doc)) continue;
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
          continue;
        }
      }
      if (!mayFetch) {
        diags.push({
          code: 'RESOLVER_OFFLINE_UNAVAILABLE',
          canonPath: '#',
          details: { ref: doc },
        });
        continue;
      }
      if (!hostAllowed(url, options)) {
        diags.push({
          code: 'RESOLVER_OFFLINE_UNAVAILABLE',
          canonPath: '#',
          details: { ref: doc },
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
    } catch {
      diags.push({
        code: 'RESOLVER_OFFLINE_UNAVAILABLE',
        canonPath: '#',
        details: { ref: doc },
      });
    }
  }

  return { registry, diagnostics: diags, cacheDir };
}
/* global fetch, AbortController */
