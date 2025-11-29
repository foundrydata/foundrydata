/* eslint-disable complexity */
import type {
  CoverageTarget,
  UnsatisfiedHintReasonCode,
} from '@foundrydata/shared';
import type {
  CoverageIndex,
  ComposeDiagnostics,
} from '../transform/composition-engine.js';

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
    const { hint, target, coverageIndex, unsatPaths } = input;
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
    if (unsatPaths && this.isPathUnderUnsat(hint.canonPath, unsatPaths)) {
      return {
        isConflicting: true,
        reasonCode: 'CONFLICTING_CONSTRAINTS',
        reasonDetail: `Path ${hint.canonPath ?? '#'} is blocked by Compose diagnostics`,
      };
    }
    const ownerPointer = stripHashPrefix(hint.canonPath);
    const entry = coverageIndex.get(ownerPointer);
    if (entry && typeof entry.has === 'function' && !entry.has(propertyName)) {
      return {
        isConflicting: true,
        reasonCode: 'CONFLICTING_CONSTRAINTS',
        reasonDetail: `CoverageIndex forbids property '${propertyName}' under ${hint.canonPath ?? '#'} (AP:false).`,
      };
    }
    return { isConflicting: false };
  }

  private static checkBranchConflict(
    input: ConflictCheckInput
  ): ConflictCheckResult {
    const { hint, target, canonSchema, unsatPaths } = input;
    const rawBranchIndex = hint.params?.branchIndex;
    const branchIndex =
      typeof rawBranchIndex === 'number' &&
      Number.isInteger(rawBranchIndex) &&
      rawBranchIndex >= 0
        ? rawBranchIndex
        : undefined;
    if (branchIndex === undefined) {
      return { isConflicting: false };
    }
    if (target && this.isTargetMarkedConflict(target)) {
      return this.composeResultFromTarget(target);
    }
    const branchSpecificPath =
      hint.canonPath && branchIndex !== undefined
        ? `${hint.canonPath.replace(/\/$/, '')}/${branchIndex}`
        : undefined;
    if (
      branchSpecificPath &&
      unsatPaths &&
      unsatPaths.has(branchSpecificPath)
    ) {
      return {
        isConflicting: true,
        reasonCode: 'CONFLICTING_CONSTRAINTS',
        reasonDetail: `Branch ${branchIndex} at ${branchSpecificPath} is unreachable via Compose UNSAT signals.`,
      };
    }
    if (unsatPaths && this.isPathUnderUnsat(hint.canonPath, unsatPaths)) {
      return {
        isConflicting: true,
        reasonCode: 'CONFLICTING_CONSTRAINTS',
        reasonDetail: `Branch ${branchIndex} at ${hint.canonPath ?? '#'} is unreachable via Compose UNSAT signals.`,
      };
    }
    const schemaNode = this.resolveSchemaNode(canonSchema, hint.canonPath);
    if (schemaNode && target) {
      const branchCount = this.getBranchCountForTarget(target, schemaNode);
      if (branchCount !== undefined && branchIndex >= branchCount) {
        return {
          isConflicting: true,
          reasonCode: 'CONFLICTING_CONSTRAINTS',
          reasonDetail: `Branch index ${branchIndex} exceeds available branches (${branchCount}) at ${hint.canonPath ?? '#'}.`,
        };
      }
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
    const schemaNode = this.resolveSchemaNode(canonSchema, hint.canonPath);
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
    return {
      isConflicting: true,
      reasonCode: 'CONFLICTING_CONSTRAINTS',
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

  private static isPathUnderUnsat(
    canonPath: string | undefined,
    unsatPaths: Set<string>
  ): boolean {
    if (!canonPath || unsatPaths.size === 0) {
      return false;
    }
    for (const unsatPath of unsatPaths) {
      if (!unsatPath) {
        continue;
      }
      if (canonPath === unsatPath) {
        return true;
      }
      if (
        canonPath.startsWith(unsatPath) &&
        (canonPath.length === unsatPath.length ||
          canonPath.charAt(unsatPath.length) === '/' ||
          (unsatPath.endsWith('/') && canonPath.startsWith(unsatPath)))
      ) {
        return true;
      }
    }
    return false;
  }

  private static resolveSchemaNode(
    schema: unknown,
    canonPath?: string
  ): unknown {
    if (!canonPath || !schema || typeof schema !== 'object') {
      return schema;
    }
    const pointer = stripHashPrefix(canonPath);
    if (pointer === '') {
      return schema;
    }
    const segments = pointer.split('/').filter((segment) => segment.length > 0);
    let current: unknown = schema;
    for (const rawSegment of segments) {
      const segment = decodePointerSegment(rawSegment);
      if (Array.isArray(current)) {
        const index = Number(segment);
        if (Number.isInteger(index) && index >= 0 && index < current.length) {
          current = current[index];
          continue;
        }
        return undefined;
      }
      if (
        current &&
        typeof current === 'object' &&
        Object.prototype.hasOwnProperty.call(current, segment)
      ) {
        current = (current as Record<string, unknown>)[segment];
        continue;
      }
      return undefined;
    }
    return current;
  }

  private static getBranchCountForTarget(
    target: CoverageTarget,
    schemaNode: unknown
  ): number | undefined {
    if (Array.isArray(schemaNode)) {
      return schemaNode.length;
    }
    if (!schemaNode || typeof schemaNode !== 'object') {
      return undefined;
    }
    switch (target.kind) {
      case 'ONEOF_BRANCH':
        return Array.isArray((schemaNode as Record<string, unknown>).oneOf)
          ? ((schemaNode as Record<string, unknown>).oneOf as unknown[]).length
          : undefined;
      case 'ANYOF_BRANCH':
        return Array.isArray((schemaNode as Record<string, unknown>).anyOf)
          ? ((schemaNode as Record<string, unknown>).anyOf as unknown[]).length
          : undefined;
      default:
        return undefined;
    }
  }
}

function stripHashPrefix(canonPath?: string): string {
  if (!canonPath) {
    return '';
  }
  if (canonPath.startsWith('#')) {
    return canonPath.slice(1);
  }
  return canonPath;
}

function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}
