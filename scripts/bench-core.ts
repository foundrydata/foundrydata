/* eslint-disable max-lines */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import process from 'node:process';
import {
  executePipeline,
  MetricsCollector,
  type PipelineOptions,
} from '../packages/core/src/index.js';
import {
  BENCH_BUDGETS,
  BENCH_SEEDS,
  DEFAULT_ITERATIONS,
  profiles,
} from './bench-config.js';
import type {
  BenchProfile,
  GateSummary,
  IterationConfig,
  ProfileSummary,
  RunProfileOverrides,
  SingleRunResult,
} from './bench-types.js';
export type {
  BenchProfile,
  GateSummary,
  IterationConfig,
  ProfileSummary,
  RunProfileOverrides,
  SingleRunResult,
} from './bench-types.js';

const REPORT_DIR = 'bench';
const GATE_FILENAME = 'bench-gate.json';
interface PreparedProfile {
  id: string;
  label: string;
  schema: unknown;
  iterations: IterationConfig;
  seeds: number[];
  generateCount: number;
}

interface MeasuredData {
  runs: SingleRunResult[];
  latencies: number[];
  memorySamples: number[];
}

export { BENCH_BUDGETS, BENCH_SEEDS, DEFAULT_ITERATIONS, profiles };
export function calculatePercentile(
  values: readonly number[],
  percentile: number
): number {
  if (!Number.isFinite(percentile) || percentile < 0 || percentile > 1) {
    throw new RangeError('percentile must be between 0 and 1');
  }
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const first = sorted[0];
  if (first === undefined) {
    return 0;
  }
  if (sorted.length === 1) {
    return first;
  }
  const rankedIndex =
    percentile <= 0 ? 0 : Math.ceil(percentile * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rankedIndex));
  const candidate = sorted[index];
  if (candidate !== undefined) {
    return candidate;
  }
  const last = sorted[sorted.length - 1];
  return last ?? first;
}

export function computeGateSummary(
  summaries: readonly ProfileSummary[]
): GateSummary {
  if (summaries.length === 0) {
    return { p95LatencyMs: 0, memoryPeakMB: 0 };
  }

  let worstP95 = 0;
  let worstMemory = 0;
  for (const entry of summaries) {
    worstP95 = Math.max(worstP95, entry.p95LatencyMs);
    worstMemory = Math.max(worstMemory, entry.memoryPeakMB);
  }

  return {
    p95LatencyMs: worstP95,
    memoryPeakMB: worstMemory,
  };
}

export async function runProfile(
  profile: BenchProfile,
  overrides: RunProfileOverrides = {}
): Promise<ProfileSummary> {
  const prepared = await prepareProfile(profile, overrides);
  const measured = await executeMeasuredIterations(prepared);
  return summariseProfile(prepared, measured);
}

export function resolveIterationOverridesFromEnv():
  | IterationConfig
  | undefined {
  if (process.env.FOUNDRY_BENCH_QUICK === '1') {
    return { warmup: 1, measured: 3 };
  }

  const warmupValue = parseEnvInteger(process.env.FOUNDRY_BENCH_WARMUP);
  const measuredValue = parseEnvInteger(process.env.FOUNDRY_BENCH_MEASURED);
  if (warmupValue === undefined && measuredValue === undefined) {
    return undefined;
  }
  const warmup = warmupValue ?? DEFAULT_ITERATIONS.warmup;
  const measured = measuredValue ?? DEFAULT_ITERATIONS.measured;
  return normalizeIterations({ warmup, measured });
}

export async function writeGateSummary(summary: GateSummary): Promise<string> {
  await mkdir(REPORT_DIR, { recursive: true });
  const outputPath = path.join(REPORT_DIR, GATE_FILENAME);
  const data = JSON.stringify(summary, null, 2);
  await writeFile(outputPath, `${data}\n`, 'utf8');
  return outputPath;
}

export function formatProfileSummary(summary: ProfileSummary): string {
  return [
    `• ${summary.id.padEnd(13)} ${summary.label}`,
    `runs=${summary.measuredCount}`,
    `p50=${summary.p50LatencyMs.toFixed(2)}ms`,
    `p95=${summary.p95LatencyMs.toFixed(2)}ms`,
    `memory=${summary.memoryPeakMB.toFixed(2)}MB`,
  ].join(' · ');
}

export function formatGateSummary(summary: GateSummary): string {
  return `Gate summary → p95=${summary.p95LatencyMs.toFixed(
    2
  )}ms (budget ${BENCH_BUDGETS.p95LatencyMs}ms) · memory=${summary.memoryPeakMB.toFixed(
    2
  )}MB (budget ${BENCH_BUDGETS.memoryPeakMB}MB)`;
}

