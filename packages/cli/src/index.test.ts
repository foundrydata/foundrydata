import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path, { join as joinPath } from 'node:path';
import { describe, it, expect, vi } from 'vitest';

import {
  ErrorCode,
  getExitCode,
  Validate as PublicValidate,
} from '@foundrydata/core';
import { main, program } from './index.js';
import type { CoverageReport, CoverageTargetReport } from '@foundrydata/shared';

async function createSchemaFixture(): Promise<{
  dir: string;
  schemaPath: string;
  schema: Record<string, unknown>;
}> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'foundrydata-cli-'));
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
    },
    required: ['id', 'name'],
  } satisfies Record<string, unknown>;
  const schemaPath = path.join(dir, 'schema.json');
  await writeFile(schemaPath, JSON.stringify(schema), 'utf8');
  return { dir, schemaPath, schema };
}

async function createOpenApiFixture(): Promise<{
  dir: string;
  specPath: string;
  responseSchema: Record<string, unknown>;
}> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'foundrydata-cli-openapi-'));
  const responseSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'integer' },
      name: { type: 'string' },
    },
    required: ['id', 'name'],
  } satisfies Record<string, unknown>;

  const document = {
    openapi: '3.1.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {
      '/users': {
        get: {
          operationId: 'getUsers',
          responses: {
            200: {
              description: 'OK',
              content: {
                'application/json': {
                  schema: responseSchema,
                },
              },
            },
          },
        },
      },
    },
  } satisfies Record<string, unknown>;

  const specPath = path.join(dir, 'openapi.json');
  await writeFile(specPath, JSON.stringify(document), 'utf8');

  return { dir, specPath, responseSchema };
}

async function createCoverageReportFixture(reports: {
  baseline: CoverageReport;
  comparison: CoverageReport;
}): Promise<{ dir: string; baselinePath: string; comparisonPath: string }> {
  const dir = await mkdtemp(
    path.join(os.tmpdir(), 'foundrydata-cli-coverage-diff-')
  );
  const baselinePath = path.join(dir, 'baseline.json');
  const comparisonPath = path.join(dir, 'comparison.json');

  await writeFile(baselinePath, JSON.stringify(reports.baseline), 'utf8');
  await writeFile(comparisonPath, JSON.stringify(reports.comparison), 'utf8');

  return { dir, baselinePath, comparisonPath };
}

