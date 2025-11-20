import { promises as fs } from 'node:fs';
import { ResolutionRegistry, type RegistryEntry } from './registry.js';
import { stableHash } from '../util/stable-hash.js';

export interface SnapshotLoadDiagnostics {
  code: string;
  canonPath: string;
  details?: unknown;
}

export interface SnapshotLoadResult {
  entries: RegistryEntry[];
  declaredFingerprint?: string;
  diagnostics: SnapshotLoadDiagnostics[];
}

// eslint-disable-next-line complexity, max-lines-per-function
export async function loadSnapshotFromFile(
  snapshotPath: string
): Promise<SnapshotLoadResult> {
  const diagnostics: SnapshotLoadDiagnostics[] = [];
  let declaredFingerprint: string | undefined;
  const entries: RegistryEntry[] = [];

  const raw = await fs.readFile(snapshotPath, 'utf8');
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.fingerprint === 'string' &&
        !parsed.uri
      ) {
        declaredFingerprint = parsed.fingerprint;
        continue;
      }

      const uri = typeof parsed.uri === 'string' ? parsed.uri : undefined;
      const body =
        parsed.body !== undefined ? parsed.body : (parsed.schema as unknown);
      const providedHash =
        typeof parsed.contentHash === 'string' && parsed.contentHash.trim()
          ? parsed.contentHash.trim()
          : undefined;
      const dialect =
        typeof parsed.dialect === 'string' && parsed.dialect.trim()
          ? parsed.dialect.trim()
          : undefined;

      if (!uri || body === undefined) {
        diagnostics.push({
          code: 'RESOLVER_SNAPSHOT_LOAD_FAILED',
          canonPath: '#',
          details: {
            reason: 'invalid-entry',
            line,
          },
        });
        continue;
      }

      let contentHash = providedHash;
      if (!contentHash) {
        const stable = stableHash(body);
        // eslint-disable-next-line max-depth
        if (stable?.digest) {
          contentHash = stable.digest;
        } else {
          diagnostics.push({
            code: 'RESOLVER_SNAPSHOT_LOAD_FAILED',
            canonPath: '#',
            details: {
              reason: 'hash-failed',
              uri,
            },
          });
          continue;
        }
      }

      entries.push({
        uri,
        schema: body,
        contentHash,
        meta: {
          contentHash,
          dialect,
        },
      });
    } catch (error) {
      diagnostics.push({
        code: 'RESOLVER_SNAPSHOT_LOAD_FAILED',
        canonPath: '#',
        details: {
          reason: 'parse-error',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  return { entries, declaredFingerprint, diagnostics };
}

export function buildRegistryFromEntries(
  entries: RegistryEntry[]
): ResolutionRegistry {
  const registry = new ResolutionRegistry();
  for (const entry of entries) {
    registry.add(entry);
  }
  return registry;
}
