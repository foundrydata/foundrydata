import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DIAGNOSTIC_CODES } from '../../src/diag/codes.js';
import { runCorpusHarnessFromDir } from '../../src/pipeline/corpus-harness.js';

const BASELINE_STRICT_NON_ANCHORED = 101;
const BASELINE_LAX_NON_ANCHORED = 104;

function countNonAnchoredPatternApproximations(
  diagnostics: Array<{ code: string; details?: unknown }>
): number {
  return diagnostics.reduce((count, diag) => {
    if (
      diag.code === DIAGNOSTIC_CODES.AP_FALSE_INTERSECTION_APPROX &&
      (diag.details as { reason?: string } | undefined)?.reason ===
        'nonAnchoredPattern'
    ) {
      return count + 1;
    }
    return count;
  }, 0);
}

describe('real-world corpus anchored-subset lifting', () => {
  it('shrinks nonAnchoredPattern approximations by at least 30% in strict and lax', async () => {
    const corpusDir = resolve(process.cwd(), 'profiles/real-world');
    const instancesPerSchema = process.env.FOUNDRY_BENCH_QUICK === '1' ? 1 : 3;
    const scale = instancesPerSchema / 3;

    const strictReport = await runCorpusHarnessFromDir({
      corpusDir,
      mode: 'strict',
      seed: 37,
      instancesPerSchema,
      validateFormats: false,
    });
    const laxReport = await runCorpusHarnessFromDir({
      corpusDir,
      mode: 'lax',
      seed: 37,
      instancesPerSchema,
      validateFormats: false,
    });

    const strictApprox = strictReport.results.reduce(
      (acc, entry) =>
        acc + countNonAnchoredPatternApproximations(entry.diagnostics),
      0
    );
    const laxApprox = laxReport.results.reduce(
      (acc, entry) =>
        acc + countNonAnchoredPatternApproximations(entry.diagnostics),
      0
    );

    const strictTarget = Math.floor(BASELINE_STRICT_NON_ANCHORED * scale * 0.7);
    const laxTarget = Math.floor(BASELINE_LAX_NON_ANCHORED * scale * 0.7);

    expect(strictApprox).toBeLessThanOrEqual(strictTarget);
    expect(laxApprox).toBeLessThanOrEqual(laxTarget);
  }, 120_000);
});