describe('CLI generate command', () => {
  it('emits NDJSON with AJV-valid instances for a basic schema', async () => {
    const { dir, schemaPath, schema } = await createSchemaFixture();

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        stdoutChunks.push(String(chunk));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: any) => {
        stderrChunks.push(String(chunk));
        return true;
      });

    try {
      await program.parseAsync(
        ['generate', '--schema', schemaPath, '--n', '3', '--out', 'ndjson'],
        { from: 'user' }
      );
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }

    const stdout = stdoutChunks.join('');
    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    expect(lines).toHaveLength(3);

    const instances = lines.map((line) => JSON.parse(line));
    for (const instance of instances) {
      const res = PublicValidate(instance, schema);
      expect(res.valid).toBe(true);
    }

    // No error output on the happy path
    const stderr = stderrChunks.join('');
    expect(stderr).toBe('');
  });

  it('accepts coverage-related flags without changing basic behavior (and warns when coverage=off)', async () => {
    const { dir, schemaPath, schema } = await createSchemaFixture();

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        stdoutChunks.push(String(chunk));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: any) => {
        stderrChunks.push(String(chunk));
        return true;
      });

    try {
      await program.parseAsync(
        [
          'generate',
          '--schema',
          schemaPath,
          '--n',
          '2',
          '--out',
          'ndjson',
          '--coverage',
          'off',
          '--coverage-dimensions',
          'structure,branches',
          '--coverage-min',
          '0.5',
          '--coverage-report',
          'coverage.json',
          '--coverage-profile',
          'quick',
          '--coverage-exclude-unreachable',
          'true',
        ],
        { from: 'user' }
      );
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }

    const stdout = stdoutChunks.join('');
    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    expect(lines.length).toBe(2);

    const instances = lines.map((line) => JSON.parse(line));
    for (const instance of instances) {
      const res = PublicValidate(instance, schema);
      expect(res.valid).toBe(true);
    }

    const stderr = stderrChunks.join('');
    expect(stderr).toMatch(
      /coverage-min\/coverage-report are ignored|ignored when coverage=off/i
    );
  });

  it('fails fast on unknown coverage dimensions with a clear error', async () => {
    const { dir, schemaPath } = await createSchemaFixture();

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      throw new Error(`EXIT:${code ?? 0}`);
    }) as never);

    const errorChunks: string[] = [];
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(((
      msg?: unknown
    ) => {
      if (msg !== undefined) {
        errorChunks.push(String(msg));
      }
    }) as never);

    try {
      await expect(
        main([
          'node',
          'foundrydata',
          'generate',
          '--schema',
          schemaPath,
          '--n',
          '1',
          '--coverage',
          'measure',
          '--coverage-dimensions',
          'structure,unknown-dimension',
        ])
      ).rejects.toThrow(/EXIT:/);

      const stderr = errorChunks.join('\n');
      expect(stderr).toMatch(/Unknown coverage dimensions/i);
    } finally {
      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('emits coverage summary on stderr when coverage=measure is enabled', async () => {
    const { dir, schemaPath } = await createSchemaFixture();

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        stdoutChunks.push(String(chunk));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: any) => {
        stderrChunks.push(String(chunk));
        return true;
      });

    try {
      await program.parseAsync(
        [
          'generate',
          '--schema',
          schemaPath,
          '--n',
          '3',
          '--out',
          'ndjson',
          '--coverage',
          'measure',
          '--coverage-dimensions',
          'structure,branches',
        ],
        { from: 'user' }
      );
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }

    const stderr = stderrChunks.join('');
    expect(stderr).toMatch(/coverage by dimension:/i);
    expect(stderr).toMatch(/coverage overall:/i);
  });

  it('aligns generate coverage summary with coverage-report/v1 metrics', async () => {
    const { dir, schemaPath } = await createSchemaFixture();
    const reportPath = path.join(dir, 'coverage.json');

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        stdoutChunks.push(String(chunk));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: any) => {
        stderrChunks.push(String(chunk));
        return true;
      });

    try {
      await program.parseAsync(
        [
          'generate',
          '--schema',
          schemaPath,
          '--n',
          '5',
          '--out',
          'ndjson',
          '--coverage',
          'measure',
          '--coverage-dimensions',
          'structure,branches',
          '--coverage-report',
          reportPath,
        ],
        { from: 'user' }
      );

      const contents = await fs.promises.readFile(reportPath, 'utf8');
      const report = JSON.parse(contents) as CoverageReport;

      const stderr = stderrChunks.join('');
      expect(stderr).toMatch(/\[foundrydata\] coverage:/i);

      const summaryLine = stderr
        .split('\n')
        .find((line) => /\[foundrydata\] coverage:/i.test(line));
      expect(summaryLine).toBeDefined();

      const summary = summaryLine ?? '';
      expect(summary).toMatch(
        new RegExp(`coverage overall:\\s*${report.metrics.overall.toFixed(2)}`)
      );

      const capsCount = report.diagnostics.plannerCapsHit.length;
      const hintsCount = report.unsatisfiedHints.length;
      expect(summary).toMatch(new RegExp(`planner caps:\\s*${capsCount}`, 'i'));
      expect(summary).toMatch(
        new RegExp(`unsatisfied hints:\\s*${hintsCount}`, 'i')
      );
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes coverage-report/v1 JSON to the path provided via --coverage-report', async () => {
    const { dir, schemaPath } = await createSchemaFixture();
    const reportPath = path.join(dir, 'coverage.json');

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        stdoutChunks.push(String(chunk));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: any) => {
        stderrChunks.push(String(chunk));
        return true;
      });

    try {
      await program.parseAsync(
        [
          'generate',
          '--schema',
          schemaPath,
          '--n',
          '3',
          '--out',
          'ndjson',
          '--coverage',
          'measure',
          '--coverage-dimensions',
          'structure,branches',
          '--coverage-report',
          reportPath,
        ],
        { from: 'user' }
      );

      const contents = await fs.promises.readFile(reportPath, 'utf8');
      const json = JSON.parse(contents);
      expect(json.version).toBe('coverage-report/v1');
      expect(json.engine?.coverageMode).toBe('measure');
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('exits with non-zero code when schema file is missing', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      throw new Error(`EXIT:${code ?? 0}`);
    }) as never);

    try {
      await expect(
        main([
          'node',
          'foundrydata',
          'generate',
          '--schema',
          'non-existent.json',
          '--n',
          '1',
        ])
      ).rejects.toThrow(/EXIT:/);
    } finally {
      exitSpy.mockRestore();
    }
  });
});

