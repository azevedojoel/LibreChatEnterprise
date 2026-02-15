import type { OutputFormatterFn } from './types';

const MAX_ARRAY_ITEMS = 20;

function formatValue(value: unknown, indent: string): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '(empty)';
    }
    const truncated = value.length > MAX_ARRAY_ITEMS;
    const items = truncated ? value.slice(0, MAX_ARRAY_ITEMS) : value;
    const lines = items.map((item) => {
      if (
        item !== null &&
        typeof item === 'object' &&
        !Array.isArray(item) &&
        Object.keys(item).length > 0
      ) {
        return `  - ${formatObject(item as Record<string, unknown>, indent + '    ')
          .split('\n')
          .join('\n    ')}`;
      }
      return `  - ${formatValue(item, indent + '  ')}`;
    });
    if (truncated) {
      lines.push(`  ... and ${value.length - MAX_ARRAY_ITEMS} more`);
    }
    return '\n' + lines.join('\n');
  }
  if (typeof value === 'object') {
    return formatObject(value as Record<string, unknown>, indent);
  }
  return String(value);
}

function formatObject(obj: Record<string, unknown>, indent: string): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    const formatted = formatValue(value, indent + '  ');
    if (formatted.includes('\n')) {
      lines.push(`${key}:`);
      lines.push(formatted);
    } else {
      lines.push(`${key}: ${formatted}`);
    }
  }
  return lines.join('\n');
}

/**
 * Converts JSON text to human-readable format for LLMs.
 * - Objects: key-value with indentation
 * - Arrays: bullet points, truncated if long
 * - Error objects ({error: "..."}): plain error message
 * - Non-JSON: returns as-is
 */
export const jsonToLlmFormatter: OutputFormatterFn = (text) => {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const jsonStart = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (!jsonStart) return text;

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      'error' in parsed &&
      Object.keys(parsed).length === 1
    ) {
      const err = (parsed as { error: unknown }).error;
      if (typeof err === 'string') {
        return err;
      }
    }

    return formatValue(parsed, '').trimStart();
  } catch {
    return text;
  }
};
