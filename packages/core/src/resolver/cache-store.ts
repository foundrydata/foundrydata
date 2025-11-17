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
  contentHash: string; // canonical JSON SHA-256 (hex)
}

export interface CacheMeta {
  uri: string;
  fetchedAt: string;
  contentHash: string;
  bytes: number;
  status: string;
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

function getHostDir(root: string, uri: string): string {
  let host = '_';
  try {
    const url = new URL(uri);
    host = url.hostname.toLowerCase() || '_';
  } catch {
    host = '_';
  }
  return path.join(root, host);
}

async function readFromHostDir(
  uri: string,
  hostDir: string
): Promise<CachedDoc | undefined> {
  let dirents: Array<{ name: string; isDirectory(): boolean }>;
  try {
    dirents = await fs.readdir(hostDir, { withFileTypes: true });
  } catch {
    return undefined;
  }

  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue;
    const contentDir = path.join(hostDir, dirent.name);
    const metaPath = path.join(contentDir, 'meta.json');
    const contentPath = path.join(contentDir, 'content.json');
    try {
      const [metaRaw, contentRaw] = await Promise.all([
        fs.readFile(metaPath, 'utf8'),
        fs.readFile(contentPath, 'utf8'),
      ]);
      const meta = JSON.parse(metaRaw) as CacheMeta;
      if (meta.uri !== uri) continue;
      const schema = JSON.parse(contentRaw);
      const hash = stableHash(schema);
      const contentHash = hash?.digest ?? meta.contentHash;
      if (meta.contentHash && meta.contentHash !== contentHash) {
        // Stale entry; ignore this directory and continue scanning.
        // A future run will refresh the cache.
        continue;
      }
      return { schema, contentHash };
    } catch {
      // Ignore malformed entries and continue scanning.
      continue;
    }
  }

  return undefined;
}

export async function readFromCache(
  uri: string,
  opts: CacheStoreOptions
): Promise<CachedDoc | undefined> {
  const hostDir = getHostDir(opts.cacheDir, uri);
  try {
    const hit = await readFromHostDir(uri, hostDir);
    return hit;
  } catch {
    return undefined;
  }
}

export async function writeToCache(
  uri: string,
  schema: unknown,
  opts: CacheStoreOptions
): Promise<CachedDoc> {
  const hostDir = getHostDir(opts.cacheDir, uri);
  await fs.mkdir(hostDir, { recursive: true });

  const stable = stableHash(schema);
  const content = stable?.canonical ?? JSON.stringify(schema);
  const bytes = stable?.bytes ?? Buffer.byteLength(content, 'utf8');
  const contentHash = stable?.digest ?? sha256Hex(content);

  const contentDir = path.join(hostDir, contentHash);
  await fs.mkdir(contentDir, { recursive: true });

  const meta: CacheMeta = {
    uri,
    fetchedAt: new Date().toISOString(),
    contentHash,
    bytes,
    status: 'ok',
  };

  await Promise.all([
    fs.writeFile(path.join(contentDir, 'content.json'), content, 'utf8'),
    fs.writeFile(
      path.join(contentDir, 'meta.json'),
      JSON.stringify(meta),
      'utf8'
    ),
  ]);

  return { schema, contentHash };
}
