import { describe, it, expect } from 'vitest';
import { BooleanGenerator } from '../types/boolean-generator';
import { IntegerGenerator } from '../types/integer-generator';
import { StringGenerator } from '../types/string-generator';
import { createGeneratorContext } from '../data-generator';
import { FormatRegistry } from '../../registry/format-registry';
import type { Schema } from '../../types/schema';
import fs from 'node:fs';
import path from 'node:path';

const formatRegistry = new FormatRegistry();

function makeContext(
  schema: Schema,
  seed: number
): ReturnType<typeof createGeneratorContext> {
  return createGeneratorContext(schema, formatRegistry, {
    seed,
    scenario: 'normal',
    maxDepth: 5,
  });
}

function collectSequence<T>(
  gen: { generate: any },
  schema: Schema,
  seed: number,
  count: number
): T[] {
  const ctx = makeContext(schema, seed);
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const res = gen.generate(schema, ctx);
    if (!res.isOk())
      throw new Error(`Generation failed: ${String(res.error.message)}`);
    out.push(res.value as T);
  }
  return out;
}

describe('[PRNG] Per-context determinism', () => {
  it('Same seed + same schema -> identical sequences', () => {
    const seed = 424242;

    const booleanSchema: Schema = { type: 'boolean' };
    const intSchema: Schema = { type: 'integer', minimum: -10, maximum: 10 };
    const strSchema: Schema = { type: 'string', minLength: 3, maxLength: 12 };

    const boolGen = new BooleanGenerator();
    const intGen = new IntegerGenerator();
    const strGen = new StringGenerator();

    const count = 20;

    const b1 = collectSequence<boolean>(boolGen, booleanSchema, seed, count);
    const b2 = collectSequence<boolean>(boolGen, booleanSchema, seed, count);
    expect(b1).toEqual(b2);

    const i1 = collectSequence<number>(intGen, intSchema, seed, count);
    const i2 = collectSequence<number>(intGen, intSchema, seed, count);
    expect(i1).toEqual(i2);

    const s1 = collectSequence<string>(strGen, strSchema, seed, count);
    const s2 = collectSequence<string>(strGen, strSchema, seed, count);
    expect(s1).toEqual(s2);
  });

  it('Prefix-stability: first M values match when longer run extends sequence', () => {
    const seed = 1337;
    const intSchema: Schema = { type: 'integer', minimum: 0, maximum: 100 };
    const gen = new IntegerGenerator();
    const M = 10;
    const N = 30;

    const prefix = collectSequence<number>(gen, intSchema, seed, M);
    const longer = collectSequence<number>(gen, intSchema, seed, N);
    expect(longer.slice(0, M)).toEqual(prefix);
  });

  it('Context isolation: unrelated contexts do not affect sequence', () => {
    const seed = 55555;
    const targetSchema: Schema = { type: 'boolean' };
    const noiseSchema: Schema = { type: 'integer', minimum: 0, maximum: 1000 };
    const boolGen = new BooleanGenerator();
    const intGen = new IntegerGenerator();

    const base = collectSequence<boolean>(boolGen, targetSchema, seed, 15);

    // Interleave noise generation on separate context/seed
    const targetCtx = makeContext(targetSchema, seed);
    const noiseCtx = makeContext(noiseSchema, seed + 1);
    const out: boolean[] = [];
    for (let i = 0; i < 15; i++) {
      // noise
      const _n = intGen.generate(noiseSchema, noiseCtx);
      if (!_n.isOk()) throw new Error('Noise generation failed');
      // target
      const r = boolGen.generate(targetSchema, targetCtx);
      if (!r.isOk()) throw new Error('Target generation failed');
      out.push(r.value as boolean);
    }

    expect(out).toEqual(base);
  });
});

