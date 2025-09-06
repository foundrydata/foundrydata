import { describe, it, expect } from 'vitest';
import { FoundryGenerator } from '../foundry-generator';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('FoundryGenerator (Parse → Plan → Generate → Validate)', () => {
  const resolveExamplesDir = (): string => {
    // Walk up directories from current file to find docs/examples
    let current = __dirname;
    // Limit ascent to avoid infinite loops
    for (let i = 0; i < 10; i++) {
      const candidate = path.join(current, 'docs', 'examples');
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    // Fallback: try cwd/docs/examples
    const fallback = path.resolve(process.cwd(), 'docs/examples');
    if (fs.existsSync(fallback) && fs.statSync(fallback).isDirectory()) {
      return fallback;
    }
    throw new Error('docs/examples directory not found');
  };

  const EXAMPLES_DIR = resolveExamplesDir();

  const loadExample = (name: string): object => {
    const p = path.join(EXAMPLES_DIR, name);
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw);
  };

  it('generates compliant, deterministic data for quick-test schema', () => {
    const schema = loadExample('quick-test-schema.json');
    const gen = new FoundryGenerator();

    const r1 = gen.run(schema, { count: 10, seed: 424242, locale: 'en' });
    expect(r1.isOk()).toBe(true);
    if (!r1.isOk()) return;
    expect(r1.value.report.compliant).toBe(true);
    expect(r1.value.metrics.itemsGenerated).toBe(10);

    const r2 = gen.run(schema, { count: 10, seed: 424242, locale: 'en' });
    expect(r2.isOk()).toBe(true);
    if (!r2.isOk()) return;
    expect(r2.value.report.compliant).toBe(true);
    expect(r2.value.items).toEqual(r1.value.items);
  });
});
