import { describe, expect, it } from 'vitest';

import { runEngineOnSchema } from '../engine/runner.js';
import type { Report } from '../model/report.js';
import { renderMarkdownReport } from './markdown.js';

async function makeReport(): Promise<Report> {
  return runEngineOnSchema({
    schema: { type: 'object', properties: { id: { type: 'integer' } } },
    schemaId: 'report-md',
    schemaPath: '/tmp/report-md.json',
    seed: 13,
  });
}

describe('renderMarkdownReport', () => {
  it('includes key sections, tables, and instance details', async () => {
    const report = await makeReport();
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain('# JSON Schema Report – report-md');
    expect(markdown).toContain('## Timings');
    expect(markdown).toContain('| Step | Duration (ms) |');
    expect(markdown).toContain('## Diagnostics');
    expect(markdown).toContain('## Coverage Index (snapshot)');
    expect(markdown).toContain('## Instances');
    expect(markdown).toContain('validation errors:');
  });
});
