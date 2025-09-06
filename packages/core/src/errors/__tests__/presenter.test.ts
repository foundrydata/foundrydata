import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { ErrorPresenter } from '../../errors/presenter';
import { ErrorCode } from '../../errors/codes';
import { SchemaError, ValidationError } from '../../types/errors';

describe('ErrorPresenter', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env.NO_COLOR = '';
    process.env.FORCE_COLOR = '';
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  test('formatForAPI maps error code to HTTP status', () => {
    const err = new SchemaError({
      message: 'Invalid schema node',
      errorCode: ErrorCode.INVALID_SCHEMA_STRUCTURE,
      context: { schemaPath: '#/properties/name' },
    });
    const presenter = new ErrorPresenter('prod', {});
    const api = presenter.formatForAPI(err);
    expect(api.status).toBe(400);
    expect(api.code).toBe(ErrorCode.INVALID_SCHEMA_STRUCTURE);
    expect(api.type).toBe('https://foundrydata.dev/errors/E010');
  });

  test('production redacts sensitive fields deeply', () => {
    const sensitive = {
      user: {
        password: 'secret123',
        profile: { apiKey: 'ABC', nested: [{ token: 'XYZ' }] },
      },
    };
    const err = new ValidationError({
      message: 'Validation failed',
      failures: [],
      errorCode: ErrorCode.COMPLIANCE_VALIDATION_FAILED,
      context: { value: sensitive },
    });
    const presenter = new ErrorPresenter('prod', {
      redactKeys: ['password', 'apiKey', 'token'],
    });
    const prod = presenter.formatForProduction(err);
    const str = JSON.stringify(prod);
    expect(str).not.toContain('secret123');
    expect(str).not.toContain('ABC');
    expect(str).not.toContain('XYZ');
    expect(str).toContain('[REDACTED]');
  });

  test('production omits stack and includes requestId in production view', () => {
    const err = new SchemaError({
      message: 'Prod check',
      context: { schemaPath: '#/' },
      errorCode: ErrorCode.INVALID_SCHEMA_STRUCTURE,
    });
    const presenter = new ErrorPresenter('prod', { requestId: 'req-123' });
    const prod = presenter.formatForProduction(err);
    expect((prod as any).stack).toBeUndefined();
    expect((prod as any).requestId).toBe('req-123');
  });

  test('API view includes instance when requestId provided', () => {
    const err = new SchemaError({
      message: 'API check',
      context: { schemaPath: '#/' },
      errorCode: ErrorCode.INVALID_SCHEMA_STRUCTURE,
    });
    const presenter = new ErrorPresenter('prod', { requestId: 'req-456' });
    const api = presenter.formatForAPI(err);
    expect(api.instance).toBe('req-456');
  });

  test('CLI view respects NO_COLOR and FORCE_COLOR', () => {
    const err = new SchemaError({
      message: 'Invalid',
      context: { schemaPath: '#/x' },
      errorCode: ErrorCode.INVALID_SCHEMA_STRUCTURE,
    });

    // NO_COLOR disables
    process.env.NO_COLOR = '1';
    let presenter = new ErrorPresenter('dev', { colors: true });
    let cli = presenter.formatForCLI(err);
    expect(cli.colors).toBe(false);

    // FORCE_COLOR enables
    process.env.NO_COLOR = '';
    process.env.FORCE_COLOR = '1';
    presenter = new ErrorPresenter('dev', { colors: false });
    cli = presenter.formatForCLI(err);
    expect(cli.colors).toBe(true);
  });

  test('CLI view provides location with preferred path then schemaPath', () => {
    const withPath = new ValidationError({
      message: 'Bad value',
      failures: [],
      errorCode: ErrorCode.COMPLIANCE_VALIDATION_FAILED,
      context: { path: '/users/0/name' },
    });
    const presenter = new ErrorPresenter('dev', {});
    const cli1 = presenter.formatForCLI(withPath);
    expect(cli1.location).toContain('/users/0/name');

    const withSchemaPath = new SchemaError({
      message: 'Bad schema',
      context: { schemaPath: '#/properties/name' },
      errorCode: ErrorCode.INVALID_SCHEMA_STRUCTURE,
    });
    const cli2 = presenter.formatForCLI(withSchemaPath);
    expect(cli2.location).toContain('#/properties/name');
  });
});