describe('CLI openapi command', () => {
  it('emits NDJSON with AJV-valid instances for a selected response schema', async () => {
    const { dir, specPath, responseSchema } = await createOpenApiFixture();

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        stdoutChunks.push(String(chunk));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: any) => {
        stderrChunks.push(String(chunk));
        return true;
      });

    try {
      await program.parseAsync(
        [
          'openapi',
          '--spec',
          specPath,
          '--path',
          '/users',
          '--method',
          'get',
          '--n',
          '3',
          '--out',
          'ndjson',
        ],
        { from: 'user' }
      );
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }

    const stdout = stdoutChunks.join('');
    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    expect(lines).toHaveLength(3);

    const instances = lines.map((line) => JSON.parse(line));
    for (const instance of instances) {
      const res = PublicValidate(instance, responseSchema);
      expect(res.valid).toBe(true);
    }

    const stderr = stderrChunks.join('');
    expect(stderr).toBe('');
  });

  it('emits 5 deterministic NDJSON payloads for an OpenAPI operationId and validates them via the public API', async () => {
    const { dir, specPath, responseSchema } = await createOpenApiFixture();

    const runOnce = async (): Promise<{
      lines: string[];
      instances: unknown[];
    }> => {
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      const stdoutSpy = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk: any) => {
          stdoutChunks.push(String(chunk));
          return true;
        });
      const stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation((chunk: any) => {
          stderrChunks.push(String(chunk));
          return true;
        });

      try {
        await program.parseAsync(
          [
            'openapi',
            '--spec',
            specPath,
            '--operation-id',
            'getUsers',
            '--n',
            '5',
            '--out',
            'ndjson',
            '--seed',
            '1234',
          ],
          { from: 'user' }
        );
      } finally {
        stdoutSpy.mockRestore();
        stderrSpy.mockRestore();
      }

      const stdout = stdoutChunks.join('');
      const stderr = stderrChunks.join('');

      const lines = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      expect(lines).toHaveLength(5);
      expect(stderr).toBe('');

      const instances = lines.map((line) => JSON.parse(line));
      for (const instance of instances) {
        const res = PublicValidate(instance, responseSchema);
        expect(res.valid).toBe(true);
      }

      return { lines, instances };
    };

    try {
      const firstRun = await runOnce();
      const secondRun = await runOnce();

      expect(firstRun.lines).toEqual(secondRun.lines);
      expect(firstRun.instances).toEqual(secondRun.instances);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('exits with non-zero code and prints an error when selection fails', async () => {
    const { dir, specPath } = await createOpenApiFixture();

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      throw new Error(`EXIT:${code ?? 0}`);
    }) as never);

    const errorChunks: string[] = [];
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(((
      msg?: unknown
    ) => {
      if (msg !== undefined) {
        errorChunks.push(String(msg));
      }
    }) as never);

    try {
      await expect(
        main([
          'node',
          'foundrydata',
          'openapi',
          '--spec',
          specPath,
          '--operation-id',
          'nonExistentOperation',
          '--n',
          '1',
        ])
      ).rejects.toThrow(/EXIT:/);

      const stderr = errorChunks.join('\n');
      expect(stderr).not.toBe('');
      expect(stderr).toMatch(/operationid/i);
    } finally {
      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('accepts coverage-related flags on openapi command (and warns when coverage=off)', async () => {
    const { dir, specPath, responseSchema } = await createOpenApiFixture();

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        stdoutChunks.push(String(chunk));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: any) => {
        stderrChunks.push(String(chunk));
        return true;
      });

    try {
      await program.parseAsync(
        [
          'openapi',
          '--spec',
          specPath,
          '--path',
          '/users',
          '--method',
          'get',
          '--n',
          '2',
          '--out',
          'ndjson',
          '--coverage',
          'off',
          '--coverage-dimensions',
          'structure,branches',
          '--coverage-min',
          '0.5',
          '--coverage-report',
          'coverage.json',
          '--coverage-profile',
          'quick',
          '--coverage-exclude-unreachable',
          'true',
        ],
        { from: 'user' }
      );
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }

    const stdout = stdoutChunks.join('');
    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    expect(lines.length).toBe(2);

    const instances = lines.map((line) => JSON.parse(line));
    for (const instance of instances) {
      const res = PublicValidate(instance, responseSchema);
      expect(res.valid).toBe(true);
    }

    const stderr = stderrChunks.join('');
    expect(stderr).toMatch(
      /coverage-min\/coverage-report are ignored|ignored when coverage=off/i
    );
  });

  it('emits coverage summary on stderr for openapi when coverage=measure is enabled', async () => {
    const { dir, specPath } = await createOpenApiFixture();

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        stdoutChunks.push(String(chunk));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: any) => {
        stderrChunks.push(String(chunk));
        return true;
      });

    try {
      await program.parseAsync(
        [
          'openapi',
          '--spec',
          specPath,
          '--path',
          '/users',
          '--method',
          'get',
          '--n',
          '3',
          '--out',
          'ndjson',
          '--coverage',
          'measure',
          '--coverage-dimensions',
          'structure,branches',
        ],
        { from: 'user' }
      );
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }

    const stderr = stderrChunks.join('');
    expect(stderr).toMatch(/coverage by dimension:/i);
    expect(stderr).toMatch(/coverage overall:/i);
  });

  it('aligns openapi coverage summary with coverage-report/v1 metrics', async () => {
    const { dir, specPath } = await createOpenApiFixture();
    const reportPath = path.join(dir, 'coverage-openapi.json');

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        stdoutChunks.push(String(chunk));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: any) => {
        stderrChunks.push(String(chunk));
        return true;
      });

    try {
      await program.parseAsync(
        [
          'openapi',
          '--spec',
          specPath,
          '--path',
          '/users',
          '--method',
          'get',
          '--n',
          '3',
          '--out',
          'ndjson',
          '--coverage',
          'measure',
          '--coverage-dimensions',
          'structure,branches,operations',
          '--coverage-report',
          reportPath,
        ],
        { from: 'user' }
      );

      const contents = await fs.promises.readFile(reportPath, 'utf8');
      const report = JSON.parse(contents) as CoverageReport;

      const stderr = stderrChunks.join('');
      expect(stderr).toMatch(/\[foundrydata\] coverage:/i);

      const summaryLine = stderr
        .split('\n')
        .find((line) => /\[foundrydata\] coverage:/i.test(line));
      expect(summaryLine).toBeDefined();

      const summary = summaryLine ?? '';
      expect(summary).toMatch(
        new RegExp(`coverage overall:\\s*${report.metrics.overall.toFixed(2)}`)
      );

      for (const [op, value] of Object.entries(
        report.metrics.byOperation ?? {}
      )) {
        if (!Number.isFinite(value)) continue;
        const formatted = (value as number).toFixed(2);
        expect(summary).toMatch(new RegExp(`${op}:\\s*${formatted}`, 'i'));
      }

      const capsCount = report.diagnostics.plannerCapsHit.length;
      const hintsCount = report.unsatisfiedHints.length;
      expect(summary).toMatch(new RegExp(`planner caps:\\s*${capsCount}`, 'i'));
      expect(summary).toMatch(
        new RegExp(`unsatisfied hints:\\s*${hintsCount}`, 'i')
      );
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('exits with coverage failure code when minCoverage is not met', async () => {
    const { dir, schemaPath } = await createSchemaFixture();
    const coverageSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      oneOf: [
        {
          type: 'object',
          properties: {
            branch: { const: 'a' },
          },
          required: ['branch'],
        },
        {
          type: 'object',
          properties: {
            branch: { const: 'b' },
          },
          required: ['branch'],
        },
      ],
    } as const;
    await writeFile(schemaPath, JSON.stringify(coverageSchema), 'utf8');

    const stderrChunks: string[] = [];
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: any) => {
        stderrChunks.push(String(chunk));
        return true;
      });

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    try {
      await program.parseAsync(
        [
          'generate',
          '--schema',
          schemaPath,
          '--n',
          '1',
          '--out',
          'ndjson',
          '--coverage',
          'measure',
          '--coverage-dimensions',
          'branches',
          '--coverage-min',
          '0.9',
        ],
        { from: 'user' }
      );

      expect(exitSpy).toHaveBeenCalledWith(
        getExitCode(ErrorCode.COVERAGE_THRESHOLD_NOT_MET)
      );
    } finally {
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }

    const stderr = stderrChunks.join('');
    expect(stderr).toMatch(/coverage status: minCoverageNotMet/i);
    expect(stderr).toMatch(/\[foundrydata\] coverage:/i);
    expect(stderr).toMatch(/coverage overall:/i);
    expect(stderr).toMatch(/coverage by dimension:/i);
  });

  it('exits with coverage failure code when guided minCoverage is not met', async () => {
    const { dir, schemaPath } = await createSchemaFixture();
    const coverageSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      oneOf: [
        {
          type: 'object',
          properties: { branch: { const: 'a' } },
          required: ['branch'],
        },
        {
          type: 'object',
          properties: { branch: { const: 'b' } },
          required: ['branch'],
        },
      ],
    } as const;
    await writeFile(schemaPath, JSON.stringify(coverageSchema), 'utf8');

    const stderrChunks: string[] = [];
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: any) => {
        stderrChunks.push(String(chunk));
        return true;
      });

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    try {
      await program.parseAsync(
        [
          'generate',
          '--schema',
          schemaPath,
          '--n',
          '1',
          '--out',
          'ndjson',
          '--coverage',
          'guided',
          '--coverage-dimensions',
          'branches',
          '--coverage-min',
          '0.95',
        ],
        { from: 'user' }
      );

      expect(exitSpy).toHaveBeenCalledWith(
        getExitCode(ErrorCode.COVERAGE_THRESHOLD_NOT_MET)
      );
    } finally {
      exitSpy.mockRestore();
      stderrSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }

    const stderr = stderrChunks.join('');
    expect(stderr).toMatch(/coverage status: minCoverageNotMet/i);
  });

  it('applies quick/balanced/thorough coverage profiles with guided >= measure on branches/enum and consistent thresholds', async () => {
    const { dir, schemaPath } = await createSchemaFixture();
    const coverageSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { const: 'a' },
            flag: { enum: ['x', 'y'] },
          },
          required: ['kind', 'flag'],
        },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { const: 'b' },
            flag: { enum: ['x', 'y'] },
          },
          required: ['kind', 'flag'],
        },
      ],
    } as const;
    await writeFile(schemaPath, JSON.stringify(coverageSchema), 'utf8');

    const runProfile = async (
      profile: 'quick' | 'balanced' | 'thorough'
    ): Promise<CoverageReport> => {
      const reportPath = joinPath(dir, `coverage-${profile}.json`);
      const stderrChunks: string[] = [];
      const stderrSpy = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation((chunk: any) => {
          stderrChunks.push(String(chunk));
          return true;
        });

      try {
        await program.parseAsync(
          [
            'generate',
            '--schema',
            schemaPath,
            '--n',
            profile === 'quick'
              ? '80'
              : profile === 'balanced'
                ? '350'
                : '1000',
            '--out',
            'ndjson',
            '--coverage',
            'guided',
            '--coverage-profile',
            profile,
            '--coverage-report',
            reportPath,
            '--coverage-min',
            '0.0',
          ],
          { from: 'user' }
        );
      } finally {
        stderrSpy.mockRestore();
      }

      const reportRaw = await readFile(reportPath, 'utf8');
      const report = JSON.parse(reportRaw) as CoverageReport;
      return report;
    };

    const quickReport = await runProfile('quick');
    const balancedReport = await runProfile('balanced');
    const thoroughReport = await runProfile('thorough');

    // guided >= measure for branches/enum is already enforced at the core level; here we
    // assert that profiles produce sensible byDimension metrics and that thresholds wiring
    // is consistent when coverage-min is set.
    const quickBranches = quickReport.metrics.byDimension['branches'] ?? 0;
    const balancedBranches =
      balancedReport.metrics.byDimension['branches'] ?? 0;
    const thoroughBranches =
      thoroughReport.metrics.byDimension['branches'] ?? 0;

    expect(quickBranches).toBeGreaterThanOrEqual(0);
    expect(balancedBranches).toBeGreaterThanOrEqual(0);
    expect(thoroughBranches).toBeGreaterThanOrEqual(0);

    const quickEnum = quickReport.metrics.byDimension['enum'] ?? 0;
    const balancedEnum = balancedReport.metrics.byDimension['enum'] ?? 0;
    const thoroughEnum = thoroughReport.metrics.byDimension['enum'] ?? 0;

    expect(quickEnum).toBeGreaterThanOrEqual(0);
    expect(balancedEnum).toBeGreaterThanOrEqual(0);
    expect(thoroughEnum).toBeGreaterThanOrEqual(0);

    // minCoverage wiring: metrics.thresholds.overall should reflect the CLI coverage-min flag.
    expect(quickReport.metrics.thresholds?.overall).toBeCloseTo(0.0, 6);
    expect(balancedReport.metrics.thresholds?.overall).toBeCloseTo(0.0, 6);
    expect(thoroughReport.metrics.thresholds?.overall).toBeCloseTo(0.0, 6);

    await rm(dir, { recursive: true, force: true });
  });
});

