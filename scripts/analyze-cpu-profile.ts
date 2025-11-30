import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface CpuProfileNode {
  id: number;
  callFrame: {
    functionName: string;
    scriptId?: string;
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
}

interface CpuProfile {
  nodes: CpuProfileNode[];
  samples?: number[];
  timeDeltas?: number[];
}

// eslint-disable-next-line max-lines-per-function, complexity
async function main(): Promise<void> {
  const [inputPath, ...rest] = process.argv.slice(2);
  if (!inputPath) {
    const thisFile = fileURLToPath(import.meta.url);
    console.error(
      [
        'Usage:',
        `  npx tsx ${path.relative(
          process.cwd(),
          thisFile
        )} <profile.cpuprofile> [limit] [--by-url]`,
        '',
        'Example:',
        '  # Top functions',
        '  npx tsx scripts/analyze-cpu-profile.ts cpu-profiles/CPU.20251130.010123.65730.0.001.cpuprofile 30',
        '',
        '  # Top files (group by URL)',
        '  npx tsx scripts/analyze-cpu-profile.ts cpu-profiles/CPU.20251130.010123.65730.0.001.cpuprofile 30 --by-url',
        '',
      ].join('\n')
    );
    process.exitCode = 1;
    return;
  }

  let limit = 25;
  let groupByUrl = false;
  for (const token of rest) {
    if (token === '--by-url') {
      groupByUrl = true;
      continue;
    }
    const maybe = Number(token);
    if (Number.isFinite(maybe)) {
      limit = maybe;
    }
  }

  const raw = await readFile(inputPath, 'utf8');
  const parsed = JSON.parse(raw) as CpuProfile;
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.samples)) {
    console.error('Input file does not look like a V8 CPU profile.');
    process.exitCode = 1;
    return;
  }

  const samples = parsed.samples ?? [];
  const timeDeltas = parsed.timeDeltas ?? [];
  const nodeById = new Map<number, CpuProfileNode>();
  for (const node of parsed.nodes) {
    nodeById.set(node.id, node);
  }

  const durations = new Map<number, number>();
  let total = 0;
  const n = samples.length;
  for (let i = 0; i < n; i += 1) {
    const nodeId = samples[i];
    const delta = timeDeltas[i] ?? 0;
    if (!Number.isFinite(delta) || delta <= 0) continue;
    total += delta;
    durations.set(nodeId, (durations.get(nodeId) ?? 0) + delta);
  }

  const totalMs = total / 1000;
  // eslint-disable-next-line no-console
  console.log(
    `CPU profile summary for ${path.basename(
      inputPath
    )} (total ~${totalMs.toFixed(2)} ms)`
  );

  if (groupByUrl) {
    const byUrl = new Map<string, number>();
    for (const [id, duration] of durations) {
      const node = nodeById.get(id);
      if (!node) continue;
      const url =
        node.callFrame.url && node.callFrame.url.length > 0
          ? node.callFrame.url
          : '(anonymous)';
      byUrl.set(url, (byUrl.get(url) ?? 0) + duration);
    }
    const entries = Array.from(byUrl.entries())
      .map(([url, duration]) => {
        const millis = duration / 1000;
        const percent = totalMs > 0 ? (millis / totalMs) * 100 : 0;
        return { url, millis, percent };
      })
      .sort((a, b) => b.millis - a.millis)
      .slice(0, limit);

    for (const entry of entries) {
      // eslint-disable-next-line no-console
      console.log(
        `${entry.url} — ${entry.millis.toFixed(2)} ms (${entry.percent.toFixed(
          1
        )}%)`
      );
    }
    return;
  }

  const entries: {
    id: number;
    functionName: string;
    url?: string;
    millis: number;
    percent: number;
  }[] = [];

  for (const [id, duration] of durations) {
    const node = nodeById.get(id);
    if (!node) continue;
    const functionName =
      node.callFrame.functionName && node.callFrame.functionName.length > 0
        ? node.callFrame.functionName
        : '(anonymous)';
    const url = node.callFrame.url;
    const millis = duration / 1000;
    const percent = totalMs > 0 ? (millis / totalMs) * 100 : 0;
    entries.push({ id, functionName, url, millis, percent });
  }

  entries.sort((a, b) => b.millis - a.millis);

  const top = entries.slice(0, limit);
  for (const entry of top) {
    const location = entry.url ? ` @ ${entry.url}` : '';
    // eslint-disable-next-line no-console
    console.log(
      `${entry.functionName}${location} — ${entry.millis.toFixed(
        2
      )} ms (${entry.percent.toFixed(1)}%)`
    );
  }
}

void main();