async function prepareProfile(
  profile: BenchProfile,
  overrides: RunProfileOverrides
): Promise<PreparedProfile> {
  const iterations = normalizeIterations(
    overrides.iterations ?? profile.iterations ?? DEFAULT_ITERATIONS
  );
  const seeds = normalizeSeeds(overrides.seeds ?? BENCH_SEEDS);
  const schema = overrides.schema ?? (await loadSchema(profile.schemaPath));
  const generateCount = Math.max(
    1,
    Math.trunc(overrides.generateCount ?? profile.generateCount)
  );

  return {
    id: profile.id,
    label: profile.label,
    schema,
    iterations,
    seeds,
    generateCount,
  };
}

async function executeMeasuredIterations(
  prepared: PreparedProfile
): Promise<MeasuredData> {
  const totalIterations =
    prepared.iterations.warmup + prepared.iterations.measured;
  const runs: SingleRunResult[] = [];
  const latencies: number[] = [];
  const memorySamples: number[] = [];

  for (let index = 0; index < totalIterations; index += 1) {
    const seed = prepared.seeds[index % prepared.seeds.length]!;
    const result = await runSingleIteration(
      prepared.schema,
      seed,
      prepared.generateCount
    );

    if (index >= prepared.iterations.warmup) {
      runs.push(result);
      latencies.push(result.latencyMs);
      memorySamples.push(result.memoryPeakMB);
    }
  }

  if (latencies.length === 0) {
    throw new Error(
      `Measured run count was zero for profile "${prepared.id}". Check iteration settings.`
    );
  }

  return { runs, latencies, memorySamples };
}

function summariseProfile(
  prepared: PreparedProfile,
  measured: MeasuredData
): ProfileSummary {
  return {
    id: prepared.id,
    label: prepared.label,
    warmupCount: prepared.iterations.warmup,
    measuredCount: prepared.iterations.measured,
    p50LatencyMs: calculatePercentile(measured.latencies, 0.5),
    p95LatencyMs: calculatePercentile(measured.latencies, 0.95),
    memoryPeakMB: Math.max(...measured.memorySamples),
    runs: measured.runs,
  };
}

function normalizeSeeds(seeds: readonly number[]): number[] {
  if (seeds.length === 0) {
    throw new Error('At least one seed is required to run the benchmark');
  }
  return seeds.map((value) => Math.trunc(value));
}

function parseEnvInteger(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeIterations(config: IterationConfig): IterationConfig {
  if (!Number.isFinite(config.warmup) || !Number.isFinite(config.measured)) {
    throw new Error(
      'Iteration configuration must define numeric warmup and measured counts'
    );
  }
  const warmup = Math.max(0, Math.trunc(config.warmup));
  const measured = Math.max(0, Math.trunc(config.measured));
  if (measured === 0) {
    throw new Error('Measured iteration count must be greater than zero');
  }
  return { warmup, measured };
}

async function loadSchema(schemaPath: URL): Promise<unknown> {
  const contents = await readFile(schemaPath, 'utf8');
  return JSON.parse(contents) as unknown;
}

async function runSingleIteration(
  schema: unknown,
  seed: number,
  generateCount: number
): Promise<SingleRunResult> {
  const collector = new MetricsCollector({ verbosity: 'ci' });
  collector.setVerbosity('ci');

  const options: PipelineOptions = {
    collector,
    metrics: { verbosity: 'ci', enabled: true },
    snapshotVerbosity: 'ci',
    generate: {
      seed,
      count: generateCount,
    },
  };

  const start = performance.now();
  const result = await executePipeline(schema, options);
  const latencyMs = performance.now() - start;
  if (result.status !== 'completed') {
    const firstError = result.errors[0];
    const reason =
      firstError?.message ??
      (firstError?.stage
        ? `Pipeline failed during ${firstError.stage}`
        : 'Pipeline execution failed');
    throw new Error(reason);
  }

  const memoryPeakMB = sampleMemoryUsageMb();
  collector.observeMemoryPeak(memoryPeakMB);
  collector.setLatency(50, latencyMs);
  collector.setLatency(95, latencyMs);

  const metrics = collector.snapshotMetrics({ verbosity: 'ci' });
  return {
    seed,
    latencyMs,
    memoryPeakMB: metrics.memoryPeakMB,
    metrics,
  };
}

function sampleMemoryUsageMb(): number {
  const resource = process.resourceUsage();
  const rssFromStats = resource.maxRSS / 1024;
  const rssCurrent = process.memoryUsage().rss / (1024 * 1024);
  return Math.max(rssFromStats, rssCurrent);
}
