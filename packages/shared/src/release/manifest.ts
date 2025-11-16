/* eslint-disable max-depth */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gt, valid as validateSemVer } from 'semver';

export const WORKSPACE_MANIFEST_PATHS = [
  'package.json',
  'packages/core/package.json',
  'packages/shared/package.json',
  'packages/cli/package.json',
] as const;

const WORKSPACE_PACKAGE_NAMES = new Set([
  'foundrydata',
  '@foundrydata/core',
  '@foundrydata/shared',
]);

type DependencySection =
  | 'dependencies'
  | 'devDependencies'
  | 'peerDependencies'
  | 'optionalDependencies';

type VersionMap = Record<string, string>;

export interface ManifestUpdateResult {
  path: string;
  previousVersion: string;
  nextVersion: string;
  versionChanged: boolean;
  dependencyUpdates: string[];
}

export interface UpdateWorkspaceVersionsOptions {
  dryRun?: boolean;
}

export interface WorkspaceManifest {
  name?: string;
  version?: string;
  [key: string]: unknown;
}

export function assertSemVer(value: string): string {
  const normalized = validateSemVer(value);
  if (!normalized) {
    throw new Error(
      `Invalid SemVer string "${value}". Expected MAJOR.MINOR.PATCH with optional pre-release/build metadata.`
    );
  }
  return normalized;
}

export async function updateWorkspaceVersions(
  rootDir: string,
  targetVersion: string,
  options: UpdateWorkspaceVersionsOptions = {}
): Promise<ManifestUpdateResult[]> {
  const normalizedVersion = assertSemVer(targetVersion);
  const results: ManifestUpdateResult[] = [];
  for (const relativePath of WORKSPACE_MANIFEST_PATHS) {
    const absolutePath = path.resolve(rootDir, relativePath);
    const manifest = await readManifest(absolutePath);
    const previousVersion = manifest.version;
    if (typeof previousVersion !== 'string') {
      throw new Error(
        `Manifest "${relativePath}" is missing a string "version" field.`
      );
    }
    if (gt(previousVersion, normalizedVersion)) {
      throw new Error(
        `Manifest "${relativePath}" is at ${previousVersion}, which is ahead of target ${normalizedVersion}.`
      );
    }

    const dependencyUpdates = alignWorkspaceDependencies(
      manifest,
      normalizedVersion
    );
    const versionChanged = previousVersion !== normalizedVersion;
    const shouldWrite =
      !options.dryRun && (versionChanged || dependencyUpdates.length > 0);
    if (shouldWrite) {
      manifest.version = normalizedVersion;
      await writeManifest(absolutePath, manifest);
    }

    results.push({
      path: relativePath,
      previousVersion,
      nextVersion: normalizedVersion,
      versionChanged,
      dependencyUpdates,
    });
  }
  return results;
}

async function readManifest(manifestPath: string): Promise<WorkspaceManifest> {
  const raw = await readFile(manifestPath, 'utf8');
  return JSON.parse(raw) as WorkspaceManifest;
}

async function writeManifest(
  manifestPath: string,
  manifest: WorkspaceManifest
): Promise<void> {
  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(manifestPath, body, 'utf8');
}

function alignWorkspaceDependencies(
  manifest: WorkspaceManifest,
  targetVersion: string
): string[] {
  const changes: string[] = [];
  const sections: DependencySection[] = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];

  for (const section of sections) {
    const record = manifest[section];
    if (!record || typeof record !== 'object') {
      continue;
    }
    const deps = record as VersionMap;
    for (const workspaceName of WORKSPACE_PACKAGE_NAMES) {
      if (typeof deps[workspaceName] === 'string') {
        const desiredRange = `^${targetVersion}`;
        if (deps[workspaceName] !== desiredRange) {
          changes.push(
            `${section}.${workspaceName}: ${deps[workspaceName]} -> ${desiredRange}`
          );
          deps[workspaceName] = desiredRange;
        }
      }
    }
  }

  return changes;
}
