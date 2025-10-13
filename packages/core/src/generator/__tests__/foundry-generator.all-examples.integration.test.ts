import { describe, it, expect } from 'vitest';
import { FoundryGenerator } from '../foundry-generator';
import * as fs from 'node:fs';
import * as path from 'node:path';

function resolveExamplesDir(): string {
  // Walk up directories from current file to find docs/examples
  let current = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(current, 'docs', 'examples');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const fallback = path.resolve(process.cwd(), 'docs/examples');
  if (fs.existsSync(fallback) && fs.statSync(fallback).isDirectory()) {
    return fallback;
  }
  throw new Error('docs/examples directory not found');
}

const EXAMPLES_DIR = resolveExamplesDir();

function loadSchema(file: string): object {
  const p = path.join(EXAMPLES_DIR, file);
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

// Discover all example schemas (JSON files) in docs/examples
const exampleFiles = fs
  .readdirSync(EXAMPLES_DIR, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.json'))
  .map((d) => d.name)
  .sort();

describe('FoundryGenerator (integration across all example schemas)', () => {
  it('has at least one example schema to test', () => {
    expect(exampleFiles.length).toBeGreaterThan(0);
  });

  for (const file of exampleFiles) {
    describe(`[example] ${file}`, () => {
      const schema = loadSchema(file);
      const title =
        typeof (schema as { title?: unknown }).title === 'string'
          ? ((schema as { title?: string }).title ?? '').toLowerCase()
          : '';
      const isMetaSchema = title.includes('meta-schema');
      const run = isMetaSchema ? it.skip : it;

      run('generates compliant, deterministic data', () => {
        const gen = new FoundryGenerator();

        const count = 50;
        const seed = 424242;
        const r1 = gen.run(schema as object, {
          count,
          seed,
          locale: 'en',
        });
        if (r1.isErr()) {
          // Dump error for diagnostics
          console.error(`[ERROR] generation failed for ${file}:`, r1.error);
        }
        expect(r1.isOk()).toBe(true);
        if (!r1.isOk()) return;
        expect(r1.value.report.compliant).toBe(true);
        expect(r1.value.report.score).toBe(100);
        expect(r1.value.items.length).toBe(count);
        expect(r1.value.metrics.itemsGenerated).toBe(count);
        // Basic metrics presence
        expect(typeof r1.value.metrics.durations.totalMs).toBe('number');
        expect(Array.isArray(r1.value.metrics.formatsUsed)).toBe(true);

        const r2 = gen.run(schema as object, {
          count,
          seed,
          locale: 'en',
        });
        if (r2.isErr()) {
          console.error(`[ERROR] re-run failed for ${file}:`, r2.error);
        }
        expect(r2.isOk()).toBe(true);
        if (!r2.isOk()) return;
        expect(r2.value.report.compliant).toBe(true);
        // Deterministic outputs
        expect(r2.value.items).toEqual(r1.value.items);
      });

      run('preserves prefix stability (M subset of N with same seed)', () => {
        const gen = new FoundryGenerator();

        const seed = 13579;
        const M = 10;
        const N = 100;

        const rShort = gen.run(schema as object, {
          count: M,
          seed,
          locale: 'en',
        });
        if (rShort.isErr()) {
          console.error(`[ERROR] short-run failed for ${file}:`, rShort.error);
        }
        expect(rShort.isOk()).toBe(true);
        if (!rShort.isOk()) return;

        const rLong = gen.run(schema as object, {
          count: N,
          seed,
          locale: 'en',
        });
        if (rLong.isErr()) {
          console.error(`[ERROR] long-run failed for ${file}:`, rLong.error);
        }
        expect(rLong.isOk()).toBe(true);
        if (!rLong.isOk()) return;

        expect(rLong.value.items.slice(0, M)).toEqual(rShort.value.items);
      });
    });
  }
});
