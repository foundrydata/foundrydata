import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { stableHash } from '../util/stable-hash.js';

export interface CacheStoreOptions {
  cacheDir: string; // absolute, ~ expanded
}

export interface CachedDoc {
  schema: unknown;
  contentHash: string; // canonical JSON sha256
}

function expandHome(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export function canonicalizeCacheDir(dir: string): string {
  const expanded = expandHome(dir);
  return path.resolve(expanded);
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function uriKey(uri: string): string {
  return sha256Hex(uri);
}

export async function readFromCache(
  uri: string,
  opts: CacheStoreOptions
): Promise<CachedDoc | undefined> {
  const base = path.join(opts.cacheDir, uriKey(uri));
  const metaPath = path.join(base, 'meta.json');
  const contentPath = path.join(base, 'content.json');
  try {
    const [metaRaw, contentRaw] = await Promise.all([
      fs.readFile(metaPath, 'utf8'),
      fs.readFile(contentPath, 'utf8'),
    ]);
    const meta = JSON.parse(metaRaw) as { contentHash?: string };
    const schema = JSON.parse(contentRaw);
    const hash = stableHash(schema);
    const contentHash = hash?.digest ?? '';
    if (meta?.contentHash && meta.contentHash !== contentHash) {
      // stale entry; ignore
      return undefined;
    }
    return { schema, contentHash };
  } catch {
    return undefined;
  }
}

export async function writeToCache(
  uri: string,
  schema: unknown,
  opts: CacheStoreOptions
): Promise<CachedDoc> {
  const base = path.join(opts.cacheDir, uriKey(uri));
  await fs.mkdir(base, { recursive: true });
  const content = JSON.stringify(schema);
  const contentHash = stableHash(schema)?.digest ?? sha256Hex(content);
  const meta = { uri, contentHash };
  await Promise.all([
    fs.writeFile(path.join(base, 'content.json'), content, 'utf8'),
    fs.writeFile(path.join(base, 'meta.json'), JSON.stringify(meta), 'utf8'),
  ]);
  return { schema, contentHash };
}
