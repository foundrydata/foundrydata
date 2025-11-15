export type QfLiaComparisonOp = '<=' | '<' | '>=' | '>' | '=';

export interface QfLiaLinearTerm {
  coefficients: Record<string, number>;
  constant?: number;
}

export interface QfLiaConstraint {
  op: QfLiaComparisonOp;
  left: QfLiaLinearTerm;
  right: QfLiaLinearTerm;
}

export interface QfLiaProblem {
  kind: 'qf_lia';
  constraints: QfLiaConstraint[];
}

export type LocalSmtOutcome = 'sat' | 'unsat' | 'unknown';

export interface LocalSmtModel {
  [name: string]: number;
}

export interface LocalSmtResult {
  outcome: LocalSmtOutcome;
  model?: LocalSmtModel;
}

export interface LocalSmtBackend {
  solveQfLia(problem: QfLiaProblem): Promise<LocalSmtResult>;
}

export interface LocalSmtConfig {
  enableLocalSMT: boolean;
  solverTimeoutMs: number;
  backendFactory?: () => Promise<LocalSmtBackend>;
}

export interface LocalSmtSolveOptions {
  timeoutMs?: number;
  signal?: { aborted?: boolean } | null;
}

export type LocalSmtSolveOutcomeKind =
  | 'disabled'
  | 'unavailable'
  | 'ok'
  | 'timeout'
  | 'error';

export interface LocalSmtSolveOutcome {
  kind: LocalSmtSolveOutcomeKind;
  result?: LocalSmtResult;
  error?: unknown;
}

const TIMEOUT_SENTINEL: unique symbol = Symbol('local-smt-timeout');

export class LocalSmtSolver {
  private readonly enableLocalSMT: boolean;
  private readonly solverTimeoutMs: number;
  private readonly backendFactory?: () => Promise<LocalSmtBackend>;
  private backendPromise?: Promise<LocalSmtBackend>;

  constructor(config: LocalSmtConfig) {
    this.enableLocalSMT = config.enableLocalSMT;
    this.solverTimeoutMs = config.solverTimeoutMs;
    this.backendFactory = config.backendFactory;
  }

  get enabled(): boolean {
    return this.enableLocalSMT;
  }

  get timeoutMs(): number {
    return this.solverTimeoutMs;
  }

  private async loadBackend(): Promise<LocalSmtBackend | undefined> {
    if (!this.backendFactory) {
      return undefined;
    }
    if (!this.backendPromise) {
      this.backendPromise = this.backendFactory();
    }
    try {
      return await this.backendPromise;
    } catch {
      return undefined;
    }
  }

  async solveWithTimeout(
    problem: QfLiaProblem,
    options?: LocalSmtSolveOptions
  ): Promise<LocalSmtSolveOutcome> {
    if (!this.enableLocalSMT) {
      return { kind: 'disabled' };
    }

    const backend = await this.loadBackend();
    if (!backend) {
      return { kind: 'unavailable' };
    }

    const timeoutMs =
      typeof options?.timeoutMs === 'number' && options.timeoutMs > 0
        ? options.timeoutMs
        : this.solverTimeoutMs;
    const signal = options?.signal;

    if (signal?.aborted) {
      return { kind: 'timeout' };
    }

    const timeoutPromise: Promise<typeof TIMEOUT_SENTINEL> =
      timeoutMs > 0
        ? new Promise((resolve) => {
            const id = setTimeout(() => {
              clearTimeout(id);
              resolve(TIMEOUT_SENTINEL);
            }, timeoutMs);
          })
        : Promise.resolve(TIMEOUT_SENTINEL);

    try {
      const race = (await Promise.race([
        backend.solveQfLia(problem),
        timeoutPromise,
      ])) as LocalSmtResult | typeof TIMEOUT_SENTINEL;

      if (race === TIMEOUT_SENTINEL) {
        return { kind: 'timeout' };
      }

      return { kind: 'ok', result: race };
    } catch (error) {
      return { kind: 'error', error };
    }
  }
}

export type LocalSmtProbeOutcome = 'disabled' | 'unknown';

export function probeLocalSmtUsage(
  config: Pick<LocalSmtConfig, 'enableLocalSMT' | 'solverTimeoutMs'>
): LocalSmtProbeOutcome {
  return config.enableLocalSMT ? 'unknown' : 'disabled';
}
