#!/usr/bin/env node
/* eslint-disable complexity */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const defaults = {
    strict: 'reports/corpus-summary.strict.json',
    lax: 'reports/corpus-summary.lax.json',
  };
  const args = { ...defaults };
  for (const arg of argv) {
    if (arg.startsWith('--strict=')) {
      args.strict = arg.slice('--strict='.length);
    } else if (arg.startsWith('--lax=')) {
      args.lax = arg.slice('--lax='.length);
    }
  }
  return args;
}

async function loadReport(filePath, label) {
  const resolved = path.resolve(filePath);
  const raw = await readFile(resolved, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.results)) {
    throw new Error(`Invalid ${label} report at ${resolved}`);
  }
  return parsed;
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function checkAsyncapi(report, label) {
  const entry = report.results.find(
    (r) => typeof r.id === 'string' && r.id === 'asyncapi-3.0.schema'
  );
  ensure(entry, `Missing asyncapi-3.0.schema in ${label} report`);
  ensure(
    entry.failFastCode !== 'EXTERNAL_REF_UNRESOLVED',
    'AsyncAPI still fails with EXTERNAL_REF_UNRESOLVED'
  );
  const hasUnresolved =
    Array.isArray(entry.diagnostics) &&
    entry.diagnostics.some((d) => d?.code === 'EXTERNAL_REF_UNRESOLVED');
  ensure(!hasUnresolved, 'AsyncAPI diagnostics still include EXTERNAL_REF_UNRESOLVED');
}

function checkInternalRefs(report, label) {
  const offenders = report.results.filter(
    (r) =>
      r.failFastCode === 'SCHEMA_INTERNAL_REF_MISSING' ||
      (Array.isArray(r.diagnostics) &&
        r.diagnostics.some((d) => d?.code === 'SCHEMA_INTERNAL_REF_MISSING'))
  );
  ensure(
    offenders.length === 0,
    `${label} report still contains SCHEMA_INTERNAL_REF_MISSING for: ${offenders
      .map((r) => r.id)
      .join(', ')}`
  );
}

function checkApFalse(report, label, opts = {}) {
  const forbidLaxFatal = opts.forbidLaxFatal ?? false;
  const laxFatal =
    forbidLaxFatal &&
    report.results.filter(
      (r) =>
        r.mode === 'lax' && r.failFastCode === 'AP_FALSE_UNSAFE_PATTERN'
    );
  if (laxFatal && laxFatal.length > 0) {
    throw new Error(
      `${label} report has AP_FALSE_UNSAFE_PATTERN fail-fast in lax mode for: ${laxFatal
        .map((r) => r.id)
        .join(', ')}`
    );
  }

  for (const res of report.results) {
    const apFalseDiags = (res.diagnostics ?? []).filter(
      (d) => d?.code === 'AP_FALSE_UNSAFE_PATTERN'
    );
    for (const diag of apFalseDiags) {
      const presence = diag?.details?.presencePressure;
      ensure(
        presence === true,
        `AP_FALSE_UNSAFE_PATTERN is missing presencePressure=true for ${res.id} (${label})`
      );
      if (res.failFastCode === 'AP_FALSE_UNSAFE_PATTERN') {
        ensure(
          res.mode === 'strict',
          `AP_FALSE_UNSAFE_PATTERN fail-fast should not occur outside strict mode (${res.id})`
        );
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const strictReport = await loadReport(args.strict, 'strict');
  checkAsyncapi(strictReport, 'strict');
  checkInternalRefs(strictReport, 'strict');
  checkApFalse(strictReport, 'strict');

  if (args.lax) {
    const laxReport = await loadReport(args.lax, 'lax');
    checkInternalRefs(laxReport, 'lax');
    checkApFalse(laxReport, 'lax', { forbidLaxFatal: true });
  }

  // eslint-disable-next-line no-console
  console.log('Gap checks passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