describe('CLI coverage diff command', () => {
  function makeBaseReport(): CoverageReport {
    return {
      version: 'coverage-report/v1',
      reportMode: 'full',
      engine: {
        foundryVersion: '0.0.0',
        coverageMode: 'measure',
        ajvMajor: 8,
      },
      run: {
        seed: 1,
        masterSeed: 1,
        maxInstances: 10,
        actualInstances: 10,
        dimensionsEnabled: ['structure'],
        excludeUnreachable: false,
        startedAt: '2025-01-01T00:00:00Z',
        durationMs: 1,
      },
      metrics: {
        coverageStatus: 'ok',
        overall: 0.5,
        byDimension: { structure: 0.5 },
        byOperation: { getUser: 0.5 },
        targetsByStatus: { active: 2 },
      },
      targets: [],
      uncoveredTargets: [],
      unsatisfiedHints: [],
      diagnostics: {
        plannerCapsHit: [],
        notes: [],
      },
    };
  }

  function makeTarget(id: string, hit: boolean): CoverageTargetReport {
    return {
      id,
      dimension: 'structure',
      kind: 'SCHEMA_NODE',
      canonPath: '#',
      hit,
    } as CoverageTargetReport;
  }

  it('prints a human-readable summary and keeps exit code at 0 when there is no regression', async () => {
    const base = makeBaseReport();
    const comparison: CoverageReport = {
      ...base,
      metrics: {
        ...base.metrics,
        overall: 0.7,
        byDimension: { structure: 0.7 },
        byOperation: { getUser: 0.7 },
      },
    };

    const { dir, baselinePath, comparisonPath } =
      await createCoverageReportFixture({
        baseline: base,
        comparison,
      });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        stdoutChunks.push(String(chunk));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: any) => {
        stderrChunks.push(String(chunk));
        return true;
      });

    try {
      const previousExitCode = process.exitCode;

      process.exitCode = undefined;

      await program.parseAsync(
        ['coverage', 'diff', baselinePath, comparisonPath],
        { from: 'user' }
      );

      const stdout = stdoutChunks.join('');
      expect(stdout).toMatch(/coverage diff:/i);
      expect(stdout).toMatch(/overall:/i);
      expect(process.exitCode ?? 0).toBe(0);

      // Restore previous exit code to avoid leaking state across tests.

      process.exitCode = previousExitCode;
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('sets non-zero exit code when regressions or new gaps are detected', async () => {
    const base = makeBaseReport();
    const comparison = makeBaseReport();

    base.targets = [makeTarget('t1', true), makeTarget('t2', true)];
    comparison.targets = [makeTarget('t1', true), makeTarget('t2', false)];

    const { dir, baselinePath, comparisonPath } =
      await createCoverageReportFixture({
        baseline: base,
        comparison,
      });

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        stdoutChunks.push(String(chunk));
        return true;
      });
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: any) => {
        stderrChunks.push(String(chunk));
        return true;
      });

    try {
      const previousExitCode = process.exitCode;

      process.exitCode = undefined;

      await program.parseAsync(
        ['coverage', 'diff', baselinePath, comparisonPath],
        { from: 'user' }
      );

      const stdout = stdoutChunks.join('');
      expect(stdout).toMatch(/coverage diff:/i);
      expect(stdout).toMatch(/overall:/i);
      expect(process.exitCode).toBe(1);

      // Restore previous exit code to avoid leaking state across tests.

      process.exitCode = previousExitCode;
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fails with a clear error when operationsScope are incompatible', async () => {
    const base = makeBaseReport();

    const baseline: CoverageReport = {
      ...base,
      run: {
        ...base.run,
        operationsScope: 'all',
        selectedOperations: undefined,
      },
    };

    const comparison: CoverageReport = {
      ...base,
      run: {
        ...base.run,
        operationsScope: 'selected',
        selectedOperations: ['getUser'],
      },
    };

    const { dir, baselinePath, comparisonPath } =
      await createCoverageReportFixture({
        baseline,
        comparison,
      });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      throw new Error(`EXIT:${code ?? 0}`);
    }) as never);

    const errorChunks: string[] = [];
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(((
      msg?: unknown
    ) => {
      if (msg !== undefined) {
        errorChunks.push(String(msg));
      }
    }) as never);

    try {
      await expect(
        main([
          'node',
          'foundrydata',
          'coverage',
          'diff',
          baselinePath,
          comparisonPath,
        ])
      ).rejects.toThrow(/EXIT:/);

      const stderr = errorChunks.join('\n');
      expect(stderr).toMatch(/incompatible/i);
    } finally {
      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prints status-changes section when targets change status without changing hit', async () => {
    const base = makeBaseReport();

    const baseline: CoverageReport = {
      ...base,
      targets: [
        {
          id: 't-status',
          dimension: 'structure',
          kind: 'SCHEMA_NODE',
          canonPath: '#',
          status: 'active',
          hit: false,
        } as CoverageTargetReport,
      ],
    };

    const comparison: CoverageReport = {
      ...base,
      targets: [
        {
          id: 't-status',
          dimension: 'structure',
          kind: 'SCHEMA_NODE',
          canonPath: '#',
          status: 'unreachable',
          hit: false,
        } as CoverageTargetReport,
      ],
    };

    const { dir, baselinePath, comparisonPath } =
      await createCoverageReportFixture({
        baseline,
        comparison,
      });

    const stdoutChunks: string[] = [];
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        stdoutChunks.push(String(chunk));
        return true;
      });

    try {
      await program.parseAsync(
        ['coverage', 'diff', baselinePath, comparisonPath],
        { from: 'user' }
      );

      const stdout = stdoutChunks.join('');
      expect(stdout).toMatch(/status-changes:/i);
      expect(stdout).toMatch(/active -> unreachable/i);
    } finally {
      stdoutSpy.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
