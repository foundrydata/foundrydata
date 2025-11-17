import { describe, it, expect } from 'vitest';
import {
  mapResolverCliOptionsToPlanOptions,
  type ResolverCliOptions,
} from '../../src/resolver/cli-mapping.js';

describe('resolver CLI mapping', () => {
  it('maps CLI flags into PlanOptions.resolver', () => {
    const cli: ResolverCliOptions = {
      resolve: 'local,remote,schemastore',
      cacheDir: '~/.foundrydata/cache-alt',
      allowHosts: ['example.com', 'api.example.com'],
      hydrateFinalAjv: false,
      stubUnresolved: 'emptySchema',
    };

    const plan = mapResolverCliOptionsToPlanOptions(cli);
    const resolver = plan.resolver!;

    expect(resolver.strategies).toEqual(['local', 'remote', 'schemastore']);
    expect(resolver.cacheDir).toBe('~/.foundrydata/cache-alt');
    expect(resolver.allowlist).toEqual(
      expect.arrayContaining(['example.com', 'api.example.com'])
    );
    expect(resolver.hydrateFinalAjv).toBe(false);
    expect(resolver.stubUnresolved).toBe('emptySchema');
  });
});
