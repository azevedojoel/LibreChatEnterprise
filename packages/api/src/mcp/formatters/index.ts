import type { OutputFormatterConfig, OutputFormatterFn } from './types';
import { passthroughFormatter } from './passthrough';
import { jsonToLlmFormatter } from './json-to-llm';
import { jsonToToonFormatter } from './json-to-toon';

const BUILT_IN_FORMATTERS: Record<string, OutputFormatterFn> = {
  passthrough: passthroughFormatter,
  'json-to-llm': jsonToLlmFormatter,
  'json-to-toon': jsonToToonFormatter,
};

const formatterCache = new Map<string, OutputFormatterFn>();

/**
 * Resolves the output formatter from MCP server config.
 * @param config - outputFormatter from server options (optional)
 * @returns Formatter function; defaults to json-to-toon when not specified
 */
export function getFormatter(config?: OutputFormatterConfig): OutputFormatterFn | undefined {
  // Default to json-to-toon when not specified (TOON: token-efficient, LLM-friendly)
  const effectiveConfig = config ?? 'json-to-toon';

  if (typeof effectiveConfig === 'string') {
    const builtIn = BUILT_IN_FORMATTERS[effectiveConfig];
    if (builtIn) return builtIn;
    return undefined;
  }

  if (effectiveConfig.module) {
    let formatter = formatterCache.get(effectiveConfig.module);
    if (!formatter) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require(effectiveConfig.module);
        formatter = (mod.default ?? mod) as OutputFormatterFn;
        if (typeof formatter === 'function') {
          formatterCache.set(effectiveConfig.module, formatter);
        }
      } catch {
        return undefined;
      }
    }
    return formatter;
  }

  return undefined;
}

export type { OutputFormatterFn, OutputFormatterConfig } from './types';
export { passthroughFormatter } from './passthrough';
export { jsonToLlmFormatter } from './json-to-llm';
export { jsonToToonFormatter } from './json-to-toon';
