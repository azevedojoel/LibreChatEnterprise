/**
 * Registry of tool-specific transforms for token-optimized MCP responses.
 * Key format: "serverName:toolName" (e.g. "Google:tasks_listTasks")
 * Also supports tool-name-only fallback for tools unique across servers.
 */

export type TransformFn = (parsed: unknown) => string;

const TRANSFORM_REGISTRY = new Map<string, TransformFn>();
/** Tools that can be matched by name only (unique across MCP servers) */
const TOOL_ONLY_FALLBACKS = new Set<string>();

export function registerTransform(serverName: string, toolName: string, transform: TransformFn): void {
  const key = `${serverName}:${toolName}`;
  TRANSFORM_REGISTRY.set(key, transform);
}

export function registerToolOnlyFallback(toolName: string, transform: TransformFn): void {
  TRANSFORM_REGISTRY.set(`::${toolName}`, transform);
  TOOL_ONLY_FALLBACKS.add(toolName);
}

/** Extract base tool name when toolName is "gmail_search_mcp_Google" etc. */
function getBaseToolName(toolName: string): string | null {
  const idx = toolName.indexOf('_mcp_');
  return idx >= 0 ? toolName.slice(0, idx) : null;
}

export function getTransform(serverName: string, toolName: string): TransformFn | undefined {
  const exact = TRANSFORM_REGISTRY.get(`${serverName}:${toolName}`);
  if (exact) return exact;
  if (TOOL_ONLY_FALLBACKS.has(toolName)) {
    return TRANSFORM_REGISTRY.get(`::${toolName}`);
  }
  const baseName = getBaseToolName(toolName);
  if (baseName && TOOL_ONLY_FALLBACKS.has(baseName)) {
    return TRANSFORM_REGISTRY.get(`::${baseName}`);
  }
  return undefined;
}
