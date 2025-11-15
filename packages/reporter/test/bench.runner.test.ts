import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { describe, expect, it, afterEach } from 'vitest';

import { runBench } from '../src/bench/runner.js';

const FIXTURE_CONFIG = fileURLToPath(
  new URL('./fixtures/bench.config.json', import.meta.url)
);

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'reporter-bench-'));
}

describe('bench runner', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
  });

  it('runs schemas defined in the bench config and writes reports + summary', async () => {
    const outDir = await createTempDir();
    tempDirs.push(outDir);

    const summary = await runBench({
      configPath: FIXTURE_CONFIG,
      outDir,
      format: ['json'],
      seed: 123,
    });

    expect(summary.schemas).toHaveLength(1);
    expect(summary.schemas[0]?.id).toBe('simple');
    expect(summary.totals.schemas).toBe(1);
    expect(summary.totals.instances).toBeGreaterThan(0);

    await expect(
      access(join(outDir, 'bench-summary.json'))
    ).resolves.toBeUndefined();
    await expect(
      access(join(outDir, 'simple.report.json'))
    ).resolves.toBeUndefined();
  });
});
