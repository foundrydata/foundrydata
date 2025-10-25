import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { recordReleaseInChangelog } from '../changelog.js';
import {
  updateWorkspaceVersions,
  WORKSPACE_MANIFEST_PATHS,
} from '../manifest.js';
import { parseReleaseArgs, runRelease } from '../cli.js';

describe('manifest alignment', () => {
  it('updates all manifests and aligned dependencies to the target version', async () => {
    const workspace = await createWorkspaceFixture();
    try {
      const results = await updateWorkspaceVersions(workspace, '0.2.0');
      expect(results).toHaveLength(WORKSPACE_MANIFEST_PATHS.length);
      const cliManifest = JSON.parse(
        await readFile(
          path.join(workspace, 'packages/cli/package.json'),
          'utf8'
        )
      );
      expect(cliManifest.version).toBe('0.2.0');
      expect(cliManifest.dependencies['@foundrydata/core']).toBe('^0.2.0');

      const coreManifest = JSON.parse(
        await readFile(
          path.join(workspace, 'packages/core/package.json'),
          'utf8'
        )
      );
      expect(coreManifest.dependencies['@foundrydata/shared']).toBe('^0.2.0');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('rejects downgrades when a manifest already has a higher version', async () => {
    const workspace = await createWorkspaceFixture();
    try {
      await expect(updateWorkspaceVersions(workspace, '0.0.9')).rejects.toThrow(
        /ahead of target/i
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe('changelog recording', () => {
  it('creates the changelog if needed and inserts the new entry below Unreleased', async () => {
    const workspace = await createWorkspaceFixture();
    const changelogPath = path.join(workspace, 'docs/CHANGELOG.md');
    await mkdir(path.dirname(changelogPath), { recursive: true });
    await writeFile(
      changelogPath,
      `# FoundryData Changelog

All notable changes.

## [Unreleased]
- Pending changes

## [0.1.0] - 2025-10-01
- Baseline
`,
      'utf8'
    );

    try {
      await recordReleaseInChangelog(
        workspace,
        {
          version: '0.2.0',
          date: '2025-10-26',
          notes: ['Add release orchestration helpers'],
        },
        { dryRun: false }
      );

      const changelog = await readFile(changelogPath, 'utf8');
      const idxUnreleased = changelog.indexOf('## [Unreleased]');
      const idxNew = changelog.indexOf('## [0.2.0]');
      const idxOld = changelog.indexOf('## [0.1.0]');

      expect(idxUnreleased).toBeLessThan(idxNew);
      expect(idxNew).toBeLessThan(idxOld);
      expect(changelog).toContain('- Add release orchestration helpers');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  it('prevents duplicate entries for the same version', async () => {
    const workspace = await createWorkspaceFixture();
    try {
      await recordReleaseInChangelog(
        workspace,
        { version: '0.2.0', date: '2025-10-26', notes: ['first'] },
        { dryRun: false }
      );
      await expect(
        recordReleaseInChangelog(
          workspace,
          { version: '0.2.0', date: '2025-10-26', notes: ['second'] },
          { dryRun: false }
        )
      ).rejects.toThrow(/already contains/i);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

describe('cli utilities', () => {
  it('parses repeated notes and flags', () => {
    const args = parseReleaseArgs([
      '--version',
      '1.2.3',
      '--note',
      'first',
      '--note',
      'second',
      '--skip-build',
    ]);
    expect(args.version).toBe('1.2.3');
    expect(args.notes).toEqual(['first', 'second']);
    expect(args.skipBuild).toBe(true);
    expect(args.dryRun).toBe(false);
  });

  it('runs the release workflow in dry-run mode without mutating manifests', async () => {
    const workspace = await createWorkspaceFixture();
    try {
      const summary = await runRelease(
        {
          version: '0.3.0',
          notes: ['Dry-run test'],
          date: '2025-10-26',
          dryRun: true,
          skipBuild: true,
        },
        workspace
      );

      expect(summary.manifestResults).toHaveLength(
        WORKSPACE_MANIFEST_PATHS.length
      );
      const [rootResult] = summary.manifestResults;
      expect(rootResult).toBeDefined();
      expect(rootResult?.nextVersion).toBe('0.3.0');

      const rootManifest = JSON.parse(
        await readFile(path.join(workspace, 'package.json'), 'utf8')
      );
      expect(rootManifest.version).toBe('0.1.0');
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});

async function createWorkspaceFixture(): Promise<string> {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), 'foundrydata-release-')
  );
  await Promise.all(
    WORKSPACE_MANIFEST_PATHS.map(async (relativePath) => {
      const absolutePath = path.join(workspace, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(
        absolutePath,
        JSON.stringify(buildManifestStub(relativePath), null, 2),
        'utf8'
      );
    })
  );
  return workspace;
}

function buildManifestStub(relativePath: string): Record<string, unknown> {
  const base = {
    name: 'workspace-package',
    version: '0.1.0',
  };

  if (relativePath === 'package.json') {
    return {
      ...base,
      private: true,
    };
  }

  if (relativePath === 'packages/core/package.json') {
    return {
      ...base,
      name: '@foundrydata/core',
      dependencies: {
        '@foundrydata/shared': '^0.1.0',
      },
    };
  }

  if (relativePath === 'packages/shared/package.json') {
    return {
      ...base,
      name: '@foundrydata/shared',
    };
  }

  if (relativePath === 'packages/cli/package.json') {
    return {
      ...base,
      name: 'foundrydata',
      dependencies: {
        '@foundrydata/core': '^0.1.0',
      },
    };
  }

  return base;
}
