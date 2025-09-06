import { describe, it, expect } from 'vitest';
import { renderCLIView, stripAnsi } from './render';
import type { CLIErrorView } from '@foundrydata/core';
import { ErrorCode } from '@foundrydata/core';

describe('renderCLIView', () => {
  it('renders title and sections with wrapping', () => {
    const view: CLIErrorView = {
      title: 'Error E010: Invalid schema',
      code: ErrorCode.INVALID_SCHEMA_STRUCTURE,
      location: 'Location: #/properties/name',
      excerpt: '{ "name": 123 }',
      workaround: 'Use string type for name',
      documentation: 'https://foundrydata.dev/errors/E010',
      eta: undefined,
      colors: false,
      terminalWidth: 40,
    };

    const out = renderCLIView(view);
    const clean = stripAnsi(out);
    expect(clean).toContain('Error E010: Invalid schema');
    expect(clean).toContain('Location: #/properties/name');
    expect(clean).toContain('Workaround: Use string type for name');
    expect(clean).toContain('More info: https://foundrydata.dev/errors/E010');
  });

  it('applies ANSI colors when enabled', () => {
    const view: CLIErrorView = {
      title: 'Error E500: Internal error',
      code: ErrorCode.INTERNAL_ERROR,
      colors: true,
      terminalWidth: 80,
    } as CLIErrorView;
    const out = renderCLIView(view);
    // Verify presence of ANSI red sequence without regex to appease linter
    expect(
      out.includes('\u001B[31m') ||
        out.includes('\x1b[31m') ||
        out.includes('\u001b[31m')
    ).toBe(true);
  });

  it('wraps content based on terminalWidth and matches snapshot', () => {
    const view: CLIErrorView = {
      title: 'Error E010: Invalid schema',
      code: ErrorCode.INVALID_SCHEMA_STRUCTURE,
      location: 'Location: #/properties/name',
      excerpt: '{ "name": 123 }',
      workaround: 'Use string type for name',
      documentation: 'https://foundrydata.dev/errors/E010',
      colors: false,
      terminalWidth: 30,
    } as CLIErrorView;
    const out = renderCLIView(view);
    expect(stripAnsi(out)).toMatchInlineSnapshot(`
"❌ Error E010: Invalid schema
📍 Location: #/properties/name
Excerpt: { "name": 123 }
💡 Workaround: Use string type
for name
📖 More info: https://foundrydata.dev/errors/E010"
`);
  });
});
