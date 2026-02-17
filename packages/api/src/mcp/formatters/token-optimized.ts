import type { OutputFormatterFn } from './types';
import { jsonToToonFormatter } from './json-to-toon';
import { getTransform } from './transforms/registry';
import { registerTaskTransforms } from './transforms/tasks';
import { registerGmailTransforms } from './transforms/gmail';
import { registerOutlookTransforms } from './transforms/outlook';
import { registerCommonTransforms } from './transforms/common';

registerTaskTransforms();
registerGmailTransforms();
registerOutlookTransforms();
registerCommonTransforms();

/**
 * Pipeline formatter: applies tool-specific transforms when registered,
 * otherwise delegates to json-to-toon.
 */
export const tokenOptimizedFormatter: OutputFormatterFn = (text, ctx) => {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const key = ctx?.serverName && ctx?.toolName ? `${ctx.serverName}:${ctx.toolName}` : null;
  const transform = key ? getTransform(ctx!.serverName!, ctx!.toolName!) : undefined;

  if (transform) {
    try {
      const jsonStart = trimmed.startsWith('{') || trimmed.startsWith('[');
      if (!jsonStart) return jsonToToonFormatter(text);

      const parsed = JSON.parse(trimmed) as unknown;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        'error' in parsed &&
        Object.keys(parsed).length === 1
      ) {
        const err = (parsed as { error: unknown }).error;
        if (typeof err === 'string') return err;
      }

      return transform(parsed);
    } catch {
      /* fall through to base formatter */
    }
  }

  return jsonToToonFormatter(text);
};
