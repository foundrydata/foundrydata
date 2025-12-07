import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { executePipeline } from '@foundrydata/core';

/**
 * Simple Bench Profile (profiles/simple.json)
 *
 * This real-world-ish schema exercises several Repair motifs together:
 * - conditional `if/then` on kind=service requiring `metadata.tier`;
 * - `contains` + `uniqueItems` on the `tags` array with a `tag:` prefix requirement;
 * - `additionalProperties:false` on objects, including nested `metadata` and `contacts`;
 * - `dependentRequired` tying `active` to `status`.
 *
 * In the context of the Repair philosophy and coverage-aware spec:
 * - it serves as a baseline profile for Score-based commit rule behaviour
 *   (spec://§10#commit-rule) and Repair metrics such as repairPassesPerRow /
 *   repairActionsPerRow (spec://§15#metrics);
 * - guided coverage is expected to keep the run green while respecting the
 *   same AJV oracle and Repair contract as coverage=off;
 * - coverage=off vs coverage=measure must produce identical Repair artefacts
 *   for a fixed determinism tuple, in line with coverage-independence
 *   guarantees (cov://§4#coverage-independence).
 */
const SIMPLE_SCHEMA_PATH = resolve('profiles/simple.json');
const SIMPLE_SCHEMA = JSON.parse(readFileSync(SIMPLE_SCHEMA_PATH, 'utf8'));

describe('coverage-guided regression — profiles/simple.json', () => {
  // eslint-disable-next-line complexity
  it('should produce valid instances and honor conditional metadata.tier when kind=service', async () => {
    const result = await executePipeline(SIMPLE_SCHEMA, {
      mode: 'strict',
      generate: { count: 25, seed: 42 },
      validate: { validateFormats: true },
      repair: { attempts: 3 },
      metrics: { enabled: true },
      coverage: { mode: 'guided', excludeUnreachable: false },
    });

    // Regression guard: pipeline should complete and validate all instances.
    expect(result.status).toBe('completed');
    expect(result.artifacts.validation?.valid).toBe(true);

    const instances: unknown[] = Array.isArray(result.artifacts.repaired)
      ? result.artifacts.repaired
      : (result.artifacts.generated?.items ?? []);

    // Assert conditional requirement: when kind=service, metadata.tier must be present.
    for (const [idx, instance] of instances.entries()) {
      if (
        instance &&
        typeof instance === 'object' &&
        (instance as { kind?: unknown }).kind === 'service'
      ) {
        const metadata = (instance as { metadata?: unknown }).metadata;
        expect(metadata, `instance ${idx} missing metadata`).toBeDefined();
        const tier =
          metadata && typeof metadata === 'object'
            ? (metadata as { tier?: unknown }).tier
            : undefined;
        expect(
          tier,
          `instance ${idx} missing metadata.tier when kind=service`
        ).toBeTypeOf('string');
      }
    }
  });

  it('produces identical Repair artefacts for coverage=off vs coverage=measure', async () => {
    const baseOptions = {
      mode: 'strict' as const,
      generate: { count: 100, seed: 42 } as const,
      validate: { validateFormats: true } as const,
      repair: { attempts: 3 } as const,
      metrics: { enabled: true } as const,
    };

    const off = await executePipeline(SIMPLE_SCHEMA, {
      ...baseOptions,
      coverage: { mode: 'off' as const },
    });

    const measure = await executePipeline(SIMPLE_SCHEMA, {
      ...baseOptions,
      coverage: { mode: 'measure' as const },
    });

    expect(off.status).toBe('completed');
    expect(measure.status).toBe('completed');
    expect(measure.status).toBe(off.status);

    expect(off.artifacts.validation?.valid).toBe(true);
    expect(measure.artifacts.validation?.valid).toBe(true);

    const repairedOff = off.artifacts.repaired ?? [];
    const repairedMeasure = measure.artifacts.repaired ?? [];
    expect(repairedMeasure).toEqual(repairedOff);

    const actionsOff = off.artifacts.repairActions ?? [];
    const actionsMeasure = measure.artifacts.repairActions ?? [];
    expect(actionsMeasure).toEqual(actionsOff);

    const diagsOff = off.artifacts.repairDiagnostics ?? [];
    const diagsMeasure = measure.artifacts.repairDiagnostics ?? [];
    expect(diagsMeasure).toEqual(diagsOff);

    const metricsOff = off.metrics;
    const metricsMeasure = measure.metrics;

    expect(metricsMeasure.repairPassesPerRow).toBe(
      metricsOff.repairPassesPerRow
    );
    expect(metricsMeasure.repairActionsPerRow).toBe(
      metricsOff.repairActionsPerRow
    );
  });

  it('produces deterministic Repair artefacts for identical tuples (coverage=off)', async () => {
    const options = {
      mode: 'strict' as const,
      generate: { count: 10, seed: 42 } as const,
      validate: { validateFormats: true } as const,
      repair: { attempts: 3 } as const,
      metrics: { enabled: true } as const,
      coverage: { mode: 'off' as const },
    };

    const first = await executePipeline(SIMPLE_SCHEMA, options);
    const second = await executePipeline(SIMPLE_SCHEMA, options);

    expect(second.status).toBe(first.status);

    const repairedFirst = first.artifacts.repaired ?? [];
    const repairedSecond = second.artifacts.repaired ?? [];
    expect(repairedSecond).toEqual(repairedFirst);

    const actionsFirst = first.artifacts.repairActions ?? [];
    const actionsSecond = second.artifacts.repairActions ?? [];
    expect(actionsSecond).toEqual(actionsFirst);

    const metricsFirst = first.metrics;
    const metricsSecond = second.metrics;

    expect(metricsSecond.repairPassesPerRow).toBe(
      metricsFirst.repairPassesPerRow
    );
    expect(metricsSecond.repairActionsPerRow).toBe(
      metricsFirst.repairActionsPerRow
    );
  });

  it('captures a baseline Repair metrics distribution for simple.json (n=1000)', async () => {
    const result = await executePipeline(SIMPLE_SCHEMA, {
      mode: 'strict',
      generate: { count: 1000, seed: 100 },
      validate: { validateFormats: true },
      repair: { attempts: 3 },
      metrics: { enabled: true },
      coverage: { mode: 'off' },
    });

    expect(result.status).toBe('completed');
    expect(result.artifacts.validation?.valid).toBe(true);

    const metrics = result.metrics;
    const passes = metrics.repairPassesPerRow;
    const actions = metrics.repairActionsPerRow;

    expect(typeof passes).toBe('number');
    expect(typeof actions).toBe('number');

    // Spec-aligned sanity: median passes per row should remain low.
    expect(passes).toBeLessThanOrEqual(1);
    // Actions per row should stay within a reasonable bound for the simple profile.
    expect(actions).toBeLessThanOrEqual(4);
  });
});
