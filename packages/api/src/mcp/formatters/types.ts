/**
 * Output formatter function type.
 * Transforms raw MCP tool output text before it is sent to the LLM.
 */
export type OutputFormatterFn = (
  text: string,
  ctx?: { serverName?: string; toolName?: string },
) => string;

/**
 * MCP output formatter config from server options.
 */
export type OutputFormatterConfig =
  | 'passthrough'
  | 'json-to-llm'
  | { module: string };
