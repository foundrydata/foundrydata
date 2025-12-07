import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdtemp, rm, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { describe, expect, it, afterEach, vi } from 'vitest';

import type { PipelineResult } from '@foundrydata/core';
import { PipelineStageError } from '@foundrydata/core';

vi.mock('../src/engine/runner.js', async (importOriginal) => {
  const actual = await importOriginal();
  const stageError = new PipelineStageError(
    'validate',
    'FINAL_VALIDATION_FAILED'
  );
  const fakeResult: PipelineResult = {
    status: 'failed',
    metricsEnabled: true,
    metrics: {},
    timeline: [],
    stages: {
      normalize: { status: 'completed' },
      compose: { status: 'completed' },
      generate: { status: 'completed' },
      repair: { status: 'completed' },
      validate: { status: 'failed', error: stageError },
    },
    artifacts: {
      validationDiagnostics: [
        {
          code: 'VALIDATION_KEYWORD_FAILED',
          canonPath: '/allOf/0/then/required',
          phase: 'validate',
          details: { message: "must have required property 'metadata'" },
        },
      ],
      repairDiagnostics: [
        {
          code: 'REPAIR_REVERTED_NO_PROGRESS',
          canonPath: '#',
          phase: 'repair',
          details: { keyword: 'required' },
        },
      ],
    },
    errors: [stageError],
  };

  return {
    ...actual,
    runEngineWithArtifacts: vi.fn(async (options: { schemaId?: string }) => {
      if (options.schemaId === 'failing') {
        throw new actual.PipelineRunFailedError(fakeResult, stageError);
      }
      return actual.runEngineWithArtifacts(options as any);
    }),
  };
});

import { runBench } from '../src/bench/runner.js';

const FIXTURE_CONFIG = fileURLToPath(
  new URL('./fixtures/bench.config.smoke.json', import.meta.url)
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

    expect(summary.schemas).toHaveLength(5);
    expect(summary.schemas.map((schema) => schema.id)).toEqual([
      'simple',
      'medium',
      'pathological',
      'failing',
      'missing',
    ]);
    expect(summary.totals.schemas).toBe(5);
    expect(summary.totals.instances).toBeGreaterThan(0);

    const missing = summary.schemas.find((schema) => schema.id === 'missing');
    expect(missing?.level).toBe('blocked');
    expect(missing?.error).toBeDefined();

    await expect(
      access(join(outDir, 'bench-summary.json'))
    ).resolves.toBeUndefined();
    await expect(
      access(join(outDir, 'simple.report.json'))
    ).resolves.toBeUndefined();

    const failing = summary.schemas.find((schema) => schema.id === 'failing');
    expect(failing?.level).toBe('blocked');
    expect(failing?.diagnosticsPath).toBeDefined();
    if (failing?.diagnosticsPath) {
      const diag = JSON.parse(
        await readFile(failing.diagnosticsPath, 'utf8')
      ) as { validationDiagnostics?: Array<{ code?: string }> };
      expect(diag.validationDiagnostics?.[0]?.code).toBe(
        'VALIDATION_KEYWORD_FAILED'
      );
    }
  });
});
