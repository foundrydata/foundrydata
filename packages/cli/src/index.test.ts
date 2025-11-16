import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';

import { Validate as PublicValidate } from '@foundrydata/core';
import { main, program } from './index.js';

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
});
