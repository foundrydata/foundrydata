import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertSemVer } from './manifest.js';

const DEFAULT_CHANGELOG_RELATIVE_PATH = 'docs/CHANGELOG.md';
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CHANGELOG_TEMPLATE = `# FoundryData Changelog

All notable changes to this project will be documented in this file. The format follows Semantic Versioning 2.0.0 and the release workflow defined in the FoundryData specification.

## [Unreleased]
- Pending changes
`;

export interface ChangelogEntryInput {
  version: string;
  date: string;
  notes: string[];
}

export interface RecordChangelogOptions {
  dryRun?: boolean;
  changelogPath?: string;
}

export interface ChangelogRecordSummary {
  heading: string;
  noteCount: number;
}

export async function recordReleaseInChangelog(
  rootDir: string,
  entry: ChangelogEntryInput,
  options: RecordChangelogOptions = {}
): Promise<ChangelogRecordSummary> {
  const normalizedVersion = assertSemVer(entry.version);
  const normalizedDate = assertIsoDate(entry.date);
  const sanitizedNotes = normalizeNotes(entry.notes);
  const heading = `## [${normalizedVersion}] - ${normalizedDate}`;
  const changelogPath = path.resolve(
    rootDir,
    options.changelogPath ?? DEFAULT_CHANGELOG_RELATIVE_PATH
  );

  await ensureChangelogTemplate(changelogPath);
  const existing = await readFile(changelogPath, 'utf8');
  const updated = insertReleaseBlock(
    existing,
    heading,
    sanitizedNotes.map((note) => `- ${note}`)
  );

  if (!options.dryRun) {
    await writeFile(changelogPath, updated, 'utf8');
  }

  return { heading, noteCount: sanitizedNotes.length };
}

async function ensureChangelogTemplate(changelogPath: string): Promise<void> {
  try {
    await access(changelogPath);
  } catch {
    await mkdir(path.dirname(changelogPath), { recursive: true });
    await writeFile(changelogPath, CHANGELOG_TEMPLATE, 'utf8');
  }
}

function assertIsoDate(value: string): string {
  if (!ISO_DATE_REGEX.test(value)) {
    throw new Error(
      `Invalid date "${value}". Expected ISO format YYYY-MM-DD for changelog entries.`
    );
  }
  return value;
}

function normalizeNotes(notes: string[]): string[] {
  const sanitized = notes
    .flatMap((note) => note.split('\n'))
    .map((note) => note.trim())
    .filter((note) => note.length > 0);
  if (sanitized.length === 0) {
    return ['No user-facing changes documented.'];
  }
  return Array.from(new Set(sanitized));
}

function insertReleaseBlock(
  changelog: string,
  heading: string,
  noteLines: string[]
): string {
  if (changelog.includes(heading)) {
    throw new Error(
      `Changelog already contains an entry for ${heading.replace(/^##\s*/, '')}.`
    );
  }

  const lines = changelog.split('\n');
  const unreleasedIndex = lines.findIndex((line) =>
    line.startsWith('## [Unreleased]')
  );
  if (unreleasedIndex === -1) {
    throw new Error(
      'Changelog does not contain the required "## [Unreleased]" section.'
    );
  }

  let insertionIndex = lines.length;
  for (let i = unreleasedIndex + 1; i < lines.length; i += 1) {
    const candidate = lines[i] ?? '';
    if (candidate.startsWith('## [')) {
      insertionIndex = i;
      break;
    }
  }

  const block = ['', heading, ...noteLines, ''];
  lines.splice(insertionIndex, 0, ...block);
  return coalesceBlankLines(lines).join('\n');
}

function coalesceBlankLines(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const previous =
      result.length > 0 ? (result[result.length - 1] ?? '') : undefined;
    if (trimmed.length === 0 && previous && previous.trim().length === 0) {
      continue;
    }
    result.push(line);
  }
  if (result.length === 0 || result[result.length - 1] !== '') {
    result.push('');
  }
  return result;
}
