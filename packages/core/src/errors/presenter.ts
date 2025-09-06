/**
 * ErrorPresenter - pure presentation layer for FoundryError instances
 * - No business logic; formats into environment-specific view objects
 */

import { getHttpStatus, type ErrorCode } from './codes';
import type {
  ErrorContext,
  FoundryError,
  SerializedError,
} from '../types/errors';

export interface PresenterOptions {
  colors?: boolean;
  terminalWidth?: number;
  locale?: string;
  redactKeys?: string[];
  requestId?: string;
}

export interface CLIErrorView {
  title: string;
  code: ErrorCode;
  location?: string;
  path?: string;
  schemaPath?: string;
  excerpt?: string;
  workaround?: string;
  documentation?: string;
  eta?: string;
  colors: boolean;
  terminalWidth: number;
}

export interface APIErrorView {
  status: number;
  type: string;
  title: string;
  detail: string;
  instance?: string;
  code: ErrorCode;
  path?: string;
  suggestions: string[];
}

export type ProductionView = SerializedError & { requestId?: string };

const DEFAULT_REDACT_KEYS = [
  'password',
  'apiKey',
  'secret',
  'token',
  'ssn',
  'creditCard',
];

export class ErrorPresenter {
  constructor(
    private readonly _env: 'dev' | 'prod',
    private readonly options: PresenterOptions = {}
  ) {}

  formatForCLI(error: FoundryError): CLIErrorView {
    const colors = this.#shouldUseColors(this.options.colors);
    const terminalWidth = this.#getTerminalWidth(this.options.terminalWidth);
    const location = this.#formatLocation(error.context);

    return {
      title: this.#formatTitle(error),
      code: error.errorCode,
      location,
      path: error.context?.path as string | undefined,
      schemaPath: error.context?.schemaPath as string | undefined,
      excerpt: (error.context?.valueExcerpt as string | undefined) ?? undefined,
      workaround: this.#formatWorkaround(error),
      documentation: this.#formatDocLink(error),
      eta: error.availableIn,
      colors,
      terminalWidth,
    };
  }

  formatForAPI(error: FoundryError): APIErrorView {
    return {
      status: getHttpStatus(error.errorCode),
      type: `https://foundrydata.dev/errors/${error.errorCode}`,
      title: error.message,
      detail: this.#getDetail(error),
      instance: this.#getRequestId(),
      code: error.errorCode,
      path: error.context?.path as string | undefined,
      suggestions: error.suggestions ?? [],
    };
  }

  formatForProduction(error: FoundryError): ProductionView {
    // Delegate to the error's safe serializer, then ensure any additional
    // keys configured in the presenter are also redacted.
    const base = error.toJSON('prod');
    const redacted = this.#applyAdditionalRedaction(base);
    return { ...redacted, requestId: this.#getRequestId() };
  }

  // Helpers
  #formatTitle(error: FoundryError): string {
    return `Error ${error.errorCode}: ${error.message}`;
  }

  #formatLocation(ctx?: ErrorContext): string | undefined {
    if (!ctx) return undefined;
    const loc =
      (ctx.path as string | undefined) ??
      (ctx.schemaPath as string | undefined);
    return loc ? `Location: ${loc}` : undefined;
  }

  #formatWorkaround(error: FoundryError): string | undefined {
    if (Array.isArray(error.suggestions) && error.suggestions.length > 0) {
      return error.suggestions[0] ?? undefined;
    }
    const suggestion =
      (error.context?.suggestion as string | undefined) ?? undefined;
    return suggestion;
  }

  #formatDocLink(error: FoundryError): string | undefined {
    return (
      error.documentation ?? `https://foundrydata.dev/errors/${error.errorCode}`
    );
  }

  #getDetail(error: FoundryError): string {
    // Keep details concise; in future could incorporate context excerpts
    const parts: string[] = [error.message];
    const loc =
      (error.context?.path as string | undefined) ??
      (error.context?.schemaPath as string | undefined);
    if (loc) parts.push(`at ${loc}`);
    return parts.join(' ');
  }

  #getRequestId(): string | undefined {
    return (
      this.options.requestId ||
      process.env.REQUEST_ID ||
      process.env.VITEST_WORKER_ID ||
      undefined
    );
  }

  #shouldUseColors(opt?: boolean): boolean {
    const noColor = process.env.NO_COLOR;
    const force = process.env.FORCE_COLOR;
    if (noColor && noColor !== '0' && noColor !== 'false') return false;
    if (force && force !== '0' && force !== 'false') return true;
    // Default to enabling colors in dev when not specified
    if (typeof opt === 'undefined') return this._env === 'dev';
    return !!opt;
  }

  #getTerminalWidth(opt?: number): number {
    return opt || process.stdout?.columns || 80;
  }

  #applyAdditionalRedaction(view: SerializedError): SerializedError {
    const keys = new Set(this.options.redactKeys ?? DEFAULT_REDACT_KEYS);
    const redactor = (val: unknown): unknown => {
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) return val.map(redactor);
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
          out[k] = keys.has(k) ? '[REDACTED]' : redactor(v);
        }
        return out;
      }
      return val;
    };
    if (view.context && 'value' in view.context) {
      const ctx = view.context as NonNullable<typeof view.context> & {
        value?: unknown;
      };
      // Clone shallowly to avoid mutation of original
      const cloned: SerializedError = {
        ...view,
        context: { ...ctx, value: redactor(ctx.value) } as ErrorContext,
      };
      return cloned;
    }
    return view;
  }
}

export default ErrorPresenter;
