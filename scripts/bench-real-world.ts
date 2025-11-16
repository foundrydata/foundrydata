/* eslint-disable complexity */
/* eslint-disable max-lines-per-function */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  BENCH_BUDGETS,
  BENCH_SEEDS,
  DEFAULT_ITERATIONS,
  computeGateSummary,
  formatGateSummary,
  formatProfileSummary,
  resolveIterationOverridesFromEnv,
  runProfile,
} from './bench-core.js';
import type { GateSummary } from './bench-types.js';
import { realWorldProfiles } from './real-world-profiles.js';

const REAL_WORLD_PIPELINE_OVERRIDES = {
  mode: 'lax' as const,
};

const REPORT_DIR = 'bench';
const REAL_WORLD_GATE_FILENAME = 'bench-gate.real-world.json';

function writeLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function writeRealWorldGate(summary: GateSummary): Promise<string> {
  await mkdir(REPORT_DIR, { recursive: true });
  const outputPath = path.join(REPORT_DIR, REAL_WORLD_GATE_FILENAME);
  const data = JSON.stringify(summary, null, 2);
  await writeFile(outputPath, `${data}\n`, 'utf8');
  return outputPath;
}

async function main(): Promise<void> {
  const iterations = resolveIterationOverridesFromEnv() ?? DEFAULT_ITERATIONS;
  writeLine(
    `FoundryData real-world bench — cwd: ${process.cwd()} · Seeds: ${BENCH_SEEDS.join(
      ', '
    )}`
  );
  writeLine(
    `Warmup iterations: ${iterations.warmup} · Measured iterations: ${iterations.measured}`
  );

  const summaries = [];
  const failures: { id: string; message: string }[] = [];
  for (const profile of realWorldProfiles) {
    try {
      const summary = await runProfile(profile, {
        iterations,
        pipelineOverrides: REAL_WORLD_PIPELINE_OVERRIDES,
      });
      summaries.push(summary);
      writeLine(formatProfileSummary(summary));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      failures.push({ id: profile.id, message });
      console.error(
        `❌ Profile ${profile.id} failed to complete: ${message ?? 'unknown error'}`
      );
    }
  }

  if (summaries.length === 0) {
    console.error('❌ Real-world bench could not complete any profile');
    process.exitCode = 1;
    return;
  }

  const gate = computeGateSummary(summaries);
  await writeRealWorldGate(gate);
  writeLine(formatGateSummary(gate));

  const gateFailed =
    gate.p95LatencyMs > BENCH_BUDGETS.p95LatencyMs ||
    gate.memoryPeakMB > BENCH_BUDGETS.memoryPeakMB;

  if (gateFailed) {
    console.error(
      `❌ Real-world bench gate failed: requires p95 ≤ ${BENCH_BUDGETS.p95LatencyMs}ms and memory ≤ ${BENCH_BUDGETS.memoryPeakMB}MB`
    );
  } else {
    console.error('✅ Real-world bench gate passed');
  }

  if (failures.length > 0) {
    console.error(
      `⚠️ Real-world profiles with failures: ${failures
        .map((entry) => `${entry.id} (${entry.message})`)
        .join(', ')}`
    );
  }

  if (gateFailed || failures.length > 0) {
    process.exitCode = 1;
  }
}

const executedDirectly =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (executedDirectly) {
  main().catch((error) => {
    console.error('Real-world bench harness failed:', error);
    process.exitCode = 1;
  });
}
