/* eslint-disable complexity */
/* eslint-disable max-lines */
import type {
  CoverageTarget,
  UnsatisfiedHintReasonCode,
} from '@foundrydata/shared';
import type {
  CoverageIndex,
  ComposeDiagnostics,
} from '../transform/composition-engine.js';
import {
  buildPropertyCanonPath,
  getBranchCountForTarget,
  isPathUnderUnsat,
  resolveSchemaNode,
  stripHashPrefix,
} from './conflict-detector-utils.js';

type ConflictHintKind =
  | 'preferBranch'
  | 'ensurePropertyPresence'
  | 'coverEnumValue';

interface ConflictHint {
  kind: ConflictHintKind;
  canonPath?: string;
  params?: Record<string, unknown>;
}

export interface ConflictCheckInput {
  hint: ConflictHint;
  target?: CoverageTarget;
  canonSchema: unknown;
  coverageIndex: CoverageIndex;
  planDiag?: ComposeDiagnostics;
  unsatPaths?: Set<string>;
}

export interface ConflictCheckResult {
  isConflicting: boolean;
  reasonCode?: UnsatisfiedHintReasonCode;
  reasonDetail?: string;
}

export class ConflictDetector {
  static checkHintConflict(input: ConflictCheckInput): ConflictCheckResult {
    switch (input.hint.kind) {
      case 'ensurePropertyPresence':
        return this.checkPropertyPresenceConflict(input);
      case 'preferBranch':
        return this.checkBranchConflict(input);
      case 'coverEnumValue':
        return this.checkEnumConflict(input);
      default:
        return { isConflicting: false };
    }
  }

  private static checkPropertyPresenceConflict(
    input: ConflictCheckInput
  ): ConflictCheckResult {
    const { hint, target, coverageIndex, unsatPaths, canonSchema } = input;
    const propertyName =
      hint.params && typeof hint.params.propertyName === 'string'
        ? hint.params.propertyName
        : undefined;
    if (!propertyName) {
      return { isConflicting: false };
    }
    if (target && this.isTargetMarkedConflict(target)) {
      return this.composeResultFromTarget(target);
    }
    const propertyCanonPath = buildPropertyCanonPath(
      hint.canonPath,
      propertyName
    );

    const diagnosticsConflict = this.checkPropertyConflictFromDiagnostics(
      propertyName,
      hint.canonPath,
      propertyCanonPath,
      unsatPaths
    );
    if (diagnosticsConflict) {
      return diagnosticsConflict;
    }

    const structuralConflict = this.checkPropertyConflictFromSchema(
      propertyName,
      hint.canonPath,
      propertyCanonPath,
      canonSchema
    );
    if (structuralConflict) {
      return structuralConflict;
    }

    const indexConflict = this.checkPropertyConflictFromCoverageIndex(
      propertyName,
      hint.canonPath,
      coverageIndex
    );
    if (indexConflict) {
      return indexConflict;
    }

    return { isConflicting: false };
  }

  private static checkBranchConflict(
    input: ConflictCheckInput
  ): ConflictCheckResult {
    const { hint, target, canonSchema, unsatPaths } = input;
    const branchIndex = this.extractNonNegativeInteger(
      hint.params?.branchIndex
    );
    if (branchIndex === undefined) {
      return { isConflicting: false };
    }
    if (target && this.isTargetMarkedConflict(target)) {
      return this.composeResultFromTarget(target);
    }
    const branchSpecificPath = this.buildBranchSpecificPath(
      hint.canonPath,
      branchIndex
    );

    const diagnosticsConflict = this.checkBranchConflictFromDiagnostics(
      branchIndex,
      hint.canonPath,
      branchSpecificPath,
      unsatPaths
    );
    if (diagnosticsConflict) {
      return diagnosticsConflict;
    }

    const structuralConflict = this.checkBranchConflictFromSchema(branchIndex, {
      unionCanonPath: hint.canonPath,
      branchSpecificPath,
      target,
      canonSchema,
    });
    if (structuralConflict) {
      return structuralConflict;
    }

    return { isConflicting: false };
  }

