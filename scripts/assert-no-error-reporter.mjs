#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const START_DIRS = [
  path.join(ROOT, 'packages', 'core', 'src'),
  path.join(ROOT, 'packages', 'cli', 'src'),
  path.join(ROOT, 'packages', 'shared', 'src'),
];

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'coverage',
  'dist',
  '__tests__',
  'test',
  'tests',
]);

const FILE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** @param {string} dir */
function* walk(dir) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // ignore unreadable dirs
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      yield* walk(full);
    } else if (e.isFile()) {
      const ext = path.extname(e.name);
      if (!FILE_EXTS.has(ext)) continue;
      // skip test files by convention
      if (/\.test\.[cm]?tsx?$/.test(e.name)) continue;
      yield full;
    }
  }
}

const offenders = [];
const codeLikePatterns = [
  /\bimport\s+[^;]*ErrorReporter[^;]*from\b/m,
  /\brequire\([^)]*ErrorReporter[^)]*\)/m,
  /\bnew\s+ErrorReporter\b/m,
  /\bclass\s+\w+\s+extends\s+ErrorReporter\b/m,
  /\bErrorReporter\s*\./m,
];
for (const start of START_DIRS) {
  if (!fs.existsSync(start)) continue;
  for (const file of walk(start)) {
    let content = '';
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue; // ignore read errors
    }
    if (!content.includes('ErrorReporter')) continue;
    if (codeLikePatterns.some((re) => re.test(content))) offenders.push(file);
  }
}

if (offenders.length > 0) {
  console.error('❌ Found forbidden ErrorReporter references in production code:');
  for (const file of offenders) console.error(' -', path.relative(ROOT, file));
  process.exit(1);
} else {
  process.stdout.write('✅ Guardrail passed: no ErrorReporter usage in production paths\n');
}