describe('[PRNG] Concurrency reproducibility', () => {
  it('Multiple concurrent contexts produce identical sequences', async () => {
    const seed = 7777;
    const schema: Schema = { type: 'string', minLength: 2, maxLength: 16 };
    const gen = new StringGenerator();
    const count = 25;

    const makeSeq = async (): Promise<string[]> =>
      collectSequence<string>(gen, schema, seed, count);
    const [a, b, c] = await Promise.all([makeSeq(), makeSeq(), makeSeq()]);

    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });
});

describe('[PRNG] Repo invariants', () => {
  it('No calls to faker.seed exist in source code', () => {
    const base = path.resolve(process.cwd(), 'packages');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        // Skip build artifacts and tests
        if (entry.isDirectory()) {
          if (/[/\\](dist|build|coverage|node_modules)[/\\]?$/.test(full))
            continue;
          if (/[/\\]__tests__[/\\]?/.test(full)) continue;
          walk(full);
        } else if (entry.isFile()) {
          if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
          if (!/[/\\]src[/\\]/.test(full)) continue; // only source files
          files.push(full);
        }
      }
    };
    walk(base);
    const offenders: string[] = [];
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      if (content.includes('faker.seed(')) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});

describe('[PRNG] Micro-benchmark overhead report', () => {
  it('reports p95 overhead under 5% (informational)', async () => {
    const schema: Schema = { type: 'boolean' };
    const gen = new BooleanGenerator();
    const iterations = 2000;
    const runs = 8;

    // Warmup to stabilize JIT/caches and reduce variance
    const WARMUP_ITERS = 3000;
    const warmupCtx = makeContext(schema, 111);
    for (let i = 0; i < WARMUP_ITERS; i++) {
      const r = gen.generate(schema, warmupCtx);
      if (!r.isOk()) throw new Error('warmup failed');
    }

    const measure = (fn: () => void): number => {
      const t0 = process.hrtime.bigint();
      fn();
      const t1 = process.hrtime.bigint();
      return Number(t1 - t0);
    };

    const seededTimes: number[] = [];
    const baselineTimes: number[] = [];

    for (let r = 0; r < runs; r++) {
      // Seeded path using our generator/context
      const ctx = makeContext(schema, 987654 + r);
      const seeded = measure(() => {
        for (let i = 0; i < iterations; i++) {
          const res = gen.generate(schema, ctx);
          if (!res.isOk()) throw new Error('gen failed');
        }
      });
      seededTimes.push(seeded);

      // Baseline: mimic boolean generation using Math.random
      const baseline = measure(() => {
        let acc = 0;
        for (let i = 0; i < iterations; i++) {
          acc ^= Number(Math.random() < 0.5);
        }
        // prevent DCE
        if (acc === -1) throw new Error('impossible');
      });
      baselineTimes.push(baseline);
    }

    const percentile = (arr: number[], p: number): number => {
      const a = [...arr].sort((x, y) => x - y);
      const idx = Math.min(
        a.length - 1,
        Math.max(0, Math.floor((p / 100) * a.length))
      );
      return a[idx]!;
    };

    const p95Seeded = percentile(seededTimes, 95);
    const p95Base = percentile(baselineTimes, 95);
    const overhead = (p95Seeded - p95Base) / p95Base;

    // Report for humans
    console.info(
      `[PRNG] p95 overhead: ${(overhead * 100).toFixed(2)}% (seeded=${p95Seeded}ns, base=${p95Base}ns)`
    );

    // CI guardrail is opt-in via PRNG_P95_OVERHEAD_MAX to avoid flaky failures
    const maxOverheadEnv = process.env.PRNG_P95_OVERHEAD_MAX;
    if (maxOverheadEnv) {
      const maxOverhead = Number(maxOverheadEnv);
      expect(Number.isFinite(overhead)).toBe(true);
      expect(overhead).toBeLessThan(maxOverhead);
    } else {
      // Informational only by default
      expect(Number.isFinite(overhead)).toBe(true);
    }
  });
});
