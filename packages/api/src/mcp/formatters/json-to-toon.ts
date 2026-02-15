import { encode as toonEncode } from '@toon-format/toon';
import type { OutputFormatterFn } from './types';

/**
 * Converts JSON text to TOON (Token-Oriented Object Notation) for LLMs.
 * - JSON input: parse → toonEncode → return TOON string
 * - Error objects ({error: "..."}): extract plain error message
 * - Non-JSON (TOON, plain text): return as-is
 */
export const jsonToToonFormatter: OutputFormatterFn = (text) => {
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

    try {
      return toonEncode(parsed);
    } catch {
      return text;
    }
  } catch {
    return text;
  }
};
