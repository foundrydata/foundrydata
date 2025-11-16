import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { MetricsSnapshot, Report } from '../src/model/report.js';
import { runEngineOnSchema } from '../src/engine/runner.js';
import { renderMarkdownReport } from '../src/render/markdown.js';
import { renderHtmlReport } from '../src/render/html.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, '../../../profiles/simple.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

let cachedReport: Report | undefined;

async function loadReport(): Promise<Report> {
  if (!cachedReport) {
    cachedReport = await runEngineOnSchema({
      schema,
      schemaId: 'profiles/simple.json',
      schemaPath,
      planOptions: {},
      seed: 123456789,
    });
  }
  return clone(cachedReport);
}

function sanitizeReport(report: Report): Report {
  const next = clone(report);
  next.meta.timestamp = '<timestamp>';
  // Normalize environment-specific bits so snapshots are stable across machines
  // The logical identifier is schemaId ("profiles/simple.json"), so we mirror
  // that here instead of keeping the absolute filesystem path.
  next.schemaPath = 'profiles/simple.json';
  if (next.metrics) {
    sanitizeMetrics(next.metrics);
  }
  if (next.summary.timings) {
    for (const key of Object.keys(next.summary.timings)) {
      next.summary.timings[key as keyof typeof next.summary.timings] = 0;
    }
  }
  return next;
}

function sanitizeMetrics(metrics: MetricsSnapshot): void {
  for (const key of Object.keys(metrics)) {
    const value = metrics[key as keyof MetricsSnapshot];
    if (typeof value === 'number') {
      metrics[key as keyof MetricsSnapshot] =
        0 as MetricsSnapshot[keyof MetricsSnapshot];
    }
  }
}

async function getSanitizedReport(): Promise<Report> {
  return sanitizeReport(await loadReport());
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('reporter snapshots', () => {
  it('produces a stable JSON Report for profiles/simple.json', async () => {
    const report = await getSanitizedReport();
    expect(report).toMatchSnapshot('simple-json-report');
  });

  it('produces a stable Markdown report for profiles/simple.json', async () => {
    const report = await getSanitizedReport();
    const markdown = renderMarkdownReport(report);
    expect(markdown).toMatchSnapshot('simple-markdown-report');
  });

  it('produces a stable HTML report for profiles/simple.json', async () => {
    const report = await getSanitizedReport();
    const html = renderHtmlReport(report);
    expect(html).toMatchSnapshot('simple-html-report');
  });
});
