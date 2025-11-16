import { describe, expect, it } from 'vitest';

import { runApiMocksExample } from '../../../../scripts/examples/api-mocks';
import { runContractTestsExample } from '../../../../scripts/examples/contract-tests';
import { runLlmOutputExample } from '../../../../scripts/examples/llm-output';

describe('Product examples — Node API', () => {
  it('API mocks example runs and produces AJV-valid items', async () => {
    const result = await runApiMocksExample();

    expect(result.items.length).toBeGreaterThan(0);
  });

  it('API mocks example is deterministic for fixed seed', async () => {
    const first = await runApiMocksExample();
    const second = await runApiMocksExample();

    expect(first.meta).toEqual(second.meta);
    expect(first.items).toEqual(second.items);
  });

  it('contract tests example runs and produces AJV-valid items', async () => {
    const result = await runContractTestsExample();

    expect(result.items.length).toBeGreaterThan(0);
  });

  it('contract tests example is deterministic for fixed seed', async () => {
    const first = await runContractTestsExample();
    const second = await runContractTestsExample();

    expect(first.meta).toEqual(second.meta);
    expect(first.items).toEqual(second.items);
  });

  it('LLM output example runs and produces AJV-valid items', async () => {
    const result = await runLlmOutputExample();

    expect(result.items.length).toBeGreaterThan(0);
  });

  it('LLM output example is deterministic for fixed seed', async () => {
    const first = await runLlmOutputExample();
    const second = await runLlmOutputExample();

    expect(first.meta).toEqual(second.meta);
    expect(first.items).toEqual(second.items);
  });
});
