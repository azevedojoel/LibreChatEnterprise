/**
 * Registry of tool-specific transforms for token-optimized MCP responses.
 * Key format: "serverName:toolName" (e.g. "Google:tasks.listTasks")
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

export function getTransform(serverName: string, toolName: string): TransformFn | undefined {
  const exact = TRANSFORM_REGISTRY.get(`${serverName}:${toolName}`);
  if (exact) return exact;
  if (TOOL_ONLY_FALLBACKS.has(toolName)) {
    return TRANSFORM_REGISTRY.get(`::${toolName}`);
  }
  return undefined;
}