  private static checkEnumConflict(
    input: ConflictCheckInput
  ): ConflictCheckResult {
    const { hint, target, canonSchema } = input;
    const rawValueIndex = hint.params?.valueIndex;
    const valueIndex =
      typeof rawValueIndex === 'number' &&
      Number.isInteger(rawValueIndex) &&
      rawValueIndex >= 0
        ? rawValueIndex
        : undefined;
    if (valueIndex === undefined) {
      return { isConflicting: false };
    }
    if (target && this.isTargetMarkedConflict(target)) {
      return this.composeResultFromTarget(target);
    }
    const schemaNode = resolveSchemaNode(canonSchema, hint.canonPath);
    if (!schemaNode || typeof schemaNode !== 'object') {
      return { isConflicting: false };
    }
    const enumArray = Array.isArray(
      (schemaNode as Record<string, unknown>).enum
    )
      ? ((schemaNode as Record<string, unknown>).enum as unknown[])
      : undefined;
    if (!enumArray) {
      return { isConflicting: false };
    }
    if (valueIndex >= enumArray.length) {
      return {
        isConflicting: true,
        reasonCode: 'CONFLICTING_CONSTRAINTS',
        reasonDetail: `Enum at ${hint.canonPath ?? '#'} contains ${enumArray.length} values, index ${valueIndex} is out of range.`,
      };
    }
    return { isConflicting: false };
  }

  private static isTargetMarkedConflict(target: CoverageTarget): boolean {
    if (target.status === 'unreachable') {
      return true;
    }
    const meta = this.extractMeta(target);
    return meta?.conflictDetected === true;
  }

  private static composeResultFromTarget(
    target: CoverageTarget
  ): ConflictCheckResult {
    const meta = this.extractMeta(target);
    const code = meta?.conflictReasonCode as string | undefined;
    const canonPath =
      (meta?.conflictReasonCanonPath as string | undefined) ?? target.canonPath;
    const detail =
      (meta?.conflictReasonDetail as string | undefined) ??
      (code
        ? `${code} at ${canonPath}`
        : `Target ${target.canonPath ?? '#'} is unreachable`);
    const reasonCode: UnsatisfiedHintReasonCode =
      target.dimension === 'branches' ||
      target.kind === 'ONEOF_BRANCH' ||
      target.kind === 'ANYOF_BRANCH'
        ? 'UNREACHABLE_BRANCH'
        : 'CONFLICTING_CONSTRAINTS';
    return {
      isConflicting: true,
      reasonCode,
      reasonDetail: detail,
    };
  }

  private static extractMeta(
    target: CoverageTarget
  ): Record<string, unknown> | undefined {
    if (!target.meta || typeof target.meta !== 'object') {
      return undefined;
    }
    return target.meta as Record<string, unknown>;
  }

  private static checkPropertyConflictFromDiagnostics(
    propertyName: string,
    ownerCanonPath: string | undefined,
    propertyCanonPath: string | undefined,
    unsatPaths?: Set<string>
  ): ConflictCheckResult | undefined {
    if (isPathUnderUnsat(propertyCanonPath, unsatPaths)) {
      const blockedPath = propertyCanonPath ?? ownerCanonPath ?? '#';
      return {
        isConflicting: true,
        reasonCode: 'CONFLICTING_CONSTRAINTS',
        reasonDetail: `Property '${propertyName}' at ${blockedPath} is blocked by Compose diagnostics`,
      };
    }
    if (isPathUnderUnsat(ownerCanonPath, unsatPaths)) {
      const blockedPath = propertyCanonPath ?? ownerCanonPath ?? '#';
      return {
        isConflicting: true,
        reasonCode: 'CONFLICTING_CONSTRAINTS',
        reasonDetail: `Property '${propertyName}' at ${blockedPath} is blocked by Compose diagnostics`,
      };
    }
    return undefined;
  }

  private static checkPropertyConflictFromSchema(
    propertyName: string,
    ownerCanonPath: string | undefined,
    _propertyCanonPath: string | undefined,
    canonSchema: unknown
  ): ConflictCheckResult | undefined {
    if (!canonSchema) {
      return undefined;
    }
    const ownerSchemaNode = resolveSchemaNode(canonSchema, ownerCanonPath);
    const notRequiredConflict = this.checkNotRequiredConflict(
      propertyName,
      ownerCanonPath,
      ownerSchemaNode
    );
    if (notRequiredConflict) {
      return notRequiredConflict;
    }

    return undefined;
  }

