/* eslint-disable max-lines-per-function */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  prefetchAndBuildRegistry,
  type ResolverOptions as HttpResolverOptions,
} from '../packages/core/src/resolver/http-resolver.js';
import { stripFragment } from '../packages/core/src/resolver/registry.js';
import { summarizeExternalRefs } from '../packages/core/src/util/modes.js';
import { discoverCorpusSchemasFromDir } from '../packages/core/src/pipeline/corpus-harness.js';

const DEFAULT_CORPUS_DIR = 'profiles/real-world';
const DEFAULT_CACHE_DIR = '~/.foundrydata/cache';
const DEFAULT_STRATEGIES = 'local,remote,schemastore';
const DEFAULT_OUT_DIR = 'snapshots';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_DOCS = 64;
const DEFAULT_MAX_REF_DEPTH = 16;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_FOLLOW_REDIRECTS = 3;

interface CliOptions {
  corpusDir: string;
  cacheDir: string;
  strategies: string;
  allowHosts: string[];
  outFile?: string;
  retries: number;
  userAgent?: string;
}

// eslint-disable-next-line complexity
function parseArgs(argv: string[]): CliOptions {
  let corpusDir = DEFAULT_CORPUS_DIR;
  let cacheDir = DEFAULT_CACHE_DIR;
  let strategies = DEFAULT_STRATEGIES;
  let outFile: string | undefined;
  const allowHosts: string[] = [];
  let retries = 1;
  let userAgent: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;
    if (arg === '--corpus' && argv[index + 1]) {
      corpusDir = argv[index + 1]!;
      index += 1;
    } else if (arg.startsWith('--corpus=')) {
      corpusDir = arg.slice('--corpus='.length);
    } else if (arg === '--cache-dir' && argv[index + 1]) {
      cacheDir = argv[index + 1]!;
      index += 1;
    } else if (arg.startsWith('--cache-dir=')) {
      cacheDir = arg.slice('--cache-dir='.length);
    } else if (arg === '--resolve' && argv[index + 1]) {
      strategies = argv[index + 1]!;
      index += 1;
    } else if (arg.startsWith('--resolve=')) {
      strategies = arg.slice('--resolve='.length);
    } else if (arg === '--allow-host' && argv[index + 1]) {
      allowHosts.push(argv[index + 1]!);
      index += 1;
    } else if (arg.startsWith('--allow-host=')) {
      allowHosts.push(arg.slice('--allow-host='.length));
    } else if (arg === '--out' && argv[index + 1]) {
      outFile = argv[index + 1]!;
      index += 1;
    } else if (arg.startsWith('--out=')) {
      outFile = arg.slice('--out='.length);
    } else if (arg === '--retries' && argv[index + 1]) {
      const parsed = Number.parseInt(argv[index + 1]!, 10);
      if (Number.isFinite(parsed)) {
        retries = parsed;
      }
      index += 1;
    } else if (arg.startsWith('--retries=')) {
      const parsed = Number.parseInt(arg.slice('--retries='.length), 10);
      if (Number.isFinite(parsed)) {
        retries = parsed;
      }
    } else if (arg === '--user-agent' && argv[index + 1]) {
      userAgent = argv[index + 1]!;
      index += 1;
    } else if (arg.startsWith('--user-agent=')) {
      userAgent = arg.slice('--user-agent='.length);
    }
  }

  return {
    corpusDir,
    cacheDir,
    strategies,
    allowHosts,
    outFile,
    retries,
    userAgent,
  };
}

function parseStrategies(
  raw: string
): Array<'local' | 'remote' | 'schemastore'> {
  return raw
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0) as Array<
    'local' | 'remote' | 'schemastore'
  >;
}

async function collectExternalRefs(corpusDir: string): Promise<string[]> {
  const schemas = await discoverCorpusSchemasFromDir(corpusDir);
  const refs = new Set<string>();
  for (const entry of schemas) {
    try {
      const { extRefs } = summarizeExternalRefs(entry.schema as object);
      for (const ref of extRefs) {
        const doc = stripFragment(ref);
        // eslint-disable-next-line max-depth
        if (doc) refs.add(doc);
      }
    } catch {
      // Ignore schemas that fail to parse or scan; best-effort snapshot.
      continue;
    }
  }
  // Ensure commonly-needed SchemaStore package schema is included.
  refs.add('https://json.schemastore.org/package');
  return Array.from(refs);
}

function formatDefaultOutPath(fingerprint: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const short = fingerprint.slice(0, 8);
  return path.join(DEFAULT_OUT_DIR, `registry-${date}-${short}.ndjson`);
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const extRefs = await collectExternalRefs(cli.corpusDir);
  const strategies = parseStrategies(cli.strategies);
  const startMessage = [
    '[build-resolver-snapshot]',
    `corpus=${path.resolve(cli.corpusDir)}`,
    `extRefs=${extRefs.length}`,
    `strategies=${strategies.join(',')}`,
    `cacheDir=${cli.cacheDir}`,
  ].join(' · ');
  process.stdout.write(`${startMessage}\n`);

  const httpOptions: HttpResolverOptions = {
    strategies,
    cacheDir: cli.cacheDir,
    allowHosts: cli.allowHosts,
    maxDocs: DEFAULT_MAX_DOCS,
    maxRefDepth: DEFAULT_MAX_REF_DEPTH,
    maxBytesPerDoc: DEFAULT_MAX_BYTES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    followRedirects: DEFAULT_FOLLOW_REDIRECTS,
    acceptYaml: true,
    retries: Math.max(0, cli.retries),
    userAgent: cli.userAgent,
  };
  const prefetch = await prefetchAndBuildRegistry(extRefs, httpOptions);
  const registry = prefetch.registry;
  const fingerprint = registry.fingerprint();

  const entries = Array.from(registry.entries()).sort((a, b) =>
    a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0
  );

  const lines: string[] = [];
  for (const entry of entries) {
    lines.push(
      JSON.stringify({
        uri: entry.uri,
        contentHash: entry.contentHash,
        dialect: entry.meta?.dialect,
        body: entry.schema,
      })
    );
  }
  lines.push(JSON.stringify({ fingerprint, count: entries.length }));

  const outPath = path.resolve(
    cli.outFile ?? formatDefaultOutPath(fingerprint)
  );
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${lines.join('\n')}\n`, 'utf8');

  const diagCounts = prefetch.diagnostics.reduce<Record<string, number>>(
    (acc, diag) => {
      acc[diag.code] = (acc[diag.code] ?? 0) + 1;
      return acc;
    },
    {}
  );

  process.stdout.write(
    [
      `[build-resolver-snapshot] wrote ${entries.length} docs to ${outPath}`,
      `fingerprint=${fingerprint}`,
      `diagCodes=${JSON.stringify(diagCounts)}`,
    ].join(' · ') + '\n'
  );
}

const executedDirectly =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (executedDirectly) {
  main().catch((error) => {
    console.error('Snapshot build failed:', error);
    process.exitCode = 1;
  });
}
