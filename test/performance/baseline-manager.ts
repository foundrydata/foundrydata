/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */
/**
 * Baseline Manager for Performance Benchmarks
 *
 * Handles loading, saving, and comparing performance baselines
 * for regression detection and trend analysis.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Baseline file path */
const BASELINE_FILE = path.join(__dirname, 'baseline.json');

/** Benchmark result structure */
export interface BenchmarkResult {
  name: string;
  runs: number;
  warmups: number;
  measurements: number[];
  percentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
  memory?: {
    before: number;
    after: number;
    delta: number;
  };
  platform: string;
  nodeVersion: string;
  timestamp: string;
}

/** Baseline data structure */
export interface BaselineData {
  version: string;
  timestamp: string;
  platform: string;
  nodeVersion: string;
  benchmarks: Record<string, BenchmarkResult>;
}

/** Regression detection result */
export interface RegressionResult {
  hasRegression: boolean;
  regressionPercentage?: number;
  baselineValue?: number;
  currentValue?: number;
  metric?: 'p50' | 'p95' | 'p99' | 'memory';
}

/**
 * Performance baseline manager
 */
export class BaselineManager {
  private baseline: BaselineData | null = null;

  /**
   * Load baseline from file
   */
  async loadBaseline(): Promise<void> {
    try {
      const content = await fs.readFile(BASELINE_FILE, 'utf-8');
      this.baseline = JSON.parse(content);
      // eslint-disable-next-line no-console
      console.log(`📊 Loaded baseline from ${BASELINE_FILE}`);
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any).code === 'ENOENT') {
        // eslint-disable-next-line no-console
        console.log('📊 No baseline file found, will create new baseline');
      } else {
        console.error('Failed to load baseline:', error);
      }
    }
  }

  /**
   * Save current results as baseline
   */
  async saveBaseline(results: BenchmarkResult[]): Promise<void> {
    const baselineData: BaselineData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      platform: results[0]?.platform ?? process.platform,
      nodeVersion: results[0]?.nodeVersion ?? process.version,
      benchmarks: {},
    };

    for (const result of results) {
      baselineData.benchmarks[result.name] = result;
    }

    await fs.writeFile(BASELINE_FILE, JSON.stringify(baselineData, null, 2));
    // eslint-disable-next-line no-console
    console.log(`📊 Saved baseline to ${BASELINE_FILE}`);
    this.baseline = baselineData;
  }

  /**
   * Update specific benchmark in baseline
   */
  async updateBenchmark(result: BenchmarkResult): Promise<void> {
    if (!this.baseline) {
      await this.saveBaseline([result]);
      return;
    }

    this.baseline.benchmarks[result.name] = result;
    this.baseline.timestamp = new Date().toISOString();

    await fs.writeFile(BASELINE_FILE, JSON.stringify(this.baseline, null, 2));
  }

  /**
   * Check for regression against baseline
   */
  checkRegression(
    current: BenchmarkResult,
    threshold: number = 20
  ): RegressionResult {
    if (!this.baseline) {
      return { hasRegression: false };
    }

    const baselineResult = this.baseline.benchmarks[current.name];
    if (!baselineResult) {
      return { hasRegression: false };
    }

    // Check p95 regression (primary metric)
    const baselineP95 = baselineResult.percentiles.p95;
    const currentP95 = current.percentiles.p95;
    const regressionPercentage =
      ((currentP95 - baselineP95) / baselineP95) * 100;

    if (regressionPercentage > threshold) {
      return {
        hasRegression: true,
        regressionPercentage,
        baselineValue: baselineP95,
        currentValue: currentP95,
        metric: 'p95',
      };
    }

    // Check memory regression if available
    if (current.memory && baselineResult.memory) {
      const memoryRegression =
        ((current.memory.delta - baselineResult.memory.delta) /
          baselineResult.memory.delta) *
        100;

      if (memoryRegression > threshold) {
        return {
          hasRegression: true,
          regressionPercentage: memoryRegression,
          baselineValue: baselineResult.memory.delta,
          currentValue: current.memory.delta,
          metric: 'memory',
        };
      }
    }

    return { hasRegression: false };
  }

  /**
   * Get baseline for a specific benchmark
   */
  getBaseline(benchmarkName: string): BenchmarkResult | undefined {
    return this.baseline?.benchmarks[benchmarkName];
  }

  /**
   * Get all baselines
   */
  getAllBaselines(): BaselineData | null {
    return this.baseline;
  }

  /**
   * Compare two benchmark results
   */
  compareBenchmarks(
    baseline: BenchmarkResult,
    current: BenchmarkResult
  ): {
    p50: { diff: number; percentage: number };
    p95: { diff: number; percentage: number };
    p99: { diff: number; percentage: number };
    memory?: { diff: number; percentage: number };
  } {
    const p50Diff = current.percentiles.p50 - baseline.percentiles.p50;
    const p95Diff = current.percentiles.p95 - baseline.percentiles.p95;
    const p99Diff = current.percentiles.p99 - baseline.percentiles.p99;

    const result = {
      p50: {
        diff: p50Diff,
        percentage: (p50Diff / baseline.percentiles.p50) * 100,
      },
      p95: {
        diff: p95Diff,
        percentage: (p95Diff / baseline.percentiles.p95) * 100,
      },
      p99: {
        diff: p99Diff,
        percentage: (p99Diff / baseline.percentiles.p99) * 100,
      },
      memory: undefined as { diff: number; percentage: number } | undefined,
    };

    if (current.memory && baseline.memory) {
      const memDiff = current.memory.delta - baseline.memory.delta;
      result.memory = {
        diff: memDiff,
        percentage: (memDiff / baseline.memory.delta) * 100,
      };
    }

    return result;
  }

  /**
   * Generate performance report
   */
  generateReport(currentResults: BenchmarkResult[]): string {
    const lines: string[] = [];
    lines.push('═'.repeat(80));
    lines.push('PERFORMANCE BENCHMARK REPORT');
    lines.push('═'.repeat(80));
    lines.push('');

    for (const result of currentResults) {
      lines.push(`📊 ${result.name}`);
      lines.push('-'.repeat(40));
      lines.push(`  Runs: ${result.runs} (${result.warmups} warmups)`);
      lines.push(
        `  Platform: ${result.platform} | Node: ${result.nodeVersion}`
      );
      lines.push('  Percentiles:');
      lines.push(`    p50: ${result.percentiles.p50.toFixed(3)}ms`);
      lines.push(`    p95: ${result.percentiles.p95.toFixed(3)}ms`);
      lines.push(`    p99: ${result.percentiles.p99.toFixed(3)}ms`);

      if (result.memory) {
        lines.push('  Memory:');
        lines.push(`    Delta: ${result.memory.delta.toFixed(2)}MB`);
      }

      // Check regression
      const regression = this.checkRegression(result);
      if (regression.hasRegression) {
        lines.push(`  ⚠️  REGRESSION DETECTED!`);
        lines.push(`    Metric: ${regression.metric}`);
        lines.push(`    Baseline: ${regression.baselineValue?.toFixed(3)}`);
        lines.push(`    Current: ${regression.currentValue?.toFixed(3)}`);
        lines.push(
          `    Change: +${regression.regressionPercentage?.toFixed(1)}%`
        );
      } else if (this.baseline?.benchmarks[result.name]) {
        const baselineResult = this.baseline.benchmarks[result.name];
        if (baselineResult) {
          const comparison = this.compareBenchmarks(baselineResult, result);
          lines.push('  vs Baseline:');
          lines.push(
            `    p50: ${comparison.p50.percentage >= 0 ? '+' : ''}${comparison.p50.percentage.toFixed(1)}%`
          );
          lines.push(
            `    p95: ${comparison.p95.percentage >= 0 ? '+' : ''}${comparison.p95.percentage.toFixed(1)}%`
          );
          lines.push(
            `    p99: ${comparison.p99.percentage >= 0 ? '+' : ''}${comparison.p99.percentage.toFixed(1)}%`
          );
        }
      }

      lines.push('');
    }

    lines.push('═'.repeat(80));
    return lines.join('\n');
  }
}

export default BaselineManager;
