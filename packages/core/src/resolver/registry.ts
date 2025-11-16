import { createHash } from 'node:crypto';

export interface RegistryEntry {
  uri: string;
  schema: unknown;
  contentHash: string; // sha256 of canonical JSON
}

/**
 * In-memory resolution registry (uri -> { schema, contentHash }) with
 * a deterministic fingerprint used in compose/plan cache keys.
 */
export class ResolutionRegistry {
  private readonly map = new Map<string, RegistryEntry>();

  add(entry: RegistryEntry): void {
    this.map.set(entry.uri, entry);
  }

  get(uri: string): RegistryEntry | undefined {
    return this.map.get(uri);
  }

  entries(): Iterable<RegistryEntry> {
    return this.map.values();
  }

  size(): number {
    return this.map.size;
  }

  /**
   * sha256(join("\n", sortUTF16Asc([ uri + " " + contentHash ]))) or "0" when empty
   */
  fingerprint(): string {
    if (this.map.size === 0) return '0';
    const lines: string[] = [];
    for (const e of this.map.values()) {
      lines.push(`${e.uri} ${e.contentHash}`);
    }
    lines.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const input = lines.join('\n');
    return createHash('sha256').update(input, 'utf8').digest('hex');
  }
}

export function stripFragment(uri: string): string {
  const idx = uri.indexOf('#');
  return idx >= 0 ? uri.slice(0, idx) : uri;
}
