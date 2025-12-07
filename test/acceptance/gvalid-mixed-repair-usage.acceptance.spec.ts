import { describe, expect, it } from 'vitest';

import { executePipeline } from '../../packages/core/src/pipeline/orchestrator.js';
import { MetricsCollector } from '../../packages/core/src/util/metrics.js';

describe('Acceptance — Mixed G_valid and non-G_valid repair usage', () => {
  it('emits canonPath-tagged usage for both G_valid and non-G_valid motifs', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        profile: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            age: { type: 'integer', minimum: 0 },
          },
          required: ['email', 'age'],
        },
        legacy: { type: 'string', pattern: '^A$' },
      },
      required: ['profile', 'legacy'],
    } as const;

    const collector = new MetricsCollector({ now: () => 0, verbosity: 'ci' });

    const result = await executePipeline(
      schema,
      {
        mode: 'strict',
        snapshotVerbosity: 'ci',
        collector,
        generate: {
          count: 1,
          seed: 7,
          planOptions: { gValid: true },
        },
        validate: { validateFormats: false },
      },
      {
        // Force mixed validity: profile already valid (G_valid), legacy needs Repair.
        async generate() {
          return {
            status: 'completed' as const,
            items: [
              {
                profile: { email: 'ok@example.com', age: 1 },
                legacy: 'zzz',
              },
            ],
            diagnostics: [],
          };
        },
        repair(items, _args, _options) {
          const fixed = items.map((it) => ({ ...it, legacy: 'A' }));
          collector.recordRepairUsageEvent({
            motifId: 'simpleObjectRequired',
            gValid: true,
            actions: 0,
            items: fixed.length,
            itemsWithRepair: 0,
            canonPath: '#/profile',
          });
          collector.recordRepairUsageEvent({
            motifId: 'legacy',
            gValid: false,
            actions: 1,
            items: fixed.length,
            itemsWithRepair: fixed.length,
            canonPath: '#/legacy',
          });
          return {
            items: fixed,
            actions: [
              {
                action: 'set',
                canonPath: '#/legacy',
                instancePath: '/legacy',
                details: { actions: 1 },
              },
            ],
            diagnostics: [],
          };
        },
      }
    );

    expect(result.status).toBe('completed');

    const usage = result.metrics.repairUsageByMotif ?? [];
    const profileBucket = usage.find(
      (entry) =>
        entry.gValid === true && entry.motifId === 'simpleObjectRequired'
    );
    expect(profileBucket).toBeDefined();
    expect(profileBucket?.canonPath).toMatch(/^#(\/profile)?$/);
    expect(profileBucket?.actions).toBe(0);

    const nonGValidBucket = usage.find(
      (entry) =>
        entry.gValid === false && (entry.canonPath ?? '').includes('#/legacy')
    );
    expect(nonGValidBucket).toBeDefined();
    expect(nonGValidBucket?.actions).toBeGreaterThanOrEqual(1);
    expect(nonGValidBucket?.itemsWithRepair).toBeGreaterThanOrEqual(1);
  });
});