  private static checkNotRequiredConflict(
    propertyName: string,
    ownerCanonPath: string | undefined,
    ownerSchemaNode: unknown
  ): ConflictCheckResult | undefined {
    if (
      ownerSchemaNode &&
      typeof ownerSchemaNode === 'object' &&
      (ownerSchemaNode as Record<string, unknown>).not &&
      typeof (ownerSchemaNode as Record<string, unknown>).not === 'object'
    ) {
      const notNode = (
        ownerSchemaNode as {
          not?: { required?: unknown };
        }
      ).not;
      const required = Array.isArray(notNode?.required)
        ? (notNode?.required as unknown[])
        : [];
      if (
        required.some(
          (entry) => typeof entry === 'string' && entry === propertyName
        )
      ) {
        return {
          isConflicting: true,
          reasonCode: 'CONFLICTING_CONSTRAINTS',
          reasonDetail: `Property '${propertyName}' is forbidden by not/required at ${
            ownerCanonPath ?? '#'
          }.`,
        };
      }
    }
    return undefined;
  }

  private static checkPropertyConflictFromCoverageIndex(
    propertyName: string,
    ownerCanonPath: string | undefined,
    coverageIndex: CoverageIndex
  ): ConflictCheckResult | undefined {
    const ownerPointer = stripHashPrefix(ownerCanonPath);
    const entry = coverageIndex.get(ownerPointer);
    if (entry && typeof entry.has === 'function' && !entry.has(propertyName)) {
      return {
        isConflicting: true,
        reasonCode: 'CONFLICTING_CONSTRAINTS',
        reasonDetail: `CoverageIndex forbids property '${propertyName}' under ${
          ownerCanonPath ?? '#'
        } (AP:false).`,
      };
    }
    return undefined;
  }

  private static extractNonNegativeInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
      ? value
      : undefined;
  }

  private static buildBranchSpecificPath(
    unionCanonPath: string | undefined,
    branchIndex: number
  ): string | undefined {
    if (!unionCanonPath) {
      return undefined;
    }
    const trimmed = unionCanonPath.replace(/\/$/, '');
    return `${trimmed}/${branchIndex}`;
  }

  private static checkBranchConflictFromDiagnostics(
    branchIndex: number,
    unionCanonPath: string | undefined,
    branchSpecificPath: string | undefined,
    unsatPaths?: Set<string>
  ): ConflictCheckResult | undefined {
    if (
      branchSpecificPath &&
      unsatPaths &&
      unsatPaths.has(branchSpecificPath)
    ) {
      return {
        isConflicting: true,
        reasonCode: 'UNREACHABLE_BRANCH',
        reasonDetail: `Branch ${branchIndex} at ${branchSpecificPath} is unreachable via Compose UNSAT signals.`,
      };
    }
    if (isPathUnderUnsat(unionCanonPath, unsatPaths)) {
      const path = unionCanonPath ?? '#';
      return {
        isConflicting: true,
        reasonCode: 'UNREACHABLE_BRANCH',
        reasonDetail: `Branch ${branchIndex} at ${path} is unreachable via Compose UNSAT signals.`,
      };
    }
    return undefined;
  }

  private static checkBranchConflictFromSchema(
    branchIndex: number,
    context: {
      unionCanonPath?: string;
      branchSpecificPath?: string;
      target?: CoverageTarget;
      canonSchema: unknown;
    }
  ): ConflictCheckResult | undefined {
    const { unionCanonPath, branchSpecificPath, target, canonSchema } = context;
    if (!target || !canonSchema) {
      return undefined;
    }
    const schemaNode = resolveSchemaNode(canonSchema, unionCanonPath);
    if (!schemaNode) {
      return undefined;
    }
    const branchCount = getBranchCountForTarget(target, schemaNode);
    if (branchCount !== undefined && branchIndex >= branchCount) {
      const path = branchSpecificPath ?? unionCanonPath ?? '#';
      return {
        isConflicting: true,
        reasonCode: 'CONFLICTING_CONSTRAINTS',
        reasonDetail: `Branch index ${branchIndex} exceeds available branches (${branchCount}) at ${path}.`,
      };
    }
    return undefined;
  }
}
