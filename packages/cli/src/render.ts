import type { CLIErrorView } from '@foundrydata/core';

// Minimal ANSI helpers (no external deps)
const ANSI = {
  reset: '\u001B[0m',
  red: '\u001B[31m',
  bold: '\u001B[1m',
};

function colorize(text: string, useColor: boolean, color: string): string {
  if (!useColor) return text;
  return `${color}${text}${ANSI.reset}`;
}

function wrapText(text: string, width: number): string {
  if (!text) return '';
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + (line ? ' ' : '') + word).length > width) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

export function renderCLIView(view: CLIErrorView): string {
  const width = view.terminalWidth || 80;
  const lines: string[] = [];

  const title = `❌ ${view.title}`;
  lines.push(
    colorize(colorize(title, view.colors, ANSI.bold), view.colors, ANSI.red)
  );

  if (view.location) {
    lines.push(wrapText(`📍 ${view.location}`, width));
  }
  if (view.excerpt) {
    lines.push(wrapText(`Excerpt: ${view.excerpt}`, width));
  }
  if (view.workaround) {
    lines.push(wrapText(`💡 Workaround: ${view.workaround}`, width));
  }
  if (view.documentation) {
    // Do not wrap documentation URL to preserve copy/paste usability
    lines.push(`📖 More info: ${view.documentation}`);
  }
  if (view.eta) {
    lines.push(wrapText(`Available in: ${view.eta}`, width));
  }

  return lines.join('\n');
}

export function stripAnsi(input: string): string {
  // Simple ANSI escape code stripper
  const ansiRe =
    /[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]/g; // eslint-disable-line no-control-regex
  return input.replace(ansiRe, '');
}

export default renderCLIView;
