/* eslint-disable max-lines-per-function */
/* eslint-disable no-console */
import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { recordReleaseInChangelog } from './changelog.js';
import { assertSemVer, updateWorkspaceVersions } from './manifest.js';

const execFileAsync = promisify(execFile);

export interface ReleaseArgs {
  version: string;
  notes: string[];
  date: string;
  dryRun: boolean;
  skipBuild: boolean;
}

export interface ReleaseSummary {
  manifestResults: Awaited<ReturnType<typeof updateWorkspaceVersions>>;
  changelogHeading: string;
  noteCount: number;
}

async function runCommand(
  command: string,
  args: string[],
  options: { dryRun?: boolean } = {}
): Promise<void> {
  const label = `${command} ${args.join(' ')}`.trim();
  if (options.dryRun) {
    console.log(`[dry-run] ${label}`);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command "${label}" failed with exit code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

// eslint-disable-next-line complexity
export function parseReleaseArgs(argv: string[]): ReleaseArgs {
  const args: ReleaseArgs = {
    version: '',
    notes: [],
    date: new Date().toISOString().slice(0, 10),
    dryRun: false,
    skipBuild: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (typeof token === 'undefined') {
      continue;
    }
    switch (token) {
      case '--version':
      case '-v':
        args.version = requireValue(argv, ++i, token);
        break;
      case '--note':
      case '-n':
        args.notes.push(requireValue(argv, ++i, token));
        break;
      case '--date':
        args.date = requireValue(argv, ++i, token);
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--skip-build':
        args.skipBuild = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        if (token.startsWith('-')) {
          throw new Error(`Unknown flag "${token}". Use --help for usage.`);
        } else {
          args.notes.push(token);
        }
        break;
    }
  }

  if (!args.version) {
    throw new Error('Missing required --version <semver>.');
  }
  args.version = assertSemVer(args.version);
  return args;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (typeof value === 'undefined') {
    throw new Error(`Flag ${flag} requires a value.`);
  }
  return value;
}

function printUsage(): void {
  console.log(`FoundryData release helper

Usage:
  npm run release -- --version <semver> [--note "<change>"] [--date YYYY-MM-DD] [--dry-run] [--skip-build]

Options:
  --version, -v      Target SemVer (required)
  --note, -n         Release note (repeat for multiple bullets)
  --date             Release date (defaults to today, UTC)
  --dry-run          Preview without writing manifests/changelog or running npm commands
  --skip-build       Skip npm run build after version alignment
  --help, -h         Show this help message
`);
}

async function ensureCleanGit(dryRun: boolean): Promise<void> {
  if (dryRun) {
    return;
  }
  const { stdout } = await execFileAsync('git', ['status', '--porcelain']);
  if (stdout.trim().length > 0) {
    throw new Error(
      'Working tree is not clean. Commit or stash changes before running the release.'
    );
  }
}

export async function prepareRelease(
  repoRoot: string,
  args: ReleaseArgs
): Promise<ReleaseSummary> {
  await ensureCleanGit(args.dryRun);
  const manifestResults = await updateWorkspaceVersions(
    repoRoot,
    args.version,
    {
      dryRun: args.dryRun,
    }
  );
  const changelogSummary = await recordReleaseInChangelog(
    repoRoot,
    { version: args.version, date: args.date, notes: args.notes },
    { dryRun: args.dryRun }
  );

  return {
    manifestResults,
    changelogHeading: changelogSummary.heading,
    noteCount: changelogSummary.noteCount,
  };
}

export async function runRelease(
  args: ReleaseArgs,
  repoRoot: string = process.cwd()
): Promise<ReleaseSummary> {
  console.log(
    `Preparing FoundryData release ${args.version} (date ${args.date}) — dryRun=${args.dryRun}`
  );

  const summary = await prepareRelease(repoRoot, args);

  await runCommand('npm', ['install', '--package-lock-only'], {
    dryRun: args.dryRun,
  });

  if (!args.skipBuild) {
    await runCommand('npm', ['run', 'build'], { dryRun: args.dryRun });
  } else {
    console.log('Skipping npm run build (per --skip-build flag).');
  }

  const body = summary.manifestResults
    .map((result) => {
      const depSummary =
        result.dependencyUpdates.length > 0
          ? `, deps: ${result.dependencyUpdates.join('; ')}`
          : '';
      const delta = result.versionChanged ? 'updated' : 'unchanged';
      return `• ${result.path} — ${result.previousVersion} -> ${result.nextVersion} (${delta}${depSummary})`;
    })
    .join('\n');

  console.log('\nManifest alignment summary:\n' + body);
  console.log(
    `\nChangelog updated with heading "${summary.changelogHeading}" (${summary.noteCount} note(s)).`
  );
  console.log(`\nNext steps:
1. Review git diff (versions and changelog).
2. Commit the release prep with an appropriate message.
3. Tag the commit with "v${args.version}" and push the tag.
4. Publish packages from packages/cli, packages/core, and packages/shared.`);

  return summary;
}

export async function runReleaseFromCLI(
  argv = process.argv.slice(2)
): Promise<void> {
  const parsed = parseReleaseArgs(argv);
  await runRelease(parsed);
}

const executedDirectly =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (executedDirectly) {
  runReleaseFromCLI().catch((error) => {
    console.error('Release preparation failed:', error);
    process.exitCode = 1;
  });
}
