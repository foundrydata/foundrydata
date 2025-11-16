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
  profiles,
  resolveIterationOverridesFromEnv,
  runProfile,
  writeGateSummary,
} from './bench-core.js';

function writeLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function main(): Promise<void> {
  const iterations = resolveIterationOverridesFromEnv() ?? DEFAULT_ITERATIONS;
  writeLine(
    `FoundryData bench harness — cwd: ${process.cwd()} · Seeds: ${BENCH_SEEDS.join(
      ', '
    )}`
  );
  writeLine(
    `Warmup iterations: ${iterations.warmup} · Measured iterations: ${iterations.measured}`
  );

  const summaries = [];
  for (const profile of profiles) {
    const summary = await runProfile(profile, { iterations });
    summaries.push(summary);
    writeLine(formatProfileSummary(summary));
  }

  const gate = computeGateSummary(summaries);
  await writeGateSummary(gate);
  writeLine(formatGateSummary(gate));

  if (
    gate.p95LatencyMs > BENCH_BUDGETS.p95LatencyMs ||
    gate.memoryPeakMB > BENCH_BUDGETS.memoryPeakMB
  ) {
    console.error(
      `❌ Bench gate failed: requires p95 ≤ ${BENCH_BUDGETS.p95LatencyMs}ms and memory ≤ ${BENCH_BUDGETS.memoryPeakMB}MB`
    );
    process.exitCode = 1;
  } else {
    console.error('✅ Bench gate passed');
  }
}

const executedDirectly =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (executedDirectly) {
  main().catch((error) => {
    console.error('Bench harness failed:', error);
    process.exitCode = 1;
  });
}
