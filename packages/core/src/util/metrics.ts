import { performance } from 'node:perf_hooks';

export const METRIC_PHASES = {
  NORMALIZE: 'normalizeMs',
  COMPOSE: 'composeMs',
  GENERATE: 'generateMs',
  REPAIR: 'repairMs',
  VALIDATE: 'validateMs',
  COMPILE: 'compileMs',
} as const;

export type MetricPhase = keyof typeof METRIC_PHASES;
export type MetricsVerbosity = 'runtime' | 'ci';

export interface BranchCoverageOneOfEntry {
  visited: number[];
  total: number;
}

export interface MetricsSnapshot {
  normalizeMs: number;
  composeMs: number;
  generateMs: number;
  repairMs: number;
  validateMs: number;
  compileMs?: number;
  validationsPerRow: number;
  repairPassesPerRow: number;
  branchTrialsTried?: number;
  patternWitnessTried?: number;
  memoryPeakMB: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  branchCoverageOneOf?: Record<string, BranchCoverageOneOfEntry>;
  enumUsage?: Record<string, Record<string, number>>;
  repairActionsPerRow?: number;
}

type MetricsPhaseKey = (typeof METRIC_PHASES)[MetricPhase];

interface IdleTimerState {
  total: number;
  startedAt?: undefined;
}

interface ActiveTimerState {
  total: number;
  startedAt: number;
}

type TimerState = IdleTimerState | ActiveTimerState;

const DEFAULT_COUNTERS: MetricsSnapshot = {
  normalizeMs: 0,
  composeMs: 0,
  generateMs: 0,
  repairMs: 0,
  validateMs: 0,
  validationsPerRow: 0,
  repairPassesPerRow: 0,
  memoryPeakMB: 0,
  p50LatencyMs: 0,
  p95LatencyMs: 0,
};

export interface MetricsCollectorOptions {
  now?: () => number;
  verbosity?: MetricsVerbosity;
}

export class MetricsCollector {
  private readonly now: () => number;
  private readonly timers: Record<MetricsPhaseKey, TimerState>;
  private snapshot: MetricsSnapshot;
  private verbosity: MetricsVerbosity;

  constructor(options: MetricsCollectorOptions = {}) {
    this.now = options.now ?? (() => performance.now());
    this.verbosity = options.verbosity ?? 'runtime';
    this.snapshot = { ...DEFAULT_COUNTERS };
    this.timers = {
      normalizeMs: { total: 0 },
      composeMs: { total: 0 },
      generateMs: { total: 0 },
      repairMs: { total: 0 },
      validateMs: { total: 0 },
      compileMs: { total: 0 },
    };
  }

  public setVerbosity(mode: MetricsVerbosity): void {
    this.verbosity = mode;
  }

  public begin(phase: MetricPhase): void {
    const key = METRIC_PHASES[phase];
    const current = this.timers[key];
    if (isActiveTimerState(current)) {
      throw new Error(`Metrics timer for ${phase} already started`);
    }

    this.timers[key] = { total: current.total, startedAt: this.now() };
  }

  public end(phase: MetricPhase): void {
    const key = METRIC_PHASES[phase];
    const current = this.timers[key];
    if (!isActiveTimerState(current)) {
      throw new Error(`Metrics timer for ${phase} was not started`);
    }

    const duration = this.now() - current.startedAt;
    this.accumulateDuration(key, duration);
    const durationView = getDurationView(this.snapshot);
    this.timers[key] = { total: durationView[key] ?? current.total };
  }

  public recordDuration(phase: MetricPhase, durationMs: number): void {
    const key = METRIC_PHASES[phase];
    this.accumulateDuration(key, durationMs);
  }

  public addValidationCount(count: number): void {
    this.snapshot.validationsPerRow += count;
  }

  public addRepairPasses(count: number): void {
    this.snapshot.repairPassesPerRow += count;
  }

  public addRepairActions(count: number): void {
    this.snapshot.repairActionsPerRow =
      (this.snapshot.repairActionsPerRow ?? 0) + count;
  }

  public addBranchTrial(): void {
    this.snapshot.branchTrialsTried =
      (this.snapshot.branchTrialsTried ?? 0) + 1;
  }

  public addPatternWitnessTrial(): void {
    this.snapshot.patternWitnessTried =
      (this.snapshot.patternWitnessTried ?? 0) + 1;
  }

  public setCompileMs(durationMs: number): void {
    this.snapshot.compileMs = durationMs;
  }

  public observeMemoryPeak(megabytes: number): void {
    this.snapshot.memoryPeakMB = Math.max(
      this.snapshot.memoryPeakMB,
      megabytes
    );
  }

  public setLatency(percentile: 50 | 95, latencyMs: number): void {
    if (percentile === 50) {
      this.snapshot.p50LatencyMs = latencyMs;
    } else {
      this.snapshot.p95LatencyMs = latencyMs;
    }
  }

  public trackBranchCoverage(
    canonPath: string,
    visited: number[],
    total: number
  ): void {
    if (!this.snapshot.branchCoverageOneOf) {
      this.snapshot.branchCoverageOneOf = {};
    }

    this.snapshot.branchCoverageOneOf[canonPath] = { visited, total };
  }

  public trackEnumUsage(canonPath: string, enumValue: string): void {
    if (!this.snapshot.enumUsage) {
      this.snapshot.enumUsage = {};
    }

    const pathUsage = (this.snapshot.enumUsage[canonPath] ??= {});
    pathUsage[enumValue] = (pathUsage[enumValue] ?? 0) + 1;
  }

  public snapshotMetrics(
    options: { verbosity?: MetricsVerbosity } = {}
  ): MetricsSnapshot {
    const mode = options.verbosity ?? this.verbosity;
    const basic: MetricsSnapshot = { ...this.snapshot };

    if (mode === 'runtime') {
      // Drop optional heavy payloads in runtime mode while keeping required counters.
      delete basic.branchCoverageOneOf;
      delete basic.enumUsage;
    }

    return basic;
  }

  private accumulateDuration(key: MetricsPhaseKey, durationMs: number): void {
    const safeDuration = Number.isFinite(durationMs)
      ? Math.max(0, durationMs)
      : 0;
    const durationView = getDurationView(this.snapshot);
    const previous = durationView[key] ?? 0;
    durationView[key] = previous + safeDuration;
  }
}

function isActiveTimerState(state: TimerState): state is ActiveTimerState {
  return typeof state.startedAt === 'number';
}

type DurationField = (typeof METRIC_PHASES)[MetricPhase];
type DurationView = Partial<Record<DurationField, number>>;

function getDurationView(snapshot: MetricsSnapshot): DurationView {
  return snapshot as unknown as DurationView;
}
