import { describe, it, expect, vi } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { main } from '../../packages/cli/src/index.js';

describe('README coverage examples (CLI smoke)', () => {
  it('runs the JSON Schema coverage example and writes a coverage-report/v1 file', async () => {
    const reportPath = './coverage/user.coverage.json';

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    try {
      await main([
        'node',
        'foundrydata',
        'generate',
        '--schema',
        './examples/user.schema.json',
        '--n',
        '200',
        '--coverage',
        'measure',
        '--coverage-dimensions',
        'structure,branches,enum',
        '--coverage-report',
        reportPath,
      ]);

      expect(exitSpy).not.toHaveBeenCalled();

      const contents = await readFile(reportPath, 'utf8');
      const json = JSON.parse(contents) as { version?: string };
      expect(json.version).toBe('coverage-report/v1');
    } finally {
      exitSpy.mockRestore();
      await rm(reportPath, { force: true }).catch(() => {});
    }
  }, 20_000);

  it('runs the OpenAPI coverage-guided example and produces a coverage-report/v1 file', async () => {
    const reportPath = './coverage/getUsers.coverage.json';

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);

    try {
      await main([
        'node',
        'foundrydata',
        'openapi',
        '--spec',
        './examples/users-api.json',
        '--operation-id',
        'getUsers',
        '--n',
        '500',
        '--coverage',
        'guided',
        '--coverage-profile',
        'balanced',
        '--coverage-dimensions',
        'structure,branches,enum',
        '--coverage-min',
        '0.8',
        '--coverage-report',
        reportPath,
      ]);

      const contents = await readFile(reportPath, 'utf8');
      const json = JSON.parse(contents) as { version?: string };
      expect(json.version).toBe('coverage-report/v1');
    } finally {
      exitSpy.mockRestore();
      await rm(reportPath, { force: true }).catch(() => {});
    }
  }, 30_000);
});
