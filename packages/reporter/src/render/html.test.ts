import { describe, expect, it } from 'vitest';

import { runEngineOnSchema } from '../engine/runner.js';
import type { Report } from '../model/report.js';
import { renderHtmlReport } from './html.js';

async function makeReport(): Promise<Report> {
  return runEngineOnSchema({
    schema: { type: 'object', properties: { id: { type: 'integer' } } },
    schemaId: 'report-html',
    schemaPath: '/tmp/report-html.json',
  });
}

describe('renderHtmlReport', () => {
  it('creates a full HTML document with sections and badges', async () => {
    const report = await makeReport();
    const html = renderHtmlReport(report);

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<h1>JSON Schema Report – report-html</h1>');
    expect(html).toContain('Diagnostics Summary');
    expect(html).toContain('Coverage Index Snapshot');
    expect(html).toMatch(/badge-valid-unchanged/);
    expect(html).toContain('<section>');
  });
});
