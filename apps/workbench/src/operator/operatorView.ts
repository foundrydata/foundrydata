import type { Report } from 'json-schema-reporter/model/report';

export type OperatorLevel = 'ok' | 'limited' | 'blocked';

export interface OperatorIndicator {
  level: OperatorLevel;
  title: string;
  summary: string;
  actionHint?: string;
}

export interface OperatorView {
  overallStatus: OperatorIndicator;
  schemaQuality: OperatorIndicator;
  exampleReliability: OperatorIndicator;
  performance: OperatorIndicator;
}

export function buildOperatorView(report: Report): OperatorView {
  const schemaQuality = computeSchemaQualityIndicator(report);
  const exampleReliability = computeExampleReliabilityIndicator(report);
  const performance = computePerformanceIndicator(report);

  const overallLevel = maxLevel(
    schemaQuality.level,
    exampleReliability.level,
    performance.level
  );
  const overallStatus: OperatorIndicator = {
    level: overallLevel,
    title: 'Global status',
    summary: overallSummaryFromLevel(overallLevel),
    actionHint: overallActionFromLevel(overallLevel),
  };

  return {
    overallStatus,
    schemaQuality,
    exampleReliability,
    performance,
  };
}

function computeSchemaQualityIndicator(report: Report): OperatorIndicator {
  const flags = collectSchemaFlags(report);
  let level: OperatorLevel;
  let summary: string;
  let actionHint: string | undefined;

  if (flags.hasFatal || flags.hasCritical) {
    level = 'blocked';
    summary =
      'Schema is in a blocking state (logical or compatibility issue detected).';
    actionHint =
      'Do not deploy as-is. Ask the technical team to review and fix the schema or diagnostics.';
  } else if (flags.hasApproxOrComplexity || flags.warnCount > 10) {
    level = 'limited';
    summary =
      'Schema is usable, but some parts are approximated or potentially fragile.';
    actionHint =
      'Safe to use in test environments. For unexpected behavior, escalate to the technical team mentioning the warnings.';
  } else {
    level = 'ok';
    summary = 'No major issues detected on the schema.';
    actionHint =
      'Usable in production. Keep monitoring reports when the schema evolves.';
  }

  return {
    level,
    title: 'Schema quality',
    summary,
    actionHint,
  };
}

interface SchemaFlags {
  hasFatal: boolean;
  hasCritical: boolean;
  hasApproxOrComplexity: boolean;
  warnCount: number;
}

function collectSchemaFlags(report: Report): SchemaFlags {
  const diagRoot = report.compose?.result?.diag;
  const fatal = diagRoot?.fatal ?? [];
  const warn = diagRoot?.warn ?? [];
  const fatalCodes = new Set(fatal.map((diag) => diag.code));
  const warnCodes = new Set(warn.map((diag) => diag.code));

  const criticalCodes = new Set([
    'UNSAT_REQUIRED_AP_FALSE',
    'CONTAINS_NEED_MIN_GT_MAX',
    'CONTAINS_UNSAT_BY_SUM',
  ]);

  const approxCodesExact = new Set([
    'AP_FALSE_UNSAFE_PATTERN',
    'AP_FALSE_INTERSECTION_APPROX',
    'REGEX_COMPLEXITY_CAPPED',
    'EXTERNAL_REF_UNRESOLVED',
  ]);

  const hasComplexityCaps = [...warnCodes].some((code) =>
    code.startsWith('COMPLEXITY_CAP_')
  );
  const hasApproxCodeExact = [...warnCodes].some((code) =>
    approxCodesExact.has(code)
  );

  return {
    hasFatal: fatal.length > 0,
    hasCritical: [...fatalCodes, ...warnCodes].some((code) =>
      criticalCodes.has(code)
    ),
    hasApproxOrComplexity: hasApproxCodeExact || hasComplexityCaps,
    warnCount: warn.length,
  };
}

function computeExampleReliabilityIndicator(report: Report): OperatorIndicator {
  const { totalInstances, validRepaired, invalid } = report.summary;

  if (!totalInstances || totalInstances <= 0) {
    return {
      level: 'blocked',
      title: 'Example reliability',
      summary: 'No examples were generated for this schema.',
      actionHint:
        'Do not rely on this run. Ask the technical team to investigate why no examples can be produced.',
    };
  }

  const ratioInvalid = invalid / totalInstances;
  const ratioRepaired = validRepaired / totalInstances;

  let level: OperatorLevel;
  let summary: string;
  let actionHint: string | undefined;

  if (ratioInvalid > 0.5) {
    level = 'blocked';
    summary = 'Most generated examples are invalid or fail validation.';
    actionHint =
      'Do not use these examples to validate changes. Ask the technical team to review failures.';
  } else if (ratioRepaired > 0.3 || invalid > 0) {
    level = 'limited';
    summary =
      'Examples are mostly usable, but some are auto-corrected or invalid.';
    actionHint =
      'OK for exploratory use. For critical decisions, ask for technical validation.';
  } else {
    level = 'ok';
    summary =
      'Generated examples are consistent with the schema and reference validator.';
    actionHint =
      'Safe to use these examples to understand and validate schema behavior.';
  }

  return {
    level,
    title: 'Example reliability',
    summary,
    actionHint,
  };
}

