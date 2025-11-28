import type { CoverageReport, CoverageTargetReport } from '@foundrydata/shared';

export type CoverageTargetDiffKind =
  | 'unchanged'
  | 'added'
  | 'removed'
  | 'statusChanged';

export interface CoverageTargetDiffEntry {
  kind: CoverageTargetDiffKind;
  /**
   * Target as seen in the baseline report (A) when applicable.
   */
  from?: CoverageTargetReport;
  /**
   * Target as seen in the comparison report (B) when applicable.
   */
  to?: CoverageTargetReport;
}

export interface CoverageTargetsDiff {
  /**
   * All targets present in at least one of the reports, classified
   * into unchanged / added / removed / statusChanged.
   */
  targets: CoverageTargetDiffEntry[];
  /**
   * Subset of targets considered newly uncovered in the comparison
   * report B, as required by the SPEC multi-run diff section.
   */
  newlyUncovered: CoverageTargetDiffEntry[];
}

function makeTargetKey(target: CoverageTargetReport): string {
  const { id, dimension, kind, canonPath, operationKey } = target;

  return [id, dimension, kind, canonPath, operationKey ?? ''].join('|');
}

interface TargetIndexEntry {
  key: string;
  target: CoverageTargetReport;
}

function indexTargetsById(
  targets: CoverageTargetReport[]
): Map<string, TargetIndexEntry> {
  const index = new Map<string, TargetIndexEntry>();

  for (const target of targets) {
    const key = makeTargetKey(target);

    // If the same id appears multiple times with different shapes,
    // we keep the first and let callers handle this as a higher-level
    // incompatibility if needed. The diff stage itself remains
    // conservative and deterministic.
    if (!index.has(target.id)) {
      index.set(target.id, { key, target });
    }
  }

  return index;
}

// eslint-disable-next-line max-lines-per-function, complexity
export function diffCoverageTargets(
  reportA: CoverageReport,
  reportB: CoverageReport
): CoverageTargetsDiff {
  const indexA = indexTargetsById(reportA.targets);
  const indexB = indexTargetsById(reportB.targets);

  const targets: CoverageTargetDiffEntry[] = [];
  const newlyUncovered: CoverageTargetDiffEntry[] = [];

  // Classify targets that are present in A.
  for (const [id, entryA] of indexA) {
    const entryB = indexB.get(id);

    if (!entryB) {
      const diffEntry: CoverageTargetDiffEntry = {
        kind: 'removed',
        from: entryA.target,
      };
      targets.push(diffEntry);
      continue;
    }

    if (entryA.key === entryB.key) {
      if (
        entryA.target.status === entryB.target.status &&
        entryA.target.hit === entryB.target.hit
      ) {
        targets.push({
          kind: 'unchanged',
          from: entryA.target,
          to: entryB.target,
        });
      } else {
        const diffEntry: CoverageTargetDiffEntry = {
          kind: 'statusChanged',
          from: entryA.target,
          to: entryB.target,
        };

        targets.push(diffEntry);

        // eslint-disable-next-line max-depth
        if (!entryB.target.hit && entryA.target.hit) {
          newlyUncovered.push(diffEntry);
        }
      }
    } else {
      // Same id but different identifying shape. At this stage we treat
      // them as independent removed/added targets; higher-level
      // validation of report compatibility (version, engine major,
      // operationsScope, etc.) is handled elsewhere.
      targets.push({ kind: 'removed', from: entryA.target });
      targets.push({ kind: 'added', to: entryB.target });

      if (!entryB.target.hit) {
        newlyUncovered.push({ kind: 'added', to: entryB.target });
      }
    }

    indexB.delete(id);
  }

  // Remaining targets exist only in B and are therefore added.
  for (const [, entryB] of indexB) {
    const diffEntry: CoverageTargetDiffEntry = {
      kind: 'added',
      to: entryB.target,
    };

    targets.push(diffEntry);

    if (!entryB.target.hit) {
      newlyUncovered.push(diffEntry);
    }
  }

  return { targets, newlyUncovered };
}
