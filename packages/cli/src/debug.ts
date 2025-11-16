/* eslint-disable complexity */
import type { PipelineResult } from '@foundrydata/core';

/**
 * Print compose-time diagnostics and a coverage summary to stderr.
 * Intended to be used behind the --debug-passes flag.
 */
export function printComposeDebug(result: PipelineResult): void {
  const composeStage = result.stages.compose;
  const composeOutput = composeStage.output;

  if (!composeOutput) {
    process.stderr.write('[foundrydata] compose(output): <none>\n');
    return;
  }

  const diag = composeOutput.diag ?? null;
  const nameDfaSummary = composeOutput.nameDfaSummary ?? null;
  const coverageIndex = composeOutput.coverageIndex;

  process.stderr.write(
    `[foundrydata] compose.diag: ${JSON.stringify(diag, null, 2)}\n`
  );

  if (nameDfaSummary) {
    process.stderr.write(
      `[foundrydata] compose.nameDfaSummary: ${JSON.stringify(
        nameDfaSummary
      )}\n`
    );
  }

  if (coverageIndex && coverageIndex.size > 0) {
    const summary: Array<{
      pointer: string;
      provenance?: string[];
      names?: string[];
    }> = [];

    for (const [pointer, entry] of coverageIndex.entries()) {
      const names = entry.enumerate?.();
      if (names && names.length > 0) {
        summary.push({
          pointer,
          provenance: entry.provenance,
          names: names.slice(0, 16),
        });
      }
    }

    process.stderr.write(
      `[foundrydata] compose.coverage: ${JSON.stringify(summary, null, 2)}\n`
    );
  } else {
    process.stderr.write('[foundrydata] compose.coverage: []\n');
  }
}
