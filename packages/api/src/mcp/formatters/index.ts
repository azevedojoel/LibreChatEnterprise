import type { OutputFormatterConfig, OutputFormatterFn } from './types';
import { passthroughFormatter } from './passthrough';
import { jsonToLlmFormatter } from './json-to-llm';

const BUILT_IN_FORMATTERS: Record<string, OutputFormatterFn> = {
  passthrough: passthroughFormatter,
  'json-to-llm': jsonToLlmFormatter,
};

const formatterCache = new Map<string, OutputFormatterFn>();

/**
 * Resolves the output formatter from MCP server config.
 * @param config - outputFormatter from server options (optional)
 * @returns Formatter function, or undefined for no transformation
 */
export function getFormatter(config?: OutputFormatterConfig): OutputFormatterFn | undefined {
  if (!config) return undefined;

  if (typeof config === 'string') {
    const builtIn = BUILT_IN_FORMATTERS[config];
    if (builtIn) return builtIn;
    return undefined;
  }

  if (config.module) {
    let formatter = formatterCache.get(config.module);
    if (!formatter) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require(config.module);
        formatter = (mod.default ?? mod) as OutputFormatterFn;
        if (typeof formatter === 'function') {
          formatterCache.set(config.module, formatter);
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