function computePerformanceIndicator(report: Report): OperatorIndicator {
  const perfFlags = evaluatePerformanceSignals(report);
  let level: OperatorLevel;
  let summary: string;
  let actionHint: string | undefined;

  if (perfFlags.blocked) {
    level = 'blocked';
    summary =
      'The engine has reached its limits on this schema (budget exhausted or excessive complexity).';
    actionHint =
      'Do not use this schema in production in this state. Ask for schema simplification or configuration adjustments.';
  } else if (perfFlags.limited) {
    level = 'limited';
    summary =
      'Performance is acceptable but some parts of the schema are costly or approximated.';
    actionHint =
      'Usable, but monitor latency and avoid large increases in volume without further testing.';
  } else {
    level = 'ok';
    summary =
      'Processing times are within normal range, without significant limits reached.';
    actionHint = 'No specific performance action required.';
  }

  return {
    level,
    title: 'Performance',
    summary,
    actionHint,
  };
}

function evaluatePerformanceSignals(report: Report): {
  blocked: boolean;
  limited: boolean;
} {
  const diagFlags = collectPerformanceDiagFlags(report);
  const metricFlags = collectPerformanceMetricFlags(report);

  const blocked =
    diagFlags.unsatBudget ||
    (diagFlags.complexityCaps && metricFlags.heavyLatency);
  const limited =
    !blocked &&
    (diagFlags.complexityCaps ||
      metricFlags.moderateLatency ||
      metricFlags.excessiveRepairs);

  return { blocked, limited };
}

interface PerformanceDiagFlags {
  unsatBudget: boolean;
  complexityCaps: boolean;
}

function collectPerformanceDiagFlags(report: Report): PerformanceDiagFlags {
  const diagRoot = report.compose?.result?.diag;
  const warn = diagRoot?.warn ?? [];
  const run = diagRoot?.run ?? [];
  const warnCodes = new Set(warn.map((diag) => diag.code));
  const runCodes = new Set(run.map((diag) => diag.code));

  return {
    unsatBudget: [...warnCodes, ...runCodes].some(
      (code) => code === 'UNSAT_BUDGET_EXHAUSTED'
    ),
    complexityCaps: [...warnCodes].some((code) =>
      code.startsWith('COMPLEXITY_CAP_')
    ),
  };
}

interface PerformanceMetricFlags {
  heavyLatency: boolean;
  moderateLatency: boolean;
  excessiveRepairs: boolean;
}

function collectPerformanceMetricFlags(report: Report): PerformanceMetricFlags {
  const metrics = report.metrics;
  const validateMs = metrics?.validateMs ?? 0;
  const p95LatencyMs = metrics?.p95LatencyMs ?? 0;
  const repairPasses = metrics?.repairPassesPerRow ?? 0;

  return {
    heavyLatency: validateMs > 2000 || p95LatencyMs > 2000,
    moderateLatency: p95LatencyMs > 1000,
    excessiveRepairs: repairPasses > 5,
  };
}

function maxLevel(...levels: OperatorLevel[]): OperatorLevel {
  const order: OperatorLevel[] = ['ok', 'limited', 'blocked'];
  return levels.reduce(
    (acc, cur) => (order.indexOf(cur) > order.indexOf(acc) ? cur : acc),
    'ok'
  );
}

function overallSummaryFromLevel(level: OperatorLevel): string {
  switch (level) {
    case 'ok':
      return 'All indicators are green. Schema and examples are usable in normal conditions.';
    case 'limited':
      return 'Some limitations or approximations exist. Schema is usable with caution.';
    case 'blocked':
      return 'A blocking issue has been detected. Do not deploy without technical review.';
    default:
      return '';
  }
}

function overallActionFromLevel(level: OperatorLevel): string | undefined {
  switch (level) {
    case 'ok':
      return 'You can use this schema and examples as usual. Monitor reports after schema changes.';
    case 'limited':
      return 'Use with caution. For critical changes or unexpected behavior, contact the technical team.';
    case 'blocked':
      return 'Do not deploy or rely on this schema. Ask the technical team to diagnose and fix blocking issues.';
    default:
      return undefined;
  }
}
