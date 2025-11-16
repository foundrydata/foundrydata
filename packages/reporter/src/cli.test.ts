import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runCli, runReporterCommand } from './cli.js';

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'reporter-cli-'));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeSchema(name: string): Promise<string> {
  const schemaPath = path.join(tempDir, `${name}.json`);
  await writeFile(schemaPath, JSON.stringify({ type: 'object' }), 'utf8');
  return schemaPath;
}

describe('runReporterCommand', () => {
  it('writes requested formats to disk', async () => {
    const schemaPath = await writeSchema('schema');
    const outputs = await runReporterCommand({
      schemaPath,
      outDir: tempDir,
      formats: ['json', 'markdown'],
      seed: 7,
    });

    expect(outputs).toHaveLength(2);
    const jsonPath = outputs.find((filePath) =>
      filePath.endsWith('.report.json')
    )!;
    const markdownPath = outputs.find((filePath) =>
      filePath.endsWith('.report.md')
    )!;
    const json = await readFile(jsonPath, 'utf8');
    const markdown = await readFile(markdownPath, 'utf8');

    expect(json).toContain('"schemaId"');
    expect(markdown).toContain('# JSON Schema Report');
  });

  it('returns serialized output when stdout is requested', async () => {
    const schemaPath = await writeSchema('schema-stdout');
    const [content] = await runReporterCommand({
      schemaPath,
      formats: ['json'],
      stdout: true,
    });

    expect(content).toContain('json-schema-reporter');
  });

  it('rejects invalid stdout + multi-format combinations', async () => {
    const schemaPath = await writeSchema('schema-invalid');

    await expect(
      runReporterCommand({
        schemaPath,
        formats: ['json', 'markdown'],
        stdout: true,
      })
    ).rejects.toThrow(/--stdout/);
  });

  it('runCli streams output when stdout flag is set', async () => {
    const schemaPath = await writeSchema('cli-stdout');
    const spy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    try {
      await runCli([
        'node',
        'json-schema-reporter',
        'run',
        '--schema',
        schemaPath,
        '--stdout',
        '--format',
        'json',
      ]);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('runCli reports file paths when writing to disk', async () => {
    const schemaPath = await writeSchema('cli-files');
    const messages: string[] = [];
    const spy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        messages.push(String(chunk));
        return true;
      });
    try {
      await runCli([
        'node',
        'json-schema-reporter',
        'run',
        '--schema',
        schemaPath,
        '--out-dir',
        tempDir,
        '--format',
        'json,markdown',
      ]);
      expect(messages.some((msg) => msg.includes('.report.json'))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('runCli', () => {
  it('swallows commander help-displayed rejections', async () => {
    const error = Object.assign(new Error('help'), {
      code: 'commander.helpDisplayed',
    });
    const parseSpy = vi
      .spyOn(Command.prototype, 'parseAsync')
      .mockRejectedValue(error);
    await expect(
      runCli(['node', 'json-schema-reporter'])
    ).resolves.toBeUndefined();
    parseSpy.mockRestore();
  });
});
